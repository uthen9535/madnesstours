export const SATS_PER_BTC = 100_000_000;

export function parseBtcUnitsToSats(input: string): number | null {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const units = Number(normalized);
  if (!Number.isFinite(units) || units <= 0) {
    return null;
  }

  const sats = Math.round(units * SATS_PER_BTC);
  if (!Number.isSafeInteger(sats) || sats < 1) {
    return null;
  }

  return sats;
}

export function formatBtcUnitsFromSats(sats: number): string {
  const units = sats / SATS_PER_BTC;
  return units.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8
  });
}
