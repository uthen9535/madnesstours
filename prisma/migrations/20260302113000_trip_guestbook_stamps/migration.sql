PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GuestbookEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestbookEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuestbookEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GuestbookEntry" ("createdAt", "id", "message", "userId")
SELECT "createdAt", "id", "message", "userId" FROM "GuestbookEntry";
DROP TABLE "GuestbookEntry";
ALTER TABLE "new_GuestbookEntry" RENAME TO "GuestbookEntry";
CREATE INDEX "GuestbookEntry_createdAt_idx" ON "GuestbookEntry"("createdAt");
CREATE INDEX "GuestbookEntry_tripId_idx" ON "GuestbookEntry"("tripId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
