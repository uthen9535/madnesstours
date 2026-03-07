import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listLibraryMemesForViewer } from "@/lib/libraryMemes";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const memes = await listLibraryMemesForViewer({
      id: user.id,
      role: user.role
    });

    return NextResponse.json({ memes });
  } catch (error) {
    console.error("Library meme list failed.", error);
    return NextResponse.json({ error: "Unable to load meme archive." }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Use the shared media upload API endpoints (/api/media/uploads/*) for meme uploads."
    },
    { status: 405 }
  );
}
