import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeMediaUploadChunk } from "@/lib/media/upload-service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const sessionId = String(formData.get("sessionId") ?? "").trim();
    const chunkIndex = Number.parseInt(String(formData.get("chunkIndex") ?? ""), 10);
    const totalChunks = Number.parseInt(String(formData.get("totalChunks") ?? ""), 10);
    const chunk = formData.get("chunk");

    if (!sessionId || !(chunk instanceof File)) {
      return NextResponse.json({ error: "Invalid chunk payload." }, { status: 400 });
    }

    const bytes = Buffer.from(await chunk.arrayBuffer());
    const progress = await storeMediaUploadChunk({
      sessionId,
      uploaderId: user.id,
      chunkIndex,
      totalChunks,
      bytes
    });

    return NextResponse.json({
      ok: true,
      progress
    });
  } catch (error) {
    console.error("media upload chunk failed", error);
    const message = error instanceof Error ? error.message : "Unable to upload chunk.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
