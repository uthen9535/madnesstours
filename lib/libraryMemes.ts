import { MediaAssetKind, MediaAssetScope, MediaAssetStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LibraryMemeDto } from "@/lib/libraryMemeTypes";

export const LIBRARY_MEME_PREFIX = "LIB_MEME::";
const INTERNAL_MEDIA_PATH_PREFIX = "/uploads/media/assets/";
const ORIGINAL_MEDIA_ASSET_URL_PATTERN = /^(\/uploads\/media\/assets\/[^/]+)\/original\.([a-z0-9]+)(?:$|[?#])/i;
const INTERNAL_MEME_HOSTS = new Set(["madnesstours.com", "www.madnesstours.com", "localhost", "127.0.0.1"]);
const INTERNAL_MEME_HOST_SUFFIX_ALLOWLIST = [".vercel.app"];

type MemeViewer = {
  id: string;
  role: Role;
};

function deriveLegacyMemeDisplay(url: string): {
  imageDataUrl: string;
  thumbnailUrl: string;
} {
  const match = ORIGINAL_MEDIA_ASSET_URL_PATTERN.exec(url);
  if (!match) {
    return {
      imageDataUrl: url,
      thumbnailUrl: url
    };
  }

  const assetBase = match[1];
  const originalExt = match[2]?.toLowerCase() ?? "";

  if (originalExt === "gif") {
    return {
      imageDataUrl: `${assetBase}/preview.jpg`,
      thumbnailUrl: `${assetBase}/thumbnail.jpg`
    };
  }

  return {
    imageDataUrl: `${assetBase}/card.webp`,
    thumbnailUrl: `${assetBase}/thumbnail.webp`
  };
}

function inferLegacyMemeFileType(url: string): "IMAGE" | "GIF" {
  const match = ORIGINAL_MEDIA_ASSET_URL_PATTERN.exec(url);
  if (match?.[2]?.toLowerCase() === "gif") {
    return "GIF";
  }
  return /\.gif(?:$|[?#])/i.test(url) ? "GIF" : "IMAGE";
}

function isAllowedInternalMemeHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return INTERNAL_MEME_HOSTS.has(normalized) || INTERNAL_MEME_HOST_SUFFIX_ALLOWLIST.some((suffix) => normalized.endsWith(suffix));
}

function trimTrailingLinkPunctuation(value: string): string {
  return value.trim().replace(/[),.;!?]+$/, "");
}

export function normalizeInternalMemeLink(rawUrl: string): string | null {
  const cleaned = trimTrailingLinkPunctuation(rawUrl);
  if (!cleaned) {
    return null;
  }

  const isAbsolute = /^https?:\/\//i.test(cleaned);

  let parsed: URL;
  try {
    parsed = isAbsolute ? new URL(cleaned) : new URL(cleaned, "https://madnesstours.local");
  } catch {
    return null;
  }

  if (isAbsolute && !isAllowedInternalMemeHost(parsed.hostname)) {
    return null;
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!pathname.startsWith(INTERNAL_MEDIA_PATH_PREFIX)) {
    return null;
  }

  return pathname.toLowerCase();
}

function urlsMatchInternalMemeLink(url: string, normalizedTarget: string): boolean {
  const normalized = normalizeInternalMemeLink(url);
  return normalized !== null && normalized === normalizedTarget;
}

export async function listLibraryMemesForViewer(viewer: MemeViewer): Promise<LibraryMemeDto[]> {
  const [assetMemes, legacyMemes] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: {
        scope: MediaAssetScope.MEME,
        scopeRef: "library",
        status: MediaAssetStatus.READY,
        deletedAt: null,
        fileType: {
          in: [MediaAssetKind.IMAGE, MediaAssetKind.GIF]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 500,
      select: {
        id: true,
        fileType: true,
        fullUrl: true,
        storageUrl: true,
        cardUrl: true,
        thumbnailUrl: true,
        description: true,
        createdAt: true,
        uploader: {
          select: {
            id: true,
            username: true
          }
        }
      }
    }),
    prisma.mediaItem.findMany({
      where: {
        tripId: null,
        title: {
          startsWith: LIBRARY_MEME_PREFIX
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 300,
      select: {
        id: true,
        url: true,
        description: true,
        createdAt: true,
        uploadedById: true,
        uploadedBy: {
          select: {
            username: true
          }
        }
      }
    })
  ]);

  const normalizedAssets: LibraryMemeDto[] = assetMemes
    .map<LibraryMemeDto | null>((item) => {
      const cardOrThumb = item.cardUrl ?? item.thumbnailUrl;
      if (!cardOrThumb) {
        console.warn("library memes: asset missing display derivative", {
          assetId: item.id
        });
        return null;
      }

      return {
        id: item.id,
        imageDataUrl: cardOrThumb,
        thumbnailUrl: item.thumbnailUrl ?? cardOrThumb,
        uploader: item.uploader.username,
        caption: item.description ?? "",
        createdAt: item.createdAt.getTime(),
        source: "asset",
        fileType: item.fileType === MediaAssetKind.GIF ? "GIF" : "IMAGE",
        copyUrl: item.fileType === MediaAssetKind.GIF ? item.fullUrl ?? item.storageUrl ?? cardOrThumb : cardOrThumb,
        canDelete: viewer.role === "admin" || item.uploader.id === viewer.id
      };
    })
    .filter((item): item is LibraryMemeDto => item !== null);

  const normalizedLegacy: LibraryMemeDto[] = legacyMemes.map((item) => {
    const derived = deriveLegacyMemeDisplay(item.url);
    const fileType = inferLegacyMemeFileType(item.url);
    return {
      id: item.id,
      imageDataUrl: derived.imageDataUrl,
      thumbnailUrl: derived.thumbnailUrl,
      uploader: item.uploadedBy.username,
      caption: item.description ?? "",
      createdAt: item.createdAt.getTime(),
      source: "legacy",
      fileType,
      copyUrl: fileType === "GIF" ? item.url : derived.imageDataUrl,
      canDelete: viewer.role === "admin" || item.uploadedById === viewer.id
    };
  });

  return [...normalizedAssets, ...normalizedLegacy].sort((a, b) => b.createdAt - a.createdAt).slice(0, 600);
}

export function findLibraryMemeByLink(memes: LibraryMemeDto[], rawUrl: string): LibraryMemeDto | null {
  const normalizedTarget = normalizeInternalMemeLink(rawUrl);
  if (!normalizedTarget) {
    return null;
  }

  for (const meme of memes) {
    if (
      urlsMatchInternalMemeLink(meme.copyUrl, normalizedTarget) ||
      urlsMatchInternalMemeLink(meme.imageDataUrl, normalizedTarget) ||
      urlsMatchInternalMemeLink(meme.thumbnailUrl, normalizedTarget)
    ) {
      return meme;
    }
  }

  return null;
}
