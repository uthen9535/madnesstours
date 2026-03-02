import Link from 'next/link';
import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';

const destinations = [
  { name: 'Neo Tokyo', slug: 'neo-tokyo' },
  { name: 'Lunar Desert', slug: 'lunar-desert' }
];

export default async function MapPage() {
  return (
    <PrivateShell>
      <RetroWindow title="Mascot World Map">
        <p>🧙 Pixel mascot route map:</p>
        <div className="grid">
          {destinations.map((d) => (
            <Link key={d.slug} href={`/trips/${d.slug}`}>🗺️ {d.name}</Link>
          ))}
        </div>
      </RetroWindow>
    </PrivateShell>
  );
}
