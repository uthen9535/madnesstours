"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MediaBatchUploader } from "@/components/media/MediaBatchUploader";
import { NeonButton } from "@/components/NeonButton";
import {
  mediaCardUrl,
  mediaFullUrl,
  mediaThumbnailUrl,
  mediaVideoPlaybackUrl,
  mediaVideoPosterUrl,
  mediaVideoPreviewUrl
} from "@/lib/media/render";

type TripMediaFilesBoardProps = {
  slug: string;
  folders: Array<{
    ownerId: string;
    ownerDisplayName: string;
    ownerUsername: string;
    name: string;
    itemCount: number;
    canDelete: boolean;
    isOwnFile: boolean;
  }>;
  media: Array<{
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
  }>;
  deleteFolderAction: (formData: FormData) => Promise<void> | void;
  deleteMediaAction: (formData: FormData) => Promise<void> | void;
  reprocessMediaAction: (formData: FormData) => Promise<void> | void;
};

function statusRank(status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED"): number {
  if (status === "READY") {
    return 0;
  }

  if (status === "PROCESSING") {
    return 1;
  }

  if (status === "UPLOADING") {
    return 2;
  }

  return 3;
}

function statusLabel(status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED"): string {
  if (status === "UPLOADING") {
    return "Uploading";
  }

  if (status === "PROCESSING") {
    return "Processing";
  }

  if (status === "READY") {
    return "Ready";
  }

  return "Failed";
}

