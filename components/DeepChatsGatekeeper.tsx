"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const DEEP_CHATS_PATH = "/deep-chats";
const ARCHIVE_STORAGE_KEY = "madness_fear_archive_v1";
const ARCHIVE_DAILY_PASS_KEY = "madness_fear_archive_gate_date_v1";
const ANALYSIS_DURATION_MS = 2000;

const FEAR_OPTIONS = [
  { id: "PUBLIC_SPEAKING", label: "Public speaking (being watched and judged)", statLabel: "Public Speaking" },
  { id: "REJECTION", label: "Being rejected by people I respect", statLabel: "Rejection" },
  { id: "ABANDONMENT", label: "Being left when I need someone most", statLabel: "Abandonment" },
  { id: "UNLOVABLE", label: "Realizing I might be fundamentally unlovable", statLabel: "Unlovable" },
  { id: "MEDIOCRITY", label: "Living an average life and pretending it is enough", statLabel: "Mediocrity" },
  { id: "WASTED_LIFE", label: "Waking up late in life realizing I wasted it", statLabel: "Wasted Life" },
  { id: "TIME_RUNNING_OUT", label: "Running out of time", statLabel: "Running Out of Time" },
  { id: "FAILURE", label: "Failing publicly after declaring success", statLabel: "Failure" },
  { id: "SUCCESS_TRAP", label: "Getting everything I want and feeling trapped by it", statLabel: "Success Trap" },
  { id: "LOSS_CONTROL", label: "Losing control of my mind or impulses", statLabel: "Loss of Control" },
  { id: "BEING_KNOWN", label: "Being truly known and still not chosen", statLabel: "Being Known" },
  { id: "BETRAYAL", label: "Being betrayed by someone I trusted", statLabel: "Betrayal" },
  { id: "MEANINGLESSNESS", label: "Discovering none of this truly matters", statLabel: "Meaninglessness" },
  { id: "DEATH", label: "Dying unfinished", statLabel: "Death" },
  { id: "NOTHING_FEAR", label: "Nothing. I fear nothing.", statLabel: "Nothing" },
  { id: "IDK", label: "I don't know.", statLabel: "I Don't Know" }
] as const;

type FearId = (typeof FEAR_OPTIONS)[number]["id"];

type ArchiveShape = {
  total: number;
  counts: Record<FearId, number>;
};

type StatSummary = {
  id: FearId;
  count: number;
  pct: number;
};

type AnalysisResult = {
  selectedFear: FearId;
  response: string;
  mostCommon: StatSummary;
  secondPlace: StatSummary;
  leastSelected: StatSummary;
  sampleSize: number;
};

const LOADING_LINES = [
  "Aligning emotional frequencies...",
  "Consulting the wizard council...",
  "Decrypting subconscious patterns...",
  "Scanning human weakness...",
  "Synchronizing with ancient Madness servers...",
  "Running fear_analysis.exe..."
];

