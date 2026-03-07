import type { MediaAssetKindValue } from "@/lib/media/shared";

type MediaRenderable = {
  fileType?: MediaAssetKindValue | "IMAGE" | "VIDEO" | "GIF" | "OTHER";
  storageUrl?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  cardUrl?: string | null;
  mediumUrl?: string | null;
  largeUrl?: string | null;
  modalUrl?: string | null;
  fullUrl?: string | null;
  posterUrl?: string | null;
  previewUrl?: string | null;
  playbackUrl?: string | null;
};

const ORIGINAL_ASSET_URL_PATTERN = /\/assets\/[^/]+\/original\.[a-z0-9]+(?:$|[?#])/i;
const VIDEO_URL_PATTERN = /\.(mp4|mov|webm|mkv|avi|m4v)(?:$|[?#])/i;
const MEDIA_PLACEHOLDER_URL = "/icons/mascot.svg";

function storageUrl(item: MediaRenderable): string | null {
  return item.storageUrl ?? item.url ?? null;
}

function isOriginalAssetUrl(url: string): boolean {
  return ORIGINAL_ASSET_URL_PATTERN.test(url);
}

function isVideoUrl(url: string): boolean {
  return url.startsWith("data:video/") || VIDEO_URL_PATTERN.test(url);
}

function firstUrl(
  candidates: Array<string | null | undefined>,
  options?: {
    allowOriginalAssetUrl?: boolean;
    allowVideo?: boolean;
  }
): string | null {
  const allowOriginalAssetUrl = options?.allowOriginalAssetUrl ?? true;
  const allowVideo = options?.allowVideo ?? true;

  for (const value of candidates) {
    if (!value) {
      continue;
    }
    if (!allowOriginalAssetUrl && isOriginalAssetUrl(value)) {
      continue;
    }
    if (!allowVideo && isVideoUrl(value)) {
      continue;
    }
    return value;
  }

  return null;
}

export function mediaThumbnailUrl(item: MediaRenderable): string {
  return (
    firstUrl([item.thumbnailUrl, item.cardUrl, item.posterUrl, item.previewUrl, item.url, item.storageUrl], {
      allowOriginalAssetUrl: false,
      allowVideo: false
    }) ?? MEDIA_PLACEHOLDER_URL
  );
}

export function mediaCardUrl(item: MediaRenderable): string {
  return (
    firstUrl([item.cardUrl, item.mediumUrl, item.thumbnailUrl, item.posterUrl, item.previewUrl, item.url, item.storageUrl], {
      allowOriginalAssetUrl: false
    }) ?? mediaThumbnailUrl(item)
  );
}

export function mediaModalUrl(item: MediaRenderable): string {
  return firstUrl([item.modalUrl, item.largeUrl, item.fullUrl, item.playbackUrl, item.previewUrl, item.url, item.storageUrl]) ?? "";
}

export function mediaFullUrl(item: MediaRenderable): string {
  return firstUrl([item.fullUrl, item.modalUrl, item.largeUrl, item.mediumUrl, item.cardUrl, item.url, item.storageUrl]) ?? mediaModalUrl(item);
}

export function mediaVideoPreviewUrl(item: MediaRenderable): string {
  return (
    firstUrl([item.previewUrl, item.playbackUrl, item.cardUrl, item.url, item.storageUrl], {
      allowOriginalAssetUrl: false
    }) ?? ""
  );
}

export function mediaVideoPlaybackUrl(item: MediaRenderable): string {
  return firstUrl([item.playbackUrl, item.previewUrl, item.url, storageUrl(item)]) ?? "";
}

export function mediaVideoPosterUrl(item: MediaRenderable): string | null {
  return firstUrl([item.posterUrl, item.thumbnailUrl, item.cardUrl], {
    allowOriginalAssetUrl: false,
    allowVideo: false
  });
}

export function mediaImageSrcSet(item: MediaRenderable): string | undefined {
  const candidates: Array<[string | null | undefined, number]> = [
    [item.thumbnailUrl, 320],
    [item.cardUrl, 640],
    [item.mediumUrl, 1200],
    [item.largeUrl, 1800],
    [item.fullUrl, 2600]
  ];

  const entries = candidates
    .filter((candidate): candidate is [string, number] => Boolean(candidate[0]))
    .filter(([url]) => !isOriginalAssetUrl(url))
    .map(([url, width]) => `${url} ${width}w`);

  if (entries.length === 0) {
    return undefined;
  }

  return entries.join(", ");
}
