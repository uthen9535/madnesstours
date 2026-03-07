"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NeonButton } from "@/components/NeonButton";
import {
  mediaCardUrl,
  mediaFullUrl,
  mediaThumbnailUrl,
  mediaVideoPlaybackUrl,
  mediaVideoPosterUrl,
  mediaVideoPreviewUrl
} from "@/lib/media/render";

type TripMediaGalleryProps = {
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
    ownerId: string;
    uploadedByDisplayName: string;
    uploadedByUsername: string;
    canDelete: boolean;
  }>;
  deleteMediaAction: (formData: FormData) => Promise<void> | void;
  slug: string;
};

export function TripMediaGallery({ media, deleteMediaAction, slug }: TripMediaGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeViewerIndex, setActiveViewerIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(120);
  const readyMedia = useMemo(() => media.filter((item) => item.status === "READY"), [media]);
  const previewMedia = readyMedia.slice(0, 20);
  const modalMedia = readyMedia.slice(0, visibleCount);
  const hasMoreMedia = readyMedia.length > visibleCount;
  const isViewerOpen = activeViewerIndex !== null && readyMedia.length > 0;
  const activeViewerItem =
    activeViewerIndex !== null && activeViewerIndex >= 0 && activeViewerIndex < readyMedia.length
      ? readyMedia[activeViewerIndex]
      : null;

  useEffect(() => {
    if (!isOpen || !isViewerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveViewerIndex((current) => {
          if (current === null || readyMedia.length === 0) {
            return current;
          }
          return current === 0 ? readyMedia.length - 1 : current - 1;
        });
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveViewerIndex((current) => {
          if (current === null || readyMedia.length === 0) {
            return current;
          }
          return current === readyMedia.length - 1 ? 0 : current + 1;
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
  }, [isOpen, isViewerOpen, readyMedia.length]);

  const closeModal = () => {
    setIsOpen(false);
    setActiveViewerIndex(null);
    setVisibleCount(120);
  };

  const goPrev = () => {
    setActiveViewerIndex((current) => {
      if (current === null || readyMedia.length === 0) {
        return current;
      }
      return current === 0 ? readyMedia.length - 1 : current - 1;
    });
  };

  const goNext = () => {
    setActiveViewerIndex((current) => {
      if (current === null || readyMedia.length === 0) {
        return current;
      }
      return current === readyMedia.length - 1 ? 0 : current + 1;
    });
  };

  const modalNode = isOpen ? (
    <div className="trip-media-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="trip-media-group-title">
      <button type="button" className="trip-media-gallery-modal__scrim" aria-label="Close media gallery" onClick={closeModal} />
      <section className="trip-media-gallery-modal__panel">
        <header className="trip-media-gallery-modal__header">
          <h2 id="trip-media-group-title">File Gallery :: All Media</h2>
          <NeonButton type="button" onClick={closeModal}>
            Close
          </NeonButton>
        </header>
        {readyMedia.length === 0 ? (
          <p className="meta">No ready media yet.</p>
        ) : isViewerOpen && activeViewerItem ? (
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
              {modalMedia.map((item, index) => (
                <article key={`${item.source}-${item.id}`} className="trip-media-gallery-modal__item">
                  <button
                    type="button"
                    className="trip-media-gallery-modal__item-open"
                    onClick={() => setActiveViewerIndex(index)}
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
                  <p className="trip-media-gallery-modal__caption">File: {item.title}</p>
                  <p className="meta">Uploaded by: {item.uploadedByDisplayName} (@{item.uploadedByUsername})</p>
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
                </article>
              ))}
            </div>
            {hasMoreMedia ? (
              <div className="trip-media-gallery-modal__pagination">
                <NeonButton type="button" onClick={() => setVisibleCount((count) => count + 120)}>
                  Load More
                </NeonButton>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  ) : null;

  return (
    <div className="trip-media-gallery">
      {readyMedia.length === 0 ? (
        <p className="meta">Media is uploading or processing. Ready items will appear here automatically.</p>
      ) : (
        <>
          <div className="trip-media-gallery__tiny-grid">
            {previewMedia.map((item) => (
              <button
                key={`${item.source}-${item.id}`}
                type="button"
                className="trip-media-gallery__tiny-card"
                onClick={() => {
                  setIsOpen(true);
                  setActiveViewerIndex(null);
                }}
                aria-label="Open all media gallery"
              >
                {item.type === "IMAGE" ? (
                  <img
                    src={mediaThumbnailUrl(item)}
                    alt={item.title}
                    className="trip-media-gallery__tiny-preview"
                    loading="lazy"
                    width={320}
                    height={320}
                  />
                ) : (
                  (() => {
                    const poster = mediaVideoPosterUrl(item);
                    if (poster) {
                      return (
                        <video
                          poster={poster}
                          className="trip-media-gallery__tiny-preview"
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
                        className="trip-media-gallery__tiny-preview"
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
            ))}
          </div>
          {readyMedia.length > 20 ? (
            <button
              type="button"
              className="trip-media-gallery__browse-link"
              onClick={() => {
                setIsOpen(true);
                setActiveViewerIndex(null);
              }}
            >
              browse all media
            </button>
          ) : null}
        </>
      )}

      {modalNode && typeof document !== "undefined" ? createPortal(modalNode, document.body) : null}
    </div>
  );
}
