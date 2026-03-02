import { prisma } from '@/lib/prisma';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';

export default async function VaultPage() {
  const items = await prisma.mediaItem.findMany({ orderBy: { createdAt: 'desc' } });
  return <PrivateShell><RetroWindow title="Media Vault">{items.map(i=><div key={i.id}><a href={i.url}>{i.title}</a> - {i.description}</div>)}</RetroWindow></PrivateShell>;
}
