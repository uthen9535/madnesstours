export const MEDIA_ASSET_SCOPES = ["TOUR", "MEME", "RELIC_VAULT", "MEMBER_UPLOAD", "OTHER"] as const;
export type MediaAssetScopeValue = (typeof MEDIA_ASSET_SCOPES)[number];

export const MEDIA_ASSET_KINDS = ["IMAGE", "GIF", "VIDEO", "OTHER"] as const;
export type MediaAssetKindValue = (typeof MEDIA_ASSET_KINDS)[number];

export const MEDIA_ASSET_STATUSES = ["UPLOADING", "PROCESSING", "READY", "FAILED"] as const;
export type MediaAssetStatusValue = (typeof MEDIA_ASSET_STATUSES)[number];

export const DEFAULT_UPLOAD_CHUNK_BYTES = 512 * 1024;
export const MAX_UPLOAD_FILES_PER_BATCH = 1500;
export const MAX_UPLOAD_CHUNKS = 5000;

export const MEDIA_SIZE_LIMITS: Record<MediaAssetKindValue, number> = {
  IMAGE: 80 * 1024 * 1024,
  GIF: 120 * 1024 * 1024,
  VIDEO: 700 * 1024 * 1024,
  OTHER: 20 * 1024 * 1024
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif", "bmp", "heic", "heif", "tiff"]);
const GIF_EXTENSIONS = new Set(["gif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);

function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function inferMediaKind(input: { mimeType: string; filename: string }): MediaAssetKindValue {
  const mime = input.mimeType.toLowerCase();
  const ext = extensionOf(input.filename);

  if (mime === "image/gif" || GIF_EXTENSIONS.has(ext)) {
    return "GIF";
  }

  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
    return "IMAGE";
  }

  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) {
    return "VIDEO";
  }

  return "OTHER";
}

export function maxBytesForKind(kind: MediaAssetKindValue): number {
  return MEDIA_SIZE_LIMITS[kind];
}

export function isAllowedMediaKind(kind: MediaAssetKindValue): boolean {
  return kind !== "OTHER";
}

export function toUploadScope(value: string | null | undefined): MediaAssetScopeValue | null {
  if (!value) {
    return null;
  }

  const upper = value.toUpperCase();
  return MEDIA_ASSET_SCOPES.find((scope) => scope === upper) ?? null;
}

export function sanitizeUploadFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return "upload.bin";
  }

  return trimmed.replace(/[\u0000-\u001F\u007F/\\]+/g, "-").slice(0, 240);
}

export type MediaAssetDto = {
  id: string;
  scope: MediaAssetScopeValue;
  scopeRef: string | null;
  tourSlug: string | null;
  uploaderId: string;
  uploaderUsername: string;
  uploaderDisplayName: string;
  fileType: MediaAssetKindValue;
  status: MediaAssetStatusValue;
  title: string;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  storageUrl: string;
  thumbnailUrl: string | null;
  cardUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
  modalUrl: string | null;
  fullUrl: string | null;
  posterUrl: string | null;
  previewUrl: string | null;
  playbackUrl: string | null;
  errorMessage: string | null;
  createdAt: number;
};
