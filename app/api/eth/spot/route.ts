import { NextResponse } from "next/server";
import { getETHSpotSnapshot } from "@/lib/eth";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getETHSpotSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
