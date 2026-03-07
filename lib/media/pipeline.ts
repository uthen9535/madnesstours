import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import type { MediaAssetKind } from "@prisma/client";
import { probeVideoFile, runFfmpeg } from "@/lib/media/ffmpeg";
import { mediaStorageJoin, storageUrlForKey, writeStorageObject, writeStorageObjectFromFile } from "@/lib/media/storage";

type ProcessMediaInput = {
  assetId: string;
  fileType: MediaAssetKind;
  sourceFilePath: string;
  originalFilename: string;
};

export type ProcessedMediaPayload = {
  fileSizeBytes: number;
  storageKey: string;
  storageUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailKey: string | null;
  thumbnailUrl: string | null;
  cardKey: string | null;
  cardUrl: string | null;
  mediumKey: string | null;
  mediumUrl: string | null;
  largeKey: string | null;
  largeUrl: string | null;
  modalKey: string | null;
  modalUrl: string | null;
  fullKey: string | null;
  fullUrl: string | null;
  posterKey: string | null;
  posterUrl: string | null;
  previewKey: string | null;
  previewUrl: string | null;
  playbackKey: string | null;
  playbackUrl: string | null;
  derivatives: Record<string, string>;
};

type ImageVariant = {
  name: "thumbnail" | "card" | "medium" | "large" | "modal" | "full";
  maxWidth: number;
  quality: number;
};

const IMAGE_VARIANTS: ImageVariant[] = [
  { name: "thumbnail", maxWidth: 320, quality: 72 },
  { name: "card", maxWidth: 640, quality: 76 },
  { name: "medium", maxWidth: 1200, quality: 80 },
  { name: "large", maxWidth: 1800, quality: 82 },
  { name: "modal", maxWidth: 2200, quality: 84 },
  { name: "full", maxWidth: 2800, quality: 86 }
];

function normalizeExtension(filename: string, fileType: MediaAssetKind): string {
  const raw = extname(filename).toLowerCase();
  if (raw && /^\.[a-z0-9]{1,8}$/.test(raw)) {
    return raw;
  }

  if (fileType === "VIDEO") {
    return ".mp4";
  }

  if (fileType === "GIF") {
    return ".gif";
  }

  return ".jpg";
}

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "madness-media-"));
}

async function cleanupTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

async function fileSize(path: string): Promise<number> {
  const info = await stat(path);
  return info.size;
}

function initialPayload(key: string, url: string, sizeBytes: number): ProcessedMediaPayload {
  return {
    fileSizeBytes: sizeBytes,
    storageKey: key,
    storageUrl: url,
    width: null,
    height: null,
    durationMs: null,
    thumbnailKey: null,
    thumbnailUrl: null,
    cardKey: null,
    cardUrl: null,
    mediumKey: null,
    mediumUrl: null,
    largeKey: null,
    largeUrl: null,
    modalKey: null,
    modalUrl: null,
    fullKey: null,
    fullUrl: null,
    posterKey: null,
    posterUrl: null,
    previewKey: null,
    previewUrl: null,
    playbackKey: null,
    playbackUrl: null,
    derivatives: {}
  };
}

async function writeImageVariant(
  sourceFilePath: string,
  assetId: string,
  variant: ImageVariant
): Promise<{ webpKey: string; webpUrl: string; avifKey: string | null; avifUrl: string | null }> {
  const webpBuffer = await sharp(sourceFilePath)
    .rotate()
    .resize({
      width: variant.maxWidth,
      height: variant.maxWidth,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: variant.quality, effort: 4 })
    .toBuffer();

  const webpKey = mediaStorageJoin("assets", assetId, `${variant.name}.webp`);
  await writeStorageObject(webpKey, webpBuffer);

  let avifKey: string | null = null;
  let avifUrl: string | null = null;

  if (variant.name === "card" || variant.name === "large") {
    const avifBuffer = await sharp(sourceFilePath)
      .rotate()
      .resize({
        width: variant.maxWidth,
        height: variant.maxWidth,
        fit: "inside",
        withoutEnlargement: true
      })
      .avif({ quality: Math.max(42, variant.quality - 20), effort: 4 })
      .toBuffer();

    avifKey = mediaStorageJoin("assets", assetId, `${variant.name}.avif`);
    await writeStorageObject(avifKey, avifBuffer);
    avifUrl = storageUrlForKey(avifKey);
  }

  return {
    webpKey,
    webpUrl: storageUrlForKey(webpKey),
    avifKey,
    avifUrl
  };
}

