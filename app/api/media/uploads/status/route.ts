import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMediaAssetByIdForViewer, getMediaAssetStatus } from "@/lib/media/upload-service";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId")?.trim() ?? "";
    if (!assetId) {
      return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
    }

    const asset = user.role === "admin" ? await getMediaAssetByIdForViewer(assetId) : await getMediaAssetStatus(assetId, user.id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("media upload status read failed", error);
    return NextResponse.json({ error: "Unable to read upload status." }, { status: 500 });
  }
}
