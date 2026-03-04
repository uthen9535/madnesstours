import type { ReactNode } from "react";
import { SiteChrome } from "@/components/SiteChrome";
import { UserPresenceBeacon } from "@/components/UserPresenceBeacon";
import { requireUser } from "@/lib/auth";
import { getBTCSnapshot } from "@/lib/btc";
import { incrementAndGetHitCounter } from "@/lib/data";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const [btc, hitCount] = await Promise.all([getBTCSnapshot(), incrementAndGetHitCounter()]);

  return (
    <SiteChrome username={`@${user.username.toLowerCase()}`} role={user.role} hitCount={hitCount} btc={btc}>
      <UserPresenceBeacon />
      {children}
    </SiteChrome>
  );
}
