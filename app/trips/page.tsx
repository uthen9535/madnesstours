import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';
import { StampBadge } from '@/components/StampBadge';

export default async function TripsPage() {
  const trips = await prisma.trip.findMany({ orderBy: { createdAt: 'desc' } });
  return <PrivateShell><RetroWindow title="Trips">{trips.map(t=><div key={t.id}><Link href={`/trips/${t.slug}`}>{t.title}</Link> <StampBadge label={t.badgeName} /></div>)}</RetroWindow></PrivateShell>;
}
