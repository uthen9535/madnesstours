import { MediaAssetStatus, MediaType, TripMissionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { NeonButton } from "@/components/NeonButton";
import { ProfileLink } from "@/components/ProfileLink";
import { TripMediaFilesBoard } from "@/components/TripMediaFilesBoard";
import { TripMediaGallery } from "@/components/TripMediaGallery";
import { RetroWindow } from "@/components/RetroWindow";
import { StampBadge } from "@/components/StampBadge";
import { TripEditorDrawer } from "@/components/TripEditorDrawer";
import { requireAdmin, requireUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { decodeMayhemPunchLabel, encodeMayhemPunchLabel } from "@/lib/punchLabels";
import { prisma } from "@/lib/prisma";
import { deleteMediaAsset, queueMediaReprocess } from "@/lib/media/upload-service";

type TripPageProps = {
  params: Promise<{ slug: string }>;
};

type TripMediaListItem = {
  id: string;
  source: "asset" | "legacy";
  title: string;
  description: string | null;
  type: "IMAGE" | "VIDEO";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  url: string;
  thumbnailUrl: string | null;
  cardUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
  modalUrl: string | null;
  fullUrl: string | null;
  posterUrl: string | null;
  previewUrl: string | null;
  playbackUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  ownerId: string;
  uploadedByDisplayName: string;
  uploadedByUsername: string;
  canDelete: boolean;
  createdAtMs: number;
};

const MAX_COVER_UPLOAD_BYTES = 1_500_000;
const MEDIA_FOLDER_MARKER_PREFIX = "folder://";
const TRIP_COVER_MARKER_TITLE = "__trip_cover__";
const PUNCH_META_PREFIX = "[punches:";
const ORIGINAL_MEDIA_ASSET_URL_PATTERN = /^(\/uploads\/media\/assets\/[^/]+)\/original\.([a-z0-9]+)(?:$|[?#])/i;

type PunchKey = "madness" | "mayhem";

function deriveLegacyDisplayUrls(url: string, type: "IMAGE" | "VIDEO"): {
  url: string;
  thumbnailUrl: string | null;
  cardUrl: string | null;
  modalUrl: string;
  fullUrl: string;
  posterUrl: string | null;
  previewUrl: string | null;
  playbackUrl: string | null;
} {
  const match = ORIGINAL_MEDIA_ASSET_URL_PATTERN.exec(url);
  if (!match) {
    return {
      url,
      thumbnailUrl: null,
      cardUrl: type === "IMAGE" ? url : null,
      modalUrl: url,
      fullUrl: url,
      posterUrl: null,
      previewUrl: null,
      playbackUrl: type === "VIDEO" ? url : null
    };
  }

  const assetBase = match[1];
  const originalExt = match[2]?.toLowerCase() ?? "";

  if (type === "VIDEO") {
    return {
      url: `${assetBase}/preview.mp4`,
      thumbnailUrl: `${assetBase}/poster.jpg`,
      cardUrl: `${assetBase}/preview.mp4`,
      modalUrl: `${assetBase}/playback.mp4`,
      fullUrl: `${assetBase}/playback.mp4`,
      posterUrl: `${assetBase}/poster.jpg`,
      previewUrl: `${assetBase}/preview.mp4`,
      playbackUrl: `${assetBase}/playback.mp4`
    };
  }

  if (originalExt === "gif") {
    return {
      url: `${assetBase}/preview.jpg`,
      thumbnailUrl: `${assetBase}/thumbnail.jpg`,
      cardUrl: `${assetBase}/preview.jpg`,
      modalUrl: url,
      fullUrl: url,
      posterUrl: null,
      previewUrl: `${assetBase}/preview.jpg`,
      playbackUrl: null
    };
  }

  return {
    url: `${assetBase}/card.webp`,
    thumbnailUrl: `${assetBase}/thumbnail.webp`,
    cardUrl: `${assetBase}/card.webp`,
    modalUrl: `${assetBase}/modal.webp`,
    fullUrl: `${assetBase}/full.webp`,
    posterUrl: null,
    previewUrl: `${assetBase}/card.webp`,
    playbackUrl: null
  };
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLineForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_#>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdownListPrefix(value: string): string {
  return value.replace(/^(\s*[-*+]\s+|\s*\d+[.)]\s+)/, "");
}

function renderTripContent(
  content: string,
  tripInfo: {
    title: string;
    summary: string;
    location: string;
    missionStatusLabel: string;
    startDate: Date;
    endDate: Date;
  }
): string {
  const dateRange = `${tripInfo.startDate.toLocaleDateString()} - ${tripInfo.endDate.toLocaleDateString()}`;
  const duplicateLines = new Set(
    [
      tripInfo.title,
      tripInfo.summary,
      tripInfo.location,
      tripInfo.missionStatusLabel,
      dateRange,
      `location: ${tripInfo.location}`,
      `mission status: ${tripInfo.missionStatusLabel}`,
      `dates: ${dateRange}`,
      `summary: ${tripInfo.summary}`
    ].map(normalizeLineForCompare)
  );

  const normalizedMarkdown = content
    .split(/\r?\n/)
    .filter((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      const withoutHeadingHashes = trimmed.replace(/^#{1,6}\s+/, "");
      const withoutListMarkers = stripMarkdownListPrefix(withoutHeadingHashes);
      const normalized = normalizeLineForCompare(withoutHeadingHashes);
      const normalizedWithoutList = normalizeLineForCompare(withoutListMarkers);
      if (!normalized) {
        return true;
      }

      if (duplicateLines.has(normalized) || duplicateLines.has(normalizedWithoutList)) {
        return false;
      }

      const metadataLinePattern =
        /^(mission status|status|location|dates?|date range|summary|tour title|trip title|title)\s*[:\-]/i;
      if (metadataLinePattern.test(withoutListMarkers)) {
        return false;
      }

      // Remove duplicate leading title heading while preserving meaningful headings below.
      if (index === 0 && normalizeLineForCompare(withoutListMarkers) === normalizeLineForCompare(tripInfo.title)) {
        return false;
      }

      return true;
    })
    .join("\n")
    .trim();

  if (!normalizedMarkdown) {
    return "";
  }

  const html = renderMarkdown(normalizedMarkdown);
  const safeTitle = escapeRegExp(tripInfo.title.trim());
  if (!safeTitle) {
    return html;
  }

  const pattern = new RegExp(`^\\s*<h[1-3][^>]*>\\s*${safeTitle}\\s*<\\/h[1-3]>\\s*`, "i");
  return html.replace(pattern, "");
}

function parsePunchSelectionFromMessage(message: string): {
  selectedPunches: Set<PunchKey>;
  displayMessage: string;
} {
  const trimmed = message.trim();
  if (!trimmed.startsWith(PUNCH_META_PREFIX)) {
    return {
      selectedPunches: new Set<PunchKey>(),
      displayMessage: message
    };
  }

  const closeIndex = trimmed.indexOf("]");
  if (closeIndex <= PUNCH_META_PREFIX.length) {
    return {
      selectedPunches: new Set<PunchKey>(),
      displayMessage: message
    };
  }

  const valuesRaw = trimmed.slice(PUNCH_META_PREFIX.length, closeIndex);
  const selectedPunches = new Set<PunchKey>();
  valuesRaw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .forEach((value) => {
      if (value === "madness" || value === "mayhem") {
        selectedPunches.add(value);
      }
    });

  return {
    selectedPunches,
    displayMessage: trimmed.slice(closeIndex + 1).trim()
  };
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

async function toDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type && file.type.startsWith("image/") ? file.type : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function isRetryableSqliteWriteError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("sqlite_busy") ||
    message.includes("database is locked") ||
    message.includes("attempt to write a readonly database")
  );
}

async function withSqliteWriteRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableSqliteWriteError(error) || index === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 60 * (index + 1)));
    }
  }

  throw lastError;
}

