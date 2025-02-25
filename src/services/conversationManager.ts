enum ConversationStatus {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED'
}

enum TicketPriority {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH'
}

import prisma from '../config/database';

export class ConversationManager {
    static async createOrReopenConversation(userId: string, recipientId: string, instanceWhatsApp: string) {

        // First, get the team ID from the WhatsApp instance
        const instance = await prisma.whatsAppInstance.findUnique({
            where: { instanceName: instanceWhatsApp },
            include: {
                agent: {
                    include: {
                        team: true
                    }
                }
            }
        });

        if (!instance) {
            throw new Error(`WhatsApp instance ${instanceWhatsApp} not found`);
        }

        const teamId = instance.agent.team.id;
        const agentTitle = instance.agent.title

        // Procurar por conversa fechada recente
        const recentClosedConversation = await prisma.conversation.findFirst({
            where: {
                AND: [
                    {
                        participants: {
                            some: {
                                participantId: userId
                            }
                        }
                    },
                    {
                        status: ConversationStatus.CLOSED
                    }
                ]
            },
            orderBy: {
                closedAt: 'desc'
            }
        });

        if (recentClosedConversation) {
            // Reabrir conversa existente
            return await prisma.conversation.update({
                where: {
                    id: recentClosedConversation.id
                },
                data: {
                    status: ConversationStatus.OPEN,
                    reopenCount: {
                        increment: 1
                    },
                    lastActivity: new Date(),
                    ticketNumber: recentClosedConversation.ticketNumber || 
                        `TK-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
                    metadata: {
                        teamId: teamId,
                        instanceName: instanceWhatsApp,
                        agentTitle: agentTitle
                    }
                }
            });
        }

        // Criar nova conversa com ticket
        return await prisma.conversation.create({
            data: {
                status: ConversationStatus.OPEN,
                ticketNumber: `TK-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
                priority: 'MEDIUM',
                instanceWhatsApp: instanceWhatsApp,
                participants: {
                    create: [
                        {
                            participantId: userId,
                            role: 'user',
                        },
                        {
                            participantId: recipientId,
                            role: 'ai',
                        }
                    ]
                },
                metadata: {
                    teamId: teamId, 
                    instanceName: instanceWhatsApp,
                    agentTitle: agentTitle
                }
            }
        });
    }

    static async closeConversation(conversationId: string, closedBy: string) {
        return await prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                status: ConversationStatus.CLOSED,
                closedAt: new Date(),
                closedBy,
                participants: {
                    updateMany: {
                        where: {
                            leftAt: null
                        },
                        data: {
                            leftAt: new Date()
                        }
                    }
                }
            }
        });
    }

    static async closeConversationByUserId(userId: string) {
        const activeConversation = await prisma.conversation.findFirst({
            where: {
                AND: [
                    {
                        participants: {
                            some: {
                                participantId: userId
                            }
                        }
                    },
                    {
                        status: ConversationStatus.OPEN
                    }
                ]
            }
        });
    
        if (activeConversation) {
            return await this.closeConversation(activeConversation.id, userId);
        }
    
        return null;
    }

    static async updateStatus(conversationId: string, status: ConversationStatus) {
        return await prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                status,
                lastActivity: new Date()
            }
        });
    }

    static async updatePriority(conversationId: string, priority: TicketPriority) {
        return await prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                priority,
                lastActivity: new Date()
            }
        });
    }
}