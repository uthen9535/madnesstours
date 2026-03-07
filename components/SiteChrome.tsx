"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DeepChatsGatekeeper } from "@/components/DeepChatsGatekeeper";
import { MarqueeBanner } from "@/components/MarqueeBanner";
import { MissionCountdownModule } from "@/components/MissionCountdownModule";
import { NeonButton } from "@/components/NeonButton";

type SiteChromeProps = {
  username: string;
  role: string;
  hitCount: number;
  missionObjective: {
    title: string;
    startDateIso: string;
  } | null;
  btc: {
    blockHeight: number;
    usdPrice: number;
    source: "live" | "fallback";
  };
  children: ReactNode;
};

type NavLink = {
  href: string;
  label: string;
  command?: boolean;
};

const baseLinks: NavLink[] = [
  { href: "/home", label: "Home" },
  { href: "/tours", label: "Tours" },
  { href: "/map", label: "Map" },
  { href: "/guestbook", label: "Guestbook" },
  { href: "/relic-vault", label: "Relic Vault" },
  { href: "/library", label: "Library" },
  { href: "/laboratory", label: "Laboratory" },
  { href: "/deep-chats", label: "Deep Chats" },
  { href: "/blog", label: "Blog" }
];

const commandLinks: NavLink[] = [
  ...baseLinks,
  { href: "/admin", label: "Admin", command: true },
  { href: "/staging", label: "Testing", command: true }
];

const civilianLinks: NavLink[] = [...baseLinks, { href: "/admin", label: "Admin", command: true }];

export function SiteChrome({ username, role, hitCount, missionObjective, btc, children }: SiteChromeProps) {
  const pathname = usePathname();
  const isCommandUser = role === "admin";
  const [muteAudio, setMuteAudio] = useState(false);
  const [cyberpunkOverlay, setCyberpunkOverlay] = useState(true);

  useEffect(() => {
    const savedMute = localStorage.getItem("madnessnet_mute");
    const savedCyberpunk = localStorage.getItem("madnessnet_cyberpunk");

    if (savedMute !== null) {
      setMuteAudio(savedMute === "true");
    }

    if (savedCyberpunk !== null) {
      setCyberpunkOverlay(savedCyberpunk === "true");
    }
  }, []);

  useEffect(() => {
    const onMuteEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ muted?: boolean }>;
      if (typeof customEvent.detail?.muted === "boolean") {
        setMuteAudio(customEvent.detail.muted);
        return;
      }

      const savedMute = localStorage.getItem("madnessnet_mute");
      if (savedMute !== null) {
        setMuteAudio(savedMute === "true");
      }
    };

    window.addEventListener("madnessnet:audio-mute-change", onMuteEvent as EventListener);
    return () => {
      window.removeEventListener("madnessnet:audio-mute-change", onMuteEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("madnessnet_mute", String(muteAudio));
    window.dispatchEvent(new CustomEvent("madnessnet:audio-mute-change", { detail: { muted: muteAudio } }));
  }, [muteAudio]);

  useEffect(() => {
    localStorage.setItem("madnessnet_cyberpunk", String(cyberpunkOverlay));
    document.documentElement.classList.toggle("cyberpunk-on", cyberpunkOverlay);
  }, [cyberpunkOverlay]);

  const formattedPrice = useMemo(() => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(btc.usdPrice);
  }, [btc.usdPrice]);
  const navLinks = isCommandUser ? commandLinks : civilianLinks;

  return (
    <div className="shell">
      <MarqueeBanner>
        {`MadnessNet // Members-Only BBS // BTC Block #${btc.blockHeight} // BTC ${formattedPrice} //`}
        {btc.source === "fallback" ? " Offline fallback mode //" : " Live feed connected //"}
      </MarqueeBanner>
      <header className="shell-header">
        <div className="shell-header__title">
          <h1>MadnessNet</h1>
          <p>Welcome back, {username} ({isCommandUser ? "command" : "civilian"})</p>
        </div>
        <div className="shell-header__meta">
          <MissionCountdownModule objective={missionObjective} />
          <span className="hit-counter">Hits: {hitCount.toString().padStart(7, "0")}</span>
          <NeonButton type="button" onClick={() => setCyberpunkOverlay((value) => !value)}>
            {cyberpunkOverlay ? "Disable Cyberpunk" : "Enable Cyberpunk"}
          </NeonButton>
          <div className="shell-header__session-controls">
            <form action="/api/auth/logout" method="post">
              <NeonButton type="submit">Log Out</NeonButton>
            </form>
            <button
              type="button"
              className={muteAudio ? "audio-toggle-icon audio-toggle-icon--muted" : "audio-toggle-icon"}
              onClick={() => setMuteAudio((value) => !value)}
              aria-pressed={!muteAudio}
              aria-label={muteAudio ? "Turn sound on" : "Turn sound off"}
              title={muteAudio ? "Sound OFF (click to turn ON)" : "Sound ON (click to turn OFF)"}
            >
              <svg className="audio-toggle-icon__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 10v4h4l5 4V6L7 10H3z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                {muteAudio ? (
                  <>
                    <path d="M16 9l5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M21 9l-5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <path
                      d="M15.5 9.6c1 .6 1.6 1.9 1.6 3.4s-.6 2.8-1.6 3.4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                    <path
                      d="M18 7.1c1.7 1.2 2.8 3.4 2.8 5.9 0 2.5-1.1 4.7-2.8 5.9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </svg>
              <span className="sr-only">{muteAudio ? "Sound off" : "Sound on"}</span>
            </button>
          </div>
        </div>
      </header>
      <nav className="shell-nav" aria-label="Main navigation">
        {navLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const classes = ["shell-nav__link"];
          if (link.command) {
            classes.push("shell-nav__link--command");
          }
          if (active) {
            classes.push("shell-nav__link--active");
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              className={classes.join(" ")}
            >
              {link.href === "/admin" ? (isCommandUser ? "Command Admin" : "Civilian Admin") : link.label}
            </Link>
          );
        })}
      </nav>
      <main className="shell-main">{children}</main>
      <DeepChatsGatekeeper />
    </div>
  );
}
