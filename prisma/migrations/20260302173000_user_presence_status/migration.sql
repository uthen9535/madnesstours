ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ALIVE';
ALTER TABLE "User" ADD COLUMN "lastSeenAt" DATETIME;

UPDATE "User" SET "status" = 'ALIVE';

CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt");
