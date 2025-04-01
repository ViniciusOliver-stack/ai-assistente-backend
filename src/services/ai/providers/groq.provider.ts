import Groq from "groq-sdk";
import { AIProvider } from "../types";
import { readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export class GroqProvider implements AIProvider {
    private client: Groq;
    private data: any;

    constructor(apiKey: string, data: any) {
        this.client = new Groq({ apiKey });
        this.data = data;
    }

    //Não precisa fazer uso mais desse genertate
    async generateResponse(message: string, systemPrompt?: string): Promise<string> {
        const response = await this.client.chat.completions.create({
            messages: [
                { role: "user", content: message },
                { role: "system", content: systemPrompt || "" }
            ],
            model: this.data.providerModel || "llama-3.1-70b-versatile",
            temperature: this.data.temperature || 0.5,
            max_tokens: this.data.limitToken || 1024,
        });

        return response.choices[0]?.message?.content || "";
    }

    private async base64ToTempFile(base64Data: string): Promise<string> {
        const base64Audio = base64Data.replace(/^data:audio\/\w+;base64,/, '');
        const tempDir = os.tmpdir();
        const fileName = `audio-${uuidv4()}.ogg`;
        const filePath = path.join(tempDir, fileName);
        const audioBuffer = Buffer.from(base64Audio, 'base64');
        await writeFile(filePath, audioBuffer);
        return filePath;
    }

    async transcribeAudio(audioBase64: string, language?: string): Promise<string> {
        try {
            const audioFilePath = await this.base64ToTempFile(audioBase64);
            const formData = new FormData();
            
            const audioBlob = new Blob([await readFile(audioFilePath)], { type: 'audio/ogg' });
            formData.append('file', audioBlob, 'audio.ogg');
            formData.append('model', 'whisper-large-v3');
            if (language) {
                formData.append('language', language);
            }
            formData.append('response_format', 'verbose_json');
            formData.append('temperature', '0');

            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.client.apiKey}`,
                },
                body: formData
            });

            await unlink(audioFilePath).catch(console.error);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`GROQ API error: ${JSON.stringify(errorData)}`);
            }

            const result = await response.json() as { text: string };
            return result.text;
        } catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }
}