"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BTCSatsChart } from "@/components/BTCSatsChart";
import { RetroWindow } from "@/components/RetroWindow";

type PricePoint = {
  timestamp: string;
  usdPrice: number;
};

type ChartsTab = "energy" | "currency";

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

function KpGauge({ currentKp }: { currentKp: number }) {
  const clamped = Math.max(0, Math.min(9, currentKp));
  const angle = -120 + (clamped / 9) * 240;
  const r = 44;
  const cx = 58;
  const cy = 62;
  const x2 = cx + Math.cos((angle * Math.PI) / 180) * (r - 6);
  const y2 = cy + Math.sin((angle * Math.PI) / 180) * (r - 6);

  return (
    <div className="energy-gauge">
      <svg viewBox="0 0 116 88" role="img" aria-label="Current Kp gauge">
        <path d="M14,62 A44,44 0 1,1 102,62" className="energy-gauge__arc" />
        <line x1={cx} y1={cy} x2={x2} y2={y2} className="energy-gauge__needle" />
        <circle cx={cx} cy={cy} r={3.2} className="energy-gauge__hub" />
        {[0, 3, 5, 7, 9].map((label) => {
          const theta = (-120 + (label / 9) * 240) * (Math.PI / 180);
          const tx = cx + Math.cos(theta) * 50;
          const ty = cy + Math.sin(theta) * 50;
          return (
            <text key={label} x={tx} y={ty} className="energy-gauge__tick">
              {label}
            </text>
          );
        })}
      </svg>
      <p className="meta">
        kp now: <strong>{clamped.toFixed(2)}</strong>
      </p>
    </div>
  );
}

