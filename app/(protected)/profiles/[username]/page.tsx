import { notFound } from "next/navigation";
import { EvidenceBoard } from "@/components/EvidenceBoard";
import { RetroWindow } from "@/components/RetroWindow";
import { requireUser } from "@/lib/auth";
import { getOperatorDashboardData } from "@/lib/operatorDashboard";
import { prisma } from "@/lib/prisma";

type ProfilePageProps = {
  params: Promise<{ username: string }>;
};

type MemberNode = {
  id: string;
  username: string;
  role: string;
};

type ScatterNode = {
  user: MemberNode;
  x: number;
  y: number;
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distance(aX: number, aY: number, bX: number, bY: number): number {
  return Math.hypot(aX - bX, aY - bY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scatterMembers(members: MemberNode[], seedText: string): ScatterNode[] {
  const rng = createRng(hashString(seedText));
  const placed: ScatterNode[] = [];
  const minDistance = 11;

  for (let index = 0; index < members.length; index += 1) {
    const user = members[index];
    let chosen: ScatterNode | null = null;

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const x = 7 + rng() * 86;
      const y = 7 + rng() * 86;
      const insideFocus = x > 31 && x < 69 && y > 31 && y < 69;
      if (insideFocus) {
        continue;
      }

      if (placed.some((node) => distance(node.x, node.y, x, y) < minDistance)) {
        continue;
      }

      chosen = { user, x, y };
      break;
    }

    if (!chosen) {
      const col = index % 5;
      const row = Math.floor(index / 5);
      const x = clamp(10 + col * 17 + (rng() * 4 - 2), 7, 93);
      const y = clamp(10 + row * 13 + (rng() * 5 - 2.5), 7, 93);
      chosen = { user, x, y };
    }

    placed.push(chosen);
  }

  return placed;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  await requireUser();
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername).toLowerCase();

  const [profile, allUsers] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        role: true
      }
    }),
    prisma.user.findMany({
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        role: true
      }
    })
  ]);

  if (!profile) {
    notFound();
  }

  const operatorDashboard = await getOperatorDashboardData(profile.id);
  if (!operatorDashboard) {
    notFound();
  }

  const nonFocusMembers = allUsers
    .filter((member) => member.id !== profile.id)
    .map((member) => ({ ...member, role: member.role }));
  const scatteredMembers = scatterMembers(nonFocusMembers, `${profile.username}:${nonFocusMembers.length}`);

  const points = [
    { id: profile.id, username: profile.username, x: 50, y: 50, focus: true },
    ...scatteredMembers.map((node) => ({ id: node.user.id, username: node.user.username, x: node.x, y: node.y, focus: false }))
  ];

  const networkLines: Array<{
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    focus: boolean;
    aUsername: string;
    bUsername: string;
  }> = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      networkLines.push({
        key: `${a.id}-${b.id}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        focus: a.focus || b.focus,
        aUsername: a.username,
        bUsername: b.username
      });
    }
  }

  return (
    <div className="stack">
      <RetroWindow title={`Evidence Board // @${profile.username}`}>
        <p className="meta">Primary profile highlighted. Click any linked operator node to pivot this board.</p>
        <EvidenceBoard
          profile={{
            ...operatorDashboard
          }}
          nodes={scatteredMembers.map((node) => ({
            id: node.user.id,
            username: node.user.username,
            role: node.user.role,
            x: node.x,
            y: node.y
          }))}
          lines={networkLines}
        />
      </RetroWindow>
    </div>
  );
}
