-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AUTHOR_LEVEL_UP';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "authorLevel" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "User_authorLevel_idx" ON "User"("authorLevel");
