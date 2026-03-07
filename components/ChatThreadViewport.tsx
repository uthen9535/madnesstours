"use client";

import { type ReactNode, useEffect, useRef } from "react";

type ChatThreadViewportProps = {
  className?: string;
  children: ReactNode;
};

const AUTO_STICK_THRESHOLD_PX = 48;

export function ChatThreadViewport({ className, children }: ChatThreadViewportProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const updateStickState = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom <= AUTO_STICK_THRESHOLD_PX;
    };

    updateStickState();
    node.addEventListener("scroll", updateStickState, { passive: true });

    return () => {
      node.removeEventListener("scroll", updateStickState);
    };
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    if (!hasInitializedRef.current) {
      node.scrollTop = node.scrollHeight;
      hasInitializedRef.current = true;
      shouldStickToBottomRef.current = true;
      return;
    }

    if (shouldStickToBottomRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [children]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
