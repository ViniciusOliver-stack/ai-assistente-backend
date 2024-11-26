import { Router } from 'express';
import { MessageController } from '../controllers/messageController';
import { SocketService } from '../config/socket';

export function createMessageRouter(socketService: SocketService) {
  const router = Router();
  const messageController = new MessageController(socketService);

  router.post('/', (req, res) => messageController.createMessage(req, res));
  router.get('/undelivered/:userId', (req, res) => messageController.getUndeliveredMessages(req, res));

  return router;
}