import { MediaAssetScope } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { LIBRARY_MEME_PREFIX } from "@/lib/libraryMemes";
import { deleteMediaAsset } from "@/lib/media/upload-service";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request, context: { params: Promise<{ memeId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { memeId } = await context.params;
    const id = memeId.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing meme id." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const source = String(searchParams.get("source") ?? "").trim().toLowerCase();
    if (source !== "asset" && source !== "legacy") {
      return NextResponse.json({ error: "Missing or invalid source." }, { status: 400 });
    }

    if (source === "asset") {
      const asset = await prisma.mediaAsset.findFirst({
        where: {
          id,
          scope: MediaAssetScope.MEME,
          scopeRef: "library",
          deletedAt: null
        },
        select: {
          id: true,
          uploaderId: true
        }
      });

      if (!asset) {
        return NextResponse.json({ error: "Meme not found." }, { status: 404 });
      }

      if (user.role !== "admin" && asset.uploaderId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await deleteMediaAsset(asset.id);
      revalidatePath("/library");
      revalidatePath("/admin");
      return NextResponse.json({ ok: true });
    }

    const legacy = await prisma.mediaItem.findFirst({
      where: {
        id,
        tripId: null,
        title: {
          startsWith: LIBRARY_MEME_PREFIX
        }
      },
      select: {
        id: true,
        uploadedById: true
      }
    });

    if (!legacy) {
      return NextResponse.json({ error: "Meme not found." }, { status: 404 });
    }

    if (user.role !== "admin" && legacy.uploadedById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.mediaItem.delete({
      where: {
        id: legacy.id
      }
    });

    revalidatePath("/library");
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("library meme delete failed", error);
    return NextResponse.json({ error: "Unable to delete meme." }, { status: 500 });
  }
}
