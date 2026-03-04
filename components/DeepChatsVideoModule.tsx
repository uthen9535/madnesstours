"use client";

import { useEffect, useRef } from "react";

const BUNNY_WIDTH = 96;
const BUNNY_SPEED_PX_PER_SEC = 52;
const BUNNY_WAIT_MS = 10_000;

export function DeepChatsVideoModule() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bunnyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const bunny = bunnyRef.current;
    if (!container || !bunny) {
      return;
    }

    let viewWidth = container.clientWidth;
    let animationFrame = 0;
    let lastTimestamp = 0;
    let nextRunAt = 0;
    let isRunning = true;
    let x = -BUNNY_WIDTH;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      viewWidth = entry.contentRect.width;
    });

    resizeObserver.observe(container);

    const applyPosition = () => {
      bunny.style.left = `${x}px`;
    };

    const tick = (timestamp: number) => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;

      if (isRunning) {
        x += BUNNY_SPEED_PX_PER_SEC * deltaSeconds;
        applyPosition();

        if (x > viewWidth + BUNNY_WIDTH) {
          isRunning = false;
          nextRunAt = timestamp + BUNNY_WAIT_MS;
          bunny.style.opacity = "0";
        }
      } else if (timestamp >= nextRunAt) {
        isRunning = true;
        x = -BUNNY_WIDTH;
        bunny.style.opacity = "1";
        applyPosition();
      }

      animationFrame = requestAnimationFrame(tick);
    };

    bunny.style.opacity = "1";
    applyPosition();
    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="deep-chats-video-wrap">
      <video
        className="deep-chats-video"
        src="/footer/forest-scene.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
      />
      <div ref={bunnyRef} className="deep-chats-bunny" aria-hidden="true" />
      <div className="deep-chats-bush-frame" aria-hidden="true" />
      <div className="deep-chats-bush-left" aria-hidden="true" />
    </div>
  );
}
