import { MapMonitorScene } from "@/components/map/MapMonitorScene";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function MapPage() {
  const user = await requireUser();

  const trips = await prisma.trip.findMany({
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
      missionStatus: true
    }
  });

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

  return <MapMonitorScene trips={tripPins} username={user.username} />;
}
