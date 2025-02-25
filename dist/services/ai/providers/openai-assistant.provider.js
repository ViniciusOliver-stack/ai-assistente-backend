"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIAssistantProvider = void 0;
const openai_1 = __importDefault(require("openai"));
const database_1 = __importDefault(require("../../../config/database"));
class OpenAIAssistantProvider {
    constructor(apiKey, data) {
        this.client = new openai_1.default({ apiKey });
        this.data = data;
    }
    getBrasiliaTime() {
        return new Date().toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    getBrasiliaDate() {
        return new Date().toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }
    async createAssistant(name, instructions, teamId) {
        try {
            //Cria um assistente na OpenAI
            const assistant = await this.client.beta.assistants.create({
                name,
                instructions,
                model: "gpt-4o-mini",
                tools: [{ type: "code_interpreter" }],
            });
            //Salva as informações no banco de dados
            return await database_1.default.assistant.create({
                data: {
                    assistantId: assistant.id,
                    name,
                    instructions,
                    teamId
                }
            });
        }
        catch (error) {
            console.error("Erro ao criar assistant:", error);
            throw error;
        }
    }
    async updateAssistant(assistantId, instructions) {
        try {
            //Atualiza o assistente na OpenAI
            const updatedAssistant = await this.client.beta.assistants.update(assistantId, {
                instructions
            });
            //Atualiza o registro no banco de dados
            return await database_1.default.assistant.update({
                where: { assistantId },
                data: { instructions }
            });
        }
        catch (error) {
            console.error("Erro ao atualizar assistant:", error);
            throw error;
        }
    }
    async getOrCreateThread(userId, conversationId, assistantId) {
        try {
            //Verifica se já existe uma thread para esta conversa
            const existingThread = await database_1.default.thread.findUnique({
                where: {
                    conversationId
                }
            });
            if (existingThread) {
                return existingThread;
            }
            //Cria nova thread na OpenAI
            const thread = await this.client.beta.threads.create();
            //Salva as informações no banco de dados
            return await database_1.default.thread.create({
                data: {
                    threadId: thread.id,
                    userId,
                    conversationId,
                    assistantId
                }
            });
        }
        catch (error) {
            console.error("Erro ao criar/recuperar thread:", error);
            throw error;
        }
    }
    async addTranscriptionToThread(transcription, threadId) {
        //Adiciona a transcrição ao thread como uma nova mensagem do usuário na thread
        await this.client.beta.threads.messages.create(threadId, {
            role: "user",
            content: `Transcrição de áudio: ${transcription}`
        });
    }
    async generateResponse(message, threadId, assistantId, audioTranscription) {
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
        }
        catch (error) {
            console.error("Erro ao gerar resposta:", error);
            throw error;
        }
    }
}
exports.OpenAIAssistantProvider = OpenAIAssistantProvider;
