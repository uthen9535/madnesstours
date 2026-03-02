import { requireUser } from './auth';
import { redirect } from 'next/navigation';

export async function requireAdmin() {
  const user = await requireUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/home');
  return user;
}
