import { BlogCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const blogCategoryLabels: Record<BlogCategory, string> = {
  BTC: "BTC",
  CYBERPUNK: "Cyberpunk",
  TRAVEL: "Travel",
  WILD_TOPICS: "Wild Topics"
};

export async function incrementAndGetHitCounter(): Promise<number> {
  const counter = await prisma.hitCounter.upsert({
    where: { id: 1 },
    update: { count: { increment: 1 } },
    create: { id: 1, count: 1 }
  });

  return counter.count;
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
