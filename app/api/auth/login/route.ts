import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const form = await req.formData();
  const username = String(form.get('username') || '');
  const password = String(form.get('password') || '');
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.redirect(new URL('/login?error=1', req.url));
  }
  await createSession({ userId: user.id, role: user.role, username: user.username });
  return NextResponse.redirect(new URL('/home', req.url));
}
