ALTER TABLE "User" ADD COLUMN "ethUnits" INTEGER NOT NULL DEFAULT 100000000;

CREATE TABLE "EthDrop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "messageId" TEXT NOT NULL,
    "amountUnits" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    CONSTRAINT "EthDrop_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EthDrop_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EthDrop_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "GuestbookEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EthDrop_messageId_key" ON "EthDrop"("messageId");
CREATE INDEX "EthDrop_createdAt_idx" ON "EthDrop"("createdAt");
CREATE INDEX "EthDrop_senderId_idx" ON "EthDrop"("senderId");
CREATE INDEX "EthDrop_receiverId_idx" ON "EthDrop"("receiverId");
