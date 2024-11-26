import prisma from '../config/database';
import { Server as SocketServer } from 'socket.io';
import { AIService } from './aiService';

export class MessageService {

  private aiService: AIService;
  
  constructor(private io: SocketServer) {
    this.aiService = new AIService(io);
  }

  async processMessage(messageData: any) {
    try {
      const text = messageData.data.message.extendedTextMessage?.text;
      const remoteJid = messageData.data.key.remoteJid;
      const sender = remoteJid.split('@')[0];

      // Validação básica
      if (!text || !remoteJid) {
        throw new Error('Dados da mensagem inválidos');
      }

      // Salvar no banco de dados
      const message = await prisma.message.create({
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
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      throw error;
    }
  }

  async getUndeliveredMessages(userId: string) {
    return await prisma.message.findMany({
      where: {
        recipientId: userId,
        delivered: false,
      },
      orderBy: {
        timestamp: 'asc',
      },
    });
  }

  async markMessageAsDelivered(messageId: string) {
    return await prisma.message.update({
      where: { id: messageId },
      data: { delivered: true },
    });
  }
}