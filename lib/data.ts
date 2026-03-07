import { BlogCategory, TripMissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const blogCategoryLabels: Record<BlogCategory, string> = {
  BTC: "BTC",
  CYBERPUNK: "Cyberpunk",
  TRAVEL: "Travel",
  WILD_TOPICS: "Wild Topics"
};

export async function incrementAndGetHitCounter(): Promise<number> {
  try {
    const counter = await prisma.hitCounter.upsert({
      where: { id: 1 },
      update: { count: { increment: 1 } },
      create: { id: 1, count: 1 }
    });

    return counter.count;
  } catch (error) {
    console.warn("Hit counter increment failed; returning current value without write.", error);

    try {
      const existing = await prisma.hitCounter.findUnique({
        where: { id: 1 },
        select: { count: true }
      });

      return existing?.count ?? 0;
    } catch (readError) {
      console.warn("Hit counter read fallback failed.", readError);
      return 0;
    }
  }
}

export async function getPublishedPosts() {
  return prisma.blogPost.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" }
  });
}

export async function getPublishedPostBySlug(slug: string) {
  return prisma.blogPost.findFirst({
    where: { slug, published: true },
    include: { author: true }
  });
}

export async function getPublishedTrips() {
  return prisma.trip.findMany({
    where: { published: true },
    orderBy: { startDate: "desc" }
  });
}

export async function getPublishedTripBySlug(slug: string) {
  return prisma.trip.findFirst({
    where: { slug, published: true }
  });
}

export type NextMissionObjective = {
  title: string;
  startDate: Date;
} | null;

export async function getNextMissionObjective(): Promise<NextMissionObjective> {
  try {
    const now = new Date();
    const next = await prisma.trip.findFirst({
      where: {
        published: true,
        missionStatus: TripMissionStatus.MISSION_OBJECTIVE,
        startDate: {
          gte: now
        }
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      select: {
        title: true,
        startDate: true
      }
    });

    if (!next) {
      return null;
    }

    return {
      title: next.title,
      startDate: next.startDate
    };
  } catch (error) {
    console.warn("Mission objective lookup failed.", error);
    return null;
  }
}

export async function getGuestbookMessages() {
  return prisma.guestbookEntry.findMany({
    where: { tripId: null },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          username: true,
          displayName: true
        }
      }
    }
  });
}
