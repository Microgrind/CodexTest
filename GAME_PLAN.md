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
| `upgrades` | Map | Levels per upgrade (`autoStroker`, `roastingKiln`, `orbitalFoundry`, `edgeMultiplier`, `shellAblator`, `goonerFlare`, `orbitalTradeNet`, `wormholeBroker`, `commandBridge`, `siegeRelay`). |
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
| `attackerId` | String / Null | UID of the current attacker when under siege. |
| `attackerUsername` | String / Null | Display label for the attacker. |
| `attackInitiatedAt` | Number / Null | Epoch millis when the assault started. |
| `attackEndsAt` | Number / Null | Epoch millis when the defender timeout expires. |
| `attackToken` | String / Null | Unique identifier for the active assault to prevent stale updates. |

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
- **Passive Income Stack:**
  - `autoStroker` grants `+2 NPS` per level.
  - `orbitalFoundry` layers extra `+1` NPS on every Auto-Stroker level.
  - `roastingKiln` multiplies total passive output by `+15%` per rank.
- **Click Damage Stack:** `edgeMultiplier` (+0.5) and `shellAblator` (+0.75) amplify manual taps; frenzy windows double both active and passive gains.
- **Frenzy Events:** `goonerFlare` upgrades raise the chance of triggering a 10-second `×2` multiplier every minute.
- **Factory Dashboard:** Retro chips surface current nuts, NPS, click multiplier, trade yields, and route capacity.

#### Upgrade Catalogue Overview
- **Factory Systems:** `autoStroker`, `roastingKiln`, `orbitalFoundry` for raw NPS throughput.
- **Manual Offense:** `edgeMultiplier`, `shellAblator` for active clicking potency.
- **Logistics:** `orbitalTradeNet` (+25% route payout), `wormholeBroker` (-10% claim costs, floor 150), `commandBridge` (+1 trade capacity).
- **Warfare:** `goonerFlare` (frenzy odds) and `siegeRelay` (-1 effective defense per rank during attacks).

### 4.3 Fleet Management
- **Nut Ships:** Exponential cost curve (`200 × 1.65^fleetSize`). At least one physical ship is required before a commander can claim planets or launch attacks.
- **Trade Routes:** Resource planets can be toggled to ship a base 500 nuts every five minutes. `orbitalTradeNet` multiplies this payout per route.
- **Capacity Checks:** Available slots are `fleetSize + commandBridge bonus`. Route activation is blocked if the number of active routes meets this capacity.

### 4.4 Galaxy Map
- **Real-Time Map:** `onSnapshot` on `planets` feeds dynamic grid cards showing ownership, defense, and attack timers.
- **Home Planet Assignment:** First successful claim (or conquest) locks `homePlanetId` automatically.
- **Claiming Planets:** Requires at least one Nut Ship and payment of a scaling cost (`400 + 250 × ownedPlanets`, reduced by `wormholeBroker`). Claims populate attacker metadata fields with nulls and timestamp the purchase.
- **Planet Management:**
  - Toggle trade routes on owned resource planets (respecting capacity).
  - Upgrade planetary defenses for nuts via `defenseLevel` increments (max 10), increasing attacker difficulty.
  - Attack enemy planets only when they are not already under assault.

### 4.5 PvP Attack – Space Invaders Minigame
- **Initiation:** Attacker must clear three waves. Success writes assault metadata (`attackerId`, `attackToken`, `attackEndsAt = now + 5 minutes`). Failure simply closes the drill.
- **Difficulty Scaling:** Planet `defenseLevel` boosts invader rows, bullet speed, and hit points. `siegeRelay` reduces effective defense for the attacker.
- **Controls:** Arrow keys to move, Space/Up to fire.
- **Outcome:** Successful run flips `isUnderAttack` and alerts the defender; failure leaves the planet untouched and the token is not minted.

### 4.6 PvP Defense – Memory Lock Minigame
- **Notification:** Owners receive live alert via snapshot change with attacker name and countdown. They have five real-time minutes to respond.
- **Mechanics:** Simon-style sequence grows with defense level (length 4→8, faster playback, more distractions). Countdown auto-fails if untouched.
- **Resolution:**
  - Success clears attack metadata and retains ownership.
  - Failure or timeout finalises the Firestore transaction to transfer ownership to the attacker, clearing trade routes and attack fields.

### 4.7 Arcade Training
- Dedicated tab hosts practice versions of both minigames with adjustable defense levels. Simulations do not mutate Firestore or resources.

### 4.8 Leaderboards
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
