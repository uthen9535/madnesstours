import { marked } from 'marked';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';

export default async function PostDetail({ params }: { params: { slug: string } }) {
  const post = await prisma.post.findUnique({ where: { slug: params.slug, published: true } });
  if (!post) notFound();
  return <PrivateShell><RetroWindow title={post.title}><div dangerouslySetInnerHTML={{ __html: marked.parse(post.content) as string }} /></RetroWindow></PrivateShell>;
}
