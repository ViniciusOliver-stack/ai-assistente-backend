"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalWebSocketService = void 0;
const socket_io_client_1 = require("socket.io-client");
const aiService_1 = require("./aiService");
const database_1 = __importDefault(require("../config/database"));
const conversationManager_1 = require("./conversationManager");
const client_1 = require("@prisma/client");
const factory_1 = require("./ai/factory");
const messageBuffer_1 = require("./messageBuffer");
class ExternalWebSocketService {
    constructor(internalIo, instanceUrl) {
        // private transcriptionService: AudioTranscriptionService;
        this.aiProvider = null;
        this.internalIo = internalIo;
        const defaultUrl = "https://evolution.rubnik.com/SymplusTalk";
        const finalUrl = instanceUrl || defaultUrl;
        const instanceName = finalUrl.split('/').pop();
        this.aiService = new aiService_1.AIService(internalIo, instanceName);
        this.messageBuffer = messageBuffer_1.MessageBufferService.getInstance();
        this.externalSocket = (0, socket_io_client_1.io)(instanceUrl, {
            transports: ['websocket']
        });
        this.setupExternalSocketListeners();
    }
    // Add disconnect method
    disconnect() {
        if (this.externalSocket) {
            this.externalSocket.disconnect();
        }
    }
    async fetchBase64Audio(messageId, instance) {
        try {
            const response = await fetch(`https://evolution.rubnik.com/chat/getBase64FromMediaMessage/${instance}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': 'qbTMAT9bS7VZAXB2WWIL7NW9gL3hY7fn'
                },
                body: JSON.stringify({
                    message: {
                        key: {
                            id: messageId
                        }
                    },
                    convertToMp4: false
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch base64 audio: ${response.statusText}`);
            }
            const data = await response.json();
            return data.base64;
        }
        catch (error) {
            console.error('Error fetching base64 audio:', error);
            return null;
        }
    }
    async initializeTranscriptionProvider(instanceName) {
        var _a, _b, _c;
        try {
            const instance = await database_1.default.whatsAppInstance.findUnique({
                where: { instanceName },
                include: {
                    agent: {
                        include: {
                            token: true,
                            team: true
                        }
                    }
                }
            });
            if (!((_b = (_a = instance === null || instance === void 0 ? void 0 : instance.agent) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.key)) {
                throw new Error(`No API key found for instance ${instanceName}`);
            }
            this.aiProvider = factory_1.AIProviderFactory.createProvider(instance.agent.provider, instance.agent.token.key, Object.assign(Object.assign({}, instance.agent), { teamId: (_c = instance.agent.team) === null || _c === void 0 ? void 0 : _c.id }));
        }
        catch (error) {
            console.error('Error initializing transcription provider:', error);
            throw error;
        }
    }
    async extractMessageContent(messageData) {
        var _a;
        try {
            const remoteJid = messageData.data.key.remoteJid;
            if (!remoteJid)
                return null;
            const sender = remoteJid.split('@')[0];
            const message = messageData.data.message;
            let audioBase64 = null;
            // Check if message contains audio
            if (message === null || message === void 0 ? void 0 : message.audioMessage) {
                // Try to get base64 from API if not directly available
                audioBase64 = message.base64 || await this.fetchBase64Audio(messageData.data.key.id, messageData.instance);
            }
            return {
                text: ((_a = message === null || message === void 0 ? void 0 : message.extendedTextMessage) === null || _a === void 0 ? void 0 : _a.text) || (message === null || message === void 0 ? void 0 : message.conversation) || null,
                audioBase64,
                sender,
                recipientId: 'DEFAULT_RECIPIENT',
                instance: messageData.instance
            };
        }
        catch (error) {
            console.error('Erro ao extrair conteúdo da mensagem:', error);
            return null;
        }
    }
    async processTranscriptionMessage(audioBase64, instanceName) {
        var _a;
        try {
            if (!this.aiProvider) {
                await this.initializeTranscriptionProvider(instanceName);
            }
            if (!((_a = this.aiProvider) === null || _a === void 0 ? void 0 : _a.transcribeAudio)) {
                throw new Error('Audio transcription not supported by this provider');
            }
            return await this.aiProvider.transcribeAudio(audioBase64, 'pt');
        }
        catch (error) {
            console.error('Erro na transcrição do áudio:', error);
            throw error;
        }
    }
    //Salva as informações no banco de dados
    async saveMessage(messageData, transcribedText) {
        try {
            // Get instance information to retrieve teamId and agentTitle
            const instance = await database_1.default.whatsAppInstance.findUnique({
                where: { instanceName: messageData.instance },
                include: {
                    agent: {
                        include: {
                            team: true
                        }
                    }
                }
            });
            if (!instance) {
                throw new Error(`WhatsApp instance ${messageData.instance} not found`);
            }
            // Procurar por conversa ativa
            const activeConversation = await database_1.default.conversation.findFirst({
                where: {
                    AND: [
                        {
                            participants: {
                                some: {
                                    participantId: messageData.sender
                                }
                            }
                        },
                        {
                            status: client_1.ConversationStatus.OPEN
                        }
                    ]
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
            let conversation;
            if (activeConversation) {
                conversation = activeConversation;
            }
            else {
                conversation = await conversationManager_1.ConversationManager.createOrReopenConversation(messageData.sender, messageData.recipientId, messageData.instance);
            }
            const messageText = messageData.text || transcribedText || '[Mensagem de áudio não transcrita]';
            return await database_1.default.message.create({
                data: {
                    conversationId: conversation.id,
                    text: messageText,
                    sender: messageData.sender,
                    recipientId: messageData.recipientId,
                    status: 'sent',
                    hasAudio: !!messageData.audioBase64,
                    isTranscribed: !!transcribedText,
                    messageType: messageData.audioBase64 ? 'audio' : 'text',
                    metadata: Object.assign(Object.assign({}, messageData.audioBase64 ? { hasAudioAttachment: true } : {}), { ticketNumber: conversation.ticketNumber, instance: messageData.instance, teamId: instance.agent.team.id, agentTitle: instance.agent.title })
                }
            });
        }
        catch (error) {
            console.error('Erro ao salvar mensagem:', error);
            throw error;
        }
    }
    setupExternalSocketListeners() {
        this.externalSocket.on('connect', () => {
            console.log('Conectado ao WebSocket externo');
        });
        this.externalSocket.on('messages.upsert', async (messageData) => {
            let ephemeralMessage = "";
            if (messageData.data.message.ephemeralMessage) {
                ephemeralMessage = messageData.data.message.ephemeralMessage.message.extendedTextMessage.text;
            }
            try {
                const extractedData = await this.extractMessageContent(messageData);
                if (!extractedData) {
                    console.error('Erro ao extrair dados da mensagem');
                    return;
                }
                let messageText = extractedData.text || ephemeralMessage || '';
                let finalMessageText = messageText;
                // Processar áudio se disponível
                let transcribedText;
                if (extractedData.audioBase64 && !extractedData.text) {
                    try {
                        transcribedText = await this.processTranscriptionMessage(extractedData.audioBase64, extractedData.instance);
                        console.log('Texto transcrita:', transcribedText);
                        // Usar texto transcrito quando messageText estiver vazio
                        if (!messageText && transcribedText) {
                            finalMessageText = transcribedText;
                        }
                    }
                    catch (error) {
                        console.error('Erro na transcrição:', error);
                    }
                }
                // Verificação explícita para garantir que não estamos enviando mensagem vazia
                if (!finalMessageText) {
                    console.warn('Ignorando mensagem vazia para o usuário:', extractedData.sender);
                    return;
                }
                // Adicionar mensagem ao buffer e obter mensagem combinada se o buffer estiver pronto
                const bufferedMessage = await this.messageBuffer.addMessage(extractedData.sender, finalMessageText);
                if (bufferedMessage) {
                    console.log('Processando mensagem combinada:', bufferedMessage);
                    const savedMessage = await this.saveMessage(Object.assign(Object.assign({}, extractedData), { text: bufferedMessage }), transcribedText);
                    // Emit message to frontend
                    this.internalIo.emit('new_message', {
                        id: savedMessage.id,
                        text: savedMessage.text,
                        sender: savedMessage.sender,
                        timestamp: savedMessage.timestamp,
                        conversationId: savedMessage.conversationId,
                        hasAudio: savedMessage.hasAudio,
                        isTranscribed: savedMessage.isTranscribed,
                        metadata: savedMessage.metadata,
                    });
                    // Process with AI and handle the response
                    try {
                        const aiResponse = await this.aiService.processAIResponse(bufferedMessage, extractedData.sender);
                        if (aiResponse) {
                            console.log('Resposta da IA recebida:', aiResponse);
                            // Additional logging for debugging
                            console.log('Enviando resposta para:', extractedData.sender);
                            console.log('Conteúdo da resposta:', aiResponse.text);
                        }
                        else {
                            console.error('Resposta da IA está vazia');
                        }
                    }
                    catch (error) {
                        console.error('Erro ao processar resposta da IA:', error);
                    }
                }
                // const savedMessage = await this.saveMessage(extractedData, transcribedText);
                // // Emitir mensagem para o frontend
                // this.internalIo.emit('new_message', {
                //     id: savedMessage.id,
                //     text: savedMessage.text,
                //     sender: savedMessage.sender,
                //     timestamp: savedMessage.timestamp,
                //     conversationId: savedMessage.conversationId,
                //     hasAudio: savedMessage.hasAudio,
                //     isTranscribed: savedMessage.isTranscribed,
                //     metadata: savedMessage.metadata,
                // });
                // // Processar e enviar resposta da IA
                // await this.aiService.processAIResponse(
                //     transcribedText || extractedData.text || '',
                //     extractedData.sender
                // );
            }
            catch (error) {
                console.error('Erro ao processar mensagem:', error);
            }
        });
        this.externalSocket.on('disconnect', () => {
            console.log('Desconectado do WebSocket externo');
        });
    }
}
exports.ExternalWebSocketService = ExternalWebSocketService;
