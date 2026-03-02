import { PrismaClient, Role, PostCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.userBadge.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.mediaItem.deleteMany();
  await prisma.guestbookEntry.deleteMany();
  await prisma.post.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.user.deleteMany();

  const [adminHash, memberHash] = await Promise.all([
    bcrypt.hash('admin123', 12),
    bcrypt.hash('member123', 12)
  ]);

  const admin = await prisma.user.create({ data: { username: 'admin', displayName: 'SysOp Nova', passwordHash: adminHash, role: Role.ADMIN, bio: 'Keeper of neon archives.' } });
  const member = await prisma.user.create({ data: { username: 'member', displayName: 'Rider Byte', passwordHash: memberHash, role: Role.MEMBER, bio: 'Tour map speedrunner.' } });

  const badges = await Promise.all([
    prisma.badge.create({ data: { name: 'Neo Tokyo Stamp', icon: '🗼' } }),
    prisma.badge.create({ data: { name: 'Lunar Desert Stamp', icon: '🌙' } })
  ]);

  await prisma.userBadge.create({ data: { userId: member.id, badgeId: badges[0].id } });

  await prisma.post.createMany({ data: [
    { title: 'BTC Night Watch', slug: 'btc-night-watch', content: '## BTC\nWatching blocks in the midnight terminal.', category: PostCategory.BTC, published: true, authorId: admin.id },
    { title: 'Cyber Rain Overdrive', slug: 'cyber-rain-overdrive', content: 'Glitch skies and chrome streets.', category: PostCategory.CYBERPUNK, published: true, authorId: admin.id },
    { title: 'Madness Tour Log', slug: 'madness-tour-log', content: 'Next stop on the map is **wild**.', category: PostCategory.TRAVEL, published: true, authorId: member.id }
  ]});

  await prisma.trip.createMany({ data: [
    { title: 'Neon Sprint: Neo Tokyo', slug: 'neo-tokyo', destination: 'Neo Tokyo', summary: 'Arcade alleys and ramen hubs.', story: 'Mascot unlocked the neon kanji stamp.', stamp: 'tokyo', badgeName: 'Neo Tokyo Stamp' },
    { title: 'Dune Glide: Lunar Desert', slug: 'lunar-desert', destination: 'Lunar Desert', summary: 'Moonlit dunes and synth storms.', story: 'Mascot earned the lunar drift badge.', stamp: 'lunar', badgeName: 'Lunar Desert Stamp' }
  ]});

  await prisma.guestbookEntry.createMany({ data: [
    { guestName: 'CircuitFox', message: 'MadnessNet rules the night!', approved: true, authorId: member.id },
    { guestName: 'GlitchKid', message: 'Awaiting approval from the SysOp.', approved: false },
    { guestName: 'NeonWanderer', message: 'Trip badges are 🔥', approved: true }
  ]});

  await prisma.mediaItem.create({ data: { title: 'Tour Poster v1', description: 'Promo poster metadata entry', url: 'https://example.com/poster-v1.png', uploadedBy: admin.id } });
}

main().finally(async () => prisma.$disconnect());