function KpIndexChart() {
  const { data, loading, error } = usePolledFeed<KpFeed>("/api/energy/kp", 60_000);
  const [now, setNow] = useState(() => Date.now());
  const [spikePulse, setSpikePulse] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const days = data?.daily.length ?? 31;
  const nowDate = new Date(now);
  const nowMarker = nowDate.getDate() - 1 + (nowDate.getHours() * 60 + nowDate.getMinutes()) / (24 * 60);
  const nowX = (nowMarker / Math.max(1, days - 1)) * 100;

  return (
    <RetroWindow title="Energy // Kp Storm Index" className="energy-window energy-window--kp">
      <div className={`energy-panel ${spikePulse ? "is-spiking" : ""}`}>
        <div className="energy-panel__head">
          <p className="meta">NOAA SWPC monthly timeline :: refresh 60s</p>
          <p className="meta">
            source: {data?.source ?? "loading"} {"::"} updated: {formatTimestamp(data?.lastUpdated ?? null)}
          </p>
        </div>

        <div className="energy-kp-layout">
          <div className="energy-kp-chart">
            <svg viewBox="0 0 680 250" role="img" aria-label="Monthly Kp timeline">
              <rect x="0" y="0" width="680" height="250" className="energy-chart__bg" />
              {Array.from({ length: 6 }).map((_, index) => {
                const y = 20 + index * 36;
                return <line key={`h-${index}`} x1="44" y1={y} x2="660" y2={y} className="energy-chart__grid" />;
              })}
              {data?.daily.map((point, index) => {
                const barWidth = 616 / Math.max(1, days);
                const x = 44 + index * barWidth;
                const value = point.maxKp ?? 0;
                const height = (value / 9) * 198;
                const y = 218 - height;
                return (
                  <g key={point.date}>
                    <rect
                      x={x + 1.2}
                      y={y}
                      width={Math.max(2, barWidth - 2.4)}
                      height={height}
                      className={value >= 5 ? "energy-kp__bar energy-kp__bar--storm" : "energy-kp__bar"}
                    />
                    {point.stormLabel ? (
                      <text x={x + barWidth / 2} y={Math.max(16, y - 6)} className="energy-kp__flag">
                        {point.stormLabel}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {data?.trend.length ? (
                <polyline
                  points={data.trend
                    .map((point) => {
                      const x = 44 + (point.dayFraction / Math.max(1, days - 1)) * 616;
                      const y = 218 - (Math.max(0, Math.min(9, point.rolling3h)) / 9) * 198;
                      return `${x.toFixed(2)},${y.toFixed(2)}`;
                    })
                    .join(" ")}
                  className="energy-kp__trend"
                />
              ) : null}

              <line
                x1={(44 + (Math.max(0, Math.min(100, nowX)) / 100) * 616).toFixed(2)}
                y1="20"
                x2={(44 + (Math.max(0, Math.min(100, nowX)) / 100) * 616).toFixed(2)}
                y2="218"
                className="energy-kp__now"
              />
              <text x={Math.max(46, 44 + (Math.max(0, Math.min(100, nowX)) / 100) * 616 - 16)} y="14" className="energy-kp__now-label">
                NOW
              </text>

              <line x1="44" y1="218" x2="660" y2="218" className="energy-chart__axis" />
              <line x1="44" y1="20" x2="44" y2="218" className="energy-chart__axis" />
            </svg>
          </div>

          <div className="energy-kp-side">
            <KpGauge currentKp={data?.currentKp ?? 0} />
            <p className="meta">feed timestamp: {formatTimestamp(data?.feedUpdatedAt ?? null)}</p>
            <button
              type="button"
              className="energy-dev-toggle"
              onClick={() => {
                setSpikePulse(true);
                window.setTimeout(() => setSpikePulse(false), 1800);
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

function SchumannChart() {
  const { data, loading, error } = usePolledFeed<SchumannFeed>("/api/energy/schumann", 10 * 60_000);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);
  const [manualSpike, setManualSpike] = useState(false);

  useEffect(() => {
    let frame = 0;
    let animationId = 0;
    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationId = window.requestAnimationFrame(render);
        return;
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
        animationId = window.requestAnimationFrame(render);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#031923";
      ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(73, 168, 196, 0.22)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += 18) {
          ctx.beginPath();
          ctx.moveTo(x + ((phaseRef.current * 4) % 18), 0);
          ctx.lineTo(x + ((phaseRef.current * 4) % 18), height);
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
      const xShift = (phaseRef.current * 2.4) % width;

      ctx.beginPath();
      for (let i = 0; i < width; i += 1) {
        const idx = Math.floor(((i + xShift) / width) * wave.length) % wave.length;
        const sample = wave[idx] ?? 0;
        const y = height * 0.52 - sample * 48 * ampBoost;
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

      frame += 1;
      if (frame % 2 === 0) {
        phaseRef.current = (phaseRef.current + 1) % 100000;
      }
      animationId = window.requestAnimationFrame(render);
    };

    animationId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [data, manualSpike]);

  const maxIntensity = useMemo(() => {
    const values = data?.monthlyIntensity.map((point) => point.avgPower ?? 0) ?? [1];
    return Math.max(1, ...values);
  }, [data]);

  return (
    <RetroWindow title="Energy // Schumann Resonance" className="energy-window energy-window--schumann">
      <div className="energy-panel">
        <div className="energy-panel__head">
          <p className="meta">HeartMath GCI monthly resonance + live oscilloscope {"::"} refresh 10 min</p>
          <p className="meta">
            source: {data?.source ?? "loading"} {"::"} updated: {formatTimestamp(data?.lastUpdated ?? null)}
          </p>
        </div>

        <canvas ref={canvasRef} className={`energy-oscilloscope ${(manualSpike || data?.spikeDetected) ? "is-spiking" : ""}`} />

        <div className="energy-ribbon" aria-label="Monthly resonance intensity ribbon">
          {data?.monthlyIntensity.map((point) => {
            const intensity = point.avgPower === null ? 0.04 : Math.max(0.08, (point.avgPower / maxIntensity) * 0.95);
            return (
              <span
                key={point.date}
                title={`day ${point.day}: ${point.avgPower === null ? "n/a" : point.avgPower.toFixed(3)}`}
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

function TecChart() {
  const { data, loading, error } = usePolledFeed<TecFeed>("/api/energy/tec", 5 * 60_000);
  const [simulatePulse, setSimulatePulse] = useState(false);

  const maxTec = useMemo(() => {
    const monthly = data?.monthlyDailyAvg.map((point) => point.avgTec ?? 0) ?? [1];
    const recent = data?.recentSixHours.map((point) => point.tec) ?? [0];
    return Math.max(5, ...monthly, ...recent);
  }, [data]);

  const monthlyPoints = useMemo(() => {
    if (!data?.monthlyDailyAvg.length) {
      return "";
    }
    const width = 640;
    const height = 210;
    const left = 42;
    const top = 18;
    const chartW = width - left - 14;
    const chartH = height - top - 26;
    const days = Math.max(1, data.monthlyDailyAvg.length - 1);
    const points = data.monthlyDailyAvg.map((point, index) => {
      const value = point.avgTec ?? 0;
      const x = left + (index / days) * chartW;
      const jitter = Math.sin(index * 1.13) * 0.7;
      const y = top + chartH - (value / maxTec) * chartH + jitter;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return points.join(" ");
  }, [data, maxTec]);

  return (
    <RetroWindow title="Energy // Ionosphere TEC Pulse" className="energy-window energy-window--tec">
      <div className={`energy-panel ${simulatePulse ? "is-spiking" : ""}`}>
        <div className="energy-panel__head">
          <p className="meta">JPL GDGPS TEC monthly pulse {"::"} refresh 5 min</p>
          <p className="meta">
            source: {data?.source ?? "loading"} {"::"} updated: {formatTimestamp(data?.lastUpdated ?? null)}
          </p>
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

        <div className="energy-tec-strip" aria-label="Last six hours TEC strip">
          {(data?.recentSixHours ?? []).map((point, index) => {
            const intensity = Math.max(0.08, Math.min(0.96, point.tec / maxTec));
            return <span key={`${point.timestamp}-${index}`} style={{ opacity: intensity }} />;
          })}
        </div>

        <div className="energy-panel__foot">
          <p className="meta">
            current tec: <strong>{(data?.currentTec ?? 0).toFixed(2)}</strong> {"::"} feed ts: {formatTimestamp(data?.feedUpdatedAt ?? null)}
          </p>
          <button
            type="button"
            className="energy-dev-toggle"
            onClick={() => {
              setSimulatePulse(true);
              window.setTimeout(() => setSimulatePulse(false), 1800);
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

export function HomeChartsColumn({ btcInitial, ethInitial }: HomeChartsColumnProps) {
  const [tab, setTab] = useState<ChartsTab>("energy");

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
      </div>

      {tab === "energy" ? (
        <>
          <KpIndexChart />
          <SchumannChart />
          <TecChart />
        </>
      ) : (
        <>
          <RetroWindow title="Satoshi Tracker" className="home-top-panel home-top-panel--tracker-orange">
            <BTCSatsChart
              initialPoints={btcInitial.points}
              initialSource={btcInitial.source}
              assetSymbol="BTC"
              spotEndpoint="/api/btc/spot"
              theme="orange"
            />
          </RetroWindow>
          <RetroWindow title="ETH Tracker" className="home-top-panel home-top-panel--tracker-purple">
            <BTCSatsChart
              initialPoints={ethInitial.points}
              initialSource={ethInitial.source}
              assetSymbol="ETH"
              spotEndpoint="/api/eth/spot"
              theme="purple"
            />
          </RetroWindow>
        </>
      )}
    </div>
  );
}
