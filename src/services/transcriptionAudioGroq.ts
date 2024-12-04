import { readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export class AudioTranscriptionService {
    private apiKey: string;
    
    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async base64ToTempFile(base64Data: string): Promise<string> {
        // Remove o cabeçalho do base64 se existir
        const base64Audio = base64Data.replace(/^data:audio\/\w+;base64,/, '');
        
        // Cria um nome único para o arquivo temporário
        const tempDir = os.tmpdir();
        const fileName = `audio-${uuidv4()}.ogg`;
        const filePath = path.join(tempDir, fileName);

        // Converte o base64 para buffer e salva como arquivo
        const audioBuffer = Buffer.from(base64Audio, 'base64');
        await writeFile(filePath, audioBuffer);

        return filePath;
    }

    async transcribeAudio(audioBase64: string, language?: string) {
        try {
            // Converte o base64 para arquivo temporário
            const audioFilePath = await this.base64ToTempFile(audioBase64);

            // Prepara o FormData para envio
            const formData = new FormData();
            
            // Lê o arquivo e adiciona ao FormData
            const audioBlob = new Blob([await readFile(audioFilePath)], { type: 'audio/ogg' });
            formData.append('file', audioBlob, 'audio.ogg');
            
            // Adiciona os outros parâmetros necessários
            formData.append('model', 'whisper-large-v3');
            if (language) {
                formData.append('language', language);
            }
            formData.append('response_format', 'verbose_json');
            formData.append('temperature', '0');

            // Faz a requisição para a API da GROQ
            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`GROQ API error: ${JSON.stringify(errorData)}`);
            }

            // Remove o arquivo temporário após o uso
            await unlink(audioFilePath).catch(console.error);

            return await response.json();

        } catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }
}