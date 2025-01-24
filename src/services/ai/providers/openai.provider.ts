import OpenAI from "openai";
import { AIProvider } from "../types";
import { readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export class OpenAIProvider implements AIProvider {
    private client: OpenAI;
    private data: any;

    constructor(apiKey: string, data: any) {
        this.client = new OpenAI({ apiKey });
        this.data = data;

        console.log("Dados da IA OpenAI:", data);
    }

    async generateResponse(message: string, systemPrompt?: string): Promise<string> {
        const systemPromptMessage = systemPrompt;

        const response = await this.client.chat.completions.create({
            messages: [
                { role: "user", content: message },
                { role: "system", content: systemPromptMessage || "" }
            ],
            model: this.data.providerModel || "gpt-4o-mini",
            temperature: this.data.temperature || 0.5,
            max_tokens: this.data.limitToken || 1024,
        });

        console.log("Resposta da IA OpenAI:", response.choices[0]?.message?.content);

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

            // console.log("Arquivo de áudio temporário:", audioFilePath);

            const audioFile = new File(
                [await readFile(audioFilePath)],
                'audio.ogg',
                { type: 'audio/ogg' }
            )

            // console.log("Arquivo de áudio criado:", audioFile);
            
            const response = await this.client.audio.transcriptions.create({
                file: audioFile,
                model: "whisper-1",
                language: language,
                response_format: "text"
            });

            // Limpar o arquivo temporário
            await unlink(audioFilePath).catch(console.error);

            // console.log("Transcrição da IA OpenAI:", response);
            return response;
        } catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }

}