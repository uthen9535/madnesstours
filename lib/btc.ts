export type BTCSnapshot = {
  blockHeight: number;
  usdPrice: number;
  source: "live" | "fallback";
  updatedAt: string;
};

export type BTCSpotSnapshot = {
  usdPrice: number;
  source: "live" | "fallback";
  updatedAt: string;
};

export type BTCPricePoint = {
  timestamp: string;
  usdPrice: number;
};

export type BTCWeeklySnapshot = {
  points: BTCPricePoint[];
  source: "live" | "fallback";
  updatedAt: string;
};

const FALLBACK: BTCSnapshot = {
  blockHeight: 888888,
  usdPrice: 64000,
  source: "fallback",
  updatedAt: new Date(0).toISOString()
};
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchBlockHeight(): Promise<number> {
  const response = await fetch("https://blockchain.info/q/getblockcount", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to fetch BTC block height.");
  }

  const value = await response.text();
  return Number(value);
}

async function fetchPrice(): Promise<number> {
  const response = await fetch("https://api.coinbase.com/v2/prices/spot?currency=USD", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to fetch BTC price.");
  }

  const data = (await response.json()) as { data?: { amount?: string } };
  return Number(data.data?.amount);
}

function buildFallbackWeeklyPoints(usdPrice: number, referenceTime: number): BTCPricePoint[] {
  const points: BTCPricePoint[] = [];
  const validPrice = Number.isFinite(usdPrice) && usdPrice > 0 ? usdPrice : FALLBACK.usdPrice;

  for (let dayOffset = 7; dayOffset >= 0; dayOffset -= 1) {
    points.push({
      timestamp: new Date(referenceTime - dayOffset * 24 * 60 * 60 * 1000).toISOString(),
      usdPrice: validPrice
    });
  }

  return points;
}

async function fetchWeeklyPrices(referenceTime: number): Promise<BTCPricePoint[]> {
  const startIso = new Date(referenceTime - WEEK_MS).toISOString();
  const endIso = new Date(referenceTime).toISOString();
  const params = new URLSearchParams({
    granularity: "3600",
    start: startIso,
    end: endIso
  });

  const response = await fetch(`https://api.exchange.coinbase.com/products/BTC-USD/candles?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to fetch BTC weekly candles.");
  }

  const payload = (await response.json()) as number[][];
  const points = payload
    .filter((entry) => Array.isArray(entry) && entry.length >= 5)
    .map((entry) => ({
      timestamp: new Date(entry[0] * 1000).toISOString(),
      usdPrice: Number(entry[4])
    }))
    .filter((point) => Number.isFinite(point.usdPrice) && point.usdPrice > 0)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  if (points.length === 0) {
    throw new Error("No BTC weekly candle data.");
  }

  return points;
}

export async function getBTCSpotSnapshot(): Promise<BTCSpotSnapshot> {
  try {
    const usdPrice = await fetchPrice();
    if (Number.isNaN(usdPrice) || usdPrice <= 0) {
      return {
        usdPrice: FALLBACK.usdPrice,
        source: "fallback",
        updatedAt: new Date().toISOString()
      };
    }

    return {
      usdPrice,
      source: "live",
      updatedAt: new Date().toISOString()
    };
  } catch {
    return {
      usdPrice: FALLBACK.usdPrice,
      source: "fallback",
      updatedAt: new Date().toISOString()
    };
  }
}

export async function getBTCWeeklySnapshot(): Promise<BTCWeeklySnapshot> {
  const now = Date.now();
  const spot = await getBTCSpotSnapshot();

  try {
    const candles = await fetchWeeklyPrices(now);
    const merged = [...candles];
    const lastCandle = merged[merged.length - 1];

    if (!lastCandle || Date.parse(spot.updatedAt) > Date.parse(lastCandle.timestamp)) {
      merged.push({ timestamp: spot.updatedAt, usdPrice: spot.usdPrice });
    }

    const deduped = Array.from(
      new Map(merged.map((point) => [point.timestamp, point] as const)).values()
    ).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    const weekStart = now - WEEK_MS;
    const weeklyPoints = deduped.filter((point) => Date.parse(point.timestamp) >= weekStart);

    if (weeklyPoints.length === 0) {
      throw new Error("No filtered BTC weekly points.");
    }

    return {
      points: weeklyPoints,
      source: spot.source,
      updatedAt: spot.updatedAt
    };
  } catch {
    return {
      points: buildFallbackWeeklyPoints(spot.usdPrice, now),
      source: "fallback",
      updatedAt: spot.updatedAt
    };
  }
}

export async function getBTCSnapshot(): Promise<BTCSnapshot> {
  try {
    const [blockHeight, usdPrice] = await Promise.all([fetchBlockHeight(), fetchPrice()]);

    if (Number.isNaN(blockHeight) || Number.isNaN(usdPrice)) {
      return FALLBACK;
    }

    return {
      blockHeight,
      usdPrice,
      source: "live",
      updatedAt: new Date().toISOString()
    };
  } catch {
    return {
      ...FALLBACK,
      updatedAt: new Date().toISOString()
    };
  }
}
