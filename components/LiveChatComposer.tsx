"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NeonButton } from "@/components/NeonButton";
import { formatEthUnitsFromBase } from "@/lib/ethPurse";
import type { LibraryMemeDto } from "@/lib/libraryMemeTypes";
import { formatBtcUnitsFromSats } from "@/lib/satoshi";

type LiveChatComposerProps = {
  action: (formData: FormData) => void | Promise<void>;
  textareaId: string;
  availableSats: number;
  availableEthUnits: number;
  showRecipientField?: boolean;
};

type TransferMode = "none" | "satoshi" | "ethereum";

type MemeArchivePayload = {
  memes?: LibraryMemeDto[];
  error?: string;
};

function toMemeSelectionKey(meme: Pick<LibraryMemeDto, "id" | "source">): string {
  return `${meme.source}:${meme.id}`;
}

export function LiveChatComposer({
  action,
  textareaId,
  availableSats,
  availableEthUnits,
  showRecipientField = true
}: LiveChatComposerProps) {
  const [transferMode, setTransferMode] = useState<TransferMode>("none");
  const [dropBurstId, setDropBurstId] = useState(0);
  const [showCurrencyGuide, setShowCurrencyGuide] = useState(false);
  const [showCultureModal, setShowCultureModal] = useState(false);
  const [cultureMemes, setCultureMemes] = useState<LibraryMemeDto[]>([]);
  const [cultureLoading, setCultureLoading] = useState(false);
  const [cultureError, setCultureError] = useState<string | null>(null);
  const [cultureSearch, setCultureSearch] = useState("");
  const [selectedCultureMemeKey, setSelectedCultureMemeKey] = useState<string | null>(null);
  const cultureSubmitRef = useRef<HTMLButtonElement | null>(null);
  const transferPanelOpen = transferMode !== "none";
  const transferIntent = transferMode === "none" ? undefined : transferMode;
  const formId = `${textareaId}-composer-form`;
  const normalizedCultureSearch = cultureSearch.trim().toLowerCase().replace(/^@+/, "");

  const selectedCultureMeme = useMemo(
    () => cultureMemes.find((item) => toMemeSelectionKey(item) === selectedCultureMemeKey) ?? null,
    [cultureMemes, selectedCultureMemeKey]
  );
  const filteredCultureMemes = useMemo(() => {
    if (!normalizedCultureSearch) {
      return cultureMemes;
    }

    return cultureMemes.filter((meme) => {
      const uploaderMatch = meme.uploader.toLowerCase().includes(normalizedCultureSearch);
      const captionMatch = meme.caption.toLowerCase().includes(normalizedCultureSearch);
      return uploaderMatch || captionMatch;
    });
  }, [cultureMemes, normalizedCultureSearch]);

  const loadCultureMemes = useCallback(async () => {
    setCultureLoading(true);
    setCultureError(null);

    try {
      const response = await fetch("/api/library/memes", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });

      const payload = (await response.json().catch(() => null)) as MemeArchivePayload | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load meme archive.");
      }

      const safeMemes = Array.isArray(payload?.memes) ? payload.memes : [];
      setCultureMemes(safeMemes);
      setSelectedCultureMemeKey((current) => {
        if (!current) {
          return null;
        }
        return safeMemes.some((item) => toMemeSelectionKey(item) === current) ? current : null;
      });
    } catch (error) {
      console.error("chat culture modal meme fetch failed", error);
      setCultureError(error instanceof Error ? error.message : "Unable to load meme archive.");
    } finally {
      setCultureLoading(false);
    }
  }, []);

  function openCultureModal() {
    setShowCultureModal(true);
    setCultureError(null);
    if (!cultureLoading && cultureMemes.length === 0) {
      void loadCultureMemes();
    }
  }

  function closeCultureModal() {
    setShowCultureModal(false);
    setCultureSearch("");
  }

  function submitCultureMeme() {
    if (!selectedCultureMeme || cultureLoading || typeof document === "undefined") {
      return;
    }

    const composerForm = document.getElementById(formId);
    if (!(composerForm instanceof HTMLFormElement)) {
      return;
    }

    closeCultureModal();
    composerForm.requestSubmit(cultureSubmitRef.current ?? undefined);
  }

  useEffect(() => {
    if (!dropBurstId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setDropBurstId(0);
    }, 2200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dropBurstId]);

  useEffect(() => {
    if (!showCurrencyGuide && !showCultureModal) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCurrencyGuide(false);
        setShowCultureModal(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCultureModal, showCurrencyGuide]);

  return (
    <form id={formId} action={action} className="form-grid live-chat-composer">
      <input type="hidden" name="selectedMemeId" value={selectedCultureMeme?.id ?? ""} />
      <input type="hidden" name="selectedMemeSource" value={selectedCultureMeme?.source ?? ""} />
      <input type="hidden" name="selectedMemeLink" value={selectedCultureMeme?.copyUrl ?? ""} />
      <button ref={cultureSubmitRef} type="submit" name="intent" value="meme" hidden aria-hidden tabIndex={-1} />
      <label htmlFor={textareaId}>Message (max 500 chars)</label>
      <textarea id={textareaId} name="message" maxLength={500} />
      <div className="live-chat-composer__status-row">
        <p className="meta live-chat-composer__purse">
          purse: {formatBtcUnitsFromSats(availableSats)} BTC // {formatEthUnitsFromBase(availableEthUnits)} ETH
        </p>
        <button
          type="button"
          className="live-chat-composer__info-button"
          onClick={() => setShowCurrencyGuide(true)}
          aria-label="Open field currency guide"
        >
          INFO
        </button>
      </div>
      <div className="live-chat-composer__actions-panel">
        <div className="live-chat-composer__actions">
          <NeonButton type="submit" name="intent" value="message" formNoValidate className="live-chat-composer__control live-chat-composer__control--live">
            Send To Live Chat
          </NeonButton>
          <NeonButton
            type="button"
            className={`live-chat-composer__control live-chat-composer__control--culture ${showCultureModal ? "is-active" : ""}`}
            onClick={openCultureModal}
          >
            Add Culture
          </NeonButton>
          <NeonButton
            type="button"
            className={`live-chat-composer__control live-chat-composer__control--btc ${transferMode === "satoshi" ? "is-active" : ""}`}
            onClick={() => setTransferMode((current) => (current === "satoshi" ? "none" : "satoshi"))}
          >
            Send Satoshi
          </NeonButton>
          <NeonButton
            type="button"
            className={`live-chat-composer__control live-chat-composer__control--eth ${transferMode === "ethereum" ? "is-active" : ""}`}
            onClick={() => setTransferMode((current) => (current === "ethereum" ? "none" : "ethereum"))}
          >
            Send Ethereum
          </NeonButton>
        </div>
        <section
          className={`live-chat-composer__transfer-panel ${transferPanelOpen ? "is-open" : ""} ${
            transferMode === "satoshi" ? "is-btc" : transferMode === "ethereum" ? "is-eth" : ""
          }`}
          aria-hidden={!transferPanelOpen}
        >
          <header className="live-chat-composer__transfer-header">
            <span>Transfer Panel</span>
            <span className="live-chat-composer__transfer-state">
              {transferMode === "satoshi" ? "BTC LINK" : transferMode === "ethereum" ? "ETH LINK" : "STANDBY"}
            </span>
          </header>
          <div className="live-chat-composer__transfer-fields">
            {showRecipientField ? (
              <input
                name="dropRecipient"
                type="text"
                placeholder="@username"
                aria-label="Recipient username"
                disabled={!transferPanelOpen}
              />
            ) : null}
            {transferMode === "satoshi" ? (
              <input
                name="satoshiUnits"
                type="number"
                min="0.00000001"
                step="0.00000001"
                defaultValue="0.03"
                aria-label="Satoshi transfer amount in BTC units"
                disabled={!transferPanelOpen}
              />
            ) : transferMode === "ethereum" ? (
              <input
                name="ethereumUnits"
                type="number"
                min="0.00000001"
                step="0.00000001"
                defaultValue="0.03"
                aria-label="Ethereum transfer amount in ETH units"
                disabled={!transferPanelOpen}
              />
            ) : (
              <div className="live-chat-composer__transfer-placeholder">
                arm BTC or ETH link to open transfer controls
              </div>
            )}
          </div>
          <div className="live-chat-composer__transfer-actions">
            <span className="meta">{transferMode === "satoshi" ? "BTC" : transferMode === "ethereum" ? "ETH" : "--"}</span>
            <NeonButton
              type="submit"
              name="intent"
              value={transferIntent}
              className={`live-chat-composer__sats-submit ${
                transferMode === "ethereum" ? "live-chat-composer__sats-submit--eth" : "live-chat-composer__sats-submit--btc"
              }`}
              onClick={() => setDropBurstId(Date.now())}
              disabled={!transferPanelOpen}
            >
              {transferMode === "satoshi" ? "Drop BTC" : transferMode === "ethereum" ? "Drop ETH" : "Transfer Locked"}
            </NeonButton>
          </div>
        </section>
      </div>
      {dropBurstId ? (
        <div key={dropBurstId} className="satoshi-fall-lane" aria-hidden="true">
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--a">{transferMode === "ethereum" ? "Ξ" : "₿"}</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--b">01010010</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--c">{transferMode === "ethereum" ? "Ξ" : "₿"}</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--d">11100011</span>
        </div>
      ) : null}
      {showCurrencyGuide && typeof document !== "undefined"
        ? createPortal(
            <div
              className="energy-info-modal live-chat-currency-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${textareaId}-currency-guide-title`}
              onClick={() => setShowCurrencyGuide(false)}
            >
              <section className="energy-info-modal__panel live-chat-currency-modal__panel" onClick={(event) => event.stopPropagation()}>
                <header className="energy-info-modal__header">
                  <h2 id={`${textareaId}-currency-guide-title`}>Field Currency Guide</h2>
                  <button
                    type="button"
                    className="energy-info-modal__close"
                    onClick={() => setShowCurrencyGuide(false)}
                    aria-label="Close field currency guide"
                  >
                    X
                  </button>
                </header>
                <div className="energy-info-modal__body">
                  <p className="energy-info-modal__label">BTC</p>
                  <ul className="energy-info-modal__baseline-list">
                    <li>
                      <strong>SATOSHI UNIT</strong> :: 0.00000001 BTC :: smallest atomic unit
                    </li>
                    <li>
                      <strong>FIELD TRADE</strong> :: ~0.00005 BTC :: fuel reserves, water filtration kits, ammunition stock
                    </li>
                    <li>
                      <strong>SURVIVAL TRADE</strong> :: ~0.0005 BTC :: rifles, comms equipment, solar generators
                    </li>
                    <li>
                      <strong>STRONGHOLD TRADE</strong> :: ~0.01 BTC :: vehicles, hardened shelters, long-term supplies
                    </li>
                    <li>
                      <strong>RESERVE LEVEL</strong> :: 1 BTC :: equivalent to permanent territory or a fortified home in most post-grid markets
                    </li>
                  </ul>

                  <p className="energy-info-modal__label">ETH</p>
                  <ul className="energy-info-modal__baseline-list">
                    <li>
                      <strong>ETHER UNIT</strong> :: 1 ETH :: computational fuel used to operate the network
                    </li>
                    <li>
                      <strong>FIELD TRADE</strong> :: ~0.5 ETH :: electronics, hardware tools, encrypted devices
                    </li>
                    <li>
                      <strong>SURVIVAL TRADE</strong> :: ~5 ETH :: drones, high-end communication rigs, tactical gear
                    </li>
                    <li>
                      <strong>INFRASTRUCTURE TRADE</strong> :: ~25 ETH :: vehicles, mobile data centers, energy systems
                    </li>
                    <li>
                      <strong>NETWORK BUILDER LEVEL</strong> :: ~100 ETH+ :: capital scale used to deploy and sustain decentralized systems
                    </li>
                  </ul>

                  <p className="energy-info-modal__footer">MadnessNet // Financial Briefing Terminal</p>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
      {showCultureModal && typeof document !== "undefined"
        ? createPortal(
            <div
              className="energy-info-modal live-chat-culture-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${textareaId}-culture-title`}
              onClick={closeCultureModal}
            >
              <section className="energy-info-modal__panel live-chat-culture-modal__panel" onClick={(event) => event.stopPropagation()}>
                <header className="energy-info-modal__header">
                  <h2 id={`${textareaId}-culture-title`}>Add Culture</h2>
                  <button
                    type="button"
                    className="energy-info-modal__close"
                    onClick={closeCultureModal}
                    aria-label="Close Add Culture modal"
                  >
                    X
                  </button>
                </header>
                <div className="energy-info-modal__body live-chat-culture-modal__body">
                  <p className="meta">Select one meme from the archive and add it to Chat Transmission.</p>
                  <div className="live-chat-culture-modal__toolbar">
                    <input
                      type="text"
                      value={cultureSearch}
                      onChange={(event) => setCultureSearch(event.target.value)}
                      placeholder="Search @uploader or caption..."
                      aria-label="Search meme archive"
                      className="live-chat-culture-modal__search"
                    />
                    <NeonButton type="button" className="live-chat-culture-modal__refresh" onClick={() => void loadCultureMemes()}>
                      Refresh
                    </NeonButton>
                  </div>
                  {cultureError ? <p className="meta live-chat-culture-modal__error">{cultureError}</p> : null}
                  <div className="live-chat-culture-modal__grid" role="listbox" aria-label="Meme archive list">
                    {filteredCultureMemes.map((meme) => {
                      const key = toMemeSelectionKey(meme);
                      const isSelected = selectedCultureMemeKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`live-chat-culture-modal__item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => setSelectedCultureMemeKey(key)}
                          aria-pressed={isSelected}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={meme.thumbnailUrl || meme.imageDataUrl}
                            alt={meme.caption || `Meme uploaded by @${meme.uploader}`}
                            loading="lazy"
                            decoding="async"
                            width={280}
                            height={280}
                            className="live-chat-culture-modal__thumb"
                          />
                          <span className="live-chat-culture-modal__uploader">@{meme.uploader}</span>
                          {meme.caption ? <span className="live-chat-culture-modal__caption">{meme.caption}</span> : null}
                        </button>
                      );
                    })}
                    {!cultureLoading && filteredCultureMemes.length === 0 ? (
                      <p className="meta live-chat-culture-modal__empty">No memes match that search yet.</p>
                    ) : null}
                  </div>
                  {cultureLoading ? <p className="meta">Loading archive...</p> : null}
                </div>
                <footer className="live-chat-culture-modal__footer">
                  <NeonButton type="button" className="live-chat-culture-modal__cancel" onClick={closeCultureModal}>
                    Close
                  </NeonButton>
                  <NeonButton
                    type="button"
                    onClick={submitCultureMeme}
                    className="live-chat-culture-modal__add"
                    disabled={!selectedCultureMeme || cultureLoading}
                  >
                    Add
                  </NeonButton>
                </footer>
              </section>
            </div>,
            document.body
          )
        : null}
    </form>
  );
}
