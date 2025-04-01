// src/services/ai/langchain/langchain.provider.ts
import { AIProvider } from "../types";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { WhatsAppMemoryService } from "../../memory/whatsappMemoryService";

export class LangChainProvider implements AIProvider {
    private model: any;
    private data: any;
    private memoryService: WhatsAppMemoryService;
    private apiKey: string;
    private provider: string;
    private MAX_CONTEXT_LENGTH = 1500; // Controle do tamanho máximo do contexto em caracteres

    constructor(type: string, apiKey: string, data: any) {
        this.data = data;
        this.apiKey = apiKey;
        this.provider = type.toUpperCase();
        this.memoryService = WhatsAppMemoryService.getInstance();

        switch(this.provider) {
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

    async generateResponse(message: string, systemPrompt?: string, contactId?: string): Promise<string> {
        try {
            let contextualMemory = "";
            let memoryId: string | null = null;
            
            // Determinar se estamos usando WhatsApp baseado no formato do contactId
            const isWhatsAppContact = contactId && /^\d+$/.test(contactId);
            
            // Obter contexto da memória se tivermos um contactId e teamId
            if (contactId && this.data.teamId) {
                try {
                    // Para contatos WhatsApp, usar phoneNumber como identificador
                    if (isWhatsAppContact) {
                        memoryId = await this.memoryService.getOrCreateMemory(contactId, this.data.teamId);
                        console.log(`Memory ID for WhatsApp contact ${contactId}: ${memoryId}`);
                    }
                    
                    if (memoryId) {
                        // Obter contexto relevante da memória
                        contextualMemory = await this.memoryService.getRecentConversation(memoryId);
                        
                        // Limitar tamanho do contexto para economizar tokens
                        if (contextualMemory.length > this.MAX_CONTEXT_LENGTH) {
                            contextualMemory = this.truncateContext(contextualMemory);
                        }
                        
                        // Salvar mensagem do usuário na memória
                        await this.memoryService.saveToMemory(memoryId, message, true);
                        console.log(`Saved user message to memory ID ${memoryId}`);
                    }
                } catch (memoryError) {
                    console.warn("Erro ao processar memória:", memoryError);
                    // Continuar sem memória se houver erro
                }
            }
            
            // Construir prompt do sistema com contexto da memória se disponível
            let enhancedSystemPrompt = systemPrompt || "Você é um assistente prestativo e amigável.";
            if (contextualMemory) {
                enhancedSystemPrompt += `\n\nHistórico de conversa recente com o usuário:\n${contextualMemory}\n\nContinue a conversa de forma natural, lembrando do contexto acima.`;
            }

            const prompt = ChatPromptTemplate.fromMessages([
                ["system", enhancedSystemPrompt],
                ["human", message],
            ]);

            const chain = prompt.pipe(this.model).pipe(new StringOutputParser());
            const response = await chain.invoke({});
            
            // Salvar resposta da IA na memória
            if (memoryId) {
                await this.memoryService.saveToMemory(memoryId, response, false);
                console.log(`Saved AI response to memory ID ${memoryId}`);
            }

            console.log(`Resposta de ${this.provider} (com memória: ${!!contextualMemory}):`, response.substring(0, 100) + "...");
            return response;
        } catch (error) {
            console.error(`Erro ao gerar resposta com ${this.provider}:`, error);
            throw error;
        }
    }
    
    /**
     * Trunca o contexto para economizar tokens,
     * mantendo o início e final da conversa
     */
    private truncateContext(context: string): string {
        const lines = context.split('\n');
        
        // Se houver poucas linhas, retornar tudo
        if (lines.length <= 10) return context;
        
        // Manter primeiras 3 linhas (início da conversa)
        const startLines = lines.slice(0, 3);
        
        // Manter últimas 7 linhas (parte mais recente e relevante)
        const endLines = lines.slice(-7);
        
        // Adicionar indicador de conteúdo omitido
        return [...startLines, "[...histórico anterior omitido...]", ...endLines].join('\n');
    }

}