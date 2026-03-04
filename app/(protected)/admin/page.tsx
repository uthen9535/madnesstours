import { BlogCategory, MediaType, Role, TripMissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { AdminGlitchControls } from "@/components/AdminGlitchControls";
import { NeonButton } from "@/components/NeonButton";
import { ProfileLink } from "@/components/ProfileLink";
import { RetroWindow } from "@/components/RetroWindow";
import { hashGlobalPassword, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createPost(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() as BlogCategory;
  const published = formData.get("published") === "on";

  if (!title || !content || !Object.values(BlogCategory).includes(category)) {
    return;
  }

  const slug = rawSlug ? slugify(rawSlug) : slugify(title);
  if (!slug) {
    return;
  }

  await prisma.blogPost.create({
    data: {
      title,
      slug,
      excerpt,
      content,
      category,
      published,
      authorId: admin.id
    }
  });

  revalidatePath("/blog");
  revalidatePath("/admin");
  revalidatePath("/home");
}

async function createTrip(formData: FormData) {
  "use server";

  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const mapX = Number(formData.get("mapX") ?? 50);
  const mapY = Number(formData.get("mapY") ?? 50);
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const stampLabel = String(formData.get("stampLabel") ?? "").trim();
  const missionStatus = String(formData.get("missionStatus") ?? TripMissionStatus.MISSION_COMPLETE).trim();
  const published = formData.get("published") === "on";

  if (!title || !location || !summary || !content || !stampLabel) {
    return;
  }

  if (!Object.values(TripMissionStatus).includes(missionStatus as TripMissionStatus)) {
    return;
  }

  const slug = rawSlug ? slugify(rawSlug) : slugify(title);
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

  const trip = await prisma.trip.create({
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
      badgeName: stampLabel,
      stampLabel,
      published
    }
  });

  revalidatePath("/trips");
  revalidatePath("/map");
  revalidatePath("/stamps");
  revalidatePath("/admin");
  revalidatePath(`/trips/${trip.slug}`);
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
    revalidatePath(`/trips/${item.trip.slug}`);
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

  const passwordHash = await hashGlobalPassword();

  try {
    await prisma.user.create({
      data: {
        username: codename,
        displayName: codename,
        passwordHash,
        role: Role.civilian
      }
    });
  } catch {
    return;
  }

  revalidatePath("/admin");
}

export default async function AdminPage() {
  await requireAdmin();

  const [recentMessages, recentPosts, trips, pendingTripMedia] = await Promise.all([
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
    })
  ]);

  return (
    <div className="stack admin-command-page">
      <RetroWindow title="Admin: System Attack Controls" className="admin-command-controls">
        <p className="meta">MadnessNet Shortwave Intercept // unauthorized override controls.</p>
        <AdminGlitchControls />
      </RetroWindow>

      <RetroWindow title="Admin: Create Member Codename">
        <p className="meta">Set a codename and share it with the tester. Global password is used for all accounts.</p>
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

      <RetroWindow title="Admin: Create Trip">
        <form action={createTrip} className="form-grid">
          <input name="title" placeholder="Trip title" required />
          <input name="slug" placeholder="Slug (optional)" />
          <input name="location" placeholder="Location" required />
          <input name="summary" placeholder="Summary" required />
          <textarea name="content" placeholder="Trip markdown" required />
          <label htmlFor="start-date">Start date</label>
          <input id="start-date" name="startDate" type="date" required />
          <label htmlFor="end-date">End date</label>
          <input id="end-date" name="endDate" type="date" required />
          <label htmlFor="map-x">Map X (%)</label>
          <input id="map-x" name="mapX" type="number" min={0} max={100} defaultValue={50} required />
          <label htmlFor="map-y">Map Y (%)</label>
          <input id="map-y" name="mapY" type="number" min={0} max={100} defaultValue={50} required />
          <label htmlFor="latitude">Latitude (optional, -90 to 90)</label>
          <input id="latitude" name="latitude" type="number" min={-90} max={90} step="any" />
          <label htmlFor="longitude">Longitude (optional, -180 to 180)</label>
          <input id="longitude" name="longitude" type="number" min={-180} max={180} step="any" />
          <label htmlFor="mission-status">Mission status</label>
          <select id="mission-status" name="missionStatus" defaultValue={TripMissionStatus.MISSION_COMPLETE}>
            <option value={TripMissionStatus.MISSION_COMPLETE}>Mission complete (pink)</option>
            <option value={TripMissionStatus.MISSION_OBJECTIVE}>Mission objective (green live)</option>
          </select>
          <input name="stampLabel" placeholder="Stamp label" required />
          <label>
            <input type="checkbox" name="published" defaultChecked /> Publish now
          </label>
          <NeonButton type="submit">Save Trip</NeonButton>
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

      <RetroWindow title={`Admin: Pending Trip Media (${pendingTripMedia.length})`}>
        {pendingTripMedia.length === 0 ? <p className="meta">No pending trip uploads.</p> : null}
        <div className="card-list">
          {pendingTripMedia.map((item) => (
            <article key={item.id} className="card">
              <strong>{item.title}</strong>
              <p className="meta">
                {item.type} :: {item.trip?.title ?? "Unknown Trip"} ({item.trip?.slug ?? "no-slug"})
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

        <RetroWindow title="Recent Trips">
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
