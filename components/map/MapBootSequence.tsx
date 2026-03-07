"use client";

import { useEffect, useState } from "react";
import styles from "@/styles/map-monitor.module.css";

type MapBootSequenceProps = {
  state: "off" | "booting" | "on" | "shutdown";
};

const STANDBY_SCRIPT = ">> MONITOR STANDBY... // SYS::OFFLINE // await POWER_ON_SIGNAL();";

export function MapBootSequence({ state }: MapBootSequenceProps) {
  const [typedStandby, setTypedStandby] = useState("");

  useEffect(() => {
    if (state !== "off") {
      setTypedStandby("");
      return;
    }

    let intervalId = 0;
    let timeoutId = 0;
    let cursor = 0;

    const beginLoop = () => {
      cursor = 0;
      setTypedStandby("");

      intervalId = window.setInterval(() => {
        cursor += 1;
        setTypedStandby(STANDBY_SCRIPT.slice(0, cursor));

        if (cursor >= STANDBY_SCRIPT.length) {
          window.clearInterval(intervalId);
          timeoutId = window.setTimeout(beginLoop, 520);
        }
      }, 24);
    };

    beginLoop();

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [state]);

  if (state === "on") {
    return null;
  }

  if (state === "off") {
    return (
      <div className={`${styles.screenMask} ${styles.screenMaskOff}`}>
        <span className={styles.standbyLed} aria-hidden />
        <div className={styles.standbyTerminal}>
          <p className={styles.standbyPrompt}>root@madnessnet://monitor-feed</p>
          <p className={styles.standbyTypedLine}>
            {typedStandby}
            <span className={styles.standbyCaret} aria-hidden>
              _
            </span>
          </p>
          <p className={styles.standbySubline}>if (POWER === OFF) {'{'} monitor.standby(); {'}'}</p>
        </div>
      </div>
    );
  }

  if (state === "shutdown") {
    return (
      <div className={`${styles.screenMask} ${styles.screenMaskShutdown}`}>
        <span className={styles.shutdownLine} aria-hidden />
      </div>
    );
  }

  return (
    <div className={`${styles.screenMask} ${styles.screenMaskBooting}`}>
      <span className={styles.bootFlash} aria-hidden />
      <span className={styles.bootSweep} aria-hidden />
      <p>INITIALIZING TACTICAL FEED</p>
    </div>
  );
}
