import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { MediaType, TripMissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { NeonButton } from "@/components/NeonButton";
import { ProfileLink } from "@/components/ProfileLink";
import { RetroWindow } from "@/components/RetroWindow";
import { StampBadge } from "@/components/StampBadge";
import { TripMediaUploadDropzone } from "@/components/TripMediaUploadDropzone";
import { requireAdmin, requireUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { prisma } from "@/lib/prisma";

type TripPageProps = {
  params: Promise<{ slug: string }>;
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function sanitizeSlug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "upload";
}

function titleFromFileName(fileName: string): string {
  const nameWithoutExtension = basename(fileName, extname(fileName));
  const cleaned = sanitizeSlug(nameWithoutExtension);
  return cleaned
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function inferMediaType(file: File): MediaType | null {
  if (file.type.startsWith("image/")) {
    return MediaType.IMAGE;
  }

  if (file.type.startsWith("video/")) {
    return MediaType.VIDEO;
  }

  const lower = file.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(lower)) {
    return MediaType.IMAGE;
  }

  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lower)) {
    return MediaType.VIDEO;
  }

  return null;
}

function extensionFromFile(file: File): string {
  const direct = extname(file.name).toLowerCase();
  if (direct) {
    return direct;
  }

  if (file.type.startsWith("image/")) {
    return ".jpg";
  }

  if (file.type.startsWith("video/")) {
    return ".mp4";
  }

  return "";
}

async function postTripGuestbookEntry(formData: FormData) {
  "use server";

  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!slug || !message || message.length > 500) {
    return;
  }

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true },
    select: { id: true, slug: true }
  });

  if (!trip) {
    return;
  }

  await prisma.$transaction([
    prisma.guestbookEntry.create({
      data: {
        userId: user.id,
        tripId: trip.id,
        message
      }
    }),
    prisma.tripStamp.upsert({
      where: {
        userId_tripId: {
          userId: user.id,
          tripId: trip.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        tripId: trip.id
      }
    })
  ]);

  revalidatePath("/map");
  revalidatePath("/stamps");
  revalidatePath("/trips");
  revalidatePath("/home");
  revalidatePath(`/trips/${trip.slug}`);
}

async function uploadTripMedia(formData: FormData) {
  "use server";

  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!slug || files.length === 0) {
    return;
  }

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true },
    select: { id: true, slug: true }
  });

  if (!trip) {
    return;
  }

  const isAdmin = user.role === "admin";
  const storageSlug = sanitizeSlug(trip.slug);
  const uploadDir = join(process.cwd(), "public", "uploads", "trips", storageSlug);

  await mkdir(uploadDir, { recursive: true });

  const now = new Date();
  const mediaPayloads: Parameters<typeof prisma.mediaItem.create>[0]["data"][] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      continue;
    }

    const type = inferMediaType(file);
    if (!type) {
      continue;
    }

    const extension = extensionFromFile(file);
    const safeBase = sanitizeSlug(basename(file.name, extname(file.name)));
    const filename = `${Date.now()}-${randomUUID()}-${safeBase}${extension}`;
    const destination = join(uploadDir, filename);
    const bytes = Buffer.from(await file.arrayBuffer());

    await writeFile(destination, bytes);

    mediaPayloads.push({
      title: titleFromFileName(file.name) || "Trip Upload",
      description: description || null,
      url: `/uploads/trips/${storageSlug}/${filename}`,
      type,
      tripId: trip.id,
      uploadedById: user.id,
      approved: isAdmin,
      approvedAt: isAdmin ? now : null,
      approvedById: isAdmin ? user.id : null
    });
  }

  if (mediaPayloads.length === 0) {
    return;
  }

  await prisma.$transaction(mediaPayloads.map((data) => prisma.mediaItem.create({ data })));

  revalidatePath(`/trips/${slug}`);
  revalidatePath("/admin");
}

async function approveTripMedia(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const mediaId = String(formData.get("mediaId") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();

  if (!mediaId || !slug) {
    return;
  }

  const media = await prisma.mediaItem.findFirst({
    where: {
      id: mediaId,
      approved: false,
      trip: { slug, published: true }
    },
    select: { id: true }
  });

  if (!media) {
    return;
  }

  await prisma.mediaItem.update({
    where: { id: media.id },
    data: {
      approved: true,
      approvedAt: new Date(),
      approvedById: admin.id
    }
  });

  revalidatePath("/admin");
  revalidatePath(`/trips/${slug}`);
}

async function updateTripMissionStatus(formData: FormData) {
  "use server";

  await requireAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const missionStatus = String(formData.get("missionStatus") ?? "").trim();

  if (!slug || !Object.values(TripMissionStatus).includes(missionStatus as TripMissionStatus)) {
    return;
  }

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true },
    select: { id: true, slug: true }
  });

  if (!trip) {
    return;
  }

  await prisma.trip.update({
    where: { id: trip.id },
    data: {
      missionStatus: missionStatus as TripMissionStatus
    }
  });

  revalidatePath("/map");
  revalidatePath("/trips");
  revalidatePath(`/trips/${trip.slug}`);
}

