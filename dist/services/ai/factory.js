"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIProviderFactory = void 0;
const groq_provider_1 = require("./providers/groq.provider");
const openai_provider_1 = require("./providers/openai.provider");
class AIProviderFactory {
    static createProvider(type, apiKey, data) {
        switch (type.toUpperCase()) {
            case "GROQ":
                return new groq_provider_1.GroqProvider(apiKey, data);
            case "OPENAI":
                return new openai_provider_1.OpenAIProvider(apiKey, data);
            default:
                throw new Error(`Unsupported AI provider: ${type}`);
        }
    }
}
exports.AIProviderFactory = AIProviderFactory;
