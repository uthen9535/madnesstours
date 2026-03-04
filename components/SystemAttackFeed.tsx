"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type BreachMode } from "@/lib/shortwaveTransmissions";

type SystemAttackFeedProps = {
  currentUsername: string;
};

type OverlayVariant = "transcript" | "cipher";

type FloatingTranscript = {
  id: string;
  variant: OverlayVariant;
  mode: BreachMode;
  label: string;
  text: string;
  xPx: number;
  yPx: number;
  widthPx: number;
};

type SystemAttackBroadcastEvent = {
  id: string;
  mode: BreachMode;
  message: string;
  index: number;
  audioSrc: string;
  createdAt: number;
  emitterUsername: string;
};

const POLL_INTERVAL_MS = 1600;

const MODE_LABELS: Record<BreachMode, string> = {
  military: "MILITARY BREACH // LIVE FEED",
  et: "ET BREACH // LIVE FEED",
  member: "MEMBER BREACH // LIVE FEED"
};

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

type Rect = { x: number; y: number; w: number; h: number };

function pickSafeRect(w: number, h: number, avoid: Rect[]): Rect {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const marginX = Math.max(24, Math.round(viewportWidth * 0.06));
  const marginY = Math.max(26, Math.round(viewportHeight * 0.08));

  const clampedW = Math.min(w, Math.max(150, viewportWidth - marginX * 2));
  const clampedH = Math.min(h, Math.max(88, viewportHeight - marginY * 2));
  const minX = marginX;
  const maxX = Math.max(minX, viewportWidth - clampedW - marginX);
  const minY = marginY;
  const maxY = Math.max(minY, viewportHeight - clampedH - marginY);
  const cornerDeadZone = Math.max(110, Math.round(Math.min(viewportWidth, viewportHeight) * 0.18));

  const overlapsAvoid = (candidate: Rect) => {
    return avoid.some((other) => {
      const padded = 36;
      return !(
        candidate.x + candidate.w + padded < other.x ||
        other.x + other.w + padded < candidate.x ||
        candidate.y + candidate.h + padded < other.y ||
        other.y + other.h + padded < candidate.y
      );
    });
  };

  const inCorner = (x: number, y: number) => {
    const nearLeft = x <= marginX + cornerDeadZone;
    const nearRight = x + clampedW >= viewportWidth - marginX - cornerDeadZone;
    const nearTop = y <= marginY + cornerDeadZone;
    const nearBottom = y + clampedH >= viewportHeight - marginY - cornerDeadZone;

    return (nearLeft && nearTop) || (nearRight && nearTop) || (nearLeft && nearBottom) || (nearRight && nearBottom);
  };

  for (let i = 0; i < 42; i += 1) {
    const x = Math.round(randomInRange(minX, maxX));
    const y = Math.round(randomInRange(minY, maxY));
    const candidate: Rect = { x, y, w: clampedW, h: clampedH };

    if (inCorner(x, y)) {
      continue;
    }
    if (overlapsAvoid(candidate)) {
      continue;
    }
    return candidate;
  }

  return {
    x: Math.round((viewportWidth - clampedW) / 2),
    y: Math.round((viewportHeight - clampedH) / 2),
    w: clampedW,
    h: clampedH
  };
}

