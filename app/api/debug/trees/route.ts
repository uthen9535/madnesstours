import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const TREE_PATHS = [
  "/pixel/trees/pine/pine_a.png",
  "/pixel/trees/pine/pine_b.png",
  "/pixel/trees/oak/oak_a.png",
  "/pixel/trees/oak/oak_b.png",
  "/pixel/trees/silhouette/sil_a.png",
  "/pixel/trees/silhouette/sil_b.png"
] as const;

export async function GET() {
  const publicRoot = path.join(process.cwd(), "public");
  const exists = Object.fromEntries(
    TREE_PATHS.map((publicPath) => {
      const diskPath = path.join(publicRoot, publicPath.replace(/^\//, ""));
      return [publicPath, fs.existsSync(diskPath)];
    })
  );

  return NextResponse.json({ exists });
}
