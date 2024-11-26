"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageService = void 0;
const database_1 = __importDefault(require("../config/database"));
const aiService_1 = require("./aiService");
class MessageService {
    constructor(io) {
        this.io = io;
        this.aiService = new aiService_1.AIService(io);
    }
    async processMessage(messageData) {
        var _a;
        try {
            const text = (_a = messageData.data.message.extendedTextMessage) === null || _a === void 0 ? void 0 : _a.text;
            const remoteJid = messageData.data.key.remoteJid;
            const sender = remoteJid.split('@')[0];
            // Validação básica
            if (!text || !remoteJid) {
                throw new Error('Dados da mensagem inválidos');
            }
            // Salvar no banco de dados
            const message = await database_1.default.message.create({
                data: {
                    text,
                    sender,
                    recipientId: 'DEFAULT_RECIPIENT', // Ajuste conforme necessário
                    delivered: false,
                },
            });
            // Notificar clientes
            this.io.emit('new_message', {
                id: message.id,
                text: message.text,
                sender: message.sender,
                timestamp: message.timestamp,
            });
            await this.aiService.processAIResponse(text, sender);
            return message;
        }
        catch (error) {
            console.error('Erro ao processar mensagem:', error);
            throw error;
        }
    }
    async getUndeliveredMessages(userId) {
        return await database_1.default.message.findMany({
            where: {
                recipientId: userId,
                delivered: false,
            },
            orderBy: {
                timestamp: 'asc',
            },
        });
    }
    async markMessageAsDelivered(messageId) {
        return await database_1.default.message.update({
            where: { id: messageId },
            data: { delivered: true },
        });
    }
}
exports.MessageService = MessageService;
