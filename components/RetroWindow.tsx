import { clsx } from "clsx";
import type { ReactNode } from "react";

type RetroWindowProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function RetroWindow({ title, children, className }: RetroWindowProps) {
  return (
    <section className={clsx("retro-window", className)}>
      <header className="retro-window__header">
        <span className="retro-window__dot" />
        <span className="retro-window__title">{title}</span>
      </header>
      <div className="retro-window__body">{children}</div>
    </section>
  );
}
