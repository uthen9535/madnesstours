"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";

type PriceSource = "live" | "fallback";
type AssetSymbol = "BTC" | "ETH";
type TrackerTheme = "orange" | "purple";

type BTCSatsChartProps = {
  initialPoints: Array<{ timestamp: string; usdPrice: number }>;
  initialSource: PriceSource;
  assetSymbol?: AssetSymbol;
  spotEndpoint?: string;
  theme?: TrackerTheme;
};

type PricePoint = {
  timestamp: string;
  usdPrice: number;
};

type SpotResponse = {
  usdPrice: number;
  source: PriceSource;
  updatedAt: string;
};

const POLL_INTERVAL_MS = 12000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_USD = 64000;
const CHART_WIDTH = 540;
const CHART_HEIGHT = 220;
const CHART_PADDING = {
  top: 16,
  right: 14,
  bottom: 26,
  left: 56
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatSignedUsd(value: number): string {
  const absolute = formatUsd(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${absolute}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}%`;
}

function formatAxisTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric"
  }).format(new Date(timestamp));
}

function normalizePoints(points: PricePoint[], referenceTime: number): PricePoint[] {
  const weekStart = referenceTime - WEEK_MS;
  const deduped = Array.from(
    new Map(
      points
        .filter((point) => Number.isFinite(point.usdPrice) && point.usdPrice > 0)
        .map((point) => [point.timestamp, point] as const)
    ).values()
  ).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const weekly = deduped.filter((point) => Date.parse(point.timestamp) >= weekStart);
  if (weekly.length > 0) {
    return weekly;
  }

  if (deduped.length === 0) {
    return [{ timestamp: new Date(referenceTime).toISOString(), usdPrice: FALLBACK_USD }];
  }

  return deduped.slice(-1);
}

export function BTCSatsChart({
  initialPoints,
  initialSource,
  assetSymbol = "BTC",
  spotEndpoint = "/api/btc/spot",
  theme = "orange"
}: BTCSatsChartProps) {
  const [points, setPoints] = useState<PricePoint[]>(() => normalizePoints(initialPoints, Date.now()));
  const [status, setStatus] = useState<PriceSource>(initialSource);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const pullLatest = async () => {
      try {
        const response = await fetch(spotEndpoint, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${assetSymbol} spot.`);
        }

        const payload = (await response.json()) as SpotResponse;
        if (!active || !Number.isFinite(payload.usdPrice) || payload.usdPrice <= 0) {
          return;
        }

        setStatus(payload.source);
        setPoints((previous) => {
          const next = normalizePoints(
            [...previous, { timestamp: payload.updatedAt, usdPrice: payload.usdPrice }],
            Date.now()
          );

          return next;
        });
      } catch {
        if (!active) {
          return;
        }
        setStatus("fallback");
      }
    };

    void pullLatest();
    const timer = setInterval(() => {
      void pullLatest();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [assetSymbol, spotEndpoint]);

  const chart = useMemo(() => {
    const values = points.map((point) => point.usdPrice);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const range = rawMax - rawMin;
    const padding = range > 0 ? range * 0.18 : Math.max(rawMax * 0.03, 1);
    const minValue = Math.max(rawMin - padding, 0);
    const maxValue = rawMax + padding;
    const usableWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const usableHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const denominator = Math.max(points.length - 1, 1);

    const xForIndex = (index: number): number => CHART_PADDING.left + (index / denominator) * usableWidth;
    const yForValue = (value: number): number => {
      const normalized = maxValue === minValue ? 0.5 : (value - minValue) / (maxValue - minValue);
      return CHART_PADDING.top + (1 - normalized) * usableHeight;
    };

    const pointGeometry = points.map((point, index) => ({
      ...point,
      x: xForIndex(index),
      y: yForValue(point.usdPrice)
    }));

    const polyline = pointGeometry
      .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");

    const currentIndex = pointGeometry.length - 1;
    const currentPoint = pointGeometry[currentIndex];
    const first = points[0];
    const latest = currentPoint;
    const delta = latest.usdPrice - first.usdPrice;
    const percent = first.usdPrice > 0 ? (delta / first.usdPrice) * 100 : 0;
    const weekUp = delta >= 0;

    return {
      minValue,
      maxValue,
      polyline,
      denominator,
      usableWidth,
      pointGeometry,
      currentPoint,
      currentXPercent: (currentPoint.x / CHART_WIDTH) * 100,
      currentYPercent: (currentPoint.y / CHART_HEIGHT) * 100,
      delta,
      percent,
      weekUp,
      latestPrice: latest.usdPrice
    };
  }, [points]);

  useEffect(() => {
    setHoverIndex((previous) => {
      if (previous === null) {
        return previous;
      }
      return Math.min(previous, chart.pointGeometry.length - 1);
    });
  }, [chart.pointGeometry.length]);

  const activePoint = hoverIndex !== null ? chart.pointGeometry[hoverIndex] : chart.currentPoint;
  const activePointXPercent = (activePoint.x / CHART_WIDTH) * 100;
  const activePointYPercent = (activePoint.y / CHART_HEIGHT) * 100;
  const tooltipToLeft = activePoint.x > CHART_WIDTH * 0.66;

  const handlePointerAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const xPx = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
    const rawIndex = ((xPx - CHART_PADDING.left) / chart.usableWidth) * chart.denominator;
    const nextIndex = Math.max(0, Math.min(chart.pointGeometry.length - 1, Math.round(rawIndex)));
    setHoverIndex(nextIndex);
  };

  return (
    <div className={`btc-chart btc-chart--${theme}`}>
      <div className="btc-chart__header">
        <span className="tag">{assetSymbol} 1W live</span>
        <span className="meta">{status === "fallback" ? "offline fallback" : "feed online"}</span>
      </div>

      <div className="btc-chart__plot">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="btc-chart__svg"
          aria-label={`${assetSymbol} 1 week chart`}
          onPointerMove={handlePointerAt}
          onPointerDown={handlePointerAt}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <g className="btc-chart__grid">
            {Array.from({ length: 5 }).map((_, index) => {
              const y =
                CHART_PADDING.top + ((CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom) / 4) * index;
              return (
                <line
                  key={`grid-${index}`}
                  x1={CHART_PADDING.left}
                  y1={y}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y2={y}
                />
              );
            })}
          </g>
          <polyline
            points={chart.polyline}
            className={chart.weekUp ? "btc-chart__line" : "btc-chart__line btc-chart__line--down"}
          />
          {hoverIndex !== null ? (
            <>
              <line
                x1={activePoint.x}
                y1={CHART_PADDING.top}
                x2={activePoint.x}
                y2={CHART_HEIGHT - CHART_PADDING.bottom}
                className="btc-chart__hover-line"
              />
              <circle cx={activePoint.x} cy={activePoint.y} r={3.4} className="btc-chart__hover-dot" />
            </>
          ) : null}
        </svg>

        <span
          className={`retro-map-pin ${
            chart.weekUp ? "retro-map-pin--mission-objective" : "retro-map-pin--mission-complete"
          } btc-chart__current-marker`}
          style={{ left: `${activePointXPercent}%`, top: `${activePointYPercent}%` }}
          aria-hidden="true"
        />
        {hoverIndex !== null ? (
          <div
            className="btc-chart__hover-readout"
            style={{
              left: `${activePointXPercent}%`,
              top: `${activePointYPercent}%`,
              transform: tooltipToLeft ? "translate(calc(-100% - 12px), -50%)" : "translate(12px, -50%)"
            }}
          >
            <p>{formatUsd(activePoint.usdPrice)}</p>
            <p className="meta">{formatAxisTime(activePoint.timestamp)}</p>
          </div>
        ) : null}
      </div>

      <div className="btc-chart__stats">
        <div>
          <p className="meta">Now</p>
          <p>{formatUsd(chart.latestPrice)} / {assetSymbol}</p>
        </div>
        <div>
          <p className="meta">{chart.weekUp ? "1W increase" : "1W decrease"}</p>
          <p>
            {formatSignedUsd(chart.delta)} ({formatSignedPercent(chart.percent)})
          </p>
        </div>
      </div>
      <p className="meta">
        Hover the line for point-in-time pricing. Default range is 1 week.
      </p>
    </div>
  );
}
