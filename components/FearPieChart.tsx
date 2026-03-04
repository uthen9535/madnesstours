"use client";

import { useMemo, useState } from "react";

type FearChartRow = {
  id: string;
  label: string;
  count: number;
  pct: number;
};

type FearPieChartProps = {
  data: FearChartRow[];
  total: number;
  onSelectFear?: (row: FearChartRow) => void;
  wizardModeDefault?: boolean;
};

type TooltipState = {
  x: number;
  y: number;
  row: FearChartRow;
} | null;

const FEAR_COLORS: Record<string, string> = {
  PUBLIC_SPEAKING: "#5db7ff",
  REJECTION: "#ff7aa8",
  ABANDONMENT: "#ad8bff",
  UNLOVABLE: "#ff6a6a",
  MEDIOCRITY: "#ffd166",
  WASTED_LIFE: "#68f2c6",
  TIME_RUNNING_OUT: "#00e5ff",
  FAILURE: "#ff9864",
  SUCCESS_TRAP: "#8cc1ff",
  LOSS_CONTROL: "#9cf56f",
  BEING_KNOWN: "#f4a6ff",
  BETRAYAL: "#72cfff",
  MEANINGLESSNESS: "#c3a8ff",
  DEATH: "#7ea0ff",
  NOTHING_FEAR: "#9ce7d8",
  IDK: "#c0d0ea"
};

