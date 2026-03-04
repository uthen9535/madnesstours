import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const pinResetSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  confirmPin: z.string().regex(/^\d{6}$/)
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = pinResetSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "PIN must be 6 digits" }, { status: 400 });
    }

    const { pin, confirmPin } = parsed.data;
    if (pin !== confirmPin) {
      return NextResponse.json({ error: "PIN confirmation does not match" }, { status: 400 });
    }

    const passwordHash = await hashPassword(pin);
    const result = await prisma.user.updateMany({
      where: { id: user.id },
      data: {
        passwordHash,
        pin,
        pinResetComplete: true
      }
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Unable to update PIN right now" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "Unable to update PIN right now" }, { status: 500 });
    }
    console.error("PIN reset failed.", error);
    return NextResponse.json({ error: "Unable to update pin right now" }, { status: 500 });
  }
}
