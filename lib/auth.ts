import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "madnessnet_session";
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS ?? 7);
const GLOBAL_SITE_PASSWORD = process.env.GLOBAL_SITE_PASSWORD ?? "finnsbeachclub";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function verifyGlobalPassword(password: string): boolean {
  return password === GLOBAL_SITE_PASSWORD;
}

export async function hashGlobalPassword(): Promise<string> {
  return hashPassword(GLOBAL_SITE_PASSWORD);
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(COOKIE_NAME)?.value;

  if (rawToken) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(rawToken)
      }
    });
  }

  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(rawToken)
    },
    include: {
      user: true
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return session.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== Role.admin) {
    redirect("/home");
  }
  return user;
}
