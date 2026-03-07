"use client";

import { useEffect, useMemo, useState } from "react";
import { CyberpunkTripMap, type TripPin } from "@/components/CyberpunkTripMap";
import { MapBootSequence } from "@/components/map/MapBootSequence";
import { MapControlPanel } from "@/components/map/MapControlPanel";
import { MapMonitorFrame } from "@/components/map/MapMonitorFrame";
import styles from "@/styles/map-monitor.module.css";

type MapMonitorSceneProps = {
  trips: TripPin[];
  username: string;
};

type PowerState = "off" | "booting" | "on" | "shutdown";

type StoredTarget = {
  id: string;
  owner: string;
  xPct: number;
  yPct: number;
  latitude: number;
  longitude: number;
  updatedAt: number;
};

const TARGET_STORAGE_KEY = "madnessnet_map_targets_v1";
const TARGET_STEP = 1.4;
const HYPE_MESSAGES = [
  {
    title: "TARGET ARMED // LET'S FUCKING GO",
    body: "Coordinates received and locked into the Madness targeting array. Whoever armed that location clearly understands how this operation works. The crew now has fresh coordinates and a damn good reason to start planning the next wave of bad decisions somewhere new. Excellent work, operator. Momentum engaged."
  },
  {
    title: "LOCK IT IN // SEND IT",
    body: "That location is now marked on the tactical board. Somewhere on Earth a future version of this crew is already raising hell at those exact coordinates. Analysts are calling this move bold, strategic, and extremely likely to produce new inside jokes and at least one story that will never be repeated in daylight."
  },
  {
    title: "OBJECTIVE ACQUIRED // NO HESITATION",
    body: "Target confirmed. The Madness network has accepted your coordinates and the objective is now visible to the entire crew. This is how the next chapter starts: one decisive operator, one blinking console, and a destination that just became inevitable."
  },
  {
    title: "TARGET LINE HOT // MOVE WITH INTENT",
    body: "You just lit up the targeting grid. That location is now broadcasting across the Madness network as a deployment zone. Flights will be booked, bars will be located, and the terrain will soon learn exactly what this crew is capable of."
  },
  {
    title: "THIS IS THE ONE // EXECUTE",
    body: "Your mark has been recorded in the Madness archive as a future memory waiting to happen. Sunrises, cliff jumps, questionable decisions, and nights strong enough to rewrite the group lore. Well done, operator. The next legend just found its starting point."
  }
] as const;

type TargetCursor = {
  xPct: number;
  yPct: number;
};

type PendingTarget = {
  xPct: number;
  yPct: number;
  latitude: number;
  longitude: number;
};

type HypeMessage = (typeof HYPE_MESSAGES)[number];

function pickHypeMessage(previous?: HypeMessage | null): HypeMessage {
  if (HYPE_MESSAGES.length <= 1) {
    return HYPE_MESSAGES[0];
  }
  const pool = HYPE_MESSAGES.filter((message) => message.title !== previous?.title);
  const source = pool.length > 0 ? pool : HYPE_MESSAGES;
  const index = Math.floor(Math.random() * source.length);
  return source[index] ?? HYPE_MESSAGES[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function percentToLatLng(xPct: number, yPct: number): { latitude: number; longitude: number } {
  return {
    latitude: clamp(90 - (yPct / 100) * 180, -85, 85),
    longitude: clamp((xPct / 100) * 360 - 180, -180, 180)
  };
}

function parseStoredTargets(raw: string | null): StoredTarget[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const target = entry as Partial<StoredTarget>;
        if (
          typeof target.id !== "string" ||
          typeof target.owner !== "string" ||
          typeof target.xPct !== "number" ||
          typeof target.yPct !== "number" ||
          typeof target.latitude !== "number" ||
          typeof target.longitude !== "number" ||
          typeof target.updatedAt !== "number"
        ) {
          return null;
        }

        return {
          id: target.id,
          owner: target.owner,
          xPct: target.xPct,
          yPct: target.yPct,
          latitude: target.latitude,
          longitude: target.longitude,
          updatedAt: target.updatedAt
        };
      })
      .filter((value): value is StoredTarget => value !== null);
  } catch {
    return [];
  }
}

