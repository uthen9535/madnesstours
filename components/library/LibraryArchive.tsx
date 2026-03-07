"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MediaBatchUploader } from "@/components/media/MediaBatchUploader";
import { NeonButton } from "@/components/NeonButton";
import type { MediaAssetDto } from "@/lib/media/shared";
import type { LibraryMemeDto } from "@/lib/libraryMemeTypes";
import styles from "@/styles/library.module.css";

type MemeItem = LibraryMemeDto;

type GlossaryEntry = {
  term: string;
  definition: string;
  icon: string;
};

const PAGE_SIZE = 12;

const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Shot o'clock",
    definition: "If declared, anyone within the immediate group must partake in a round of shots.",
    icon: "▦"
  },
  {
    term: "Deep Chats",
    definition: "If declared, be prepared to go full seer. We'll look beyond space and time.",
    icon: "☍"
  },
  {
    term: "Puncher",
    definition: "The number of Madness Tours a person has attended.",
    icon: "◍"
  },
  {
    term: "Triple AAA rated",
    definition: "Attended at least 75% of Madness Tours.",
    icon: "▲"
  },
  {
    term: "Baby Shotz",
    definition: "A baby conceived near or around lascivious partying.",
    icon: "◉"
  },
  {
    term: "Mayhem",
    definition: "When a member extends a Madness trip for mischief, adventure, and general chaos.",
    icon: "✶"
  },
  {
    term: "A Reuben",
    definition: "Nobody knows where this came from.",
    icon: "?"
  }
];

function formatStamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function assetToMeme(asset: MediaAssetDto): MemeItem {
  const displayUrl = asset.cardUrl ?? asset.thumbnailUrl ?? "/icons/mascot.svg";
  const isGif = asset.fileType === "GIF";
  const preferredCopyUrl = isGif ? asset.fullUrl ?? asset.storageUrl ?? displayUrl : displayUrl;
  return {
    id: asset.id,
    imageDataUrl: displayUrl,
    thumbnailUrl: asset.thumbnailUrl ?? displayUrl,
    uploader: asset.uploaderUsername,
    caption: asset.description ?? "",
    createdAt: asset.createdAt,
    source: "asset",
    fileType: isGif ? "GIF" : "IMAGE",
    copyUrl: preferredCopyUrl,
    canDelete: true
  };
}

