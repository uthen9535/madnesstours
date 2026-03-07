import { UserStatus } from "@prisma/client";
import { buildPunchCountsByUserId } from "@/lib/punchCounts";
import { prisma } from "@/lib/prisma";

export const WIRED_WINDOW_MS = 120_000;

export function formatSurfacedLabel(lastSeenAt: Date | null): string {
  if (!lastSeenAt) {
    return "negative";
  }

  return lastSeenAt.toLocaleString();
}

export function getOperatorStatusLabel(status: UserStatus): string {
  switch (status) {
    case UserStatus.ALIVE:
      return "alive";
    case UserStatus.COMPROMISED:
      return "compromised";
    case UserStatus.ELIMINATED:
      return "eliminated";
    default:
      return "alive";
  }
}

export function getOperatorHealth(status: UserStatus): number {
  switch (status) {
    case UserStatus.ALIVE:
      return 100;
    case UserStatus.COMPROMISED:
      return 45;
    case UserStatus.ELIMINATED:
      return 10;
    default:
      return 100;
  }
}

export type OperatorDashboardData = {
  id: string;
  username: string;
  role: string;
  statusLabel: string;
  wired: boolean;
  health: number;
  operations: string;
  btcSats: number;
  ethUnits: number;
  liveChatMessages: number;
  travelStamps: number;
  punchesMad: number;
  punchesMay: number;
  surfacedLabel: string;
};

export async function getOperatorDashboardData(userId: string): Promise<OperatorDashboardData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      operations: true,
      btcSats: true,
      ethUnits: true,
      lastSeenAt: true
    }
  });

  if (!user) {
    return null;
  }

  const [liveChatMessages, madnessPunches, tripLogPunchEntries] = await Promise.all([
    prisma.guestbookEntry.count({
      where: {
        userId,
        tripId: null
      }
    }),
    prisma.tripStamp.findMany({
      where: { userId },
      select: { userId: true, tripId: true },
      distinct: ["userId", "tripId"]
    }),
    prisma.guestbookEntry.findMany({
      where: {
        userId,
        tripId: { not: null }
      },
      select: { userId: true, tripId: true, message: true }
    })
  ]);

  const userPunches = buildPunchCountsByUserId(madnessPunches, tripLogPunchEntries).get(userId) ?? { mad: 0, may: 0 };

  const wired = Boolean(user.lastSeenAt && Date.now() - user.lastSeenAt.getTime() <= WIRED_WINDOW_MS);

  return {
    id: user.id,
    username: user.username,
    role: user.role === "admin" ? "command" : user.role,
    statusLabel: getOperatorStatusLabel(user.status),
    wired,
    health: getOperatorHealth(user.status),
    operations: user.operations,
    btcSats: user.btcSats,
    ethUnits: user.ethUnits,
    liveChatMessages,
    travelStamps: 0,
    punchesMad: userPunches.mad,
    punchesMay: userPunches.may,
    surfacedLabel: formatSurfacedLabel(user.lastSeenAt)
  };
}
