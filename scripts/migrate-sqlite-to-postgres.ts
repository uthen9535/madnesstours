import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  BlogCategory,
  MediaType,
  PrismaClient,
  Role,
  TripMissionStatus,
  UserStatus
} from "@prisma/client";

type JsonRow = Record<string, unknown>;

const sqliteDbPath = path.join(process.cwd(), "prisma", "dev.db");
const prisma = new PrismaClient();

function runSqliteJsonQuery(query: string): JsonRow[] {
  const raw = execFileSync("sqlite3", ["-json", sqliteDbPath, query], {
    encoding: "utf8"
  }).trim();

  if (!raw) {
    return [];
  }

  return JSON.parse(raw) as JsonRow[];
}

function normalizeDateInput(value: unknown): number | string {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }

  return String(value ?? "");
}

function toDate(value: unknown): Date {
  return new Date(normalizeDateInput(value));
}

function toOptionalDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(normalizeDateInput(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return false;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const next = String(value ?? "");
  return allowed.includes(next as T) ? (next as T) : fallback;
}

async function main() {
  const users = runSqliteJsonQuery('SELECT * FROM "User" ORDER BY "createdAt" ASC');
  const trips = runSqliteJsonQuery('SELECT * FROM "Trip" ORDER BY "createdAt" ASC');
  const posts = runSqliteJsonQuery('SELECT * FROM "BlogPost" ORDER BY "createdAt" ASC');
  const guestbook = runSqliteJsonQuery('SELECT * FROM "GuestbookEntry" ORDER BY "createdAt" ASC');
  const tripStamps = runSqliteJsonQuery('SELECT * FROM "TripStamp" ORDER BY "unlockedAt" ASC');
  const mediaItems = runSqliteJsonQuery('SELECT * FROM "MediaItem" ORDER BY "createdAt" ASC');
  const satDrops = runSqliteJsonQuery('SELECT * FROM "SatoshiDrop" ORDER BY "createdAt" ASC');
  const ethDrops = runSqliteJsonQuery('SELECT * FROM "EthDrop" ORDER BY "createdAt" ASC');
  const sessions = runSqliteJsonQuery('SELECT * FROM "Session" ORDER BY "createdAt" ASC');
  const hitCounter = runSqliteJsonQuery('SELECT * FROM "HitCounter"');

  await prisma.$transaction([
    prisma.satoshiDrop.deleteMany(),
    prisma.ethDrop.deleteMany(),
    prisma.session.deleteMany(),
    prisma.guestbookEntry.deleteMany(),
    prisma.tripStamp.deleteMany(),
    prisma.mediaItem.deleteMany(),
    prisma.blogPost.deleteMany(),
    prisma.trip.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hitCounter.deleteMany()
  ]);

  if (users.length > 0) {
    await prisma.user.createMany({
      data: users.map((row) => ({
        id: String(row.id),
        username: String(row.username),
        passwordHash: String(row.passwordHash),
        pin: String(row.pin ?? "170017"),
        pinResetComplete: toBoolean(row.pinResetComplete),
        role: asEnum(String(row.role), Object.values(Role), Role.civilian),
        status: asEnum(String(row.status), Object.values(UserStatus), UserStatus.ALIVE),
        operations: String(row.operations ?? ""),
        displayName: String(row.displayName),
        bio: row.bio ? String(row.bio) : null,
        btcSats: Number(row.btcSats ?? 0),
        ethUnits: Number(row.ethUnits ?? 0),
        lastSeenAt: toOptionalDate(row.lastSeenAt),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      }))
    });
  }

  if (trips.length > 0) {
    await prisma.trip.createMany({
      data: trips.map((row) => ({
        id: String(row.id),
        slug: String(row.slug),
        title: String(row.title),
        location: String(row.location),
        summary: String(row.summary),
        content: String(row.content),
        startDate: toDate(row.startDate),
        endDate: toDate(row.endDate),
        mapX: Number(row.mapX ?? 50),
        mapY: Number(row.mapY ?? 50),
        latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
        longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
        missionStatus: asEnum(String(row.missionStatus), Object.values(TripMissionStatus), TripMissionStatus.MISSION_COMPLETE),
        badgeName: String(row.badgeName),
        stampLabel: String(row.stampLabel),
        published: toBoolean(row.published),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
      }))
    });
  }

  if (posts.length > 0) {
    await prisma.blogPost.createMany({
      data: posts.map((row) => ({
        id: String(row.id),
        slug: String(row.slug),
        title: String(row.title),
        excerpt: row.excerpt ? String(row.excerpt) : null,
        content: String(row.content),
        category: asEnum(String(row.category), Object.values(BlogCategory), BlogCategory.BTC),
        published: toBoolean(row.published),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt),
        authorId: String(row.authorId)
      }))
    });
  }

  if (guestbook.length > 0) {
    await prisma.guestbookEntry.createMany({
      data: guestbook.map((row) => ({
        id: String(row.id),
        userId: String(row.userId),
        tripId: row.tripId ? String(row.tripId) : null,
        message: String(row.message),
        createdAt: toDate(row.createdAt)
      }))
    });
  }

  if (tripStamps.length > 0) {
    await prisma.tripStamp.createMany({
      data: tripStamps.map((row) => ({
        id: String(row.id),
        userId: String(row.userId),
        tripId: String(row.tripId),
        unlockedAt: toDate(row.unlockedAt)
      }))
    });
  }

  if (mediaItems.length > 0) {
    await prisma.mediaItem.createMany({
      data: mediaItems.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        description: row.description ? String(row.description) : null,
        url: String(row.url),
        type: asEnum(String(row.type), Object.values(MediaType), MediaType.IMAGE),
        approved: toBoolean(row.approved),
        approvedAt: toOptionalDate(row.approvedAt),
        createdAt: toDate(row.createdAt),
        tripId: row.tripId ? String(row.tripId) : null,
        uploadedById: String(row.uploadedById),
        approvedById: row.approvedById ? String(row.approvedById) : null
      }))
    });
  }

  if (satDrops.length > 0) {
    await prisma.satoshiDrop.createMany({
      data: satDrops.map((row) => ({
        id: String(row.id),
        senderId: String(row.senderId),
        receiverId: row.receiverId ? String(row.receiverId) : null,
        messageId: String(row.messageId),
        amountSats: Number(row.amountSats ?? 0),
        createdAt: toDate(row.createdAt),
        claimedAt: toOptionalDate(row.claimedAt)
      }))
    });
  }

  if (ethDrops.length > 0) {
    await prisma.ethDrop.createMany({
      data: ethDrops.map((row) => ({
        id: String(row.id),
        senderId: String(row.senderId),
        receiverId: row.receiverId ? String(row.receiverId) : null,
        messageId: String(row.messageId),
        amountUnits: Number(row.amountUnits ?? 0),
        createdAt: toDate(row.createdAt),
        claimedAt: toOptionalDate(row.claimedAt)
      }))
    });
  }

  if (sessions.length > 0) {
    await prisma.session.createMany({
      data: sessions.map((row) => ({
        id: String(row.id),
        tokenHash: String(row.tokenHash),
        userId: String(row.userId),
        expiresAt: toDate(row.expiresAt),
        createdAt: toDate(row.createdAt)
      }))
    });
  }

  if (hitCounter.length > 0) {
    await prisma.hitCounter.createMany({
      data: hitCounter.map((row) => ({
        id: Number(row.id),
        count: Number(row.count ?? 0),
        updatedAt: toDate(row.updatedAt)
      }))
    });
  }

  console.log("SQLite data migrated to Postgres.");
  console.log(`users=${users.length} trips=${trips.length} posts=${posts.length} messages=${guestbook.length}`);
}

main()
  .catch((error) => {
    console.error("Migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
