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
    }
    async generateResponse(message, systemPrompt) {
        var _a, _b;
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
        return ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || "";
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
            const audioFile = new File([await (0, promises_1.readFile)(audioFilePath)], 'audio.ogg', { type: 'audio/ogg' });
            const response = await this.client.audio.transcriptions.create({
                file: audioFile,
                model: "whisper-1",
                language: language,
                response_format: "json"
            });
            // Limpar o arquivo temporário
            await (0, promises_1.unlink)(audioFilePath).catch(console.error);
            console.log(response.text);
            return response.text;
        }
        catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }
}
exports.OpenAIProvider = OpenAIProvider;
