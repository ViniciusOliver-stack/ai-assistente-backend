// src/services/ai/langchain/config.ts
export interface LangChainConfig {
    // Configurações básicas
    provider: string;
    apiKey: string;
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
    
    // Configurações específicas por provedor
    openai?: {
        organization?: string;
    };
    
    groq?: {
        baseURL?: string;
    };
    
    gemini?: {
        safetySettings?: any[];
    };

    anthropic?: {
        maxRetries?: number;
    }

    deepseek?: {
        baseURL: string;
    }
}

// Função auxiliar para construir configurações
export function buildLangChainConfig(provider: string, apiKey: string, data: any): LangChainConfig {
    const config: LangChainConfig = {
        provider: provider.toUpperCase(),
        apiKey: apiKey,
        modelName: data.providerModel,
        temperature: data.temperature || 0.5,
        maxTokens: data.limitToken || 1024,
    };
    
    // Adicionar configurações específicas por provedor
    switch (provider.toUpperCase()) {
        case 'OPENAI':
            config.openai = {
                organization: data.organization
            };
            break;
        case 'GROQ':
            config.groq = {
                baseURL: data.baseURL
            };
            break;
        case 'GEMINI':
            config.gemini = {
                safetySettings: data.safetySettings || []
            };
            break;
        case 'ANTHROPIC':
            config.anthropic = {
                maxRetries: data.maxRetries || 3
            };
            break;
        case 'DEEPSEEK':
            config.deepseek = {
                baseURL: data.baseURL || 'https://api.deepseek.com'
            };
            break;
    }
    
    return config;
}