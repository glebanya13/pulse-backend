-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_NO_SHOW';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "hostMarkedNoShowAt" TIMESTAMP(3);
