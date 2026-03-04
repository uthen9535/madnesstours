import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const exclude = searchParams.get("exclude")?.trim().toLowerCase() ?? "";

  const posts = await prisma.blogPost.findMany({
    where: { published: true },
    select: { slug: true }
  });

  if (posts.length === 0) {
    return NextResponse.json({ error: "No published blog posts available" }, { status: 404 });
  }

  const pool = exclude && posts.length > 1 ? posts.filter((post) => post.slug.toLowerCase() !== exclude) : posts;
  const availablePosts = pool.length > 0 ? pool : posts;

  const index = Math.floor(Math.random() * availablePosts.length);
  const selected = availablePosts[index];

  return NextResponse.json({ href: `/blog/${selected.slug}`, slug: selected.slug });
}
