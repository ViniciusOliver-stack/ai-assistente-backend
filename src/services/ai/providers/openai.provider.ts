import OpenAI from "openai";
import { AIProvider } from "../types";
import { readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs'

export class OpenAIProvider implements AIProvider {
    private client: OpenAI;
    private data: any;

    constructor(apiKey: string, data: any) {
        this.client = new OpenAI({ apiKey });
        this.data = data;
    }

    async generateResponse(message: string, systemPrompt?: string): Promise<string> {
        const systemPromptMessage = systemPrompt;

        const response = await this.client.chat.completions.create({
            messages: [
                { role: "system", content: systemPromptMessage || "" },
                { role: "user", content: message },
            ],
            model: this.data.providerModel || "gpt-4o-mini",
            temperature: this.data.temperature || 0.5,
            max_tokens: this.data.limitToken || 1024,
        });

        console.log("Response from OpenAI:", response);

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

            // const audioFile = new File(
            //     [await readFile(audioFilePath)],
            //     'audio.ogg',
            //     { type: 'audio/ogg' }
            // )

            const response = await this.client.audio.transcriptions.create({
                file: fs.createReadStream(audioFilePath),
                model: "whisper-1",
                language: language,
                response_format: "json"
            });

            // Limpar o arquivo temporário
            await unlink(audioFilePath).catch(console.error);

            console.log(response.text)

            return response.text;
        } catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }

}