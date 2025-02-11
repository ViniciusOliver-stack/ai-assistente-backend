import Groq from "groq-sdk";
import { Server as SocketServer } from "socket.io";
import { AIResponse, SocketEvents } from "../types/events";
import prisma from "../config/database";
import { ConversationStatus } from "@prisma/client";
import { AIProvider } from "./ai/types";
import { AIProviderFactory } from "./ai/factory";
import { OpenAIAssistantProvider } from "./ai/providers/openai-assistant.provider";
import { MessageBufferService } from "./messageBuffer";

export class AIService {
    private provider: AIProvider | null = null;
    private io: SocketServer;
    private instanceName: string;
    private assistantProvider: OpenAIAssistantProvider | null = null;

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
                languageDetector: instance.agent.languageDetector
            }
        );

        //Inicializar o assistantProvider
        if(instance.agent.provider === 'OPENAI') {
            this.assistantProvider = new OpenAIAssistantProvider(
                instance.agent.token.key,
                instance.agent
            )
        }

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

    async processAIResponse(message: string, userId: string, audioTranscription?: string) {
        const messageBuffer = MessageBufferService.getInstance();
        const bufferedMessage = await messageBuffer.addMessage(userId, message)

        if(!bufferedMessage) {
            return
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
                console.log("Não tem conversa ativa ou o AI está habilitado")
                return
            }

            // Inicializa o provedor AI com a API key do banco
            const agentConfig = await this.initializeAIProvider();
            const conversation = await this.getOrCreateConversation(userId, agentConfig);

          let aiResponse: string;

            if (this.assistantProvider) {
                // Verificar ou criar assistant para o time
                let assistant = await prisma.assistant.findFirst({
                    where: { teamId: agentConfig.teamId }
                });

            // Configuração do prompt do sistema
            const systemPrompt = `${agentConfig.prompt} Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. Responda de forma objetiva e seguindo padrão de ortografia.
            
            Se não tiver o nome do cliente, pergunte: "Qual o seu nome?" antes de prosseguir com qualquer outro diálogo.` 

            console.log("PROMPT: ", systemPrompt)
            console.log("AGENT CONFIG: ", agentConfig)

            if (!assistant) {
                assistant = await this.assistantProvider.createAssistant(
                    `${agentConfig.title} Assistant`,
                    systemPrompt || "Você é um assistente prestativo.",
                    agentConfig.teamId
                );
            } else if (assistant.instructions !== systemPrompt) {
                //Se o prompt foi alterado, atualizar o assistant
                assistant = await this.assistantProvider.updateAssistant(
                    assistant.assistantId,
                    systemPrompt
                )
            }

                // Obter ou criar thread
                const thread = await this.assistantProvider.getOrCreateThread(
                    userId,
                    conversation.id,
                    assistant.id
                );

                // Gerar resposta usando o assistant
                aiResponse = await this.assistantProvider.generateResponse(
                    message,
                    thread.threadId,
                    assistant.assistantId,
                    audioTranscription
                );
            } else {
                // Fallback para o provider padrão
                aiResponse = await this.provider!.generateResponse(message, agentConfig.prompt!);
            }


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

            if (!this.provider) {
                throw new Error('Failed to initialize AI provider');
            }

            // Gerar resposta da IA usando o provedor inicializado
            // const aiResponse = await this.provider.generateResponse(message, systemPrompt as string);

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