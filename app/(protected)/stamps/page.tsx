import Link from "next/link";
import { RetroWindow } from "@/components/RetroWindow";
import { StampBadge } from "@/components/StampBadge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StampsPage() {
  const user = await requireUser();

  const [trips, unlockedStamps] = await Promise.all([
    prisma.trip.findMany({
      where: { published: true },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        location: true,
        startDate: true,
        endDate: true,
        badgeName: true,
        stampLabel: true
      }
    }),
    prisma.tripStamp.findMany({
      where: { userId: user.id },
      select: { tripId: true }
    })
  ]);

  const unlocked = new Set(unlockedStamps.map((stamp) => stamp.tripId));

  return (
    <div className="stack">
      <RetroWindow title="Stamps Cabinet">
        <p>Every trip creates a stamp. Members unlock stamps by signing each trip&apos;s guestbook.</p>
        <p className="meta">
          Unlocked {unlocked.size}/{trips.length}
        </p>
      </RetroWindow>

      <div className="card-list">
        {trips.map((trip) => {
          const stampUnlocked = unlocked.has(trip.id);

          return (
            <article key={trip.id} className="card">
              <h2>{trip.title}</h2>
              <p className="meta">
                {trip.location} :: {trip.startDate.toLocaleDateString()} - {trip.endDate.toLocaleDateString()}
              </p>
              <StampBadge label={trip.stampLabel} subtitle={trip.badgeName} unlocked={stampUnlocked} />
              <p className="meta">{stampUnlocked ? "Unlocked via trip guestbook." : "Locked until guestbook sign-in."}</p>
              <Link href={`/trips/${trip.slug}`}>Open Trip Guestbook</Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
