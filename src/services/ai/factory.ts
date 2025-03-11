import { AIProvider } from "./types";
import { LangChainProvider } from "./langchain/langchain.provider";

export class AIProviderFactory {
    static createProvider(type: string, apiKey: string, data?: any): AIProvider {

        return new LangChainProvider(type, apiKey, {
            ...data,
            provider: type.toUpperCase()
        });
    }
}