async function processImageLike(input: ProcessMediaInput, payload: ProcessedMediaPayload): Promise<ProcessedMediaPayload> {
  const metadata = await sharp(input.sourceFilePath, { failOnError: false }).metadata();
  payload.width = metadata.width ?? null;
  payload.height = metadata.height ?? null;

  for (const variant of IMAGE_VARIANTS) {
    const result = await writeImageVariant(input.sourceFilePath, input.assetId, variant);
    payload.derivatives[`webp:${variant.name}`] = result.webpUrl;
    if (result.avifUrl) {
      payload.derivatives[`avif:${variant.name}`] = result.avifUrl;
    }

    if (variant.name === "thumbnail") {
      payload.thumbnailKey = result.webpKey;
      payload.thumbnailUrl = result.webpUrl;
      continue;
    }

    if (variant.name === "card") {
      payload.cardKey = result.webpKey;
      payload.cardUrl = result.webpUrl;
      continue;
    }

    if (variant.name === "medium") {
      payload.mediumKey = result.webpKey;
      payload.mediumUrl = result.webpUrl;
      continue;
    }

    if (variant.name === "large") {
      payload.largeKey = result.webpKey;
      payload.largeUrl = result.webpUrl;
      continue;
    }

    if (variant.name === "modal") {
      payload.modalKey = result.webpKey;
      payload.modalUrl = result.webpUrl;
      continue;
    }

    payload.fullKey = result.webpKey;
    payload.fullUrl = result.webpUrl;
  }

  payload.previewKey = payload.cardKey;
  payload.previewUrl = payload.cardUrl;
  return payload;
}

async function processGif(input: ProcessMediaInput, payload: ProcessedMediaPayload, tempDir: string): Promise<ProcessedMediaPayload> {
  const metadata = await sharp(input.sourceFilePath, { animated: true, failOnError: false }).metadata();
  payload.width = metadata.width ?? null;
  payload.height = metadata.height ?? null;

  const previewPath = join(tempDir, `gif-preview-${randomUUID()}.jpg`);
  const thumbPath = join(tempDir, `gif-thumb-${randomUUID()}.jpg`);

  await runFfmpeg([
    "-y",
    "-i",
    input.sourceFilePath,
    "-vf",
    "scale=640:-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-frames:v",
    "1",
    "-update",
    "1",
    previewPath
  ]);

  await runFfmpeg([
    "-y",
    "-i",
    input.sourceFilePath,
    "-vf",
    "scale=320:-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-frames:v",
    "1",
    "-update",
    "1",
    thumbPath
  ]);

  const previewBuffer = await readFile(previewPath);
  const thumbBuffer = await readFile(thumbPath);

  const previewKey = mediaStorageJoin("assets", input.assetId, "preview.jpg");
  const thumbKey = mediaStorageJoin("assets", input.assetId, "thumbnail.jpg");

  await writeStorageObject(previewKey, previewBuffer);
  await writeStorageObject(thumbKey, thumbBuffer);

  payload.previewKey = previewKey;
  payload.previewUrl = storageUrlForKey(previewKey);
  payload.thumbnailKey = thumbKey;
  payload.thumbnailUrl = storageUrlForKey(thumbKey);
  payload.cardKey = previewKey;
  payload.cardUrl = payload.previewUrl;
  payload.modalKey = payload.storageKey;
  payload.modalUrl = payload.storageUrl;
  payload.fullKey = payload.storageKey;
  payload.fullUrl = payload.storageUrl;
  payload.derivatives.previewJpg = payload.previewUrl;
  payload.derivatives.thumbnailJpg = payload.thumbnailUrl;

  return payload;
}

