-- Add default BTC balance to users (1 BTC = 100,000,000 sats)
ALTER TABLE "User" ADD COLUMN "btcSats" INTEGER NOT NULL DEFAULT 100000000;

-- Satoshi transfer records tied to guestbook entries
CREATE TABLE "SatoshiDrop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "messageId" TEXT NOT NULL,
    "amountSats" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    CONSTRAINT "SatoshiDrop_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SatoshiDrop_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SatoshiDrop_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "GuestbookEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SatoshiDrop_messageId_key" ON "SatoshiDrop"("messageId");
CREATE INDEX "SatoshiDrop_createdAt_idx" ON "SatoshiDrop"("createdAt");
CREATE INDEX "SatoshiDrop_senderId_idx" ON "SatoshiDrop"("senderId");
CREATE INDEX "SatoshiDrop_receiverId_idx" ON "SatoshiDrop"("receiverId");