async function postTripGuestbookEntry(formData: FormData) {
  "use server";

  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const selectedPunchValues = formData
    .getAll("selectedPunches")
    .map((value) => String(value).trim().toLowerCase());

  if (!slug || !message || message.length > 500) {
    return;
  }

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true },
    select: {
      id: true,
      slug: true,
      badgeName: true
    }
  });

  if (!trip) {
    return;
  }

  const selectedPunches = new Set<PunchKey>();
  for (const value of selectedPunchValues) {
    if (value === "madness" || value === "mayhem") {
      selectedPunches.add(value);
    }
  }

  const mayhemPunchLabel = decodeMayhemPunchLabel(trip.badgeName, trip.slug);
  if (!mayhemPunchLabel) {
    selectedPunches.delete("mayhem");
  }

  if (selectedPunches.size === 0) {
    return;
  }

  const encodedMessage = `${PUNCH_META_PREFIX}${Array.from(selectedPunches).join(",")}] ${message}`;

  await prisma.$transaction(async (tx) => {
    await tx.guestbookEntry.create({
      data: {
        userId: user.id,
        tripId: trip.id,
        message: encodedMessage
      }
    });

    if (selectedPunches.has("madness")) {
      await tx.tripStamp.upsert({
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
      });
    } else {
      await tx.tripStamp.deleteMany({
        where: {
          userId: user.id,
          tripId: trip.id
        }
      });
    }
  });

  revalidatePath("/map");
  revalidatePath("/stamps");
  revalidatePath("/tours");
  revalidatePath("/home");
  revalidatePath(`/tours/${trip.slug}`);
}

