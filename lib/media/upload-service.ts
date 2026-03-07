import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  MediaAssetScope,
  MediaAssetStatus,
  MediaUploadSessionStatus,
  type MediaAsset,
  type MediaAssetKind,
  type MediaUploadSession
} from "@prisma/client";
import {
  DEFAULT_UPLOAD_CHUNK_BYTES,
  MAX_UPLOAD_CHUNKS,
  type MediaAssetDto,
  type MediaAssetScopeValue,
  inferMediaKind,
  isAllowedMediaKind,
  maxBytesForKind,
  sanitizeUploadFilename
} from "@/lib/media/shared";
import { processUploadedMedia, titleFromOriginalFilename } from "@/lib/media/pipeline";
import { deleteStoragePrefix, mediaStorageJoin, readStorageObject, storageUrlForKey, writeStorageObject } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";
import { withSqliteRetry } from "@/lib/sqliteRetry";

type CreateUploadSessionInput = {
  uploaderId: string;
  scope: MediaAssetScopeValue;
  scopeRef?: string | null;
  tripId?: string | null;
  tourSlug?: string | null;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  title?: string | null;
  description?: string | null;
  chunkSizeBytes?: number;
};

type StoreUploadChunkInput = {
  sessionId: string;
  uploaderId: string;
  chunkIndex: number;
  totalChunks: number;
  bytes: Buffer;
};

type FinalizeUploadSessionInput = {
  sessionId: string;
  uploaderId: string;
};

type MediaAssetWithUploader = MediaAsset & {
  uploader: {
    id: string;
    username: string;
    displayName: string;
  };
};

const SESSION_TTL_HOURS = 24;
const MAINTENANCE_INTERVAL_MS = Number(process.env.MEDIA_MAINTENANCE_INTERVAL_MS ?? 60_000);
const STALE_PROCESSING_REQUEUE_MS = Number(process.env.MEDIA_STALE_PROCESSING_REQUEUE_MS ?? 2 * 60 * 1000);
const PROCESSING_HEARTBEAT_INTERVAL_MS = Number(process.env.MEDIA_PROCESSING_HEARTBEAT_INTERVAL_MS ?? 30_000);
const STALE_ORPHAN_UPLOADING_MS = Number(process.env.MEDIA_STALE_ORPHAN_UPLOADING_MS ?? 60 * 60 * 1000);
const STALE_UPLOADING_SESSION_FAIL_MS = Number(process.env.MEDIA_STALE_UPLOADING_SESSION_FAIL_MS ?? 45 * 60 * 1000);
const STALE_TERMINAL_SESSION_CLEANUP_MS = Number(process.env.MEDIA_STALE_TERMINAL_SESSION_CLEANUP_MS ?? 6 * 60 * 60 * 1000);
const inFlightSessionIds = new Set<string>();
const inFlightAssetIds = new Set<string>();
let lastMaintenanceRunAt = 0;
let maintenancePromise: Promise<void> | null = null;

function normalizeExtension(filename: string, fileType: MediaAssetKind): string {
  const direct = extname(filename).toLowerCase();
  if (direct && /^\.[a-z0-9]{1,8}$/.test(direct)) {
    return direct;
  }

  if (fileType === "VIDEO") {
    return ".mp4";
  }

  if (fileType === "GIF") {
    return ".gif";
  }

  return ".jpg";
}

function toScope(value: MediaAssetScopeValue): MediaAssetScope {
  return value as MediaAssetScope;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500) || "Media processing failed.";
  }

  return "Media processing failed.";
}

async function createSessionTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "madness-upload-session-"));
}

function assertSessionWritable(session: Pick<MediaUploadSession, "status" | "expiresAt">) {
  if (session.expiresAt.getTime() < Date.now()) {
    throw new Error("Upload session expired. Please retry upload.");
  }

  if (session.status !== MediaUploadSessionStatus.UPLOADING) {
    throw new Error("Upload session is no longer accepting chunks.");
  }
}

