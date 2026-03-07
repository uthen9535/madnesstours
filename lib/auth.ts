import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "madnessnet_session";
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS ?? 7);
const SESSION_STORAGE_MODE = (process.env.SESSION_STORAGE_MODE ?? "stateless").toLowerCase();
const GLOBAL_SITE_PASSWORD = process.env.GLOBAL_SITE_PASSWORD ?? "finnsbeachclub";
const GLOBAL_SITE_PIN = process.env.GLOBAL_SITE_PIN ?? "170017";
const SESSION_SECRET = process.env.SESSION_SECRET ?? `${GLOBAL_SITE_PASSWORD}-session-secret`;
const STATELESS_SESSION_PREFIX = "st";

type StatelessSessionPayload = {
  userId: string;
  exp: number;
};

function isDatabaseSessionStoreEnabled(): boolean {
  return SESSION_STORAGE_MODE === "db" || SESSION_STORAGE_MODE === "database";
}

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

export function verifyGlobalPin(pin: string): boolean {
  return /^\d{6}$/.test(pin) && pin === GLOBAL_SITE_PIN;
}

export async function hashGlobalPin(): Promise<string> {
  return hashPassword(GLOBAL_SITE_PIN);
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createStatelessSessionToken(userId: string, expiresAt: Date): string {
  const payload: StatelessSessionPayload = {
    userId,
    exp: expiresAt.getTime()
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", SESSION_SECRET).update(payloadEncoded).digest("base64url");

  return `${STATELESS_SESSION_PREFIX}.${payloadEncoded}.${signature}`;
}

function readStatelessSessionToken(token: string): StatelessSessionPayload | null {
  const [prefix, payloadEncoded, signature] = token.split(".");

  if (!prefix || !payloadEncoded || !signature || prefix !== STATELESS_SESSION_PREFIX) {
    return null;
  }

  const expectedSignature = createHmac("sha256", SESSION_SECRET).update(payloadEncoded).digest("base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8")) as
      | StatelessSessionPayload
      | undefined;

    if (!parsed?.userId || typeof parsed.exp !== "number") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  let cookieValue = createStatelessSessionToken(userId, expiresAt);

  if (isDatabaseSessionStoreEnabled()) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(rawToken);
    cookieValue = rawToken;

    try {
      await prisma.session.create({
        data: {
          tokenHash,
          userId,
          expiresAt
        }
      });
    } catch (error) {
      console.warn("Session DB write failed, falling back to stateless session cookie.", error);
      cookieValue = createStatelessSessionToken(userId, expiresAt);
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
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

  if (rawToken && !rawToken.startsWith(`${STATELESS_SESSION_PREFIX}.`)) {
    try {
      await prisma.session.deleteMany({
        where: {
          tokenHash: hashSessionToken(rawToken)
        }
      });
    } catch (error) {
      console.warn("Session DB delete failed.", error);
    }
  }

  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const statelessPayload = readStatelessSessionToken(rawToken);

  if (statelessPayload) {
    if (statelessPayload.exp <= Date.now()) {
      return null;
    }

    try {
      return await prisma.user.findUnique({
        where: {
          id: statelessPayload.userId
        }
      });
    } catch (error) {
      console.warn("User lookup for stateless session failed.", error);
      return null;
    }
  }

  let session: { expiresAt: Date; user: User } | null = null;

  try {
    session = await prisma.session.findUnique({
      where: {
        tokenHash: hashSessionToken(rawToken)
      },
      include: {
        user: true
      }
    });
  } catch (error) {
    console.warn("Session DB read failed.", error);
    return null;
  }

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      try {
        await prisma.session.deleteMany({
          where: {
            tokenHash: hashSessionToken(rawToken)
          }
        });
      } catch (error) {
        console.warn("Session cleanup failed.", error);
      }
    }
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
