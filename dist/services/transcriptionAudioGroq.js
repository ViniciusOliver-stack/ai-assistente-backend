"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioTranscriptionService = void 0;
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const uuid_1 = require("uuid");
class AudioTranscriptionService {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async base64ToTempFile(base64Data) {
        // Remove o cabeçalho do base64 se existir
        const base64Audio = base64Data.replace(/^data:audio\/\w+;base64,/, '');
        // Cria um nome único para o arquivo temporário
        const tempDir = os_1.default.tmpdir();
        const fileName = `audio-${(0, uuid_1.v4)()}.ogg`;
        const filePath = path_1.default.join(tempDir, fileName);
        // Converte o base64 para buffer e salva como arquivo
        const audioBuffer = Buffer.from(base64Audio, 'base64');
        await (0, promises_1.writeFile)(filePath, audioBuffer);
        return filePath;
    }
    async transcribeAudio(audioBase64, language) {
        try {
            // Converte o base64 para arquivo temporário
            const audioFilePath = await this.base64ToTempFile(audioBase64);
            // Prepara o FormData para envio
            const formData = new FormData();
            // Lê o arquivo e adiciona ao FormData
            const audioBlob = new Blob([await (0, promises_1.readFile)(audioFilePath)], { type: 'audio/ogg' });
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
            await (0, promises_1.unlink)(audioFilePath).catch(console.error);
            return await response.json();
        }
        catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }
}
exports.AudioTranscriptionService = AudioTranscriptionService;
