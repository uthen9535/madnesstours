"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import type { MediaAssetDto, MediaAssetScopeValue } from "@/lib/media/shared";
import { DEFAULT_UPLOAD_CHUNK_BYTES, MAX_UPLOAD_FILES_PER_BATCH } from "@/lib/media/shared";

type UploadPhase = "queued" | "uploading" | "processing" | "ready" | "failed";

type UploadQueueItem = {
  localId: string;
  file: File;
  phase: UploadPhase;
  progressPct: number;
  errorMessage: string | null;
  sessionId: string | null;
  assetId: string | null;
  asset: MediaAssetDto | null;
};

type MediaBatchUploaderProps = {
  scope: MediaAssetScopeValue;
  scopeRef?: string | null;
  title?: string;
  helperText?: string;
  accept?: string;
  description?: string;
  maxFiles?: number;
  chunkSizeBytes?: number;
  concurrency?: number;
  allowFolderSelection?: boolean;
  onItemReady?: (asset: MediaAssetDto) => void;
  onBatchSettled?: (summary: { ready: number; failed: number }) => void;
};

type FileSystemEntryReader = {
  readEntries: (success: (entries: FileSystemEntry[]) => void, error?: (error: DOMException) => void) => void;
};

type FileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => FileSystemEntryReader;
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

