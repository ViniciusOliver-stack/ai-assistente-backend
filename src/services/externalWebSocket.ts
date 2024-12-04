import { io as ioClient } from 'socket.io-client';
import { Server as SocketServer } from 'socket.io';
import { AIService } from './aiService';
import prisma from '../config/database';
import { AudioTranscriptionService } from './transcriptionAudioGroq';

interface MessageData {
    text?: string;
    audioBase64?: string;
    sender: string;
    recipientId: string;
}

export class ExternalWebSocketService {
    private externalSocket;
    private internalIo: SocketServer;
    private aiService: AIService;
    private transcriptionService: AudioTranscriptionService;

    constructor(internalIo: SocketServer) {
        // if (!process.env.GROQ_API_KEY) {
        //     throw new Error('API KEY não está definida nas variáveis de ambiente');
        // }
        this.internalIo = internalIo;
        this.aiService = new AIService(internalIo);
        this.transcriptionService = new AudioTranscriptionService(process.env.GROQ_API_KEY || "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");
        this.externalSocket = ioClient("https://symplus-evolution.3g77fw.easypanel.host/SymplusTalk", {
            transports: ['websocket']
        });

        this.setupExternalSocketListeners();
    }

    private extractMessageContent(messageData: any): MessageData | null {
        try {
            const remoteJid = messageData.data.key.remoteJid;
            if(!remoteJid) return null      

            const sender = remoteJid.split('@')[0];
            const message = messageData.data.message;
            return {
                text: message?.extendedTextMessage?.text || message?.conversation || null,
                audioBase64: message?.base64 || null,
                sender,
                recipientId: 'DEFAULT_RECIPIENT'
            };
            
        } catch (error) {
            console.error('Erro ao extrair conteúdo da mensagem:', error);
            return null;
        }
    }

    private async processTranscriptionMessage(audioBase64: string): Promise<string> {
        try {
            const result = await this.transcriptionService.transcribeAudio(audioBase64 ?? '', 'pt') as { text: string };

            console.log('Transcrição concluída:', (result as { text: string }).text);

            return result.text;
        } catch (error) {
            console.error('Erro na transcrição do áudio:', error);
            throw error;
        }
    }

    private async saveMessage(messageData: MessageData, transcribedText?: string) {
        const messageText = messageData.text || transcribedText || '[Mensagem de áudio não transcrita]';

        return await prisma.message.create({
            data: {
                text: messageText,
                sender: messageData.sender,
                recipientId: messageData.recipientId,
                delivered: false,
                hasAudio: !!messageData.audioBase64,
                isTranscribed: !!transcribedText
            }
        })
    }

    private setupExternalSocketListeners() {
        this.externalSocket.on('connect', () => {
            console.log('Conectado ao WebSocket externo');
        });

        this.externalSocket.on('messages.upsert', async (messageData) => {
            try {
                console.log('Mensagem recebida:', JSON.stringify(messageData, null, 2));
                
                const extractedData = this.extractMessageContent(messageData);
                if(!extractedData) {
                    console.error('Erro ao extrair dados da mensagem');
                    return;
                }

                let transcribedText: string | undefined;
                if (extractedData.audioBase64 && !extractedData.text) {
                    try {
                        transcribedText = await this.processTranscriptionMessage(extractedData.audioBase64);
                    } catch (error) {
                        console.error('Erro na transcrição:', error);
                    }
                }

                const savedMessage = await this.saveMessage(extractedData, transcribedText);

                // Emitir mensagem para o frontend
                this.internalIo.emit('new_message', {
                    id: savedMessage.id,
                    text: savedMessage.text,
                    sender: savedMessage.sender,
                    timestamp: savedMessage.timestamp,
                    hasAudio: savedMessage.hasAudio,
                    isTranscribed: savedMessage.isTranscribed
                });

                // Processar e enviar resposta da IA
                await this.aiService.processAIResponse(
                    transcribedText || extractedData.text || '',
                    extractedData.sender
                );

            } catch (error) {
                console.error('Erro ao processar mensagem:', error);
            }
        });

        this.externalSocket.on('disconnect', () => {
            console.log('Desconectado do WebSocket externo');
        });
    }
}