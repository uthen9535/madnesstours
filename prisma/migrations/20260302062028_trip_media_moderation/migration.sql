-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MediaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'IMAGE',
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tripId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "approvedById" TEXT,
    CONSTRAINT "MediaItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaItem_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MediaItem" ("createdAt", "description", "id", "title", "type", "uploadedById", "url") SELECT "createdAt", "description", "id", "title", "type", "uploadedById", "url" FROM "MediaItem";
DROP TABLE "MediaItem";
ALTER TABLE "new_MediaItem" RENAME TO "MediaItem";
CREATE INDEX "MediaItem_tripId_idx" ON "MediaItem"("tripId");
CREATE INDEX "MediaItem_approved_idx" ON "MediaItem"("approved");
CREATE INDEX "MediaItem_tripId_approved_idx" ON "MediaItem"("tripId", "approved");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