function toLocalId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${(mb / 1024).toFixed(1)} GB`;
}

function phaseLabel(phase: UploadPhase): string {
  if (phase === "queued") {
    return "Queued";
  }

  if (phase === "uploading") {
    return "Uploading";
  }

  if (phase === "processing") {
    return "Processing";
  }

  if (phase === "ready") {
    return "Ready";
  }

  return "Failed";
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function readFileEntry(entry: FileSystemEntry): Promise<File | null> {
  if (!entry.isFile || !entry.file) {
    return null;
  }

  return new Promise<File | null>((resolve) => {
    entry.file?.(
      (file) => resolve(file),
      () => resolve(null)
    );
  });
}

async function readDirectoryEntries(entry: FileSystemEntry): Promise<File[]> {
  if (!entry.isDirectory || !entry.createReader) {
    return [];
  }

  const reader = entry.createReader();
  const results: File[] = [];

  async function readBatch(): Promise<void> {
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(
        (batch) => resolve(batch),
        () => resolve([])
      );
    });

    if (entries.length === 0) {
      return;
    }

    for (const child of entries) {
      if (child.isFile) {
        const file = await readFileEntry(child);
        if (file) {
          results.push(file);
        }
        continue;
      }

      if (child.isDirectory) {
        const nested = await readDirectoryEntries(child);
        nested.forEach((file) => {
          results.push(file);
        });
      }
    }

    await readBatch();
  }

  await readBatch();
  return results;
}

async function extractDroppedFiles(event: DragEvent<HTMLDivElement>): Promise<File[]> {
  const withEntries = Array.from(event.dataTransfer.items ?? []) as DataTransferItemWithEntry[];
  const hasEntrySupport = withEntries.some((item) => typeof item.webkitGetAsEntry === "function");

  if (!hasEntrySupport) {
    return Array.from(event.dataTransfer.files ?? []);
  }

  const files: File[] = [];
  for (const item of withEntries) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (!entry) {
      continue;
    }

    if (entry.isFile) {
      const file = await readFileEntry(entry);
      if (file) {
        files.push(file);
      }
      continue;
    }

    if (entry.isDirectory) {
      const directoryFiles = await readDirectoryEntries(entry);
      directoryFiles.forEach((file) => {
        files.push(file);
      });
    }
  }

  return files;
}

function toQueueItems(files: File[]): UploadQueueItem[] {
  return files.map((file) => ({
    localId: toLocalId(file),
    file,
    phase: "queued",
    progressPct: 0,
    errorMessage: null,
    sessionId: null,
    assetId: null,
    asset: null
  }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function MediaBatchUploader({
  scope,
  scopeRef = null,
  title = "Click to add files or drag and drop here",
  helperText = "Chunked upload with automatic media optimization.",
  accept = "image/*,video/*",
  description,
  maxFiles = MAX_UPLOAD_FILES_PER_BATCH,
  chunkSizeBytes = DEFAULT_UPLOAD_CHUNK_BYTES,
  concurrency = 2,
  allowFolderSelection = true,
  onItemReady,
  onBatchSettled
}: MediaBatchUploaderProps) {
  const normalizedConcurrency = Math.max(1, Math.min(6, Math.floor(concurrency || 1)));
  const maxQueueFiles = Math.max(1, Math.min(2000, Math.floor(maxFiles || MAX_UPLOAD_FILES_PER_BATCH)));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<UploadQueueItem[]>([]);
  const activeWorkersRef = useRef(0);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const updateQueueItem = useCallback((localId: string, updater: (item: UploadQueueItem) => UploadQueueItem) => {
    setQueue((current) =>
      current.map((item) => {
        if (item.localId !== localId) {
          return item;
        }
        return updater(item);
      })
    );
  }, []);

  const overallProgress = useMemo(() => {
    if (queue.length === 0) {
      return 0;
    }

    const sum = queue.reduce((acc, item) => acc + item.progressPct, 0);
    return Math.min(100, Math.max(0, Math.round(sum / queue.length)));
  }, [queue]);

  const pendingCount = useMemo(() => queue.filter((item) => item.phase !== "ready").length, [queue]);

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }

    if (!allowFolderSelection) {
      folderInputRef.current.removeAttribute("webkitdirectory");
      folderInputRef.current.removeAttribute("directory");
      return;
    }

    folderInputRef.current.setAttribute("webkitdirectory", "");
    folderInputRef.current.setAttribute("directory", "");
  }, [allowFolderSelection]);

  const emitSettledIfDone = useCallback(() => {
    if (!onBatchSettled) {
      return;
    }

    const items = queueRef.current;
    if (items.length === 0) {
      return;
    }

    const active = items.some((item) => item.phase === "queued" || item.phase === "uploading" || item.phase === "processing");
    if (active) {
      return;
    }

    const ready = items.filter((item) => item.phase === "ready").length;
    const failed = items.filter((item) => item.phase === "failed").length;
    onBatchSettled({ ready, failed });
  }, [onBatchSettled]);

  const uploadOne = useCallback(
    async (localId: string) => {
      const queueItem = queueRef.current.find((item) => item.localId === localId);
      if (!queueItem) {
        return;
      }

      try {
        updateQueueItem(localId, (item) => ({
          ...item,
          phase: "uploading",
          progressPct: Math.max(item.progressPct, 1),
          errorMessage: null
        }));

        const initResponse = await fetch("/api/media/uploads/init", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            scope,
            scopeRef,
            filename: queueItem.file.name,
            mimeType: queueItem.file.type || "application/octet-stream",
            fileSizeBytes: queueItem.file.size,
            title: queueItem.file.name,
            description,
            chunkSizeBytes
          })
        });

        if (!initResponse.ok) {
          const message = await readApiError(initResponse, "Unable to initialize upload.");
          throw new Error(message);
        }

        const initPayload = (await initResponse.json()) as {
          session?: { sessionId: string; totalChunks: number; chunkSizeBytes: number };
        };

        const session = initPayload.session;
        if (!session?.sessionId || !session.totalChunks || !session.chunkSizeBytes) {
          throw new Error("Upload session response was incomplete.");
        }

        updateQueueItem(localId, (item) => ({
          ...item,
          sessionId: session.sessionId
        }));

        for (let chunkIndex = 0; chunkIndex < session.totalChunks; chunkIndex += 1) {
          const start = chunkIndex * session.chunkSizeBytes;
          const end = Math.min(start + session.chunkSizeBytes, queueItem.file.size);
          const chunk = queueItem.file.slice(start, end);

          const chunkFormData = new FormData();
          chunkFormData.append("sessionId", session.sessionId);
          chunkFormData.append("chunkIndex", String(chunkIndex));
          chunkFormData.append("totalChunks", String(session.totalChunks));
          chunkFormData.append("chunk", chunk, `${queueItem.file.name}.part`);

          const chunkResponse = await fetch("/api/media/uploads/chunk", {
            method: "POST",
            body: chunkFormData
          });

          if (!chunkResponse.ok) {
            const message = await readApiError(chunkResponse, "Unable to upload media chunk.");
            throw new Error(message);
          }

          const uploadProgress = Math.round(((chunkIndex + 1) / session.totalChunks) * 85);
          updateQueueItem(localId, (item) => ({
            ...item,
            phase: "uploading",
            progressPct: Math.max(1, uploadProgress)
          }));
        }

        const finalizeResponse = await fetch("/api/media/uploads/finalize", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sessionId: session.sessionId
          })
        });

        if (!finalizeResponse.ok) {
          const message = await readApiError(finalizeResponse, "Unable to finalize media upload.");
          throw new Error(message);
        }

        const finalizePayload = (await finalizeResponse.json()) as { assetId?: string };
        const assetId = finalizePayload.assetId;

        if (!assetId) {
          throw new Error("Missing media asset id after finalize.");
        }

        updateQueueItem(localId, (item) => ({
          ...item,
          assetId,
          phase: "processing",
          progressPct: 90
        }));

        for (let attempt = 0; attempt < 240; attempt += 1) {
          await wait(1500);
          const statusResponse = await fetch(`/api/media/uploads/status?assetId=${encodeURIComponent(assetId)}`, {
            method: "GET",
            cache: "no-store"
          });

          if (!statusResponse.ok) {
            if (statusResponse.status === 404) {
              continue;
            }
            const message = await readApiError(statusResponse, "Unable to read media processing status.");
            throw new Error(message);
          }

          const statusPayload = (await statusResponse.json()) as { asset?: MediaAssetDto };
          const asset = statusPayload.asset;

          if (!asset) {
            continue;
          }

          if (asset.status === "READY") {
            updateQueueItem(localId, (item) => ({
              ...item,
              phase: "ready",
              progressPct: 100,
              asset,
              errorMessage: null
            }));
            onItemReady?.(asset);
            return;
          }

          if (asset.status === "FAILED") {
            updateQueueItem(localId, (item) => ({
              ...item,
              phase: "failed",
              progressPct: 100,
              asset,
              errorMessage: asset.errorMessage ?? "Media processing failed."
            }));
            return;
          }

          const processingProgress = 90 + ((attempt % 10) + 1);
          updateQueueItem(localId, (item) => ({
            ...item,
            phase: "processing",
            progressPct: Math.min(99, processingProgress)
          }));
        }

        throw new Error("Media processing timed out. Retry to continue.");
      } catch (error) {
        updateQueueItem(localId, (item) => ({
          ...item,
          phase: "failed",
          progressPct: 100,
          errorMessage: error instanceof Error ? error.message : "Upload failed."
        }));
      }
    },
    [chunkSizeBytes, description, onItemReady, scope, scopeRef, updateQueueItem]
  );

  const pumpQueue = useCallback(() => {
    while (activeWorkersRef.current < normalizedConcurrency) {
      const nextItem = queueRef.current.find((item) => item.phase === "queued");
      if (!nextItem) {
        break;
      }

      activeWorkersRef.current += 1;
      const localId = nextItem.localId;
      void uploadOne(localId).finally(() => {
        activeWorkersRef.current = Math.max(0, activeWorkersRef.current - 1);
        pumpQueue();
        emitSettledIfDone();
      });
    }
  }, [emitSettledIfDone, normalizedConcurrency, uploadOne]);

  useEffect(() => {
    pumpQueue();
  }, [queue, pumpQueue]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setBatchError(null);
      setQueue((current) => {
        const available = Math.max(0, maxQueueFiles - current.length);
        if (available <= 0) {
          setBatchError(`Upload queue is full (max ${maxQueueFiles} files).`);
          return current;
        }

        const nextFiles = files.slice(0, available);
        if (files.length > available) {
          setBatchError(`Only ${available} more files can be added to this batch.`);
        }

        return [...current, ...toQueueItems(nextFiles)];
      });
    },
    [maxQueueFiles]
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const files = await extractDroppedFiles(event);
      addFiles(files);
    },
    [addFiles]
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      addFiles(files);
      event.currentTarget.value = "";
    },
    [addFiles]
  );

  const openFiles = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const openFolder = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const handleDropzoneKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFiles();
      }
    },
    [openFiles]
  );

  const retryItem = useCallback((localId: string) => {
    updateQueueItem(localId, (item) => ({
      ...item,
      phase: "queued",
      progressPct: 0,
      errorMessage: null,
      sessionId: null,
      assetId: null,
      asset: null
    }));
  }, [updateQueueItem]);

  return (
    <div className="trip-media-dropzone-stack">
      <input
        ref={inputRef}
        className="trip-media-dropzone__input"
        type="file"
        multiple
        accept={accept}
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        className="trip-media-dropzone__input"
        type="file"
        multiple
        accept={accept}
        onChange={handleFileInputChange}
      />
      <div
        className={`trip-media-dropzone${isDragging ? " trip-media-dropzone--dragging" : ""}`}
        onClick={openFiles}
        onKeyDown={handleDropzoneKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label={title}
      >
        <p className="trip-media-dropzone__title">{title}</p>
        <p className="meta">{helperText}</p>
        <div className="media-upload-dropzone__actions">
          <button
            type="button"
            className="neon-button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openFiles();
            }}
          >
            Add Files
          </button>
          {allowFolderSelection ? (
            <button
              type="button"
              className="neon-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openFolder();
              }}
            >
              Add Folder
            </button>
          ) : null}
        </div>
      </div>

      <p className="meta">
        Queue: {queue.length} file{queue.length === 1 ? "" : "s"} :: Pending {pendingCount}
      </p>

      <div className="media-upload-progress-overall" aria-label="Overall upload progress">
        <span style={{ width: `${overallProgress}%` }} />
      </div>
      <p className="meta">Overall progress: {overallProgress}%</p>

      {batchError ? <p className="meta" style={{ color: "#ff6b6b" }}>{batchError}</p> : null}

      {queue.length > 0 ? (
        <div className="media-upload-queue">
          {queue.map((item) => (
            <article key={item.localId} className={`media-upload-queue__item media-upload-queue__item--${item.phase}`}>
              <div className="media-upload-queue__head">
                <p className="media-upload-queue__title">{item.file.name}</p>
                <p className="meta">{formatBytes(item.file.size)} :: {phaseLabel(item.phase)}</p>
              </div>
              <div className="media-upload-progress-file" aria-label={`${item.file.name} progress`}>
                <span style={{ width: `${item.progressPct}%` }} />
              </div>
              {item.errorMessage ? <p className="meta" style={{ color: "#ff6b6b" }}>{item.errorMessage}</p> : null}
              {item.phase === "failed" ? (
                <div className="media-upload-queue__actions">
                  <button type="button" className="neon-button" onClick={() => retryItem(item.localId)}>
                    Retry
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default MediaBatchUploader;
