"use client";

import { useState } from "react";
import styles from "@/styles/relic-vault.module.css";

type CabinetPosition = {
  top: string;
  left: string;
  width: string;
  height: string;
};

type CabinetProps = {
  title: string;
  categoryKey: "punches" | "stamps" | "artifacts";
  position: CabinetPosition;
  zIndex?: number;
  arming?: boolean;
  onOpen: (category: "punches" | "stamps" | "artifacts") => void;
};

const DRAWERS = [0, 1, 2];

const ACTIVE_DRAWER_BY_CATEGORY: Record<CabinetProps["categoryKey"], number> = {
  punches: 0,
  stamps: 1,
  artifacts: 2
};

const CABINET_LABEL: Record<CabinetProps["categoryKey"], string> = {
  punches: "PUNCHES",
  stamps: "STAMPS",
  artifacts: "ARTIFACTS"
};

export function Cabinet({ title, categoryKey, position, zIndex = 2, arming = false, onOpen }: CabinetProps) {
  const [showHudTooltip, setShowHudTooltip] = useState(false);
  const activeDrawerIndex = ACTIVE_DRAWER_BY_CATEGORY[categoryKey];

  return (
    <section
      className={`${styles.cabinet}${arming ? ` ${styles.cabinetArming}` : ""}`}
      data-category={categoryKey}
      style={{ ...position, zIndex }}
      aria-label={`${title} cabinet`}
      onMouseLeave={() => setShowHudTooltip(false)}
    >
      <div className={styles.cabinetFrame}>
        <span className={styles.cabinetScanline} aria-hidden="true" />
        <header className={styles.cabinetHeader}>
          <span className={styles.cabinetControlStrip}>
            <span className={styles.controlButtonCluster} aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => (
                <span key={`${categoryKey}-control-${index}`} className={styles.controlButton} />
              ))}
            </span>
            <span className={styles.controlLedCluster} aria-hidden="true">
              <span className={`${styles.controlLed} ${styles.controlLedFast}`} />
              <span className={`${styles.controlLed} ${styles.controlLedMedium}`} />
              <span className={`${styles.controlLed} ${styles.controlLedSlow}`} />
            </span>
            <span className={styles.controlStatusText}>SYNC</span>
            <span className={styles.cabinetLed} aria-hidden="true" />
          </span>
        </header>
        <div className={styles.cabinetDrawers}>
          {DRAWERS.map((drawerIndex) => {
            const isActive = drawerIndex === activeDrawerIndex;
            return (
              <button
                key={`${categoryKey}-drawer-${drawerIndex + 1}`}
                type="button"
                className={`${styles.drawerButton} ${isActive ? styles.drawerActive : styles.drawerInactive}`}
                onMouseEnter={isActive ? () => setShowHudTooltip(true) : undefined}
                onMouseLeave={isActive ? () => setShowHudTooltip(false) : undefined}
                onFocus={isActive ? () => setShowHudTooltip(true) : undefined}
                onBlur={isActive ? () => setShowHudTooltip(false) : undefined}
                onTouchStart={isActive ? () => setShowHudTooltip(true) : undefined}
                onClick={isActive ? () => onOpen(categoryKey) : undefined}
                tabIndex={isActive ? 0 : -1}
                aria-label={isActive ? `Open ${title} drawer ${drawerIndex + 1}` : `${title} drawer ${drawerIndex + 1}`}
                aria-disabled={!isActive}
              >
                <span className={styles.drawerLabelPlate}>{isActive ? CABINET_LABEL[categoryKey] : ""}</span>
                {isActive ? <span className={styles.drawerClassified}>CLASSIFIED</span> : null}
                <span className={styles.drawerHandle} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div
          className={`${styles.hudTooltip} ${styles.hudTooltipCabinet} ${showHudTooltip ? styles.hudTooltipVisible : ""}`}
        >
          OPEN DRAWER
        </div>
        <footer className={styles.cabinetBase} aria-hidden="true">
          <span className={styles.cabinetBaseVent} />
          <span className={styles.cabinetBaseBolt} />
          <span className={styles.cabinetBaseBolt} />
        </footer>
      </div>
    </section>
  );
}

export type { CabinetPosition };
