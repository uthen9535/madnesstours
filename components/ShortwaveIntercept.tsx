"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { NeonButton } from "@/components/NeonButton";
import {
  BED_BURST_AUDIO_PATHS,
  BED_LOOP_AUDIO_PATHS,
  CONTROL_CUE_AUDIO_PATHS,
  ET_TRANSMISSIONS,
  MEMBER_SCENARIOS,
  MILITARY_TRANSMISSIONS,
  pickNonRepeatingIndex,
  randomInt,
  scrambleOneFrame,
  transmissionAudioSrc,
  type BreachMode
} from "@/lib/shortwaveTransmissions";

type TransmissionSource = "manual" | "random";

type ActiveTransmission = {
  mode: BreachMode;
  message: string;
  source: TransmissionSource;
  index: number;
  audioSrc: string;
};

type IntrusionFlash = {
  mode: BreachMode;
  durationMs: number;
};

type ManualBreachBroadcastEvent = {
  id: string;
  mode: BreachMode;
  message: string;
  index: number;
  audioSrc: string;
  createdAt: number;
  emitterUsername: string;
};

const MODE_LABELS: Record<BreachMode, string> = {
  military: "FORCE MILITARY BREACH",
  et: "FORCE ET BREACH",
  member: "FORCE MEMBER BREACH"
};

const MODE_POOL: Record<BreachMode, readonly string[]> = {
  military: MILITARY_TRANSMISSIONS,
  et: ET_TRANSMISSIONS,
  member: MEMBER_SCENARIOS
};

const MODE_INDICATOR_LABEL: Record<BreachMode, string> = {
  military: "MILITARY CHANNEL",
  et: "ET CHANNEL",
  member: "MEMBER CHANNEL"
};

const INTRUSION_TOOLTIP = "UNAUTHORIZED OVERRIDE";
const INTRUSION_FLASH_TEXT = "SIGNAL INTRUSION DETECTED";
const TRANSMISSION_COOLDOWN_MS = 3_800;
const RANDOM_INTERCEPT_MIN_DELAY_MS = 95_000;
const RANDOM_INTERCEPT_MAX_DELAY_MS = 170_000;
const BED_TARGET_VOLUME = 0.24;
const BURST_VOLUME = 0.16;
const TRANSMISSION_STATIC_VOLUME = 0.18;
const TRANSMISSION_STATIC_MIN_DELAY_MS = 320;
const TRANSMISSION_STATIC_MAX_DELAY_MS = 780;
const CONTROL_CUE_VOLUME = 0.18;
const ET_BED_DURING_TRANSMISSION_VOLUME = 0.16;
const SCRATCH_BURST_AUDIO_PATHS = [
  BED_BURST_AUDIO_PATHS[0],
  BED_BURST_AUDIO_PATHS[1]
] as const;

function dispatchGlitchEvent(eventName: "madnessnet:force-glitch" | "madnessnet:force-red-alert") {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(eventName));
}

function estimateTranscriptDurationMs(message: string): number {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  const duration = (words / 2.9) * 1_000;
  return Math.max(2_500, Math.min(13_000, duration));
}

function getMutePreference(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const savedMute = localStorage.getItem("madnessnet_mute");
  if (savedMute === null) {
    return true;
  }
  return savedMute === "true";
}

function setMutePreference(muted: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem("madnessnet_mute", String(muted));
  window.dispatchEvent(new CustomEvent("madnessnet:audio-mute-change", { detail: { muted } }));
}

function modeClass(mode: BreachMode): string {
  return `shortwave-${mode}`;
}

function pickDifferentValue<T extends string>(values: readonly T[], previous: T | null): T {
  if (values.length === 1) {
    return values[0];
  }

  let next = values[randomInt(0, values.length - 1)];
  while (next === previous) {
    next = values[randomInt(0, values.length - 1)];
  }
  return next;
}

