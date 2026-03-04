import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GlobalGlitch } from "@/components/GlobalGlitch";
import { SystemAttackFeed } from "@/components/SystemAttackFeed";
import { getCurrentUser } from "@/lib/auth";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        {children}
        <SystemAttackFeed currentUsername={currentUser?.username ?? ""} />
        <GlobalGlitch />
      </body>
    </html>
  );
}
