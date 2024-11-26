"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalWebSocketService = void 0;
const socket_io_client_1 = require("socket.io-client");
const aiService_1 = require("./aiService");
const database_1 = __importDefault(require("../config/database"));
class ExternalWebSocketService {
    constructor(internalIo) {
        this.internalIo = internalIo;
        this.aiService = new aiService_1.AIService(internalIo);
        this.externalSocket = (0, socket_io_client_1.io)("https://symplus-evolution.3g77fw.easypanel.host/SymplusTalk", {
            transports: ['websocket']
        });
        this.setupExternalSocketListeners();
    }
    setupExternalSocketListeners() {
        this.externalSocket.on('connect', () => {
            console.log('Conectado ao WebSocket externo');
        });
        this.externalSocket.on('messages.upsert', async (messageData) => {
            var _a;
            try {
                console.log('Mensagem recebida:', JSON.stringify(messageData, null, 2));
                const text = ((_a = messageData.data.message.extendedTextMessage) === null || _a === void 0 ? void 0 : _a.text) || messageData.data.message.conversation;
                const remoteJid = messageData.data.key.remoteJid;
                const sender = remoteJid.split('@')[0];
                if (!text || !remoteJid) {
                    console.error('Dados da mensagem inválidos');
                    return;
                }
                // Salvar mensagem do usuário
                const savedMessage = await database_1.default.message.create({
                    data: {
                        text,
                        sender,
                        recipientId: 'DEFAULT_RECIPIENT',
                        delivered: false,
                    },
                });
                // Emitir mensagem do usuário para o frontend
                this.internalIo.emit('new_message', {
                    id: savedMessage.id,
                    text,
                    sender,
                    timestamp: savedMessage.timestamp,
                });
                // Processar e enviar resposta da IA
                await this.aiService.processAIResponse(text, sender);
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