const FEAR_RESPONSES: Record<FearId, string[]> = {
  PUBLIC_SPEAKING: [
    "Humans fear being seen more than being wrong.\nInteresting survival strategy.",
    "A thousand years ago you feared wolves.\nNow you fear PowerPoint.\n\nProgress is strange.",
    "The crowd is rarely thinking about you.\nThey are mostly thinking about themselves.",
    "The wise speak slowly not because they fear judgment,\nbut because they understand attention is sacred.",
    "Every prophet eventually had to speak publicly.\n\nEven the reluctant ones."
  ],
  REJECTION: [
    "Rejection hurts because belonging is ancient.\nYour nervous system still thinks exile equals death.",
    "You fear rejection because you care about something real.\n\nThat is not weakness.",
    "The wrong crowd rejecting you is often divine protection.",
    "Humans rarely reject truth.\nThey reject discomfort.",
    "Sometimes rejection is simply the universe redirecting traffic."
  ],
  ABANDONMENT: [
    "Abandonment wounds form early.\n\nBut the adult eventually learns how to stay.",
    "The deepest fear is often not that others will leave.\n\nIt is that you will.",
    "Some people leave because they are weak.\nOthers leave because they must.\n\nWisdom learns the difference.",
    "Even prophets spent time alone in the wilderness.",
    "Loneliness is painful.\n\nBut sometimes it is also the beginning of transformation."
  ],
  UNLOVABLE: [
    "The human mind invents stories about being unlovable.\n\nUsually before the evidence arrives.",
    "The soul does not measure worth the way the ego does.",
    "Some people believe they are unlovable\nbecause they have only known conditional love.",
    "If you were truly unlovable,\nyou would not fear it.",
    "The strange thing about love\nis that it tends to find the honest ones eventually."
  ],
  MEDIOCRITY: [
    "Many people fear mediocrity\nyet organize their lives perfectly to achieve it.",
    "Average is comfortable.\n\nComfort rarely produces legends.",
    "You are afraid of mediocrity because something in you knows better.",
    "The danger is not mediocrity.\n\nThe danger is convincing yourself it is enough.",
    "Every generation produces a few people\nwho refuse to live quietly.\n\nPerhaps that is you."
  ],
  WASTED_LIFE: [
    "The fear of a wasted life\nis usually the beginning of a meaningful one.",
    "People waste time\nbecause they believe they have infinite amounts of it.",
    "Awareness of time is painful.\n\nIt is also clarifying.",
    "The clock is not your enemy.\n\nIt is your teacher.",
    "Some people wake up at 60.\n\nSome wake up at 30.\n\nSome never wake up."
  ],
  TIME_RUNNING_OUT: [
    "Time running out is not a fear.\n\nIt is a fact.",
    "You are aware of time because you are conscious.\n\nThat awareness is both a burden and a gift.",
    "The wise do not fear the clock.\n\nThey cooperate with it.",
    "Every second you worry about time\nis another second spent.",
    "The question is not how much time remains.\n\nIt is what you will do with it."
  ],
  FAILURE: [
    "Failure is embarrassing.\n\nBut stagnation is far worse.",
    "The people most afraid of failure\nare often the ones closest to attempting something meaningful.",
    "The archive confirms:\n\nmost successful people failed publicly first.",
    "Failure is simply feedback delivered with humiliation.",
    "The only true failure\nis refusing to attempt what you know you should."
  ],
  SUCCESS_TRAP: [
    "Many people achieve what they wanted\nonly to realize they built a cage.",
    "Success without freedom is a gilded prison.",
    "Some ambitions are inherited,\nnot chosen.",
    "The wise examine their desires carefully.",
    "Getting what you want\nis sometimes the beginning of the real question."
  ],
  LOSS_CONTROL: [
    "Humans worship control\nuntil life reminds them who is actually in charge.",
    "Control is comforting.\n\nReality is unpredictable.",
    "The mind fears chaos\nbecause it cannot negotiate with it.",
    "Surrender is not weakness.\n\nSometimes it is sanity.",
    "The strongest people are not those who control everything.\n\nThey are the ones who adapt."
  ],
  BEING_KNOWN: [
    "Being truly known is terrifying.\n\nBecause it risks rejection without masks.",
    "Many people desire intimacy\nwhile secretly defending against it.",
    "To be known\nrequires courage from both sides.",
    "Masks are protective.\n\nBut they are also lonely.",
    "Some of the deepest relationships begin\nwhen someone finally drops the act."
  ],
  BETRAYAL: [
    "Trust is fragile\nbecause it requires vulnerability.",
    "Betrayal hurts\nbecause it violates an unspoken covenant.",
    "Some betrayals reveal character.\n\nOthers reveal reality.",
    "The wise forgive carefully.\n\nBut they remember clearly.",
    "Sometimes betrayal is the universe\nremoving illusions."
  ],
  MEANINGLESSNESS: [
    "Meaninglessness appears\nwhen the mind searches for guarantees.",
    "The universe rarely provides guarantees.\n\nIt provides opportunity.",
    "Meaning is not discovered.\n\nIt is constructed.",
    "Existential dread is the cost of self awareness.",
    "Those who stare into the void long enough\nsometimes discover freedom."
  ],
  DEATH: [
    "Death terrifies humans\nbecause it is the one event no one rehearses.",
    "Every religion attempts to answer death.\n\nNone eliminate the mystery.",
    "The awareness of death\nis what gives urgency to life.",
    "The wise do not obsess over death.\n\nThey prepare.",
    "Remembering death\nhas guided philosophers for thousands of years."
  ],
  NOTHING_FEAR: [
    "Confidence noted.\n\nEvidence inconclusive.",
    "Humans claiming to fear nothing\nusually just haven't looked closely yet.",
    "Even warriors carry quiet fears.",
    "The absence of fear is rare.\n\nThe absence of honesty is common.",
    "The archive suggests humility."
  ],
  IDK: [
    "Most people choose this\nwhen the real answer feels uncomfortable.",
    "Not knowing your fear\ndoes not mean it is absent.",
    "Sometimes confusion\nis simply the mind protecting itself.",
    "The archive encourages curiosity.",
    "Self knowledge is rarely convenient."
  ]
};

function makeEmptyArchive(): ArchiveShape {
  const counts = FEAR_OPTIONS.reduce(
    (acc, option) => {
      acc[option.id] = 0;
      return acc;
    },
    {} as Record<FearId, number>
  );

  return { total: 0, counts };
}

