"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BTCSatsChart } from "@/components/BTCSatsChart";
import { EnergyInfoModal, type EnergyWidgetId } from "@/components/EnergyInfoModal";
import { InfoButton } from "@/components/InfoButton";
import { RetroWindow } from "@/components/RetroWindow";

type PricePoint = {
  timestamp: string;
  usdPrice: number;
};

type ChartsTab = "energy" | "currency" | "stats";

type KpFeed = {
  source: "live" | "fallback";
  lastUpdated: string;
  feedUpdatedAt: string | null;
  currentKp: number;
  daily: Array<{ date: string; day: number; maxKp: number | null; stormLabel: string | null }>;
  trend: Array<{ timestamp: string; dayFraction: number; kp: number; rolling3h: number }>;
};

type SchumannFeed = {
  source: "live" | "fallback";
  lastUpdated: string;
  feedUpdatedAt: string | null;
  currentPower: number;
  monthlyIntensity: Array<{ date: string; day: number; avgPower: number | null }>;
  waveform: number[];
  spikeDetected: boolean;
};

type TecFeed = {
  source: "live" | "fallback";
  lastUpdated: string;
  feedUpdatedAt: string | null;
  currentTec: number;
  monthlyDailyAvg: Array<{ date: string; day: number; avgTec: number | null }>;
  recentSixHours: Array<{ timestamp: string; tec: number }>;
};

type HomeChartsColumnProps = {
  btcInitial: {
    points: PricePoint[];
    source: "live" | "fallback";
  };
  ethInitial: {
    points: PricePoint[];
    source: "live" | "fallback";
  };
  stats: {
    totalMembers: number;
    totalTours: number;
    shotOClockEvents: number;
  };
};

type FeedState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function formatTimestamp(ts: string | null) {
  if (!ts) {
    return "n/a";
  }
  const asDate = new Date(ts);
  if (Number.isNaN(asDate.getTime())) {
    return "n/a";
  }
  return asDate.toLocaleString();
}

