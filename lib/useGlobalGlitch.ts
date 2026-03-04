"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cadence + escalation tuning
export const NORMAL_GLITCH_INTERVAL_MS = 5 * 60 * 1000;
export const NORMAL_GLITCH_JITTER_MS = 10 * 1000;
export const RED_ALERT_PROBABILITY = 0.06;
export const RED_ALERT_MIN_COOLDOWN_MS = 10 * 60 * 1000;
export const RED_ALERT_FORCE_AFTER_MS = 2 * 60 * 60 * 1000;

// Testing switch (disabled by default)
export const GLITCH_FORCE_ON_MOUNT = false;

// Burst tuning
export const NORMAL_GLITCH_BURST_MIN_MS = 600;
export const NORMAL_GLITCH_BURST_MAX_MS = 1_200;
export const RED_ALERT_BURST_MIN_MS = 2_500;
export const RED_ALERT_BURST_MAX_MS = 3_500;
export const FORCE_BURST_DURATION_MULTIPLIER = 3;
export const NORMAL_GLITCH_MICRO_PULSES_MIN = 2;
export const NORMAL_GLITCH_MICRO_PULSES_MAX = 4;
export const RED_ALERT_MICRO_PULSES_MIN = 4;
export const RED_ALERT_MICRO_PULSES_MAX = 7;

// Visual tuning
export const NORMAL_WARNING_OVERLAY_PROBABILITY = 0.25;
export const NORMAL_NOISE_OVERLAY_PROBABILITY = 0.58;
export const RED_ALERT_NOISE_OVERLAY_PROBABILITY = 0.96;
export const NORMAL_HUE_SHIFT_PROBABILITY = 0.35;
export const RED_ALERT_HUE_SHIFT_PROBABILITY = 0.82;
export const NORMAL_VIGNETTE_PULSE_PROBABILITY = 0.45;
export const RED_ALERT_VIGNETTE_PULSE_PROBABILITY = 0.88;
export const RED_ALERT_WARNING_FLASH_MIN_MS = 900;
export const RED_ALERT_WARNING_FLASH_MAX_MS = 1_600;
export const RED_ALERT_WARNING_FLASH_FORCE_MIN_MS = 2_600;
export const RED_ALERT_WARNING_FLASH_FORCE_MAX_MS = 4_200;
export const NORMAL_WARNING_FLASH_MIN_MS = 90;
export const NORMAL_WARNING_FLASH_MAX_MS = 180;

const WARNING_MESSAGES = [
  "SIGNAL BREACH",
  "TRACE DETECTED",
  "PACKET LOSS CRITICAL",
  "NETWORK INTEGRITY WARNING"
] as const;

export type GlobalGlitchState = {
  active: boolean;
  microPulse: boolean;
  redAlert: boolean;
  withNoise: boolean;
  withHueShift: boolean;
  withVignette: boolean;
  withWarning: boolean;
  warningFlashMs: number;
  warningText: (typeof WARNING_MESSAGES)[number];
};

export type GlobalGlitchController = {
  state: GlobalGlitchState;
  triggerNormalNow: () => void;
  triggerRedAlertNow: () => void;
};

const DEFAULT_GLITCH_STATE: GlobalGlitchState = {
  active: false,
  microPulse: false,
  redAlert: false,
  withNoise: false,
  withHueShift: false,
  withVignette: false,
  withWarning: false,
  warningFlashMs: NORMAL_WARNING_FLASH_MIN_MS,
  warningText: "SIGNAL BREACH"
};