export default async function TripPage({ params }: TripPageProps) {
  const { slug } = await params;
  const user = await requireUser();

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true }
  });

  if (!trip) {
    notFound();
  }

  const [stamp, tripGuestbookEntries, approvedMedia, pendingMedia] = await Promise.all([
    prisma.tripStamp.findUnique({
      where: {
        userId_tripId: {
          userId: user.id,
          tripId: trip.id
        }
      }
    }),
    prisma.guestbookEntry.findMany({
      where: { tripId: trip.id },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            displayName: true,
            username: true
          }
        }
      }
    }),
    prisma.mediaItem.findMany({
      where: {
        tripId: trip.id,
        approved: true,
        type: { in: [MediaType.IMAGE, MediaType.VIDEO] }
      },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: {
          select: {
            displayName: true
          }
        }
      }
    }),
    user.role === "admin"
      ? prisma.mediaItem.findMany({
          where: {
            tripId: trip.id,
            approved: false,
            type: { in: [MediaType.IMAGE, MediaType.VIDEO] }
          },
          orderBy: { createdAt: "asc" },
          include: {
            uploadedBy: {
              select: {
                displayName: true,
                username: true
              }
            }
          }
        })
      : Promise.resolve([])
  ]);

  return (
    <div className="trip-detail-layout">
      <div className="stack">
        <RetroWindow title={trip.title}>
          <p className="meta">
            {trip.location} :: {trip.startDate.toLocaleDateString()} - {trip.endDate.toLocaleDateString()}
          </p>
          <p>{trip.summary}</p>
          <article className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(trip.content) }} />
        </RetroWindow>

        <RetroWindow title="Trip Guestbook + Stamp Access">
          <StampBadge label={trip.stampLabel} subtitle={trip.badgeName} unlocked={Boolean(stamp)} />
          {stamp ? (
            <p className="callout">Stamp unlocked. You joined this trip via the trip guestbook.</p>
          ) : (
            <p className="callout">Sign this trip guestbook to unlock the destination stamp.</p>
          )}
          <div className="chat-thread">
            {tripGuestbookEntries.length === 0 ? <p className="meta">No trip guestbook entries yet.</p> : null}
            {tripGuestbookEntries.map((entry) => (
              <article key={entry.id} className="chat-message">
                <p className="chat-message__body">{entry.message}</p>
                <p className="meta">
                  {entry.user.displayName} (<ProfileLink username={entry.user.username} />) :: {entry.createdAt.toLocaleString()}
                </p>
              </article>
            ))}
          </div>
          <form action={postTripGuestbookEntry} className="form-grid">
            <input type="hidden" name="slug" value={trip.slug} />
            <label htmlFor="trip-guestbook-message">Trip guestbook message (max 500 chars)</label>
            <textarea id="trip-guestbook-message" name="message" maxLength={500} required />
            <NeonButton type="submit">Sign Trip Guestbook</NeonButton>
          </form>
        </RetroWindow>

        {user.role === "admin" ? (
          <RetroWindow title="Admin: Mission Status">
            <p className="meta">
              Current:{" "}
              {trip.missionStatus === TripMissionStatus.MISSION_COMPLETE
                ? "Mission complete (pink dot)"
                : "Mission objective (green live dot)"}
            </p>
            <form action={updateTripMissionStatus} className="form-grid">
              <input type="hidden" name="slug" value={trip.slug} />
              <select name="missionStatus" defaultValue={trip.missionStatus}>
                <option value={TripMissionStatus.MISSION_COMPLETE}>Mission complete (pink)</option>
                <option value={TripMissionStatus.MISSION_OBJECTIVE}>Mission objective (green live)</option>
              </select>
              <NeonButton type="submit">Save Mission Status</NeonButton>
            </form>
          </RetroWindow>
        ) : null}
      </div>

      <div className="stack">
        <RetroWindow title="Trip Media">
          {approvedMedia.length === 0 ? <p className="meta">No approved photos or videos yet.</p> : null}
          <div className="trip-media-list">
            {approvedMedia.map((item) => (
              <article key={item.id} className="card">
                <h3>{item.title}</h3>
                <p className="meta">
                  {item.type} :: uploaded by {item.uploadedBy.displayName}
                </p>
                {item.description ? <p>{item.description}</p> : null}
                {item.type === MediaType.IMAGE ? (
                  <img src={item.url} alt={item.title} className="trip-media-preview" />
                ) : (
                  <video controls src={item.url} className="trip-media-preview">
                    <track kind="captions" />
                  </video>
                )}
              </article>
            ))}
          </div>
        </RetroWindow>

        <RetroWindow title="Share Trip Media">
          <form action={uploadTripMedia} className="form-grid">
            <input type="hidden" name="slug" value={trip.slug} />
            <TripMediaUploadDropzone />
            <input name="description" placeholder="Description (optional)" />
            <NeonButton type="submit">Upload Media</NeonButton>
          </form>
          <p className="meta">
            Member submissions require admin approval before appearing in the gallery. Add one or more files in a
            single upload.
          </p>
        </RetroWindow>

        {user.role === "admin" ? (
          <RetroWindow title={`Pending Trip Media (${pendingMedia.length})`}>
            {pendingMedia.length === 0 ? <p className="meta">No pending uploads.</p> : null}
            <div className="card-list">
              {pendingMedia.map((item) => (
                <article key={item.id} className="card">
                  <h3>{item.title}</h3>
                  <p className="meta">
                    {item.type} :: by {item.uploadedBy.displayName} (<ProfileLink username={item.uploadedBy.username} />)
                  </p>
                  {item.description ? <p>{item.description}</p> : null}
                  <form action={approveTripMedia} className="form-grid">
                    <input type="hidden" name="slug" value={trip.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <NeonButton type="submit">Approve Upload</NeonButton>
                  </form>
                </article>
              ))}
            </div>
          </RetroWindow>
        ) : null}
      </div>
    </div>
  );
}
