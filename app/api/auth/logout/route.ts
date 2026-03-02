import { clearSession } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  clearSession();
  return NextResponse.redirect(new URL('/login', req.url));
}
