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

type BroadcastRow = {
  id: string;
  mode: BreachMode;
  message: string;
  index: number;
  audioSrc: string;
  createdAt: number;
  emitterUsername: string;
};

async function ensureBroadcastTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SystemAttackBroadcastEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "mode" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "index" INTEGER NOT NULL,
          "audioSrc" TEXT NOT NULL,
          "createdAt" INTEGER NOT NULL,
          "emitterUsername" TEXT NOT NULL
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SystemAttackBroadcastEvent_createdAt_idx"
        ON "SystemAttackBroadcastEvent" ("createdAt")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SystemAttackBroadcastEvent_mode_createdAt_idx"
        ON "SystemAttackBroadcastEvent" ("mode", "createdAt")
      `);
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

function toEvent(row: BroadcastRow): SystemAttackBroadcastEvent {
  return {
    id: row.id,
    mode: row.mode,
    message: row.message,
    index: row.index,
    audioSrc: row.audioSrc,
    createdAt: Number(row.createdAt),
    emitterUsername: row.emitterUsername
  };
}

export async function issueSystemAttackBroadcast(mode: BreachMode, emitterUsername: string): Promise<SystemAttackBroadcastEvent> {
  await ensureBroadcastTable();

  const latestForMode = await prisma.$queryRaw<Pick<BroadcastRow, "index">[]>`
    SELECT "index"
    FROM "SystemAttackBroadcastEvent"
    WHERE "mode" = ${mode}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

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
    createdAt: Date.now(),
    emitterUsername: emitterUsername.toLowerCase()
  };

  await prisma.$executeRaw`
    INSERT INTO "SystemAttackBroadcastEvent" (
      "id", "mode", "message", "index", "audioSrc", "createdAt", "emitterUsername"
    )
    VALUES (
      ${event.id}, ${event.mode}, ${event.message}, ${event.index}, ${event.audioSrc}, ${event.createdAt}, ${event.emitterUsername}
    )
  `;

  // Keep this table lean.
  await prisma.$executeRawUnsafe(`
    DELETE FROM "SystemAttackBroadcastEvent"
    WHERE "id" NOT IN (
      SELECT "id"
      FROM "SystemAttackBroadcastEvent"
      ORDER BY "createdAt" DESC
      LIMIT 100
    )
  `);

  return event;
}

export async function getLatestSystemAttackBroadcast(since?: number): Promise<SystemAttackBroadcastEvent | null> {
  await ensureBroadcastTable();

  const rows = await prisma.$queryRaw<BroadcastRow[]>`
    SELECT "id", "mode", "message", "index", "audioSrc", "createdAt", "emitterUsername"
    FROM "SystemAttackBroadcastEvent"
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  const latestEvent = rows[0];
  if (!latestEvent) {
    return null;
  }

  if (typeof since === "number" && Number.isFinite(since) && latestEvent.createdAt <= since) {
    return null;
  }

  return toEvent(latestEvent);
}
