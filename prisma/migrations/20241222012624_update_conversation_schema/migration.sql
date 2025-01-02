-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "backend";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "frontend";

-- CreateTable
CREATE TABLE "backend"."Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backend"."ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backend"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "text" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "isTranscribed" BOOLEAN NOT NULL DEFAULT false,
    "audioUrl" TEXT,
    "transcription" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_participantId_key" ON "backend"."ConversationParticipant"("conversationId", "participantId");

-- CreateIndex
CREATE INDEX "Message_conversationId_timestamp_idx" ON "backend"."Message"("conversationId", "timestamp");

-- AddForeignKey
ALTER TABLE "backend"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "backend"."Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backend"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "backend"."Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
