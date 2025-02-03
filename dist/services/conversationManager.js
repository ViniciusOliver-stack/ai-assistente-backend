"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationManager = void 0;
var ConversationStatus;
(function (ConversationStatus) {
    ConversationStatus["OPEN"] = "OPEN";
    ConversationStatus["CLOSED"] = "CLOSED";
})(ConversationStatus || (ConversationStatus = {}));
var TicketPriority;
(function (TicketPriority) {
    TicketPriority["LOW"] = "LOW";
    TicketPriority["MEDIUM"] = "MEDIUM";
    TicketPriority["HIGH"] = "HIGH";
})(TicketPriority || (TicketPriority = {}));
const database_1 = __importDefault(require("../config/database"));
class ConversationManager {
    static async createOrReopenConversation(userId, recipientId, instanceWhatsApp) {
        // Procurar por conversa fechada recente
        const recentClosedConversation = await database_1.default.conversation.findFirst({
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
            return await database_1.default.conversation.update({
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
                        `TK-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
                }
            });
        }
        // Criar nova conversa com ticket
        return await database_1.default.conversation.create({
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
                }
            }
        });
    }
    static async closeConversation(conversationId, closedBy) {
        return await database_1.default.conversation.update({
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
    static async closeConversationByUserId(userId) {
        const activeConversation = await database_1.default.conversation.findFirst({
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
    static async updateStatus(conversationId, status) {
        return await database_1.default.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                status,
                lastActivity: new Date()
            }
        });
    }
    static async updatePriority(conversationId, priority) {
        return await database_1.default.conversation.update({
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
exports.ConversationManager = ConversationManager;