function durationLabel(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function TripMediaFilesBoard({
  slug,
  folders,
  media,
  deleteFolderAction,
  deleteMediaAction,
  reprocessMediaAction
}: TripMediaFilesBoardProps) {
  const router = useRouter();
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const [activeViewerIndex, setActiveViewerIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const activeFolder = folders.find((folder) => folder.ownerId === activeOwnerId) ?? null;

  const previewByOwner = useMemo(() => {
    const map = new Map<string, typeof media>();
    for (const item of media) {
      const existing = map.get(item.ownerId) ?? [];
      existing.push(item);
      map.set(item.ownerId, existing);
    }

    for (const [ownerId, items] of map.entries()) {
      const sorted = [...items].sort((a, b) => {
        const statusDiff = statusRank(a.status) - statusRank(b.status);
        if (statusDiff !== 0) {
          return statusDiff;
        }
        return a.title.localeCompare(b.title);
      });
      map.set(ownerId, sorted.slice(0, 4));
    }

    return map;
  }, [media]);

  const activeMedia = useMemo(() => {
    if (!activeOwnerId) {
      return [];
    }

    const ownerMedia = media.filter((item) => item.ownerId === activeOwnerId);
    return ownerMedia.sort((a, b) => statusRank(a.status) - statusRank(b.status));
  }, [activeOwnerId, media]);

  const displayedActiveMedia = activeMedia.slice(0, visibleCount);
  const hasMoreActiveMedia = activeMedia.length > visibleCount;
  const activeOwnerName =
    activeMedia[0]?.uploadedByDisplayName ?? folders.find((folder) => folder.ownerId === activeOwnerId)?.ownerDisplayName ?? "";
  const isViewerOpen = activeViewerIndex !== null && activeMedia.length > 0;

  useEffect(() => {
    if (!isViewerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveViewerIndex((current) => {
          if (current === null || activeMedia.length === 0) {
            return current;
          }
          return current === 0 ? activeMedia.length - 1 : current - 1;
        });
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveViewerIndex((current) => {
          if (current === null || activeMedia.length === 0) {
            return current;
          }
          return current === activeMedia.length - 1 ? 0 : current + 1;
        });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveViewerIndex(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeMedia.length, isViewerOpen]);

  const activeViewerItem =
    activeViewerIndex !== null && activeViewerIndex >= 0 && activeViewerIndex < activeMedia.length
      ? activeMedia[activeViewerIndex]
      : null;

  const openViewer = (index: number) => {
    const item = activeMedia[index];
    if (!item || item.status !== "READY") {
      return;
    }

    setActiveViewerIndex(index);
  };

  const closeModal = () => {
    setActiveOwnerId(null);
    setActiveViewerIndex(null);
    setVisibleCount(60);
  };

  const goPrev = () => {
    setActiveViewerIndex((current) => {
      if (current === null || activeMedia.length === 0) {
        return current;
      }
      return current === 0 ? activeMedia.length - 1 : current - 1;
    });
  };

  const goNext = () => {
    setActiveViewerIndex((current) => {
      if (current === null || activeMedia.length === 0) {
        return current;
      }
      return current === activeMedia.length - 1 ? 0 : current + 1;
    });
  };

  const modalNode = activeOwnerId ? (
    <div className="trip-media-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="trip-file-gallery-title">
      <button type="button" className="trip-media-gallery-modal__scrim" aria-label="Close file gallery" onClick={closeModal} />
      <section className="trip-media-gallery-modal__panel">
        <header className="trip-media-gallery-modal__header">
          <h2 id="trip-file-gallery-title">File Gallery :: {activeOwnerName}</h2>
          <NeonButton type="button" onClick={closeModal}>
            Close
          </NeonButton>
        </header>
        {isViewerOpen && activeViewerItem ? (
          <div className="trip-media-gallery-modal__viewer">
            <div className="trip-media-gallery-modal__viewer-controls">
              <NeonButton type="button" onClick={goPrev} aria-label="Previous media item">
                ◀
              </NeonButton>
              <NeonButton type="button" onClick={() => setActiveViewerIndex(null)}>
                Back
              </NeonButton>
              <NeonButton type="button" onClick={goNext} aria-label="Next media item">
                ▶
              </NeonButton>
            </div>
            <div className="trip-media-gallery-modal__viewer-stage">
              {activeViewerItem.type === "IMAGE" ? (
                <img
                  src={mediaFullUrl(activeViewerItem)}
                  alt={activeViewerItem.title}
                  className="trip-media-gallery-modal__viewer-preview"
                  width={activeViewerItem.width ?? 1200}
                  height={activeViewerItem.height ?? 900}
                />
              ) : (
                <video
                  controls
                  src={mediaVideoPlaybackUrl(activeViewerItem)}
                  poster={mediaVideoPosterUrl(activeViewerItem) ?? undefined}
                  className="trip-media-gallery-modal__viewer-preview"
                >
                  <track kind="captions" />
                </video>
              )}
            </div>
            <p className="trip-media-gallery-modal__caption">File: {activeViewerItem.title}</p>
            <p className="meta">
              Uploaded by: {activeViewerItem.uploadedByDisplayName} (@{activeViewerItem.uploadedByUsername})
            </p>
            {activeViewerItem.durationMs ? <p className="meta">Duration: {durationLabel(activeViewerItem.durationMs)}</p> : null}
            {activeViewerItem.canDelete ? (
              <form action={deleteMediaAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="mediaId" value={activeViewerItem.id} />
                <input type="hidden" name="source" value={activeViewerItem.source} />
                <NeonButton type="submit" className="trip-media-gallery__delete-button">
                  Delete Media
                </NeonButton>
              </form>
            ) : null}
          </div>
        ) : (
          <>
            <div className="trip-media-gallery-modal__grid">
              {displayedActiveMedia.map((item, index) => (
                <article key={`${item.source}-${item.id}`} className="trip-media-gallery-modal__item">
                  {item.status === "READY" ? (
                    <button
                      type="button"
                      className="trip-media-gallery-modal__item-open"
                      onClick={() => openViewer(index)}
                      aria-label={`Open ${item.title} full view`}
                    >
                      {item.type === "IMAGE" ? (
                        <img
                          src={mediaCardUrl(item)}
                          alt={item.title}
                          className="trip-media-gallery-modal__preview"
                          loading="lazy"
                          width={640}
                          height={640}
                        />
                      ) : (
                        (() => {
                          const poster = mediaVideoPosterUrl(item);
                          if (poster) {
                            return (
                              <video
                                poster={poster}
                                className="trip-media-gallery-modal__preview"
                                muted
                                playsInline
                                preload="none"
                              >
                                <track kind="captions" />
                              </video>
                            );
                          }

                          return (
                            <video
                              src={mediaVideoPreviewUrl(item)}
                              className="trip-media-gallery-modal__preview"
                              muted
                              playsInline
                              preload="metadata"
                            >
                              <track kind="captions" />
                            </video>
                          );
                        })()
                      )}
                    </button>
                  ) : (
                    <div className="trip-media-gallery-modal__status-card">
                      <p>{statusLabel(item.status)}</p>
                      {item.errorMessage ? <p className="meta">{item.errorMessage}</p> : <p className="meta">Optimization in queue.</p>}
                    </div>
                  )}
                  <p className="trip-media-gallery-modal__caption">File: {item.title}</p>
                  <p className="meta">Status: {statusLabel(item.status)}</p>
                  <p className="meta">
                    Uploaded by: {item.uploadedByDisplayName} (@{item.uploadedByUsername})
                  </p>
                  {item.canDelete ? (
                    <form action={deleteMediaAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="mediaId" value={item.id} />
                      <input type="hidden" name="source" value={item.source} />
                      <NeonButton type="submit" className="trip-media-gallery__delete-button">
                        Delete Media
                      </NeonButton>
                    </form>
                  ) : null}
                  {item.source === "asset" && item.status === "FAILED" && item.canDelete ? (
                    <form action={reprocessMediaAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="mediaId" value={item.id} />
                      <NeonButton type="submit">Reprocess</NeonButton>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
            {hasMoreActiveMedia ? (
              <div className="trip-media-gallery-modal__pagination">
                <NeonButton type="button" onClick={() => setVisibleCount((current) => current + 60)}>
                  Load More
                </NeonButton>
              </div>
            ) : null}
          </>
        )}
        {activeFolder?.isOwnFile && !isViewerOpen ? (
          <div className="trip-files-board__modal-upload">
            <MediaBatchUploader
              scope="TOUR"
              scopeRef={slug}
              title="Drop files/folders into your member folder"
              helperText="Uploads are chunked automatically, then optimized to web-ready derivatives."
              onBatchSettled={() => {
                router.refresh();
              }}
            />
          </div>
        ) : null}
      </section>
    </div>
  ) : null;

  return (
    <div className="trip-files-board">
      <div className="trip-files-board__grid">
        {folders.map((folder) => {
          const previews = previewByOwner.get(folder.ownerId) ?? [];
          return (
            <article key={folder.ownerId} className="trip-files-board__card">
              <button
                type="button"
                className="trip-files-board__open"
                onClick={() => {
                  setActiveOwnerId(folder.ownerId);
                  setActiveViewerIndex(null);
                  setVisibleCount(60);
                }}
                aria-label={`Open ${folder.name}`}
              >
                <p className="trip-files-board__title">{folder.name}</p>
                <p className="meta">
                  @{folder.ownerUsername} :: {folder.itemCount} media
                </p>
                <div className="trip-files-board__preview-grid">
                  {previews.length > 0 ? (
                    previews.map((item) => {
                      if (item.status !== "READY") {
                        return (
                          <div key={item.id} className="trip-files-board__preview trip-files-board__preview--status">
                            {statusLabel(item.status)}
                          </div>
                        );
                      }

                      if (item.type === "IMAGE") {
                        return (
                          <img
                            key={item.id}
                            src={mediaThumbnailUrl(item)}
                            alt={item.title}
                            className="trip-files-board__preview"
                            loading="lazy"
                            width={320}
                            height={320}
                          />
                        );
                      }

                      return (
                        (() => {
                          const poster = mediaVideoPosterUrl(item);
                          if (poster) {
                            return (
                              <video
                                key={item.id}
                                poster={poster}
                                className="trip-files-board__preview"
                                muted
                                playsInline
                                preload="none"
                              >
                                <track kind="captions" />
                              </video>
                            );
                          }

                          return (
                            <video
                              key={item.id}
                              src={mediaVideoPreviewUrl(item)}
                              className="trip-files-board__preview"
                              muted
                              playsInline
                              preload="metadata"
                            >
                              <track kind="captions" />
                            </video>
                          );
                        })()
                      );
                    })
                  ) : (
                    <div className="trip-files-board__preview-empty">Empty File</div>
                  )}
                </div>
              </button>

              {folder.canDelete ? (
                <form action={deleteFolderAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="folderOwnerId" value={folder.ownerId} />
                  <NeonButton type="submit" className="trip-media-gallery__delete-button">
                    Delete
                  </NeonButton>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>

      {modalNode && typeof document !== "undefined" ? createPortal(modalNode, document.body) : null}
    </div>
  );
}
