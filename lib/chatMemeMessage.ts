import type { LibraryMemeDto, LibraryMemeFileType, LibraryMemeSource } from "@/lib/libraryMemeTypes";

const CHAT_MEME_MESSAGE_PREFIX = "[chat_meme:";
const URL_CANDIDATE_PATTERN = /(https?:\/\/[^\s<>"']+|\/uploads\/media\/assets\/[^\s<>"']+)/gi;

export type ChatMemePayload = {
  id: string;
  source: LibraryMemeSource;
  fileType: LibraryMemeFileType;
  previewUrl: string;
  thumbnailUrl: string;
  copyUrl: string;
  caption: string;
  uploader: string;
  originalLink: string;
};

type ParsedChatMemeMessage =
  | {
      kind: "meme";
      payload: ChatMemePayload;
    }
  | {
      kind: "text";
      text: string;
    };

function trimTrailingLinkPunctuation(value: string): string {
  return value.trim().replace(/[),.;!?]+$/, "");
}

function isLibraryMemeSource(value: unknown): value is LibraryMemeSource {
  return value === "asset" || value === "legacy";
}

function isLibraryMemeFileType(value: unknown): value is LibraryMemeFileType {
  return value === "IMAGE" || value === "GIF";
}

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toSafeCaption(value: string): string {
  return value.trim().slice(0, 240);
}

function toSafeUrl(value: string): string {
  return value.trim().slice(0, 1200);
}

function toSafeTransportUrl(value: string, fallback: string): string {
  const normalized = value.trim();
  if (!normalized || /^data:/i.test(normalized)) {
    return fallback;
  }

  return toSafeUrl(normalized);
}

function toChatMemePayload(candidate: unknown): ChatMemePayload | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const id = coerceString(record.id);
  const source = record.source;
  const fileType = record.fileType;
  const previewUrl = coerceString(record.previewUrl);
  const thumbnailUrl = coerceString(record.thumbnailUrl);
  const copyUrl = coerceString(record.copyUrl);
  const caption = typeof record.caption === "string" ? record.caption : "";
  const uploader = coerceString(record.uploader);
  const originalLink = coerceString(record.originalLink);

  if (!id || !previewUrl || !thumbnailUrl || !copyUrl || !uploader || !originalLink) {
    return null;
  }
  if (!isLibraryMemeSource(source) || !isLibraryMemeFileType(fileType)) {
    return null;
  }

  return {
    id: id.slice(0, 120),
    source,
    fileType,
    previewUrl: toSafeUrl(previewUrl),
    thumbnailUrl: toSafeUrl(thumbnailUrl),
    copyUrl: toSafeUrl(copyUrl),
    caption: toSafeCaption(caption),
    uploader: uploader.slice(0, 120),
    originalLink: toSafeUrl(originalLink)
  };
}

export function createChatMemePayload(meme: LibraryMemeDto, originalLink: string): ChatMemePayload {
  const fallbackThumbnail = toSafeTransportUrl(meme.thumbnailUrl || meme.imageDataUrl || meme.copyUrl, "/icons/mascot.svg");
  const previewCandidate = meme.fileType === "GIF" ? meme.copyUrl : meme.imageDataUrl;
  const safePreviewUrl = toSafeTransportUrl(previewCandidate, fallbackThumbnail);
  const safeThumbnailUrl = toSafeTransportUrl(meme.thumbnailUrl || meme.imageDataUrl, safePreviewUrl);
  const safeCopyUrl = toSafeTransportUrl(meme.copyUrl || previewCandidate, safePreviewUrl);
  const safeOriginalLink = toSafeTransportUrl(originalLink || meme.copyUrl || meme.imageDataUrl, safeCopyUrl);

  return {
    id: meme.id,
    source: meme.source,
    fileType: meme.fileType,
    previewUrl: safePreviewUrl,
    thumbnailUrl: safeThumbnailUrl,
    copyUrl: safeCopyUrl,
    caption: toSafeCaption(meme.caption),
    uploader: meme.uploader,
    originalLink: safeOriginalLink
  };
}

export function encodeChatMemeMessage(payload: ChatMemePayload): string {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `${CHAT_MEME_MESSAGE_PREFIX}${encoded}]`;
}

export function parseChatMemeMessage(message: string): ParsedChatMemeMessage {
  const trimmed = message.trim();
  if (!trimmed.startsWith(CHAT_MEME_MESSAGE_PREFIX)) {
    return {
      kind: "text",
      text: message
    };
  }

  const closeIndex = trimmed.indexOf("]", CHAT_MEME_MESSAGE_PREFIX.length);
  if (closeIndex <= CHAT_MEME_MESSAGE_PREFIX.length) {
    return {
      kind: "text",
      text: message
    };
  }

  const encodedPayload = trimmed.slice(CHAT_MEME_MESSAGE_PREFIX.length, closeIndex);

  try {
    const payloadCandidate = JSON.parse(decodeURIComponent(encodedPayload));
    const payload = toChatMemePayload(payloadCandidate);
    if (!payload) {
      return {
        kind: "text",
        text: message
      };
    }

    return {
      kind: "meme",
      payload
    };
  } catch {
    return {
      kind: "text",
      text: message
    };
  }
}

export function extractLinkCandidatesFromMessage(message: string): string[] {
  const matches = message.match(URL_CANDIDATE_PATTERN) ?? [];
  const deduped = new Set<string>();
  for (const match of matches) {
    const candidate = trimTrailingLinkPunctuation(match);
    if (candidate) {
      deduped.add(candidate);
    }
  }

  return [...deduped];
}
