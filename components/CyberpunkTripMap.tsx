"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import worldMapData from "@/data/world-map.json";

type TripPin = {
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
const MAP_HEIGHT = 520;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.8;
const ZOOM_STEP = 0.2;
const DATELINE_THRESHOLD = MAP_WIDTH / 2;

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

export function CyberpunkTripMap({ trips }: CyberpunkTripMapProps) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const zoomRef = useRef(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const resolvedPins = useMemo(() => trips.map(resolvePin), [trips]);

  function applyZoom(nextZoom: number, anchor?: ZoomAnchor) {
    const clampedZoom = clamp(Number(nextZoom.toFixed(2)), ZOOM_MIN, ZOOM_MAX);
    if (clampedZoom === zoomRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      return;
    }

    const stage = stageRef.current;
    const anchorX = clamp(anchor?.x ?? canvas.clientWidth / 2, 0, canvas.clientWidth);
    const anchorY = clamp(anchor?.y ?? canvas.clientHeight / 2, 0, canvas.clientHeight);
    const stageWidth = Math.max(stage?.clientWidth ?? 1, 1);
    const stageHeight = Math.max(stage?.clientHeight ?? 1, 1);
    const pointX = canvas.scrollLeft + anchorX - (stage?.offsetLeft ?? 0);
    const pointY = canvas.scrollTop + anchorY - (stage?.offsetTop ?? 0);
    const relativeX = clamp(pointX / stageWidth, 0, 1);
    const relativeY = clamp(pointY / stageHeight, 0, 1);

    zoomRef.current = clampedZoom;
    setZoom(clampedZoom);

    requestAnimationFrame(() => {
      const nextCanvas = canvasRef.current;
      const nextStage = stageRef.current;
      if (!nextCanvas || !nextStage) {
        return;
      }

      const nextTargetX = nextStage.offsetLeft + relativeX * nextStage.clientWidth - anchorX;
      const nextTargetY = nextStage.offsetTop + relativeY * nextStage.clientHeight - anchorY;
      const maxLeft = Math.max(nextCanvas.scrollWidth - nextCanvas.clientWidth, 0);
      const maxTop = Math.max(nextCanvas.scrollHeight - nextCanvas.clientHeight, 0);

      nextCanvas.scrollLeft = clamp(nextTargetX, 0, maxLeft);
      nextCanvas.scrollTop = clamp(nextTargetY, 0, maxTop);
    });
  }

  function stopDragging(pointerId: number, canvas: HTMLDivElement) {
    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
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
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const canvas = event.currentTarget;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    canvas.scrollLeft = dragState.startScrollLeft - deltaX;
    canvas.scrollTop = dragState.startScrollTop - deltaY;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    stopDragging(event.pointerId, event.currentTarget);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    stopDragging(event.pointerId, event.currentTarget);
  }

  function handleLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: event.clientX - rect.left - event.currentTarget.clientLeft,
      y: event.clientY - rect.top - event.currentTarget.clientTop
    };
    const zoomFactor = Math.exp(-event.deltaY * 0.0018);
    applyZoom(zoomRef.current * zoomFactor, anchor);
  }

  return (
    <div className="google-map-shell">
      <div
        ref={canvasRef}
        className={`google-map-canvas retro-map-canvas${isDragging ? " retro-map-canvas--dragging" : ""}`}
        role="application"
        aria-label="Trip destination world map"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <div ref={stageRef} className="retro-map-stage" style={{ width: `${(100 * zoom).toFixed(2)}%` }}>
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
                <line key={`h-${index}`} x1="0" y1={index * 43.333} x2={MAP_WIDTH} y2={index * 43.333} />
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
                onClick={() => router.push(`/trips/${pin.slug}`)}
              >
                <span className="retro-map-pin__label">{pin.title}</span>
              </button>
            );
          })}
        </div>
        <div className="retro-map-zoom-overlay" aria-label="Map zoom controls">
          <button
            type="button"
            className="neon-button retro-map-zoom"
            onClick={() => applyZoom(zoomRef.current + ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in map"
          >
            +
          </button>
          <button
            type="button"
            className="neon-button retro-map-zoom"
            onClick={() => applyZoom(zoomRef.current - ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out map"
          >
            -
          </button>
        </div>
        <span className="tag retro-map-zoom-level">{Math.round(zoom * 100)}%</span>
      </div>

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
    </div>
  );
}
