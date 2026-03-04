import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const pinUpdateSchema = z.object({
  userId: z.string().min(1),
  customPin: z.string().regex(/^\d{6}$/)
});

function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

async function parseRequestPayload(request: Request, json: boolean) {
  if (json) {
    try {
      const payload = await request.json();
      return {
        userId: payload?.userId,
        customPin: payload?.customPin
      };
    } catch {
      return null;
    }
  }

  try {
    const formData = await request.formData();
    return {
      userId: formData.get("userId"),
      customPin: formData.get("customPin")
    };
  } catch {
    return null;
  }
}

function responseForFailure(request: Request, json: boolean, status: number, error: string) {
  if (json) {
    return NextResponse.json({ error }, { status });
  }

  const redirectUrl = new URL("/guestbook", request.url);
  redirectUrl.searchParams.set("pinError", error);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

export async function POST(request: Request) {
  try {
    const json = isJsonRequest(request);
    const actor = await getCurrentUser();

    if (!actor) {
      return responseForFailure(request, json, 401, "Unauthorized");
    }

    const payload = await parseRequestPayload(request, json);
    const parsed = pinUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return responseForFailure(request, json, 400, "PIN must be 6 digits");
    }

    const { userId, customPin } = parsed.data;
    const canEdit = actor.role === Role.admin || actor.id === userId;
    if (!canEdit) {
      return responseForFailure(request, json, 403, "Forbidden");
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!target) {
      return responseForFailure(request, json, 404, "User not found");
    }

    const passwordHash = await hashPassword(customPin);
    const forcePinResetPrompt = actor.role === Role.admin && actor.id !== userId;

    await prisma.user.update({
      where: { id: userId },
      data: {
        pin: customPin,
        passwordHash,
        pinResetComplete: forcePinResetPrompt ? false : true
      }
    });

    if (json) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.redirect(new URL("/guestbook", request.url), { status: 303 });
  } catch (error) {
    console.error("PIN update failed.", error);
    return responseForFailure(request, isJsonRequest(request), 500, "Unable to update pin right now");
  }
}
