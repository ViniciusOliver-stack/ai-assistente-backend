"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalWebSocketService = void 0;
const socket_io_client_1 = require("socket.io-client");
const aiService_1 = require("./aiService");
const database_1 = __importDefault(require("../config/database"));
const transcriptionAudioGroq_1 = require("./transcriptionAudioGroq");
class ExternalWebSocketService {
    constructor(internalIo) {
        // if (!process.env.GROQ_API_KEY) {
        //     throw new Error('API KEY não está definida nas variáveis de ambiente');
        // }
        this.internalIo = internalIo;
        this.aiService = new aiService_1.AIService(internalIo);
        this.transcriptionService = new transcriptionAudioGroq_1.AudioTranscriptionService(process.env.GROQ_API_KEY || "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");
        this.externalSocket = (0, socket_io_client_1.io)("https://symplus-evolution.3g77fw.easypanel.host/SymplusTalk", {
            transports: ['websocket']
        });
        this.setupExternalSocketListeners();
    }
    extractMessageContent(messageData) {
        var _a;
        try {
            const remoteJid = messageData.data.key.remoteJid;
            if (!remoteJid)
                return null;
            const sender = remoteJid.split('@')[0];
            const message = messageData.data.message;
            return {
                text: ((_a = message === null || message === void 0 ? void 0 : message.extendedTextMessage) === null || _a === void 0 ? void 0 : _a.text) || (message === null || message === void 0 ? void 0 : message.conversation) || null,
                audioBase64: (message === null || message === void 0 ? void 0 : message.base64) || null,
                sender,
                recipientId: 'DEFAULT_RECIPIENT'
            };
        }
        catch (error) {
            console.error('Erro ao extrair conteúdo da mensagem:', error);
            return null;
        }
    }
    async processTranscriptionMessage(audioBase64) {
        try {
            const result = await this.transcriptionService.transcribeAudio(audioBase64 !== null && audioBase64 !== void 0 ? audioBase64 : '', 'pt');
            console.log('Transcrição concluída:', result.text);
            return result.text;
        }
        catch (error) {
            console.error('Erro na transcrição do áudio:', error);
            throw error;
        }
    }
    async saveMessage(messageData, transcribedText) {
        const messageText = messageData.text || transcribedText || '[Mensagem de áudio não transcrita]';
        return await database_1.default.message.create({
            data: {
                text: messageText,
                sender: messageData.sender,
                recipientId: messageData.recipientId,
                delivered: false,
                hasAudio: !!messageData.audioBase64,
                isTranscribed: !!transcribedText
            }
        });
    }
    setupExternalSocketListeners() {
        this.externalSocket.on('connect', () => {
            console.log('Conectado ao WebSocket externo');
        });
        this.externalSocket.on('messages.upsert', async (messageData) => {
            try {
                console.log('Mensagem recebida:', JSON.stringify(messageData, null, 2));
                const extractedData = this.extractMessageContent(messageData);
                if (!extractedData) {
                    console.error('Erro ao extrair dados da mensagem');
                    return;
                }
                let transcribedText;
                if (extractedData.audioBase64 && !extractedData.text) {
                    try {
                        transcribedText = await this.processTranscriptionMessage(extractedData.audioBase64);
                    }
                    catch (error) {
                        console.error('Erro na transcrição:', error);
                    }
                }
                const savedMessage = await this.saveMessage(extractedData, transcribedText);
                // Emitir mensagem para o frontend
                this.internalIo.emit('new_message', {
                    id: savedMessage.id,
                    text: savedMessage.text,
                    sender: savedMessage.sender,
                    timestamp: savedMessage.timestamp,
                    hasAudio: savedMessage.hasAudio,
                    isTranscribed: savedMessage.isTranscribed
                });
                // Processar e enviar resposta da IA
                await this.aiService.processAIResponse(transcribedText || extractedData.text || '', extractedData.sender);
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
