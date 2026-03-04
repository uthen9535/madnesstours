import { prisma } from "@/lib/prisma";

function sanitizeBase(input: string): string {
  const lower = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return lower.slice(0, 16) || "agent";
}

function randomSuffix(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function generateUniqueUsername(displayName: string): Promise<string> {
  const base = sanitizeBase(displayName);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = `${base}${randomSuffix()}`;
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true }
    });

    if (!existing) {
      return candidate;
    }
  }

  return `agent${Date.now().toString().slice(-8)}`;
}
