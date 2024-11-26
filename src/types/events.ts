export interface AIResponse {
    text: string;
    userId: string;
    timestamp: string;
    messageId: string;
  }
  
  export enum SocketEvents {
    AI_RESPONSE = 'ai_response',
    USER_MESSAGE = 'user_message',
    ERROR = 'error'
  }