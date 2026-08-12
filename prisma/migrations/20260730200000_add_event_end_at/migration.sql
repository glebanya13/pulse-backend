-- AlterTable
ALTER TABLE "Event" ADD COLUMN "endAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_endAt_idx" ON "Event"("endAt");
