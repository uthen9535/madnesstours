import { PrivateShell } from '@/components/PrivateShell';
import { RetroWindow } from '@/components/RetroWindow';
import { TerminalBlock } from '@/components/TerminalBlock';
import { HitCounter } from '@/components/HitCounter';
import { getBTCData } from '@/lib/btc';

export default async function HomePage() {
  const btc = await getBTCData();
  return (
    <PrivateShell>
      <div className="marquee"><marquee>Welcome to MadnessNet // Touring the globe with maximum chaos!</marquee></div>
      <RetroWindow title="Dashboard">
        <TerminalBlock text={`SYSTEM ONLINE\nBTC Block Height: ${btc.offline ? 'offline fallback' : btc.height}\nBTC Price: ${btc.offline ? 'offline fallback' : `$${btc.price.toFixed(2)}`}`} />
        <HitCounter />
      </RetroWindow>
    </PrivateShell>
  );
}
