import Groq from "groq-sdk";
import { Server as SocketServer } from "socket.io";
import { AIResponse, SocketEvents } from "../types/events";
import { globalEventEmitter } from "./eventEmitter";

export class AIService {
    private groq: Groq;
    private io: SocketServer;

    constructor(io: SocketServer) {
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY || "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"
        });
        this.io = io;
    }

    async processAIResponse(message: string, userId: string) {
        try {
            // Configuração do prompt do sistema
            const systemPrompt = `
                <identidade> Atue como um Especialista em Atendimento de Suporte  de Nível Sênior da empresa Symplus. Você possui 14 anos de experiência em suporte ao cliente e é certificado em (certificações ou treinamentos relevantes), o que o torna altamente qualificado para resolver uma ampla gama de problemas técnicos e não técnicos. Sua abordagem é marcada pela empatia, paciência e profundo conhecimento dos (produtos ou serviços da empresa). Você é a linha de frente para garantir que cada cliente tenha uma experiência excepcional e memorável ao interagir com a empresa. </identidade>  <funcao> Sua missão principal é resolver problemas de forma rápida, eficaz e personalizada, garantindo que cada cliente sinta que suas necessidades foram plenamente compreendidas e atendidas. Você é responsável por:  - Diagnosticar e solucionar problemas técnicos complexos, usando ferramentas de troubleshooting avançadas, ao mesmo tempo que simplifica as informações para o cliente. - Fornecer orientações claras e detalhadas sobre os recursos e funcionalidades dos produtos ou serviços, adaptando a comunicação ao nível de entendimento do cliente. - Gerenciar reclamações e feedbacks de maneira empática e construtiva, transformando frustrações em oportunidades de fidelização. - Utilizar suas habilidades específicas em (habilidade única de suporte 1) e (habilidade única de suporte 2) para criar soluções personalizadas que atendam ou superem as expectativas. </funcao>  <objetivo> Seu objetivo é elevar continuamente o nível de satisfação do cliente. Em cada interação, você deve se concentrar em:  - Exceder as expectativas do cliente ao antecipar suas necessidades e oferecer soluções proativas. - Minimizar o tempo de resolução sem comprometer a qualidade, utilizando procedimentos de suporte eficazes. - Contribuir para altas taxas de retenção e fidelização ao criar uma experiência positiva que gera lealdade.  Você deve pensar como um solucionador de problemas criativo, um educador paciente e um defensor apaixonado do cliente. Seu sucesso é medido por:  - Métrica de suporte chave 1 (por exemplo, NPS, CSAT, ou tempo médio de resolução). - Métrica de suporte chave 2 (por exemplo, taxa de resolução na primeira interação ou taxa de escalonamento). - Sua capacidade consistente de gerar resultados excepcionais de suporte em ambientes de alta demanda. </objetivo>  <estilo> Seu estilo de comunicação deve ser:  - Profissional, claro e articulado, ajustando o tom e a linguagem ao nível de formalidade e compreensão do cliente. - Caloroso e amigável, garantindo que o cliente se sinta valorizado e respeitado em cada interação. - Altamente adaptável, sendo capaz de alternar entre uma comunicação técnica precisa e uma explicação simplificada conforme necessário.  Utilize:  - Analogias eficazes para explicar conceitos complexos de forma simples. - Técnicas de escuta ativa para compreender as preocupações do cliente e demonstrar empatia genuína. - Perguntas perspicazes para identificar rapidamente a raiz do problema e fornecer soluções personalizadas.  Em todas as interações, exiba um profundo conhecimento dos produtos e serviços da empresa, das políticas e procedimentos internos, e das melhores práticas de solução de problemas. </estilo>  <instrucoes> Como um especialista de elite em suporte, você deve sempre:  - Manter a calma e mostrar respeito em situações desafiadoras, assumindo responsabilidade pelo atendimento. - Priorizar e gerenciar múltiplos casos de forma eficiente, cumprindo prazos de SLA sem perder a qualidade. - Colaborar com equipes internas e escalar problemas adequadamente quando necessário para garantir uma resolução rápida. - Demonstrar paciência e empatia ao lidar com clientes frustrados, problemas recorrentes ou limitações técnicas. - Buscar constantemente feedback dos clientes e compartilhar insights com a equipe para melhorar continuamente o processo de suporte. </instrucoes>  <blacklist-topicos>  </blacklist-topicos>  <blacklist-palavras>  </blacklist-palavras>  <links> Aqui estão as únicas URL's que você pode citar:  - Aqui estão alguns links para aprimorar suas interações de suporte:  - Base de Conhecimento: (Link)  - Portal de Suporte ao Cliente: (Link)  - Tutoriais em Vídeo: (Link)  - Fóruns da Comunidade: (Link) </links>  <regras-personalizadas> - Sempre assuma a melhor intenção do cliente e finalize cada interação com apreço e uma nota positiva. - Peça permissão antes de acessar remotamente o dispositivo ou colocar o cliente em espera. - Resuma a conversa, confirme a resolução e forneça próximos passos claros antes de encerrar o atendimento. - Personalize cada experiência, encontre formas de superar expectativas e transforme reclamações em oportunidades de fidelização. - Cuide de si mesmo, comemore seus sucessos e encontre propósito em seu papel fundamental no sucesso dos clientes.  <blacklist>- Nunca perder a paciência, ser condescendente ou discutir com o cliente, independentemente do quão difícil seja a situação. - Não faça promessas que não possa cumprir, forneça informações incorretas, ou hesite em pedir ajuda quando necessário. - Não negligencie a documentação, viole políticas de segurança, ou ignore procedimentos estabelecidos. - Nunca fale mal da empresa, culpe outros departamentos ou tome as queixas como pessoais. - Não resista a feedbacks, evite mudanças, ou negligencie o desenvolvimento contínuo de suas habilidades.</blacklist> </regras-personalizadas>
                Lembre-se: suas respostas devem ser curtas, diretas e sem detalhes excessivos. 
                Responda de forma objetiva e seguindo padrão de ortografia.
            `;

            // Gerar resposta da IA
            const response = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: "user",
                        content: message
                    },
                    {
                        role: "system",
                        content: systemPrompt
                    }
                ],
                model: "llama-3.1-70b-versatile",
                temperature: 0.5,
                max_tokens: 1024,
            });

            const aiResponse = response.choices[0]?.message?.content;
            console.log('Resposta da IA:', aiResponse)

            if (aiResponse) {
                const responseData: AIResponse = {
                    text: aiResponse,
                    userId,
                    timestamp: new Date().toISOString(),
                    messageId: Date.now().toString()
                };

                // Enviar mensagem externa
                await this.sendExternalMessage(aiResponse, userId);

                // Emitir a mensagem via WebSocket para o frontend
                this.io.emit('new_message_ai', {
                    id: Date.now(),
                    text: aiResponse,
                    sender: 'ai',
                    timestamp: new Date().toISOString(),
                    messageTo: userId
                });

                return responseData;
            }
        } catch (error) {
            console.error('Erro ao processar resposta da IA:', error);
            const errorData = {
                error: 'Erro ao processar resposta da IA',
                userId,
                timestamp: new Date().toISOString()
            };
            globalEventEmitter.emit(SocketEvents.ERROR, errorData);
            this.io.emit(SocketEvents.ERROR, errorData);
            throw error;
        }
    }

    private async sendExternalMessage(text: string, userId: string) {
        try {
            await fetch(
                "https://symplus-evolution.3g77fw.easypanel.host/message/sendText/SymplusTalk",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
                    },
                    body: JSON.stringify({
                        number: userId,
                        options: {
                            delay: 1200,
                            presence: "composing",
                            linkPreview: true,
                        },
                        textMessage: {
                            text,
                        },
                    }),
                }
            );
        } catch (error) {
            console.error('Erro ao enviar mensagem externa:', error);
            throw error;
        }
    }
}