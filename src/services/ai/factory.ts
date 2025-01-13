import { AIProvider } from "./types";
import { GroqProvider } from "./providers/groq.provider";
import { OpenAIProvider } from "./providers/openai.provider";

export class AIProviderFactory {
    static createProvider(type: string, apiKey: string, data?: any): AIProvider {

        switch (type.toUpperCase()) {
            case "GROQ":
                return new GroqProvider(apiKey, data);
            case "OPENAI":
                return new OpenAIProvider(apiKey, data);
            default:
                throw new Error(`Unsupported AI provider: ${type}`);
        }
    }
}