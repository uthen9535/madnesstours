import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './prisma';

const COOKIE_NAME = 'madnessnet_session';
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret');

type SessionPayload = { userId: number; role: 'ADMIN' | 'MEMBER'; username: string };

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
  cookies().set(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export function clearSession() {
  cookies().set(COOKIE_NAME, '', { expires: new Date(0), path: '/' });
}

export async function getSession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secret);
    return verified.payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  return user;
}
