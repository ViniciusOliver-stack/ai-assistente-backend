/*
  Warnings:

  - You are about to drop the column `useLangChain` on the `Agent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Agent" DROP COLUMN "useLangChain";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "metadata" JSONB;
