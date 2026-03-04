import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import {
  getLatestSystemAttackBroadcast,
  issueSystemAttackBroadcast,
  type SystemAttackBroadcastEvent
} from "@/lib/systemAttackBroadcast";
import { type BreachMode } from "@/lib/shortwaveTransmissions";

function noStoreJson(payload: { event: SystemAttackBroadcastEvent | null }, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}

function isBreachMode(value: unknown): value is BreachMode {
  return value === "military" || value === "et" || value === "member";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sinceRaw = Number(searchParams.get("since") ?? "");
  const since = Number.isFinite(sinceRaw) ? sinceRaw : undefined;

  const event = await getLatestSystemAttackBroadcast(since);
  return noStoreJson({ event });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.admin) {
    return noStoreJson({ event: null }, 403);
  }

  let mode: unknown = null;
  try {
    const body = (await request.json()) as { mode?: unknown };
    mode = body.mode;
  } catch {
    return noStoreJson({ event: null }, 400);
  }

  if (!isBreachMode(mode)) {
    return noStoreJson({ event: null }, 400);
  }

  const event = await issueSystemAttackBroadcast(mode, user.username);
  return noStoreJson({ event });
}
