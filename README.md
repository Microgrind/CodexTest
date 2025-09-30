# Nut Invaders

Nut Invaders is a retro-styled multiplayer incremental strategy game prototype built with Next.js 13, React, Firebase, and Tailwind CSS. Command a fleet of nut ships, automate your factories, and battle other players in arcade-inspired minigames to conquer the galaxy.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
npm run start
```

> **Note:** Some sandbox environments block access to the public npm registry. If `npm install` fails, try an environment with full network access or mirror the required packages.

## Environment Variables

Configure Firebase (Firestore + Auth) by adding the following variables to `.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_APP_ID=nut-invaders
```

## Gameplay Overview

* **Factory Tab** – Click the neon NUT button, invest in Auto-Strokers, Edge Multipliers, and Gooner Flares, and trigger frenzied production bursts.
* **Fleet Command** – Purchase Nut Ships, manage trade routes from resource planets, and scale long-term passive income.
* **Galaxy Map** – Claim or attack planets in real time. Planet cards reflect ownership, defense level, and active trade routes.
* **PvP Minigames** – Offense launches a Space-Invaders canvas shooter; defense plays a Simon-style memory lock. Outcomes flip planetary ownership.
* **Leaderboard** – Planet counts per commander determine sector domination.

See `GAME_PLAN.md` for the detailed mechanics, balancing goals, and technical architecture.
