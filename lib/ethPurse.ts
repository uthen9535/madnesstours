const ETH_UNITS_PER_ETH = 100_000_000;

export function parseEthUnitsToBase(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const units = Number(normalized);
  if (!Number.isFinite(units) || units <= 0) {
    return null;
  }

  const baseUnits = Math.round(units * ETH_UNITS_PER_ETH);
  if (!Number.isSafeInteger(baseUnits) || baseUnits < 1) {
    return null;
  }

  return baseUnits;
}

export function formatEthUnitsFromBase(baseUnits: number): string {
  const units = baseUnits / ETH_UNITS_PER_ETH;
  return units.toFixed(8).replace(/\.?0+$/, "");
}

export { ETH_UNITS_PER_ETH };