function randomHexPair() {
  return Math.floor(Math.random() * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function randomCodeToken() {
  const stems = ["SIG", "AUTH", "NODE", "SCRAM", "NULL", "GATE", "ECHO", "MUX", "VX", "AETHER"];
  return `${stems[Math.floor(Math.random() * stems.length)]}-${randomHexPair()}${randomHexPair()}`;
}

function codeLine(prefix: string) {
  return `${prefix} ${randomCodeToken()} :: 0x${randomHexPair()}${randomHexPair()}${randomHexPair()}${randomHexPair()}`;
}

function buildCipherMessage(mode: BreachMode) {
  const modePrefix = mode.toUpperCase();
  return [
    codeLine(`${modePrefix}_CHAN`),
    codeLine("LINK"),
    codeLine("SCRY"),
    `CHK SUM :: ${randomHexPair()}-${randomHexPair()}-${randomHexPair()}`
  ].join("\n");
}

function mutedPref() {
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem("madnessnet_mute") === "true";
}

function estimateDisplayDurationMs(message: string) {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  const estimated = (words / 3.1) * 1000;
  return Math.max(3600, Math.min(12000, estimated));
}

function speakFallback(message: string, mode: BreachMode) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = mode === "et" ? 0.88 : mode === "military" ? 0.92 : 0.97;
  utterance.pitch = mode === "et" ? 0.62 : mode === "member" ? 0.9 : 0.8;
  utterance.volume = mode === "et" || mode === "member" ? 1 : 0.9;
  synth.cancel();
  synth.speak(utterance);
}

function playBroadcastAudio(event: SystemAttackBroadcastEvent) {
  if (mutedPref()) {
    return;
  }

  const audio = new Audio(event.audioSrc);
  audio.preload = "auto";
  audio.volume = 1;
  void audio.play().catch(() => {
    speakFallback(event.message, event.mode);
  });
}

export function SystemAttackFeed({ currentUsername }: SystemAttackFeedProps) {
  const [floatingCards, setFloatingCards] = useState<FloatingTranscript[]>([]);
  const seenIdRef = useRef<string | null>(null);
  const latestTsRef = useRef(0);
  const activeTokenRef = useRef(0);
  const selfName = useMemo(() => currentUsername.replace(/^@+/, "").toLowerCase(), [currentUsername]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let typingTimer: number | null = null;
    let codeTypingTimer: number | null = null;
    let clearTimer: number | null = null;

    const clearActiveTimers = () => {
      if (typingTimer !== null) {
        window.clearInterval(typingTimer);
        typingTimer = null;
      }
      if (codeTypingTimer !== null) {
        window.clearInterval(codeTypingTimer);
        codeTypingTimer = null;
      }
      if (clearTimer !== null) {
        window.clearTimeout(clearTimer);
        clearTimer = null;
      }
    };

    const showTypedTranscript = (event: SystemAttackBroadcastEvent) => {
      activeTokenRef.current += 1;
      const token = activeTokenRef.current;
      clearActiveTimers();

      const primaryWidth = Math.min(430, Math.max(230, Math.round(window.innerWidth * 0.38)));
      const cipherWidth = Math.min(340, Math.max(190, Math.round(window.innerWidth * 0.3)));
      const primaryRect = pickSafeRect(primaryWidth, 152, []);
      const cipherRect = pickSafeRect(cipherWidth, 128, [primaryRect]);
      const primaryId = `${event.id}-main`;
      const cipherId = `${event.id}-cipher`;
      const cipherMessage = buildCipherMessage(event.mode);

      setFloatingCards([
        {
          id: primaryId,
          variant: "transcript",
          mode: event.mode,
          label: MODE_LABELS[event.mode],
          text: "",
          xPx: primaryRect.x,
          yPx: primaryRect.y,
          widthPx: primaryRect.w
        },
        {
          id: cipherId,
          variant: "cipher",
          mode: event.mode,
          label: `${event.mode.toUpperCase()} BREACH // CIPHER STREAM`,
          text: "",
          xPx: cipherRect.x,
          yPx: cipherRect.y,
          widthPx: cipherRect.w
        }
      ]);

      let i = 0;
      let j = 0;
      typingTimer = window.setInterval(() => {
        if (cancelled || token !== activeTokenRef.current) {
          clearActiveTimers();
          return;
        }

        i += 2;
        setFloatingCards((current) =>
          current.map((card) => (card.id === primaryId ? { ...card, text: event.message.slice(0, i) } : card))
        );

        if (i >= event.message.length) {
          if (typingTimer !== null) {
            window.clearInterval(typingTimer);
            typingTimer = null;
          }
        }
      }, 24);

      codeTypingTimer = window.setInterval(() => {
        if (cancelled || token !== activeTokenRef.current) {
          clearActiveTimers();
          return;
        }

        j += 3;
        setFloatingCards((current) =>
          current.map((card) => (card.id === cipherId ? { ...card, text: cipherMessage.slice(0, j) } : card))
        );

        if (j >= cipherMessage.length) {
          if (codeTypingTimer !== null) {
            window.clearInterval(codeTypingTimer);
            codeTypingTimer = null;
          }
        }
      }, 16);

      clearTimer = window.setTimeout(() => {
        if (token !== activeTokenRef.current) {
          return;
        }
        setFloatingCards([]);
      }, estimateDisplayDurationMs(event.message));
    };

    const triggerEvent = (event: SystemAttackBroadcastEvent, playAudio: boolean) => {
      window.dispatchEvent(new Event("madnessnet:force-red-alert"));
      if (playAudio) {
        playBroadcastAudio(event);
      }
      showTypedTranscript(event);
    };

    const markEventSeen = (event: SystemAttackBroadcastEvent, advanceCursor: boolean) => {
      if (advanceCursor) {
        latestTsRef.current = Math.max(latestTsRef.current, event.createdAt);
      }
      seenIdRef.current = event.id;
    };

    const acceptEvent = (
      event: SystemAttackBroadcastEvent | null | undefined,
      source: "poll" | "local-event"
    ) => {
      if (!event) {
        return;
      }

      if (seenIdRef.current === event.id) {
        return;
      }

      const emitter = event.emitterUsername.toLowerCase();
      const isSelfEmitter = emitter === selfName;
      const isLocalSynthetic = emitter === "__local__";

      if (source === "poll" && isSelfEmitter) {
        markEventSeen(event, true);
        return;
      }

      markEventSeen(event, source === "poll");
      triggerEvent(event, !isSelfEmitter && !isLocalSynthetic);
    };

    const poll = async () => {
      if (cancelled) {
        return;
      }

      try {
        const response = await fetch(`/api/system-attack/broadcast?since=${latestTsRef.current}`, {
          method: "GET",
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { event?: SystemAttackBroadcastEvent | null };
        acceptEvent(payload.event ?? null, "poll");
      } catch {
        // Ignore transient polling errors.
      }
    };

    const onBroadcast = (rawEvent: Event) => {
      const customEvent = rawEvent as CustomEvent<{ event?: SystemAttackBroadcastEvent }>;
      acceptEvent(customEvent.detail?.event ?? null, "local-event");
    };

    void poll();
    pollTimer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    window.addEventListener("madnessnet:system-attack-broadcast-event", onBroadcast as EventListener);

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      window.removeEventListener("madnessnet:system-attack-broadcast-event", onBroadcast as EventListener);
      clearActiveTimers();
    };
  }, [selfName]);

  return (
    <div className="system-attack-feed-layer" aria-hidden="true">
      {floatingCards.map((floating) => (
        <article
          key={floating.id}
          className={`system-attack-feed-card system-attack-feed-card--${floating.mode}`}
          data-overlay-variant={floating.variant}
          style={{ left: `${floating.xPx}px`, top: `${floating.yPx}px`, width: `${floating.widthPx}px` }}
        >
          <p className="system-attack-feed-card__label">{floating.label}</p>
          <p className="system-attack-feed-card__text">{floating.text}</p>
        </article>
      ))}
    </div>
  );
}
