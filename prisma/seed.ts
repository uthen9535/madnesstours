import bcrypt from "bcryptjs";
import { PrismaClient, BlogCategory, MediaType, Role, TripMissionStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const globalSitePin = process.env.GLOBAL_SITE_PIN ?? "170017";
  const sharedPasswordHash = await bcrypt.hash(globalSitePin, 12);

  await prisma.tripStamp.deleteMany();
  await prisma.guestbookEntry.deleteMany();
  await prisma.mediaItem.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.session.deleteMany();
  await prisma.hitCounter.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      username: "sysop",
      pin: globalSitePin,
      passwordHash: sharedPasswordHash,
      pinResetComplete: false,
      btcSats: 100_000_000,
      ethUnits: 100_000_000,
      role: Role.admin,
      displayName: "SysOp Nova",
      bio: "Keeper of neon tubes, keeper of tours."
    }
  });

  const member = await prisma.user.create({
    data: {
      username: "traveler",
      pin: globalSitePin,
      passwordHash: sharedPasswordHash,
      pinResetComplete: false,
      btcSats: 100_000_000,
      ethUnits: 100_000_000,
      role: Role.civilian,
      displayName: "Traveler Byte",
      bio: "Collecting stamps across the pixel globe."
    }
  });

  const trip1 = await prisma.trip.create({
    data: {
      slug: "madness-i-lake-powell",
      title: "Madness I: Lake Powell",
      location: "Lake Powell, USA",
      summary: "Houseboat circuits, canyon echoes, and midnight synth sessions.",
      content:
        "# Madness I: Lake Powell\n\nThe mascot launched at sunrise and unlocked the first tour stamp between red-rock coves.",
      startDate: new Date("2025-05-11"),
      endDate: new Date("2025-05-16"),
      mapX: 23,
      mapY: 45,
      latitude: 36.998,
      longitude: -111.484,
      missionStatus: TripMissionStatus.MISSION_COMPLETE,
      badgeName: "Canyon Wave Rider",
      stampLabel: "MAD-I"
    }
  });

  const trip2 = await prisma.trip.create({
    data: {
      slug: "madness-ii-carribean-cruise",
      title: "Madness II: Carribean Cruise",
      location: "Caribbean Sea",
      summary: "Deck-top arcade nights with salt-air neon and tropical glitch sunsets.",
      content:
        "# Madness II: Carribean Cruise\n\nOpen-water side quests unlocked our second badge while the modem battled ocean weather.",
      startDate: new Date("2025-08-02"),
      endDate: new Date("2025-08-09"),
      mapX: 33,
      mapY: 56,
      latitude: 18.2208,
      longitude: -66.5901,
      missionStatus: TripMissionStatus.MISSION_COMPLETE,
      badgeName: "Neon Tide Captain",
      stampLabel: "MAD-II"
    }
  });

  const trip3 = await prisma.trip.create({
    data: {
      slug: "madness-iii-bali",
      title: "Madness III: Bali",
      location: "Bali, Indonesia",
      summary: "Temple trails, surf breaks, and a final mascot ascension quest.",
      content:
        "# Madness III: Bali\n\nThe final chapter unlocked with sunrise ritual beats and a rooftop terminal drop.",
      startDate: new Date("2025-11-14"),
      endDate: new Date("2025-11-22"),
      mapX: 79,
      mapY: 62,
      latitude: -8.3405,
      longitude: 115.092,
      missionStatus: TripMissionStatus.MISSION_OBJECTIVE,
      badgeName: "Island Glitch Oracle",
      stampLabel: "MAD-III"
    }
  });

  await prisma.tripStamp.create({
    data: {
      userId: member.id,
      tripId: trip1.id
    }
  });

  await prisma.blogPost.createMany({
    data: [
      {
        slug: "btc-bunker-notes",
        title: "BTC Bunker Notes",
        excerpt: "Tracking sats while the tour bus crosses state lines.",
        content: "# BTC Bunker Notes\n\nThe chain keeps moving even when the modem screams.",
        category: BlogCategory.BTC,
        published: true,
        authorId: admin.id
      },
      {
        slug: "cyberpunk-after-midnight",
        title: "Cyberpunk After Midnight",
        excerpt: "CRT bloom, rain streaks, and neon static.",
        content: "# Cyberpunk After Midnight\n\nEnable overlay mode and let the scanlines sing.",
        category: BlogCategory.CYBERPUNK,
        published: true,
        authorId: admin.id
      },
      {
        slug: "wild-topics-cassette-prophecy",
        title: "Wild Topics: Cassette Prophecy",
        excerpt: "The mascot discovered a forgotten tape in the vault.",
        content: "# Cassette Prophecy\n\nA strange synth pulse points to the next map unlock.",
        category: BlogCategory.WILD_TOPICS,
        published: true,
        authorId: admin.id
      }
    ]
  });

  await prisma.mediaItem.createMany({
    data: [
      {
        title: "Tour Bus Pixel Collage",
        description: "Digitized postcard from the Lake Powell route.",
        url: "https://images.unsplash.com/photo-1518186285589-2f7649de83e0",
        type: MediaType.IMAGE,
        uploadedById: admin.id
      },
      {
        title: "Arcade Noise Session",
        description: "Optional ambience loop for vault listeners.",
        url: "https://archive.org/download/testmp3testfile/mpthreetest.mp3",
        type: MediaType.AUDIO,
        uploadedById: admin.id
      }
    ]
  });

  await prisma.guestbookEntry.createMany({
    data: [
      {
        userId: member.id,
        tripId: trip1.id,
        message: "Live chat test: reporting from Lake Powell basecamp."
      },
      {
        userId: admin.id,
        message: "SysOp note: chat is live, no approval queue."
      },
      {
        userId: member.id,
        tripId: trip3.id,
        message: "Bali route unlocked, mascot ready."
      }
    ]
  });

  await prisma.hitCounter.create({
    data: {
      id: 1,
      count: 1024
    }
  });

  console.log("Seeded MadnessNet.");
  console.log(`Admin login: sysop / ${globalSitePin}`);
  console.log(`Member login: traveler / ${globalSitePin}`);
  console.log(`Trips: ${trip1.slug}, ${trip2.slug}, ${trip3.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
