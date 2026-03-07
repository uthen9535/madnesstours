import Link from "next/link";
import { MediaAssetKind, MediaAssetStatus, MediaType } from "@prisma/client";
import { RetroWindow } from "@/components/RetroWindow";
import { StampBadge } from "@/components/StampBadge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ORIGINAL_MEDIA_ASSET_URL_PATTERN = /\/uploads\/media\/assets\/[^/]+\/original\.[a-z0-9]+(?:$|[?#])/i;

function isOriginalMediaAssetUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && ORIGINAL_MEDIA_ASSET_URL_PATTERN.test(url);
}

export default async function ToursPage() {
  const user = await requireUser();

  const [trips, userStamps] = await Promise.all([
    prisma.trip.findMany({ where: { published: true }, orderBy: { startDate: "desc" } }),
    prisma.tripStamp.findMany({ where: { userId: user.id }, select: { tripId: true } })
  ]);
  const tripIds = trips.map((trip) => trip.id);
  const [coverMarkers, fallbackCoverImages, fallbackAssetImages] =
    tripIds.length > 0
      ? await Promise.all([
          prisma.mediaItem.findMany({
            where: {
              tripId: { in: tripIds },
              type: MediaType.OTHER,
              title: "__trip_cover__"
            },
            select: {
              tripId: true,
              url: true
            }
          }),
          prisma.mediaItem.findMany({
            where: {
              tripId: { in: tripIds },
              type: MediaType.IMAGE
            },
            orderBy: { createdAt: "desc" },
            select: {
              tripId: true,
              url: true
            }
          }),
          prisma.mediaAsset.findMany({
            where: {
              tripId: { in: tripIds },
              deletedAt: null,
              status: MediaAssetStatus.READY,
              fileType: { in: [MediaAssetKind.IMAGE, MediaAssetKind.GIF] }
            },
            orderBy: { createdAt: "desc" },
            select: {
              tripId: true,
              cardUrl: true,
              thumbnailUrl: true
            }
          })
        ])
      : [[], [], []];
  const coverByTripId = new Map<string, string>();
  for (const item of fallbackAssetImages) {
    if (!item.tripId || coverByTripId.has(item.tripId)) {
      continue;
    }
    const coverUrl = item.cardUrl ?? item.thumbnailUrl;
    if (!coverUrl) {
      continue;
    }
    coverByTripId.set(item.tripId, coverUrl);
  }
  for (const item of coverMarkers) {
    if (!item.tripId) {
      continue;
    }
    if (isOriginalMediaAssetUrl(item.url) && coverByTripId.has(item.tripId)) {
      continue;
    }
    coverByTripId.set(item.tripId, item.url);
  }
  for (const item of fallbackCoverImages) {
    if (!item.tripId || coverByTripId.has(item.tripId)) {
      continue;
    }
    coverByTripId.set(item.tripId, item.url);
  }

  const unlocked = new Set(userStamps.map((stamp) => stamp.tripId));

  return (
    <div className="tours-page-layout">
      <section className="tours-page-main">
        <div className="tours-hero-strip">
          <img
            src="/tours/madness-iii-group-photo.jpg"
            alt="Madness Tours members gathered together on a boat"
            className="tours-hero-strip__image"
          />
        </div>
        <RetroWindow title="Tour Archive">
          <div className="card-list tours-archive-cards">
            {trips.map((trip) => (
              <article key={trip.id} className="card tours-archive-card">
                {coverByTripId.get(trip.id) ? (
                  <img
                    src={coverByTripId.get(trip.id)}
                    alt={`${trip.title} cover`}
                    className="trip-preview-cover"
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={360}
                  />
                ) : null}
                <h2>{trip.title}</h2>
                <p className="meta">
                  {trip.location} :: {trip.startDate.toLocaleDateString()} - {trip.endDate.toLocaleDateString()}
                </p>
                <p className="tours-archive-card__summary">{trip.summary}</p>
                <div className="tours-archive-card__footer">
                  <div className="tag-row">
                    <StampBadge
                      label={trip.stampLabel}
                      subtitle="Madness Punch"
                      unlocked={unlocked.has(trip.id)}
                    />
                  </div>
                  <Link href={`/tours/${trip.slug}`} className="neon-button card-cta-button">
                    Open Tour
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </RetroWindow>
      </section>

      <aside className="tours-page-rail">
        <RetroWindow title="Tour Signal Rail">
          <p className="meta">Right-side rail reserved for incoming tour modules.</p>
        </RetroWindow>
      </aside>
    </div>
  );
}
