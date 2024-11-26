"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageController = void 0;
const database_1 = __importDefault(require("../config/database"));
class MessageController {
    constructor(socketService) {
        this.socketService = socketService;
    }
    async createMessage(req, res) {
        try {
            const { text, sender, recipientId } = req.body;
            const message = await database_1.default.message.create({
                data: {
                    text,
                    sender,
                    recipientId,
                    delivered: false,
                },
            });
            // Tenta enviar a mensagem via WebSocket
            this.socketService.emitMessage(recipientId, message);
            res.status(201).json(message);
        }
        catch (error) {
            console.error('Erro ao criar mensagem:', error);
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    async getUndeliveredMessages(req, res) {
        try {
            const { userId } = req.params;
            const messages = await database_1.default.message.findMany({
                where: {
                    recipientId: userId,
                    delivered: false,
                },
                orderBy: {
                    timestamp: 'asc',
                },
            });
            res.json(messages);
        }
        catch (error) {
            console.error('Erro ao buscar mensagens:', error);
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
}
exports.MessageController = MessageController;
