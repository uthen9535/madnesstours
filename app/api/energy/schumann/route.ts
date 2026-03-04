import { NextResponse } from "next/server";
import { getSchumannMonthlyFeed } from "@/lib/energyFeeds";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getSchumannMonthlyFeed();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