function readArchive(): ArchiveShape {
  if (typeof window === "undefined") {
    return makeEmptyArchive();
  }

  const fallback = makeEmptyArchive();
  const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ArchiveShape>;
    const total = typeof parsed.total === "number" && Number.isFinite(parsed.total) ? parsed.total : 0;
    const counts = { ...fallback.counts };
    for (const option of FEAR_OPTIONS) {
      const value = parsed.counts?.[option.id];
      counts[option.id] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    }
    return { total, counts };
  } catch {
    return fallback;
  }
}

function saveArchive(archive: ArchiveShape) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archive));
}

function localDateStamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasDailyPassToday() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(ARCHIVE_DAILY_PASS_KEY) === localDateStamp();
}

function saveDailyPassToday() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ARCHIVE_DAILY_PASS_KEY, localDateStamp());
}

function fearMeta(id: FearId) {
  return FEAR_OPTIONS.find((item) => item.id === id) ?? FEAR_OPTIONS[0];
}

function toPercent(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.round((count / total) * 100);
}

function computeResult(archive: ArchiveShape, selectedFear: FearId): AnalysisResult {
  const order = new Map(FEAR_OPTIONS.map((option, index) => [option.id, index]));

  const stats = FEAR_OPTIONS.map((option) => ({
    id: option.id,
    count: archive.counts[option.id] ?? 0,
    pct: toPercent(archive.counts[option.id] ?? 0, archive.total)
  }));

  const sortedDesc = [...stats].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });

  const mostCommon = sortedDesc[0] ?? stats[0];
  const secondPlace = sortedDesc[1] ?? mostCommon;

  const withSelections = stats.filter((stat) => stat.count > 0);
  const leastSource = withSelections.length > 0 ? withSelections : stats;
  const leastSelected =
    [...leastSource].sort((a, b) => {
      if (a.count !== b.count) {
        return a.count - b.count;
      }
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    })[0] ?? mostCommon;

  const responses = FEAR_RESPONSES[selectedFear];
  const response = responses[Math.floor(Math.random() * responses.length)] ?? responses[0];

  return {
    selectedFear,
    response,
    mostCommon,
    secondPlace,
    leastSelected,
    sampleSize: archive.total
  };
}

type Step = "select" | "loading" | "result";
type GateMode = "navigate" | "reveal";

