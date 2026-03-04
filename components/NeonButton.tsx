import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type NeonButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function NeonButton({ children, className, ...props }: NeonButtonProps) {
  return (
    <button className={clsx("neon-button", className)} {...props}>
      {children}
    </button>
  );
}
