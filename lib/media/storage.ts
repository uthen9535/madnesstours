import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const STORAGE_ROOT = resolve(process.cwd(), process.env.MEDIA_STORAGE_ROOT ?? "public/uploads/media");
const STORAGE_PUBLIC_BASE = `/${(process.env.MEDIA_STORAGE_PUBLIC_BASE_URL ?? "/uploads/media")
  .replace(/^\/+/, "")
  .replace(/\/+$/, "")}`;

function normalizeStorageKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid media storage key.");
  }
  return normalized;
}

function absolutePathForKey(key: string): string {
  const normalized = normalizeStorageKey(key);
  const absolute = resolve(STORAGE_ROOT, normalized);
  if (absolute !== STORAGE_ROOT && !absolute.startsWith(`${STORAGE_ROOT}${sep}`)) {
    throw new Error("Invalid media storage path.");
  }
  return absolute;
}

export function storageAbsolutePathForKey(key: string): string {
  return absolutePathForKey(key);
}

export function storageUrlForKey(key: string): string {
  return `${STORAGE_PUBLIC_BASE}/${normalizeStorageKey(key)}`;
}

export function storageKeyFromUrl(url: string): string | null {
  if (!url.startsWith(STORAGE_PUBLIC_BASE)) {
    return null;
  }

  const remainder = url.slice(STORAGE_PUBLIC_BASE.length).replace(/^\/+/, "");
  if (!remainder) {
    return null;
  }

  return normalizeStorageKey(remainder);
}

export async function writeStorageObject(key: string, data: Buffer | Uint8Array): Promise<void> {
  const absolutePath = absolutePathForKey(key);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);
}

export async function writeStorageObjectFromFile(key: string, sourceFilePath: string): Promise<void> {
  const absolutePath = absolutePathForKey(key);
  await mkdir(dirname(absolutePath), { recursive: true });
  await copyFile(sourceFilePath, absolutePath);
}

export async function readStorageObject(key: string): Promise<Buffer> {
  return readFile(absolutePathForKey(key));
}

export async function deleteStorageObject(key: string): Promise<void> {
  await rm(absolutePathForKey(key), { force: true });
}

export async function deleteStoragePrefix(prefix: string): Promise<void> {
  const normalized = normalizeStorageKey(prefix);
  const absolutePath = absolutePathForKey(normalized);
  await rm(absolutePath, { recursive: true, force: true });
}

export function mediaStorageRootPath(): string {
  return STORAGE_ROOT;
}

export function mediaStorageJoin(...parts: string[]): string {
  return normalizeStorageKey(join(...parts));
}
