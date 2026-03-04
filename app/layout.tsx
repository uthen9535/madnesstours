import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GlobalGlitch } from "@/components/GlobalGlitch";
import "./globals.css";

export const metadata: Metadata = {
  title: "MadnessNet",
  description: "Private retro hub for the Madness Tour group.",
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <GlobalGlitch />
      </body>
    </html>
  );
}
