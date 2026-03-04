# MadnessNet

Private retro 90s-style website for the Madness Tour group.

## Stack

- Next.js App Router + TypeScript
- Prisma + SQLite
- Cookie-based credentials auth (codename + global password, bcrypt hashes)
- Roles: `admin`, `civilian`

## Features

- Front-door login (`/login`) and protected member area (`/home`, `/map`, `/trips`, `/blog`, `/vault`, `/guestbook`)
- Admin-only control panel (`/admin`) for:
  - Creating member codenames
  - Publishing blog posts
  - Creating trips
  - Uploading media metadata
  - Monitoring live chat activity
- Retro 90s visual system:
  - Tiled backgrounds
  - Marquee banner
  - Blink `NEW` tags
  - Hit counter
  - Live chat feed
  - Pixel icon assets
- Brand-forward visual theme using primary `#14baa2` with cyberpunk secondary accents
- Cyberpunk overlay toggle:
  - CRT scanlines
  - Neon glow accenting
- Global mute toggle for optional chiptune playback
- BTC UI feed with graceful fallback:
  - Block height + spot price
  - Falls back to static values if API fetch fails/offline
- Travel mascot RPG:
  - Clickable retrofuturist world map (local SVG, no API key)
  - Trip stamp unlocks
  - Badge shelf on member profiles
  - Seeded destinations: Madness I: Lake Powell, Madness II: Carribean Cruise, Madness III: Bali

## Routes

- `/login`
- `/home`
- `/map`
- `/trips`
- `/trips/[slug]`
- `/blog`
- `/blog/[slug]`
- `/vault`
- `/guestbook`
- `/profiles/[username]`
- `/admin` (admin only)

## Privacy Controls

- `robots.txt` disallows all crawling
- Sitewide `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`

## Setup

1. Install Node.js 20+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run Prisma migration:
   ```bash
   npx prisma migrate dev
   ```
4. Seed the database:
   ```bash
   npm run db:seed
   ```
5. Start dev server:
   ```bash
   npm run dev
   ```

## Production Deploy

Use the production build/start scripts so database migrations are always applied before serving:

```bash
npm ci
npm run build:prod
npm run start:prod
```

If your platform has separate build/start commands, set:

- Build command: `npm run build:prod`
- Start command: `npm run start:prod`

## Audio Generation (Shortwave Intercept)

Shortwave Intercept now uses generated MP3 assets for all transmissions and ambient bed sounds.

Prerequisites:

- `ffmpeg` (required)
- One local offline TTS engine:
  - `espeak` (default in script), or
  - `piper`
  - `tone` fallback (built into the script, no extra install)

Optional:

- `OPENAI_API_KEY` for higher-quality online TTS mode

Generate all audio assets:

```bash
npm run generate:audio
```

Force-regenerate existing files:

```bash
npm run generate:audio -- --force
```

Offline engine overrides:

```bash
# use piper offline engine
npm run generate:audio -- --mode=offline --tts=piper

# macOS fallback (development convenience)
npm run generate:audio -- --mode=offline --tts=say

# deterministic built-in fallback (no external TTS dependency)
npm run generate:audio -- --mode=offline --tts=tone
```

Online mode (if `OPENAI_API_KEY` is set):

```bash
npm run generate:audio -- --mode=online
```

Generated output locations:

- `public/audio/transmissions/military/01.mp3` ... `10.mp3`
- `public/audio/transmissions/et/01.mp3` ... `10.mp3`
- `public/audio/transmissions/member/01.mp3` ... `10.mp3`
- `public/audio/bed/bed_loop_01.mp3` ... `bed_loop_03.mp3`
- `public/audio/bed/burst_static_01.mp3`, `burst_static_02.mp3`, `burst_modem_01.mp3`, `burst_keyclick_01.mp3`
- `public/audio/controls/force_glitch.mp3`, `force_red_alert.mp3`

## Seeded Credentials

Global password for all accounts: `finnsbeachclub` (override with `GLOBAL_SITE_PASSWORD` in `.env`)

- Admin:
  - username: `sysop`
  - password: `finnsbeachclub`
- Member:
  - username: `traveler`
  - password: `finnsbeachclub`

## Useful Scripts

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run Next.js lint
- `npm run generate:audio` - generate shortwave transmission + bed audio assets
- `npm run prisma:migrate` - run Prisma migrations
- `npm run db:seed` - run seed script

## Notes

- Database file uses SQLite via `DATABASE_URL="file:./dev.db"` in `.env`.
- Public signup is disabled. Admin creates tester accounts in `/admin` under "Create Member Codename".
- Blog/trip editors in admin are plain markdown textareas by design.
