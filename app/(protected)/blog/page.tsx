import Link from "next/link";
import { BlinkTag } from "@/components/BlinkTag";
import { RetroWindow } from "@/components/RetroWindow";
import { blogCategoryLabels } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export default async function BlogPage() {
  const posts = await prisma.blogPost.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: {
          displayName: true
        }
      }
    }
  });

  return (
    <RetroWindow title="MadnessNet Blogboard">
      <div className="card-list">
        {posts.map((post, index) => (
          <article key={post.id} className="card">
            <h2>
              {post.title} {index < 2 ? <BlinkTag /> : null}
            </h2>
            <p className="meta">
              {blogCategoryLabels[post.category]} :: by {post.author.displayName}
            </p>
            <p>{post.excerpt ?? "No excerpt."}</p>
            <Link href={`/blog/${post.slug}`}>Read Post</Link>
          </article>
        ))}
      </div>
    </RetroWindow>
  );
}
