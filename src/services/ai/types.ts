export interface AIProvider {
    generateResponse(message: string, systemPrompt?: string): Promise<string>;
    transcribeAudio?(audioBase64: string, language?: string): Promise<string>;
}

export interface AudioTranscriptionOptions {
    language?: string;
    model?: string;
    responseFormat?: string;
    temperature?: number;
}