import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { ExternalWebSocketService } from './services/externalWebSocket';
import { createMessageRouter } from './routes/messageRoutes';
import { WhatsAppInstanceManager } from './services/whatsAppInstanceService';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Configuração do Socket.IO interno
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://ai-assistente.vercel.app/',
    methods: ['GET', 'POST']
  },
    // Configurações para melhorar desempenho
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'], // WebSocket como preferencial
});

// Middleware
app.use(cors());
app.use(express.json());

// Inicialização do serviço de WebSocket externo
const externalWebSocket = new ExternalWebSocketService(io);
const instanceManager = new WhatsAppInstanceManager(io);

// Configuração das rotas da API
app.use('/api/messages', createMessageRouter(io as any));

// Gerenciamento de conexões WebSocket internas
io.on('connection', (socket) => {
  const { instanceId, teamId, agentId } = socket.handshake.query;
  
  socket.on('join_instance', (data) => {
    const room = `${data.instanceId}:${data.teamId}:${data.agentId}`;
    socket.join(room);
    console.log(`Client joined room: ${room}`);
  });

  socket.on('leave_instance', (data) => {
    const room = `${data.instanceId}:${data.teamId}:${data.agentId}`;
    socket.leave(room);
    console.log(`Client left room: ${room}`);
  });
});


// Example of adding a new instance
app.post('/instances', async (req, res) => {
  try {
      const { instanceName, serverUrl, teamId, agentId } = req.body;
      const newInstance = await instanceManager.addInstance({
          instanceName,
          serverUrl,
          teamId,
          agentId
      });
      res.json(newInstance);
  } catch (error) {
      res.status(500).json({ error: 'Failed to create instance' });
  }
});

// Example of getting active instances
app.get('/instances', (req, res) => {
  const instances = instanceManager.getActiveInstances();
  res.json(instances);
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