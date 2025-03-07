import { io as ioClient } from 'socket.io-client';
import { Server as SocketServer } from 'socket.io';
import { AIService } from './aiService';
import prisma from '../config/database';
import { ConversationManager } from './conversationManager';
import { ConversationStatus } from '@prisma/client';
import { AIProvider } from './ai/types';
import { AIProviderFactory } from './ai/factory';
import { MessageBufferService } from './messageBuffer';

interface MessageData {
    text?: string;
    audioBase64?: string;
    sender: string;
    recipientId: string;
    instance?: string
}

// Interfaces para a resposta da API
interface Base64AudioResponse {
    base64: string;
    success: boolean;
    message?: string;
}

export class ExternalWebSocketService {
    private externalSocket;
    private internalIo: SocketServer;
    private aiService: AIService;
    // private transcriptionService: AudioTranscriptionService;
    private aiProvider: AIProvider | null = null;
    private messageBuffer: MessageBufferService;

    constructor(internalIo: SocketServer, instanceUrl?: string) {
        this.internalIo = internalIo;
        const defaultUrl = "https://evolution.rubnik.com/SymplusTalk";
        const finalUrl = instanceUrl || defaultUrl;
        const instanceName = finalUrl.split('/').pop() 

        this.aiService = new AIService(internalIo, instanceName!);
        this.messageBuffer = MessageBufferService.getInstance()

        this.externalSocket = ioClient(instanceUrl, {
            transports: ['websocket']
        });

        this.setupExternalSocketListeners();
    }

    // Add disconnect method
    disconnect() {
        if (this.externalSocket) {
            this.externalSocket.disconnect();
        }
    }