async function deleteTripGuestbookEntry(formData: FormData) {
  "use server";

  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "").trim();

  if (!slug) {
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
    prisma.guestbookEntry.deleteMany({
      where: {
        userId: user.id,
        tripId: trip.id
      }
    }),
    prisma.tripStamp.deleteMany({
      where: {
        userId: user.id,
        tripId: trip.id
      }
    })
  ]);

  revalidatePath("/map");
  revalidatePath("/stamps");
  revalidatePath("/tours");
  revalidatePath("/home");
  revalidatePath(`/tours/${trip.slug}`);
}

async function createTripMediaFolder(formData: FormData) {
  "use server";

  try {
    const user = await requireUser();
    const slug = String(formData.get("slug") ?? "").trim();

    if (!slug) {
      return;
    }

    const trip = await withSqliteWriteRetry(() =>
      prisma.trip.findFirst({
        where: { slug, published: true },
        select: { id: true, slug: true }
      })
    );

    if (!trip) {
      return;
    }

    const markerUrl = `${MEDIA_FOLDER_MARKER_PREFIX}${user.id}`;
    const existingMarker = await withSqliteWriteRetry(() =>
      prisma.mediaItem.findFirst({
        where: {
          tripId: trip.id,
          uploadedById: user.id,
          type: MediaType.OTHER,
          url: markerUrl
        },
        select: { id: true }
      })
    );

    if (!existingMarker) {
      await withSqliteWriteRetry(() =>
        prisma.mediaItem.create({
          data: {
            title: `${user.displayName} file`,
            description: "member file marker",
            url: markerUrl,
            type: MediaType.OTHER,
            tripId: trip.id,
            uploadedById: user.id,
            approved: true,
            approvedAt: new Date(),
            approvedById: user.id
          }
        })
      );
    } else {
      await withSqliteWriteRetry(() =>
        prisma.mediaItem.update({
          where: { id: existingMarker.id },
          data: {
            title: `${user.displayName} file`
          }
        })
      );
    }

    await withSqliteWriteRetry(() =>
      prisma.mediaItem.updateMany({
        where: {
          tripId: trip.id,
          uploadedById: user.id,
          type: { in: [MediaType.IMAGE, MediaType.VIDEO] }
        },
        data: {
          approved: true,
          approvedAt: new Date(),
          approvedById: user.id
        }
      })
    );
    revalidatePath(`/tours/${trip.slug}`);
  } catch (error) {
    console.error("create trip media folder failed", error);
    return;
  }
}

async function deleteTripMediaFolder(formData: FormData) {
  "use server";

  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "").trim();
  const folderOwnerId = String(formData.get("folderOwnerId") ?? "").trim();

  if (!slug || !folderOwnerId) {
    return;
  }

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true },
    select: { id: true, slug: true }
  });

  if (!trip) {
    return;
  }

  const canDelete = user.role === "admin" || folderOwnerId === user.id;
  if (!canDelete) {
    return;
  }

  const assetIds = await prisma.mediaAsset.findMany({
    where: {
      tripId: trip.id,
      uploaderId: folderOwnerId,
      deletedAt: null
    },
    select: {
      id: true
    }
  });

  await Promise.all(assetIds.map((asset) => deleteMediaAsset(asset.id)));

  await prisma.mediaItem.deleteMany({
    where: {
      tripId: trip.id,
      uploadedById: folderOwnerId,
      type: { in: [MediaType.IMAGE, MediaType.VIDEO, MediaType.OTHER] }
    }
  });

  revalidatePath(`/tours/${trip.slug}`);
  revalidatePath("/tours");
}

