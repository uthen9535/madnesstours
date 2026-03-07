"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MissionCountdownModuleProps = {
  objective: {
    title: string;
    startDateIso: string;
  } | null;
};

type CountdownParts = {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const ACTIVE_TICKER = [
  "PREPARE OPERATORS",
  "MISSION CLOCK ACTIVE",
  "DEPLOYMENT WINDOW STABLE",
  "ALL HANDS ON DECK"
];

const FALLBACK_TICKER = [
  "DATE NOT SET",
  "COMMAND NEGLIGENCE DETECTED",
  "CLOCK UNSYNCHRONIZED",
  "SELF-DESTRUCT LOOMING"
];

function getCountdownParts(targetTimeMs: number, nowMs: number): CountdownParts {
  const totalMs = Math.max(targetTimeMs - nowMs, 0);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalMs,
    days,
    hours,
    minutes,
    seconds
  };
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

export function MissionCountdownModule({ objective }: MissionCountdownModuleProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const tickerTimer = window.setInterval(() => setTickerIndex((current) => current + 1), 2800);
    return () => window.clearInterval(tickerTimer);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onClickOutside(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const targetTimeMs = objective ? new Date(objective.startDateIso).getTime() : null;
  const countdown = useMemo(() => {
    if (!targetTimeMs) {
      return null;
    }
    return getCountdownParts(targetTimeMs, nowMs);
  }, [nowMs, targetTimeMs]);

  const objectiveActive = Boolean(objective && countdown && countdown.totalMs > 0);
  const tickerPhrases = objectiveActive ? ACTIVE_TICKER : FALLBACK_TICKER;
  const activeTickerPhrase = tickerPhrases[tickerIndex % tickerPhrases.length];

  return (
    <div ref={rootRef} className={`mission-countdown ${open ? "mission-countdown--open" : ""}`}>
      <button
        type="button"
        className={`mission-countdown__chip ${objectiveActive ? "mission-countdown__chip--active" : "mission-countdown__chip--empty"}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Toggle mission countdown"
      >
        <span className="mission-countdown__chip-label">Mission Countdown</span>
        {objectiveActive && countdown ? (
          <span className="mission-countdown__chip-value">
            {countdown.days}d {twoDigits(countdown.hours)}h {twoDigits(countdown.minutes)}m {twoDigits(countdown.seconds)}s
          </span>
        ) : (
          <span className="mission-countdown__chip-value">NO OBJECTIVE</span>
        )}
      </button>

      {open ? (
        <section className={`mission-countdown__panel ${objectiveActive ? "mission-countdown__panel--active" : "mission-countdown__panel--warning"}`}>
          <div className="mission-countdown__panel-header">
            <span className="mission-countdown__panel-title">MISSION COUNTDOWN CONSOLE</span>
            <div className="mission-countdown__leds" aria-hidden>
              <i />
              <i />
              <i />
            </div>
          </div>

          {objectiveActive && objective && countdown ? (
            <>
              <div className="mission-countdown__mission-block">
                <p className="mission-countdown__mission-title">{objective.title}</p>
                <p className="mission-countdown__mission-date">
                  START DATE: {new Date(objective.startDateIso).toLocaleString()}
                </p>
              </div>

              <div className="mission-countdown__digits" role="status" aria-live="polite">
                <div>
                  <strong>{countdown.days.toString().padStart(3, "0")}</strong>
                  <span>DAYS</span>
                </div>
                <div>
                  <strong>{twoDigits(countdown.hours)}</strong>
                  <span>HRS</span>
                </div>
                <div>
                  <strong>{twoDigits(countdown.minutes)}</strong>
                  <span>MIN</span>
                </div>
                <div>
                  <strong>{twoDigits(countdown.seconds)}</strong>
                  <span>SEC</span>
                </div>
              </div>

              <div className="mission-countdown__status-lines">
                <p>OBJECTIVE LOCKED</p>
                <p>DEPLOYMENT WINDOW APPROACHING</p>
              </div>
            </>
          ) : (
            <div className="mission-countdown__fallback">
              <p className="mission-countdown__fallback-title">HEADQUARTERS WARNING</p>
              <p>NO ACTIVE MISSION OBJECTIVE DETECTED</p>
              <p>SET A DEPLOYMENT DATE IMMEDIATELY</p>
              <p>HEADQUARTERS SELF-DESTRUCT PROTOCOLS ARE NOW UNDER REVIEW</p>
            </div>
          )}

          <div className="mission-countdown__ticker-wrap" aria-hidden>
            <span className="mission-countdown__ticker-glow" />
            <div className="mission-countdown__ticker-track">
              <span>{`${activeTickerPhrase} // ${activeTickerPhrase} // ${activeTickerPhrase} //`}</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
