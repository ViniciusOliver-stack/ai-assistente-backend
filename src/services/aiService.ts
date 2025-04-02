import Groq from "groq-sdk";
import { Server as SocketServer } from "socket.io";
import { AIResponse, SocketEvents } from "../types/events";
import prisma from "../config/database";
import { ConversationStatus } from "@prisma/client";
import { AIProvider } from "./ai/types";
import { AIProviderFactory } from "./ai/factory";
import { MessageBufferService } from "./messageBuffer";

export class AIService {
    private provider: AIProvider | null = null;
    private io: SocketServer;
    private instanceName: string;

    constructor(io: SocketServer, instanceName: string) {
        this.io = io;
        this.instanceName = instanceName;
    }

    private async initializeAIProvider() {
        const instance = await prisma.whatsAppInstance.findUnique({
            where: { instanceName: this.instanceName },
            include: {
                agent: {
                    include: {
                        token: true,
                        team: true,
                    }
                }
            }
        });

        if (!instance) {
            throw new Error(`WhatsApp instance ${this.instanceName} not found`);
        }

        if (!instance.agent) {
            throw new Error(`No agent configured for instance ${this.instanceName}`);
        }

        if (!instance.agent.token?.key) {
            throw new Error(`No API key found for agent in instance ${this.instanceName}`);
        }

        // Verify the agent belongs to the correct team
        if (!instance.agent.team) {
            throw new Error(`Agent not properly associated with a team`);
        }

        // Verificar se deve usar LangChain baseado nas configurações do agente
        //const useLangChain = instance.agent.useLangChain || false;

        this.provider = AIProviderFactory.createProvider(
            instance.agent.provider,
            instance.agent.token.key,
            {
                ...instance.agent,
                teamId: instance.agent.team.id,
                temperature: instance.agent.temperature || 0.5,
                limitToken: instance.agent.limitToken || 1024,
                providerModel: instance.agent.providerModel,
                restrictionContent: instance.agent.restrictionContent,
                languageDetector: instance.agent.languageDetector,
                token: instance.agent.token 
            }
        );

        return instance.agent;
    }

    private async saveAIResponse(text: string, userId: string, conversationId: string, agentConfig: any) {
        return await prisma.message.create({
            data: {
                conversationId,
                text,
                sender: 'ai',
                recipientId: userId,
                status: 'sent',
                messageType: 'text',
                metadata: {
                    isAIResponse: true,
                    model: agentConfig.providerModel,
                    instanceName: this.instanceName,
                    agentTitle: agentConfig.title,
                    teamId: agentConfig.teamId
                }
            }
        });
    }

