# MadnessNet

Private retro 90s-style web portal for the Madness Tour group.

## Stack
- Next.js 14 (App Router) + TypeScript
- SQLite with Prisma
- Cookie/JWT credentials auth + bcrypt password hashes

## Features
- Front-door login (`/login`) with protected private pages only.
- Roles: `admin`, `member`.
- Retro components: `RetroWindow`, `NeonButton`, `TerminalBlock`, `StampBadge`.
- Retro effects: marquee banners, blink NEW tag, hit counter, guestbook approval flow.
- Cyberpunk overlay toggle + global mute audio toggle.
- BTC block height + price widget with offline fallback.
- Mascot world map, trips, blog categories, member badges, media vault, admin panel.
- `robots.txt` disallow all and `X-Robots-Tag: noindex, nofollow, noarchive` headers sitewide.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create env file:
   ```bash
   cp .env.example .env
   ```
3. Run Prisma migration + generate client:
   ```bash
   npx prisma migrate dev --name init
   ```
4. Seed sample data:
   ```bash
   npm run prisma:seed
   ```
5. Start dev server:
   ```bash
   npm run dev
   ```

## Demo Accounts
- Admin: `admin` / `admin123`
- Member: `member` / `member123`

## Routes
`/login`, `/home`, `/map`, `/trips`, `/trips/[slug]`, `/blog`, `/blog/[slug]`, `/vault`, `/guestbook`, `/members`, `/admin`
