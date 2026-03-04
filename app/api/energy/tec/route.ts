import { NextResponse } from "next/server";
import { getTecMonthlyFeed } from "@/lib/energyFeeds";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getTecMonthlyFeed();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
