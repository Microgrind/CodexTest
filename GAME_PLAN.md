# Nut Invaders: Multiplayer Incremental Strategy Specification

## I. Overview and Theme
- **Game Title:** Nut Invaders
- **Genre:** Incremental Clicker / Multiplayer Strategy / Arcade Minigame Hybrid
- **Tone & Style:** Retro sci-fi with dark humor and nut iconography. Neon palettes, pixel art accents, CRT-inspired UI chrome.

## II. Technical Stack & Architecture
| Component | Technology | Notes |
| --- | --- | --- |
| Frontend | React (single Next.js `app/page.jsx`) | Client components orchestrate factory, fleet, galaxy, and minigames in one JSX surface. |
| Styling | Tailwind CSS | Utility-first styling for rapid iteration and consistent neon aesthetic. |
| Game Logic & Minigames | React state + Canvas API | Space-Invaders shooter and Simon-style memory lock rendered directly on `<canvas>`/DOM. |
| Database | Firebase Firestore | Stores player profiles, fleet status, and global planet map under `/artifacts/{__app_id}/`. |
| Authentication | Firebase Auth | Email/password auth, username claims, and session persistence. |

## III. Data Model (Firestore Structure)
### 3.1 Users – `/artifacts/{__app_id}/users/{userId}/user_data`
| Field | Type | Description |
| --- | --- | --- |
| `userId` | String | Firebase UID. |
| `username` | String | Unique commander alias. |
| `nuts` | Number | Current spendable currency. |
| `nutsPerSecond` | Number | Cached passive generation rate. |
| `clickMultiplier` | Number | Multiplier applied to manual clicks. |
| `upgrades` | Map | Levels per upgrade (`autoStroker`, `edgeMultiplier`, `goonerFlare`). |
| `fleetSize` | Number | Active Nut Ships. |
| `homePlanetId` | String / Null | Primary planet identifier. |
| `tradeRoutes` | Array<String> | Planet IDs with active trade routes. |
| `frenzyBoostUntil` | Timestamp / Null | Client-driven frenzy window for doubled output. |

### 3.2 Planets – `/artifacts/{__app_id}/public/data/planets/{planetId}`
| Field | Type | Description |
| --- | --- | --- |
| `planetId` | String | Unique identifier (`P-101`). |
| `name` | String | Nut-themed planet name. |
| `coordinates` | Map | `{ x: Number, y: Number }` for map plotting. |
| `ownerId` | String / Null | UID of current owner. |
| `ownerUsername` | String / Null | Display name for map labels. |
| `function` | String | `RESOURCE` or `POWER` bonus classification. |
| `defenseLevel` | Number | Difficulty tier (1–10). |
| `tradeRouteActive` | Boolean | Whether shipments are running. |
| `isUnderAttack` | Boolean | Flag set when an offensive run is active. |

### 3.3 Username Registry – `/artifacts/{__app_id}/public/data/usernames/{usernameKey}`
Ensures uniqueness when commanders register new accounts.

## IV. Core Gameplay Loops
### 4.1 Authentication & Profile Initialization
1. Player signs up with Firebase Auth (email/password).
2. Transaction reserves lowercase username doc and seeds `user_data` with:
   - `nuts: 10`
   - `nutsPerSecond: 0`
   - `fleetSize: 0`
   - `upgrades: {}`
   - `tradeRoutes: []`
3. Real-time listeners hydrate UI and keep Firestore in sync (throttled writes every 10 seconds + beforeunload).

### 4.2 Factory Tab – Idle & Active Production
- **NUT Button:** Large CTA awarding `1 × clickMultiplier` nuts per click with flashy feedback.
- **Passive Income:** Auto-Stroker upgrade grants `+2 NPS` per level. `setInterval` ticks accumulate nuts locally; periodic writes push totals to Firestore.
- **Frenzy Events:** `goonerFlare` upgrades raise the chance of triggering a 10-second `×2` multiplier every minute.
- **UI:** Tailwind cards summarise balances, NPS, and upgrade catalog with exponential costs.

### 4.3 Fleet Management
- **Nut Ships:** Exponential cost curve (`200 × 1.65^fleetSize`). Required for trade routes and offensive actions.
- **Trade Routes:** Resource planets can be toggled to ship 500 nuts every five minutes, consuming one ship per active route.
- **Capacity Checks:** Route activation blocked if `tradeRoutes.length >= fleetSize`.

### 4.4 Galaxy Map
- **Real-Time Map:** `onSnapshot` on `planets` feeds dynamic grid cards showing ownership, defense, and status.
- **Home Planet Assignment:** First successful claim locks `homePlanetId`.
- **Interaction Rules:**
  - Claim unowned planets (auto-assign if player lacks a home world).
  - Toggle trade routes on owned resource planets.
  - Attack enemy planets if fleet size > 0.

### 4.5 PvP Attack – Space Invaders Minigame
- **Initiation:** Sets target planet `isUnderAttack = true` when attacker clears three waves.
- **Difficulty Scaling:** Defense level increases invader rows, bullet speed, and hit points; higher tiers introduce denser waves.
- **Controls:** Arrow keys to move, Space/Up to fire.
- **Outcome:** Success progresses to defender alert; failure leaves planet untouched and attacker stands down.

### 4.6 PvP Defense – Memory Lock Minigame
- **Notification:** Owners receive live alert via snapshot change and can jump into defense tab.
- **Mechanics:** Simon-style sequence grows with defense level (length 4→8, faster playback, more distractions).
- **Result:** Successful defense clears `isUnderAttack`; failure wipes ownership and hands planet to attacker.

### 4.7 Leaderboards
- Aggregated in-app by counting owned planets per commander (no extra collection required).

## V. Technical Considerations
- **Single JSX Surface:** All React components live in `app/page.jsx` to satisfy the single-file requirement.
- **Offline Fallbacks:** When Firebase config is absent, the UI seeds mock planets and uses local state so designers can explore flows without a backend.
- **Sync Strategy:** Local state mutates instantly; writes are debounced (10s interval + unload event) to limit Firestore churn.
- **Access Control:** Firebase security rules (out of scope here) must ensure players can only mutate their own profile, manage owned planets, and toggle attack flags appropriately.

## VI. Roadmap & Enhancements
1. **Art & Audio:** Replace placeholder gradients with authentic pixel assets and chiptune SFX.
2. **Balancing:** Tune upgrade curves, ship costs, and frenzy cadence using telemetry.
3. **Alliances:** Introduce factions, shared defense, and trade bonuses.
4. **Prestige:** Add seasonal resets with meta-upgrades to extend replayability.
5. **Mobile UX:** Optimize tap targets and canvas controls for touch devices.

## VII. Final Goal
Colonize and defend the majority of planets. Leaderboards surface the top commanders by planet count, celebrating the most relentless nut hoarders in the galaxy.
