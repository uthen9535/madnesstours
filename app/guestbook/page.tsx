import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';
import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

async function signGuestbook(formData: FormData) {
  'use server';
  const user = await requireUser();
  if (!user) return;
  await prisma.guestbookEntry.create({
    data: {
      message: String(formData.get('message') || ''),
      guestName: user.displayName,
      authorId: user.id
    }
  });
  revalidatePath('/guestbook');
}

export default async function GuestbookPage() {
  const entries = await prisma.guestbookEntry.findMany({ where: { approved: true }, orderBy: { createdAt: 'desc' } });
  return (
    <PrivateShell>
      <RetroWindow title="Guestbook">
        {entries.map((e) => <p key={e.id}><strong>{e.guestName}:</strong> {e.message}</p>)}
      </RetroWindow>
      <RetroWindow title="Sign Guestbook (approval required)">
        <form action={signGuestbook}><textarea name="message" required /><button className="neon-btn" type="submit">Sign</button></form>
      </RetroWindow>
    </PrivateShell>
  );
}
