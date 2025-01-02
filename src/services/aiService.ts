import Groq from "groq-sdk";
import { Server as SocketServer } from "socket.io";
import { AIResponse, SocketEvents } from "../types/events";
import { globalEventEmitter } from "./eventEmitter";
import prisma from "../config/database";
import { ConversationStatus } from "@prisma/client";

export class AIService {
    private groq: Groq | null = null;
    private io: SocketServer;
    private instanceName: string;

    constructor(io: SocketServer, instanceName: string) {
        this.io = io;
        this.instanceName = instanceName;
    }

    private async initializeGroqClient() {
        const instance = await prisma.whatsAppInstance.findUnique({
            where: { instanceName: this.instanceName },
            include: {
                agent: {
                    include: {
                        token: true
                    }
                }
            }
        });

        if (!instance?.agent?.token?.key) {
            throw new Error(`No API key found for instance ${this.instanceName}`);
        }

        this.groq = new Groq({
            apiKey: instance.agent.token.key
        });

        return instance.agent;
    }

    private async getAgentConfiguration() {
        const instance = await prisma.whatsAppInstance.findUnique({
            where: { instanceName: this.instanceName },
            include: {
                agent: {
                    include: {
                        token: true, // Include the API Key configuration
                        team: true  // Include team information
                    }
                }
            }
        });

        if (!instance?.agent) {
            throw new Error(`No agent configuration found for instance ${this.instanceName}`);
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
                    teamId: agentConfig.teamId
                }
            }
        });
    }

    // private async validateUserInstance(userId: string): Promise<boolean> {
    //     console.log("VALIDANDO USUARIO: ", userId);
    //     console.log("INSTANCIA: ", this.instanceName);
    //     // Verificar se o usuário pertence a esta instância
    //     const conversation = await prisma.conversation.findFirst({
    //         where: {
    //             AND: [
    //                 {
    //                     participants: {
    //                         some: {
    //                             participantId: userId
    //                         }
    //                     }
    //                 },
    //                 {
    //                     instanceWhatsApp: this.instanceName
    //                 }
    //             ]
    //         }
    //     });

    //     console.log("CONVERSA: ", conversation);

    //     return !!conversation;
    // }

    async processAIResponse(message: string, userId: string) {
        try {
            // Inicializa o cliente Groq com a API key do banco
            const agentConfig = await this.initializeGroqClient();

            if (!this.groq) {
                throw new Error('Failed to initialize Groq client');
            }

            // Configuração do prompt do sistema
            const systemPrompt = agentConfig.prompt + "Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. Responda de forma objetiva e seguindo padrão de ortografia."
            
            const conversation = await this.getOrCreateConversation(userId, agentConfig);

            // Gerar resposta da IA
            const response = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: "user",
                        content: message
                    },
                    {
                        role: "system",
                        content: systemPrompt || ""
                    }
                ],
                model: agentConfig.providerModel || "llama-3.1-70b-versatile",
                temperature: agentConfig.temperature || 0.5,
                max_tokens: agentConfig.limitToken || 1024,
            });

            const aiResponse = response.choices[0]?.message?.content;
            console.log('Resposta da IA:', aiResponse)

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
                    agentTitle: agentConfig.title
                });

                return responseData;
            }
        } catch (error) {
            console.error('Erro ao processar resposta da IA:', error);
            const errorData = {
                error: 'Erro ao processar resposta da IA',
                userId,
                timestamp: new Date().toISOString(),
                instanceName: this.instanceName
            };
            globalEventEmitter.emit(SocketEvents.ERROR, errorData);
            this.io.emit(SocketEvents.ERROR, errorData);
            throw error;
        }
    }

    private async sendExternalMessage(text: string, userId: string) {
        try {
            await fetch(
                `https://symplus-evolution.3g77fw.easypanel.host/message/sendText/${this.instanceName}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
                    },
                    body: JSON.stringify({
                        number: userId,
                        options: {
                            delay: 1200,
                            presence: "composing",
                            linkPreview: true,
                        },
                        textMessage: {
                            text,
                        },
                    }),
                }
            );
        } catch (error) {
            console.error('Erro ao enviar mensagem externa:', error);
            throw error;
        }
    }
}