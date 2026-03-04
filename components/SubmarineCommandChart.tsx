"use client";

type SubmarineCommandChartProps = {
  totalMembers: number;
  totalTours: number;
  shotOClockEvents: number;
};

type TelemetryCell = {
  id: "members" | "tours" | "shots";
  label: string;
  value: number;
  unit: string;
};

function clampPercent(value: number) {
  return Math.max(8, Math.min(98, value));
}

function makeSignalPercent(value: number, denominator: number) {
  if (denominator <= 0) {
    return 10;
  }
  return clampPercent((value / denominator) * 100);
}

export function SubmarineCommandChart({ totalMembers, totalTours, shotOClockEvents }: SubmarineCommandChartProps) {
  const cells: TelemetryCell[] = [
    { id: "members", label: "Total Members", value: totalMembers, unit: "crew" },
    { id: "tours", label: "Total Tours", value: totalTours, unit: "routes" },
    { id: "shots", label: "Shot O'Clock Events", value: shotOClockEvents, unit: "bursts" }
  ];

  const maxValue = Math.max(...cells.map((cell) => cell.value), 1);
  const radarSweepPct = clampPercent(20 + ((totalMembers + totalTours + shotOClockEvents) % 64));

  return (
    <div className="submarine-chart" role="img" aria-label="Command station telemetry chart">
      <header className="submarine-chart__header">
        <span className="tag">Submarine Command Grid</span>
        <span className="meta">sonar.online // depth.stable</span>
      </header>

      <div className="submarine-chart__scope">
        <div className="submarine-chart__scope-core" />
        <div className="submarine-chart__scope-ring submarine-chart__scope-ring--inner" />
        <div className="submarine-chart__scope-ring submarine-chart__scope-ring--outer" />
        <div className="submarine-chart__scope-sweep" style={{ left: `${radarSweepPct}%` }} />
      </div>

      <div className="submarine-chart__cells">
        {cells.map((cell) => {
          const level = makeSignalPercent(cell.value, maxValue);
          return (
            <article key={cell.id} className={`submarine-chart__cell submarine-chart__cell--${cell.id}`}>
              <p className="submarine-chart__cell-label">{cell.label}</p>
              <p className="submarine-chart__cell-value">
                {cell.value.toLocaleString()} <span>{cell.unit}</span>
              </p>
              <div className="submarine-chart__meter" aria-hidden="true">
                <span style={{ width: `${level}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
