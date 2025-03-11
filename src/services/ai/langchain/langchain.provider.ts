import { AIProvider } from "../types";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export class LangChainProvider implements AIProvider {
    private model: any;
    private data: any;

    constructor(type: string, apiKey: string, data: any) {
        this.data = data;

        switch(type.toUpperCase()) {
            case "OPENAI":
                this.model = new ChatOpenAI({
                    apiKey: apiKey,
                    model: data.providerModel || "gpt-4o-mini",
                    temperature: data.temperature || 0.5,
                    maxTokens: data.limitToken || 1024,
                });
                break;
            case "GROQ":
                this.model = new ChatGroq({
                    apiKey: apiKey,
                    model: data.providerModel || "llama3-8b-8192",
                    temperature: data.temperature || 0.5,
                    maxTokens: data.limitToken || 1024,
                });
                break;
            case "GEMINI":
                this.model = new ChatGoogleGenerativeAI({
                    apiKey: apiKey,
                    model: data.providerModel || "gemini-2.0-flash",
                    temperature: data.temperature || 0.5,
                    maxOutputTokens: data.limitToken || 1024,
                });
                break;
            case "ANTHROPIC":
                this.model = new ChatAnthropic({
                    apiKey: apiKey,
                    model: data.providerModel || "claude-3-5-sonnet-20240620",
                    temperature: data.temperature || 0.5,
                    maxTokens: data.limitToken || 1024,
                });
                break;
            //Confirmar com testes
            case "DEEPSEEK":
                this.model = new ChatDeepSeek({
                    apiKey: apiKey,
                    model: data.providerModel || "deepseek-chat",
                    temperature: data.temperature || 0.5,
                    maxTokens: data.limitToken || 1024,
                });
                break;
            default:
                throw new Error(`Unsupported AI provider: ${type}`);
        }
    }

    async generateResponse(message: string, systemPrompt?: string): Promise<string> {
        try {
            const prompt = ChatPromptTemplate.fromMessages([
                ["system", "Você é um humano calmo e com amplo conhecimento"],
                ["human", message],
            ])

            const chain = prompt.pipe(this.model).pipe(new StringOutputParser())

            const response = await chain.invoke({})
            console.log(`Response from ${this.data.provider}:`, response);

            return response;
        } catch (error) {
            console.error(`Error generating response with ${this.data.provider}:`, error);
            throw error;
        }
    }
}