import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';
import { requireAdmin } from '@/lib/guards';
import { revalidatePath } from 'next/cache';

async function createPost(formData: FormData) {
  'use server';
  const user = await requireAdmin();
  await prisma.post.create({ data: {
    title: String(formData.get('title')),
    slug: String(formData.get('slug')),
    content: String(formData.get('content')),
    category: formData.get('category') as any,
    published: true,
    authorId: user.id
  }});
  revalidatePath('/blog');
}

async function createTrip(formData: FormData) {
  'use server';
  await requireAdmin();
  await prisma.trip.create({ data: {
    title: String(formData.get('title')),
    slug: String(formData.get('slug')),
    destination: String(formData.get('destination')),
    summary: String(formData.get('summary')),
    story: String(formData.get('story')),
    stamp: 'default',
    badgeName: String(formData.get('badgeName'))
  }});
  revalidatePath('/trips');
}

async function approveEntry(formData: FormData) {
  'use server';
  await requireAdmin();
  await prisma.guestbookEntry.update({ where: { id: Number(formData.get('id')) }, data: { approved: true } });
  revalidatePath('/guestbook');
}

async function addMedia(formData: FormData) {
  'use server';
  const user = await requireAdmin();
  await prisma.mediaItem.create({ data: {
    title: String(formData.get('title')),
    description: String(formData.get('description')),
    url: String(formData.get('url')),
    uploadedBy: user.id
  }});
  revalidatePath('/vault');
}

export default async function AdminPage() {
  await requireAdmin();
  const pending = await prisma.guestbookEntry.findMany({ where: { approved: false } });
  return (
    <PrivateShell>
      <RetroWindow title="Admin Controls: Publish Post">
        <form action={createPost}><input name="title" placeholder="Title" required /><input name="slug" placeholder="slug" required /><select name="category"><option>BTC</option><option>CYBERPUNK</option><option>TRAVEL</option><option>WILD_TOPICS</option></select><textarea name="content" required /><button className="neon-btn" type="submit">Publish</button></form>
      </RetroWindow>
      <RetroWindow title="Create Trip">
        <form action={createTrip}><input name="title" required /><input name="slug" required /><input name="destination" required /><input name="badgeName" required /><textarea name="summary" required /><textarea name="story" required /><button className="neon-btn" type="submit">Save Trip</button></form>
      </RetroWindow>
      <RetroWindow title="Media Metadata Upload">
        <form action={addMedia}><input name="title" required /><input name="url" required /><textarea name="description" required /><button className="neon-btn" type="submit">Add Media</button></form>
      </RetroWindow>
      <RetroWindow title="Approve Guestbook Entries">
        {pending.map((p)=><form key={p.id} action={approveEntry}><input type="hidden" name="id" value={p.id} /><p>{p.guestName}: {p.message}</p><button className="neon-btn" type="submit">Approve</button></form>)}
      </RetroWindow>
    </PrivateShell>
  );
}
