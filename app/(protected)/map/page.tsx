import { CyberpunkTripMap } from "@/components/CyberpunkTripMap";
import { RetroWindow } from "@/components/RetroWindow";
import { StampBadge } from "@/components/StampBadge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function MapPage() {
  const user = await requireUser();

  const [trips, stamps] = await Promise.all([
    prisma.trip.findMany({
      where: { published: true },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        location: true,
        mapX: true,
        mapY: true,
        latitude: true,
        longitude: true,
        missionStatus: true,
        stampLabel: true,
        badgeName: true
      }
    }),
    prisma.tripStamp.findMany({ where: { userId: user.id }, select: { tripId: true } })
  ]);

  const unlocked = new Set(stamps.map((stamp) => stamp.tripId));
  const tripPins = trips.map((trip) => ({
    id: trip.id,
    slug: trip.slug,
    title: trip.title,
    location: trip.location,
    mapX: trip.mapX,
    mapY: trip.mapY,
    latitude: trip.latitude,
    longitude: trip.longitude,
    missionStatus: trip.missionStatus
  }));

  return (
    <div className="stack">
      <RetroWindow title="Earth Map" className="map-window">
        <p>Pink dots are mission complete trips. Green dots with live pulse are mission objectives.</p>
        <CyberpunkTripMap trips={tripPins} />
      </RetroWindow>

      <RetroWindow title="Travel Stamps">
        <div className="stamp-grid">
          {trips.map((trip) => (
            <StampBadge
              key={trip.id}
              label={trip.stampLabel}
              subtitle={trip.badgeName}
              unlocked={unlocked.has(trip.id)}
            />
          ))}
        </div>
      </RetroWindow>
    </div>
  );
}
