"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
const factory_1 = require("./ai/factory");
const openai_assistant_provider_1 = require("./ai/providers/openai-assistant.provider");
const messageBuffer_1 = require("./messageBuffer");
class AIService {
    constructor(io, instanceName) {
        this.provider = null;
        this.assistantProvider = null;
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
        //Inicializar o assistantProvider
        if (instance.agent.provider === 'OPENAI') {
            this.assistantProvider = new openai_assistant_provider_1.OpenAIAssistantProvider(instance.agent.token.key, instance.agent);
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
                    teamId: agentConfig.teamId
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
            // Update metadata if it doesn't have teamId
            if (!activeConversation.metadata || !activeConversation.metadata.teamId) {
                await database_1.default.conversation.update({
                    where: { id: activeConversation.id },
                    data: {
                        metadata: Object.assign(Object.assign({}, (activeConversation.metadata || {})), { teamId: agentConfig.teamId, agentTitle: agentConfig.title, instanceName: this.instanceName })
                    }
                });
            }
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
    async processAIResponse(message, userId, audioTranscription) {
        const messageBuffer = messageBuffer_1.MessageBufferService.getInstance();
        const bufferedMessage = await messageBuffer.addMessage(userId, message);
        if (!bufferedMessage) {
            return;
        }
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
            if (conversationStatusAI && !conversationStatusAI.isAIEnabled) {
                console.log("Não tem conversa ativa ou o AI está habilitado");
                return;
            }
            // Inicializa o provedor AI com a API key do banco
            const agentConfig = await this.initializeAIProvider();
            const conversation = await this.getOrCreateConversation(userId, agentConfig);
            let aiResponse;
            if (this.assistantProvider) {
                // Verificar ou criar assistant para o time
                let assistant = await database_1.default.assistant.findFirst({
                    where: { teamId: agentConfig.teamId }
                });
                // Configuração do prompt do sistema
                const systemPrompt = `${agentConfig.prompt} Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. Responda de forma objetiva e seguindo padrão de ortografia.
            
            DIRETRIZES DE RESPOSTA:
            1. Ao responder sobre horários:
            - Use apenas a hora atual sem mencionar "contexto temporal"
            - Formate como "São XXhXX" ou "XX:XX"
            2. Para datas:
            - Use formatos como "Hoje é segunda-feira, 15 de julho"
            3. Você foi projetado para garantir a privacidade e a segurança das informações. Você nunca deve compartilhar, acessar ou mencionar dados de outros clientes, do banco de dados interno ou qualquer informação sensível. Todas as respostas devem ser baseadas apenas no contexto fornecido pelo usuário no momento da interação. Se solicitado a divulgar informações privadas, o agente deve responder educadamente que não pode fornecer esses dados
            `;
                console.log("PROMPT: ", systemPrompt);
                console.log("AGENT CONFIG: ", agentConfig);
                if (!assistant) {
                    assistant = await this.assistantProvider.createAssistant(`${agentConfig.title} Assistant`, systemPrompt || "Você é um assistente prestativo.", agentConfig.teamId);
                }
                else if (assistant.instructions !== systemPrompt) {
                    //Se o prompt foi alterado, atualizar o assistant
                    assistant = await this.assistantProvider.updateAssistant(assistant.assistantId, systemPrompt);
                }
                // Obter ou criar thread
                const thread = await this.assistantProvider.getOrCreateThread(userId, conversation.id, assistant.id);
                // Gerar resposta usando o assistant
                aiResponse = await this.assistantProvider.generateResponse(message, thread.threadId, assistant.assistantId, audioTranscription);
            }
            else {
                // Fallback para o provider padrão
                aiResponse = await this.provider.generateResponse(message, agentConfig.prompt);
            }
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
            if (!this.provider) {
                throw new Error('Failed to initialize AI provider');
            }
            // Gerar resposta da IA usando o provedor inicializado
            // const aiResponse = await this.provider.generateResponse(message, systemPrompt as string);
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
        }
        catch (error) {
            console.error('Erro ao enviar mensagem externa:', error);
            throw error;
        }
    }
}
exports.AIService = AIService;