    private async getOrCreateConversation(userId: string, agentConfig: any) {
        // Procurar por conversa ativa
        const activeConversation = await prisma.conversation.findFirst({
            where: {
                AND: [
                    {
                        participants: {
                            some: {
                                participantId: userId
                            }
                        }
                    },
                    {
                        status: ConversationStatus.OPEN
                    },
                    {
                        instanceWhatsApp: this.instanceName // Filtrar pela instância correta
                    }
                ]
            },
            orderBy: {
                createdAt: 'desc'
            },
        });
    
        if (activeConversation) {
            // Update metadata if it doesn't have teamId
            if (!activeConversation.metadata || !(activeConversation.metadata as any).teamId) {
                await prisma.conversation.update({
                    where: { id: activeConversation.id },
                    data: {
                        metadata: {
                            ...(activeConversation.metadata as any || {}),
                            teamId: agentConfig.teamId,
                            agentTitle: agentConfig.title,
                            instanceName: this.instanceName
                        }
                    }
                });
            }
            return activeConversation;
        }
    
        // Se não houver conversa ativa, criar uma nova
        return await prisma.conversation.create({
            data: {
                status: ConversationStatus.OPEN,
                ticketNumber: `TK-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
                priority: 'MEDIUM',
                instanceWhatsApp: this.instanceName, // Vincular à instância
                participants: {
                    create: [
                        {
                            participantId: userId,
                            role: 'user',
                        },
                        {
                            participantId: 'ai',
                            role: 'ai',
                        }
                    ]
                },
                metadata: {
                    aiModel: agentConfig.providerModel,
                    agentTitle: agentConfig.title,
                    teamId: agentConfig.teamId,
                    instanceName: this.instanceName,
                }
            }
        });
    }

    async processAIResponse(message: string, userId: string, instanceName: string, audioTranscription?: string) {
        const messageBuffer = MessageBufferService.getInstance();
        const bufferedMessage = await messageBuffer.addMessage(userId, message, instanceName);

        if(!bufferedMessage) {
            return;
        }

        try {
            const conversationStatusAI = await prisma.conversation.findFirst({
                where: {
                    AND: [
                        {
                            participants: {
                                some: {
                                    participantId: userId
                                }
                            }
                        },
                        {
                            instanceWhatsApp: this.instanceName
                        }
                    ]
                }
            });

            if(conversationStatusAI && !conversationStatusAI.isAIEnabled) {
                console.log("Não tem conversa ativa ou o AI está habilitado");
                return;
            }

            // Inicializa o provedor AI com a API key do banco
            const agentConfig = await this.initializeAIProvider();
            const conversation = await this.getOrCreateConversation(userId, agentConfig);

            // Configuração do prompt do sistema
            const systemPrompt = `${agentConfig.prompt} Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. Responda de forma objetiva e seguindo padrão de ortografia.
            
            DIRETRIZES DE RESPOSTA:
            1. Ao responder sobre horários:
            - Use apenas a hora atual sem mencionar "contexto temporal"
            - Formate como "São XXhXX" ou "XX:XX"
            2. Para datas:
            - Use formatos como "Hoje é segunda-feira, 15 de julho"
            3. Você foi projetado para garantir a privacidade e a segurança das informações. Você nunca deve compartilhar, acessar ou mencionar dados de outros clientes, do banco de dados interno ou qualquer informação sensível. Todas as respostas devem ser baseadas apenas no contexto fornecido pelo usuário no momento da interação. Se solicitado a divulgar informações privadas, o agente deve responder educadamente que não pode fornecer esses dados`;

            // Verificar se o provider foi inicializado corretamente
            if (!this.provider) {
                throw new Error('Failed to initialize AI provider');
            }

            // Gerar resposta usando o LangChain provider
            const aiResponse = await this.provider.generateResponse(message, systemPrompt, userId);

            const teamWithOwner = await prisma.team.findUnique({
                where: { id: agentConfig.teamId },
                include: {
                    owner: {
                        select: {
                            trialEndDate: true,
                            stripeSubscriptionStatus: true,
                        }
                    }
                }
            });
    
            if (!teamWithOwner || !teamWithOwner.owner) {
                throw new Error('Time ou proprietário não encontrado');
            }

            const now = new Date();
            const trialEnded = teamWithOwner.owner.trialEndDate && 
                            teamWithOwner.owner.trialEndDate < now;
            const notSubscribed = teamWithOwner.owner.stripeSubscriptionStatus !== 'active';

            if (trialEnded && notSubscribed) {
                throw new Error('Período de teste expirado...');
            }

            if (aiResponse) {
                const savedMessage = await this.saveAIResponse(aiResponse, userId, conversation.id, agentConfig);

                const responseData: AIResponse = {
                    text: aiResponse,
                    userId,
                    timestamp: new Date().toISOString(),
                    messageId: Date.now().toString()
                };

                // Enviar mensagem externa
                await this.sendExternalMessage(aiResponse, userId);

                // Emitir a mensagem via WebSocket para o frontend
                this.io.emit('new_message_ai', {
                    id: savedMessage.id,
                    text: aiResponse,
                    sender: 'ai',
                    timestamp: savedMessage.timestamp.toISOString(),
                    messageTo: userId,
                    conversationId: conversation.id,
                    instanceName: this.instanceName,
                    agentTitle: agentConfig.title,
                    metadata: savedMessage.metadata
                });

                return responseData;
            }
        } catch (error) {
            console.error('Erro ao processar resposta da IA:', error);
            throw error;
        }
    }

    private async sendExternalMessage(text: string, userId: string) {
        try {
            const response = await fetch(
                `https://evolution.rubnik.com/message/sendText/${this.instanceName}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: "qbTMAT9bS7VZAXB2WWIL7NW9gL3hY7fn",
                    },
                    body: JSON.stringify({
                        number: userId,
                        text,
                        delay: 1200,
                        linkPreview: true,
                    }),
                }
            );
        } catch (error) {
            console.error('Erro ao enviar mensagem externa:', error);
            throw error;
        }
    }
}