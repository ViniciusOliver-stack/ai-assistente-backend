"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
const factory_1 = require("./ai/factory");
class AIService {
    constructor(io, instanceName) {
        this.provider = null;
        this.io = io;
        this.instanceName = instanceName;
    }
    async initializeAIProvider() {
        var _a;
        const instance = await database_1.default.whatsAppInstance.findUnique({
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
        if (!((_a = instance.agent.token) === null || _a === void 0 ? void 0 : _a.key)) {
            throw new Error(`No API key found for agent in instance ${this.instanceName}`);
        }
        // Verify the agent belongs to the correct team
        if (!instance.agent.team) {
            throw new Error(`Agent not properly associated with a team`);
        }
        this.provider = factory_1.AIProviderFactory.createProvider(instance.agent.provider, instance.agent.token.key, Object.assign(Object.assign({}, instance.agent), { teamId: instance.agent.team.id, temperature: instance.agent.temperature || 0.5, limitToken: instance.agent.limitToken || 1024, providerModel: instance.agent.providerModel, restrictionContent: instance.agent.restrictionContent, languageDetector: instance.agent.languageDetector }));
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
                    teamId: agentConfig.teamId,
                    instanceName: this.instanceName,
                }
            }
        });
    }
    async processAIResponse(message, userId) {
        try {
            const conversationStatusAI = await database_1.default.conversation.findFirst({
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
            console.log("Conversation AI Enabled: ", conversationStatusAI === null || conversationStatusAI === void 0 ? void 0 : conversationStatusAI.isAIEnabled);
            if (conversationStatusAI && !conversationStatusAI.isAIEnabled) {
                console.log("Não tem conversa ativa ou o AI está habilitado");
                return;
            }
            // Inicializa o provedor AI com a API key do banco
            const agentConfig = await this.initializeAIProvider();
            const teamWithOwner = await database_1.default.team.findUnique({
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
            console.log("AGENTE: ", agentConfig);
            if (!this.provider) {
                throw new Error('Failed to initialize AI provider');
            }
            // Configuração do prompt do sistema
            const systemPrompt = `${agentConfig.prompt} Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. Responda de forma objetiva e seguindo padrão de ortografia.`;
            const conversation = await this.getOrCreateConversation(userId, agentConfig);
            // Gerar resposta da IA usando o provedor inicializado
            const aiResponse = await this.provider.generateResponse(message, systemPrompt);
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
                    agentTitle: agentConfig.title,
                    metadata: savedMessage.metadata
                });
                return responseData;
            }
        }
        catch (error) {
            console.error('Erro ao processar resposta da IA:', error);
            throw error;
        }
    }
    async sendExternalMessage(text, userId) {
        console.log("Nome da  Instância:", this.instanceName);
        console.log("ID do Usuário:", userId);
        console.log("Texto da Mensagem:", text);
        try {
            const response = await fetch(`https://evolution.rubnik.com/message/sendText/${this.instanceName}`, {
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
            });
            console.log("RESPOSTA DA API:", response);
        }
        catch (error) {
            console.error('Erro ao enviar mensagem externa:', error);
            throw error;
        }
    }
}
exports.AIService = AIService;
