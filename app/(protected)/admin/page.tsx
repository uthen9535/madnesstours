import { BlogCategory, MediaAssetStatus, MediaType, MediaUploadSessionStatus, Role, TripMissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { AdminGlitchControls } from "@/components/AdminGlitchControls";
import { NeonButton } from "@/components/NeonButton";
import { ProfileLink } from "@/components/ProfileLink";
import { RetroWindow } from "@/components/RetroWindow";
import { TripMediaUploadDropzone } from "@/components/TripMediaUploadDropzone";
import { hashPassword, requireAdmin, requireUser } from "@/lib/auth";
import { deleteMediaAsset, queueMediaReprocess } from "@/lib/media/upload-service";
import { encodeMayhemPunchLabel } from "@/lib/punchLabels";
import { prisma } from "@/lib/prisma";
import { withSqliteRetry } from "@/lib/sqliteRetry";

const TRIP_COVER_MARKER_TITLE = "__trip_cover__";
const MAX_COVER_UPLOAD_BYTES = 1_500_000;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function toDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type && file.type.startsWith("image/") ? file.type : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function resolveUniquePostSlug(baseSlug: string): Promise<string> {
  const initial = baseSlug || "broadcast";
  let candidate = initial;
  let counter = 2;

  while (true) {
    const exists = await withSqliteRetry(() =>
      prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true }
      })
    );

    if (!exists) {
      return candidate;
    }

    candidate = `${initial}-${counter}`;
    counter += 1;
  }
}

async function createPost(formData: FormData) {
  "use server";

  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() as BlogCategory;
  const published = formData.get("published") === "on";

  if (!title || !content || !Object.values(BlogCategory).includes(category)) {
    return;
  }

  const slug = await resolveUniquePostSlug(rawSlug ? slugify(rawSlug) : slugify(title));
  if (!slug) {
    return;
  }

  try {
    await withSqliteRetry(() =>
      prisma.blogPost.create({
        data: {
          title,
          slug,
          excerpt,
          content,
          category,
          published,
          authorId: user.id
        }
      })
    );
  } catch (error) {
    console.error("blog publish failed", error);
    return;
  }

  revalidatePath("/blog");
  revalidatePath("/admin");
  revalidatePath("/home");
}

