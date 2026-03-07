"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { NeonButton } from "@/components/NeonButton";

const PIN_LENGTH = 6;
const MATRIX_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&*/?<>";
const MATRIX_DIGITS = "0123456789";
const ARM_SEQUENCE = ["green", "yellow", "red"] as const;
const HISTOGRAM_BAR_COUNT = 100;
const OFFLINE_THREAT_TEXT = "ACTIVE THREAT DETECTION: UNAUTHORIZED INTERACTION WILL INITIATE SECURITY RESPONSE.";
type ArmColor = (typeof ARM_SEQUENCE)[number];
const TRANSIENT_LOGIN_RETRIES = 3;

export function StagingAccessTerminal() {
  const [codename, setCodename] = useState("");
  const [pinDigits, setPinDigits] = useState<string[]>(Array.from({ length: PIN_LENGTH }, () => ""));
  const [dialFlash, setDialFlash] = useState(false);
  const [revealPin, setRevealPin] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [accessMode, setAccessMode] = useState<"offline" | "wilco">("offline");
  const [hoverThreatZone, setHoverThreatZone] = useState<"codename" | "pin" | null>(null);
  const [typedThreatText, setTypedThreatText] = useState("");
  const [syncKnobAngle, setSyncKnobAngle] = useState(0);
  const [lockKnobAngle, setLockKnobAngle] = useState(0);
  const [armStep, setArmStep] = useState(0);
  const [codenameActivated, setCodenameActivated] = useState(false);
  const [pinActivated, setPinActivated] = useState(false);
  const [matrixCodename, setMatrixCodename] = useState("RESONANT");
  const [matrixPinDigits, setMatrixPinDigits] = useState<string[]>(
    Array.from({ length: PIN_LENGTH }, () => "0")
  );
  const pinRefs = useRef<Array<HTMLInputElement | null>>([]);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const syncKnobRef = useRef<HTMLButtonElement | null>(null);
  const lockKnobRef = useRef<HTMLButtonElement | null>(null);
  const syncKnobAngleRef = useRef(0);
  const lockKnobAngleRef = useRef(0);
  const controlsUnlocked = accessMode === "wilco";
  const wilcoAvailable = armStep >= ARM_SEQUENCE.length;
  const showCodenameMatrix = accessMode === "offline" || !codenameActivated;
  const showPinMatrix = accessMode === "offline" || !pinActivated;
  const histogramBars = Array.from({ length: HISTOGRAM_BAR_COUNT }, (_, index) => {
    const duration = 1.08 + (index % 11) * 0.09 + ((index * 7) % 5) * 0.03;
    const delay = -((index % 13) * 0.14);
    const peak = 45 + ((index * 17) % 46);
    return {
      id: `hist-${index}`,
      style: {
        "--bar-duration": `${duration.toFixed(2)}s`,
        "--bar-delay": `${delay.toFixed(2)}s`,
        "--bar-peak": `${peak}%`
      } as CSSProperties
    };
  });

  useEffect(() => {
    if (!showCodenameMatrix) {
      return;
    }

    const makeCodenameNoise = () =>
      Array.from({ length: 8 }, () => MATRIX_CHARSET[Math.floor(Math.random() * MATRIX_CHARSET.length)]).join("");

    setMatrixCodename(makeCodenameNoise());
    const timer = window.setInterval(() => {
      setMatrixCodename(makeCodenameNoise());
    }, 330);

    return () => window.clearInterval(timer);
  }, [showCodenameMatrix]);

  useEffect(() => {
    if (!showPinMatrix) {
      return;
    }

    const makePinNoise = () =>
      Array.from({ length: PIN_LENGTH }, () =>
        MATRIX_DIGITS[Math.floor(Math.random() * MATRIX_DIGITS.length)]
      );

    setMatrixPinDigits(makePinNoise());
    const timer = window.setInterval(() => {
      setMatrixPinDigits(makePinNoise());
    }, 280);

    return () => window.clearInterval(timer);
  }, [showPinMatrix]);

  useEffect(() => {
    if (!controlsUnlocked) {
      return;
    }

    if (!codename.trim() && codenameActivated) {
      setCodenameActivated(false);
    }

    if (pinDigits.every((digit) => digit === "") && pinActivated) {
      setPinActivated(false);
    }
  }, [codename, codenameActivated, controlsUnlocked, pinActivated, pinDigits]);

  useEffect(() => {
    if (accessMode !== "offline" || !hoverThreatZone) {
      setTypedThreatText("");
      return;
    }

    setTypedThreatText("");
    let cursor = 0;
    const timer = window.setInterval(() => {
      cursor += 1;
      setTypedThreatText(OFFLINE_THREAT_TEXT.slice(0, cursor));
      if (cursor >= OFFLINE_THREAT_TEXT.length) {
        window.clearInterval(timer);
      }
    }, 19);

    return () => window.clearInterval(timer);
  }, [accessMode, hoverThreatZone]);

  useEffect(() => {
    if (accessMode !== "offline") {
      return;
    }

    setCodename("");
    setPinDigits(Array.from({ length: PIN_LENGTH }, () => ""));
    setCodenameActivated(false);
    setPinActivated(false);
    setRevealPin(true);
    setArmStep(0);
    setLoginError("");
    setIsSubmitting(false);
  }, [accessMode]);

  const handleArmPress = (color: ArmColor) => {
    const expectedColor = ARM_SEQUENCE[armStep];
    if (color === expectedColor) {
      setArmStep((value) => Math.min(value + 1, ARM_SEQUENCE.length));
      return;
    }

    // Wrong order resets sequence; pressing green can restart instantly.
    setArmStep(color === "green" ? 1 : 0);
    if (accessMode === "wilco") {
      setAccessMode("offline");
    }
  };

  const handleArmReset = () => {
    setArmStep(0);
    setAccessMode("offline");
  };

  const setKnobRotation = (nextAngle: number, knob: "sync" | "lock") => {
    const normalized = ((nextAngle % 360) + 360) % 360;
    if (knob === "sync") {
      syncKnobAngleRef.current = normalized;
      setSyncKnobAngle(normalized);
      return;
    }

    lockKnobAngleRef.current = normalized;
    setLockKnobAngle(normalized);
  };

  const spinSyncKnob = () => {
    setKnobRotation(syncKnobAngleRef.current + 48 + Math.floor(Math.random() * 56), "sync");
  };

  const spinLockKnob = () => {
    setKnobRotation(lockKnobAngleRef.current + 52 + Math.floor(Math.random() * 52), "lock");
  };

  const noopDecorativeClick = () => undefined;

  const submitLogin = async () => {
    if (!controlsUnlocked || isSubmitting) {
      if (!controlsUnlocked) {
        setLoginError("Terminal offline. Engage WILCO to dial in.");
      }
      return;
    }

    const username = codename.trim().toLowerCase();
    const pin = pinDigits.join("");

    if (!username) {
      setLoginError("Codename required.");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      setLoginError("PIN must be 6 digits.");
      return;
    }

    setLoginError("");
    setIsSubmitting(true);

    try {
      let lastErrorMessage = "Invalid codename or PIN.";

      for (let attempt = 1; attempt <= TRANSIENT_LOGIN_RETRIES; attempt += 1) {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            username,
            pin
          })
        });

        if (!response.ok) {
          let message = "Invalid codename or PIN.";
          try {
            const json = (await response.json()) as { error?: string };
            if (json?.error) {
              message = json.error;
            }
          } catch {
            // Use default message.
          }

          lastErrorMessage = message;

          const retryAfterHeader = Number(response.headers.get("retry-after") ?? "");
          const retryAfterMs = Number.isFinite(retryAfterHeader) ? Math.max(0, retryAfterHeader) * 1000 : 0;
          const isRetryable = response.status === 503 || response.status === 504 || /temporarily unavailable/i.test(message);
          if (isRetryable && attempt < TRANSIENT_LOGIN_RETRIES) {
            setLoginError(`Re-establishing secure channel (${attempt}/${TRANSIENT_LOGIN_RETRIES - 1})...`);
            const fallbackWaitMs = 600 * attempt;
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, Math.max(retryAfterMs, fallbackWaitMs));
            });
            continue;
          }

          setLoginError(message);
          return;
        }

        let redirectTo = "/home";
        try {
          const json = (await response.json()) as { redirectTo?: string };
          if (json?.redirectTo) {
            redirectTo = json.redirectTo;
          }
        } catch {
          // Fall back to the default destination when the response body is empty/non-JSON.
        }

        // Force a full navigation so session cookies are always applied before loading protected routes.
        window.location.assign(redirectTo);
        return;
      }

      setLoginError(lastErrorMessage);
    } catch {
      setLoginError("Service temporarily unavailable.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKnobDragStart =
    (knob: "sync" | "lock") => (event: ReactPointerEvent<HTMLButtonElement>) => {
      const knobElement = knob === "sync" ? syncKnobRef.current : lockKnobRef.current;
      if (!knobElement) {
        return;
      }

      event.preventDefault();
      const rect = knobElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startPointerAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
      const startRotation = knob === "sync" ? syncKnobAngleRef.current : lockKnobAngleRef.current;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextPointerAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
        let delta = nextPointerAngle - startPointerAngle;
        if (delta > Math.PI) {
          delta -= Math.PI * 2;
        } else if (delta < -Math.PI) {
          delta += Math.PI * 2;
        }
        setKnobRotation(startRotation + (delta * 180) / Math.PI, knob);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let width = 0;
    let height = 0;
    let animationFrame = 0;

    const stars = Array.from({ length: 40 }, (_, index) => ({
      x: (index * 97.133) % 1,
      y: (index * 41.619) % 1,
      r: 0.6 + ((index * 0.17) % 1) * 1.4
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
    };

    const drawDormant = () => {
      context.clearRect(0, 0, width, height);
      const backgroundGradient = context.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, "#030a12");
      backgroundGradient.addColorStop(1, "#02070d");
      context.fillStyle = backgroundGradient;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(35, 70, 80, 0.14)";
      context.lineWidth = 1;
      for (let x = 0; x <= width; x += 24) {
        context.beginPath();
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, height);
        context.stroke();
      }
      for (let y = 0; y <= height; y += 24) {
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(width, y + 0.5);
        context.stroke();
      }

      const centerY = height * 0.57;
      context.strokeStyle = "rgba(57, 90, 99, 0.45)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, centerY);
      context.lineTo(width, centerY);
      context.stroke();

      context.fillStyle = "rgba(126, 159, 168, 0.42)";
      context.font = "12px 'Courier New', monospace";
      context.fillText("SIGNAL OFFLINE", Math.max(8, width * 0.04), Math.max(18, height * 0.18));
    };

    const draw = (timeMs: number) => {
      const t = timeMs / 1000;
      const centerY = height * 0.57;

      context.clearRect(0, 0, width, height);
      const backgroundGradient = context.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, "#02121f");
      backgroundGradient.addColorStop(1, "#010a12");
      context.fillStyle = backgroundGradient;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(61, 224, 204, 0.15)";
      context.lineWidth = 1;
      for (let x = 0; x <= width; x += 20) {
        context.beginPath();
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, height);
        context.stroke();
      }
      for (let y = 0; y <= height; y += 20) {
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(width, y + 0.5);
        context.stroke();
      }

      context.fillStyle = "rgba(105, 249, 234, 0.24)";
      stars.forEach((star) => {
        const pulse = 0.35 + 0.65 * Math.sin(t * 1.1 + star.x * 9.4);
        context.globalAlpha = pulse * 0.5;
        context.beginPath();
        context.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;

      context.strokeStyle = "rgba(43, 182, 164, 0.55)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, centerY);
      context.lineTo(width, centerY);
      context.stroke();

      const sweepX = ((t * 80) % (width + 120)) - 120;
      const sweepGradient = context.createLinearGradient(sweepX, 0, sweepX + 120, 0);
      sweepGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      sweepGradient.addColorStop(0.5, "rgba(95, 250, 235, 0.15)");
      sweepGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = sweepGradient;
      context.fillRect(0, 0, width, height);

      const spikeCenter = ((Math.sin(t * 0.31) + 1) * 0.5) * width;
      const spikeMix = 0.45 + 0.55 * Math.sin(t * 0.85 + 0.8);

      context.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const slowCarrier =
          Math.sin(x * 0.02 + t * 2.8) * 6 +
          Math.sin(x * 0.006 - t * 1.2) * 8 +
          Math.sin(x * 0.05 + t * 5.9) * 1.6;
        const envelope = 0.65 + 0.35 * Math.sin((x / width) * Math.PI * 1.6 - t * 0.7);
        const spikeBody = Math.exp(-((x - spikeCenter) ** 2) / (2 * (width * 0.06) ** 2));
        const spike =
          spikeBody *
          (Math.sin(x * 0.28 + t * 34) * 26 + Math.sin(x * 0.14 + t * 19) * 11) *
          spikeMix;
        const y = centerY + slowCarrier * envelope + spike;
        if (x === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.strokeStyle = "rgba(76, 255, 229, 0.96)";
      context.lineWidth = 1.6;
      context.shadowColor = "rgba(76, 255, 229, 0.8)";
      context.shadowBlur = 10;
      context.stroke();

      context.shadowBlur = 0;
      context.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const fineWave = Math.sin(x * 0.013 + t * 1.7) * 5 + Math.sin(x * 0.043 - t * 4.7) * 2;
        const y = centerY + fineWave;
        if (x === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.strokeStyle = "rgba(136, 255, 245, 0.25)";
      context.lineWidth = 1;
      context.stroke();

      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    if (!controlsUnlocked) {
      drawDormant();
      const handleDormantResize = () => {
        resize();
        drawDormant();
      };
      window.addEventListener("resize", handleDormantResize);
      return () => {
        window.removeEventListener("resize", handleDormantResize);
        window.cancelAnimationFrame(animationFrame);
      };
    }

    animationFrame = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [controlsUnlocked]);

  const updatePinDigit = (index: number, value: string) => {
    if (!controlsUnlocked) {
      return;
    }

    const next = value.replace(/\D/g, "").slice(-1);
    if (!pinActivated && next) {
      setPinActivated(true);
    }
    setPinDigits((previous) => {
      const copy = [...previous];
      copy[index] = next;
      return copy;
    });

    if (next && index < PIN_LENGTH - 1) {
      pinRefs.current[index + 1]?.focus();
      pinRefs.current[index + 1]?.select();
    }
  };

  return (
    <section
      className={controlsUnlocked ? "staging-terminal is-live" : "staging-terminal is-dead"}
      aria-label="Staged access terminal"
    >
      <div className="staging-terminal__frame">
        <header className="staging-terminal__titlebar">
          <span className="staging-terminal__status-light" aria-hidden="true" />
          <h2>Access Terminal</h2>
        </header>

        <div className="staging-terminal__grid">
          <aside className="staging-terminal__rail staging-terminal__rail--left">
            <button
              type="button"
              className="staging-terminal__rail-label"
              onClick={noopDecorativeClick}
              aria-label="OSC decorative control"
            >
              OSC
            </button>
            <div className="staging-terminal__mini-scope">
              <span />
            </div>
            <div className="staging-terminal__speaker-grid" />
          </aside>

          <div className="staging-terminal__core">
            <p className="staging-terminal__banner">-- PRIVATE NETWORK FOR MADNESS TOUR MEMBERS --</p>

            <div
              className={codenameActivated ? "staging-terminal__field-wrap is-active" : "staging-terminal__field-wrap is-dormant"}
              onMouseEnter={() => setHoverThreatZone("codename")}
              onMouseLeave={() => setHoverThreatZone(null)}
            >
              <div className="staging-terminal__field-header">
                <label htmlFor="staging-codename">CODENAME</label>
                <div className="staging-terminal__mode-toggles">
                  <button
                    type="button"
                    className={
                      accessMode === "offline"
                        ? "staging-terminal__mode-toggle staging-terminal__mode-toggle--offline is-active"
                        : "staging-terminal__mode-toggle staging-terminal__mode-toggle--offline"
                    }
                    onClick={() => setAccessMode("offline")}
                    aria-pressed={accessMode === "offline"}
                  >
                    <span>OFFLINE</span>
                    <i />
                  </button>
                  <button
                    type="button"
                    className={
                      accessMode === "wilco"
                        ? "staging-terminal__mode-toggle staging-terminal__mode-toggle--wilco is-active"
                        : "staging-terminal__mode-toggle staging-terminal__mode-toggle--wilco"
                    }
                    onClick={() => setAccessMode("wilco")}
                    aria-pressed={accessMode === "wilco"}
                    disabled={!wilcoAvailable && accessMode !== "wilco"}
                  >
                    <span>WILCO</span>
                    <i />
                  </button>
                </div>
              </div>
              <input
                id="staging-codename"
                value={codename}
                onChange={(event) => {
                  const next = event.target.value.toUpperCase();
                  if (!codenameActivated && next.trim().length > 0) {
                    setCodenameActivated(true);
                  }
                  setCodename(next);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitLogin();
                  }
                }}
                autoComplete="off"
                spellCheck={false}
                disabled={!controlsUnlocked}
                className={showCodenameMatrix ? "is-matrix" : "is-live"}
              />
              {showCodenameMatrix ? <span className="staging-terminal__matrix-overlay">{matrixCodename}</span> : null}
            </div>

            <div
              className={pinActivated ? "staging-terminal__pin-wrap is-active" : "staging-terminal__pin-wrap is-dormant"}
              onMouseEnter={() => setHoverThreatZone("pin")}
              onMouseLeave={() => setHoverThreatZone(null)}
            >
              <div className="staging-terminal__pin-label">
                <span>:: PIN (6 DIGITS)</span>
                <span>--</span>
              </div>
              <div className="staging-terminal__pin-row">
                {pinDigits.map((digit, index) => (
                  <div key={`pin-${index}`} className="staging-terminal__pin-cell">
                    <input
                      ref={(element) => {
                        pinRefs.current[index] = element;
                      }}
                      value={revealPin ? digit : digit ? "✱" : ""}
                      onChange={(event) => updatePinDigit(index, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitLogin();
                        }
                      }}
                      inputMode="numeric"
                      maxLength={1}
                      aria-label={`PIN digit ${index + 1}`}
                      type="text"
                      disabled={!controlsUnlocked}
                      className={showPinMatrix ? "is-matrix" : "is-live"}
                    />
                    {showPinMatrix ? (
                      <span className="staging-terminal__matrix-pin">{matrixPinDigits[index]}</span>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="staging-terminal__eye"
                  onClick={() => setRevealPin((value) => !value)}
                  aria-label={revealPin ? "Enable covert PIN entry" : "Disable covert PIN entry"}
                  disabled={!controlsUnlocked}
                >
                  <span
                    className={
                      revealPin ? "staging-terminal__eye-ring is-open" : "staging-terminal__eye-ring is-covert"
                    }
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            <div className={dialFlash ? "staging-terminal__dial is-active" : "staging-terminal__dial"}>
              <NeonButton
                type="button"
                className="staging-terminal__dial-button"
                disabled={!controlsUnlocked || isSubmitting}
                onClick={async () => {
                  if (!controlsUnlocked) {
                    return;
                  }
                  setDialFlash(true);
                  window.setTimeout(() => setDialFlash(false), 450);
                  await submitLogin();
                }}
              >
                {isSubmitting ? "Connecting..." : "Dial In"}
              </NeonButton>
            </div>

            <div className="staging-terminal__scope">
              <canvas ref={waveformRef} aria-label="Terminal frequency display" />
              {accessMode === "offline" && typedThreatText ? (
                <p className="staging-terminal__scope-alert">{typedThreatText}</p>
              ) : null}
            </div>

            <p className="staging-terminal__hint">
              Need a codename? Contact admin for account provisioning. This terminal is invite-only and credentials are
              issued directly by command station.
            </p>
            <p className={controlsUnlocked ? "staging-terminal__lock-hint is-online" : "staging-terminal__lock-hint"}>
              {controlsUnlocked ? "SEEK: ONLINE // SYSTEM ENGAGE" : "SEEK: OFFLINE // SYSTEM OFFLINE"}
            </p>
            {loginError ? <p className="form-error">{loginError}</p> : null}
          </div>

          <aside className="staging-terminal__rail staging-terminal__rail--right" aria-label="Auxiliary panel controls">
            <div className="staging-terminal__dial-stack">
              <span>SYNC</span>
              <button
                type="button"
                ref={syncKnobRef}
                className="staging-terminal__knob"
                style={{ "--knob-rotation": `${syncKnobAngle}deg` } as CSSProperties}
                onClick={spinSyncKnob}
                onPointerDown={handleKnobDragStart("sync")}
                aria-label="Spin sync dial"
              />
            </div>
            <div className="staging-terminal__dial-stack">
              <span>LOCK</span>
              <button
                type="button"
                ref={lockKnobRef}
                className="staging-terminal__knob"
                style={{ "--knob-rotation": `${lockKnobAngle}deg` } as CSSProperties}
                onClick={spinLockKnob}
                onPointerDown={handleKnobDragStart("lock")}
                aria-label="Spin lock dial"
              />
            </div>
            <button
              type="button"
              className="staging-terminal__switch is-red"
              onClick={noopDecorativeClick}
              aria-label="Decorative red button"
            />
            <button
              type="button"
              className="staging-terminal__switch is-amber"
              onClick={noopDecorativeClick}
              aria-label="Decorative amber button"
            />
          </aside>
        </div>

        <footer className="staging-terminal__footer">
          <div className={controlsUnlocked ? "staging-terminal__vent is-live" : "staging-terminal__vent"}>
            <div className={controlsUnlocked ? "staging-terminal__vent-bars is-live" : "staging-terminal__vent-bars"}>
              {histogramBars.map((bar) => (
                <span key={bar.id} style={bar.style} />
              ))}
            </div>
          </div>
          <div className="staging-terminal__footer-controls">
            <div className="staging-terminal__arm-grid" role="group" aria-label="Signal arm sequence">
              <button
                type="button"
                className="staging-terminal__arm-button staging-terminal__switch is-green"
                onClick={() => handleArmPress("green")}
                aria-label="Green signal button"
              />
              <button
                type="button"
                className="staging-terminal__arm-button staging-terminal__switch is-yellow"
                onClick={() => handleArmPress("yellow")}
                aria-label="Yellow signal button"
              />
              <button
                type="button"
                className="staging-terminal__arm-button staging-terminal__switch is-red"
                onClick={() => handleArmPress("red")}
                aria-label="Red signal button"
              />
              <button
                type="button"
                className="staging-terminal__arm-button staging-terminal__switch is-reset"
                onClick={handleArmReset}
                aria-label="Reset signal buttons"
              />
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
}
