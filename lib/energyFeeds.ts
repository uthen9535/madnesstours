type FeedSource = "live" | "fallback";

export type KpDailyPoint = {
  date: string;
  day: number;
  maxKp: number | null;
  stormLabel: string | null;
};

export type KpTrendPoint = {
  timestamp: string;
  dayFraction: number;
  kp: number;
  rolling3h: number;
};

export type KpMonthlyFeed = {
  source: FeedSource;
  lastUpdated: string;
  feedUpdatedAt: string | null;
  currentKp: number;
  daily: KpDailyPoint[];
  trend: KpTrendPoint[];
};

export type SchumannMonthlyFeed = {
  source: FeedSource;
  lastUpdated: string;
  feedUpdatedAt: string | null;
  currentPower: number;
  monthlyIntensity: Array<{ date: string; day: number; avgPower: number | null }>;
  waveform: number[];
  spikeDetected: boolean;
};

export type TecMonthlyFeed = {
  source: FeedSource;
  lastUpdated: string;
  feedUpdatedAt: string | null;
  currentTec: number;
  monthlyDailyAvg: Array<{ date: string; day: number; avgTec: number | null }>;
  recentSixHours: Array<{ timestamp: string; tec: number }>;
};

type TimeValuePoint = {
  timestamp: string;
  value: number;
};

type CacheEntry<T> = {
  expiresAt: number;
  latest: T | null;
  lastGood: T | null;
};

const FEED_TIMEOUT_MS = 9000;
const KP_CACHE_MS = 60_000;
const SCHUMANN_CACHE_MS = 10 * 60_000;
const TEC_CACHE_MS = 5 * 60_000;

const cache = {
  kp: { expiresAt: 0, latest: null, lastGood: null } as CacheEntry<KpMonthlyFeed>,
  schumann: { expiresAt: 0, latest: null, lastGood: null } as CacheEntry<SchumannMonthlyFeed>,
  tec: { expiresAt: 0, latest: null, lastGood: null } as CacheEntry<TecMonthlyFeed>
};

function monthBounds(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { start, end, year, month, daysInMonth };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toIsoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeTimestamp(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return null;
  }
  const value = String(raw).trim();
  if (!value) {
    return null;
  }
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }
  return asDate.toISOString();
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function pickFromObject(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function movingAverage(points: number[], window: number) {
  if (!points.length) {
    return [];
  }

  const out: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j += 1) {
      sum += points[j] ?? 0;
      count += 1;
    }
    out.push(sum / Math.max(1, count));
  }
  return out;
}

function seededNoise(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

async function fetchJsonCandidate(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Feed request failed ${url} (${response.status})`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextCandidate(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Feed request failed ${url} (${response.status})`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function firstResolvedJson(candidates: string[]) {
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return await fetchJsonCandidate(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("No candidate feed resolved.");
}

function normalizeArrayRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const bucketKeys = ["data", "items", "rows", "results", "series", "observations"];
    for (const key of bucketKeys) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[];
      }
    }
  }

  return [];
}

