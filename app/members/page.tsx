import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';
import { StampBadge } from '@/components/StampBadge';

export default async function MembersPage() {
  const users = await prisma.user.findMany({ include: { badges: { include: { badge: true } } } });
  return <PrivateShell><RetroWindow title="Members">{users.map(u=><div key={u.id}><h3>{u.displayName}</h3><p>@{u.username}</p><p>{u.bio}</p>{u.badges.map(b=><StampBadge key={b.badgeId} label={b.badge.name} />)}</div>)}</RetroWindow></PrivateShell>;
}
