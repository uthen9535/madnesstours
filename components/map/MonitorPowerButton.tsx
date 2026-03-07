"use client";

import styles from "@/styles/map-monitor.module.css";

type MonitorPowerButtonProps = {
  powerState: "off" | "booting" | "on" | "shutdown";
  onToggle: () => void;
};

export function MonitorPowerButton({ powerState, onToggle }: MonitorPowerButtonProps) {
  const busy = powerState === "booting" || powerState === "shutdown";
  const on = powerState === "on";
  const label = on ? "POWER OFF" : busy ? "PROCESSING" : "POWER ON";

  return (
    <button
      type="button"
      className={`${styles.powerButton} ${on ? styles.powerButtonOn : ""}`}
      onClick={onToggle}
      disabled={busy}
      aria-label={label}
    >
      <span className={styles.powerButtonLed} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
