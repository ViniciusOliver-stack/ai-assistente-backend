import OpenAI from "openai";
import prisma from "../../../config/database";

export class OpenAIAssistantProvider {
    private client: OpenAI;
    private data: any;

    constructor(apiKey: string, data: any) {
        this.client = new OpenAI({ apiKey });
        this.data = data;
    }

    private getBrasiliaTime(): string {
        return new Date().toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    private getBrasiliaDate(): string {
        return new Date().toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }

    async createAssistant(name: string, instructions: string, teamId: string) {
        try {
            //Cria um assistente na OpenAI
            const assistant = await this.client.beta.assistants.create({
                name,
                instructions,
                model: "gpt-4o-mini",
                tools: [{ type: "code_interpreter"}],
            });

            //Salva as informações no banco de dados
            return await prisma.assistant.create({
                data: {
                    assistantId: assistant.id,
                    name,
                    instructions,
                    teamId
                }
            })
        } catch (error) {
            console.error("Erro ao criar assistant:", error);
            throw error;
        }
    }

    async updateAssistant(assistantId: string, instructions: string) {
        try {
            //Atualiza o assistente na OpenAI
            const updatedAssistant = await this.client.beta.assistants.update(assistantId, {
                instructions
            });

            //Atualiza o registro no banco de dados
            return await prisma.assistant.update({
                where: { assistantId },
                data: { instructions }
            })
        } catch (error) {
            console.error("Erro ao atualizar assistant:", error);
            throw error;
        }
    }

    async getOrCreateThread(userId: string, conversationId: string, assistantId: string) {
        try {
            //Verifica se já existe uma thread para esta conversa
            const existingThread = await prisma.thread.findUnique({
                where: {
                    conversationId
                }
            })

            if(existingThread) {
                return existingThread;
            }

            //Cria nova thread na OpenAI
            const thread = await this.client.beta.threads.create();

            //Salva as informações no banco de dados
            return await prisma.thread.create({
                data: {
                    threadId: thread.id,
                    userId,
                    conversationId,
                    assistantId
                }
            })
        } catch (error) {
            console.error("Erro ao criar/recuperar thread:", error);
            throw error;
        }
    }

    async addTranscriptionToThread(transcription: string, threadId: string) {
        //Adiciona a transcrição ao thread como uma nova mensagem do usuário na thread
        await this.client.beta.threads.messages.create(threadId, {
            role: "user",
            content: `Transcrição de áudio: ${transcription}`
        })
    }

    async generateResponse(message: string, threadId: string, assistantId: string, audioTranscription?: string): Promise<string> {
        try {
            // Adiciona contexto temporal primeiro
            const timeNote = `[Nota interna: Data/Hora atual em Brasília: ${this.getBrasiliaDate()} - ${this.getBrasiliaTime()}]`;
            
            await this.client.beta.threads.messages.create(threadId, {
                role: "user",
                content: timeNote
            });
            
            // Se houver transcrição de áudio, adiciona primeiro
            if (audioTranscription) {
                await this.addTranscriptionToThread(audioTranscription, threadId);
            }

            // Adicionar mensagem à thread
            await this.client.beta.threads.messages.create(threadId, {
                role: "user",
                content: message
            });

            // Executar o assistant
            const run = await this.client.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            // Aguardar a conclusão
            let runStatus = await this.client.beta.threads.runs.retrieve(threadId, run.id);
            
            while (runStatus.status === "queued" || runStatus.status === "in_progress") {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await this.client.beta.threads.runs.retrieve(threadId, run.id);
            }

            if (runStatus.status === "completed") {
                // Recuperar as mensagens mais recentes
                const messages = await this.client.beta.threads.messages.list(threadId);
                const lastMessage = messages.data[0];
                
                if (lastMessage.role === "assistant" && lastMessage.content[0].type === "text") {
                    const messages = await this.client.beta.threads.messages.list(threadId);
                    const lastMessage = messages.data[0];
                    
                    if (lastMessage.role === "assistant" && lastMessage.content[0].type === "text") {
                        return lastMessage.content[0].text.value;
                    }
                }
            }

            throw new Error("Falha ao gerar resposta do assistant");
        } catch (error) {
            console.error("Erro ao gerar resposta:", error);
            throw error;
        }
    }
}