function normalizeTimeSeries(
  payload: unknown,
  valueKeys: string[],
  timeKeys: string[] = ["time_tag", "timeTag", "timestamp", "time", "date", "datetime", "utc"]
): TimeValuePoint[] {
  const rows = normalizeArrayRows(payload);
  if (!rows.length) {
    return [];
  }

  const firstRow = rows[0];
  if (Array.isArray(firstRow) && firstRow.every((v) => typeof v === "string")) {
    const header = firstRow.map((item) => item.toLowerCase());
    const timeIndex = header.findIndex((column) => timeKeys.some((key) => column.includes(key.toLowerCase())));
    const valueIndex = header.findIndex((column) => valueKeys.some((key) => column.includes(key.toLowerCase())));
    if (timeIndex >= 0 && valueIndex >= 0) {
      const out: TimeValuePoint[] = [];
      for (const row of rows.slice(1)) {
        if (!Array.isArray(row)) {
          continue;
        }
        const timestamp = normalizeTimestamp(row[timeIndex]);
        const value = toNumber(row[valueIndex]);
        if (!timestamp || value === null) {
          continue;
        }
        out.push({ timestamp, value });
      }
      return out.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    }
  }

  const out: TimeValuePoint[] = [];
  for (const row of rows) {
    if (Array.isArray(row)) {
      if (row.length < 2) {
        continue;
      }
      const timestamp = normalizeTimestamp(row[0]);
      const value = toNumber(row[1]);
      if (!timestamp || value === null) {
        continue;
      }
      out.push({ timestamp, value });
      continue;
    }

    if (!row || typeof row !== "object") {
      continue;
    }

    const record = row as Record<string, unknown>;
    const timestampRaw = pickFromObject(record, timeKeys);
    const valueRaw = pickFromObject(record, valueKeys);
    const timestamp = normalizeTimestamp(timestampRaw);
    const value = toNumber(valueRaw);
    if (!timestamp || value === null) {
      continue;
    }
    out.push({ timestamp, value });
  }

  return out.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function stormLabelForKp(kp: number) {
  if (kp >= 9) return "G5";
  if (kp >= 8) return "G4";
  if (kp >= 7) return "G3";
  if (kp >= 6) return "G2";
  if (kp >= 5) return "G1";
  return null;
}

function buildKpFallback(now = new Date()): KpMonthlyFeed {
  const { start, daysInMonth } = monthBounds(now);
  const currentDay = now.getUTCDate();
  const daily: KpDailyPoint[] = [];
  const trend: KpTrendPoint[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
    const base = 2.2 + Math.sin(day / 2.8) * 1.1 + seededNoise(day * 3.9) * 1.8;
    const value = clamp(Number(base.toFixed(2)), 0, 9);
    daily.push({
      date: toIsoDay(dayDate),
      day,
      maxKp: day <= currentDay ? Number(value.toFixed(1)) : null,
      stormLabel: value >= 5 ? stormLabelForKp(value) : null
    });
  }

  for (let hour = 0; hour <= 24 * currentDay; hour += 3) {
    const ts = new Date(start.getTime() + hour * 60 * 60 * 1000);
    const dayFloat = ts.getUTCDate() - 1 + ts.getUTCHours() / 24;
    const base = 2 + Math.sin(hour / 7) * 1.2 + seededNoise(hour * 2.7) * 1.4;
    const kp = clamp(Number(base.toFixed(2)), 0, 9);
    trend.push({
      timestamp: ts.toISOString(),
      dayFraction: dayFloat,
      kp,
      rolling3h: kp
    });
  }

  const currentKp = trend[trend.length - 1]?.kp ?? 2.2;
  return {
    source: "fallback",
    lastUpdated: now.toISOString(),
    feedUpdatedAt: now.toISOString(),
    currentKp,
    daily,
    trend
  };
}

function materializeKp(points: TimeValuePoint[], now = new Date()): KpMonthlyFeed {
  const { start, end, daysInMonth, month, year } = monthBounds(now);
  const inMonth = points.filter((point) => {
    const ts = Date.parse(point.timestamp);
    return ts >= start.getTime() && ts < end.getTime();
  });

  if (!inMonth.length) {
    return buildKpFallback(now);
  }

  const dailyMap = new Map<number, number>();
  const hourly = new Map<string, number[]>();

  for (const point of inMonth) {
    const date = new Date(point.timestamp);
    const day = date.getUTCDate();
    const prev = dailyMap.get(day);
    if (prev === undefined || point.value > prev) {
      dailyMap.set(day, point.value);
    }

    const hourKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}`;
    const bucket = hourly.get(hourKey) ?? [];
    bucket.push(point.value);
    hourly.set(hourKey, bucket);
  }

  const daily: KpDailyPoint[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    const max = dailyMap.get(day);
    const normalized = max === undefined ? null : Number(clamp(max, 0, 9).toFixed(1));
    daily.push({
      date: toIsoDay(date),
      day,
      maxKp: normalized,
      stormLabel: normalized !== null ? stormLabelForKp(normalized) : null
    });
  }

  const hourlyPoints = Array.from(hourly.entries())
    .map(([key, values]) => {
      const [y, m, d, h] = key.split("-").map((part) => Number(part));
      const timestamp = new Date(Date.UTC(y, m, d, h)).toISOString();
      const kp = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
      return { timestamp, kp };
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const smooth = movingAverage(hourlyPoints.map((point) => point.kp), 3);
  const trend = hourlyPoints.map((point, index) => {
    const date = new Date(point.timestamp);
    const dayFraction = date.getUTCDate() - 1 + date.getUTCHours() / 24;
    return {
      timestamp: point.timestamp,
      dayFraction,
      kp: Number(clamp(point.kp, 0, 9).toFixed(2)),
      rolling3h: Number(clamp(smooth[index] ?? point.kp, 0, 9).toFixed(2))
    };
  });

  const latest = inMonth[inMonth.length - 1];
  return {
    source: "live",
    lastUpdated: now.toISOString(),
    feedUpdatedAt: latest?.timestamp ?? now.toISOString(),
    currentKp: Number(clamp(latest?.value ?? 0, 0, 9).toFixed(2)),
    daily,
    trend
  };
}

async function fetchKpFeed(now = new Date()) {
  const primary = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";
  const backup = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

  try {
    const payload = await firstResolvedJson([primary, backup]);
    const points = normalizeTimeSeries(payload, [
      "kp_index",
      "kp",
      "planetary_k_index",
      "k_index",
      "k"
    ]);
    return materializeKp(points, now);
  } catch {
    return buildKpFallback(now);
  }
}

function synthMonthlySeries(now: Date, base: number, amplitude: number, jitterSeed = 1) {
  const { start, daysInMonth } = monthBounds(now);
  const points: Array<{ date: string; day: number; value: number }> = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
    const wave = Math.sin(day / 3.8) * amplitude;
    const noise = (seededNoise(day * jitterSeed) - 0.5) * amplitude * 0.35;
    points.push({
      date: toIsoDay(date),
      day,
      value: Number((base + wave + noise).toFixed(3))
    });
  }
  return points;
}

function buildSchumannFallback(now = new Date()): SchumannMonthlyFeed {
  const monthly = synthMonthlySeries(now, 12, 4.4, 5.1);
  const waveform = Array.from({ length: 240 }, (_, index) => {
    const theta = index / 17;
    const v = Math.sin(theta) * 0.52 + Math.sin(theta * 2.8) * 0.18 + (seededNoise(index * 1.7) - 0.5) * 0.1;
    return Number(v.toFixed(4));
  });
  const currentPower = monthly[Math.max(0, now.getUTCDate() - 1)]?.value ?? 12;
  return {
    source: "fallback",
    lastUpdated: now.toISOString(),
    feedUpdatedAt: now.toISOString(),
    currentPower: Number(currentPower.toFixed(3)),
    monthlyIntensity: monthly.map((point) => ({
      date: point.date,
      day: point.day,
      avgPower: point.value
    })),
    waveform,
    spikeDetected: false
  };
}

function materializeSchumann(points: TimeValuePoint[], now = new Date()): SchumannMonthlyFeed {
  const { start, end, daysInMonth } = monthBounds(now);
  const inMonth = points.filter((point) => {
    const ts = Date.parse(point.timestamp);
    return ts >= start.getTime() && ts < end.getTime();
  });
  if (!inMonth.length) {
    return buildSchumannFallback(now);
  }

  const dayBuckets = new Map<number, number[]>();
  for (const point of inMonth) {
    const day = new Date(point.timestamp).getUTCDate();
    const bucket = dayBuckets.get(day) ?? [];
    bucket.push(point.value);
    dayBuckets.set(day, bucket);
  }

  const monthlyIntensity = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const samples = dayBuckets.get(day) ?? [];
    const avg =
      samples.length > 0
        ? Number((samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length)).toFixed(3))
        : null;
    return {
      date: toIsoDay(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day))),
      day,
      avgPower: avg
    };
  });

  const recent = inMonth.slice(-240);
  const values = recent.map((point) => point.value);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const latest = recent[recent.length - 1];
  const latestValue = latest?.value ?? mean;
  const spikeDetected = latestValue >= mean * 1.28;

  const waveform = recent.map((point) => {
    const centered = point.value - mean;
    return Number((centered / Math.max(0.5, mean)).toFixed(4));
  });

  return {
    source: "live",
    lastUpdated: now.toISOString(),
    feedUpdatedAt: latest?.timestamp ?? now.toISOString(),
    currentPower: Number(latestValue.toFixed(3)),
    monthlyIntensity,
    waveform: waveform.length ? waveform : [0],
    spikeDetected
  };
}

async function fetchSchumannFeed(now = new Date()) {
  const candidates = [
    "https://www.heartmath.org/gci/gcms/live-data/gcms-magnetometer/gcms-magnetometer-data.json",
    "https://www.heartmath.org/gci/gcms/live-data/gcms-magnetometer/data.json",
    "https://www.heartmath.org/gci/gcms/live-data/gcms-magnetometer/gcms-data.json",
    "https://www.heartmath.org/gci/gcms/live-data/gcms-magnetometer/magnetometer.json"
  ];

  try {
    const payload = await firstResolvedJson(candidates);
    const points = normalizeTimeSeries(payload, [
      "power",
      "amplitude",
      "resonance",
      "value",
      "intensity",
      "magnetometer"
    ]);
    return materializeSchumann(points, now);
  } catch {
    return buildSchumannFallback(now);
  }
}

function buildTecFallback(now = new Date()): TecMonthlyFeed {
  const monthly = synthMonthlySeries(now, 19, 5.2, 2.4);
  const recentSixHours: Array<{ timestamp: string; tec: number }> = [];
  const startTs = now.getTime() - 6 * 60 * 60 * 1000;
  for (let i = 0; i <= 72; i += 1) {
    const ts = new Date(startTs + i * 5 * 60 * 1000);
    const val = 19 + Math.sin(i / 6.5) * 4.2 + (seededNoise(i * 4.4) - 0.5) * 1.8;
    recentSixHours.push({
      timestamp: ts.toISOString(),
      tec: Number(clamp(val, 0, 80).toFixed(2))
    });
  }

  return {
    source: "fallback",
    lastUpdated: now.toISOString(),
    feedUpdatedAt: now.toISOString(),
    currentTec: recentSixHours[recentSixHours.length - 1]?.tec ?? 18,
    monthlyDailyAvg: monthly.map((point) => ({
      date: point.date,
      day: point.day,
      avgTec: Number(clamp(point.value, 0, 80).toFixed(2))
    })),
    recentSixHours
  };
}

function materializeTec(points: TimeValuePoint[], now = new Date()): TecMonthlyFeed {
  const { start, end, daysInMonth } = monthBounds(now);
  const inMonth = points.filter((point) => {
    const ts = Date.parse(point.timestamp);
    return ts >= start.getTime() && ts < end.getTime();
  });
  if (!inMonth.length) {
    return buildTecFallback(now);
  }

  const dayBuckets = new Map<number, number[]>();
  for (const point of inMonth) {
    const day = new Date(point.timestamp).getUTCDate();
    const bucket = dayBuckets.get(day) ?? [];
    bucket.push(point.value);
    dayBuckets.set(day, bucket);
  }

  const monthlyDailyAvg = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const samples = dayBuckets.get(day) ?? [];
    const avg =
      samples.length > 0
        ? Number((samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length)).toFixed(2))
        : null;
    return {
      date: toIsoDay(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day))),
      day,
      avgTec: avg
    };
  });

  const sixHoursAgo = now.getTime() - 6 * 60 * 60 * 1000;
  const recentSixHours = inMonth
    .filter((point) => Date.parse(point.timestamp) >= sixHoursAgo)
    .slice(-180)
    .map((point) => ({
      timestamp: point.timestamp,
      tec: Number(clamp(point.value, 0, 200).toFixed(2))
    }));

  const latest = inMonth[inMonth.length - 1];
  return {
    source: "live",
    lastUpdated: now.toISOString(),
    feedUpdatedAt: latest?.timestamp ?? now.toISOString(),
    currentTec: Number(clamp(latest?.value ?? 0, 0, 200).toFixed(2)),
    monthlyDailyAvg,
    recentSixHours
  };
}

async function fetchTecFeed(now = new Date()) {
  // Preferred machine-readable products; fallback remains synthetic but live-updating.
  const jsonCandidates = [
    "https://gdgps.jpl.nasa.gov/products/tec-maps.json",
    "https://gdgps.jpl.nasa.gov/products/tec/tec.json",
    "https://gdgps.jpl.nasa.gov/products/tec/current_tec.json"
  ];

  try {
    const payload = await firstResolvedJson(jsonCandidates);
    const points = normalizeTimeSeries(payload, [
      "tec",
      "vtec",
      "value",
      "total_electron_content",
      "electron_content"
    ]);
    return materializeTec(points, now);
  } catch {
    try {
      const textPayload = await fetchTextCandidate("https://gdgps.jpl.nasa.gov/products/tec-maps.html");
      const match = textPayload.match(/https?:\/\/[^"'\\s>]+(?:tec|vtec)[^"'\\s>]+\.(?:json|csv|txt)/gi) ?? [];

      for (const candidate of match) {
        try {
          if (candidate.endsWith(".json")) {
            const payload = await fetchJsonCandidate(candidate);
            const points = normalizeTimeSeries(payload, [
              "tec",
              "vtec",
              "value",
              "total_electron_content",
              "electron_content"
            ]);
            if (points.length) {
              return materializeTec(points, now);
            }
          } else {
            const text = await fetchTextCandidate(candidate);
            const rows = text
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const parts = line.split(/[,\t;]+/);
                if (parts.length < 2) {
                  return null;
                }
                const timestamp = normalizeTimestamp(parts[0]);
                const value = toNumber(parts[1]);
                if (!timestamp || value === null) {
                  return null;
                }
                return { timestamp, value };
              })
              .filter((row): row is TimeValuePoint => row !== null);
            if (rows.length) {
              return materializeTec(rows, now);
            }
          }
        } catch {
          // Try the next discovered candidate.
        }
      }
    } catch {
      // Ignore and fallback below.
    }

    return buildTecFallback(now);
  }
}

async function readCached<T>(entry: CacheEntry<T>, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (entry.latest && now < entry.expiresAt) {
    return entry.latest;
  }

  try {
    const data = await loader();
    entry.latest = data;
    entry.lastGood = data;
    entry.expiresAt = now + ttlMs;
    return data;
  } catch {
    if (entry.lastGood) {
      entry.latest = entry.lastGood;
      entry.expiresAt = now + Math.min(ttlMs, 60_000);
      return entry.lastGood;
    }
    throw new Error("Feed loader failed and no cached data is available.");
  }
}

export async function getKpMonthlyFeed() {
  return readCached(cache.kp, KP_CACHE_MS, async () => fetchKpFeed(new Date()));
}

export async function getSchumannMonthlyFeed() {
  return readCached(cache.schumann, SCHUMANN_CACHE_MS, async () => fetchSchumannFeed(new Date()));
}

export async function getTecMonthlyFeed() {
  return readCached(cache.tec, TEC_CACHE_MS, async () => fetchTecFeed(new Date()));
}
