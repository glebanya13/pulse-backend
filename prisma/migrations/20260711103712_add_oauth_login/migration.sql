-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('YANDEX', 'VK');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vkId" TEXT,
ADD COLUMN     "yandexId" TEXT;

-- CreateTable
CREATE TABLE "OAuthLoginSession" (
    "id" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "status" "TelegramLoginStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthLoginSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OAuthLoginSession_status_idx" ON "OAuthLoginSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_yandexId_key" ON "User"("yandexId");

-- CreateIndex
CREATE UNIQUE INDEX "User_vkId_key" ON "User"("vkId");

