"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const uuid_1 = require("uuid");
class GroqProvider {
    constructor(apiKey, data) {
        this.client = new groq_sdk_1.default({ apiKey });
        this.data = data;
    }
    async generateResponse(message, systemPrompt) {
        var _a, _b, _c, _d;
        const systemPromptMessage = systemPrompt + "Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. Responda de forma objetiva e seguindo padrão de ortografia.";
        const response = await this.client.chat.completions.create({
            messages: [
                { role: "user", content: message },
                { role: "system", content: systemPromptMessage || "" }
            ],
            model: this.data.providerModel || "llama-3.1-70b-versatile",
            temperature: this.data.temperature || 0.5,
            max_tokens: this.data.limitToken || 1024,
        });
        console.log("Resposta da IA GROQ:", (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content);
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
            const formData = new FormData();
            const audioBlob = new Blob([await (0, promises_1.readFile)(audioFilePath)], { type: 'audio/ogg' });
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
            await (0, promises_1.unlink)(audioFilePath).catch(console.error);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`GROQ API error: ${JSON.stringify(errorData)}`);
            }
            const result = await response.json();
            // console.log("Transcrição da IA GROQ:", result.text);
            return result.text;
        }
        catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        }
    }
}
exports.GroqProvider = GroqProvider;
