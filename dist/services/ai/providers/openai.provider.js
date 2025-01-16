"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const openai_1 = __importDefault(require("openai"));
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const uuid_1 = require("uuid");
class OpenAIProvider {
    constructor(apiKey, data) {
        this.client = new openai_1.default({ apiKey });
        this.data = data;
        console.log("Dados da IA OpenAI:", data);
    }
    async generateResponse(message, systemPrompt) {
        var _a, _b, _c, _d;
        const systemPromptMessage = systemPrompt;
        const response = await this.client.chat.completions.create({
            messages: [
                { role: "user", content: message },
                { role: "system", content: systemPromptMessage || "" }
            ],
            model: "gpt-4o-mini",
            temperature: this.data.temperature || 0.5,
            max_tokens: this.data.limitToken || 1024,
        });
        console.log("Resposta da IA OpenAI:", (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content);
        return ((_d = (_c = response.choices[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || "";
    }
    async base64ToTempFile(base64Data) {
        const base64Audio = base64Data.replace(/^data:audio\/\w+;base64,/, '');
        const tempDir = os_1.default.tmpdir();
        const fileName = `audio-${(0, uuid_1.v4)()}.ogg`;
        const filePath = path_1.default.join(tempDir, fileName);
        const audioBuffer = Buffer.from(base64Audio, 'base64');
        await (0, promises_1.writeFile)(filePath, audioBuffer);
        return filePath;
    }
    async transcribeAudio(audioBase64, language) {
        try {
            const audioFilePath = await this.base64ToTempFile(audioBase64);
            // console.log("Arquivo de áudio temporário:", audioFilePath);
            const audioFile = new File([await (0, promises_1.readFile)(audioFilePath)], 'audio.ogg', { type: 'audio/ogg' });
            // console.log("Arquivo de áudio criado:", audioFile);
            const response = await this.client.audio.transcriptions.create({
                file: audioFile,
                model: "whisper-1",
                language: language,
                response_format: "text"
            });
            // Limpar o arquivo temporário
            await (0, promises_1.unlink)(audioFilePath).catch(console.error);
            // console.log("Transcrição da IA OpenAI:", response);
            return response;
        }
        catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }
}
exports.OpenAIProvider = OpenAIProvider;