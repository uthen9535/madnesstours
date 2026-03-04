"use client";

import { type ReactNode, useEffect, useRef } from "react";

type ChatThreadViewportProps = {
  className?: string;
  children: ReactNode;
};

export function ChatThreadViewport({ className, children }: ChatThreadViewportProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [children]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
