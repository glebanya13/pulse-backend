-- CreateEnum
CREATE TYPE "TelegramLoginStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');

-- CreateTable
CREATE TABLE "TelegramLoginSession" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "TelegramLoginStatus" NOT NULL DEFAULT 'PENDING',
    "chatId" TEXT,
    "userId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLoginSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramLoginSession_status_idx" ON "TelegramLoginSession"("status");