const WIZARD_LINES: Record<string, string[]> = {
  PUBLIC_SPEAKING: [
    "Humans fear being seen more than being wrong.",
    "The crowd is mostly busy thinking about themselves.",
    "Even prophets eventually had to take the stage."
  ],
  REJECTION: [
    "Belonging is ancient. Rejection still hits like exile.",
    "The wrong crowd rejecting you is often protection.",
    "Sometimes rejection is just cosmic traffic control."
  ],
  ABANDONMENT: [
    "The fear is often not others leaving, but you leaving yourself.",
    "Loneliness hurts, then sometimes transforms.",
    "The wilderness has mentored many reluctant legends."
  ],
  UNLOVABLE: [
    "If you were truly unlovable, this fear would not exist.",
    "Conditional love trains dangerous lies.",
    "Honest souls get found eventually."
  ],
  MEDIOCRITY: [
    "Comfort is efficient at producing average outcomes.",
    "You fear mediocrity because something in you knows better.",
    "Legends usually began as people refusing quiet compromise."
  ],
  WASTED_LIFE: [
    "Fear of wasted life is often the wake-up alarm.",
    "Time denial is a favorite human hobby.",
    "Some wake up early. Some never do."
  ],
  TIME_RUNNING_OUT: [
    "The clock remains undefeated.",
    "Time pressure is proof you are still conscious.",
    "The question is not time left. It is your next move."
  ],
  FAILURE: [
    "Failure is feedback delivered with bad PR.",
    "Ambition usually arrives with public embarrassment.",
    "Stagnation is the quieter catastrophe."
  ],
  SUCCESS_TRAP: [
    "Some goals are inherited cages.",
    "Success without freedom is expensive captivity.",
    "Getting everything can trigger the real question."
  ],
  LOSS_CONTROL: [
    "Control is comforting; reality is not obligated.",
    "Adaptation beats domination over long timelines.",
    "Surrender can be sanity, not defeat."
  ],
  BEING_KNOWN: [
    "Masks protect and isolate at the same time.",
    "To be known requires courage from both sides.",
    "Real intimacy starts when performance ends."
  ],
  BETRAYAL: [
    "Trust breaks loudly because vulnerability was real.",
    "Some betrayals reveal character; others reveal truth.",
    "Forgive carefully. Remember clearly."
  ],
  MEANINGLESSNESS: [
    "Existential dread: premium feature of self-awareness.",
    "The universe offers opportunity, not guarantees.",
    "Meaning is mostly built, not found."
  ],
  DEATH: [
    "Death gives urgency to ordinary Tuesdays.",
    "No tradition fully deletes the mystery.",
    "Remembering death can sharpen life."
  ],
  NOTHING_FEAR: [
    "Confidence noted. Evidence pending.",
    "Fearless claims often avoid close inspection.",
    "Even warriors carry quiet tremors."
  ],
  IDK: [
    "Confusion is often fear wearing a hoodie.",
    "Not knowing does not mean not feeling.",
    "Mystery is safer than honesty for many humans."
  ]
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function pickLine(id: string) {
  const options = WIZARD_LINES[id] ?? WIZARD_LINES.IDK;
  return options[Math.floor(Math.random() * options.length)] ?? options[0];
}

export function FearPieChart({ data, total, onSelectFear, wizardModeDefault = true }: FearPieChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizardMode, setWizardMode] = useState(wizardModeDefault);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [readoutLine, setReadoutLine] = useState("");

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.label.localeCompare(b.label);
    });
  }, [data]);

  const pieSlices = useMemo(() => {
    const base = total >= 25 ? sorted.filter((row) => row.count > 0) : sorted;
    let startAngle = -Math.PI / 2;
    return base
      .filter((row) => row.count > 0 && total > 0)
      .map((row) => {
        const angle = (row.count / total) * Math.PI * 2;
        const slice = {
          ...row,
          startAngle,
          endAngle: startAngle + angle
        };
        startAngle += angle;
        return slice;
      });
  }, [sorted, total]);

  const selectedRow = useMemo(
    () => sorted.find((row) => row.id === selectedId) ?? null,
    [selectedId, sorted]
  );

  const activeId = hoveredId ?? selectedId;

  const handleSelect = (row: FearChartRow) => {
    setSelectedId(row.id);
    setReadoutLine(pickLine(row.id));
    onSelectFear?.(row);
  };

  if (total <= 0) {
    return (
      <section className="fear-wheel-shell">
        <h5>FEAR WHEEL</h5>
        <p className="fear-wheel-subtext">Click a slice to summon its truth.</p>
        <p className="fear-wheel-empty">No confessions yet. The wizard is bored.</p>
      </section>
    );
  }

  return (
    <section className={wizardMode ? "fear-wheel-shell fear-wheel-shell--wizard-on" : "fear-wheel-shell fear-wheel-shell--wizard-off"}>
      <header className="fear-wheel-header">
        <h5>FEAR WHEEL</h5>
        <p className="fear-wheel-subtext">Click a slice to summon its truth.</p>
      </header>

      <div className="fear-wheel-body">
        <div className="fear-wheel-legend">
          {sorted.map((row) => (
            <button
              key={row.id}
              type="button"
              className={selectedId === row.id ? "fear-wheel-legend-item fear-wheel-legend-item--active" : "fear-wheel-legend-item"}
              onClick={() => handleSelect(row)}
            >
              <span className="fear-wheel-legend-dot" style={{ backgroundColor: FEAR_COLORS[row.id] ?? "#8bc3ff" }} />
              <span className="fear-wheel-legend-label">{row.label}</span>
              <span className="fear-wheel-legend-value">
                {row.pct}% ({row.count})
              </span>
            </button>
          ))}
        </div>

        <div className="fear-wheel-viz">
          <div className="fear-wheel-canvas-wrap">
            <svg className="fear-wheel-svg" viewBox="0 0 300 300" role="img" aria-label="Fear wheel pie chart">
              {pieSlices.map((slice) => {
                const isActive = activeId === slice.id;
                const radius = isActive ? 116 : 108;
                const color = FEAR_COLORS[slice.id] ?? "#8bc3ff";
                return (
                  <path
                    key={slice.id}
                    d={arcPath(150, 150, radius, slice.startAngle, slice.endAngle)}
                    fill={color}
                    className={
                      selectedId === slice.id && wizardMode
                        ? "fear-wheel-slice fear-wheel-slice--selected fear-wheel-slice--pulse"
                        : selectedId === slice.id
                          ? "fear-wheel-slice fear-wheel-slice--selected"
                          : "fear-wheel-slice"
                    }
                    aria-label={`${slice.label}, ${slice.pct} percent, ${slice.count} selections`}
                    onMouseEnter={(event) => {
                      setHoveredId(slice.id);
                      const rect = (event.currentTarget.ownerSVGElement?.parentElement as HTMLDivElement | null)?.getBoundingClientRect();
                      if (!rect) {
                        return;
                      }
                      setTooltip({
                        x: clamp(event.clientX - rect.left + 12, 10, rect.width - 180),
                        y: clamp(event.clientY - rect.top + 12, 12, rect.height - 90),
                        row: slice
                      });
                    }}
                    onMouseMove={(event) => {
                      const rect = (event.currentTarget.ownerSVGElement?.parentElement as HTMLDivElement | null)?.getBoundingClientRect();
                      if (!rect) {
                        return;
                      }
                      setTooltip({
                        x: clamp(event.clientX - rect.left + 12, 10, rect.width - 180),
                        y: clamp(event.clientY - rect.top + 12, 12, rect.height - 90),
                        row: slice
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredId(null);
                      setTooltip(null);
                    }}
                    onClick={() => handleSelect(slice)}
                  />
                );
              })}
              <circle cx="150" cy="150" r="44" className="fear-wheel-core" />
            </svg>

            {tooltip ? (
              <div
                className={wizardMode ? "fear-wheel-tooltip fear-wheel-tooltip--wizard" : "fear-wheel-tooltip"}
                style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
              >
                <p className="fear-wheel-tooltip-title">FEAR SELECTED</p>
                <p>
                  {tooltip.row.label}
                  <br />
                  {tooltip.row.pct}% (n={tooltip.row.count})
                </p>
              </div>
            ) : null}
          </div>

          <div className="fear-wheel-controls">
            <button
              type="button"
              className={wizardMode ? "fear-wheel-mode-toggle fear-wheel-mode-toggle--on" : "fear-wheel-mode-toggle"}
              onClick={() => setWizardMode((value) => !value)}
              aria-pressed={wizardMode}
            >
              Wizard Mode: {wizardMode ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      </div>

      <p className="fear-wheel-sample">Sample size: n={total}</p>
      {total < 20 ? <p className="fear-wheel-note">Archive note: dataset still small. More confessions required.</p> : null}

      {selectedRow ? (
        <section className="fear-wheel-readout">
          <h6>WIZARD READOUT</h6>
          <p>
            {selectedRow.label}
            <br />
            {selectedRow.pct}% (n={selectedRow.count})
            <br />
            {readoutLine}
          </p>
        </section>
      ) : null}
    </section>
  );
}
