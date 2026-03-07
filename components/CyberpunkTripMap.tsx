"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import worldMapData from "@/data/world-map.json";

export type TripPin = {
  id: string;
  slug: string;
  title: string;
  location: string;
  mapX: number;
  mapY: number;
  latitude: number | null;
  longitude: number | null;
  missionStatus: "MISSION_COMPLETE" | "MISSION_OBJECTIVE";
};

type ResolvedTripPin = TripPin & {
  resolvedLatitude: number;
  resolvedLongitude: number;
  resolvedX: number;
  resolvedY: number;
  usingLegacyPosition: boolean;
};

type CyberpunkTripMapProps = {
  trips: TripPin[];
  powered?: boolean;
  targetingMode?: boolean;
  targetCursor?: {
    xPct: number;
    yPct: number;
  };
  zoomCommand?: {
    id: number;
    direction: "in" | "out";
  } | null;
  onZoomLevelChange?: (zoomPct: number) => void;
  onTargetSelect?: (payload: { xPct: number; yPct: number; latitude: number; longitude: number }) => void;
  onTargetingArmCenter?: (payload: { xPct: number; yPct: number }) => void;
  voteTargets?: Array<{
    id: string;
    xPct: number;
    yPct: number;
  }>;
  className?: string;
  showDiagnostics?: boolean;
};
type ZoomAnchor = {
  x: number;
  y: number;
};
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

type GeoPoint = [number, number];
type GeoPolygon = GeoPoint[][];
type GeoMultiPolygon = GeoPoint[][][];
type WorldFeatureCollection = {
  features: Array<{
    geometry:
      | {
          type: "Polygon";
          coordinates: GeoPolygon;
        }
      | {
          type: "MultiPolygon";
          coordinates: GeoMultiPolygon;
        }
      | null;
  }>;
};