export function DeepChatsGatekeeper() {
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [selectedFear, setSelectedFear] = useState<FearId | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [gateMode, setGateMode] = useState<GateMode>("navigate");
  const [deepChatsUnlocked, setDeepChatsUnlocked] = useState(false);
  const [answeredToday, setAnsweredToday] = useState(false);

  const openGate = useCallback((mode: GateMode) => {
    setGateMode(mode);
    setSelectedFear(null);
    setAnalysisResult(null);
    setLoadingProgress(0);
    setLoadingTextIndex(0);
    setStep("select");
    setIsOpen(true);
  }, []);

  const syncDailyPass = useCallback(() => {
    setAnsweredToday(hasDailyPassToday());
  }, []);

  useEffect(() => {
    syncDailyPass();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === ARCHIVE_DAILY_PASS_KEY) {
        syncDailyPass();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncDailyPass);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", syncDailyPass);
    };
  }, [syncDailyPass]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin || url.pathname !== DEEP_CHATS_PATH) {
        return;
      }

      if (hasDailyPassToday()) {
        setAnsweredToday(true);
        setDeepChatsUnlocked(true);
        return;
      }

      event.preventDefault();
      openGate("navigate");
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [openGate]);

  useEffect(() => {
    if (pathname !== DEEP_CHATS_PATH) {
      setDeepChatsUnlocked(false);
      return;
    }

    if (answeredToday) {
      setDeepChatsUnlocked(true);
      setIsOpen(false);
      return;
    }

    if (!deepChatsUnlocked && !isOpen) {
      openGate("reveal");
    }
  }, [answeredToday, deepChatsUnlocked, isOpen, openGate, pathname]);

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove("fear-archive-open");
      return;
    }

    document.body.classList.add("fear-archive-open");
    return () => {
      document.body.classList.remove("fear-archive-open");
    };
  }, [isOpen]);

  const loadingLine = useMemo(() => {
    return LOADING_LINES[loadingTextIndex % LOADING_LINES.length] ?? LOADING_LINES[0];
  }, [loadingTextIndex]);

  useEffect(() => {
    if (step !== "loading") {
      return;
    }

    setLoadingProgress(0);
    setLoadingTextIndex(0);
    const startedAt = performance.now();

    const lineTimer = window.setInterval(() => {
      setLoadingTextIndex((value) => value + 1);
    }, 280);

    const progressTimer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const pct = Math.min(100, Math.round((elapsed / ANALYSIS_DURATION_MS) * 100));
      setLoadingProgress(pct);
    }, 60);

    const doneTimer = window.setTimeout(() => {
      setLoadingProgress(100);
      setStep("result");
    }, ANALYSIS_DURATION_MS);

    return () => {
      window.clearInterval(lineTimer);
      window.clearInterval(progressTimer);
      window.clearTimeout(doneTimer);
    };
  }, [step]);

  const runArchiveAnalysis = useCallback(
    (fearId: FearId) => {
      const archive = readArchive();
      archive.total += 1;
      archive.counts[fearId] = (archive.counts[fearId] ?? 0) + 1;
      saveArchive(archive);
      saveDailyPassToday();
      setAnsweredToday(true);
      setAnalysisResult(computeResult(archive, fearId));
      setStep("loading");
    },
    [setAnalysisResult]
  );

  const onReveal = useCallback(() => {
    if (!selectedFear) {
      return;
    }
    runArchiveAnalysis(selectedFear);
  }, [runArchiveAnalysis, selectedFear]);

  const onRefuse = useCallback(() => {
    runArchiveAnalysis("IDK");
  }, [runArchiveAnalysis]);

  const onEnterChamber = useCallback(() => {
    setDeepChatsUnlocked(true);
    setIsOpen(false);
    if (gateMode === "navigate" && pathname !== DEEP_CHATS_PATH) {
      router.push(DEEP_CHATS_PATH);
    }
  }, [gateMode, pathname, router]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fear-archive-overlay" role="dialog" aria-modal="true" aria-labelledby="fear-archive-title">
      <section className="fear-archive-modal">
        <header className="fear-archive-header">
          <p className="fear-archive-badge">MADNESS ARCHIVE NODE</p>
          <h2 id="fear-archive-title">THE FEAR ARCHIVE v1.0</h2>
        </header>

        {step === "select" ? (
          <div className="fear-archive-screen">
            <p className="fear-archive-subtitle">
              Before entering the Deep Chats Chamber,
              <br />
              the wizard must record your deepest fear.
            </p>
            <p className="fear-archive-instructions">
              Choose ONE.
              <br />
              The archive prefers honesty.
              <br />
              But it has seen everything.
            </p>

            <fieldset className="fear-archive-list">
              <legend className="sr-only">Fear selection</legend>
              {FEAR_OPTIONS.filter((option) => option.id !== "IDK").map((option) => (
                <label key={option.id} className="fear-archive-item">
                  <input
                    type="radio"
                    name="fear-archive-choice"
                    value={option.id}
                    checked={selectedFear === option.id}
                    onChange={() => setSelectedFear(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="fear-archive-actions">
              <button type="button" className="fear-archive-btn fear-archive-btn--primary" onClick={onReveal} disabled={!selectedFear}>
                Reveal the Chamber
              </button>
              <button type="button" className="fear-archive-btn fear-archive-btn--secondary" onClick={onRefuse}>
                I refuse.
              </button>
            </div>
          </div>
        ) : null}

        {step === "loading" ? (
          <div className="fear-archive-screen">
            <h3 className="fear-archive-section-title">Consulting the Fear Archive…</h3>
            <p className="fear-archive-loading-line">{loadingLine}</p>
            <div className="fear-archive-progress-shell" aria-hidden="true">
              <div className="fear-archive-progress-fill" style={{ width: `${loadingProgress}%` }} />
            </div>
          </div>
        ) : null}

        {step === "result" && analysisResult ? (
          <div className="fear-archive-screen">
            <h3 className="fear-archive-section-title">ARCHIVE UPDATE</h3>
            <div className="fear-archive-stats">
              <p>
                Most common fear today:
                <br />
                <strong>
                  {fearMeta(analysisResult.mostCommon.id).statLabel} ({analysisResult.mostCommon.pct}%)
                </strong>
              </p>
              <p>
                Second place:
                <br />
                <strong>
                  {fearMeta(analysisResult.secondPlace.id).statLabel} ({analysisResult.secondPlace.pct}%)
                </strong>
              </p>
              <p>
                Least selected fear:
                <br />
                <strong>
                  {fearMeta(analysisResult.leastSelected.id).statLabel} ({analysisResult.leastSelected.pct}%)
                </strong>
              </p>
              <p>
                Sample size:
                <br />
                <strong>n = {analysisResult.sampleSize}</strong>
              </p>
              {analysisResult.sampleSize < 10 ? <p className="fear-archive-note">Archive note: Sample size is still pathetic.</p> : null}
            </div>

            <article className="fear-archive-response">
              <h4>Wizard Transmission</h4>
              <p>{analysisResult.response}</p>
            </article>

            <div className="fear-archive-actions fear-archive-actions--result">
              <button type="button" className="fear-archive-btn fear-archive-btn--primary" onClick={onEnterChamber}>
                Enter the Deep Chats Chamber
              </button>
              <p className="fear-archive-subtext">Try not to embarrass yourself.</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
