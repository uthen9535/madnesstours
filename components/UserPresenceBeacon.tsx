"use client";

import { useEffect } from "react";

type UserPresenceBeaconProps = {
  intervalMs?: number;
};

export function UserPresenceBeacon({ intervalMs = 15000 }: UserPresenceBeaconProps) {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }

      try {
        await fetch("/api/presence/heartbeat", {
          method: "POST",
          cache: "no-store",
          keepalive: true
        });
      } catch {
        // Ignore transient network errors; next interval will retry.
      }
    }

    ping();

    const interval = setInterval(() => {
      void ping();
    }, intervalMs);

    const handleVisible = () => {
      void ping();
    };

    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [intervalMs]);

  return null;
}
