import { MediaType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createMediaUploadSession } from "@/lib/media/upload-service";
import { toUploadScope } from "@/lib/media/shared";
import { prisma } from "@/lib/prisma";

const MEDIA_FOLDER_MARKER_PREFIX = "folder://";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as
      | {
          scope?: string;
          scopeRef?: string;
          filename?: string;
          mimeType?: string;
          fileSizeBytes?: number;
          title?: string;
          description?: string;
          chunkSizeBytes?: number;
        }
      | null;

    const scope = toUploadScope(payload?.scope);
    const scopeRef = typeof payload?.scopeRef === "string" ? payload.scopeRef.trim() : "";
    const filename = typeof payload?.filename === "string" ? payload.filename : "";
    const mimeType = typeof payload?.mimeType === "string" ? payload.mimeType : "application/octet-stream";
    const fileSizeBytes = Number(payload?.fileSizeBytes ?? 0);
    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    const description = typeof payload?.description === "string" ? payload.description.trim() : "";
    const chunkSizeBytes = Number(payload?.chunkSizeBytes ?? 0);

    if (!scope || !filename || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
      return NextResponse.json({ error: "Invalid upload init payload." }, { status: 400 });
    }

    let tripId: string | null = null;
    let tourSlug: string | null = null;
    let normalizedScopeRef: string | null = scopeRef || null;

    if (scope === "TOUR") {
      if (!scopeRef) {
        return NextResponse.json({ error: "Tour slug is required." }, { status: 400 });
      }

      const trip = await prisma.trip.findFirst({
        where: {
          slug: scopeRef,
          published: true
        },
        select: {
          id: true,
          slug: true
        }
      });

      if (!trip) {
        return NextResponse.json({ error: "Tour not found." }, { status: 404 });
      }

      const marker = await prisma.mediaItem.findFirst({
        where: {
          tripId: trip.id,
          uploadedById: user.id,
          type: MediaType.OTHER,
          url: `${MEDIA_FOLDER_MARKER_PREFIX}${user.id}`
        },
        select: {
          id: true
        }
      });

      if (!marker) {
        return NextResponse.json({ error: "Create your member folder before uploading to this tour." }, { status: 400 });
      }

      tripId = trip.id;
      tourSlug = trip.slug;
      normalizedScopeRef = trip.slug;
    }

    if (scope === "MEME" && !normalizedScopeRef) {
      normalizedScopeRef = "library";
    }

    const session = await createMediaUploadSession({
      uploaderId: user.id,
      scope,
      scopeRef: normalizedScopeRef,
      tripId,
      tourSlug,
      filename,
      mimeType,
      fileSizeBytes,
      title: title || null,
      description: description || null,
      chunkSizeBytes: Number.isFinite(chunkSizeBytes) && chunkSizeBytes > 0 ? chunkSizeBytes : undefined
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error("media upload init failed", error);
    const message = error instanceof Error ? error.message : "Unable to start media upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
