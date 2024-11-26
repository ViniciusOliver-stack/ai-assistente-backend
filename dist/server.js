"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const externalWebSocket_1 = require("./services/externalWebSocket");
const messageRoutes_1 = require("./routes/messageRoutes");
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Configuração do Socket.IO interno
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'https://ai-assistente.vercel.app/',
        methods: ['GET', 'POST']
    }
});
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Inicialização do serviço de WebSocket externo
const externalWebSocket = new externalWebSocket_1.ExternalWebSocketService(io);
// Configuração das rotas da API
app.use('/api/messages', (0, messageRoutes_1.createMessageRouter)(io));
// Gerenciamento de conexões WebSocket internas
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    socket.on('register', (userId) => {
        socket.join(userId);
        console.log(`Usuário ${userId} registrado`);
    });
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});
// Inicialização do servidor
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
    console.error('Erro não tratado:', error);
});
