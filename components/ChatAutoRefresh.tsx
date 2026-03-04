"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type ChatAutoRefreshProps = {
  intervalMs?: number;
};

export function ChatAutoRefresh({ intervalMs = 5000 }: ChatAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs, router]);

  return null;
}