export function MapMonitorScene({ trips, username }: MapMonitorSceneProps) {
  const owner = username.toLowerCase();
  const [powerState, setPowerState] = useState<PowerState>("off");
  const [targetingMode, setTargetingMode] = useState(false);
  const [targets, setTargets] = useState<StoredTarget[]>([]);
  const [targetCursor, setTargetCursor] = useState<TargetCursor>({ xPct: 50, yPct: 54 });
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(null);
  const [zoomCommand, setZoomCommand] = useState<{ id: number; direction: "in" | "out" } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const [targetFeedOpen, setTargetFeedOpen] = useState(false);
  const [targetFeedMessage, setTargetFeedMessage] = useState<HypeMessage>(HYPE_MESSAGES[0]);
  const [typedTargetFeedMessage, setTypedTargetFeedMessage] = useState("");

  useEffect(() => {
    const loaded = parseStoredTargets(window.localStorage.getItem(TARGET_STORAGE_KEY));
    setTargets(loaded);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(targets));
  }, [targets]);

  useEffect(() => {
    if (powerState === "booting") {
      const timer = window.setTimeout(() => setPowerState("on"), 1300);
      return () => window.clearTimeout(timer);
    }

    if (powerState === "shutdown") {
      const timer = window.setTimeout(() => setPowerState("off"), 420);
      return () => window.clearTimeout(timer);
    }
  }, [powerState]);

  useEffect(() => {
    if (!targetFeedOpen) {
      setTypedTargetFeedMessage("");
      return;
    }

    const fullText = `${targetFeedMessage.title}\n\n${targetFeedMessage.body}`;
    let timeoutId = 0;
    let intervalId = 0;
    let cursor = 0;
    setTypedTargetFeedMessage("");

    timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        cursor = Math.min(cursor + 3, fullText.length);
        setTypedTargetFeedMessage(fullText.slice(0, cursor));
        if (cursor >= fullText.length) {
          window.clearInterval(intervalId);
        }
      }, 14);
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [targetFeedMessage, targetFeedOpen]);

  const powered = powerState === "on";

  function handlePowerToggle() {
    if (powerState === "booting" || powerState === "shutdown") {
      return;
    }

    if (powerState === "off") {
      setPowerState("booting");
      return;
    }

    setTargetingMode(false);
    setPendingTarget(null);
    setTargetFeedOpen(false);
    setPowerState("shutdown");
  }

  function handleTargetPlacementRequest(payload: { xPct: number; yPct: number; latitude: number; longitude: number }) {
    setTargetCursor({
      xPct: clamp(payload.xPct, 0, 100),
      yPct: clamp(payload.yPct, 0, 100)
    });
  }

  function commitTarget(payload: PendingTarget) {
    setTargets((current) => {
      const next = current.filter((entry) => entry.owner !== owner);
      next.push({
        id: `target-${owner}`,
        owner,
        xPct: payload.xPct,
        yPct: payload.yPct,
        latitude: payload.latitude,
        longitude: payload.longitude,
        updatedAt: Date.now()
      });
      return next;
    });
    setTargetFeedMessage((current) => pickHypeMessage(current));
    setTargetingMode(false);
    setPendingTarget(null);
    setTargetFeedOpen(true);
  }

  function handleClearOwnTarget() {
    setTargets((current) => current.filter((entry) => entry.owner !== owner));
    setTargetFeedOpen(false);
  }

  function handleToggleTargeting() {
    if (!powered) {
      return;
    }

    setTargetingMode((current) => {
      const next = !current;
      if (next) {
        const seed = ownTarget
          ? {
              xPct: ownTarget.xPct,
              yPct: ownTarget.yPct
            }
          : {
              xPct: 50,
              yPct: 54
            };
        setTargetCursor(seed);
      } else {
        setPendingTarget(null);
      }
      return next;
    });
  }

  function moveTargetCursor(direction: "up" | "down" | "left" | "right") {
    if (!powered || !targetingMode) {
      return;
    }

    setTargetCursor((current) => {
      const next = { ...current };
      if (direction === "up") {
        next.yPct = clamp(current.yPct - TARGET_STEP, 0, 100);
      }
      if (direction === "down") {
        next.yPct = clamp(current.yPct + TARGET_STEP, 0, 100);
      }
      if (direction === "left") {
        next.xPct = clamp(current.xPct - TARGET_STEP, 0, 100);
      }
      if (direction === "right") {
        next.xPct = clamp(current.xPct + TARGET_STEP, 0, 100);
      }
      return next;
    });
  }

  function handleOpenConfirmFromControls() {
    if (!powered || !targetingMode) {
      return;
    }
    const { latitude, longitude } = percentToLatLng(targetCursor.xPct, targetCursor.yPct);
    setPendingTarget({
      xPct: targetCursor.xPct,
      yPct: targetCursor.yPct,
      latitude,
      longitude
    });
  }

  function handleCancelPendingTarget() {
    setPendingTarget(null);
  }

  const ownTarget = useMemo(() => targets.find((entry) => entry.owner === owner) ?? null, [owner, targets]);
  const statusText = powered ? (targetingMode ? "TARGETING ARMED" : "LIVE FEED ONLINE") : "STANDBY";
  const sideMonitorActive = powered && targetFeedOpen;
  const sideMonitorMessage = typedTargetFeedMessage;

  function dispatchZoom(direction: "in" | "out") {
    if (!powered) {
      return;
    }
    setZoomCommand((current) => ({
      id: (current?.id ?? 0) + 1,
      direction
    }));
  }

  return (
    <div className={styles.scene}>
      <div className={styles.backgroundLayer} aria-hidden />
      <div className={styles.backgroundShade} aria-hidden />

      <div className={styles.overlayLayer}>
        <MapMonitorFrame
          powered={powered}
          statusText={statusText}
          sideMonitorActive={sideMonitorActive}
          sideMonitorMessage={sideMonitorMessage}
          onCloseSideMonitor={() => setTargetFeedOpen(false)}
          controls={
            <MapControlPanel
              powerState={powerState}
              targetingMode={targetingMode}
              hasOwnTarget={Boolean(ownTarget)}
              targetCount={targets.length}
              zoomPct={zoomPct}
              targetCursor={targetCursor}
              onTogglePower={handlePowerToggle}
              onToggleTargeting={handleToggleTargeting}
              onZoomIn={() => dispatchZoom("in")}
              onZoomOut={() => dispatchZoom("out")}
              onMoveTarget={moveTargetCursor}
              onConfirmTarget={handleOpenConfirmFromControls}
              onClearTarget={handleClearOwnTarget}
            />
          }
        >
          <CyberpunkTripMap
            trips={trips}
            powered={powered}
            targetingMode={powered && targetingMode}
            targetCursor={targetCursor}
            zoomCommand={zoomCommand}
            onZoomLevelChange={setZoomPct}
            onTargetingArmCenter={({ xPct, yPct }) => {
              setTargetCursor({
                xPct: clamp(xPct, 0, 100),
                yPct: clamp(yPct, 0, 100)
              });
            }}
            onTargetSelect={handleTargetPlacementRequest}
            voteTargets={targets.map((entry) => ({
              id: entry.id,
              xPct: entry.xPct,
              yPct: entry.yPct
            }))}
            showDiagnostics={false}
            className={styles.monitorMap}
          />
          <MapBootSequence state={powerState} />
        </MapMonitorFrame>

      </div>

      {pendingTarget ? (
        <div className={styles.targetModalBackdrop} role="presentation" onClick={handleCancelPendingTarget}>
          <section
            className={styles.targetModal}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm target destination"
            onClick={(event) => event.stopPropagation()}
          >
            <p className={styles.targetModalTitle}>TARGET CONFIRMATION</p>
            <p className={styles.targetModalCopy}>
              You are about to submit this target as your next desired Madness destination. This will contribute to the
              collective destination heat map.
            </p>
            <p className={styles.targetModalCoords}>
              lat {pendingTarget.latitude.toFixed(4)} | lng {pendingTarget.longitude.toFixed(4)}
            </p>
            <div className={styles.targetModalActions}>
              <button type="button" className={styles.targetModalPrimary} onClick={() => commitTarget(pendingTarget)}>
                CONFIRM TARGET
              </button>
              <button type="button" className={styles.targetModalSecondary} onClick={handleCancelPendingTarget}>
                CANCEL
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
