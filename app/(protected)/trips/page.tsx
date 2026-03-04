import Link from "next/link";
import { revalidatePath } from "next/cache";
import { TripMissionStatus } from "@prisma/client";
import { RetroWindow } from "@/components/RetroWindow";
import { StampBadge } from "@/components/StampBadge";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function updateTrip(formData: FormData) {
  "use server";

  await requireAdmin();

  const tripId = String(formData.get("tripId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const mapX = Number(formData.get("mapX") ?? 50);
  const mapY = Number(formData.get("mapY") ?? 50);
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const missionStatus = String(formData.get("missionStatus") ?? TripMissionStatus.MISSION_COMPLETE).trim();

  if (!tripId || !title || !location || !summary || !content) {
    return;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return;
  }

  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;

  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    return;
  }

  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    return;
  }

  if (!Object.values(TripMissionStatus).includes(missionStatus as TripMissionStatus)) {
    return;
  }

  const trip = await prisma.trip.update({
    where: { id: tripId },
    data: {
      title,
      location,
      summary,
      content,
      startDate: start,
      endDate: end,
      mapX: Number.isFinite(mapX) ? mapX : 50,
      mapY: Number.isFinite(mapY) ? mapY : 50,
      latitude,
      longitude,
      missionStatus: missionStatus as TripMissionStatus
    },
    select: { slug: true }
  });

  revalidatePath("/trips");
  revalidatePath("/map");
  revalidatePath("/stamps");
  revalidatePath("/home");
  revalidatePath(`/trips/${trip.slug}`);
}

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
            {user.role === "admin" ? (
              <form action={updateTrip} className="form-grid admin-trip-edit">
                <input type="hidden" name="tripId" value={trip.id} />
                <label>
                  Name
                  <input name="title" defaultValue={trip.title} required />
                </label>
                <label>
                  Location
                  <input name="location" defaultValue={trip.location} required />
                </label>
                <label>
                  Brief
                  <input name="summary" defaultValue={trip.summary} required />
                </label>
                <label>
                  Start Date
                  <input name="startDate" type="date" defaultValue={toDateInputValue(trip.startDate)} required />
                </label>
                <label>
                  End Date
                  <input name="endDate" type="date" defaultValue={toDateInputValue(trip.endDate)} required />
                </label>
                <label>
                  Map X
                  <input name="mapX" type="number" min={0} max={100} defaultValue={trip.mapX} required />
                </label>
                <label>
                  Map Y
                  <input name="mapY" type="number" min={0} max={100} defaultValue={trip.mapY} required />
                </label>
                <label>
                  Latitude
                  <input
                    name="latitude"
                    type="number"
                    min={-90}
                    max={90}
                    step="any"
                    defaultValue={trip.latitude ?? ""}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="longitude"
                    type="number"
                    min={-180}
                    max={180}
                    step="any"
                    defaultValue={trip.longitude ?? ""}
                  />
                </label>
                <label>
                  Mission Status
                  <select name="missionStatus" defaultValue={trip.missionStatus}>
                    <option value={TripMissionStatus.MISSION_COMPLETE}>Mission complete (pink)</option>
                    <option value={TripMissionStatus.MISSION_OBJECTIVE}>Mission objective (green live)</option>
                  </select>
                </label>
                <label>
                  Description
                  <textarea name="content" defaultValue={trip.content} required />
                </label>
                <button type="submit" className="neon-button">
                  Update Trip
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </RetroWindow>
  );
}
