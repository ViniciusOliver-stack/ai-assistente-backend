export interface Message {
    id: string;
    text: string;
    sender: string;
    recipientId: string;
    timestamp: Date;
    delivered: boolean;
  }
  
  export interface CreateMessageDTO {
    text: string;
    sender: string;
    recipientId: string;
  }