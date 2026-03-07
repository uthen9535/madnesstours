const MAYHEM_PUNCH_PREFIX = "MAYHEM::";

export function encodeMayhemPunchLabel(rawLabel: string): string {
  const label = rawLabel.trim();
  return label ? `${MAYHEM_PUNCH_PREFIX}${label}` : "";
}

export function decodeMayhemPunchLabel(rawValue: string | null | undefined, tripSlug?: string): string {
  const value = (rawValue ?? "").trim();
  if (!value) {
    return "";
  }

  if (value.startsWith(MAYHEM_PUNCH_PREFIX)) {
    return value.slice(MAYHEM_PUNCH_PREFIX.length).trim();
  }

  // Legacy compatibility: Bali historically stored this value in badgeName directly.
  if (tripSlug === "madness-iii-bali") {
    return value;
  }

  return "";
}

