import { clsx } from "clsx";

type StampBadgeProps = {
  label: string;
  subtitle: string;
  unlocked?: boolean;
};

type StampArtworkVariant = "spiral" | "treasure" | "monkeyRelic" | "relay";

function getArtworkVariant(label: string, subtitle: string): StampArtworkVariant {
  const normalized = `${label} ${subtitle}`.toLowerCase();

  if (/\bmad(?:ness)?[-\s]?iii\b/.test(normalized)) {
    return "monkeyRelic";
  }

  if (/\bmad(?:ness)?[-\s]?ii\b/.test(normalized)) {
    return "treasure";
  }

  if (/\bmad(?:ness)?[-\s]?i\b/.test(normalized)) {
    return "spiral";
  }

  return "relay";
}

function StampBadgeArtwork({ variant }: { variant: StampArtworkVariant }) {
  if (variant === "spiral") {
    return (
      <svg className="stamp-badge__svg" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="segaSpiralRock" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ccb28e" />
            <stop offset="1" stopColor="#7a6246" />
          </linearGradient>
          <linearGradient id="segaPanelSpiral" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0036ad" />
            <stop offset="1" stopColor="#2f8bff" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="88" height="88" rx="11" fill="url(#segaPanelSpiral)" />
        <rect x="10" y="10" width="80" height="80" rx="8" fill="#052469" />
        <path d="M12 26 H88 M12 42 H88 M12 58 H88 M12 74 H88" stroke="#4ac7ff" strokeOpacity="0.26" />
        <path d="M26 66 C26 49 38 35 54 35 C70 35 81 48 81 64 C81 79 69 90 53 90 C37 90 26 80 26 66 Z" fill="url(#segaSpiralRock)" />
        <path d="M30 63 C30 50 40 40 53 40 C66 40 75 49 75 62 C75 74 67 83 54 83 C41 83 30 75 30 63 Z" fill="#b09169" />
        <path d="M56 44 C63 45 69 50 69 58 C69 67 62 73 53 73 C45 73 40 67 40 61 C40 56 43 52 48 51 C52 50 56 53 56 57 C56 61 53 63 49 63"
          stroke="#5f472f"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M56 44 C63 45 69 50 69 58" stroke="#edd7b5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M21 72 H39 V82 H21 Z" fill="#001a56" />
        <path d="M21 72 L28 66 H46 L39 72 Z" fill="#62d5ff" />
        <path d="M39 72 L46 66 V72 L39 82 Z" fill="#1c9edd" />
        <path d="M16 24 L23 17 L30 24 L23 31 Z" fill="#66e6ff" />
      </svg>
    );
  }

  if (variant === "treasure") {
    return (
      <svg className="stamp-badge__svg" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="segaPanelB" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f218f" />
            <stop offset="1" stopColor="#1f6dff" />
          </linearGradient>
          <linearGradient id="coinFace" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff0aa" />
            <stop offset="1" stopColor="#ffbb1d" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="88" height="88" rx="11" fill="url(#segaPanelB)" />
        <rect x="10" y="10" width="80" height="80" rx="8" fill="#062b7b" />
        <path d="M14 68 H78 V80 H14 Z" fill="#2b1f0e" />
        <path d="M14 68 L23 60 H87 L78 68 Z" fill="#f7cf4d" />
        <path d="M78 68 L87 60 V72 L78 80 Z" fill="#d99614" />
        <ellipse cx="28" cy="70" rx="9" ry="6.5" fill="url(#coinFace)" />
        <ellipse cx="42" cy="73" rx="11" ry="7.2" fill="url(#coinFace)" />
        <ellipse cx="58" cy="70" rx="10" ry="6.8" fill="url(#coinFace)" />
        <ellipse cx="70" cy="74" rx="9" ry="6.2" fill="url(#coinFace)" />
        <rect x="27" y="41" width="45" height="19" fill="#503213" />
        <path d="M27 41 L35 34 H80 L72 41 Z" fill="#d6a732" />
        <path d="M72 41 L80 34 V53 L72 60 Z" fill="#9c661b" />
        <path d="M39 24 L46 17 L53 24 L46 31 Z" fill="#5ce3ff" />
        <path d="M63 24 L69 18 L75 24 L69 30 Z" fill="#ff77d7" />
      </svg>
    );
  }

  if (variant === "monkeyRelic") {
    return (
      <svg className="stamp-badge__svg" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="segaPanelRelic" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f2598" />
            <stop offset="1" stopColor="#2c83ff" />
          </linearGradient>
          <linearGradient id="relicStone" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ceb489" />
            <stop offset="1" stopColor="#765f42" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="88" height="88" rx="11" fill="url(#segaPanelRelic)" />
        <rect x="10" y="10" width="80" height="80" rx="8" fill="#082e86" />
        <path d="M20 71 H78 V82 H20 Z" fill="#0a1d57" />
        <path d="M20 71 L28 63 H86 L78 71 Z" fill="#56baff" />
        <path d="M78 71 L86 63 V74 L78 82 Z" fill="#1c8ddd" />
        <path d="M27 27 H64 V62 H27 Z" fill="url(#relicStone)" />
        <path d="M27 27 L36 20 H73 V55 L64 62 Z" fill="#a58b64" />
        <path d="M64 27 L73 20 V55 L64 62 Z" fill="#5f4b33" />
        <circle cx="38" cy="42" r="7" fill="#8b6d4c" />
        <circle cx="57" cy="42" r="7" fill="#8b6d4c" />
        <path d="M34 52 C34 45 40 39 49 39 C58 39 64 45 64 52 C64 58 58 64 49 64 C40 64 34 58 34 52 Z" fill="#b99b70" />
        <circle cx="42" cy="45" r="2.5" fill="#0f1839" />
        <circle cx="56" cy="45" r="2.5" fill="#0f1839" />
        <path d="M46 55 C47 58 51 58 52 55" stroke="#403224" strokeWidth="2" fill="none" />
        <path d="M16 30 L22 23 L28 30 L22 37 Z" fill="#62e5ff" />
        <path d="M76 21 L82 14 L88 21 L82 28 Z" fill="#ff7be0" />
      </svg>
    );
  }

  return (
    <svg className="stamp-badge__svg" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="6" y="6" width="88" height="88" rx="10" fill="#091c2b" />
      <circle cx="50" cy="50" r="26" fill="none" stroke="#4ddffb" strokeWidth="3" strokeDasharray="4 4" />
      <circle cx="50" cy="50" r="8" fill="#ff5ed4" />
      <line x1="50" y1="18" x2="50" y2="34" stroke="#4ddffb" strokeWidth="3" />
      <line x1="50" y1="66" x2="50" y2="82" stroke="#4ddffb" strokeWidth="3" />
      <line x1="18" y1="50" x2="34" y2="50" stroke="#4ddffb" strokeWidth="3" />
      <line x1="66" y1="50" x2="82" y2="50" stroke="#4ddffb" strokeWidth="3" />
      <line x1="28" y1="28" x2="39" y2="39" stroke="#4ddffb" strokeWidth="3" />
      <line x1="61" y1="61" x2="72" y2="72" stroke="#4ddffb" strokeWidth="3" />
      <line x1="28" y1="72" x2="39" y2="61" stroke="#4ddffb" strokeWidth="3" />
      <line x1="61" y1="39" x2="72" y2="28" stroke="#4ddffb" strokeWidth="3" />
    </svg>
  );
}

export function StampBadge({ label, subtitle, unlocked = true }: StampBadgeProps) {
  const variant = getArtworkVariant(label, subtitle);

  return (
    <div className={clsx("stamp-badge", !unlocked && "stamp-badge--locked")}>
      <span className={clsx("stamp-badge__art", `stamp-badge__art--${variant}`)}>
        <StampBadgeArtwork variant={variant} />
      </span>
      <span className="stamp-badge__content">
        <span className="stamp-badge__label">{label}</span>
        <span className="stamp-badge__subtitle">{subtitle}</span>
        {!unlocked ? <span className="stamp-badge__state">LOCKED</span> : null}
      </span>
    </div>
  );
}
