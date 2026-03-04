import { clsx } from "clsx";
import type { ReactNode } from "react";

type TerminalBlockProps = {
  children: ReactNode;
  className?: string;
};

export function TerminalBlock({ children, className }: TerminalBlockProps) {
  return <div className={clsx("terminal-block", className)}>{children}</div>;
}
