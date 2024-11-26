import { Request, Response } from 'express';
import { CreateMessageDTO } from '../types/message';
import { SocketService } from '../config/socket';
import prisma from '../config/database';

export class MessageController {
  constructor(private socketService: SocketService) {}

  public async createMessage(req: Request, res: Response) {
    try {
      const { text, sender, recipientId }: CreateMessageDTO = req.body;

      const message = await prisma.message.create({
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
    } catch (error) {
      console.error('Erro ao criar mensagem:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  public async getUndeliveredMessages(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      const messages = await prisma.message.findMany({
        where: {
          recipientId: userId,
          delivered: false,
        },
        orderBy: {
          timestamp: 'asc',
        },
      });

      res.json(messages);
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}