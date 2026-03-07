import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queueMediaReprocess } from "@/lib/media/upload-service";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { assetId } = await context.params;
    const id = assetId.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id,
        deletedAt: null
      },
      select: {
        id: true,
        uploaderId: true,
        scope: true,
        tourSlug: true
      }
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }

    if (user.role !== "admin" && asset.uploaderId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    queueMediaReprocess(asset.id);

    if (asset.scope === "TOUR" && asset.tourSlug) {
      revalidatePath(`/tours/${asset.tourSlug}`);
    }

    if (asset.scope === "MEME") {
      revalidatePath("/library");
    }

    revalidatePath("/admin");

    return NextResponse.json({ ok: true, status: "PROCESSING" });
  } catch (error) {
    console.error("media reprocess trigger failed", error);
    return NextResponse.json({ error: "Unable to reprocess media." }, { status: 500 });
  }
}
