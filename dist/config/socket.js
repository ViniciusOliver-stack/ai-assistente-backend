"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketService = void 0;
const socket_io_1 = require("socket.io");
class SocketService {
    constructor(server) {
        this.io = new socket_io_1.Server(server, {
            cors: {
                origin: process.env.FRONTEND_URL || 'https://ai-assistente.vercel.app/',
                methods: ['GET', 'POST']
            }
        });
        this.setupSocketHandlers();
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Cliente conectado:', socket.id);
            socket.on('register', (userId) => {
                socket.join(userId);
                console.log(`Usuário ${userId} registrado`);
            });
            socket.on('disconnect', () => {
                console.log('Cliente desconectado:', socket.id);
            });
        });
    }
    emitMessage(recipientId, message) {
        this.io.to(recipientId).emit('messages.upsert', {
            data: {
                message: {
                    extendedTextMessage: { text: message.text }
                },
                key: {
                    remoteJid: message.sender
                }
            }
        });
    }
}
exports.SocketService = SocketService;
