"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBufferService = void 0;
class MessageBufferService {
    constructor() {
        this.messageBuffer = {};
        this.INITIAL_WAIT = 12000;
        this.ADDITIONAL_WAIT = 5000;
    }
    static getInstance() {
        if (!MessageBufferService.instance) {
            MessageBufferService.instance = new MessageBufferService();
        }
        return MessageBufferService.instance;
    }
    async addMessage(userId, text) {
        const now = new Date();
        //Inicializar o buffer para esse usuário, caso ele não exista
        if (!this.messageBuffer[userId]) {
            this.messageBuffer[userId] = {
                messages: [],
                lastMessageTime: now
            };
        }
        const bufferState = this.messageBuffer[userId];
        // Resetar o Buffer o tempo foi excedido
        if (bufferState.processingTimeout) {
            clearTimeout(bufferState.processingTimeout);
        }
        if (bufferState.checkTimeout) {
            clearTimeout(bufferState.checkTimeout);
        }
        // Adicionar a mensagem ao buffer
        bufferState.messages.push({ text, timestamp: now });
        bufferState.lastMessageTime = now;
        console.log(`Mensagem adicionada ao buffer do usuário ${userId}. Total de mensagens: ${bufferState.messages.length}`);
        // Set new timeout for processing
        return new Promise((resolve) => {
            // Set initial timeout
            bufferState.processingTimeout = setTimeout(async () => {
                // Check if we received any new messages during the initial wait
                const timeSinceLastMessage = new Date().getTime() - bufferState.lastMessageTime.getTime();
                if (timeSinceLastMessage < this.INITIAL_WAIT) {
                    // If we received messages recently, wait additional time
                    bufferState.checkTimeout = setTimeout(() => {
                        const combinedMessage = this.processAndClearBuffer(userId);
                        resolve(combinedMessage);
                    }, this.ADDITIONAL_WAIT);
                }
                else {
                    // If no recent messages, process immediately
                    const combinedMessage = this.processAndClearBuffer(userId);
                    resolve(combinedMessage);
                }
            }, this.INITIAL_WAIT);
        });
    }
    processAndClearBuffer(userId) {
        const bufferState = this.messageBuffer[userId];
        if (!bufferState || bufferState.messages.length === 0)
            return '';
        // Sort messages by timestamp to ensure correct order
        const sortedMessages = [...bufferState.messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        // Combine messages with timestamps for debugging
        const combinedMessage = sortedMessages
            .map(msg => msg.text)
            .join('\n');
        console.log(`[Buffer] Processando buffer para usuário ${userId}:`);
        console.log(`Total mensagens: ${sortedMessages.length}`);
        console.log(`Mensagem combinada: ${combinedMessage}`);
        // Clear the buffer
        this.clearBuffer(userId);
        return combinedMessage;
    }
    clearBuffer(userId) {
        const bufferState = this.messageBuffer[userId];
        if (bufferState) {
            if (bufferState.processingTimeout) {
                clearTimeout(bufferState.processingTimeout);
            }
            if (bufferState.checkTimeout) {
                clearTimeout(bufferState.checkTimeout);
            }
        }
        delete this.messageBuffer[userId];
        console.log(`[Buffer] Buffer limpo para usuário ${userId}`);
    }
    // Método para debug/monitoramento
    getBufferState(userId) {
        return this.messageBuffer[userId] || null;
    }
}
exports.MessageBufferService = MessageBufferService;
