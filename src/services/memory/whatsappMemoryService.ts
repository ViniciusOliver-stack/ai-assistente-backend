// src/services/memory/whatsappMemoryService.ts
import prisma from "../../config/database";
import { OpenAIEmbeddings } from "@langchain/openai";

interface MessageImportance {
  text: string;
  role: string;
  timestamp: string;
  importance: number; // 0-10 score (0: less important, 10: most important)
}

export class WhatsAppMemoryService {
  private static instance: WhatsAppMemoryService;
  private MAX_MESSAGES = 15; // Número máximo de mensagens no buffer
  private IMPORTANCE_THRESHOLD = 5; // Mensagens com pontuação abaixo são candidatas à remoção
  
  private constructor() {}
  
  public static getInstance(): WhatsAppMemoryService {
    if (!WhatsAppMemoryService.instance) {
      WhatsAppMemoryService.instance = new WhatsAppMemoryService();
    }
    return WhatsAppMemoryService.instance;
  }
  
  async getOrCreateMemory(phoneNumber: string, teamId: string): Promise<string | null> {
    try {
      // Verificar se o time existe
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      
      if (!team) {
        console.warn(`Team ID ${teamId} not found. Cannot create memory.`);
        return null;
      }
      
      // Acessar o dono do time como referência de usuário
      const owner = await prisma.user.findUnique({ 
        where: { id: team.ownerId || undefined }
      });
      
      if (!owner) {
        console.warn(`Team ${teamId} has no owner. Cannot create memory reference.`);
        return null;
      }
      
      // Procurar memória existente para este número de telefone
      let memory = await prisma.memory.findFirst({
        where: {
          teamId,
          metadata: {
            path: ['phoneNumber'],
            equals: phoneNumber
          }
        }
      });
      
      // Criar nova memória se não existir
      if (!memory) {
        memory = await prisma.memory.create({
          data: {
            userId: owner.id, // Usar o ID do dono do time como referência
            teamId,
            buffer: { 
              messages: [],
              lastCleanup: new Date().toISOString(),
              messageCount: 0
            },
            summary: "",
            metadata: {
              phoneNumber,
              source: "whatsapp",
              instanceName: teamId
            }
          }
        });
      }
      
      return memory.id;
    } catch (error) {
      console.error("Error in getOrCreateMemory for WhatsApp contact:", error);
      return null;
    }
  }
  
