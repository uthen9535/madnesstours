-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_role_check" CHECK ("role" IN ('admin', 'member'))
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "authorId" TEXT NOT NULL,
    CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BlogPost_category_check" CHECK ("category" IN ('BTC', 'CYBERPUNK', 'TRAVEL', 'WILD_TOPICS'))
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "mapX" INTEGER NOT NULL,
    "mapY" INTEGER NOT NULL,
    "badgeName" TEXT NOT NULL,
    "stampLabel" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TripStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripStamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripStamp_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuestbookEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestbookEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'IMAGE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    CONSTRAINT "MediaItem_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaItem_type_check" CHECK ("type" IN ('IMAGE', 'VIDEO', 'AUDIO', 'OTHER'))
);

-- CreateTable
CREATE TABLE "HitCounter" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TripStamp_userId_tripId_key" ON "TripStamp"("userId", "tripId");

-- CreateIndex
CREATE INDEX "TripStamp_tripId_idx" ON "TripStamp"("tripId");

-- CreateIndex
CREATE INDEX "GuestbookEntry_createdAt_idx" ON "GuestbookEntry"("createdAt");