function toMediaAssetDto(asset: MediaAssetWithUploader): MediaAssetDto {
  return {
    id: asset.id,
    scope: asset.scope,
    scopeRef: asset.scopeRef,
    tourSlug: asset.tourSlug,
    uploaderId: asset.uploader.id,
    uploaderUsername: asset.uploader.username,
    uploaderDisplayName: asset.uploader.displayName,
    fileType: asset.fileType,
    status: asset.status,
    title: asset.title ?? titleFromOriginalFilename(asset.originalFilename),
    description: asset.description,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    fileSizeBytes: asset.fileSizeBytes,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    storageUrl: asset.storageUrl,
    thumbnailUrl: asset.thumbnailUrl,
    cardUrl: asset.cardUrl,
    mediumUrl: asset.mediumUrl,
    largeUrl: asset.largeUrl,
    modalUrl: asset.modalUrl,
    fullUrl: asset.fullUrl,
    posterUrl: asset.posterUrl,
    previewUrl: asset.previewUrl,
    playbackUrl: asset.playbackUrl,
    errorMessage: asset.errorMessage,
    createdAt: asset.createdAt.getTime()
  };
}

async function markSessionFailedAndCleanup(
  input: {
    sessionId: string;
    assetId: string;
    reason: string;
  }
): Promise<void> {
  await withSqliteRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.mediaUploadSession.updateMany({
        where: {
          id: input.sessionId,
          status: {
            in: [MediaUploadSessionStatus.UPLOADING, MediaUploadSessionStatus.PROCESSING, MediaUploadSessionStatus.FAILED]
          }
        },
        data: {
          status: MediaUploadSessionStatus.FAILED,
          errorMessage: input.reason
        }
      });

      await tx.mediaAsset.updateMany({
        where: {
          id: input.assetId,
          deletedAt: null,
          status: {
            in: [MediaAssetStatus.UPLOADING, MediaAssetStatus.PROCESSING, MediaAssetStatus.FAILED]
          }
        },
        data: {
          status: MediaAssetStatus.FAILED,
          errorMessage: input.reason
        }
      });

      await tx.mediaUploadChunk.deleteMany({
        where: {
          sessionId: input.sessionId
        }
      });
    })
  );

  await deleteStoragePrefix(mediaStorageJoin("chunks", input.sessionId));
}

async function cleanupExpiredSessions(now: Date): Promise<void> {
  const expired = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findMany({
      where: {
        status: {
          in: [MediaUploadSessionStatus.UPLOADING, MediaUploadSessionStatus.PROCESSING]
        },
        expiresAt: {
          lt: now
        }
      },
      select: {
        id: true,
        assetId: true,
        status: true
      },
      take: 200
    })
  );

  for (const session of expired) {
    const reason =
      session.status === MediaUploadSessionStatus.UPLOADING
        ? "Upload session expired before finalize."
        : "Media processing timed out. Please retry reprocess.";

    try {
      await markSessionFailedAndCleanup({
        sessionId: session.id,
        assetId: session.assetId,
        reason
      });
    } catch (error) {
      console.error("media pipeline maintenance: failed expiring upload session", {
        sessionId: session.id,
        assetId: session.assetId,
        error
      });
    }
  }
}

async function cleanupStaleUploadingSessions(now: Date): Promise<void> {
  const threshold = new Date(now.getTime() - STALE_UPLOADING_SESSION_FAIL_MS);
  const stale = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findMany({
      where: {
        status: MediaUploadSessionStatus.UPLOADING,
        updatedAt: {
          lt: threshold
        },
        expiresAt: {
          gt: now
        }
      },
      select: {
        id: true,
        assetId: true,
        receivedChunks: true,
        totalChunks: true
      },
      take: 200
    })
  );

  for (const session of stale) {
    const reason =
      session.receivedChunks === 0
        ? "Upload never started. Please retry upload."
        : session.receivedChunks >= session.totalChunks
          ? "Upload stalled before finalize. Please retry upload."
          : "Upload stalled while receiving chunks. Please retry upload.";

    try {
      await markSessionFailedAndCleanup({
        sessionId: session.id,
        assetId: session.assetId,
        reason
      });
    } catch (error) {
      console.error("media pipeline maintenance: failed stale uploading session cleanup", {
        sessionId: session.id,
        assetId: session.assetId,
        error
      });
    }
  }
}

