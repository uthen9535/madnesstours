import type { ReactNode } from "react";
import { SiteChrome } from "@/components/SiteChrome";
import { UserPresenceBeacon } from "@/components/UserPresenceBeacon";
import { requireUser } from "@/lib/auth";
import { getBTCSnapshot } from "@/lib/btc";
import { getNextMissionObjective, incrementAndGetHitCounter } from "@/lib/data";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const [btc, hitCount, missionObjective] = await Promise.all([
    getBTCSnapshot(),
    incrementAndGetHitCounter(),
    getNextMissionObjective()
  ]);

  return (
    <SiteChrome
      username={`@${user.username.toLowerCase()}`}
      role={user.role}
      hitCount={hitCount}
      btc={btc}
      missionObjective={
        missionObjective
          ? {
              title: missionObjective.title,
              startDateIso: missionObjective.startDate.toISOString()
            }
          : null
      }
    >
      <UserPresenceBeacon />
      {children}
    </SiteChrome>
  );
}
