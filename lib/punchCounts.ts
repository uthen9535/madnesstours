export type PunchKey = "madness" | "mayhem";

const PUNCH_META_PREFIX = "[punches:";

type PunchSets = {
  madnessTripIds: Set<string>;
  mayhemTripIds: Set<string>;
};

type PunchCountResult = {
  mad: number;
  may: number;
};

function getPunchSetsByUserId(map: Map<string, PunchSets>, userId: string): PunchSets {
  const existing = map.get(userId);
  if (existing) {
    return existing;
  }

  const created: PunchSets = {
    madnessTripIds: new Set<string>(),
    mayhemTripIds: new Set<string>()
  };
  map.set(userId, created);
  return created;
}

export function parsePunchSelectionFromMessage(message: string): Set<PunchKey> {
  const trimmed = message.trim();
  if (!trimmed.startsWith(PUNCH_META_PREFIX)) {
    return new Set<PunchKey>();
  }

  const closeIndex = trimmed.indexOf("]");
  if (closeIndex <= PUNCH_META_PREFIX.length) {
    return new Set<PunchKey>();
  }

  const valuesRaw = trimmed.slice(PUNCH_META_PREFIX.length, closeIndex);
  const selected = new Set<PunchKey>();
  valuesRaw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .forEach((value) => {
      if (value === "madness" || value === "mayhem") {
        selected.add(value);
      }
    });

  return selected;
}

export function buildPunchCountsByUserId(
  madnessPunchRows: Array<{ userId: string; tripId: string }>,
  tripLogRows: Array<{ userId: string; tripId: string | null; message: string }>
): Map<string, PunchCountResult> {
  const setsByUserId = new Map<string, PunchSets>();

  for (const row of madnessPunchRows) {
    const sets = getPunchSetsByUserId(setsByUserId, row.userId);
    sets.madnessTripIds.add(row.tripId);
  }

  for (const row of tripLogRows) {
    if (!row.tripId) {
      continue;
    }

    const selected = parsePunchSelectionFromMessage(row.message);
    if (selected.size === 0) {
      continue;
    }

    const sets = getPunchSetsByUserId(setsByUserId, row.userId);
    if (selected.has("madness")) {
      sets.madnessTripIds.add(row.tripId);
    }
    if (selected.has("mayhem")) {
      sets.mayhemTripIds.add(row.tripId);
    }
  }

  const countsByUserId = new Map<string, PunchCountResult>();
  for (const [userId, sets] of setsByUserId.entries()) {
    countsByUserId.set(userId, {
      mad: sets.madnessTripIds.size,
      may: sets.mayhemTripIds.size
    });
  }

  return countsByUserId;
}

export function formatPunchCounts(mad: number, may: number): string {
  return `${mad} MAD // ${may} MAY`;
}