    private async fetchBase64Audio(messageId: string, instance: string): Promise<string | null> {
        try {
            const response = await fetch(
            `https://evolution.rubnik.com/chat/getBase64FromMediaMessage/${instance}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': 'qbTMAT9bS7VZAXB2WWIL7NW9gL3hY7fn'
                    },
                    body: JSON.stringify({
                        message: {
                            key: {
                                id: messageId
                            }
                        },
                        convertToMp4: false
                    })
                }
            );
    
            if (!response.ok) {
                throw new Error(`Failed to fetch base64 audio: ${response.statusText}`);
            }
    
            const data = await response.json() as  Base64AudioResponse;

            return data.base64;
            } catch (error) {
                console.error('Error fetching base64 audio:', error);
                return null;
            }
    }

    private async initializeTranscriptionProvider(instanceName: string) {
        try {
            const instance = await prisma.whatsAppInstance.findUnique({
                where: { instanceName },
                include: {
                    agent: {
                        include: {
                            token: true,
                            team: true
                        }
                    }
                }
            });

            if (!instance?.agent?.token?.key) {
                throw new Error(`No API key found for instance ${instanceName}`);
            }

            this.aiProvider = AIProviderFactory.createProvider(
                instance.agent.provider,
                instance.agent.token.key,
                {
                    ...instance.agent,
                    teamId: instance.agent.team?.id
                }
            );
        } catch (error) {
            console.error('Error initializing transcription provider:', error);
            throw error;
        }
    }

    private async extractMessageContent(messageData: any): Promise <MessageData | null> {
        try {
            const remoteJid = messageData.data.key.remoteJid;
            if(!remoteJid) return null      

            const sender = remoteJid.split('@')[0];
            const message = messageData.data.message;

            let audioBase64 = null;

            // Check if message contains audio
            if (message?.audioMessage) {
                // Try to get base64 from API if not directly available
                audioBase64 = message.base64 || await this.fetchBase64Audio(
                    messageData.data.key.id,
                    messageData.instance
                );
            }

            return {
                text: message?.extendedTextMessage?.text || message?.conversation || null,
                audioBase64,
                sender,
                recipientId: 'DEFAULT_RECIPIENT',
                instance: messageData.instance
            };
            
        } catch (error) {
            console.error('Erro ao extrair conteúdo da mensagem:', error);
            return null;
        }
    }

    private async processTranscriptionMessage(audioBase64: string, instanceName: string): Promise<string> {
        try {
            if (!this.aiProvider) {
                await this.initializeTranscriptionProvider(instanceName);
            }

            if (!this.aiProvider?.transcribeAudio) {
                throw new Error('Audio transcription not supported by this provider');
            }

            return await this.aiProvider.transcribeAudio(audioBase64, 'pt');
        } catch (error) {
            console.error('Erro na transcrição do áudio:', error);
            throw error;
        }
    }

    //Salva as informações no banco de dados
    private async saveMessage(messageData: MessageData, transcribedText?: string) {
        try {

            // Get instance information to retrieve teamId and agentTitle
            const instance = await prisma.whatsAppInstance.findUnique({
                where: { instanceName: messageData.instance! },
                include: {
                    agent: {
                        include: {
                            team: true
                        }
                    }
                }
            });

            if (!instance) {
                throw new Error(`WhatsApp instance ${messageData.instance} not found`);
            }

            // Procurar por conversa ativa
            const activeConversation = await prisma.conversation.findFirst({
                where: {
                    AND: [
                        {
                            participants: {
                                some: {
                                    participantId: messageData.sender
                                }
                            }
                        },
                        {
                            status: ConversationStatus.OPEN
                        }
                    ]
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
    
            let conversation;
            if (activeConversation) {
                conversation = activeConversation;
            } else {
                conversation = await ConversationManager.createOrReopenConversation(
                    messageData.sender,
                    messageData.recipientId,
                    messageData.instance!
                );
            }
    
            const messageText = messageData.text || transcribedText || '[Mensagem de áudio não transcrita]';
    
            return await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    text: messageText,
                    sender: messageData.sender,
                    recipientId: messageData.recipientId,
                    status: 'sent',
                    hasAudio: !!messageData.audioBase64,
                    isTranscribed: !!transcribedText,
                    messageType: messageData.audioBase64 ? 'audio' : 'text',
                    metadata: {
                        ...messageData.audioBase64 ? { hasAudioAttachment: true } : {},
                        ticketNumber: conversation.ticketNumber,
                        instance: messageData.instance,
                        teamId: instance.agent.team.id,
                        agentTitle: instance.agent.title,
                    }
                }
            });
        } catch (error) {
            console.error('Erro ao salvar mensagem:', error);
            throw error;
        }
    }

    private setupExternalSocketListeners() {
        this.externalSocket.on('connect', () => {
            console.log('Conectado ao WebSocket externo');
        });

        this.externalSocket.on('messages.upsert', async (messageData) => {
            let ephemeralMessage = ""

            if(messageData.data.message.ephemeralMessage) {
                ephemeralMessage = messageData.data.message.ephemeralMessage.message.extendedTextMessage.text
            }

            try {
                const extractedData = await this.extractMessageContent(messageData);
                if(!extractedData) {
                    console.error('Erro ao extrair dados da mensagem');
                    return;
                }

                const instanceName = extractedData.instance || '';
                if (!instanceName) {
                    console.error('Missing instance name in message data');
                    return;
                }

                let messageText = extractedData.text || ephemeralMessage || '';
                let finalMessageText = messageText;

                // Processar áudio se disponível
                let transcribedText: string | undefined;
                if (extractedData.audioBase64 && !extractedData.text) {
                    try {
                        transcribedText = await this.processTranscriptionMessage(extractedData.audioBase64, extractedData.instance!);
                        console.log('Texto transcrita:', transcribedText);
                        // Usar texto transcrito quando messageText estiver vazio
                        if (!messageText && transcribedText) {
                            finalMessageText = transcribedText;
                        }
                    } catch (error) {
                        console.error('Erro na transcrição:', error);
                    }
                }

                // Verificação explícita para garantir que não estamos enviando mensagem vazia
                if (!finalMessageText) {
                    console.warn('Ignorando mensagem vazia para o usuário:', extractedData.sender);
                    return;
                }

                // Adicionar mensagem ao buffer e obter mensagem combinada se o buffer estiver pronto
                const bufferedMessage = await this.messageBuffer.addMessage(
                    extractedData.sender,
                    finalMessageText,
                    instanceName
                );

                if (bufferedMessage) {
                    console.log('Processando mensagem combinada:', bufferedMessage);

                    const savedMessage = await this.saveMessage(
                        {...extractedData, text: bufferedMessage},
                        transcribedText
                    );

                    // Emit message to frontend
                    this.internalIo.emit('new_message', {
                        id: savedMessage.id,
                        text: savedMessage.text,
                        sender: savedMessage.sender,
                        timestamp: savedMessage.timestamp,
                        conversationId: savedMessage.conversationId,
                        hasAudio: savedMessage.hasAudio,
                        isTranscribed: savedMessage.isTranscribed,
                        metadata: savedMessage.metadata,
                    });

                    // Process with AI and handle the response
                    try {
                        const aiResponse = await this.aiService.processAIResponse(
                            bufferedMessage,
                            extractedData.sender,
                            instanceName
                        );
                        
                        if (aiResponse) {
                            console.log('Resposta da IA recebida:', aiResponse);
                            
                            // Additional logging for debugging
                            console.log('Enviando resposta para:', extractedData.sender);
                            console.log('Conteúdo da resposta:', aiResponse.text);
                        } else {
                            console.error('Resposta da IA está vazia');
                        }
                    } catch (error) {
                        console.error('Erro ao processar resposta da IA:', error);
                    }
                }

                // const savedMessage = await this.saveMessage(extractedData, transcribedText);

                // // Emitir mensagem para o frontend
                // this.internalIo.emit('new_message', {
                //     id: savedMessage.id,
                //     text: savedMessage.text,
                //     sender: savedMessage.sender,
                //     timestamp: savedMessage.timestamp,
                //     conversationId: savedMessage.conversationId,
                //     hasAudio: savedMessage.hasAudio,
                //     isTranscribed: savedMessage.isTranscribed,
                //     metadata: savedMessage.metadata,
                // });

                // // Processar e enviar resposta da IA
                // await this.aiService.processAIResponse(
                //     transcribedText || extractedData.text || '',
                //     extractedData.sender
                // );

            } catch (error) {
                console.error('Erro ao processar mensagem:', error);
            }
        });

        this.externalSocket.on('disconnect', () => {
            console.log('Desconectado do WebSocket externo');
        });
    }
}