async function createTrip(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
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
  const madnessPunchLabel = String(formData.get("madnessPunchLabel") ?? "").trim();
  const mayhemPunchLabel = String(formData.get("mayhemPunchLabel") ?? "").trim();
  const coverPhotoFile = formData.get("coverPhotoFile");
  const uploadedCoverPhoto = coverPhotoFile instanceof File && coverPhotoFile.size > 0 ? coverPhotoFile : null;
  const missionStatus = String(formData.get("missionStatus") ?? TripMissionStatus.MISSION_COMPLETE).trim();
  const published = formData.get("published") === "on";

  if (!title || !location || !summary || !content || !madnessPunchLabel) {
    return;
  }

  if (!Object.values(TripMissionStatus).includes(missionStatus as TripMissionStatus)) {
    return;
  }

  const slug = slugify(title);
  if (!slug) {
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

  let trip: { id: string; slug: string };
  try {
    trip = await prisma.trip.create({
      data: {
        title,
        slug,
        location,
        summary,
        content,
        startDate: start,
        endDate: end,
        mapX: Number.isFinite(mapX) ? mapX : 50,
        mapY: Number.isFinite(mapY) ? mapY : 50,
        latitude,
        longitude,
        missionStatus: missionStatus as TripMissionStatus,
        badgeName: encodeMayhemPunchLabel(mayhemPunchLabel),
        stampLabel: madnessPunchLabel,
        published
      },
      select: { id: true, slug: true }
    });
  } catch {
    return;
  }

  if (uploadedCoverPhoto) {
    if (uploadedCoverPhoto.size <= MAX_COVER_UPLOAD_BYTES && uploadedCoverPhoto.type.startsWith("image/")) {
      try {
        const coverPhotoUrl = await toDataUrl(uploadedCoverPhoto);
        await prisma.mediaItem.create({
          data: {
            title: TRIP_COVER_MARKER_TITLE,
            description: "tour cover marker",
            url: coverPhotoUrl,
            type: MediaType.OTHER,
            tripId: trip.id,
            uploadedById: admin.id,
            approved: true,
            approvedAt: new Date(),
            approvedById: admin.id
          }
        });
      } catch {
        // Keep tour creation successful even if the optional cover upload fails.
      }
    }
  }

  revalidatePath("/tours");
  revalidatePath("/map");
  revalidatePath("/stamps");
  revalidatePath("/admin");
  revalidatePath(`/tours/${trip.slug}`);
}

async function approveMedia(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const mediaId = String(formData.get("mediaId") ?? "").trim();

  if (!mediaId) {
    return;
  }

  const item = await prisma.mediaItem.findFirst({
    where: {
      id: mediaId,
      approved: false,
      tripId: { not: null }
    },
    include: {
      trip: {
        select: {
          slug: true
        }
      }
    }
  });

  if (!item) {
    return;
  }

  await prisma.mediaItem.update({
    where: { id: item.id },
    data: {
      approved: true,
      approvedAt: new Date(),
      approvedById: admin.id
    }
  });

  revalidatePath("/admin");
  if (item.trip?.slug) {
    revalidatePath(`/tours/${item.trip.slug}`);
  }
}

async function reprocessMediaAssetAction(formData: FormData) {
  "use server";

  await requireAdmin();
  const mediaId = String(formData.get("mediaId") ?? "").trim();

  if (!mediaId) {
    return;
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      deletedAt: null
    },
    select: {
      id: true,
      trip: {
        select: {
          slug: true
        }
      }
    }
  });

  if (!asset) {
    return;
  }

  queueMediaReprocess(asset.id);
  revalidatePath("/admin");
  if (asset.trip?.slug) {
    revalidatePath(`/tours/${asset.trip.slug}`);
  }
}

async function deleteMediaAssetAction(formData: FormData) {
  "use server";

  await requireAdmin();
  const mediaId = String(formData.get("mediaId") ?? "").trim();

  if (!mediaId) {
    return;
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      deletedAt: null
    },
    select: {
      id: true,
      trip: {
        select: {
          slug: true
        }
      }
    }
  });

  if (!asset) {
    return;
  }

  await deleteMediaAsset(asset.id);
  revalidatePath("/admin");
  if (asset.trip?.slug) {
    revalidatePath(`/tours/${asset.trip.slug}`);
  }
}

async function createMemberCodename(formData: FormData) {
  "use server";

  await requireAdmin();
  const codename = String(formData.get("codename") ?? "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9_-]{3,24}$/.test(codename)) {
    return;
  }

  const generatedPin = `${Math.floor(100000 + Math.random() * 900000)}`;
  const passwordHash = await hashPassword(generatedPin);

  try {
    await prisma.user.create({
      data: {
        username: codename,
        displayName: codename,
        passwordHash,
        pin: generatedPin,
        pinResetComplete: false,
        btcSats: 100_000_000,
        ethUnits: 100_000_000,
        role: Role.civilian
      }
    });
  } catch {
    return;
  }

  revalidatePath("/admin");
  revalidatePath("/guestbook");
}

