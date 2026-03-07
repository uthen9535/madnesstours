-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE', 'GIF', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaAssetScope" AS ENUM ('TOUR', 'MEME', 'RELIC_VAULT', 'MEMBER_UPLOAD', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaUploadSessionStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'COMPLETE', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "scope" "MediaAssetScope" NOT NULL,
    "scopeRef" TEXT,
    "tripId" TEXT,
    "tourSlug" TEXT,
    "uploaderId" TEXT NOT NULL,
    "fileType" "MediaAssetKind" NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "title" TEXT,
    "description" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "thumbnailKey" TEXT,
    "thumbnailUrl" TEXT,
    "cardKey" TEXT,
    "cardUrl" TEXT,
    "mediumKey" TEXT,
    "mediumUrl" TEXT,
    "largeKey" TEXT,
    "largeUrl" TEXT,
    "modalKey" TEXT,
    "modalUrl" TEXT,
    "fullKey" TEXT,
    "fullUrl" TEXT,
    "posterKey" TEXT,
    "posterUrl" TEXT,
    "previewKey" TEXT,
    "previewUrl" TEXT,
    "playbackKey" TEXT,
    "playbackUrl" TEXT,
    "derivatives" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaUploadSession" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "scope" "MediaAssetScope" NOT NULL,
    "scopeRef" TEXT,
    "tourSlug" TEXT,
    "fileType" "MediaAssetKind" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "chunkSizeBytes" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "receivedChunks" INTEGER NOT NULL DEFAULT 0,
    "status" "MediaUploadSessionStatus" NOT NULL DEFAULT 'UPLOADING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MediaUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaUploadChunk" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUploadChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_scope_scopeRef_createdAt_idx" ON "MediaAsset"("scope", "scopeRef", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_tripId_createdAt_idx" ON "MediaAsset"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_tourSlug_createdAt_idx" ON "MediaAsset"("tourSlug", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_uploaderId_createdAt_idx" ON "MediaAsset"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_status_createdAt_idx" ON "MediaAsset"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_deletedAt_idx" ON "MediaAsset"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaUploadSession_assetId_key" ON "MediaUploadSession"("assetId");

-- CreateIndex
CREATE INDEX "MediaUploadSession_uploaderId_createdAt_idx" ON "MediaUploadSession"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaUploadSession_status_createdAt_idx" ON "MediaUploadSession"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MediaUploadSession_expiresAt_idx" ON "MediaUploadSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaUploadChunk_sessionId_chunkIndex_key" ON "MediaUploadChunk"("sessionId", "chunkIndex");

-- CreateIndex
CREATE INDEX "MediaUploadChunk_sessionId_createdAt_idx" ON "MediaUploadChunk"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUploadSession" ADD CONSTRAINT "MediaUploadSession_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUploadSession" ADD CONSTRAINT "MediaUploadSession_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUploadChunk" ADD CONSTRAINT "MediaUploadChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MediaUploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
