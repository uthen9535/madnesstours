import Link from "next/link";
import { RetroWindow } from "@/components/RetroWindow";
import { StampBadge } from "@/components/StampBadge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function TripsPage() {
  const user = await requireUser();

  const [trips, userStamps] = await Promise.all([
    prisma.trip.findMany({ where: { published: true }, orderBy: { startDate: "desc" } }),
    prisma.tripStamp.findMany({ where: { userId: user.id }, select: { tripId: true } })
  ]);

  const unlocked = new Set(userStamps.map((stamp) => stamp.tripId));

  return (
    <RetroWindow title="Trips Archive">
      <div className="card-list">
        {trips.map((trip) => (
          <article key={trip.id} className="card">
            <h2>{trip.title}</h2>
            <p className="meta">
              {trip.location} :: {trip.startDate.toLocaleDateString()} - {trip.endDate.toLocaleDateString()}
            </p>
            <p>{trip.summary}</p>
            <div className="tag-row">
              <StampBadge
                label={trip.stampLabel}
                subtitle={trip.badgeName}
                unlocked={unlocked.has(trip.id)}
              />
            </div>
            <Link href={`/trips/${trip.slug}`}>Open Trip</Link>
          </article>
        ))}
      </div>
    </RetroWindow>
  );
}
