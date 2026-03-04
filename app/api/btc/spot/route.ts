import { NextResponse } from "next/server";
import { getBTCSpotSnapshot } from "@/lib/btc";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getBTCSpotSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