  async saveToMemory(memoryId: string | null, message: string, isHuman: boolean): Promise<void> {
    if (!memoryId) return;
    
    try {
      const memory = await prisma.memory.findUnique({
        where: { id: memoryId }
      });
      
      if (!memory) return;
      
      // Obter mensagens existentes ou inicializar buffer
      const buffer = memory.buffer as any || { 
        messages: [],
        lastCleanup: new Date().toISOString(),
        messageCount: 0
      };
      
      // Calcular importância inicial da mensagem
      const importance = this.calculateInitialImportance(message, isHuman);
      
      // Adicionar nova mensagem com pontuação de importância
      buffer.messages.push({
        text: message,
        role: isHuman ? "human" : "ai",
        timestamp: new Date().toISOString(),
        importance: importance
      });
      
      buffer.messageCount = (buffer.messageCount || 0) + 1;
      
      // Aplicar gerenciamento inteligente do buffer
      if (buffer.messages.length > this.MAX_MESSAGES) {
        buffer.messages = this.optimizeMessageBuffer(buffer.messages);
        buffer.lastCleanup = new Date().toISOString();
      }
      
      // Atualizar memória no DB
      await prisma.memory.update({
        where: { id: memoryId },
        data: { 
          buffer,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error("Error saving to WhatsApp memory:", error);
    }
  }
  
  /**
   * Calcula a pontuação de importância inicial para uma mensagem
   */
  private calculateInitialImportance(message: string, isHuman: boolean): number {
    let score = 5; // Pontuação base
    
    // Mensagens mais longas têm maior probabilidade de conter informações importantes
    if (message.length > 100) score += 1;
    if (message.length > 200) score += 1;
    
    // Características que podem indicar informações importantes
    if (message.includes("?")) score += 1; // Perguntas são geralmente importantes
    
    // Verificar presença de dados potencialmente importantes
    if (/\b(nome|telefone|email|endereço|cpf|cnpj)\b/i.test(message)) score += 2;
    if (/\b(preciso|necessito|quero|gostaria)\b/i.test(message)) score += 1;
    if (/\b(problema|dificuldade|erro|falha)\b/i.test(message)) score += 2;
    if (/\b(obrigado|agradeço|grato)\b/i.test(message)) score -= 1; // Mensagens de agradecimento são menos importantes para o contexto
    
    // Limitar a pontuação entre 0-10
    return Math.max(0, Math.min(10, score));
  }
  
  /**
   * Otimiza o buffer de mensagens mantendo as mais importantes
   */
  private optimizeMessageBuffer(messages: MessageImportance[]): MessageImportance[] {
    // Se temos poucas mensagens acima do limite, apenas removemos as mais antigas e menos importantes
    if (messages.length <= this.MAX_MESSAGES + 3) {
      // Ordenar por importância (decrescente) e timestamp (crescente em caso de empate)
      return messages
        .sort((a, b) => {
          if (a.importance !== b.importance) return b.importance - a.importance;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        })
        .slice(0, this.MAX_MESSAGES);
    }
    
    // Para casos com muitas mensagens, usamos uma estratégia mais sofisticada
    
    // 1. Manter primeiras mensagens (contexto inicial)
    const firstMessages = messages.slice(0, 2);
    
    // 2. Manter últimas mensagens (contexto recente)
    const lastMessages = messages.slice(-5);
    
    // 3. Selecionar as mensagens mais importantes do meio
    const middleMessages = messages.slice(2, -5)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.MAX_MESSAGES - firstMessages.length - lastMessages.length);
    
    // 4. Combinar e ordenar cronologicamente
    return [...firstMessages, ...middleMessages, ...lastMessages]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
  
  /**
   * Atualiza a importância das mensagens com base no contexto da conversa
   */
  private updateMessageImportance(messages: MessageImportance[]): MessageImportance[] {
    // Implementação básica - poderia ser mais sofisticada com NLP
    if (messages.length <= 1) return messages;
    
    return messages.map((msg, index) => {
      // Aumentar importância de mensagens referenciadas em conversas posteriores
      if (index < messages.length - 1) {
        const laterMessages = messages.slice(index + 1);
        for (const laterMsg of laterMessages) {
          // Verifica se mensagens posteriores fazem referência a esta
          if (this.messageReferencesContent(laterMsg.text, msg.text)) {
            msg.importance = Math.min(10, msg.importance + 1);
            break;
          }
        }
      }
      return msg;
    });
  }
  
  /**
   * Verifica se uma mensagem faz referência ao conteúdo de outra
   */
  private messageReferencesContent(laterMessage: string, earlierMessage: string): boolean {
    // Extrai palavras-chave da mensagem anterior (implementação simplificada)
    const keywords = earlierMessage
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 4); // Palavras maiores são mais significativas
      
    // Verifica quantas palavras-chave aparecem na mensagem posterior
    let matchCount = 0;
    for (const keyword of keywords) {
      if (laterMessage.toLowerCase().includes(keyword)) {
        matchCount++;
      }
    }
    
    // Retorna verdadeiro se um número suficiente de palavras-chave forem encontradas
    return matchCount >= 2 && (matchCount / keywords.length) > 0.2;
  }
  
  async getRecentConversation(memoryId: string | null): Promise<string> {
    if (!memoryId) return "";
    
    try {
      const memory = await prisma.memory.findUnique({
        where: { id: memoryId }
      });
      
      if (!memory || !memory.buffer) return "";
      
      // Formatar mensagens para contexto
      const buffer = memory.buffer as any;
      
      if (!buffer.messages || !Array.isArray(buffer.messages)) {
        return "";
      }
      
      // Ordenar mensagens para garantir ordem cronológica
      const sortedMessages = [...buffer.messages].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Formatar só as mais importantes se tivermos muitas mensagens
      if (sortedMessages.length > 10) {
        const importantMessages = sortedMessages
          .filter(msg => (msg.importance || 5) >= this.IMPORTANCE_THRESHOLD)
          .slice(-10);
          
        if (importantMessages.length > 0) {
          return importantMessages.map((msg: any) => 
            `${msg.role === "human" ? "Usuário" : "AI"}: ${msg.text}`
          ).join("\n");
        }
      }
      
      // Se não temos muitas mensagens ou mensagens importantes suficientes, retornar todas
      return sortedMessages.map((msg: any) => 
        `${msg.role === "human" ? "Usuário" : "AI"}: ${msg.text}`
      ).join("\n");
    } catch (error) {
      console.error("Error retrieving WhatsApp conversation:", error);
      return "";
    }
  }
  
  async generateSummary(memoryId: string | null, apiKey: string | undefined, provider: string): Promise<void> {
    if (!memoryId || !apiKey) return;
    
    // Só gerar embeddings para OpenAI
    if (provider.toUpperCase() !== "OPENAI") return;
    
    try {
      const memory = await prisma.memory.findUnique({
        where: { id: memoryId }
      });
      
      if (!memory || !memory.buffer) return;
      
      const embeddings = new OpenAIEmbeddings({ openAIApiKey: apiKey });
      
      // Gerar embeddings para o conteúdo do buffer
      const buffer = memory.buffer as any;
      
      if (!buffer.messages || buffer.messages.length === 0) {
        return;
      }
      
      // Priorizar mensagens importantes para o embedding
      const importantMessages = buffer.messages
        .filter((msg: any) => (msg.importance || 0) >= this.IMPORTANCE_THRESHOLD)
        .map((msg: any) => msg.text);
      
      // Se não tivermos mensagens importantes suficientes, usar todas
      const textForEmbedding = importantMessages.length >= 3 
        ? importantMessages.join(" ") 
        : buffer.messages.map((msg: any) => msg.text).join(" ");
      
      // Armazenar embeddings
      const embeddingVector = await embeddings.embedQuery(textForEmbedding);
      
      // Atualizar memória com embeddings
      await prisma.memory.update({
        where: { id: memoryId },
        data: { 
          embeddings: embeddingVector,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error("Error generating embeddings for WhatsApp memory:", error);
    }
  }
}