function randomInt(min: number, max: number): number {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function buildPulseStarts(durationMs: number, pulseCount: number): number[] {
  const starts: number[] = [];

  for (let index = 1; index <= pulseCount; index += 1) {
    const anchor = Math.floor((durationMs * index) / (pulseCount + 1));
    const jitter = randomInt(-80, 80);
    const start = Math.max(0, Math.min(durationMs - 120, anchor + jitter));
    starts.push(start);
  }

  return starts.sort((a, b) => a - b);
}

export function useGlobalGlitch(): GlobalGlitchController {
  const [state, setState] = useState<GlobalGlitchState>(DEFAULT_GLITCH_STATE);
  const intervalRef = useRef<number | null>(null);
  const effectTimeoutRefs = useRef<number[]>([]);
  const jitterTimeoutRef = useRef<number | null>(null);
  const lastRedAlertRef = useRef<number>(Date.now());
  const hasHiddenTickRef = useRef(false);

  const clearEffectTimeouts = useCallback(() => {
    for (const timeoutId of effectTimeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }

    effectTimeoutRefs.current = [];
  }, []);

  const clearJitterTimeout = useCallback(() => {
    if (jitterTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(jitterTimeoutRef.current);
    jitterTimeoutRef.current = null;
  }, []);

  const scheduleEffectTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      effectTimeoutRefs.current = effectTimeoutRefs.current.filter((id) => id !== timeoutId);
      callback();
    }, Math.max(0, delayMs));

    effectTimeoutRefs.current.push(timeoutId);
    return timeoutId;
  }, []);

  const runBurst = useCallback(
    (mode: "cadence" | "force-normal" | "force-red-alert") => {
      if (document.hidden) {
        if (mode === "cadence") {
          hasHiddenTickRef.current = true;
        }
        return;
      }

      clearEffectTimeouts();

      const now = Date.now();
      const sinceLastRedAlert = now - lastRedAlertRef.current;
      const cooldownPassed = sinceLastRedAlert > RED_ALERT_MIN_COOLDOWN_MS;
      const forceRedAlertOnCadence = sinceLastRedAlert > RED_ALERT_FORCE_AFTER_MS;
      const forcedBurst = mode !== "cadence";
      const forcedRedAlert = mode === "force-red-alert";

      let redAlert = false;

      if (mode === "force-red-alert") {
        redAlert = true;
      } else if (mode === "force-normal") {
        redAlert = false;
      } else if (cooldownPassed && (forceRedAlertOnCadence || Math.random() < RED_ALERT_PROBABILITY)) {
        redAlert = true;
      }

      if (redAlert) {
        lastRedAlertRef.current = now;
      }

      const baseDurationMs = redAlert
        ? randomInt(RED_ALERT_BURST_MIN_MS, RED_ALERT_BURST_MAX_MS)
        : randomInt(NORMAL_GLITCH_BURST_MIN_MS, NORMAL_GLITCH_BURST_MAX_MS);
      const durationMs = forcedBurst
        ? baseDurationMs * FORCE_BURST_DURATION_MULTIPLIER
        : baseDurationMs;
      const basePulseCount = redAlert
        ? randomInt(RED_ALERT_MICRO_PULSES_MIN, RED_ALERT_MICRO_PULSES_MAX)
        : randomInt(NORMAL_GLITCH_MICRO_PULSES_MIN, NORMAL_GLITCH_MICRO_PULSES_MAX);
      const pulseCount = forcedBurst ? basePulseCount + (redAlert ? 4 : 2) : basePulseCount;
      const withNoise = redAlert
        ? Math.random() < RED_ALERT_NOISE_OVERLAY_PROBABILITY
        : Math.random() < NORMAL_NOISE_OVERLAY_PROBABILITY;
      const withHueShift = redAlert
        ? Math.random() < RED_ALERT_HUE_SHIFT_PROBABILITY
        : Math.random() < NORMAL_HUE_SHIFT_PROBABILITY;
      const withVignette = redAlert
        ? Math.random() < RED_ALERT_VIGNETTE_PULSE_PROBABILITY
        : Math.random() < NORMAL_VIGNETTE_PULSE_PROBABILITY;
      const withWarning = redAlert || Math.random() < NORMAL_WARNING_OVERLAY_PROBABILITY;
      const warningFlashMs = redAlert
        ? forcedRedAlert
          ? randomInt(RED_ALERT_WARNING_FLASH_FORCE_MIN_MS, RED_ALERT_WARNING_FLASH_FORCE_MAX_MS)
          : randomInt(RED_ALERT_WARNING_FLASH_MIN_MS, RED_ALERT_WARNING_FLASH_MAX_MS)
        : randomInt(NORMAL_WARNING_FLASH_MIN_MS, NORMAL_WARNING_FLASH_MAX_MS);
      const warningText = WARNING_MESSAGES[randomInt(0, WARNING_MESSAGES.length - 1)];

      setState({
        active: true,
        microPulse: false,
        redAlert,
        withNoise,
        withHueShift,
        withVignette,
        withWarning,
        warningFlashMs,
        warningText
      });

      const pulseStarts = buildPulseStarts(durationMs, pulseCount);

      for (const pulseStart of pulseStarts) {
        const pulseLength = redAlert
          ? forcedRedAlert
            ? randomInt(100, 220)
            : randomInt(60, 130)
          : forcedBurst
            ? randomInt(65, 140)
            : randomInt(45, 110);
        const pulseEnd = Math.min(durationMs, pulseStart + pulseLength);

        scheduleEffectTimeout(() => {
          setState((previous) => {
            if (!previous.active) {
              return previous;
            }

            return { ...previous, microPulse: true };
          });
        }, pulseStart);

        scheduleEffectTimeout(() => {
          setState((previous) => {
            if (!previous.active) {
              return previous;
            }

            return { ...previous, microPulse: false };
          });
        }, pulseEnd);
      }

      if (withWarning) {
        scheduleEffectTimeout(() => {
          setState((previous) => {
            if (!previous.active) {
              return previous;
            }

            return { ...previous, withWarning: false };
          });
        }, warningFlashMs);
      }

      scheduleEffectTimeout(() => {
        setState(DEFAULT_GLITCH_STATE);
      }, durationMs);
    },
    [clearEffectTimeouts, scheduleEffectTimeout]
  );

  const scheduleCadenceBurst = useCallback(() => {
    if (document.hidden) {
      hasHiddenTickRef.current = true;
      return;
    }

    clearJitterTimeout();
    const jitterDelay = randomInt(-NORMAL_GLITCH_JITTER_MS, NORMAL_GLITCH_JITTER_MS);

    jitterTimeoutRef.current = window.setTimeout(() => {
      jitterTimeoutRef.current = null;
      runBurst("cadence");
    }, Math.max(0, jitterDelay));
  }, [clearJitterTimeout, runBurst]);

  useEffect(() => {
    if (GLITCH_FORCE_ON_MOUNT) {
      scheduleEffectTimeout(() => runBurst("force-normal"), 120);
    }

    intervalRef.current = window.setInterval(() => {
      if (document.hidden) {
        hasHiddenTickRef.current = true;
        return;
      }

      scheduleCadenceBurst();
    }, NORMAL_GLITCH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.hidden) {
        hasHiddenTickRef.current = true;
        clearJitterTimeout();
        clearEffectTimeouts();
        setState(DEFAULT_GLITCH_STATE);
        return;
      }

      if (!hasHiddenTickRef.current) {
        return;
      }

      hasHiddenTickRef.current = false;
      scheduleCadenceBurst();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }

      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearJitterTimeout();
      clearEffectTimeouts();
      setState(DEFAULT_GLITCH_STATE);
    };
  }, [clearEffectTimeouts, clearJitterTimeout, runBurst, scheduleCadenceBurst, scheduleEffectTimeout]);

  return {
    state,
    triggerNormalNow: () => runBurst("force-normal"),
    triggerRedAlertNow: () => runBurst("force-red-alert")
  };
}
