import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';
import { StampBadge } from '@/components/StampBadge';

export default async function TripDetail({ params }: { params: { slug: string } }) {
  const trip = await prisma.trip.findUnique({ where: { slug: params.slug } });
  if (!trip) notFound();
  return <PrivateShell><RetroWindow title={trip.title}><p>{trip.story}</p><StampBadge label={trip.badgeName} /></RetroWindow></PrivateShell>;
}
