import { notFound } from "next/navigation";
import { RetroWindow } from "@/components/RetroWindow";
import { blogCategoryLabels } from "@/lib/data";
import { renderMarkdown } from "@/lib/markdown";
import { prisma } from "@/lib/prisma";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await prisma.blogPost.findFirst({
    where: { slug, published: true },
    include: {
      author: {
        select: {
          displayName: true
        }
      }
    }
  });

  if (!post) {
    notFound();
  }

  return (
    <RetroWindow title={post.title}>
      <p className="meta">
        {blogCategoryLabels[post.category]} :: by {post.author.displayName} :: {post.createdAt.toLocaleString()}
      </p>
      <article className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />
    </RetroWindow>
  );
}