function usePolledFeed<T>(url: string, intervalMs: number) {
  const [state, setState] = useState<FeedState<T>>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    let active = true;

    const pull = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Feed error: ${response.status}`);
        }
        const payload = (await response.json()) as T;
        if (!active) {
          return;
        }
        setState({
          data: payload,
          loading: false,
          error: null
        });
      } catch (error) {
        if (!active) {
          return;
        }
        setState((previous) => ({
          data: previous.data,
          loading: false,
          error: error instanceof Error ? error.message : "feed unavailable"
        }));
      }
    };

    void pull();
    const timer = window.setInterval(() => {
      void pull();
    }, intervalMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intervalMs, url]);

  return state;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setPrefersReducedMotion(media.matches);
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return prefersReducedMotion;
}

type GeomagStatus = "quiet" | "unsettled" | "storm" | "severe";

function getGeomagStatus(kp: number): {
  id: GeomagStatus;
  label: string;
  stormWatch: string;
} {
  if (kp >= 7) {
    return {
      id: "severe",
      label: "SEVERE",
      stormWatch: "severe storm conditions"
    };
  }
  if (kp >= 5) {
    return {
      id: "storm",
      label: "STORM",
      stormWatch: "storm conditions"
    };
  }
  if (kp >= 4) {
    return {
      id: "unsettled",
      label: "UNSETTLED",
      stormWatch: "elevated / unsettled"
    };
  }
  return {
    id: "quiet",
    label: "QUIET",
    stormWatch: "background stable"
  };
}

function kpToAngle(kp: number) {
  return -130 + (Math.max(0, Math.min(9, kp)) / 9) * 260;
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + Math.cos(radians) * radius,
    y: cy + Math.sin(radians) * radius
  };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function KpGauge({
  currentKp,
  isSimulating,
  reducedMotion
}: {
  currentKp: number;
  isSimulating: boolean;
  reducedMotion: boolean;
}) {
  const clampKp = (value: number) => Math.max(0, Math.min(9, value));
  const [animatedKp, setAnimatedKp] = useState(() => clampKp(currentKp));
  const animatedRef = useRef(animatedKp);
  const [jitterTick, setJitterTick] = useState(0);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [settled, setSettled] = useState(true);
  const [pulseBand, setPulseBand] = useState<GeomagStatus | null>(null);
  const [bloom, setBloom] = useState(false);
  const previousKpRef = useRef(currentKp);
  const pulseTimerRef = useRef<number | null>(null);
  const bloomTimerRef = useRef<number | null>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    animatedRef.current = animatedKp;
  }, [animatedKp]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
      if (bloomTimerRef.current !== null) {
        window.clearTimeout(bloomTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const target = clampKp(currentKp);
    if (reducedMotion) {
      setAnimatedKp(target);
      animatedRef.current = target;
      setSettled(true);
      return;
    }
    setSettled(false);
    let frame = 0;
    let position = animatedRef.current;
    let velocity = 0;
    let lastTs = performance.now();
    const startTs = lastTs;
    const minDuration = 620;
    const maxDuration = 920;
    const stiffness = 0.028;
    const damping = 0.84;

    const tick = (timestamp: number) => {
      const delta = Math.min(32, timestamp - lastTs || 16.67);
      const step = delta / 16.67;
      const displacement = target - position;

      velocity += displacement * stiffness * step;
      velocity *= damping ** step;
      position += velocity * step;

      animatedRef.current = position;
      setAnimatedKp(position);

      const elapsed = timestamp - startTs;
      const closeEnough = Math.abs(target - position) < 0.01 && Math.abs(velocity) < 0.01;

      if ((elapsed > minDuration && closeEnough) || elapsed >= maxDuration) {
        animatedRef.current = target;
        setAnimatedKp(target);
        setSettled(true);
        return;
      }

      lastTs = timestamp;
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      setSettled(true);
    };
  }, [currentKp, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      setJitterTick((value) => value + 1);
    }, 120);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || !settled) {
      setGlitchOffset(0);
      return;
    }

    const timer = window.setInterval(() => {
      const roll = Math.random();
      if (roll > 0.74) {
        setGlitchOffset((Math.random() * 2 - 1) * 0.48);
      } else {
        setGlitchOffset((value) => value * 0.3);
      }
    }, 130);

    return () => window.clearInterval(timer);
  }, [reducedMotion, settled]);

  useEffect(() => {
    const previous = previousKpRef.current;
    previousKpRef.current = currentKp;

    if (!bootedRef.current) {
      bootedRef.current = true;
      return;
    }

    const thresholds: Array<{ value: number; band: GeomagStatus }> = [
      { value: 4, band: "unsettled" },
      { value: 5, band: "storm" },
      { value: 7, band: "severe" }
    ];

    const crossed = thresholds.find((threshold) => previous < threshold.value && currentKp >= threshold.value);
    if (!crossed) {
      return;
    }

    setPulseBand(crossed.band);
    setBloom(true);
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
    }
    if (bloomTimerRef.current !== null) {
      window.clearTimeout(bloomTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setPulseBand(null);
      pulseTimerRef.current = null;
    }, 320);
    bloomTimerRef.current = window.setTimeout(() => {
      setBloom(false);
      bloomTimerRef.current = null;
    }, 260);
  }, [currentKp]);

  const jitter =
    reducedMotion || !settled
      ? 0
      : Math.sin(jitterTick * 0.52) * 0.08 + Math.cos(jitterTick * 0.23) * 0.05 + glitchOffset;
  const displayedKp = clampKp(animatedKp + jitter);
  const status = getGeomagStatus(displayedKp);
  const angle = kpToAngle(displayedKp);
  const cx = 110;
  const cy = 122;
  const outerRadius = 82;
  const needleRadius = 66;
  const x2 = cx + Math.cos((angle * Math.PI) / 180) * needleRadius;
  const y2 = cy + Math.sin((angle * Math.PI) / 180) * needleRadius;

  const bandSegments = [
    { id: "quiet", from: 0, to: 4 },
    { id: "unsettled", from: 4, to: 5 },
    { id: "storm", from: 5, to: 7 },
    { id: "severe", from: 7, to: 9 }
  ] as const;

  const getBandIntensity = (from: number, to: number) => {
    if (displayedKp <= from) {
      return 0;
    }
    if (displayedKp >= to) {
      return 1;
    }
    return (displayedKp - from) / (to - from);
  };

  return (
    <div
      className={`energy-gauge ${isSimulating ? "is-simulating" : ""} ${reducedMotion ? "is-reduced-motion" : ""} ${bloom ? "is-blooming" : ""}`}
    >
      <div className="energy-gauge__hud" aria-hidden>
        <span className="energy-gauge__scan" />
        <span className="energy-gauge__noise" />
      </div>

      <svg viewBox="0 0 220 170" role="img" aria-label="Current Kp storm gauge">
        {Array.from({ length: 10 }).map((_, index) => {
          const x = 24 + index * 19;
          return <line key={`grid-v-${index}`} x1={x} y1="48" x2={x} y2="146" className="energy-gauge__grid-line" />;
        })}
        {Array.from({ length: 7 }).map((_, index) => {
          const y = 48 + index * 16;
          return <line key={`grid-h-${index}`} x1="24" y1={y} x2="196" y2={y} className="energy-gauge__grid-line" />;
        })}

        <path d={arcPath(cx, cy, outerRadius, kpToAngle(0), kpToAngle(9))} className="energy-gauge__arc-outer" />

        {bandSegments.map((segment) => (
          <path
            key={segment.id}
            d={arcPath(cx, cy, 70, kpToAngle(segment.from), kpToAngle(segment.to))}
            className={`energy-gauge__storm-band energy-gauge__storm-band--${segment.id} ${pulseBand === segment.id ? "is-pulsing" : ""}`}
            style={{ "--band-intensity": String(getBandIntensity(segment.from, segment.to)) } as CSSProperties}
          />
        ))}

        {Array.from({ length: 10 }).map((_, tickValue) => {
          const tickAngle = kpToAngle(tickValue);
          const isMajor = tickValue === 0 || tickValue === 3 || tickValue === 5 || tickValue === 7 || tickValue === 9;
          const start = polar(cx, cy, isMajor ? 74 : 77, tickAngle);
          const end = polar(cx, cy, 84, tickAngle);
          return (
            <line
              key={`tick-${tickValue}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={isMajor ? "energy-gauge__tick-line energy-gauge__tick-line--major" : "energy-gauge__tick-line"}
            />
          );
        })}

        {[0, 3, 5, 7, 9].map((label) => {
          const theta = kpToAngle(label);
          const labelPoint = polar(cx, cy, 94, theta);
          return (
            <text key={label} x={labelPoint.x} y={labelPoint.y} className="energy-gauge__tick">
              {label}
            </text>
          );
        })}

        <line x1={cx} y1={cy} x2={x2} y2={y2} className="energy-gauge__needle" />
        <circle cx={cx} cy={cy} r={5} className="energy-gauge__hub" />
      </svg>

      <div className="energy-gauge__storm-label">STORM LEVEL</div>
      <div className={`energy-gauge__storm-chip energy-gauge__storm-chip--${status.id}`}>{status.label}</div>
      <div className="energy-gauge__readout">
        KP: <strong>{displayedKp.toFixed(1)}</strong>
        {isSimulating ? <span className="energy-sim-indicator">SIM</span> : null}
      </div>
      <div className="energy-gauge__signal">geomag: {status.label.toLowerCase()}</div>
    </div>
  );
}

