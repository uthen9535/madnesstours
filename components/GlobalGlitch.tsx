"use client";

import { useEffect, type CSSProperties } from "react";
import { useGlobalGlitch } from "@/lib/useGlobalGlitch";

const BODY_GLITCH_CLASSES = [
  "system-under-attack",
  "system-under-attack--pulse",
  "system-under-attack--hue",
  "system-under-attack--vignette",
  "system-under-attack--red-alert"
] as const;

function classNames(parts: Array<string | false>): string {
  return parts.filter(Boolean).join(" ");
}

export function GlobalGlitch() {
  const { state: glitch, triggerNormalNow, triggerRedAlertNow } = useGlobalGlitch();

  useEffect(() => {
    const forceGlitchFromEvent = () => {
      triggerNormalNow();
    };
    const forceRedAlertFromEvent = () => {
      triggerRedAlertNow();
    };
    const glitchWindow = window as Window & {
      madnessForceGlitch?: () => void;
      madnessForceRedAlert?: () => void;
    };

    glitchWindow.madnessForceGlitch = triggerNormalNow;
    glitchWindow.madnessForceRedAlert = triggerRedAlertNow;
    window.addEventListener("madnessnet:force-glitch", forceGlitchFromEvent);
    window.addEventListener("madnessnet:force-red-alert", forceRedAlertFromEvent);

    return () => {
      window.removeEventListener("madnessnet:force-glitch", forceGlitchFromEvent);
      window.removeEventListener("madnessnet:force-red-alert", forceRedAlertFromEvent);
      if (glitchWindow.madnessForceGlitch === triggerNormalNow) {
        delete glitchWindow.madnessForceGlitch;
      }
      if (glitchWindow.madnessForceRedAlert === triggerRedAlertNow) {
        delete glitchWindow.madnessForceRedAlert;
      }
    };
  }, [triggerNormalNow, triggerRedAlertNow]);

  useEffect(() => {
    const body = document.body;
    body.classList.toggle("system-under-attack", glitch.active);
    body.classList.toggle("system-under-attack--pulse", glitch.active && glitch.microPulse);
    body.classList.toggle("system-under-attack--hue", glitch.active && glitch.withHueShift);
    body.classList.toggle("system-under-attack--vignette", glitch.active && glitch.withVignette);
    body.classList.toggle("system-under-attack--red-alert", glitch.active && glitch.redAlert);

    return () => {
      for (const className of BODY_GLITCH_CLASSES) {
        body.classList.remove(className);
      }
    };
  }, [glitch.active, glitch.microPulse, glitch.redAlert, glitch.withHueShift, glitch.withVignette]);

  return (
    <div
      aria-hidden="true"
      className={classNames([
        "global-glitch-layer",
        glitch.active && "global-glitch-layer--active",
        glitch.microPulse && "global-glitch-layer--pulse",
        glitch.redAlert && "global-glitch-layer--red-alert",
        glitch.withNoise && "global-glitch-layer--noise",
        glitch.withHueShift && "global-glitch-layer--hue",
        glitch.withVignette && "global-glitch-layer--vignette"
      ])}
    >
      <div className="global-glitch-layer__rgb" />
      <div className="global-glitch-layer__scanlines" />
      <div className="global-glitch-layer__roll" />
      <div className="global-glitch-layer__tear" />
      <div className="global-glitch-layer__fragments" />
      {glitch.withNoise ? <div className="global-glitch-layer__noise" /> : null}
      {glitch.withWarning ? (
        <div
          className="global-glitch-layer__warning"
          style={{ "--warning-flash-ms": `${glitch.warningFlashMs}ms` } as CSSProperties}
        >
          <span>{glitch.warningText}</span>
        </div>
      ) : null}
    </div>
  );
}
