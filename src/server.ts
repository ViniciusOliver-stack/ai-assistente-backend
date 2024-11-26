import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { ExternalWebSocketService } from './services/externalWebSocket';
import { createMessageRouter } from './routes/messageRoutes';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Configuração do Socket.IO interno
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://ai-assistente.vercel.app/',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Inicialização do serviço de WebSocket externo
const externalWebSocket = new ExternalWebSocketService(io);

// Configuração das rotas da API
app.use('/api/messages', createMessageRouter(io));

// Gerenciamento de conexões WebSocket internas
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.on('register', (userId: string) => {
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