const VOICE_PREFERENCES: Record<BreachMode, readonly string[]> = {
  military: ["Eddy (English (US))", "Daniel", "Alex", "Aaron", "Samantha"],
  et: ["Eddy (English (US))", "Zarvox", "Bad News", "Daniel", "Alex"],
  member: ["Samantha", "Allison", "Ava", "Alex", "Eddy (English (US))"]
};

function pickVoice(mode: BreachMode): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    return null;
  }

  const preferredNames = VOICE_PREFERENCES[mode];
  for (const preferredName of preferredNames) {
    const match = voices.find((voice) => voice.name === preferredName);
    if (match) {
      return match;
    }
  }

  const fallbackEn = voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
  return fallbackEn ?? voices[0] ?? null;
}

function toRadioPhrasing(text: string): string {
  return text
    .replace(/;/g, ".")
    .replace(/::/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function localOverlayEventId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ShortwaveIntercept() {
  const [muteAudio, setMuteAudio] = useState(true);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [intrusionFlash, setIntrusionFlash] = useState<IntrusionFlash | null>(null);
  const [activeTransmission, setActiveTransmission] = useState<ActiveTransmission | null>(null);
  const [playbackIssue, setPlaybackIssue] = useState<string | null>(null);
  const [scrambledText, setScrambledText] = useState<Record<BreachMode, string | null>>({
    military: null,
    et: null,
    member: null
  });
  const [nowTick, setNowTick] = useState(() => Date.now());

  const jitterMsByMode = useMemo<Record<BreachMode, number>>(
    () => ({
      military: randomInt(2_000, 4_000),
      et: randomInt(2_000, 4_000),
      member: randomInt(2_000, 4_000)
    }),
    []
  );

  const hasUserInteractionRef = useRef(false);
  const lastIndexRef = useRef<Record<BreachMode, number | null>>({
    military: null,
    et: null,
    member: null
  });
  const cooldownUntilRef = useRef(0);
  const activeTransmissionRef = useRef<ActiveTransmission | null>(null);
  const muteAudioRef = useRef(muteAudio);

  const flashTimeoutRef = useRef<number | null>(null);
  const transcriptTimeoutRef = useRef<number | null>(null);
  const randomTimeoutRef = useRef<number | null>(null);
  const scrambleClearTimeoutRef = useRef<number | null>(null);

  const transmissionAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const bedARef = useRef<HTMLAudioElement | null>(null);
  const bedBRef = useRef<HTMLAudioElement | null>(null);
  const activeBedRef = useRef<"a" | "b">("a");
  const activeBedSourceRef = useRef<string | null>(null);
  const bedTransitionTimeoutRef = useRef<number | null>(null);
  const bedFadeIntervalRef = useRef<number | null>(null);
  const burstTimeoutRef = useRef<number | null>(null);
  const transmissionStaticTimeoutRef = useRef<number | null>(null);
  const scratchOnlyTransmissionRef = useRef(false);

  useEffect(() => {
    setMuteAudio(getMutePreference());
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "madnessnet_mute") {
        setMuteAudio(getMutePreference());
      }
    };

    const onMuteEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ muted?: boolean }>;
      if (typeof customEvent.detail?.muted === "boolean") {
        setMuteAudio(customEvent.detail.muted);
      } else {
        setMuteAudio(getMutePreference());
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("madnessnet:audio-mute-change", onMuteEvent as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("madnessnet:audio-mute-change", onMuteEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    muteAudioRef.current = muteAudio;
  }, [muteAudio]);

  useEffect(() => {
    activeTransmissionRef.current = activeTransmission;
  }, [activeTransmission]);

  useEffect(() => {
    cooldownUntilRef.current = cooldownUntil;
  }, [cooldownUntil]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 250);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  const clearTranscriptTimeout = useCallback(() => {
    if (transcriptTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(transcriptTimeoutRef.current);
    transcriptTimeoutRef.current = null;
  }, []);

  const stopTransmissionAudio = useCallback(() => {
    if (!transmissionAudioRef.current) {
      if (speechUtteranceRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        speechUtteranceRef.current = null;
      }
      if (!muteAudioRef.current && hasUserInteractionRef.current) {
        if (bedARef.current && !bedARef.current.paused) {
          bedARef.current.volume = BED_TARGET_VOLUME;
        }
        if (bedBRef.current && !bedBRef.current.paused) {
          bedBRef.current.volume = BED_TARGET_VOLUME;
        }
      }
      scratchOnlyTransmissionRef.current = false;
      return;
    }

    transmissionAudioRef.current.pause();
    transmissionAudioRef.current.currentTime = 0;
    transmissionAudioRef.current.src = "";
    transmissionAudioRef.current = null;

    if (speechUtteranceRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
    }
    if (!muteAudioRef.current && hasUserInteractionRef.current) {
      if (bedARef.current && !bedARef.current.paused) {
        bedARef.current.volume = BED_TARGET_VOLUME;
      }
      if (bedBRef.current && !bedBRef.current.paused) {
        bedBRef.current.volume = BED_TARGET_VOLUME;
      }
    }
    scratchOnlyTransmissionRef.current = false;
  }, []);

  const clearBedTimers = useCallback(() => {
    if (bedTransitionTimeoutRef.current !== null) {
      window.clearTimeout(bedTransitionTimeoutRef.current);
      bedTransitionTimeoutRef.current = null;
    }

    if (bedFadeIntervalRef.current !== null) {
      window.clearInterval(bedFadeIntervalRef.current);
      bedFadeIntervalRef.current = null;
    }

    if (burstTimeoutRef.current !== null) {
      window.clearTimeout(burstTimeoutRef.current);
      burstTimeoutRef.current = null;
    }

    if (transmissionStaticTimeoutRef.current !== null) {
      window.clearTimeout(transmissionStaticTimeoutRef.current);
      transmissionStaticTimeoutRef.current = null;
    }
  }, []);

  const clearTransmissionStaticTimer = useCallback(() => {
    if (transmissionStaticTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(transmissionStaticTimeoutRef.current);
    transmissionStaticTimeoutRef.current = null;
  }, []);

  const stopBedEngine = useCallback(() => {
    clearBedTimers();

    const bedA = bedARef.current;
    const bedB = bedBRef.current;

    if (bedA) {
      bedA.pause();
      bedA.currentTime = 0;
      bedA.volume = 0;
    }

    if (bedB) {
      bedB.pause();
      bedB.currentTime = 0;
      bedB.volume = 0;
    }
  }, [clearBedTimers]);

  const stopCurrentTransmission = useCallback(() => {
    clearTranscriptTimeout();
    clearTransmissionStaticTimer();
    stopTransmissionAudio();
    setActiveTransmission(null);
  }, [clearTranscriptTimeout, clearTransmissionStaticTimer, stopTransmissionAudio]);

  const playOneShot = useCallback((src: string, volume: number, playbackRate = 1) => {
    if (muteAudioRef.current || !hasUserInteractionRef.current) {
      return;
    }

    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.playbackRate = Math.min(2.5, Math.max(0.45, playbackRate));
    void audio.play().catch(() => {
      // Autoplay or decode failure: no-op for one-shots.
    });
  }, []);

  const runFade = useCallback((fromAudio: HTMLAudioElement, toAudio: HTMLAudioElement, durationMs: number) => {
    if (bedFadeIntervalRef.current !== null) {
      window.clearInterval(bedFadeIntervalRef.current);
    }

    const start = performance.now();
    const fromStart = fromAudio.volume;
    const toStart = toAudio.volume;

    bedFadeIntervalRef.current = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / durationMs);

      fromAudio.volume = Math.max(0, fromStart * (1 - progress));
      toAudio.volume = Math.min(BED_TARGET_VOLUME, toStart + (BED_TARGET_VOLUME - toStart) * progress);

      if (progress >= 1) {
        if (bedFadeIntervalRef.current !== null) {
          window.clearInterval(bedFadeIntervalRef.current);
        }
        bedFadeIntervalRef.current = null;
        fromAudio.pause();
        fromAudio.currentTime = 0;
      }
    }, 70);
  }, []);

  const crossfadeBedLoop = useCallback(() => {
    if (muteAudioRef.current || !hasUserInteractionRef.current) {
      return;
    }

    const activeKey = activeBedRef.current;
    const activeAudio = activeKey === "a" ? bedARef.current : bedBRef.current;
    const nextAudio = activeKey === "a" ? bedBRef.current : bedARef.current;

    if (!activeAudio || !nextAudio) {
      return;
    }

    const nextSrc = pickDifferentValue(BED_LOOP_AUDIO_PATHS, activeBedSourceRef.current as (typeof BED_LOOP_AUDIO_PATHS)[number] | null);
    nextAudio.src = nextSrc;
    nextAudio.currentTime = 0;
    nextAudio.loop = true;
    nextAudio.volume = 0;

    void nextAudio.play().then(() => {
      runFade(activeAudio, nextAudio, 2_200);
      activeBedRef.current = activeKey === "a" ? "b" : "a";
      activeBedSourceRef.current = nextSrc;
    }).catch(() => {
      // If this play attempt fails, try again at next cycle.
    });
  }, [runFade]);

  const scheduleBedTransition = useCallback(() => {
    if (bedTransitionTimeoutRef.current !== null) {
      window.clearTimeout(bedTransitionTimeoutRef.current);
    }

    bedTransitionTimeoutRef.current = window.setTimeout(() => {
      crossfadeBedLoop();
      scheduleBedTransition();
    }, randomInt(12_000, 18_000));
  }, [crossfadeBedLoop]);

  const scheduleBurst = useCallback(() => {
    if (burstTimeoutRef.current !== null) {
      window.clearTimeout(burstTimeoutRef.current);
    }

    burstTimeoutRef.current = window.setTimeout(() => {
      if (!muteAudioRef.current && hasUserInteractionRef.current) {
        const scratchOnlyModeActive = activeTransmissionRef.current?.mode === "military";
        const burstPool = scratchOnlyModeActive ? SCRATCH_BURST_AUDIO_PATHS : BED_BURST_AUDIO_PATHS;
        const burstSrc = burstPool[randomInt(0, burstPool.length - 1)];
        playOneShot(burstSrc, BURST_VOLUME, 0.9 + Math.random() * 0.3);
      }
      scheduleBurst();
    }, randomInt(3_600, 7_400));
  }, [playOneShot]);

  const startTransmissionStatic = useCallback(
    (mode: BreachMode) => {
      clearTransmissionStaticTimer();

      const tick = () => {
        if (muteAudioRef.current || !hasUserInteractionRef.current || !activeTransmissionRef.current) {
          clearTransmissionStaticTimer();
          return;
        }

        const scratchOnlyMode = mode === "military";
        const burstPool = scratchOnlyMode ? SCRATCH_BURST_AUDIO_PATHS : BED_BURST_AUDIO_PATHS;
        const burstSrc = burstPool[randomInt(0, burstPool.length - 1)];
        const modeBoost = mode === "et" ? 0.01 : scratchOnlyMode ? 0.08 : 0.02;
        playOneShot(
          burstSrc,
          Math.min(0.42, TRANSMISSION_STATIC_VOLUME + modeBoost),
          0.75 + Math.random() * 0.8
        );

        transmissionStaticTimeoutRef.current = window.setTimeout(
          tick,
          randomInt(TRANSMISSION_STATIC_MIN_DELAY_MS, TRANSMISSION_STATIC_MAX_DELAY_MS)
        );
      };

      transmissionStaticTimeoutRef.current = window.setTimeout(tick, 60);
    },
    [clearTransmissionStaticTimer, playOneShot]
  );

  const startBedEngine = useCallback(() => {
    if (muteAudioRef.current || !hasUserInteractionRef.current) {
      return;
    }

    const bedA = bedARef.current;
    const bedB = bedBRef.current;

    if (!bedA || !bedB) {
      return;
    }

    if (!activeBedSourceRef.current) {
      activeBedSourceRef.current = BED_LOOP_AUDIO_PATHS[randomInt(0, BED_LOOP_AUDIO_PATHS.length - 1)];
      activeBedRef.current = "a";
      bedA.src = activeBedSourceRef.current;
      bedA.currentTime = 0;
      bedA.loop = true;
      bedA.volume = BED_TARGET_VOLUME;
      bedB.pause();
      bedB.currentTime = 0;
      bedB.loop = true;
      bedB.volume = 0;

      void bedA.play().catch(() => {
        // Autoplay might fail before interaction.
      });
    } else {
      const activeAudio = activeBedRef.current === "a" ? bedA : bedB;
      if (activeAudio.paused) {
        void activeAudio.play().catch(() => {
          // Ignore transient play rejections.
        });
      }
      activeAudio.volume = BED_TARGET_VOLUME;
    }

    scheduleBedTransition();
    scheduleBurst();
  }, [scheduleBedTransition, scheduleBurst]);

  useEffect(() => {
    const bedA = new Audio();
    bedA.preload = "auto";
    bedA.loop = true;
    bedA.volume = 0;

    const bedB = new Audio();
    bedB.preload = "auto";
    bedB.loop = true;
    bedB.volume = 0;

    bedARef.current = bedA;
    bedBRef.current = bedB;

    return () => {
      stopBedEngine();
      if (bedARef.current) {
        bedARef.current.pause();
        bedARef.current.src = "";
      }
      if (bedBRef.current) {
        bedBRef.current.pause();
        bedBRef.current.src = "";
      }
      bedARef.current = null;
      bedBRef.current = null;
    };
  }, [stopBedEngine]);

  useEffect(() => {
    const unlockAudio = () => {
      if (hasUserInteractionRef.current) {
        return;
      }

      hasUserInteractionRef.current = true;
      if (!muteAudioRef.current) {
        startBedEngine();
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [startBedEngine]);

  useEffect(() => {
    if (muteAudio) {
      stopBedEngine();
      stopTransmissionAudio();
      return;
    }

    if (hasUserInteractionRef.current) {
      startBedEngine();
    }
  }, [muteAudio, startBedEngine, stopBedEngine, stopTransmissionAudio]);

  const playTransmission = useCallback(
    (mode: BreachMode, source: TransmissionSource): ActiveTransmission => {
      stopCurrentTransmission();
      setPlaybackIssue(null);

      const pool = MODE_POOL[mode];
      const nextIndex = pickNonRepeatingIndex(pool.length, lastIndexRef.current[mode]);
      const message = pool[nextIndex];
      lastIndexRef.current[mode] = nextIndex;
      const audioSrc = transmissionAudioSrc(mode, nextIndex);
      const nextTransmission = { mode, message, source, index: nextIndex, audioSrc } as const;
      setActiveTransmission(nextTransmission);
      activeTransmissionRef.current = nextTransmission;

      if (muteAudioRef.current || !hasUserInteractionRef.current) {
        transcriptTimeoutRef.current = window.setTimeout(() => {
          setActiveTransmission(null);
          activeTransmissionRef.current = null;
        }, estimateTranscriptDurationMs(message));
        return nextTransmission;
      }

      const scratchOnlyMode = mode === "military";
      scratchOnlyTransmissionRef.current = scratchOnlyMode;
      if (scratchOnlyMode) {
        if (bedARef.current) {
          bedARef.current.volume = 0;
        }
        if (bedBRef.current) {
          bedBRef.current.volume = 0;
        }
      } else {
        const activeBedVolume = mode === "et" ? ET_BED_DURING_TRANSMISSION_VOLUME : BED_TARGET_VOLUME;
        if (bedARef.current && !bedARef.current.paused) {
          bedARef.current.volume = activeBedVolume;
        }
        if (bedBRef.current && !bedBRef.current.paused) {
          bedBRef.current.volume = activeBedVolume;
        }
      }

      startTransmissionStatic(mode);

      const speakFallback = () => {
        if (typeof window === "undefined") {
          setActiveTransmission(null);
          activeTransmissionRef.current = null;
          clearTransmissionStaticTimer();
          return;
        }

        const speech = (window as Window & { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
        if (!speech) {
          transcriptTimeoutRef.current = window.setTimeout(() => {
            setActiveTransmission(null);
            activeTransmissionRef.current = null;
            clearTransmissionStaticTimer();
          }, estimateTranscriptDurationMs(message));
          return;
        }

        startBedEngine();
        speech.cancel();
        const utterance = new SpeechSynthesisUtterance(toRadioPhrasing(message));
        const voice = pickVoice(mode);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = "en-US";
        }
        utterance.rate = mode === "et" ? 0.86 : mode === "military" ? 0.92 : 0.98;
        utterance.pitch = mode === "et" ? 0.62 : mode === "member" ? 0.88 : 0.78;
        utterance.volume = mode === "et" || mode === "member" ? 1 : 0.9;
        speechUtteranceRef.current = utterance;

        const onSpokenEnd = () => {
          speechUtteranceRef.current = null;
          clearTransmissionStaticTimer();
          setActiveTransmission((current) => {
            if (!current) {
              return current;
            }
            if (current.mode !== mode || current.index !== nextIndex) {
              return current;
            }
            activeTransmissionRef.current = null;
            return null;
          });
        };

        utterance.onend = onSpokenEnd;
        utterance.onerror = onSpokenEnd;
        speech.speak(utterance);
      };

      const audio = new Audio(audioSrc);
      audio.preload = "auto";
      audio.volume = 1;
      transmissionAudioRef.current = audio;
      let settled = false;

      const onEnd = () => {
        if (settled) {
          return;
        }
        settled = true;
        transmissionAudioRef.current = null;
        clearTransmissionStaticTimer();
        setActiveTransmission((current) => {
          if (!current) {
            return current;
          }
          if (current.mode !== mode || current.index !== nextIndex) {
            return current;
          }
          activeTransmissionRef.current = null;
          return null;
        });
      };

      const onError = () => {
        if (settled) {
          return;
        }
        settled = true;
        transmissionAudioRef.current = null;
        setPlaybackIssue(`Transmission decode failed at ${audioSrc}. Falling back to speech.`);
        speakFallback();
      };

      audio.addEventListener("ended", onEnd, { once: true });
      audio.addEventListener("error", onError, { once: true });

      void audio.play().catch(() => {
        setPlaybackIssue(`Playback blocked for ${audioSrc}. Falling back to speech.`);
        onError();
      });

      return nextTransmission;
    },
    [clearTransmissionStaticTimer, startBedEngine, startTransmissionStatic, stopCurrentTransmission]
  );

  const scheduleRandomIntercept = useCallback(() => {
    if (randomTimeoutRef.current !== null) {
      window.clearTimeout(randomTimeoutRef.current);
    }

    const nextDelayMs = randomInt(RANDOM_INTERCEPT_MIN_DELAY_MS, RANDOM_INTERCEPT_MAX_DELAY_MS);

    randomTimeoutRef.current = window.setTimeout(() => {
      const now = Date.now();
      const transmissionActive = Boolean(activeTransmissionRef.current);

      if (
        hasUserInteractionRef.current &&
        !muteAudioRef.current &&
        !transmissionActive &&
        !intrusionFlash &&
        now >= cooldownUntilRef.current
      ) {
        const modes: BreachMode[] = ["military", "et", "member"];
        const nextMode = modes[randomInt(0, modes.length - 1)];
        const nextCooldown = Date.now() + TRANSMISSION_COOLDOWN_MS;
        cooldownUntilRef.current = nextCooldown;
        setCooldownUntil(nextCooldown);
        playTransmission(nextMode, "random");
      }

      scheduleRandomIntercept();
    }, nextDelayMs);
  }, [intrusionFlash, playTransmission]);

  useEffect(() => {
    scheduleRandomIntercept();
    return () => {
      if (randomTimeoutRef.current !== null) {
        window.clearTimeout(randomTimeoutRef.current);
      }
    };
  }, [scheduleRandomIntercept]);

  useEffect(() => {
    const scrambleTimer = window.setInterval(() => {
      if (Math.random() > 0.4) {
        return;
      }

      const modes: BreachMode[] = ["military", "et", "member"];
      const mode = modes[randomInt(0, modes.length - 1)];
      setScrambledText((previous) => ({
        ...previous,
        [mode]: scrambleOneFrame(MODE_LABELS[mode])
      }));

      if (scrambleClearTimeoutRef.current !== null) {
        window.clearTimeout(scrambleClearTimeoutRef.current);
      }

      scrambleClearTimeoutRef.current = window.setTimeout(() => {
        setScrambledText((previous) => ({
          ...previous,
          [mode]: null
        }));
      }, 74);
    }, 1_900);

    return () => {
      clearInterval(scrambleTimer);
      if (scrambleClearTimeoutRef.current !== null) {
        window.clearTimeout(scrambleClearTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      if (transcriptTimeoutRef.current !== null) {
        window.clearTimeout(transcriptTimeoutRef.current);
      }
      if (randomTimeoutRef.current !== null) {
        window.clearTimeout(randomTimeoutRef.current);
      }
      if (scrambleClearTimeoutRef.current !== null) {
        window.clearTimeout(scrambleClearTimeoutRef.current);
      }
      stopBedEngine();
      stopCurrentTransmission();
    };
  }, [stopBedEngine, stopCurrentTransmission]);

  const cooldownRemainingMs = Math.max(0, cooldownUntil - nowTick);
  const coolingDown = cooldownRemainingMs > 0;

  const startCooldown = useCallback(() => {
    const next = Date.now() + TRANSMISSION_COOLDOWN_MS;
    cooldownUntilRef.current = next;
    setCooldownUntil(next);
  }, []);

  const forceUnmute = useCallback(() => {
    if (!muteAudioRef.current) {
      return;
    }

    muteAudioRef.current = false;
    setMuteAudio(false);
    setMutePreference(false);
  }, []);

  const ensureInteraction = useCallback(() => {
    if (!hasUserInteractionRef.current) {
      hasUserInteractionRef.current = true;
    }

    forceUnmute();
    startBedEngine();
  }, [forceUnmute, startBedEngine]);

  const playControlCue = useCallback(
    (type: "forceGlitch" | "forceRedAlert") => {
      playOneShot(CONTROL_CUE_AUDIO_PATHS[type], CONTROL_CUE_VOLUME);
    },
    [playOneShot]
  );

  const broadcastManualBreach = useCallback(async (mode: BreachMode) => {
    try {
      const response = await fetch("/api/system-attack/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mode })
      });

      if (!response.ok) {
        return;
      }
      void (await response.json() as { event?: ManualBreachBroadcastEvent | null });
    } catch {
      // Ignore transient broadcast errors.
    }
  }, []);

  const emitLocalOverlayTranscript = useCallback((transmission: ActiveTransmission) => {
    window.dispatchEvent(
      new CustomEvent("madnessnet:system-attack-broadcast-event", {
        detail: {
          event: {
            id: localOverlayEventId(),
            mode: transmission.mode,
            message: transmission.message,
            index: transmission.index,
            audioSrc: transmission.audioSrc,
            createdAt: Date.now(),
            emitterUsername: "__local__"
          } satisfies ManualBreachBroadcastEvent
        }
      })
    );
  }, []);

  const beginManualBreach = useCallback(
    (mode: BreachMode) => {
      ensureInteraction();

      stopCurrentTransmission();
      startCooldown();
      dispatchGlitchEvent("madnessnet:force-red-alert");

      const flashDurationMs = randomInt(600, 900);
      setIntrusionFlash({ mode, durationMs: flashDurationMs });

      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }

      // Start transmission immediately on the user gesture to avoid autoplay-policy blocking.
      const burstPool = mode === "military" ? SCRATCH_BURST_AUDIO_PATHS : BED_BURST_AUDIO_PATHS;
      playOneShot(burstPool[randomInt(0, burstPool.length - 1)], BURST_VOLUME);
      const launchedTransmission = playTransmission(mode, "manual");
      emitLocalOverlayTranscript(launchedTransmission);
      void broadcastManualBreach(mode);

      flashTimeoutRef.current = window.setTimeout(() => {
        setIntrusionFlash(null);
      }, flashDurationMs);
    },
    [
      broadcastManualBreach,
      emitLocalOverlayTranscript,
      ensureInteraction,
      playOneShot,
      playTransmission,
      startCooldown,
      stopCurrentTransmission
    ]
  );

  const onForceGlitch = useCallback(() => {
    ensureInteraction();
    dispatchGlitchEvent("madnessnet:force-glitch");
    playControlCue("forceGlitch");
  }, [ensureInteraction, playControlCue]);

  const onForceRedAlert = useCallback(() => {
    ensureInteraction();
    dispatchGlitchEvent("madnessnet:force-red-alert");
    playControlCue("forceRedAlert");
  }, [ensureInteraction, playControlCue]);

  return (
    <section className="shortwave-intercept" aria-label="MadnessNet shortwave intercept controls">
      <div className="admin-glitch-controls" role="group" aria-label="System attack controls">
        <NeonButton type="button" onClick={onForceGlitch}>
          Force Glitch
        </NeonButton>
        <NeonButton type="button" onClick={onForceRedAlert}>
          Force Red Alert
        </NeonButton>

        {(["military", "et", "member"] as const).map((mode) => (
          <NeonButton
            key={mode}
            type="button"
            className={`intrusion-breach-button ${modeClass(mode)} ${scrambledText[mode] ? "intrusion-breach-button--scrambled" : ""}`}
            style={{ "--breach-jitter-ms": `${jitterMsByMode[mode]}ms` } as CSSProperties}
            onClick={() => beginManualBreach(mode)}
            title={INTRUSION_TOOLTIP}
            data-tooltip={INTRUSION_TOOLTIP}
            aria-label={`${MODE_LABELS[mode]}. ${INTRUSION_TOOLTIP}.`}
          >
            <span>{scrambledText[mode] ?? MODE_LABELS[mode]}</span>
          </NeonButton>
        ))}
      </div>

      <p className="shortwave-intercept__status meta">
        {coolingDown
          ? `Transmission cooldown: ${(cooldownRemainingMs / 1_000).toFixed(1)}s`
          : "Transmission cooldown clear."}
        {muteAudio ? " Radio muted." : " Radio live."}
      </p>
      {playbackIssue ? <p className="shortwave-intercept__meta">{playbackIssue}</p> : null}

      <div className="shortwave-intercept__transcript-region" aria-live="polite">
        {activeTransmission ? (
          <article className={`shortwave-intercept__transcript ${modeClass(activeTransmission.mode)}`}>
            <p className="shortwave-intercept__indicator">{MODE_INDICATOR_LABEL[activeTransmission.mode]} :: LIVE TRANSCRIPT</p>
            <p className="shortwave-intercept__message">{activeTransmission.message}</p>
            <p className="shortwave-intercept__meta">Audio: {activeTransmission.audioSrc}</p>
            {activeTransmission.source === "random" ? (
              <p className="shortwave-intercept__meta">Source: random intercept cadence.</p>
            ) : null}
          </article>
        ) : (
          <p className="shortwave-intercept__idle meta">Awaiting shortwave breach traffic.</p>
        )}
      </div>

      {intrusionFlash ? (
        <div
          className={`shortwave-intrusion-flash ${modeClass(intrusionFlash.mode)}`}
          style={{ "--intrusion-flash-duration": `${intrusionFlash.durationMs}ms` } as CSSProperties}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <span>{INTRUSION_FLASH_TEXT}</span>
        </div>
      ) : null}
    </section>
  );
}
