import { randomBytes } from "crypto";
import {
  ET_TRANSMISSIONS,
  MEMBER_SCENARIOS,
  MILITARY_TRANSMISSIONS,
  pickNonRepeatingIndex,
  transmissionAudioSrc,
  type BreachMode
} from "@/lib/shortwaveTransmissions";

export type SystemAttackBroadcastEvent = {
  id: string;
  mode: BreachMode;
  message: string;
  index: number;
  audioSrc: string;
  createdAt: number;
  emitterUsername: string;
};

const MODE_POOL: Record<BreachMode, readonly string[]> = {
  military: MILITARY_TRANSMISSIONS,
  et: ET_TRANSMISSIONS,
  member: MEMBER_SCENARIOS
};

const lastIndexByMode: Record<BreachMode, number | null> = {
  military: null,
  et: null,
  member: null
};

let latestEvent: SystemAttackBroadcastEvent | null = null;

function createId() {
  return randomBytes(12).toString("hex");
}

export function issueSystemAttackBroadcast(mode: BreachMode, emitterUsername: string): SystemAttackBroadcastEvent {
  const pool = MODE_POOL[mode];
  const index = pickNonRepeatingIndex(pool.length, lastIndexByMode[mode]);
  lastIndexByMode[mode] = index;

  const event: SystemAttackBroadcastEvent = {
    id: createId(),
    mode,
    message: pool[index] ?? pool[0] ?? "Signal corruption detected.",
    index,
    audioSrc: transmissionAudioSrc(mode, index),
    createdAt: Date.now(),
    emitterUsername: emitterUsername.toLowerCase()
  };

  latestEvent = event;
  return event;
}

export function getLatestSystemAttackBroadcast(since?: number): SystemAttackBroadcastEvent | null {
  if (!latestEvent) {
    return null;
  }

  if (typeof since === "number" && Number.isFinite(since) && latestEvent.createdAt <= since) {
    return null;
  }

  return latestEvent;
}