export default async function AdminPage() {
  const user = await requireUser();
  const isAdmin = user.role === Role.admin;

  if (!isAdmin) {
    return (
      <div className="stack admin-command-page">
        <RetroWindow title="Admin: Publish Blog Post">
          <form action={createPost} className="form-grid">
            <input name="title" placeholder="Title" required />
            <input name="slug" placeholder="Slug (optional)" />
            <input name="excerpt" placeholder="Excerpt" />
            <select name="category" required defaultValue={BlogCategory.BTC}>
              {Object.values(BlogCategory).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <textarea name="content" placeholder="Markdown content" required />
            <label>
              <input type="checkbox" name="published" defaultChecked /> Publish now
            </label>
            <NeonButton type="submit">Save Post</NeonButton>
          </form>
        </RetroWindow>
      </div>
    );
  }

  const [
    recentMessages,
    recentPosts,
    trips,
    pendingTripMedia,
    failedPipelineMedia,
    processingPipelineMedia,
    mediaAssetStatusCounts,
    mediaSessionStatusCounts
  ] = await Promise.all([
    prisma.guestbookEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        user: {
          select: {
            displayName: true,
            username: true
          }
        }
      }
    }),
    prisma.blogPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.trip.findMany({
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.mediaItem.findMany({
      where: {
        tripId: { not: null },
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
        },
        trip: {
          select: {
            title: true,
            slug: true
          }
        }
      }
    }),
    prisma.mediaAsset.findMany({
      where: {
        deletedAt: null,
        status: MediaAssetStatus.FAILED
      },
      orderBy: { createdAt: "desc" },
      take: 120,
      include: {
        uploader: {
          select: {
            displayName: true,
            username: true
          }
        },
        trip: {
          select: {
            title: true,
            slug: true
          }
        }
      }
    }),
    prisma.mediaAsset.findMany({
      where: {
        deletedAt: null,
        status: { in: [MediaAssetStatus.UPLOADING, MediaAssetStatus.PROCESSING] }
      },
      orderBy: { createdAt: "desc" },
      take: 120,
      include: {
        uploader: {
          select: {
            displayName: true,
            username: true
          }
        },
        trip: {
          select: {
            title: true,
            slug: true
          }
        }
      }
    }),
    prisma.mediaAsset.groupBy({
      by: ["status"],
      where: {
        deletedAt: null
      },
      _count: {
        _all: true
      }
    }),
    prisma.mediaUploadSession.groupBy({
      by: ["status"],
      _count: {
        _all: true
      }
    })
  ]);
  const mediaAssetCountByStatus = new Map(mediaAssetStatusCounts.map((row) => [row.status, row._count._all]));
  const mediaSessionCountByStatus = new Map(mediaSessionStatusCounts.map((row) => [row.status, row._count._all]));
  const failedAssetCount = mediaAssetCountByStatus.get(MediaAssetStatus.FAILED) ?? 0;
  const uploadingAssetCount = mediaAssetCountByStatus.get(MediaAssetStatus.UPLOADING) ?? 0;
  const processingAssetCount = mediaAssetCountByStatus.get(MediaAssetStatus.PROCESSING) ?? 0;
  const readyAssetCount = mediaAssetCountByStatus.get(MediaAssetStatus.READY) ?? 0;
  const uploadingSessionCount = mediaSessionCountByStatus.get(MediaUploadSessionStatus.UPLOADING) ?? 0;
  const processingSessionCount = mediaSessionCountByStatus.get(MediaUploadSessionStatus.PROCESSING) ?? 0;
  const failedSessionCount = mediaSessionCountByStatus.get(MediaUploadSessionStatus.FAILED) ?? 0;

  return (
    <div className="stack admin-command-page">
      <RetroWindow title="Admin: System Attack Controls" className="admin-command-controls">
        <p className="meta">MadnessNet Shortwave Intercept // unauthorized override controls.</p>
        <AdminGlitchControls />
      </RetroWindow>

      <RetroWindow title="Admin: Create Member Codename">
        <p className="meta">
          Set a codename. A unique 6-digit PIN is auto-generated and visible in Guestbook (admin only). New members
          start with 1 BTC and 1 ETH in purse.
        </p>
        <form action={createMemberCodename} className="form-grid">
          <input
            name="codename"
            placeholder="codename (a-z, 0-9, _, -)"
            pattern="[a-z0-9_-]+"
            minLength={3}
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          <NeonButton type="submit">Create Member</NeonButton>
        </form>
      </RetroWindow>

      <RetroWindow title="Admin: Publish Blog Post">
        <form action={createPost} className="form-grid">
          <input name="title" placeholder="Title" required />
          <input name="slug" placeholder="Slug (optional)" />
          <input name="excerpt" placeholder="Excerpt" />
          <select name="category" required defaultValue={BlogCategory.BTC}>
            {Object.values(BlogCategory).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <textarea name="content" placeholder="Markdown content" required />
          <label>
            <input type="checkbox" name="published" defaultChecked /> Publish now
          </label>
          <NeonButton type="submit">Save Post</NeonButton>
        </form>
      </RetroWindow>

      <RetroWindow title="Admin: Create Tour">
        <form action={createTrip} className="form-grid">
          <input name="title" placeholder="Tour title" required />
          <label htmlFor="mission-status">Mission status</label>
          <select id="mission-status" name="missionStatus" defaultValue={TripMissionStatus.MISSION_COMPLETE}>
            <option value={TripMissionStatus.MISSION_COMPLETE}>Mission complete (pink)</option>
            <option value={TripMissionStatus.MISSION_OBJECTIVE}>Mission objective (green live)</option>
          </select>
          <input name="location" placeholder="Location" required />
          <label htmlFor="start-date">Start date</label>
          <input id="start-date" name="startDate" type="date" required />
          <label htmlFor="end-date">End date</label>
          <input id="end-date" name="endDate" type="date" required />
          <input name="summary" placeholder="Summary" required />
          <textarea name="content" placeholder="Tour markdown" required />
          <input name="madnessPunchLabel" placeholder="Madness Punch Label" required />
          <input name="mayhemPunchLabel" placeholder="Mayhem Punch Label (optional)" />
          <div>
            <p className="meta">Cover Photo Image</p>
            <TripMediaUploadDropzone
              inputName="coverPhotoFile"
              multiple={false}
              required={false}
              accept="image/*"
              title="Click to upload cover photo or drag and drop here"
              helperText="Upload one image (max 1.5 MB)."
              maxBytesPerFile={1_500_000}
            />
          </div>
          <label>
            <input type="checkbox" name="published" defaultChecked /> Visible on tours pages
          </label>
          <label htmlFor="map-x">Map X (%)</label>
          <input id="map-x" name="mapX" type="number" min={0} max={100} defaultValue={50} required />
          <label htmlFor="map-y">Map Y (%)</label>
          <input id="map-y" name="mapY" type="number" min={0} max={100} defaultValue={50} required />
          <label htmlFor="latitude">Latitude (optional, -90 to 90)</label>
          <input id="latitude" name="latitude" type="number" min={-90} max={90} step="any" />
          <label htmlFor="longitude">Longitude (optional, -180 to 180)</label>
          <input id="longitude" name="longitude" type="number" min={-180} max={180} step="any" />
          <NeonButton type="submit">Save Tour</NeonButton>
        </form>
      </RetroWindow>

      <RetroWindow title="Admin: Live Chat Monitor">
        <div className="chat-thread">
          {recentMessages.length === 0 ? <p className="meta">No messages yet.</p> : null}
          {recentMessages.map((entry) => (
            <article key={entry.id} className="chat-message">
              <p className="chat-message__body">{entry.message}</p>
              <p className="meta">
                {entry.user.displayName} (<ProfileLink username={entry.user.username} />) :: {entry.createdAt.toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </RetroWindow>

      <RetroWindow title={`Admin: Pending Tour Media (${pendingTripMedia.length})`}>
        {pendingTripMedia.length === 0 ? <p className="meta">No pending tour uploads.</p> : null}
        <div className="card-list">
          {pendingTripMedia.map((item) => (
            <article key={item.id} className="card">
              <strong>{item.title}</strong>
              <p className="meta">
                {item.type} :: {item.trip?.title ?? "Unknown Tour"} ({item.trip?.slug ?? "no-slug"})
              </p>
              <p className="meta">
                by {item.uploadedBy.displayName} (<ProfileLink username={item.uploadedBy.username} />)
              </p>
              {item.description ? <p>{item.description}</p> : null}
              <form action={approveMedia} className="form-grid">
                <input type="hidden" name="mediaId" value={item.id} />
                <NeonButton type="submit">Approve Media</NeonButton>
              </form>
            </article>
          ))}
        </div>
      </RetroWindow>

      <RetroWindow title={`Admin: Media Pipeline Failures (${failedAssetCount})`}>
        <p className="meta">
          showing latest {failedPipelineMedia.length} failures :: assets ready {readyAssetCount} :: processing {processingAssetCount} ::
          uploading {uploadingAssetCount}
        </p>
        {failedPipelineMedia.length === 0 ? <p className="meta">No failed media processing jobs.</p> : null}
        <div className="card-list">
          {failedPipelineMedia.map((item) => (
            <article key={item.id} className="card">
              <strong>{item.title ?? item.originalFilename}</strong>
              <p className="meta">
                {item.fileType} :: {item.trip?.title ?? "No Tour"} ({item.trip?.slug ?? "n/a"})
              </p>
              <p className="meta">
                by {item.uploader.displayName} (<ProfileLink username={item.uploader.username} />)
              </p>
              {item.errorMessage ? <p className="meta">{item.errorMessage}</p> : null}
              <form action={reprocessMediaAssetAction} className="form-grid">
                <input type="hidden" name="mediaId" value={item.id} />
                <NeonButton type="submit">Reprocess</NeonButton>
              </form>
              <form action={deleteMediaAssetAction} className="form-grid">
                <input type="hidden" name="mediaId" value={item.id} />
                <NeonButton type="submit" className="trip-media-gallery__delete-button">
                  Delete
                </NeonButton>
              </form>
            </article>
          ))}
        </div>
      </RetroWindow>

      <RetroWindow title={`Admin: Active Media Processing (${processingAssetCount + uploadingAssetCount})`}>
        <p className="meta">
          assets uploading {uploadingAssetCount} :: assets processing {processingAssetCount} :: sessions uploading {uploadingSessionCount}
          :: sessions processing {processingSessionCount} :: sessions failed {failedSessionCount}
        </p>
        {processingPipelineMedia.length === 0 ? <p className="meta">No active media processing jobs.</p> : null}
        <div className="card-list">
          {processingPipelineMedia.map((item) => (
            <article key={item.id} className="card">
              <strong>{item.title ?? item.originalFilename}</strong>
              <p className="meta">
                {item.status} :: {item.fileType}
              </p>
              <p className="meta">
                {item.trip?.title ?? "No Tour"} ({item.trip?.slug ?? "n/a"})
              </p>
              <p className="meta">
                by {item.uploader.displayName} (<ProfileLink username={item.uploader.username} />)
              </p>
            </article>
          ))}
        </div>
      </RetroWindow>

      <div className="page-grid">
        <RetroWindow title="Recent Posts">
          <div className="card-list">
            {recentPosts.map((post) => (
              <div key={post.id} className="card">
                <strong>{post.title}</strong>
                <p className="meta">
                  {post.slug} :: {post.published ? "published" : "draft"}
                </p>
              </div>
            ))}
          </div>
        </RetroWindow>

        <RetroWindow title="Recent Tours">
          <div className="card-list">
            {trips.map((trip) => (
              <div key={trip.id} className="card">
                <strong>{trip.title}</strong>
                <p className="meta">
                  {trip.slug} :: {trip.published ? "published" : "draft"}
                </p>
              </div>
            ))}
          </div>
        </RetroWindow>
      </div>
    </div>
  );
}
