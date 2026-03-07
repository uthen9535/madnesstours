import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { finalizeMediaUploadSession } from "@/lib/media/upload-service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as { sessionId?: string } | null;
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session id." }, { status: 400 });
    }

    const result = await finalizeMediaUploadSession({
      sessionId,
      uploaderId: user.id
    });

    return NextResponse.json({
      ok: true,
      assetId: result.assetId,
      status: "PROCESSING"
    });
  } catch (error) {
    console.error("media upload finalize failed", error);
    const message = error instanceof Error ? error.message : "Unable to finalize upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
