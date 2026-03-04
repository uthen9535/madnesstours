import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withSqliteRetry } from "@/lib/sqliteRetry";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await withSqliteRetry(() =>
      prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() }
      })
    );
  } catch (error) {
    console.error("Presence heartbeat failed.", error);
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
