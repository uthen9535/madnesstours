"use client";

import { useEffect, useMemo, useState } from "react";
import { FearPieChart } from "@/components/FearPieChart";

const ARCHIVE_STORAGE_KEY = "madness_fear_archive_v1";

const FEARS = [
  { id: "PUBLIC_SPEAKING", label: "Public Speaking" },
  { id: "REJECTION", label: "Rejection" },
  { id: "ABANDONMENT", label: "Abandonment" },
  { id: "UNLOVABLE", label: "Unlovable" },
  { id: "MEDIOCRITY", label: "Mediocrity" },
  { id: "WASTED_LIFE", label: "Wasted Life" },
  { id: "TIME_RUNNING_OUT", label: "Running Out of Time" },
  { id: "FAILURE", label: "Failure" },
  { id: "SUCCESS_TRAP", label: "Success Trap" },
  { id: "LOSS_CONTROL", label: "Loss of Control" },
  { id: "BEING_KNOWN", label: "Being Known" },
  { id: "BETRAYAL", label: "Betrayal" },
  { id: "MEANINGLESSNESS", label: "Meaninglessness" },
  { id: "DEATH", label: "Death" },
  { id: "NOTHING_FEAR", label: "Nothing" },
  { id: "IDK", label: "I Don't Know" }
] as const;

type FearId = (typeof FEARS)[number]["id"];

type ArchiveShape = {
  total: number;
  counts: Record<FearId, number>;
};

type StatRow = {
  id: FearId;
  label: string;
  count: number;
  pct: number;
};

const ROTATING_SUBTITLE_LINES = [
  "Human psychology is a fascinating mess.",
  "Patterns are emerging.",
  "The wizard is taking notes.",
  "The forest hears everything."
];

const TOP_FEAR_NOTES: Partial<Record<FearId, string>> = {
  TIME_RUNNING_OUT: "The clock remains undefeated.",
  FAILURE: "Ambition detected.",
  MEANINGLESSNESS: "The philosophers were right.",
  REJECTION: "Belonging remains the oldest currency."
};

function emptyArchive(): ArchiveShape {
  const counts = FEARS.reduce(
    (acc, fear) => {
      acc[fear.id] = 0;
      return acc;
    },
    {} as Record<FearId, number>
  );

  return {
    total: 0,
    counts
  };
}

function readArchive(): ArchiveShape {
  if (typeof window === "undefined") {
    return emptyArchive();
  }

  const fallback = emptyArchive();
  const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ArchiveShape>;
    const counts = { ...fallback.counts };
    for (const fear of FEARS) {
      const value = parsed.counts?.[fear.id];
      counts[fear.id] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    }
    const total = typeof parsed.total === "number" && Number.isFinite(parsed.total) ? parsed.total : 0;
    return { total, counts };
  } catch {
    return fallback;
  }
}

function pct(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.round((count / total) * 100);
}

function computeObservation(rows: StatRow[]) {
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.pct])) as Record<FearId, number>;

  if (byId.TIME_RUNNING_OUT > 25) {
    return "Observation: Humans are extremely aware that time is limited.";
  }
  if (byId.WASTED_LIFE >= 18) {
    return "Observation: Many visitors fear reaching the end without meaning.";
  }
  if (byId.FAILURE >= 18) {
    return "Observation: Ambition appears common among Madness visitors.";
  }
  if (byId.MEANINGLESSNESS >= 15) {
    return "Observation: Existential dread detected.";
  }
  if (byId.NOTHING_FEAR >= 12) {
    return "Observation: Several visitors appear suspiciously confident.";
  }
  if (byId.IDK >= 12) {
    return "Observation: Some visitors prefer mystery to honesty.";
  }

  return "Observation: Humans fear many things. But uncertainty remains the largest.";
}

export function FearArchiveDashboard() {
  const [archive, setArchive] = useState<ArchiveShape>(emptyArchive);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [typedObservation, setTypedObservation] = useState("");

  useEffect(() => {
    setArchive(readArchive());

    const onStorage = () => {
      setArchive(readArchive());
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSubtitleIndex((value) => (value + 1) % ROTATING_SUBTITLE_LINES.length);
    }, 3600);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const rows = useMemo(() => {
    const countSum = FEARS.reduce((total, fear) => total + (archive.counts[fear.id] ?? 0), 0);
    const total = Math.max(archive.total, countSum);
    return FEARS.map((fear) => {
      const count = archive.counts[fear.id] ?? 0;
      return {
        id: fear.id,
        label: fear.label,
        count,
        pct: pct(count, total)
      } satisfies StatRow;
    });
  }, [archive]);

  const sampleSize = useMemo(() => rows.reduce((total, row) => total + row.count, 0), [rows]);

  const topFive = useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return FEARS.findIndex((fear) => fear.id === a.id) - FEARS.findIndex((fear) => fear.id === b.id);
      })
      .slice(0, 5);
  }, [rows]);

  const topFearNote = useMemo(() => {
    const first = topFive[0];
    if (!first || first.count === 0) {
      return "Humans appear to be very worried about time.";
    }

    return TOP_FEAR_NOTES[first.id] ?? "Humans appear to be very worried about time.";
  }, [topFive]);

  const observation = useMemo(() => computeObservation(rows), [rows]);

  useEffect(() => {
    setTypedObservation("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedObservation(observation.slice(0, index));
      if (index >= observation.length) {
        window.clearInterval(timer);
      }
    }, 18);

    return () => {
      window.clearInterval(timer);
    };
  }, [observation]);

  const isEmpty = sampleSize === 0;

  return (
    <section className="fear-dash-shell" aria-live="polite">
      <header className="fear-dash-header">
        <p className="fear-dash-kicker">ARCHIVE TERMINAL</p>
        <h3>FEAR ARCHIVE ANALYSIS</h3>
        <p className="fear-dash-subtext">The archive grows wiser with every confession.</p>
        <p className="fear-dash-rotating">{ROTATING_SUBTITLE_LINES[subtitleIndex]}</p>
      </header>

      {isEmpty ? (
        <p className="fear-dash-empty">
          The archive is still empty.
          <br />
          Someone must go first.
        </p>
      ) : (
        <div className="fear-dash-grid">
          <div className="fear-dash-column">
            <section className="fear-dash-card">
              <h4>WIZARD OBSERVATIONS</h4>
              <p className="fear-dash-observation">{typedObservation}</p>
            </section>

            <section className="fear-dash-card">
              <h4>TOP HUMAN FEARS</h4>
              <ol className="fear-dash-top-list">
                {topFive.map((row) => (
                  <li key={row.id}>
                    <span>{row.label}</span>
                    <span className="fear-dash-value">{row.pct}%</span>
                  </li>
                ))}
              </ol>
              <p className="fear-dash-note">{topFearNote}</p>
            </section>
          </div>

          <section className="fear-dash-card fear-dash-card--pie">
            <FearPieChart data={rows} total={sampleSize} />
          </section>
        </div>
      )}

      <footer className="fear-dash-footer">Fear Archive v1.0 // Madness Servers Operational</footer>
    </section>
  );
}
