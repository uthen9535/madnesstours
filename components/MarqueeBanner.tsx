import type { ReactNode } from "react";

type MarqueeBannerProps = {
  children: ReactNode;
};

export function MarqueeBanner({ children }: MarqueeBannerProps) {
  return (
    <div className="marquee-shell" aria-label="Announcement banner">
      <div className="marquee-track">
        <span className="marquee-item">{children}</span>
        <span className="marquee-item" aria-hidden>
          {children}
        </span>
      </div>
    </div>
  );
}
