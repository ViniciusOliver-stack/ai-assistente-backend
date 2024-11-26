import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { Message } from '../types/message';

export class SocketService {
  private io: Server;

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'https://ai-assistente.vercel.app/',
        methods: ['GET', 'POST']
      }
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Cliente conectado:', socket.id);

      socket.on('register', (userId: string) => {
        socket.join(userId);
        console.log(`Usuário ${userId} registrado`);
      });

      socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
      });
    });
  }

  public emitMessage(recipientId: string, message: Message) {
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