type WorldPaths = {
  land: string[];
  country: string[];
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 416;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.8;
const ZOOM_STEP = 0.35;
const DATELINE_THRESHOLD = MAP_WIDTH / 2;
const INITIAL_ZOOM = 1;
const BASE_HORIZONTAL_SPAN = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function projectToMap(point: GeoPoint): [number, number] {
  const [longitude, latitude] = point;
  const x = ((longitude + 180) / 360) * MAP_WIDTH;
  const y = ((90 - latitude) / 180) * MAP_HEIGHT;
  return [clamp(x, 0, MAP_WIDTH), clamp(y, 0, MAP_HEIGHT)];
}

function pointsToPath(points: Array<[number, number]>): string {
  if (points.length === 0) {
    return "";
  }

  const [firstX, firstY] = points[0];
  let path = `M${firstX.toFixed(2)} ${firstY.toFixed(2)}`;

  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = points[index];
    path += ` L${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return `${path} Z`;
}

function ringToPaths(ring: GeoPoint[]): string[] {
  if (ring.length < 3) {
    return [];
  }

  const projected = ring.map(projectToMap);
  const segments: Array<Array<[number, number]>> = [];
  let currentSegment: Array<[number, number]> = [projected[0]];

  for (let index = 1; index < projected.length; index += 1) {
    const [x, y] = projected[index];
    const [prevX] = projected[index - 1];

    if (Math.abs(x - prevX) > DATELINE_THRESHOLD) {
      if (currentSegment.length >= 3) {
        segments.push(currentSegment);
      }
      currentSegment = [[x, y]];
      continue;
    }

    currentSegment.push([x, y]);
  }

  if (currentSegment.length >= 3) {
    segments.push(currentSegment);
  }

  return segments.map(pointsToPath);
}

function buildWorldPaths(): WorldPaths {
  const parsed = worldMapData as unknown as WorldFeatureCollection;
  const land: string[] = [];
  const country: string[] = [];

  for (const feature of parsed.features) {
    const geometry = feature.geometry;
    if (!geometry) {
      continue;
    }

    if (geometry.type === "Polygon") {
      const [outerRing, ...innerRings] = geometry.coordinates;
      if (outerRing) {
        land.push(...ringToPaths(outerRing));
      }
      country.push(...ringToPaths(outerRing ?? []));
      for (const ring of innerRings) {
        country.push(...ringToPaths(ring));
      }
      continue;
    }

    for (const polygon of geometry.coordinates) {
      const [outerRing, ...innerRings] = polygon;
      if (outerRing) {
        land.push(...ringToPaths(outerRing));
      }
      country.push(...ringToPaths(outerRing ?? []));
      for (const ring of innerRings) {
        country.push(...ringToPaths(ring));
      }
    }
  }

  return { land, country };
}

const WORLD_PATHS = buildWorldPaths();

function resolvePin(pin: TripPin): ResolvedTripPin {
  if (pin.latitude !== null && pin.longitude !== null) {
    const resolvedLatitude = clamp(pin.latitude, -85, 85);
    const resolvedLongitude = clamp(pin.longitude, -180, 180);
    return {
      ...pin,
      resolvedLatitude,
      resolvedLongitude,
      resolvedX: clamp(((resolvedLongitude + 180) / 360) * 100, 0, 100),
      resolvedY: clamp(((90 - resolvedLatitude) / 180) * 100, 0, 100),
      usingLegacyPosition: false
    };
  }

  const resolvedX = clamp(pin.mapX, 0, 100);
  const resolvedY = clamp(pin.mapY, 0, 100);
  return {
    ...pin,
    resolvedLatitude: clamp(85 - (resolvedY / 100) * 170, -85, 85),
    resolvedLongitude: clamp((resolvedX / 100) * 360 - 180, -180, 180),
    resolvedX,
    resolvedY,
    usingLegacyPosition: true
  };
}

function percentToLatLng(xPct: number, yPct: number): { latitude: number; longitude: number } {
  const latitude = clamp(90 - (yPct / 100) * 180, -85, 85);
  const longitude = clamp((xPct / 100) * 360 - 180, -180, 180);
  return { latitude, longitude };
}

export function CyberpunkTripMap({
  trips,
  powered = true,
  targetingMode = false,
  targetCursor,
  zoomCommand = null,
  onZoomLevelChange,
  onTargetSelect,
  onTargetingArmCenter,
  voteTargets = [],
  className,
  showDiagnostics = true
}: CyberpunkTripMapProps) {
  const router = useRouter();
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const zoomRef = useRef(INITIAL_ZOOM);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const lastZoomCommandIdRef = useRef<number | null>(null);
  const hasCenteredInitialViewRef = useRef(false);
  const wasTargetingModeRef = useRef(false);
  const resolvedPins = useMemo(() => trips.map(resolvePin), [trips]);
  const resolvedVoteTargets = useMemo(() => {
    return voteTargets.map((target) => {
      const nearbyCount = voteTargets.reduce((count, other) => {
        const dx = target.xPct - other.xPct;
        const dy = target.yPct - other.yPct;
        return count + (Math.hypot(dx, dy) <= 9 ? 1 : 0);
      }, 0);
      return {
        ...target,
        intensity: clamp(nearbyCount, 1, 6)
      };
    });
  }, [voteTargets]);

  const applyZoom = useCallback((nextZoom: number, anchor?: ZoomAnchor) => {
    if (!powered) {
      return;
    }

    const currentZoom = zoomRef.current;
    const clampedZoom = clamp(Number(nextZoom.toFixed(2)), ZOOM_MIN, ZOOM_MAX);
    if (clampedZoom === currentZoom) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      return;
    }

    const anchorX = clamp(anchor?.x ?? canvas.clientWidth / 2, 0, canvas.clientWidth);
    const anchorY = clamp(anchor?.y ?? canvas.clientHeight / 2, 0, canvas.clientHeight);
    const startLeft = canvas.scrollLeft;
    const startTop = canvas.scrollTop;
    const zoomRatio = clampedZoom / currentZoom;

    zoomRef.current = clampedZoom;
    setZoom(clampedZoom);

    requestAnimationFrame(() => {
      const nextCanvas = canvasRef.current;
      if (!nextCanvas) {
        return;
      }

      const maxLeft = Math.max(nextCanvas.scrollWidth - nextCanvas.clientWidth, 0);
      const maxTop = Math.max(nextCanvas.scrollHeight - nextCanvas.clientHeight, 0);
      const nextTargetX = anchor ? (startLeft + anchorX) * zoomRatio - anchorX : maxLeft / 2;
      const nextTargetY = anchor ? (startTop + anchorY) * zoomRatio - anchorY : 0;

      nextCanvas.scrollLeft = clamp(nextTargetX, 0, maxLeft);
      nextCanvas.scrollTop = clamp(nextTargetY, 0, maxTop);
    });
  }, [powered]);

  function stopDragging(pointerId: number, canvas: HTMLDivElement) {
    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!powered || targetingMode) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest("button")) {
      return;
    }

    const canvas = event.currentTarget;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: canvas.scrollLeft,
      startScrollTop: canvas.scrollTop
    };
    canvas.setPointerCapture(event.pointerId);
    setIsDragging(true);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!powered || targetingMode) {
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const canvas = event.currentTarget;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const maxLeft = Math.max(canvas.scrollWidth - canvas.clientWidth, 0);
    const maxTop = Math.max(canvas.scrollHeight - canvas.clientHeight, 0);
    canvas.scrollLeft = clamp(dragState.startScrollLeft - deltaX, 0, maxLeft);
    canvas.scrollTop = clamp(dragState.startScrollTop - deltaY, 0, maxTop);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!powered || targetingMode) {
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    stopDragging(event.pointerId, event.currentTarget);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (!powered || targetingMode) {
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    stopDragging(event.pointerId, event.currentTarget);
  }

  function handleLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
    if (!powered || targetingMode) {
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handleTargetingClick(event: PointerEvent<HTMLButtonElement>) {
    if (!powered || !targetingMode || !onTargetSelect) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const xPct = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const yPct = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    const { latitude, longitude } = percentToLatLng(xPct, yPct);
    onTargetSelect({ xPct, yPct, latitude, longitude });
  }

  useEffect(() => {
    const range = ZOOM_MAX - ZOOM_MIN;
    const normalized = range > 0 ? ((zoom - ZOOM_MIN) / range) * 100 : 0;
    onZoomLevelChange?.(Math.round(clamp(normalized, 0, 100)));
  }, [onZoomLevelChange, zoom]);

  useEffect(() => {
    if (!zoomCommand || lastZoomCommandIdRef.current === zoomCommand.id) {
      return;
    }

    lastZoomCommandIdRef.current = zoomCommand.id;
    const canvas = canvasRef.current;
    const zoomAnchor = canvas
      ? {
          x: canvas.clientWidth / 2,
          y: canvas.clientHeight / 2
        }
      : undefined;
    if (zoomCommand.direction === "in") {
      applyZoom(zoomRef.current + ZOOM_STEP, zoomAnchor);
    } else {
      applyZoom(zoomRef.current - ZOOM_STEP, zoomAnchor);
    }
  }, [applyZoom, zoomCommand]);

  useEffect(() => {
    if (hasCenteredInitialViewRef.current || !powered) {
      return;
    }

    let frame = 0;
    let attempts = 0;

    const tryCenter = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const maxLeft = Math.max(canvas.scrollWidth - canvas.clientWidth, 0);
      if (maxLeft >= 0) {
        canvas.scrollLeft = 0;
        canvas.scrollTop = 0;
        hasCenteredInitialViewRef.current = true;
        return;
      }

      if (attempts < 8) {
        attempts += 1;
        frame = window.requestAnimationFrame(tryCenter);
      }
    };

    frame = window.requestAnimationFrame(tryCenter);
    return () => window.cancelAnimationFrame(frame);
  }, [powered, zoom]);

  useEffect(() => {
    const justArmed = targetingMode && !wasTargetingModeRef.current;
    wasTargetingModeRef.current = targetingMode;

    if (!justArmed || !onTargetingArmCenter) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const viewportCenterX = canvas.scrollLeft + canvas.clientWidth / 2;
    const viewportCenterY = canvas.scrollTop + canvas.clientHeight / 2;
    const xPct = clamp((viewportCenterX / Math.max(canvas.scrollWidth, 1)) * 100, 0, 100);
    const yPct = clamp((viewportCenterY / Math.max(canvas.scrollHeight, 1)) * 100, 0, 100);
    onTargetingArmCenter({ xPct, yPct });
  }, [onTargetingArmCenter, targetingMode]);

  return (
    <div className={clsx("google-map-shell", className, !powered && "google-map-shell--offline")}>
      <div
        ref={canvasRef}
        className={`google-map-canvas retro-map-canvas${isDragging ? " retro-map-canvas--dragging" : ""}${
          targetingMode ? " retro-map-canvas--targeting" : ""
        }`}
        role="application"
        aria-label="Tour destination world map"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <div
          ref={stageRef}
          className="retro-map-stage"
          style={{ width: `calc(${(100 * BASE_HORIZONTAL_SPAN * zoom).toFixed(3)}% + 2px)` }}
        >
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="retro-map-svg" aria-hidden="true">
            <defs>
              <linearGradient id="retro-map-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#071528" />
                <stop offset="65%" stopColor="#04192a" />
                <stop offset="100%" stopColor="#080f1f" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#retro-map-bg)" />
            <g className="retro-map-grid-lines">
              {Array.from({ length: 13 }).map((_, index) => (
                <line key={`h-${index}`} x1="0" y1={index * (MAP_HEIGHT / 12)} x2={MAP_WIDTH} y2={index * (MAP_HEIGHT / 12)} />
              ))}
              {Array.from({ length: 21 }).map((_, index) => (
                <line key={`v-${index}`} x1={index * 50} y1="0" x2={index * 50} y2={MAP_HEIGHT} />
              ))}
            </g>

            <g className="retro-map-land">
              {WORLD_PATHS.land.map((path, index) => (
                <path key={`land-${index}`} d={path} />
              ))}
            </g>

            <g className="retro-map-country-lines">
              {WORLD_PATHS.country.map((path, index) => (
                <path key={`country-${index}`} d={path} />
              ))}
            </g>
          </svg>
          <div className="retro-map-overlay retro-map-overlay--scanlines" />
          <div className="retro-map-overlay retro-map-overlay--glow" />
          {resolvedVoteTargets.length > 0 ? (
            <div className="retro-map-vote-layer" aria-hidden>
              {resolvedVoteTargets.map((target) => (
                <div
                  key={target.id}
                  className="retro-map-vote-node"
                  style={
                    {
                      left: `${target.xPct}%`,
                      top: `${target.yPct}%`,
                      "--vote-intensity": target.intensity
                    } as CSSProperties
                  }
                >
                  <span className="retro-map-vote-node__ring retro-map-vote-node__ring--a" />
                  <span className="retro-map-vote-node__ring retro-map-vote-node__ring--b" />
                  <span className="retro-map-vote-node__core" />
                </div>
              ))}
            </div>
          ) : null}
          {powered && targetingMode ? (
            <button
              type="button"
              className="retro-map-target-overlay"
              aria-label="Select next target destination on map"
              onPointerDown={handleTargetingClick}
            >
              <span
                className="retro-map-target-overlay__crosshair"
                style={{
                  left: `${targetCursor?.xPct ?? 50}%`,
                  top: `${targetCursor?.yPct ?? 50}%`
                }}
              >
                <span className="retro-map-target-overlay__line retro-map-target-overlay__line--v" />
                <span className="retro-map-target-overlay__line retro-map-target-overlay__line--h" />
                <span className="retro-map-target-overlay__ring" />
              </span>
            </button>
          ) : null}

          {resolvedPins.map((pin) => {
            const objective = pin.missionStatus === "MISSION_OBJECTIVE";
            return (
              <button
                key={pin.id}
                type="button"
                className={`retro-map-pin ${
                  objective ? "retro-map-pin--mission-objective" : "retro-map-pin--mission-complete"
                }`}
                style={{ left: `${pin.resolvedX}%`, top: `${pin.resolvedY}%` }}
                title={`${pin.title} (${pin.location}) :: ${objective ? "Mission objective" : "Mission complete"}`}
                disabled={!powered || targetingMode}
                onClick={() => router.push(`/tours/${pin.slug}`)}
              >
                <span className="retro-map-pin__label">{pin.title}</span>
              </button>
            );
          })}
        </div>
      </div>
      <span className="tag retro-map-zoom-level">{Math.round(clamp(((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100, 0, 100))}%</span>

      {showDiagnostics ? (
        <>
          <p className="meta">Hover and scroll to zoom toward the cursor. Click and drag to pan the map.</p>
          <div className="google-map-legend">
            <span className="google-map-legend__item">
              <span className="google-map-legend__dot google-map-legend__dot--mission-complete" /> mission complete
            </span>
            <span className="google-map-legend__item">
              <span className="google-map-legend__dot google-map-legend__dot--mission-objective" /> mission objective
            </span>
          </div>
          <div className="google-map-coordinates">
            {resolvedPins.map((pin) => (
              <p key={pin.id}>
                {pin.title} :: {pin.resolvedLatitude.toFixed(4)}, {pin.resolvedLongitude.toFixed(4)}
                {" :: "}
                {pin.missionStatus === "MISSION_OBJECTIVE" ? "mission objective" : "mission complete"}
                {pin.usingLegacyPosition ? " (legacy % converted)" : ""}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
