"use client";

import { useEffect, useRef, useState } from "react";

const TRACKS = [
  "/audio/relic-vault/encrypted-skyline-protocol.mp3",
  "/audio/relic-vault/midnight-archive-breach.mp3"
];

function readMutedPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  const raw = window.localStorage.getItem("madnessnet_mute");
  if (raw === null) {
    return false;
  }

  return raw === "true";
}

function pickRandomTrack() {
  const index = Math.floor(Math.random() * TRACKS.length);
  return TRACKS[index] ?? TRACKS[0];
}

export function RelicVaultAmbientAudio() {
  const [muted, setMuted] = useState(false);
  const [track, setTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setMuted(readMutedPreference());
    setTrack(pickRandomTrack());
  }, []);

  useEffect(() => {
    const onMuteEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ muted?: boolean }>;
      if (typeof customEvent.detail?.muted === "boolean") {
        setMuted(customEvent.detail.muted);
        return;
      }
      setMuted(readMutedPreference());
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "madnessnet_mute") {
        setMuted(readMutedPreference());
      }
    };

    window.addEventListener("madnessnet:audio-mute-change", onMuteEvent as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("madnessnet:audio-mute-change", onMuteEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) {
      return;
    }

    audio.muted = muted;

    const attemptPlay = () => {
      if (audio.muted) {
        return;
      }
      void audio.play().catch(() => {
        // Ignore autoplay failures; user interactions retry playback.
      });
    };

    attemptPlay();

    const unlock = () => {
      attemptPlay();
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [muted, track]);

  if (!track) {
    return null;
  }

  return (
    <audio
      ref={audioRef}
      src={track}
      autoPlay
      loop
      muted={muted}
      preload="auto"
      aria-hidden="true"
    />
  );
}