async function deleteTripMediaItem(formData: FormData) {
  "use server";

  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "").trim();
  const mediaId = String(formData.get("mediaId") ?? "").trim();
  const source = String(formData.get("source") ?? "legacy").trim().toLowerCase();

  if (!slug || !mediaId) {
    return;
  }

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true },
    select: { id: true, slug: true }
  });

  if (!trip) {
    return;
  }

  if (source === "asset") {
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: mediaId,
        tripId: trip.id,
        deletedAt: null
      },
      select: {
        id: true,
        uploaderId: true
      }
    });

    if (!asset) {
      return;
    }

    if (user.role !== "admin" && asset.uploaderId !== user.id) {
      return;
    }

    await deleteMediaAsset(asset.id);

    revalidatePath(`/tours/${trip.slug}`);
    revalidatePath("/tours");
    revalidatePath("/home");
    revalidatePath("/admin");
    return;
  }

  const media = await prisma.mediaItem.findFirst({
    where: {
      id: mediaId,
      tripId: trip.id,
      type: { in: [MediaType.IMAGE, MediaType.VIDEO] }
    },
    select: {
      id: true,
      uploadedById: true
    }
  });

  if (!media) {
    return;
  }

  if (user.role !== "admin" && media.uploadedById !== user.id) {
    return;
  }

  await prisma.mediaItem.delete({
    where: { id: media.id }
  });

  revalidatePath(`/tours/${trip.slug}`);
}

async function reprocessTripMediaItem(formData: FormData) {
  "use server";

  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "").trim();
  const mediaId = String(formData.get("mediaId") ?? "").trim();

  if (!slug || !mediaId) {
    return;
  }

  const trip = await prisma.trip.findFirst({
    where: { slug, published: true },
    select: { id: true, slug: true }
  });

  if (!trip) {
    return;
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      tripId: trip.id,
      deletedAt: null
    },
    select: {
      id: true,
      uploaderId: true
    }
  });

  if (!asset) {
    return;
  }

  if (user.role !== "admin" && asset.uploaderId !== user.id) {
    return;
  }

  queueMediaReprocess(asset.id);
  revalidatePath(`/tours/${trip.slug}`);
  revalidatePath("/admin");
}