export function LibraryArchive() {
  const [memes, setMemes] = useState<MemeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(8);
  const [showModal, setShowModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [caption, setCaption] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(() => new Set());

  const loadMemes = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await fetch("/api/library/memes", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Unable to load meme archive.");
      }

      const payload = (await response.json()) as { memes?: MemeItem[] };
      const safeMemes = Array.isArray(payload.memes) ? payload.memes : [];
      setMemes(safeMemes);
      setLoadingProgress(100);
    } catch (error) {
      console.error("Meme archive fetch failed.", error);
      setLoadError("Unable to load meme archive right now.");
      setLoadingProgress(100);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemes();
  }, [loadMemes]);

  useEffect(() => {
    if (!showModal) {
      return;
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setShowModal(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showModal]);

  useEffect(() => {
    if (!loading) {
      const timeout = window.setTimeout(() => {
        setLoadingProgress(0);
      }, 320);
      return () => window.clearTimeout(timeout);
    }

    setLoadingProgress((current) => (current > 0 ? current : 8));
    const interval = window.setInterval(() => {
      setLoadingProgress((current) => {
        if (current >= 92) {
          return 92;
        }
        const step = Math.max(1, Math.round((96 - current) / 10));
        return Math.min(92, current + step);
      });
    }, 130);

    return () => window.clearInterval(interval);
  }, [loading]);

  const normalizedSearch = useMemo(() => searchText.trim().toLowerCase().replace(/^@+/, ""), [searchText]);

  const filteredMemes = useMemo(() => {
    if (!normalizedSearch) {
      return memes;
    }
    return memes.filter((meme) => {
      const uploaderMatch = meme.uploader.toLowerCase().includes(normalizedSearch);
      const captionMatch = meme.caption.toLowerCase().includes(normalizedSearch);
      return uploaderMatch || captionMatch;
    });
  }, [memes, normalizedSearch]);

  const visibleMemes = useMemo(() => filteredMemes.slice(0, visibleCount), [filteredMemes, visibleCount]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [normalizedSearch]);

  function openModal() {
    setShowModal(true);
    setCaption("");
    setUploadMessage(null);
    setActionMessage(null);
  }

  function closeModal() {
    setShowModal(false);
    setCaption("");
    setUploadMessage(null);
  }

  async function handleDeleteMeme(meme: MemeItem): Promise<void> {
    if (!meme.canDelete) {
      return;
    }

    const key = `${meme.source}:${meme.id}`;
    if (deletingKeys.has(key)) {
      return;
    }

    setActionMessage(null);
    setLoadError(null);
    setDeletingKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });

    try {
      const response = await fetch(`/api/library/memes/${encodeURIComponent(meme.id)}?source=${meme.source}`, {
        method: "DELETE",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to delete meme.");
      }

      setMemes((current) => current.filter((item) => !(item.id === meme.id && item.source === meme.source)));
      setActionMessage("Meme deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete meme.";
      setLoadError(message);
    } finally {
      setDeletingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleMemeClick(meme: MemeItem): Promise<void> {
    const copied = await copyTextToClipboard(meme.copyUrl);
    if (copied) {
      setActionMessage(meme.fileType === "GIF" ? "GIF link copied." : "Meme link copied.");
      setLoadError(null);
      return;
    }

    setLoadError("Clipboard access unavailable in this browser context.");
  }

  return (
    <div className={styles.libraryPage}>
      <div className={styles.libraryBackdrop} aria-hidden>
        <span className={styles.pixelBlob} />
        <span className={styles.pixelBlob} />
        <span className={styles.pixelBlob} />
      </div>

      <div className={styles.libraryColumns}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>Primary Feature</p>
              <h2 className={styles.sectionTitle}>Meme Archive</h2>
              <p className={styles.sectionSub}>Community drops from the field, pinned to the club wall.</p>
            </div>
            <NeonButton type="button" className={styles.addMemeButton} onClick={openModal}>
              + ADD MEME
            </NeonButton>
          </div>

          <div className={styles.loadMeter}>
            <div className={styles.loadMeterTrack} aria-hidden>
              <span
                className={styles.loadMeterFill}
                style={{ width: `${loading ? Math.max(8, loadingProgress) : 100}%` }}
              />
            </div>
            <p className={styles.loadMeterLabel}>
              {loading ? `Loading archive... ${Math.max(8, Math.round(loadingProgress))}%` : `Archive synced: ${filteredMemes.length} meme(s)`}
            </p>
          </div>

          <div className={styles.archiveControls}>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by @uploader or caption..."
              className={styles.searchInput}
              aria-label="Search meme archive"
            />
          </div>

          {visibleMemes.length === 0 ? (
            <div className={styles.emptyWall}>
              {loading ? (
                <p>Loading archive...</p>
              ) : (
                <>
                  <p>{filteredMemes.length === 0 && memes.length > 0 ? "No memes match that search yet." : "No memes archived yet."}</p>
                  <span>
                    {filteredMemes.length === 0 && memes.length > 0
                      ? "Try a different uploader handle or caption keyword."
                      : "Drop the first artifact to wake up this wall."}
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className={styles.memeWall}>
              {visibleMemes.map((meme, index) => (
                <article key={`${meme.source}-${meme.id}`} className={`${styles.memeCard} ${styles[`tilt${index % 6}`]}`}>
                  <div className={styles.tapeTopLeft} aria-hidden />
                  <div className={styles.tapeTopRight} aria-hidden />
                  <button
                    type="button"
                    className={styles.memePreviewButton}
                    onClick={() => {
                      void handleMemeClick(meme);
                    }}
                    title={meme.fileType === "GIF" ? "Copy GIF link" : "Copy meme link"}
                  >
                    <img
                      src={meme.imageDataUrl}
                      alt={meme.caption || `Meme uploaded by ${meme.uploader}`}
                      className={styles.memeImage}
                      loading="lazy"
                      width={640}
                      height={640}
                    />
                  </button>
                  <div className={styles.memeMeta}>
                    <p className={styles.memeUploader}>@{meme.uploader}</p>
                    <p className={styles.memeTimestamp}>{formatStamp(meme.createdAt)}</p>
                    {meme.caption ? <p className={styles.memeCaption}>{meme.caption}</p> : null}
                    <p className={styles.memeHint}>{meme.fileType === "GIF" ? "Click image to copy GIF link." : "Click image to copy meme link."}</p>
                    {meme.canDelete ? (
                      <div className={styles.memeActions}>
                        <button
                          type="button"
                          className={styles.memeDeleteButton}
                          onClick={() => {
                            void handleDeleteMeme(meme);
                          }}
                          disabled={deletingKeys.has(`${meme.source}:${meme.id}`)}
                        >
                          {deletingKeys.has(`${meme.source}:${meme.id}`) ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
          {loadError ? <p className={styles.submitError}>{loadError}</p> : null}
          {actionMessage ? <p className={styles.sectionSub}>{actionMessage}</p> : null}

          {visibleCount < filteredMemes.length ? (
            <div className={styles.paginationRow}>
              <NeonButton type="button" className={styles.loadMoreButton} onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                Load More Artifacts
              </NeonButton>
            </div>
          ) : null}
        </section>

        <div className={styles.sideColumn}>
          <section className={styles.section}>
            <div className={styles.sectionHeaderCompact}>
              <p className={styles.kicker}>Dictionary Node</p>
              <h2 className={styles.sectionTitle}>Madness Glossary</h2>
            </div>
            <div className={styles.glossaryGrid}>
              {GLOSSARY.map((entry) => (
                <article key={entry.term} className={styles.glossaryCard} tabIndex={0}>
                  <div className={styles.glossaryHead}>
                    <span className={styles.glossaryIcon} aria-hidden>
                      {entry.icon}
                    </span>
                    <h3>{entry.term}</h3>
                  </div>
                  <p className={styles.glossaryDefinition}>{entry.definition}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeaderCompact}>
              <p className={styles.kicker}>Future Module</p>
              <h2 className={styles.sectionTitle}>Adventure Guides</h2>
            </div>
            <div className={styles.guidePlaceholder}>
              <div className={styles.lockBadge} aria-hidden>
                <span>◼</span>
                <span>LOCKED</span>
              </div>
              <p>Field guides and expedition intel will appear here once new missions are activated.</p>
            </div>
          </section>
        </div>
      </div>

      {showModal ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={closeModal}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Add meme" onClick={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3>Meme Uplink Terminal</h3>
              <button type="button" onClick={closeModal} className={styles.modalCloseButton} aria-label="Close meme upload modal">
                ✕
              </button>
            </header>

            <div className={styles.modalBody}>
              <label className={styles.fieldLabel}>
                Caption (optional)
                <textarea
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Drop context from the field..."
                  rows={3}
                  className={styles.captionInput}
                />
              </label>

              <MediaBatchUploader
                scope="MEME"
                scopeRef="library"
                accept="image/*"
                title="Drop memes (single or batch)"
                helperText="Chunked upload + automatic optimization runs after upload."
                description={caption.trim() || undefined}
                allowFolderSelection
                onItemReady={(asset) => {
                  setMemes((current) => [assetToMeme(asset), ...current]);
                  setVisibleCount((count) => Math.max(PAGE_SIZE, count + 1));
                }}
                onBatchSettled={({ ready, failed }) => {
                  if (ready > 0 && failed === 0) {
                    setUploadMessage(`${ready} meme${ready === 1 ? "" : "s"} uploaded and optimized.`);
                  } else if (ready > 0 && failed > 0) {
                    setUploadMessage(`${ready} ready, ${failed} failed. Retry failed files in queue.`);
                  } else if (failed > 0) {
                    setUploadMessage(`${failed} uploads failed. Retry failed files in queue.`);
                  }
                  void loadMemes();
                }}
              />

              {uploadMessage ? <p className={styles.submitError}>{uploadMessage}</p> : null}
            </div>

            <footer className={styles.modalFooter}>
              <button type="button" onClick={closeModal} className={styles.submitButton}>
                Close
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
