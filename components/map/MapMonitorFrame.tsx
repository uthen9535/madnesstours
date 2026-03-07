"use client";

import type { ReactNode } from "react";
import styles from "@/styles/map-monitor.module.css";

type MapMonitorFrameProps = {
  powered: boolean;
  statusText: string;
  sideMonitorActive: boolean;
  sideMonitorMessage: string;
  onCloseSideMonitor: () => void;
  children: ReactNode;
  controls: ReactNode;
};

export function MapMonitorFrame({
  powered,
  statusText,
  sideMonitorActive,
  sideMonitorMessage,
  onCloseSideMonitor,
  children,
  controls
}: MapMonitorFrameProps) {
  return (
    <section className={styles.monitor}>
      <header className={styles.monitorHeader}>
        <div className={styles.monitorHeaderLeft}>
          <span className={`${styles.monitorLed} ${powered ? styles.monitorLedOn : ""}`} aria-hidden />
          <span className={styles.monitorTitle}>MADNESSNET // TACTICAL EARTH MONITOR</span>
        </div>
        <div className={styles.monitorHeaderRight}>
          <span className={styles.monitorStatus}>{statusText}</span>
          <span className={styles.monitorCode}>UNIT M-09</span>
        </div>
      </header>

      <div className={styles.monitorBody}>
        <div className={styles.monitorScrews} aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className={styles.monitorSideRailLeft} aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className={styles.monitorScreenShell}>
          {powered ? <div className={styles.monitorScreenGlow} aria-hidden /> : null}
          <div className={`${styles.monitorScreen} ${!powered ? styles.monitorScreenOff : ""}`}>{children}</div>
          <div className={styles.monitorScreenFrameMarks} aria-hidden>
            <span>RANGE</span>
            <span>RDR-12</span>
            <span>NAV</span>
          </div>
        </div>

        <aside className={styles.monitorRightRail}>{controls}</aside>

        <div className={styles.monitorVent} aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <aside className={`${styles.monitorStatusPod} ${sideMonitorActive ? styles.monitorStatusPodActive : ""}`} aria-live="polite">
        <header className={styles.monitorStatusPodHeader}>
          <p className={styles.monitorStatusPodLabel}>TARGET FEED</p>
          <button type="button" className={styles.monitorStatusPodClose} aria-label="Close target feed" onClick={onCloseSideMonitor}>
            RETRACT
          </button>
        </header>
        <p className={styles.monitorStatusPodMessage}>{sideMonitorMessage}</p>
      </aside>
    </section>
  );
}