async function processVideo(input: ProcessMediaInput, payload: ProcessedMediaPayload, tempDir: string): Promise<ProcessedMediaPayload> {
  const playbackPath = join(tempDir, `video-playback-${randomUUID()}.mp4`);
  const previewPath = join(tempDir, `video-preview-${randomUUID()}.mp4`);
  const posterPath = join(tempDir, `video-poster-${randomUUID()}.jpg`);

  await runFfmpeg([
    "-y",
    "-i",
    input.sourceFilePath,
    "-vf",
    "scale=1920:-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    playbackPath
  ]);

  await runFfmpeg([
    "-y",
    "-i",
    input.sourceFilePath,
    "-vf",
    "scale=854:-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    previewPath
  ]);

  try {
    await runFfmpeg([
      "-y",
      "-ss",
      "00:00:01.000",
      "-i",
      input.sourceFilePath,
      "-vframes",
      "1",
      "-vf",
      "scale=1280:-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-update",
      "1",
      posterPath
    ]);
  } catch {
    await runFfmpeg([
      "-y",
      "-i",
      input.sourceFilePath,
      "-vframes",
      "1",
      "-vf",
      "scale=1280:-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-update",
      "1",
      posterPath
    ]);
  }

  const playbackKey = mediaStorageJoin("assets", input.assetId, "playback.mp4");
  const previewKey = mediaStorageJoin("assets", input.assetId, "preview.mp4");
  const posterKey = mediaStorageJoin("assets", input.assetId, "poster.jpg");

  await writeStorageObjectFromFile(playbackKey, playbackPath);
  await writeStorageObjectFromFile(previewKey, previewPath);
  await writeStorageObjectFromFile(posterKey, posterPath);

  const probe = await probeVideoFile(playbackPath);

  payload.width = probe.width;
  payload.height = probe.height;
  payload.durationMs = probe.durationMs;
  payload.playbackKey = playbackKey;
  payload.playbackUrl = storageUrlForKey(playbackKey);
  payload.previewKey = previewKey;
  payload.previewUrl = storageUrlForKey(previewKey);
  payload.posterKey = posterKey;
  payload.posterUrl = storageUrlForKey(posterKey);
  payload.thumbnailKey = posterKey;
  payload.thumbnailUrl = payload.posterUrl;
  payload.cardKey = previewKey;
  payload.cardUrl = payload.previewUrl;
  payload.modalKey = playbackKey;
  payload.modalUrl = payload.playbackUrl;
  payload.fullKey = playbackKey;
  payload.fullUrl = payload.playbackUrl;
  payload.derivatives.playbackMp4 = payload.playbackUrl;
  payload.derivatives.previewMp4 = payload.previewUrl;
  payload.derivatives.posterJpg = payload.posterUrl;

  return payload;
}

export async function processUploadedMedia(input: ProcessMediaInput): Promise<ProcessedMediaPayload> {
  const extension = normalizeExtension(input.originalFilename, input.fileType);
  const originalKey = mediaStorageJoin("assets", input.assetId, `original${extension}`);
  const originalUrl = storageUrlForKey(originalKey);
  const sizeBytes = await fileSize(input.sourceFilePath);
  const payload = initialPayload(originalKey, originalUrl, sizeBytes);

  await writeStorageObjectFromFile(originalKey, input.sourceFilePath);

  const tempDir = await createTempDir();
  try {
    if (input.fileType === "VIDEO") {
      return await processVideo(input, payload, tempDir);
    }

    if (input.fileType === "GIF") {
      return await processGif(input, payload, tempDir);
    }

    if (input.fileType === "IMAGE") {
      return await processImageLike(input, payload);
    }

    return payload;
  } finally {
    await cleanupTempDir(tempDir);
  }
}

export function titleFromOriginalFilename(filename: string): string {
  const base = basename(filename, extname(filename));
  const cleaned = base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  if (!cleaned) {
    return "Untitled Upload";
  }

  return cleaned
    .split(" ")
    .map((part) => (part.length > 1 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part.toUpperCase()))
    .join(" ");
}

export async function writeBufferToTempFile(buffer: Buffer, extension: string): Promise<string> {
  const tempDir = await createTempDir();
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const filePath = join(tempDir, `${Date.now()}-${randomUUID()}${safeExtension}`);
  await writeFile(filePath, buffer);
  return filePath;
}
