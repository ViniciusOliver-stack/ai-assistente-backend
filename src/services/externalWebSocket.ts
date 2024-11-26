import { io as ioClient } from 'socket.io-client';
import { Server as SocketServer } from 'socket.io';
import { AIService } from './aiService';
import prisma from '../config/database';

export class ExternalWebSocketService {
    private externalSocket;
    private internalIo: SocketServer;
    private aiService: AIService;

    constructor(internalIo: SocketServer) {
        this.internalIo = internalIo;
        this.aiService = new AIService(internalIo);
        this.externalSocket = ioClient("https://symplus-evolution.3g77fw.easypanel.host/SymplusTalk", {
            transports: ['websocket']
        });

        this.setupExternalSocketListeners();
    }

    private setupExternalSocketListeners() {
        this.externalSocket.on('connect', () => {
            console.log('Conectado ao WebSocket externo');
        });

        this.externalSocket.on('messages.upsert', async (messageData) => {
            try {
                console.log('Mensagem recebida:', JSON.stringify(messageData, null, 2));

                const text = messageData.data.message.extendedTextMessage?.text || messageData.data.message.conversation;
                const remoteJid = messageData.data.key.remoteJid;
                const sender = remoteJid.split('@')[0];

                if (!text || !remoteJid) {
                    console.error('Dados da mensagem inválidos');
                    return;
                }

                // Salvar mensagem do usuário
                const savedMessage = await prisma.message.create({
                    data: {
                        text,
                        sender,
                        recipientId: 'DEFAULT_RECIPIENT',
                        delivered: false,
                    },
                });

                // Emitir mensagem do usuário para o frontend
                this.internalIo.emit('new_message', {
                    id: savedMessage.id,
                    text,
                    sender,
                    timestamp: savedMessage.timestamp,
                });

                // Processar e enviar resposta da IA
                await this.aiService.processAIResponse(text, sender);

            } catch (error) {
                console.error('Erro ao processar mensagem:', error);
            }
        });

        this.externalSocket.on('disconnect', () => {
            console.log('Desconectado do WebSocket externo');
        });
    }
}