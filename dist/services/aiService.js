"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const events_1 = require("../types/events");
const eventEmitter_1 = require("./eventEmitter");
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
class AIService {
    constructor(io, instanceName) {
        this.groq = null;
        this.io = io;
        this.instanceName = instanceName;
    }
    async initializeGroqClient() {
        var _a, _b;
        const instance = await database_1.default.whatsAppInstance.findUnique({
            where: { instanceName: this.instanceName },
            include: {
                agent: {
                    include: {
                        token: true
                    }
                }
            }
        });
        if (!((_b = (_a = instance === null || instance === void 0 ? void 0 : instance.agent) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.key)) {
            throw new Error(`No API key found for instance ${this.instanceName}`);
        }
        this.groq = new groq_sdk_1.default({
            apiKey: instance.agent.token.key
        });
        return instance.agent;
    }
    async getAgentConfiguration() {
        const instance = await database_1.default.whatsAppInstance.findUnique({
            where: { instanceName: this.instanceName },
            include: {
                agent: {
                    include: {
                        token: true, // Include the API Key configuration
                        team: true // Include team information
                    }
                }
            }
        });
        if (!(instance === null || instance === void 0 ? void 0 : instance.agent)) {
            throw new Error(`No agent configuration found for instance ${this.instanceName}`);
        }
        return instance.agent;
    }
    async saveAIResponse(text, userId, conversationId, agentConfig) {
        return await database_1.default.message.create({
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
    async getOrCreateConversation(userId, agentConfig) {
        // Procurar por conversa ativa
        const activeConversation = await database_1.default.conversation.findFirst({
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
                        status: client_1.ConversationStatus.OPEN
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
        return await database_1.default.conversation.create({
            data: {
                status: client_1.ConversationStatus.OPEN,
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
    async processAIResponse(message, userId) {
        var _a, _b;
        try {
            // Inicializa o cliente Groq com a API key do banco
            const agentConfig = await this.initializeGroqClient();
            if (!this.groq) {
                throw new Error('Failed to initialize Groq client');
            }
            // Configuração do prompt do sistema
            const systemPrompt = agentConfig.prompt + "Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. Responda de forma objetiva e seguindo padrão de ortografia.";
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
            const aiResponse = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
            console.log('Resposta da IA:', aiResponse);
            if (aiResponse) {
                const savedMessage = await this.saveAIResponse(aiResponse, userId, conversation.id, agentConfig);
                const responseData = {
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
        }
        catch (error) {
            console.error('Erro ao processar resposta da IA:', error);
            const errorData = {
                error: 'Erro ao processar resposta da IA',
                userId,
                timestamp: new Date().toISOString(),
                instanceName: this.instanceName
            };
            eventEmitter_1.globalEventEmitter.emit(events_1.SocketEvents.ERROR, errorData);
            this.io.emit(events_1.SocketEvents.ERROR, errorData);
            throw error;
        }
    }
    async sendExternalMessage(text, userId) {
        try {
            await fetch(`https://symplus-evolution.3g77fw.easypanel.host/message/sendText/${this.instanceName}`, {
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
            });
        }
        catch (error) {
            console.error('Erro ao enviar mensagem externa:', error);
            throw error;
        }
    }
}
exports.AIService = AIService;
