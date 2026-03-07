"use client";

import styles from "@/styles/map-monitor.module.css";
import { MonitorPowerButton } from "@/components/map/MonitorPowerButton";

type MapControlPanelProps = {
  powerState: "off" | "booting" | "on" | "shutdown";
  targetingMode: boolean;
  hasOwnTarget: boolean;
  targetCount: number;
  zoomPct: number;
  targetCursor: { xPct: number; yPct: number };
  onTogglePower: () => void;
  onToggleTargeting: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onMoveTarget: (direction: "up" | "down" | "left" | "right") => void;
  onConfirmTarget: () => void;
  onClearTarget: () => void;
};

export function MapControlPanel({
  powerState,
  targetingMode,
  hasOwnTarget,
  targetCount,
  zoomPct,
  targetCursor,
  onTogglePower,
  onToggleTargeting,
  onZoomIn,
  onZoomOut,
  onMoveTarget,
  onConfirmTarget,
  onClearTarget
}: MapControlPanelProps) {
  const powered = powerState === "on";

  return (
    <section className={styles.controlPanel} aria-label="Map monitor control panel">
      <div className={styles.controlNameplate}>M-09 ANALOG TARGETING ARRAY</div>

      <div className={styles.controlPanelGroup}>
        <p className={styles.controlGroupLabel}>Power Train</p>
        <MonitorPowerButton powerState={powerState} onToggle={onTogglePower} />
        <div className={styles.switchRow} aria-hidden>
          <button type="button" className={styles.sliderSwitch}>
            V-ARM
          </button>
          <button type="button" className={styles.sliderSwitch}>
            SWEEP
          </button>
          <button type="button" className={styles.sliderSwitch}>
            LOCK
          </button>
        </div>
        <div className={styles.zoomRow}>
          <button
            type="button"
            className={styles.zoomButton}
            disabled={!powered}
            onClick={onZoomIn}
            aria-label="Zoom in map"
          >
            2+
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            disabled={!powered}
            onClick={onZoomOut}
            aria-label="Zoom out map"
          >
            2-
          </button>
          <span className={styles.zoomReadout}>{zoomPct}%</span>
        </div>
      </div>

      <div className={styles.controlPanelGroup}>
        <p className={styles.controlGroupLabel}>Primary Armament</p>
        <div className={styles.majorButtonWrap}>
          <button
            type="button"
            className={`${styles.targetPrimaryButton} ${targetingMode ? styles.targetPrimaryButtonActive : ""}`}
            onClick={onToggleTargeting}
            disabled={!powered}
          >
            {targetingMode ? "TARGETING ENABLED" : "ARM TARGET MODE"}
          </button>
          <span className={styles.targetPrimaryLabel}>TARGET NEXT LOCATION</span>
        </div>
      </div>

      <div className={styles.controlPanelGroup}>
        <p className={styles.controlGroupLabel}>Vector Control</p>
        <div className={styles.directionalPad}>
          <button
            type="button"
            className={`${styles.directionalButton} ${styles.directionalUp}`}
            disabled={!powered || !targetingMode}
            onClick={() => onMoveTarget("up")}
            aria-label="Move target up"
          >
            ▲
          </button>
          <button
            type="button"
            className={`${styles.directionalButton} ${styles.directionalLeft}`}
            disabled={!powered || !targetingMode}
            onClick={() => onMoveTarget("left")}
            aria-label="Move target left"
          >
            ◀
          </button>
          <button
            type="button"
            className={`${styles.directionalButton} ${styles.directionalRight}`}
            disabled={!powered || !targetingMode}
            onClick={() => onMoveTarget("right")}
            aria-label="Move target right"
          >
            ▶
          </button>
          <button
            type="button"
            className={`${styles.directionalButton} ${styles.directionalDown}`}
            disabled={!powered || !targetingMode}
            onClick={() => onMoveTarget("down")}
            aria-label="Move target down"
          >
            ▼
          </button>
        </div>
        <div className={styles.telemetryStrip}>
          <span>x-axis: {targetCursor.xPct.toFixed(1)}%</span>
          <span>y-axis: {targetCursor.yPct.toFixed(1)}%</span>
          <span>{targetingMode ? "scope locked" : "scope parked"}</span>
        </div>
      </div>

      <div className={styles.controlPanelGroup}>
        <p className={styles.controlGroupLabel}>Execute</p>
        <div className={styles.executeRow}>
          <button
            type="button"
            className={`${styles.confirmButton} ${targetingMode ? styles.confirmButtonHot : ""}`}
            disabled={!powered || !targetingMode}
            onClick={onConfirmTarget}
          >
            LOCK TARGET
          </button>
          <button type="button" className={styles.clearButton} onClick={onClearTarget} disabled={!powered || !hasOwnTarget}>
            CLEAR MARK
          </button>
        </div>
        <div className={styles.rotaryRow} aria-hidden>
          <span className={styles.rotaryKnob} />
          <span className={styles.rotaryKnob} />
          <span className={styles.rotaryKnob} />
        </div>
        <div className={styles.telemetryStrip}>
          <span>collective votes: {targetCount}</span>
          <span>{powered ? "signal feed: online" : "signal feed: standby"}</span>
        </div>
        <div className={styles.commsGrill} aria-hidden>
          {Array.from({ length: 54 }).map((_, index) => (
            <i key={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
