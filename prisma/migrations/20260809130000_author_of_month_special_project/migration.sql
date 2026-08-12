-- AlterEnum NotificationType
ALTER TYPE "NotificationType" ADD VALUE 'AUTHOR_OF_MONTH';
ALTER TYPE "NotificationType" ADD VALUE 'SPECIAL_PROJECT';

-- AlterEnum AdminActionType
ALTER TYPE "AdminActionType" ADD VALUE 'SET_AUTHOR_OF_MONTH';
ALTER TYPE "AdminActionType" ADD VALUE 'SET_SPECIAL_PROJECT';

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "authorOfMonthPeriod" TEXT;
ALTER TABLE "User" ADD COLUMN "specialProject" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_authorOfMonthPeriod_idx" ON "User"("authorOfMonthPeriod");

-- CreateTable AuthorOfMonth
CREATE TABLE "AuthorOfMonth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorOfMonth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorOfMonth_period_key" ON "AuthorOfMonth"("period");
CREATE INDEX "AuthorOfMonth_userId_idx" ON "AuthorOfMonth"("userId");

ALTER TABLE "AuthorOfMonth" ADD CONSTRAINT "AuthorOfMonth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
