import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const WIRED_WINDOW_MS = 120_000;

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
  punches: number;
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

  const [liveChatMessages, travelStamps, punchesDistinctTrips] = await Promise.all([
    prisma.guestbookEntry.count({
      where: {
        userId,
        tripId: null
      }
    }),
    prisma.tripStamp.count({
      where: { userId }
    }),
    prisma.guestbookEntry.findMany({
      where: {
        userId,
        tripId: { not: null }
      },
      select: { tripId: true },
      distinct: ["tripId"]
    })
  ]);

  const wired = Boolean(user.lastSeenAt && Date.now() - user.lastSeenAt.getTime() <= WIRED_WINDOW_MS);

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    statusLabel: getOperatorStatusLabel(user.status),
    wired,
    health: getOperatorHealth(user.status),
    operations: user.operations,
    btcSats: user.btcSats,
    ethUnits: user.ethUnits,
    liveChatMessages,
    travelStamps,
    punches: punchesDistinctTrips.length
  };
}
