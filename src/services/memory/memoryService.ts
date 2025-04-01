// src/services/memory/memoryService.ts
import prisma from "../../config/database";
import { OpenAIEmbeddings } from "@langchain/openai";

export class MemoryService {
  private static instance: MemoryService;
  
  private constructor() {}
  
  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
    }
    return MemoryService.instance;
  }
  
  async getOrCreateMemory(userId: string, teamId: string): Promise<string | null> {
    try {
      // Verificar se o usuário e o time existem antes de tentar criar a memória
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      
      if (!user || !team) {
        console.warn(`User ID ${userId} or Team ID ${teamId} not found. Cannot create memory.`);
        return null;
      }
      
      // Procurar memória existente
      let memory = await prisma.memory.findFirst({
        where: {
          userId,
          teamId
        }
      });
      
      // Criar nova memória se não existir
      if (!memory) {
        memory = await prisma.memory.create({
          data: {
            userId,
            teamId,
            buffer: { messages: [] },
            summary: ""
          }
        });
      }
      
      return memory.id;
    } catch (error) {
      console.error("Error in getOrCreateMemory:", error);
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
      
      // Obter mensagens existentes ou inicializar array vazio
      const buffer = memory.buffer as any || { messages: [] };
      
      // Adicionar nova mensagem
      buffer.messages.push({
        text: message,
        role: isHuman ? "human" : "ai",
        timestamp: new Date().toISOString()
      });
      
      // Manter apenas as últimas N mensagens (ex., 10)
      if (buffer.messages.length > 10) {
        buffer.messages = buffer.messages.slice(-10);
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
      console.error("Error in saveToMemory:", error);
    }
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
      return buffer.messages.map((msg: any) => 
        `${msg.role === "human" ? "User" : "AI"}: ${msg.text}`
      ).join("\n");
    } catch (error) {
      console.error("Error in getRecentConversation:", error);
      return "";
    }
  }
  
  async generateSummary(memoryId: string | null, apiKey: string | undefined, provider: string): Promise<void> {
    if (!memoryId || !apiKey) return;
    
    // Só gerar embeddings para OpenAI (outros provedores não suportados)
    if (provider.toUpperCase() !== "OPENAI") return;
    
    try {
      const memory = await prisma.memory.findUnique({
        where: { id: memoryId }
      });
      
      if (!memory || !memory.buffer) return;
      
      // Criar embeddings apenas para OpenAI
      const embeddings = new OpenAIEmbeddings({ openAIApiKey: apiKey });
      
      // Gerar embeddings para o conteúdo do buffer
      const buffer = memory.buffer as any;
      const text = buffer.messages.map((msg: any) => msg.text).join(" ");
      
      // Armazenar embeddings
      const embeddingVector = await embeddings.embedQuery(text);
      
      // Atualizar memória com embeddings
      await prisma.memory.update({
        where: { id: memoryId },
        data: { 
          embeddings: embeddingVector,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error("Error in generateSummary:", error);
    }
  }
}