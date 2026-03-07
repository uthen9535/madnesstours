import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ET_TRANSMISSIONS,
  MEMBER_SCENARIOS,
  MILITARY_TRANSMISSIONS,
  pickNonRepeatingIndex,
  transmissionAudioSrc,
  type BreachMode
} from "@/lib/shortwaveTransmissions";

export type SystemAttackBroadcastEvent = {
  id: string;
  mode: BreachMode;
  message: string;
  index: number;
  audioSrc: string;
  createdAt: number;
  emitterUsername: string;
};

const MODE_POOL: Record<BreachMode, readonly string[]> = {
  military: MILITARY_TRANSMISSIONS,
  et: ET_TRANSMISSIONS,
  member: MEMBER_SCENARIOS
};

const lastIndexByMode: Record<BreachMode, number | null> = {
  military: null,
  et: null,
  member: null
};

let ensureTablePromise: Promise<void> | null = null;
let latestBroadcastCache: SystemAttackBroadcastEvent | null = null;
let latestBroadcastCacheFetchedAt = 0;
const BROADCAST_CACHE_TTL_MS = Number(process.env.SYSTEM_ATTACK_CACHE_TTL_MS ?? 3000);

type BroadcastRow = {
  id: string;
  mode: BreachMode;
  message: string;
  index: number;
  audioSrc: string;
  createdAt: number | bigint | string;
  emitterUsername: string;
};

function isRetryableSqliteWriteError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("sqlite_busy") || message.includes("database is locked");
}

async function withSqliteRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableSqliteWriteError(error) || index === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (index + 1)));
    }
  }

  throw lastError;
}

async function ensureBroadcastTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await withSqliteRetry(() =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "SystemAttackBroadcastEvent" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "mode" TEXT NOT NULL,
            "message" TEXT NOT NULL,
            "index" INTEGER NOT NULL,
            "audioSrc" TEXT NOT NULL,
            "createdAt" INTEGER NOT NULL,
            "emitterUsername" TEXT NOT NULL
          )
        `)
      );
      await withSqliteRetry(() =>
        prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "SystemAttackBroadcastEvent_createdAt_idx"
          ON "SystemAttackBroadcastEvent" ("createdAt")
        `)
      );
      await withSqliteRetry(() =>
        prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "SystemAttackBroadcastEvent_mode_createdAt_idx"
          ON "SystemAttackBroadcastEvent" ("mode", "createdAt")
        `)
      );
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  await ensureTablePromise;
}

function createId() {
  return randomBytes(12).toString("hex");
}

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizeSinceEpochSeconds(since?: number): number | undefined {
  if (typeof since !== "number" || !Number.isFinite(since)) {
    return undefined;
  }

  // Support older clients that still send millisecond timestamps.
  if (since > 10_000_000_000) {
    return Math.floor(since / 1000);
  }

  return Math.floor(since);
}

function cacheBroadcast(event: SystemAttackBroadcastEvent | null) {
  latestBroadcastCache = event;
  latestBroadcastCacheFetchedAt = Date.now();
}

function cacheIsFresh() {
  return Date.now() - latestBroadcastCacheFetchedAt <= BROADCAST_CACHE_TTL_MS;
}

function toEvent(row: BroadcastRow): SystemAttackBroadcastEvent {
  const createdAt = Number(row.createdAt);
  if (!Number.isFinite(createdAt)) {
    throw new Error("Invalid system attack event timestamp.");
  }

  return {
    id: row.id,
    mode: row.mode,
    message: row.message,
    index: row.index,
    audioSrc: row.audioSrc,
    createdAt,
    emitterUsername: row.emitterUsername
  };
}

export async function issueSystemAttackBroadcast(mode: BreachMode, emitterUsername: string): Promise<SystemAttackBroadcastEvent> {
  await ensureBroadcastTable();

  const latestForMode = await withSqliteRetry(() =>
    prisma.$queryRaw<Pick<BroadcastRow, "index">[]>`
      SELECT "index"
      FROM "SystemAttackBroadcastEvent"
      WHERE "mode" = ${mode}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );

  const pool = MODE_POOL[mode];
  const lastIndex = latestForMode[0]?.index ?? lastIndexByMode[mode];
  const index = pickNonRepeatingIndex(pool.length, lastIndex);
  lastIndexByMode[mode] = index;

  const event: SystemAttackBroadcastEvent = {
    id: createId(),
    mode,
    message: pool[index] ?? pool[0] ?? "Signal corruption detected.",
    index,
    audioSrc: transmissionAudioSrc(mode, index),
    // Keep DB values in 32-bit integer range for providers that map INTEGER to INT.
    createdAt: nowEpochSeconds(),
    emitterUsername: emitterUsername.toLowerCase()
  };

  await withSqliteRetry(() =>
    prisma.$executeRaw`
      INSERT INTO "SystemAttackBroadcastEvent" (
        "id", "mode", "message", "index", "audioSrc", "createdAt", "emitterUsername"
      )
      VALUES (
        ${event.id}, ${event.mode}, ${event.message}, ${event.index}, ${event.audioSrc}, ${event.createdAt}, ${event.emitterUsername}
      )
    `
  );

  // Keep this table lean.
  await withSqliteRetry(() =>
    prisma.$executeRawUnsafe(`
      DELETE FROM "SystemAttackBroadcastEvent"
      WHERE "id" NOT IN (
        SELECT "id"
        FROM "SystemAttackBroadcastEvent"
        ORDER BY "createdAt" DESC
        LIMIT 100
      )
    `)
  );

  cacheBroadcast(event);

  return event;
}

export async function getLatestSystemAttackBroadcast(since?: number): Promise<SystemAttackBroadcastEvent | null> {
  const normalizedSince = normalizeSinceEpochSeconds(since);
  if (latestBroadcastCache && cacheIsFresh()) {
    if (typeof normalizedSince === "number" && latestBroadcastCache.createdAt <= normalizedSince) {
      return null;
    }
    return latestBroadcastCache;
  }

  await ensureBroadcastTable();

  const rows = await withSqliteRetry(() =>
    prisma.$queryRaw<BroadcastRow[]>`
      SELECT "id", "mode", "message", "index", "audioSrc", "createdAt", "emitterUsername"
      FROM "SystemAttackBroadcastEvent"
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  const latestEvent = rows[0];
  if (!latestEvent) {
    cacheBroadcast(null);
    return null;
  }

  const latestCreatedAt = Number(latestEvent.createdAt);
  if (!Number.isFinite(latestCreatedAt)) {
    return null;
  }

  if (typeof normalizedSince === "number" && latestCreatedAt <= normalizedSince) {
    cacheBroadcast(toEvent(latestEvent));
    return null;
  }

  const event = {
    ...toEvent(latestEvent),
    createdAt: latestCreatedAt
  };
  cacheBroadcast(event);
  return event;
}