function KpIndexChart({
  onOpenInfo,
  reducedMotion
}: {
  onOpenInfo: (widgetId: EnergyWidgetId) => void;
  reducedMotion: boolean;
}) {
  const { data, loading, error } = usePolledFeed<KpFeed>("/api/energy/kp", 60_000);
  const [simulatedKp, setSimulatedKp] = useState<number | null>(null);
  const simTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (simTimerRef.current !== null) {
        window.clearTimeout(simTimerRef.current);
      }
    };
  }, []);

  const realKp = data?.currentKp ?? 0;
  const displayedKp = simulatedKp ?? realKp;
  const isSimulating = simulatedKp !== null;
  const status = getGeomagStatus(displayedKp);
  const latestStormFlag = useMemo(() => {
    const ordered = [...(data?.daily ?? [])].reverse();
    return ordered.find((entry) => entry.stormLabel)?.stormLabel ?? null;
  }, [data]);

  return (
    <RetroWindow title="Energy // Kp Storm Index" className="energy-window energy-window--kp">
      <div className={`energy-panel ${isSimulating ? "is-spiking" : ""}`}>
        <div className="energy-panel__head">
          <div className="energy-panel__title-row">
            <p className="energy-panel__title">NOAA SWPC live storm gauge :: refresh 60s</p>
            <InfoButton onClick={() => onOpenInfo("kp")} label="Open Kp storm index info" />
          </div>
          <p className="meta">
            source: {data?.source ?? "loading"} {"::"} updated: {formatTimestamp(data?.lastUpdated ?? null)}
          </p>
        </div>

        <div className="energy-kp-focus">
          <div className={`energy-kp-monitor ${reducedMotion ? "is-static" : ""}`} aria-label="Monitor activity strip">
            {Array.from({ length: 36 }).map((_, index) => (
              <span
                key={`kp-monitor-${index}`}
                style={
                  {
                    "--bar-delay": `${(index % 12) * 0.08}s`,
                    "--bar-duration": `${1.6 + (index % 5) * 0.28}s`
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className="energy-kp-side">
            <KpGauge currentKp={displayedKp} isSimulating={isSimulating} reducedMotion={reducedMotion} />
            <p className="meta">feed timestamp: {formatTimestamp(data?.feedUpdatedAt ?? null)}</p>
            <p className="meta">
              storm watch:{" "}
              <strong>
                {status.id === "storm" || status.id === "severe"
                  ? latestStormFlag ?? status.stormWatch
                  : status.stormWatch}
              </strong>
            </p>
            <button
              type="button"
              className="energy-dev-toggle"
              onClick={() => {
                const simulatedValue = Number((5 + Math.random() * 3).toFixed(2));
                setSimulatedKp(simulatedValue);
                if (simTimerRef.current !== null) {
                  window.clearTimeout(simTimerRef.current);
                }
                simTimerRef.current = window.setTimeout(() => {
                  setSimulatedKp(null);
                  simTimerRef.current = null;
                }, 6000);
              }}
            >
              Simulate spike
            </button>
          </div>
        </div>

        {loading ? <p className="meta">calibrating storm channels...</p> : null}
        {error ? <p className="meta">feed note: {error}</p> : null}
      </div>
    </RetroWindow>
  );
}

function SchumannChart({
  onOpenInfo,
  reducedMotion
}: {
  onOpenInfo: (widgetId: EnergyWidgetId) => void;
  reducedMotion: boolean;
}) {
  const { data, loading, error } = usePolledFeed<SchumannFeed>("/api/energy/schumann", 10 * 60_000);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);
  const [manualSpike, setManualSpike] = useState(false);

  useEffect(() => {
    let animationId = 0;
    let frame = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return false;
      }

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(320, Math.floor(rect.width));
      const height = 180;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return false;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#031923";
      ctx.fillRect(0, 0, width, height);

      const phase = reducedMotion ? 0 : phaseRef.current;
      ctx.strokeStyle = "rgba(73, 168, 196, 0.22)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 18) {
        const xShift = reducedMotion ? 0 : (phase * 4) % 18;
        ctx.beginPath();
        ctx.moveTo(x + xShift, 0);
        ctx.lineTo(x + xShift, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const wave = data?.waveform.length ? data.waveform : [0];
      const ampBoost = manualSpike || data?.spikeDetected ? 1.65 : 1;
      const xShift = reducedMotion ? 0 : (phase * 2.4) % width;

      ctx.beginPath();
      for (let i = 0; i < width; i += 1) {
        const idx = Math.floor(((i + xShift) / width) * wave.length) % wave.length;
        const sample = wave[idx] ?? 0;
        const visualNoise = reducedMotion ? 0 : Math.sin((i + phase * 3) * 0.08) * 0.5 + ((i + frame) % 47 === 0 ? 0.8 : 0);
        const y = height * 0.52 - sample * 48 * ampBoost + visualNoise;
        if (i === 0) {
          ctx.moveTo(i, y);
        } else {
          ctx.lineTo(i, y);
        }
      }
      ctx.strokeStyle = "rgba(120, 248, 244, 0.95)";
      ctx.shadowColor = "rgba(102, 255, 255, 0.72)";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
      for (let y = 0; y < height; y += 4) {
        ctx.fillRect(0, y, width, 1);
      }

      if (!reducedMotion) {
        const sweepX = (phaseRef.current * 3.2) % width;
        const sweep = ctx.createLinearGradient(sweepX - 110, 0, sweepX + 110, 0);
        sweep.addColorStop(0, "rgba(122, 255, 255, 0)");
        sweep.addColorStop(0.5, "rgba(122, 255, 255, 0.09)");
        sweep.addColorStop(1, "rgba(122, 255, 255, 0)");
        ctx.fillStyle = sweep;
        ctx.fillRect(0, 0, width, height);

        frame += 1;
        if (frame % 2 === 0) {
          phaseRef.current = (phaseRef.current + 1) % 100000;
        }
      }

      return true;
    };

    const tick = () => {
      const painted = draw();
      if (!painted || reducedMotion) {
        return;
      }
      animationId = window.requestAnimationFrame(tick);
    };

    tick();
    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [data, manualSpike, reducedMotion]);

  const maxIntensity = useMemo(() => {
    const values = data?.monthlyIntensity.map((point) => point.avgPower ?? 0) ?? [1];
    return Math.max(1, ...values);
  }, [data]);

  return (
    <RetroWindow title="Energy // Schumann Resonance" className="energy-window energy-window--schumann">
      <div className="energy-panel">
        <div className="energy-panel__head">
          <div className="energy-panel__title-row">
            <p className="energy-panel__title">HeartMath GCI resonance + oscilloscope {"::"} refresh 10 min</p>
            <InfoButton onClick={() => onOpenInfo("schumann")} label="Open Schumann resonance info" />
          </div>
          <p className="meta">
            source: {data?.source ?? "loading"} {"::"} updated: {formatTimestamp(data?.lastUpdated ?? null)}
          </p>
        </div>

        <div className={`energy-oscilloscope-shell ${reducedMotion ? "is-static" : ""}`}>
          <canvas ref={canvasRef} className={`energy-oscilloscope ${(manualSpike || data?.spikeDetected) ? "is-spiking" : ""}`} />
          <span className="energy-oscilloscope-sweep" aria-hidden />
        </div>

        <div className="energy-status-leds" aria-hidden>
          <span className="energy-status-led is-cyan" />
          <span className="energy-status-led is-amber" />
          <span className="energy-status-led is-cyan" />
        </div>

        <div className="energy-ribbon" aria-label="Monthly resonance intensity ribbon">
          {data?.monthlyIntensity.map((point) => {
            const intensity = point.avgPower === null ? 0.04 : Math.max(0.08, (point.avgPower / maxIntensity) * 0.95);
            return (
              <span
                key={point.date}
                style={{ opacity: intensity }}
              />
            );
          })}
        </div>

        <div className="energy-panel__foot">
          <p className="meta">
            live power: <strong>{(data?.currentPower ?? 0).toFixed(3)}</strong> {"::"} feed ts: {formatTimestamp(data?.feedUpdatedAt ?? null)}
          </p>
          <button
            type="button"
            className="energy-dev-toggle"
            onClick={() => {
              setManualSpike(true);
              window.setTimeout(() => setManualSpike(false), 2000);
            }}
          >
            Simulate spike
          </button>
        </div>

        {loading ? <p className="meta">synchronizing resonance channels...</p> : null}
        {error ? <p className="meta">feed note: {error}</p> : null}
      </div>
    </RetroWindow>
  );
}

function TecChart({
  onOpenInfo,
  reducedMotion
}: {
  onOpenInfo: (widgetId: EnergyWidgetId) => void;
  reducedMotion: boolean;
}) {
  const { data, loading, error } = usePolledFeed<TecFeed>("/api/energy/tec", 5 * 60_000);
  const [simulatedTec, setSimulatedTec] = useState<number | null>(null);
  const simTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (simTimerRef.current !== null) {
        window.clearTimeout(simTimerRef.current);
      }
    };
  }, []);

  const effectiveMonthlyDailyAvg = useMemo(() => {
    if (!data?.monthlyDailyAvg) {
      return [];
    }
    if (simulatedTec === null || data.monthlyDailyAvg.length === 0) {
      return data.monthlyDailyAvg;
    }
    return data.monthlyDailyAvg.map((point, index, items) =>
      index === items.length - 1
        ? {
            ...point,
            avgTec: simulatedTec
          }
        : point
    );
  }, [data, simulatedTec]);

  const effectiveRecentSixHours = useMemo(() => {
    const recent = data?.recentSixHours ?? [];
    if (simulatedTec === null || recent.length === 0) {
      return recent;
    }
    return recent.map((point, index, items) =>
      index === items.length - 1
        ? {
            ...point,
            tec: simulatedTec
          }
        : point
    );
  }, [data, simulatedTec]);

  const displayedCurrentTec = simulatedTec ?? data?.currentTec ?? 0;
  const isSimulating = simulatedTec !== null;

  const maxTec = useMemo(() => {
    const monthly = effectiveMonthlyDailyAvg.map((point) => point.avgTec ?? 0);
    const recent = effectiveRecentSixHours.map((point) => point.tec);
    return Math.max(5, ...monthly, ...recent);
  }, [effectiveMonthlyDailyAvg, effectiveRecentSixHours]);

  const monthlyPoints = useMemo(() => {
    if (!effectiveMonthlyDailyAvg.length) {
      return "";
    }
    const width = 640;
    const height = 210;
    const left = 42;
    const top = 18;
    const chartW = width - left - 14;
    const chartH = height - top - 26;
    const days = Math.max(1, effectiveMonthlyDailyAvg.length - 1);
    const points = effectiveMonthlyDailyAvg.map((point, index) => {
      const value = point.avgTec ?? 0;
      const x = left + (index / days) * chartW;
      const jitter = Math.sin(index * 1.13) * 0.7;
      const y = top + chartH - (value / maxTec) * chartH + jitter;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return points.join(" ");
  }, [effectiveMonthlyDailyAvg, maxTec]);

  return (
    <RetroWindow title="Energy // Ionosphere TEC Pulse" className="energy-window energy-window--tec">
      <div className={`energy-panel ${isSimulating ? "is-spiking" : ""}`}>
        <div className="energy-panel__head">
          <div className="energy-panel__title-row">
            <p className="energy-panel__title">JPL GDGPS TEC monthly pulse {"::"} refresh 5 min</p>
            <InfoButton onClick={() => onOpenInfo("tec")} label="Open ionosphere TEC info" />
          </div>
          <p className="meta">
            source: {data?.source ?? "loading"} {"::"} updated: {formatTimestamp(data?.lastUpdated ?? null)}
          </p>
        </div>

        <div className={`energy-tec-shell ${reducedMotion ? "is-static" : ""}`}>
          <div className="energy-tec-led-column energy-tec-led-column--left" aria-hidden>
            {Array.from({ length: 10 }).map((_, index) => (
              <span key={`tec-led-left-${index}`} style={{ "--led-delay": `${index * 0.18}s` } as CSSProperties} />
            ))}
          </div>
          <div className="energy-tec-plot">
            <svg viewBox="0 0 640 210" role="img" aria-label="Monthly TEC line">
              <rect x="0" y="0" width="640" height="210" className="energy-chart__bg" />
              {Array.from({ length: 6 }).map((_, index) => {
                const y = 18 + index * 33;
                return <line key={`tec-${index}`} x1="42" y1={y} x2="626" y2={y} className="energy-chart__grid" />;
              })}
              <polyline points={monthlyPoints} className="energy-tec__line" />
              <line x1="42" y1="184" x2="626" y2="184" className="energy-chart__axis" />
              <line x1="42" y1="18" x2="42" y2="184" className="energy-chart__axis" />
            </svg>
          </div>
          <div className="energy-tec-led-column energy-tec-led-column--right" aria-hidden>
            {Array.from({ length: 10 }).map((_, index) => (
              <span key={`tec-led-right-${index}`} style={{ "--led-delay": `${(index * 0.18) + 0.37}s` } as CSSProperties} />
            ))}
          </div>
        </div>

        <div className="energy-tec-strip" aria-label="Last six hours TEC strip">
          {effectiveRecentSixHours.map((point, index) => {
            const intensity = Math.max(0.08, Math.min(0.96, point.tec / maxTec));
            return <span key={`${point.timestamp}-${index}`} style={{ opacity: intensity }} />;
          })}
        </div>

        <div className="energy-panel__foot">
          <p className="meta">
            current tec: <strong>{displayedCurrentTec.toFixed(2)}</strong> {"::"} feed ts: {formatTimestamp(data?.feedUpdatedAt ?? null)}
            {isSimulating ? <span className="energy-sim-indicator">SIM</span> : null}
          </p>
          <button
            type="button"
            className="energy-dev-toggle"
            onClick={() => {
              const simValue = Number((35 + Math.random() * 35).toFixed(2));
              setSimulatedTec(simValue);
              if (simTimerRef.current !== null) {
                window.clearTimeout(simTimerRef.current);
              }
              simTimerRef.current = window.setTimeout(() => {
                setSimulatedTec(null);
                simTimerRef.current = null;
              }, 6000);
            }}
          >
            Simulate spike
          </button>
        </div>

        {loading ? <p className="meta">stabilizing ionosphere proxy...</p> : null}
        {error ? <p className="meta">feed note: {error}</p> : null}
      </div>
    </RetroWindow>
  );
}

export function HomeChartsColumn({ btcInitial, ethInitial, stats }: HomeChartsColumnProps) {
  const [tab, setTab] = useState<ChartsTab>("energy");
  const [activeInfoWidget, setActiveInfoWidget] = useState<EnergyWidgetId | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const kpiMax = Math.max(stats.totalMembers, stats.totalTours, stats.shotOClockEvents, 1);
  const kpiPct = (value: number) => `${Math.max(12, Math.round((value / kpiMax) * 100))}%`;

  return (
    <div className="stack home-tracker-stack">
      <div className="home-tracker-tabs" role="tablist" aria-label="Homepage charts selector">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "energy"}
          className={`home-tracker-tabs__button ${tab === "energy" ? "is-active" : ""}`}
          onClick={() => setTab("energy")}
        >
          Energy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "currency"}
          className={`home-tracker-tabs__button ${tab === "currency" ? "is-active" : ""}`}
          onClick={() => setTab("currency")}
        >
          Currency
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "stats"}
          className={`home-tracker-tabs__button ${tab === "stats" ? "is-active" : ""}`}
          onClick={() => setTab("stats")}
        >
          Stats
        </button>
      </div>

      {tab === "energy" ? (
        <>
          <SchumannChart onOpenInfo={setActiveInfoWidget} reducedMotion={reducedMotion} />
          <TecChart onOpenInfo={setActiveInfoWidget} reducedMotion={reducedMotion} />
          <KpIndexChart onOpenInfo={setActiveInfoWidget} reducedMotion={reducedMotion} />
        </>
      ) : tab === "currency" ? (
        <>
          <RetroWindow title="Satoshi Tracker" className="home-top-panel home-top-panel--tracker-orange">
            <div className="energy-panel__title-row home-currency-info-row">
              <p className="energy-panel__title">Bitcoin reserve tracker // 1W range</p>
              <InfoButton onClick={() => setActiveInfoWidget("btc")} label="Open Satoshi tracker info" />
            </div>
            <BTCSatsChart
              initialPoints={btcInitial.points}
              initialSource={btcInitial.source}
              assetSymbol="BTC"
              spotEndpoint="/api/btc/spot"
              theme="orange"
            />
          </RetroWindow>
          <RetroWindow title="ETH Tracker" className="home-top-panel home-top-panel--tracker-purple">
            <div className="energy-panel__title-row home-currency-info-row">
              <p className="energy-panel__title">Ethereum execution tracker // 1W range</p>
              <InfoButton onClick={() => setActiveInfoWidget("eth")} label="Open Ethereum tracker info" />
            </div>
            <BTCSatsChart
              initialPoints={ethInitial.points}
              initialSource={ethInitial.source}
              assetSymbol="ETH"
              spotEndpoint="/api/eth/spot"
              theme="purple"
            />
          </RetroWindow>
        </>
      ) : (
        <RetroWindow title="Member KPIs" className="home-top-panel home-top-panel--command-station">
          <div className="card-list">
            <div className="card">
              <h3>Total Members</h3>
              <p className="meta">{stats.totalMembers.toLocaleString()} members in system</p>
              <div className="submarine-chart__meter" aria-hidden>
                <span style={{ width: kpiPct(stats.totalMembers) }} />
              </div>
            </div>
            <div className="card">
              <h3>Total Tours</h3>
              <p className="meta">{stats.totalTours.toLocaleString()} published tours</p>
              <div className="submarine-chart__meter" aria-hidden>
                <span style={{ width: kpiPct(stats.totalTours) }} />
              </div>
            </div>
            <div className="card">
              <h3>Shot O&apos;Clock Events</h3>
              <p className="meta">{stats.shotOClockEvents.toLocaleString()} total transmissions</p>
              <div className="submarine-chart__meter" aria-hidden>
                <span style={{ width: kpiPct(stats.shotOClockEvents) }} />
              </div>
            </div>
          </div>
        </RetroWindow>
      )}

      <EnergyInfoModal widgetId={activeInfoWidget} open={activeInfoWidget !== null} onClose={() => setActiveInfoWidget(null)} />
    </div>
  );
}
