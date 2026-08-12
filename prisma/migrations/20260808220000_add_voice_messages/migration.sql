-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "audioUrl" TEXT,
ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;

-- Make text optional with default for voice-only rows
ALTER TABLE "Message" ALTER COLUMN "text" SET DEFAULT '';
