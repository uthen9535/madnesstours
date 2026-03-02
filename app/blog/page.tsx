import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';

export default async function BlogPage() {
  const posts = await prisma.post.findMany({ where: { published: true }, orderBy: { createdAt: 'desc' } });
  return <PrivateShell><RetroWindow title="Blog Feed">{posts.map(p=><div key={p.id}><Link href={`/blog/${p.slug}`}>{p.title}</Link> [{p.category}]</div>)}</RetroWindow></PrivateShell>;
}
