"use client";

import Link from "next/link";

export function FooterForestStrip() {
  return (
    <div className="footer-forest-strip">
      <video
        className="footer-forest-strip__video"
        src="/footer/forest-scene.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-label="Deep Chats preview"
      />
      <div className="footer-forest-strip__shade" />
      <div
        className="footer-forest-strip__cta-wrap footer-forest-strip__cta-wrap--always-visible"
        style={{ opacity: 1, pointerEvents: "auto" }}
      >
        <Link href="/deep-chats" className="footer-forest-strip__cta">
          Enter Deep Chats
        </Link>
      </div>
    </div>
  );
}