async function updateTripDetails(formData: FormData) {
  "use server";

  const admin = await requireAdmin();

  const tripId = String(formData.get("tripId") ?? "").trim();
  const currentSlug = String(formData.get("currentSlug") ?? "").trim();
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
  const madnessPunchLabel = String(formData.get("madnessPunchLabel") ?? "").trim();
  const mayhemPunchLabel = String(formData.get("mayhemPunchLabel") ?? "").trim();
  const coverPhotoFile = formData.get("coverPhotoFile");
  const uploadedCoverPhoto = coverPhotoFile instanceof File && coverPhotoFile.size > 0 ? coverPhotoFile : null;
  const published = formData.get("published") === "on";

  if (!tripId || !title || !location || !summary || !content || !madnessPunchLabel) {
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
      missionStatus: missionStatus as TripMissionStatus,
      badgeName: encodeMayhemPunchLabel(mayhemPunchLabel),
      stampLabel: madnessPunchLabel,
      published
    },
    select: { id: true, slug: true }
  });

  if (uploadedCoverPhoto) {
    try {
      if (uploadedCoverPhoto.size > MAX_COVER_UPLOAD_BYTES || inferMediaType(uploadedCoverPhoto) !== MediaType.IMAGE) {
        return;
      }

      const coverPhotoUrl = await toDataUrl(uploadedCoverPhoto);
      const existingCover = await prisma.mediaItem.findFirst({
        where: {
          tripId: trip.id,
          type: MediaType.OTHER,
          title: TRIP_COVER_MARKER_TITLE
        },
        select: { id: true }
      });

      if (existingCover) {
        await prisma.mediaItem.update({
          where: { id: existingCover.id },
          data: {
            url: coverPhotoUrl,
            uploadedById: admin.id
          }
        });
      } else {
        await prisma.mediaItem.create({
          data: {
            title: TRIP_COVER_MARKER_TITLE,
            description: "trip cover marker",
            url: coverPhotoUrl,
            type: MediaType.OTHER,
            tripId: trip.id,
            uploadedById: admin.id,
            approved: true,
            approvedAt: new Date(),
            approvedById: admin.id
          }
        });
      }
    } catch {
      return;
    }
  }

  revalidatePath("/map");
  revalidatePath("/stamps");
  revalidatePath("/tours");
  revalidatePath("/home");
  revalidatePath(`/tours/${trip.slug}`);
  if (currentSlug && currentSlug !== trip.slug) {
    revalidatePath(`/tours/${currentSlug}`);
  }
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

  const [stamp, tripGuestbookEntries, legacyTripMedia, tripMediaAssets, folderMarkers, coverMarker] = await Promise.all([
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
            id: true,
            displayName: true,
            username: true
          }
        }
      }
    }),
    prisma.mediaItem.findMany({
      where: {
        tripId: trip.id,
        type: { in: [MediaType.IMAGE, MediaType.VIDEO] }
      },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            username: true
          }
        }
      }
    }),
    prisma.mediaAsset.findMany({
      where: {
        tripId: trip.id,
        deletedAt: null
      },
      orderBy: { createdAt: "desc" },
      include: {
        uploader: {
          select: {
            id: true,
            displayName: true,
            username: true
          }
        }
      }
    }),
    prisma.mediaItem.findMany({
      where: {
        tripId: trip.id,
        type: MediaType.OTHER,
        url: { startsWith: MEDIA_FOLDER_MARKER_PREFIX }
      },
      orderBy: { createdAt: "asc" },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            username: true
          }
        }
      }
    }),
    prisma.mediaItem.findFirst({
      where: {
        tripId: trip.id,
        type: MediaType.OTHER,
        title: TRIP_COVER_MARKER_TITLE
      },
      select: { url: true }
    })
  ]);

  const mayhemPunchLabel = decodeMayhemPunchLabel(trip.badgeName, trip.slug);
  const missionStatusLabel =
    trip.missionStatus === TripMissionStatus.MISSION_COMPLETE
      ? "Mission complete (pink)"
      : "Mission objective (green live)";
  const markerOwners = new Set(folderMarkers.map((item) => item.uploadedBy.id));
  const ownTripEntries = tripGuestbookEntries.filter((entry) => entry.user.id === user.id);
  const hasOwnTourLogEntry = ownTripEntries.length > 0;
  const punchSelectionsFromEntries = new Set<PunchKey>();
  for (const entry of ownTripEntries) {
    const parsed = parsePunchSelectionFromMessage(entry.message);
    parsed.selectedPunches.forEach((key) => punchSelectionsFromEntries.add(key));
  }
  const unlockedMadnessPunch = punchSelectionsFromEntries.has("madness") || Boolean(stamp);
  const unlockedMayhemPunch = mayhemPunchLabel ? punchSelectionsFromEntries.has("mayhem") : false;
  const displayGuestbookEntries = tripGuestbookEntries.map((entry) => {
    const parsed = parsePunchSelectionFromMessage(entry.message);
    return {
      ...entry,
      displayMessage: parsed.displayMessage
    };
  });
  const normalizedAssetMedia: TripMediaListItem[] = tripMediaAssets.map((item) => ({
    id: item.id,
    source: "asset" as const,
    title: item.title || item.originalFilename,
    description: item.description,
    type: item.fileType === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const),
    status: item.status,
    url:
      item.fileType === "VIDEO"
        ? item.previewUrl ?? item.posterUrl ?? item.playbackUrl ?? ""
        : item.cardUrl ?? item.thumbnailUrl ?? item.mediumUrl ?? item.largeUrl ?? item.modalUrl ?? item.fullUrl ?? "",
    thumbnailUrl: item.thumbnailUrl,
    cardUrl: item.cardUrl,
    mediumUrl: item.mediumUrl,
    largeUrl: item.largeUrl,
    modalUrl: item.modalUrl,
    fullUrl: item.fullUrl,
    posterUrl: item.posterUrl,
    previewUrl: item.previewUrl,
    playbackUrl: item.playbackUrl,
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    errorMessage: item.errorMessage,
    ownerId: item.uploader.id,
    uploadedByDisplayName: item.uploader.displayName,
    uploadedByUsername: item.uploader.username,
    canDelete: user.role === "admin" || item.uploader.id === user.id,
    createdAtMs: item.createdAt.getTime()
  }));
  const normalizedLegacyMedia: TripMediaListItem[] = legacyTripMedia.map((item) => {
    const type = item.type === MediaType.VIDEO ? ("VIDEO" as const) : ("IMAGE" as const);
    const derived = deriveLegacyDisplayUrls(item.url, type);

    return {
      id: item.id,
      source: "legacy" as const,
      title: item.title,
      description: item.description,
      type,
      status: "READY" as const,
      url: derived.url,
      thumbnailUrl: derived.thumbnailUrl,
      cardUrl: derived.cardUrl,
      mediumUrl: null,
      largeUrl: null,
      modalUrl: derived.modalUrl,
      fullUrl: derived.fullUrl,
      posterUrl: derived.posterUrl,
      previewUrl: derived.previewUrl,
      playbackUrl: derived.playbackUrl,
      width: null,
      height: null,
      durationMs: null,
      errorMessage: null,
      ownerId: item.uploadedBy.id,
      uploadedByDisplayName: item.uploadedBy.displayName,
      uploadedByUsername: item.uploadedBy.username,
      canDelete: user.role === "admin" || item.uploadedBy.id === user.id,
      createdAtMs: item.createdAt.getTime()
    };
  });
  const tripMedia: TripMediaListItem[] = [...normalizedAssetMedia, ...normalizedLegacyMedia].sort(
    (a, b) => b.createdAtMs - a.createdAtMs
  );
  const folderByOwner = new Map<
    string,
    {
      ownerId: string;
      ownerDisplayName: string;
      ownerUsername: string;
      name: string;
      itemCount: number;
      canDelete: boolean;
      isOwnFile: boolean;
    }
  >();

  for (const marker of folderMarkers) {
    folderByOwner.set(marker.uploadedBy.id, {
      ownerId: marker.uploadedBy.id,
      ownerDisplayName: marker.uploadedBy.displayName,
      ownerUsername: marker.uploadedBy.username,
      name: `${marker.uploadedBy.displayName} file`,
      itemCount: 0,
      canDelete: user.role === "admin" || marker.uploadedBy.id === user.id,
      isOwnFile: marker.uploadedBy.id === user.id
    });
  }

  for (const item of tripMedia) {
    const key = item.ownerId;
    const current = folderByOwner.get(key);
    if (!current) {
      continue;
    }
    const nextCount = (current?.itemCount ?? 0) + 1;
    folderByOwner.set(key, {
      ownerId: key,
      ownerDisplayName: item.uploadedByDisplayName,
      ownerUsername: item.uploadedByUsername,
      name: `${item.uploadedByDisplayName} file`,
      itemCount: nextCount,
      canDelete: user.role === "admin" || key === user.id,
      isOwnFile: key === user.id
    });
  }

  const visibleMedia = tripMedia.filter((item) => markerOwners.has(item.ownerId));
  const readyVisibleMedia = visibleMedia.filter((item) => item.status === MediaAssetStatus.READY || item.source === "legacy");
  const tourCoverMedia =
    coverMarker?.url ??
    readyVisibleMedia.find((item) => item.type === "IMAGE")?.cardUrl ??
    readyVisibleMedia.find((item) => item.type === "IMAGE")?.url ??
    visibleMedia.find((item) => item.type === "IMAGE")?.url ??
    null;
  const hasOwnFolder = markerOwners.has(user.id);
  const memberFolders = Array.from(folderByOwner.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="trip-detail-layout">
      <div className="stack">
        <RetroWindow title="Tour" className="trip-overview-window">
          {tourCoverMedia ? (
            <img src={tourCoverMedia} alt={`${trip.title} cover`} className="trip-overview__cover" />
          ) : null}
          <h2 className="trip-overview__title">{trip.title}</h2>
          <p className="meta">Mission status: {missionStatusLabel}</p>
          <p className="meta">Location: {trip.location}</p>
          <p className="meta">
            Dates: {trip.startDate.toLocaleDateString()} - {trip.endDate.toLocaleDateString()}
          </p>
          <p>{trip.summary}</p>
          <article
            className="markdown"
            dangerouslySetInnerHTML={{
              __html: renderTripContent(trip.content, {
                title: trip.title,
                summary: trip.summary,
                location: trip.location,
                missionStatusLabel,
                startDate: trip.startDate,
                endDate: trip.endDate
              })
            }}
          />
          {user.role === "admin" ? (
            <TripEditorDrawer
              action={updateTripDetails}
              trip={{
                id: trip.id,
                slug: trip.slug,
                title: trip.title,
                location: trip.location,
                summary: trip.summary,
                content: trip.content,
                startDate: toDateInputValue(trip.startDate),
                endDate: toDateInputValue(trip.endDate),
                mapX: trip.mapX,
                mapY: trip.mapY,
                latitude: trip.latitude,
                longitude: trip.longitude,
                missionStatus: trip.missionStatus,
                madnessPunchLabel: trip.stampLabel,
                mayhemPunchLabel: decodeMayhemPunchLabel(trip.badgeName, trip.slug),
                coverPhotoUrl: coverMarker?.url ?? "",
                published: trip.published
              }}
            />
          ) : null}
        </RetroWindow>

        <RetroWindow title="Member Log & Secure Punch">
          {hasOwnTourLogEntry ? (
            <div className="trip-punch-row">
              <StampBadge label={trip.stampLabel} subtitle="Madness Punch" unlocked={unlockedMadnessPunch} />
              {mayhemPunchLabel ? (
                <StampBadge label={mayhemPunchLabel} subtitle="Mayhem Punch" unlocked={unlockedMayhemPunch} />
              ) : null}
            </div>
          ) : null}
          {hasOwnTourLogEntry ? (
            <p className="callout">Punch secured. Delete your member log entry to reset and claim again.</p>
          ) : (
            <p className="callout">Click one or more locked punch badges, then sign member log to secure punch.</p>
          )}
          <div className="chat-thread">
            {displayGuestbookEntries.length === 0 ? <p className="meta">No member entries yet.</p> : null}
            {displayGuestbookEntries.map((entry) => (
              <article key={entry.id} className="chat-message">
                <p className="chat-message__body">{entry.displayMessage}</p>
                <p className="meta">
                  {entry.user.displayName} (<ProfileLink username={entry.user.username} />) :: {entry.createdAt.toLocaleString()}
                </p>
              </article>
            ))}
          </div>
          {!hasOwnTourLogEntry ? (
            <form action={postTripGuestbookEntry} className="form-grid">
              <input type="hidden" name="slug" value={trip.slug} />
              <div className="trip-punch-selector">
                <label className="trip-punch-choice">
                  <input type="checkbox" name="selectedPunches" value="madness" />
                  <span className="trip-punch-choice__badge">
                    <StampBadge label={trip.stampLabel} subtitle="Madness Punch" unlocked={false} />
                  </span>
                </label>
                {mayhemPunchLabel ? (
                  <label className="trip-punch-choice">
                    <input type="checkbox" name="selectedPunches" value="mayhem" />
                    <span className="trip-punch-choice__badge">
                      <StampBadge label={mayhemPunchLabel} subtitle="Mayhem Punch" unlocked={false} />
                    </span>
                  </label>
                ) : null}
              </div>
              <label htmlFor="trip-guestbook-message">Tour log entry (max 500 chars)</label>
              <textarea
                id="trip-guestbook-message"
                name="message"
                maxLength={500}
                placeholder="Leave a note about this trip to secure punch."
                required
              />
              <NeonButton type="submit">Sign Member Log</NeonButton>
            </form>
          ) : null}
          {hasOwnTourLogEntry ? (
            <form action={deleteTripGuestbookEntry} className="form-grid">
              <input type="hidden" name="slug" value={trip.slug} />
              <NeonButton type="submit" className="trip-tour-log-delete">
                Delete My Tour Log Entry
              </NeonButton>
            </form>
          ) : null}
        </RetroWindow>

      </div>

      <div className="stack">
        <RetroWindow title="All Media">
          <TripMediaGallery
            media={readyVisibleMedia}
            deleteMediaAction={deleteTripMediaItem}
            slug={trip.slug}
          />
        </RetroWindow>

        <RetroWindow title="Member Files">
          <TripMediaFilesBoard
            slug={trip.slug}
            folders={memberFolders}
            media={visibleMedia}
            deleteFolderAction={deleteTripMediaFolder}
            deleteMediaAction={deleteTripMediaItem}
            reprocessMediaAction={reprocessTripMediaItem}
          />
        </RetroWindow>

        {!hasOwnFolder ? (
          <form action={createTripMediaFolder} className="trip-create-file-launch">
            <input type="hidden" name="slug" value={trip.slug} />
            <NeonButton type="submit">Create My File</NeonButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
