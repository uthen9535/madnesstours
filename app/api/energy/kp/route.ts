import { NextResponse } from "next/server";
import { getKpMonthlyFeed } from "@/lib/energyFeeds";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getKpMonthlyFeed();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
