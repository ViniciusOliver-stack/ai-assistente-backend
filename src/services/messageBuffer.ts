// src/services/messageBuffer.ts
interface BufferedMessage {
    text: string;
    timestamp: Date;
}

interface BufferState {
    messages: BufferedMessage[]
    lastMessageTime: Date;
    processingTimeout?: NodeJS.Timeout;
    checkTimeout?: NodeJS.Timeout;
}

interface MessageBuffer {
    [userInstanceKey: string]: BufferState;
}

export class MessageBufferService {
    private static instance: MessageBufferService;
    private messageBuffer: MessageBuffer = {}
    private readonly INITIAL_WAIT = 12000; 
    private readonly ADDITIONAL_WAIT = 5000;

    private constructor() { }

    static getInstance(): MessageBufferService {
        if(!MessageBufferService.instance) {
            MessageBufferService.instance = new MessageBufferService();
        }

        return MessageBufferService.instance;
    }

    // Create a key that combines userId and instanceName
    private createBufferKey(userId: string, instanceName: string): string {
        return `${userId}:${instanceName}`;
    }

    async addMessage(userId: string, text: string, instanceName: string): Promise<string | null> {
        const now = new Date();
        const bufferKey = this.createBufferKey(userId, instanceName);
        
        // Initialize buffer for this user and instance, if it doesn't exist
        if (!this.messageBuffer[bufferKey]) {
            this.messageBuffer[bufferKey] = {
                messages: [],
                lastMessageTime: now
            };
        }

        const bufferState = this.messageBuffer[bufferKey];

        // Reset the buffer if time was exceeded
        if (bufferState.processingTimeout) {
            clearTimeout(bufferState.processingTimeout);
        }

        if(bufferState.checkTimeout) {
            clearTimeout(bufferState.checkTimeout);
        }

        // Add message to buffer
        bufferState.messages.push({ text, timestamp: now });
        bufferState.lastMessageTime = now;

        console.log(`Message added to buffer for user ${userId} on instance ${instanceName}. Total messages: ${bufferState.messages.length}`);

        // Set new timeout for processing
        return new Promise((resolve) => {
            // Set initial timeout
            bufferState.processingTimeout = setTimeout(async () => {
                // Check if we received any new messages during the initial wait
                const timeSinceLastMessage = new Date().getTime() - bufferState.lastMessageTime.getTime();
                
                if (timeSinceLastMessage < this.INITIAL_WAIT) {
                    // If we received messages recently, wait additional time
                    bufferState.checkTimeout = setTimeout(() => {
                        const combinedMessage = this.processAndClearBuffer(userId, instanceName);
                        resolve(combinedMessage);
                    }, this.ADDITIONAL_WAIT);
                } else {
                    // If no recent messages, process immediately
                    const combinedMessage = this.processAndClearBuffer(userId, instanceName);
                    resolve(combinedMessage);
                }
            }, this.INITIAL_WAIT);
        });
    }

    private processAndClearBuffer(userId: string, instanceName: string): string {
        const bufferKey = this.createBufferKey(userId, instanceName);
        const bufferState = this.messageBuffer[bufferKey];
        
        if (!bufferState || bufferState.messages.length === 0) return '';

        // Sort messages by timestamp to ensure correct order
        const sortedMessages = [...bufferState.messages].sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        // Combine messages with timestamps for debugging
        const combinedMessage = sortedMessages
            .map(msg => msg.text)
            .join('\n');

        console.log(`[Buffer] Processing buffer for user ${userId} on instance ${instanceName}:`);
        console.log(`Total messages: ${sortedMessages.length}`);
        console.log(`Combined message: ${combinedMessage}`);

        // Clear the buffer
        this.clearBuffer(userId, instanceName);

        return combinedMessage;
    }

    clearBuffer(userId: string, instanceName: string) {
        const bufferKey = this.createBufferKey(userId, instanceName);
        const bufferState = this.messageBuffer[bufferKey];
        
        if (bufferState) {
            if (bufferState.processingTimeout) {
                clearTimeout(bufferState.processingTimeout);
            }
            if (bufferState.checkTimeout) {
                clearTimeout(bufferState.checkTimeout);
            }
        }
        
        delete this.messageBuffer[bufferKey];
        console.log(`[Buffer] Buffer cleared for user ${userId} on instance ${instanceName}`);
    }

    // Method for debugging/monitoring
    getBufferState(userId: string, instanceName: string): BufferState | null {
        const bufferKey = this.createBufferKey(userId, instanceName);
        return this.messageBuffer[bufferKey] || null;
    }
}