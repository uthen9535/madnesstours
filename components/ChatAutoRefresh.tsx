"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type ChatAutoRefreshProps = {
  intervalMs?: number;
  pauseWhileTypingSelector?: string;
};

export function ChatAutoRefresh({
  intervalMs = 5000,
  pauseWhileTypingSelector = ".live-chat-composer"
}: ChatAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl?.closest(pauseWhileTypingSelector)) {
        return;
      }

      const scope = document.querySelector(pauseWhileTypingSelector);
      const draftTextarea = scope?.querySelector("textarea") as HTMLTextAreaElement | null;
      if (draftTextarea && draftTextarea.value.trim().length > 0) {
        return;
      }

      router.refresh();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs, pauseWhileTypingSelector, router]);

  return null;
}