async function cleanupOrphanAssets(now: Date): Promise<void> {
  const threshold = new Date(now.getTime() - STALE_ORPHAN_UPLOADING_MS);
  await withSqliteRetry(() =>
    prisma.mediaAsset.updateMany({
      where: {
        deletedAt: null,
        status: {
          in: [MediaAssetStatus.UPLOADING, MediaAssetStatus.PROCESSING]
        },
        createdAt: {
          lt: threshold
        },
        uploadSession: {
          is: null
        }
      },
      data: {
        status: MediaAssetStatus.FAILED,
        errorMessage: "Upload session missing. Please retry upload."
      }
    })
  );
}

async function cleanupTerminalSessionChunks(now: Date): Promise<void> {
  const threshold = new Date(now.getTime() - STALE_TERMINAL_SESSION_CLEANUP_MS);
  const terminalSessions = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findMany({
      where: {
        status: {
          in: [MediaUploadSessionStatus.COMPLETE, MediaUploadSessionStatus.FAILED, MediaUploadSessionStatus.CANCELED]
        },
        updatedAt: {
          lt: threshold
        },
        chunks: {
          some: {}
        }
      },
      select: {
        id: true
      },
      take: 200
    })
  );

  for (const session of terminalSessions) {
    try {
      await withSqliteRetry(() =>
        prisma.mediaUploadChunk.deleteMany({
          where: {
            sessionId: session.id
          }
        })
      );
      await deleteStoragePrefix(mediaStorageJoin("chunks", session.id));
    } catch (error) {
      console.error("media pipeline maintenance: failed terminal chunk cleanup", {
        sessionId: session.id,
        error
      });
    }
  }
}

async function reviveStaleProcessingSessions(now: Date): Promise<void> {
  const staleThreshold = new Date(now.getTime() - STALE_PROCESSING_REQUEUE_MS);
  const stale = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findMany({
      where: {
        status: MediaUploadSessionStatus.PROCESSING,
        updatedAt: {
          lt: staleThreshold
        },
        expiresAt: {
          gt: now
        }
      },
      select: {
        id: true,
        assetId: true,
        totalChunks: true,
        updatedAt: true,
        _count: {
          select: {
            chunks: true
          }
        },
        asset: {
          select: {
            status: true,
            deletedAt: true
          }
        }
      },
      take: 120
    })
  );

  for (const session of stale) {
    if (session.asset.deletedAt) {
      continue;
    }

    if (session.asset.status === MediaAssetStatus.READY) {
      await withSqliteRetry(() =>
        prisma.mediaUploadSession.updateMany({
          where: {
            id: session.id,
            status: MediaUploadSessionStatus.PROCESSING
          },
          data: {
            status: MediaUploadSessionStatus.COMPLETE,
            completedAt: new Date(),
            errorMessage: null
          }
        })
      );
      continue;
    }

    if (session._count.chunks !== session.totalChunks) {
      await markSessionFailedAndCleanup({
        sessionId: session.id,
        assetId: session.assetId,
        reason: "Upload chunks missing during processing. Please retry upload."
      });
      continue;
    }

    console.warn("media pipeline maintenance: re-queueing stale processing session", {
      sessionId: session.id,
      assetId: session.assetId,
      staleUpdatedAt: session.updatedAt.toISOString()
    });
    queueSessionProcessing(session.id);
  }
}

export async function runMediaPipelineMaintenanceNow(): Promise<void> {
  const now = new Date();
  await cleanupExpiredSessions(now);
  await cleanupStaleUploadingSessions(now);
  await cleanupOrphanAssets(now);
  await cleanupTerminalSessionChunks(now);
  await reviveStaleProcessingSessions(now);
}

export async function runMediaPipelineMaintenanceIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastMaintenanceRunAt < MAINTENANCE_INTERVAL_MS) {
    return;
  }

  if (maintenancePromise) {
    await maintenancePromise;
    return;
  }

  lastMaintenanceRunAt = now;
  maintenancePromise = runMediaPipelineMaintenanceNow()
    .catch((error) => {
      console.error("media pipeline maintenance failed", error);
    })
    .finally(() => {
      maintenancePromise = null;
    });
  await maintenancePromise;
}

export async function createMediaUploadSession(input: CreateUploadSessionInput): Promise<{
  sessionId: string;
  assetId: string;
  fileType: MediaAssetKind;
  chunkSizeBytes: number;
  totalChunks: number;
  expiresAt: number;
}> {
  await runMediaPipelineMaintenanceIfDue();

  const filename = sanitizeUploadFilename(input.filename);
  const fileType = inferMediaKind({ mimeType: input.mimeType, filename }) as MediaAssetKind;

  if (!isAllowedMediaKind(fileType)) {
    throw new Error("Unsupported media type. Upload images, GIFs, or videos.");
  }

  const maxBytes = maxBytesForKind(fileType);
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0 || input.fileSizeBytes > maxBytes) {
    throw new Error(`File exceeds limit for ${fileType.toLowerCase()} uploads.`);
  }

  const chunkSizeBytes = Math.max(64 * 1024, Math.min(input.chunkSizeBytes ?? DEFAULT_UPLOAD_CHUNK_BYTES, 2 * 1024 * 1024));
  const totalChunks = Math.ceil(input.fileSizeBytes / chunkSizeBytes);
  if (totalChunks <= 0 || totalChunks > MAX_UPLOAD_CHUNKS) {
    throw new Error("File requires too many chunks. Reduce file size.");
  }

  const openSessionCount = await withSqliteRetry(() =>
    prisma.mediaUploadSession.count({
      where: {
        uploaderId: input.uploaderId,
        status: {
          in: [MediaUploadSessionStatus.UPLOADING, MediaUploadSessionStatus.PROCESSING]
        }
      }
    })
  );
  if (openSessionCount >= 1200) {
    throw new Error("Too many active uploads. Wait for current queue to finish.");
  }

  const sessionId = randomUUID();
  const assetId = randomUUID();
  const extension = normalizeExtension(filename, fileType);
  const storageKey = mediaStorageJoin("assets", assetId, `original${extension}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await withSqliteRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.mediaAsset.create({
        data: {
          id: assetId,
          scope: toScope(input.scope),
          scopeRef: input.scopeRef ?? null,
          tripId: input.tripId ?? null,
          tourSlug: input.tourSlug ?? null,
          uploaderId: input.uploaderId,
          fileType,
          status: MediaAssetStatus.UPLOADING,
          title: input.title?.trim() || titleFromOriginalFilename(filename),
          description: input.description?.trim() || null,
          originalFilename: filename,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          storageKey,
          storageUrl: storageUrlForKey(storageKey)
        }
      });

      await tx.mediaUploadSession.create({
        data: {
          id: sessionId,
          assetId,
          uploaderId: input.uploaderId,
          scope: toScope(input.scope),
          scopeRef: input.scopeRef ?? null,
          tourSlug: input.tourSlug ?? null,
          fileType,
          originalFilename: filename,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          chunkSizeBytes,
          totalChunks,
          receivedChunks: 0,
          status: MediaUploadSessionStatus.UPLOADING,
          expiresAt
        }
      });
    })
  );

  return {
    sessionId,
    assetId,
    fileType,
    chunkSizeBytes,
    totalChunks,
    expiresAt: expiresAt.getTime()
  };
}

export async function storeMediaUploadChunk(input: StoreUploadChunkInput): Promise<{ receivedChunks: number; totalChunks: number }> {
  await runMediaPipelineMaintenanceIfDue();

  if (!Number.isInteger(input.chunkIndex) || input.chunkIndex < 0) {
    throw new Error("Invalid chunk index.");
  }

  if (!Number.isInteger(input.totalChunks) || input.totalChunks <= 0 || input.totalChunks > MAX_UPLOAD_CHUNKS) {
    throw new Error("Invalid chunk count.");
  }

  if (input.bytes.length <= 0) {
    throw new Error("Empty chunk payload.");
  }

  const session = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        uploaderId: true,
        status: true,
        expiresAt: true,
        totalChunks: true,
        receivedChunks: true
      }
    })
  );

  if (!session || session.uploaderId !== input.uploaderId) {
    throw new Error("Upload session not found.");
  }

  assertSessionWritable(session);

  if (session.totalChunks !== input.totalChunks || input.chunkIndex >= session.totalChunks) {
    throw new Error("Chunk metadata does not match upload session.");
  }

  const storageKey = mediaStorageJoin("chunks", session.id, `${String(input.chunkIndex).padStart(6, "0")}.part`);
  await writeStorageObject(storageKey, input.bytes);

  const receivedChunks = await withSqliteRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.mediaUploadChunk.upsert({
        where: {
          sessionId_chunkIndex: {
            sessionId: session.id,
            chunkIndex: input.chunkIndex
          }
        },
        update: {
          sizeBytes: input.bytes.length,
          storageKey
        },
        create: {
          sessionId: session.id,
          chunkIndex: input.chunkIndex,
          sizeBytes: input.bytes.length,
          storageKey
        }
      });

      const chunkCount = await tx.mediaUploadChunk.count({
        where: {
          sessionId: session.id
        }
      });

      await tx.mediaUploadSession.update({
        where: { id: session.id },
        data: {
          receivedChunks: chunkCount
        }
      });

      return chunkCount;
    })
  );

  return {
    receivedChunks,
    totalChunks: session.totalChunks
  };
}

async function assembleChunksToTempFile(sessionId: string, chunks: Array<{ storageKey: string; chunkIndex: number }>): Promise<{ tempDir: string; filePath: string }> {
  const tempDir = await createSessionTempDir();
  const filePath = join(tempDir, `assembled-${sessionId}.bin`);
  const stream = createWriteStream(filePath);

  try {
    for (const chunk of chunks) {
      const bytes = await readStorageObject(chunk.storageKey);
      if (!stream.write(bytes)) {
        await once(stream, "drain");
      }
    }

    stream.end();
    await once(stream, "finish");
    return { tempDir, filePath };
  } catch (error) {
    stream.destroy();
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function runProcessingForSession(sessionId: string): Promise<void> {
  const session = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findUnique({
      where: { id: sessionId },
      include: {
        asset: true,
        chunks: {
          orderBy: {
            chunkIndex: "asc"
          }
        }
      }
    })
  );

  if (!session) {
    return;
  }

  if (session.status === MediaUploadSessionStatus.COMPLETE || session.status === MediaUploadSessionStatus.CANCELED) {
    return;
  }

  if (session.asset.deletedAt) {
    await withSqliteRetry(() =>
      prisma.$transaction(async (tx) => {
        await tx.mediaUploadSession.updateMany({
          where: {
            id: session.id,
            status: {
              in: [MediaUploadSessionStatus.UPLOADING, MediaUploadSessionStatus.PROCESSING, MediaUploadSessionStatus.FAILED]
            }
          },
          data: {
            status: MediaUploadSessionStatus.CANCELED,
            errorMessage: "Media deleted."
          }
        });
        await tx.mediaUploadChunk.deleteMany({
          where: {
            sessionId: session.id
          }
        });
      })
    );
    await deleteStoragePrefix(mediaStorageJoin("chunks", session.id));
    return;
  }

  if (session.chunks.length !== session.totalChunks) {
    throw new Error("Upload chunks are incomplete.");
  }

  const heartbeat = async () => {
    try {
      await withSqliteRetry(() =>
        prisma.mediaUploadSession.updateMany({
          where: {
            id: session.id,
            status: MediaUploadSessionStatus.PROCESSING
          },
          data: {
            errorMessage: null
          }
        })
      );
    } catch (error) {
      console.error("media pipeline heartbeat failed", {
        sessionId: session.id,
        error
      });
    }
  };

  await heartbeat();
  const heartbeatTimer = setInterval(() => {
    void heartbeat();
  }, PROCESSING_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();
  let assembled: { tempDir: string; filePath: string } | null = null;
  try {
    assembled = await assembleChunksToTempFile(
      session.id,
      session.chunks.map((chunk) => ({ storageKey: chunk.storageKey, chunkIndex: chunk.chunkIndex }))
    );

    const payload = await processUploadedMedia({
      assetId: session.assetId,
      fileType: session.fileType,
      sourceFilePath: assembled.filePath,
      originalFilename: session.originalFilename
    });

    await withSqliteRetry(() =>
      prisma.$transaction(async (tx) => {
        await tx.mediaAsset.update({
          where: { id: session.assetId },
          data: {
            status: MediaAssetStatus.READY,
            errorMessage: null,
            fileSizeBytes: payload.fileSizeBytes,
            storageKey: payload.storageKey,
            storageUrl: payload.storageUrl,
            width: payload.width,
            height: payload.height,
            durationMs: payload.durationMs,
            thumbnailKey: payload.thumbnailKey,
            thumbnailUrl: payload.thumbnailUrl,
            cardKey: payload.cardKey,
            cardUrl: payload.cardUrl,
            mediumKey: payload.mediumKey,
            mediumUrl: payload.mediumUrl,
            largeKey: payload.largeKey,
            largeUrl: payload.largeUrl,
            modalKey: payload.modalKey,
            modalUrl: payload.modalUrl,
            fullKey: payload.fullKey,
            fullUrl: payload.fullUrl,
            posterKey: payload.posterKey,
            posterUrl: payload.posterUrl,
            previewKey: payload.previewKey,
            previewUrl: payload.previewUrl,
            playbackKey: payload.playbackKey,
            playbackUrl: payload.playbackUrl,
            derivatives: payload.derivatives,
            processedAt: new Date()
          }
        });

        await tx.mediaUploadSession.update({
          where: { id: session.id },
          data: {
            status: MediaUploadSessionStatus.COMPLETE,
            completedAt: new Date(),
            errorMessage: null
          }
        });

        await tx.mediaUploadChunk.deleteMany({
          where: {
            sessionId: session.id
          }
        });
      })
    );

    await deleteStoragePrefix(mediaStorageJoin("chunks", session.id));
  } finally {
    clearInterval(heartbeatTimer);
    if (assembled) {
      await rm(assembled.tempDir, { recursive: true, force: true });
    }
  }
}

function queueSessionProcessing(sessionId: string) {
  if (inFlightSessionIds.has(sessionId)) {
    return;
  }

  inFlightSessionIds.add(sessionId);
  void (async () => {
    try {
      await runProcessingForSession(sessionId);
    } catch (error) {
      console.error("media pipeline processing failed", {
        sessionId,
        error
      });
      const message = sanitizeErrorMessage(error);
      const session = await withSqliteRetry(() =>
        prisma.mediaUploadSession.findUnique({
          where: { id: sessionId },
          select: {
            assetId: true
          }
        })
      );
      if (session) {
        await markSessionFailedAndCleanup({
          sessionId,
          assetId: session.assetId,
          reason: message
        });
      }
    } finally {
      inFlightSessionIds.delete(sessionId);
    }
  })();
}

export async function finalizeMediaUploadSession(input: FinalizeUploadSessionInput): Promise<{ assetId: string }> {
  await runMediaPipelineMaintenanceIfDue();

  const session = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        uploaderId: true,
        assetId: true,
        status: true,
        expiresAt: true,
        totalChunks: true,
        receivedChunks: true
      }
    })
  );

  if (!session || session.uploaderId !== input.uploaderId) {
    throw new Error("Upload session not found.");
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw new Error("Upload session expired. Please retry.");
  }

  if (session.status === MediaUploadSessionStatus.COMPLETE) {
    return { assetId: session.assetId };
  }

  if (session.status === MediaUploadSessionStatus.CANCELED) {
    throw new Error("Upload session was canceled.");
  }

  if (session.status === MediaUploadSessionStatus.PROCESSING) {
    return { assetId: session.assetId };
  }

  if (session.receivedChunks !== session.totalChunks) {
    throw new Error("Upload chunks are incomplete.");
  }

  const storedChunkCount = await withSqliteRetry(() =>
    prisma.mediaUploadChunk.count({
      where: {
        sessionId: session.id
      }
    })
  );

  if (storedChunkCount !== session.totalChunks) {
    throw new Error("Upload chunks are incomplete.");
  }

  await withSqliteRetry(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.mediaUploadSession.updateMany({
        where: {
          id: session.id,
          status: {
            in: [MediaUploadSessionStatus.UPLOADING, MediaUploadSessionStatus.FAILED]
          }
        },
        data: {
          status: MediaUploadSessionStatus.PROCESSING,
          receivedChunks: storedChunkCount,
          errorMessage: null
        }
      });

      if (updated.count === 0) {
        const current = await tx.mediaUploadSession.findUnique({
          where: {
            id: session.id
          },
          select: {
            status: true
          }
        });

        if (!current || current.status === MediaUploadSessionStatus.CANCELED) {
          throw new Error("Upload session was canceled.");
        }

        if (current.status === MediaUploadSessionStatus.COMPLETE || current.status === MediaUploadSessionStatus.PROCESSING) {
          return;
        }

        throw new Error("Upload session is not ready to finalize.");
      }

      await tx.mediaAsset.updateMany({
        where: {
          id: session.assetId,
          deletedAt: null
        },
        data: {
          status: MediaAssetStatus.PROCESSING,
          errorMessage: null
        }
      });
    })
  );

  queueSessionProcessing(session.id);

  return {
    assetId: session.assetId
  };
}

async function tryRecoverAssetProcessing(assetId: string): Promise<void> {
  const session = await withSqliteRetry(() =>
    prisma.mediaUploadSession.findUnique({
      where: {
        assetId
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        totalChunks: true,
        receivedChunks: true,
        updatedAt: true
      }
    })
  );

  if (!session) {
    return;
  }

  if (session.status === MediaUploadSessionStatus.COMPLETE || session.status === MediaUploadSessionStatus.CANCELED) {
    return;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    return;
  }

  if (session.status === MediaUploadSessionStatus.UPLOADING) {
    return;
  }

  if (session.receivedChunks !== session.totalChunks) {
    return;
  }

  const isStale = session.updatedAt.getTime() < Date.now() - STALE_PROCESSING_REQUEUE_MS;
  if (!isStale) {
    return;
  }

  console.warn("media pipeline status recovery: re-queueing stale asset processing", {
    assetId,
    sessionId: session.id,
    updatedAt: session.updatedAt.toISOString()
  });
  queueSessionProcessing(session.id);
}

export async function getMediaAssetStatus(assetId: string, uploaderId: string): Promise<MediaAssetDto | null> {
  await runMediaPipelineMaintenanceIfDue();
  await tryRecoverAssetProcessing(assetId);

  const asset = await withSqliteRetry(() =>
    prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        uploaderId,
        deletedAt: null
      },
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    })
  );

  if (!asset) {
    return null;
  }

  return toMediaAssetDto(asset);
}

export async function getMediaAssetByIdForViewer(assetId: string): Promise<MediaAssetDto | null> {
  await runMediaPipelineMaintenanceIfDue();
  await tryRecoverAssetProcessing(assetId);

  const asset = await withSqliteRetry(() =>
    prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null
      },
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    })
  );

  if (!asset) {
    return null;
  }

  return toMediaAssetDto(asset);
}

export async function listScopeMediaAssets(scope: MediaAssetScopeValue, scopeRef: string | null, take = 200): Promise<MediaAssetDto[]> {
  await runMediaPipelineMaintenanceIfDue();

  const items = await withSqliteRetry(() =>
    prisma.mediaAsset.findMany({
      where: {
        scope: toScope(scope),
        scopeRef: scopeRef ?? null,
        deletedAt: null,
        status: MediaAssetStatus.READY
      },
      orderBy: {
        createdAt: "desc"
      },
      take,
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    })
  );

  return items.map(toMediaAssetDto);
}

export async function deleteMediaAsset(assetId: string): Promise<void> {
  const asset = await withSqliteRetry(() =>
    prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        uploadSession: {
          select: {
            id: true
          }
        }
      }
    })
  );

  if (!asset) {
    return;
  }

  await withSqliteRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: {
          deletedAt: new Date(),
          status: MediaAssetStatus.FAILED,
          errorMessage: "Deleted by moderation."
        }
      });

      if (asset.uploadSession?.id) {
        await tx.mediaUploadSession.updateMany({
          where: {
            id: asset.uploadSession.id,
            status: {
              in: [MediaUploadSessionStatus.UPLOADING, MediaUploadSessionStatus.PROCESSING, MediaUploadSessionStatus.FAILED]
            }
          },
          data: {
            status: MediaUploadSessionStatus.CANCELED,
            errorMessage: "Media deleted."
          }
        });

        await tx.mediaUploadChunk.deleteMany({
          where: {
            sessionId: asset.uploadSession.id
          }
        });
      }
    })
  );

  await Promise.all([
    deleteStoragePrefix(mediaStorageJoin("assets", asset.id)),
    asset.uploadSession ? deleteStoragePrefix(mediaStorageJoin("chunks", asset.uploadSession.id)) : Promise.resolve()
  ]);
}

async function runReprocess(assetId: string): Promise<void> {
  const asset = await withSqliteRetry(() =>
    prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        fileType: true,
        originalFilename: true,
        storageKey: true,
        status: true,
        deletedAt: true
      }
    })
  );

  if (!asset || asset.deletedAt) {
    return;
  }

  await withSqliteRetry(() =>
    prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: MediaAssetStatus.PROCESSING,
        errorMessage: null
      }
    })
  );

  const tempDir = await createSessionTempDir();
  const extension = normalizeExtension(asset.originalFilename, asset.fileType);
  const sourcePath = join(tempDir, `reprocess${extension}`);

  try {
    const originalBytes = await readStorageObject(asset.storageKey);
    await writeFile(sourcePath, originalBytes);

    const payload = await processUploadedMedia({
      assetId: asset.id,
      fileType: asset.fileType,
      originalFilename: asset.originalFilename,
      sourceFilePath: sourcePath
    });

    await withSqliteRetry(() =>
      prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: MediaAssetStatus.READY,
          errorMessage: null,
          fileSizeBytes: payload.fileSizeBytes,
          storageKey: payload.storageKey,
          storageUrl: payload.storageUrl,
          width: payload.width,
          height: payload.height,
          durationMs: payload.durationMs,
          thumbnailKey: payload.thumbnailKey,
          thumbnailUrl: payload.thumbnailUrl,
          cardKey: payload.cardKey,
          cardUrl: payload.cardUrl,
          mediumKey: payload.mediumKey,
          mediumUrl: payload.mediumUrl,
          largeKey: payload.largeKey,
          largeUrl: payload.largeUrl,
          modalKey: payload.modalKey,
          modalUrl: payload.modalUrl,
          fullKey: payload.fullKey,
          fullUrl: payload.fullUrl,
          posterKey: payload.posterKey,
          posterUrl: payload.posterUrl,
          previewKey: payload.previewKey,
          previewUrl: payload.previewUrl,
          playbackKey: payload.playbackKey,
          playbackUrl: payload.playbackUrl,
          derivatives: payload.derivatives,
          processedAt: new Date()
        }
      })
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function queueMediaReprocess(assetId: string): void {
  if (inFlightAssetIds.has(assetId)) {
    return;
  }

  inFlightAssetIds.add(assetId);
  void (async () => {
    try {
      await runReprocess(assetId);
    } catch (error) {
      console.error("media reprocess failed", {
        assetId,
        error
      });
      const message = sanitizeErrorMessage(error);
      await withSqliteRetry(() =>
        prisma.mediaAsset.update({
          where: { id: assetId },
          data: {
            status: MediaAssetStatus.FAILED,
            errorMessage: message
          }
        })
      );
    } finally {
      inFlightAssetIds.delete(assetId);
    }
  })();
}
