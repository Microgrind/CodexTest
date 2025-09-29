# Space Invader Cookie Clicker – Product & Technical Plan

## 1. Concept Overview
- **Theme:** Retro-inspired space invasion where “cookies” are re-imagined as *energy cores* used to build a conquering armada.
- **Goal:** Accumulate energy cores by clicking a central reactor and investing in upgrades that unlock fleets, stations, and planetary conquest.
- **Platform:** Next.js app with client-heavy gameplay, serverless persistence, and responsive UI.

## 2. Core Gameplay Loop
1. **Click** on the energy reactor to generate cores.
2. **Spend** cores on upgrades that automate core production or increase click value.
3. **Unlock** new fleets, technologies, and planets as total cores and achievements rise.
4. **Prestige** by conquering a galaxy, resetting progress for permanent buffs.

## 3. Production Systems & Economy
### 3.1 Resources
- **Primary currency:** Energy cores (EC).
- **Secondary:** Fleet power (FP) – accumulates passively from ships; required to conquer planets.
- **Prestige token:** Galactic influence (GI) earned after conquering a full sector.

### 3.2 Production Sources
| Producer | Unlock Condition | Base Cost (EC) | Cost Growth | Base Output (EC/s) | Notes |
|----------|-----------------|----------------|-------------|--------------------|-------|
| Reactor Overclock | Default | 15 | ×1.15 | +1 per click | Click upgrade, scales click value. |
| Drone Swarm | Reach 30 EC | 100 | ×1.15 | 2 | Low-tier passive production. |
| Asteroid Miner | Own 10 Drones | 500 | ×1.17 | 10 | Introduces FP trickle (+0.1/s). |
| Orbital Factory | Total EC ≥ 5K | 2,500 | ×1.18 | 45 | Adds FP bonus of +0.5/s. |
| Battlecruiser Yard | Conquer 1 planet | 12,000 | ×1.2 | 180 | Unlocks planetary assault missions. |
| Quantum Forge | FP ≥ 5,000 | 75,000 | ×1.22 | 900 | Provides multiplicative boost to all passive producers (+3% per level). |
| Stellar Gate | GI ≥ 1 | 400,000 | ×1.25 | 4,500 | Late-game prestige structure, +5% EC from all sources per Gate. |

- **Balanced scaling:** Early tiers use gentle multipliers (1.15–1.18) to encourage breadth; higher tiers escalate to maintain challenge.
- **Soft caps:** Introduce diminishing returns after 200 units per building (cost multiplier increases by +0.02) to avoid runaway inflation.

### 3.3 Click Mechanics
- Base click = 1 EC; each Reactor Overclock adds +1 EC and +0.5% bonus to all EC/s.
- **Combo meter:** Clicking continuously fills a 10-stack combo (+2% per stack to click value, decays after 3 seconds idle).

## 4. Unlock & Progression Flow
1. **Tutorial Stage (0–1K EC):** Focus on clicking, unlocking Drone Swarm and early Reactor upgrades.
2. **Industrial Stage (1K–50K EC):** Asteroid Miners and Orbital Factories ramp passive income, FP begins to matter.
3. **Military Stage (50K–2M EC):** Battlecruiser Yards unlock assault missions. Players must invest in FP for planet conquests.
4. **Ascension Stage (2M+ EC):** Quantum Forges and Stellar Gates prepare for prestige runs.

### Planet Conquest
- Planets require a mix of EC investment and FP thresholds.
- Example curve:
  | Planet | Required FP | EC Investment | Reward |
  |--------|-------------|---------------|--------|
  | Lunar Outpost | 500 | 25K | Unlocks Battlecruiser Yard, +5% global EC/s. |
  | Red Dwarf Colony | 2,000 | 150K | +1 GI shard, +10% ship attack speed. |
  | Gas Giant Stronghold | 8,000 | 600K | Unlock Quantum Forge research. |
  | Binary Star Fortress | 25,000 | 3M | Earn 1 GI and unlock Stellar Gates. |

- **Balancing lever:** FP decays by 2% on defeat, encouraging diversified investment without hard punishment.

## 5. Upgrade System
### 5.1 Tiered Upgrade Tracks
- **Click Enhancements:** Increase EC per click, add splash damage that generates FP on critical hits.
- **Automation Boosters:** Multiplicative EC/s bonuses tied to owning sets of buildings (e.g., 25 Drone Swarms = +10% Drone EC/s).
- **Fleet Tech:** Spend FP on permanent bonuses (e.g., "Plasma Cannons" give +5% FP generation).
- **Planetary Policies:** Unlocked per conquered planet; act as passive cards that can be equipped (limit 3, expandable to 5 via Stellar Gates).

### 5.2 Balancing Strategy
- Unlock requirements scale on *total EC earned* rather than current balance to avoid brick walls.
- Each new building introduces either a new mechanic (FP, missions, prestige) or strengthens existing systems to keep engagement high.
- Periodic **challenge missions** grant time-limited buffs, encouraging active play without making idle players fall behind.

## 6. Prestige & Long-Term Goals
- **Trigger:** Conquer all planets in a sector (e.g., 6 planets).
- **Reset:** EC, buildings, FP reset; retain achievements and GI.
- **Rewards:** Spend GI on galaxy-wide buffs (e.g., +10% EC/s, +1% FP generation, unlock cosmetic ship skins).
- **Meta Progression:** Multiple sectors with escalating requirements keep the long tail engaging.

## 7. UI/UX Direction
- **Layout:**
  - Left: Reactor click area with retro CRT effects and combo meter.
  - Center: Production panel with buildings/upgrades in tiered cards.
  - Right: Planetary map displaying FP, missions, and conquest progress.
- **Art Direction:** Pixel-art ships, neon vector overlays, starfield background.
- **Feedback:** Explosions and sound pips on clicks, animated ship launch when purchasing Battlecruisers.
- **Accessibility:** High-contrast color palette, toggle for reduced motion, keyboard shortcuts for key actions.

## 8. Technical Implementation (Next.js)
- **Framework:** Next.js App Router with React Server Components for static data (upgrade definitions) and Client Components for interactive gameplay.
- **State Management:** Zustand or Redux Toolkit for deterministic game state; actions typed with TypeScript.
- **Persistence:**
  - LocalStorage for offline progression snapshot (auto-save every 10 seconds).
  - Optional sign-in with NextAuth + Prisma (SQLite or PlanetScale) to sync across devices.
- **Serverless Functions:**
  - `/api/sync` – saves compressed game state.
  - `/api/leaderboard` – reads aggregated stats.
- **Deterministic Tick:** Web Worker managing EC/s and FP updates at 10 Hz to avoid main-thread lag.
- **Testing:** Vitest + React Testing Library for UI, Playwright for regression of core loop.

## 9. Data Structures & Balancing Hooks
```ts
// Example TypeScript schemas
export interface BuildingDefinition {
  id: string;
  name: string;
  baseCost: number;
  costGrowth: number;
  baseOutput: number;
  fpOutput?: number;
  unlock: UnlockCondition;
}

export type UnlockCondition =
  | { type: 'totalCores'; amount: number }
  | { type: 'owned'; buildingId: string; count: number }
  | { type: 'planetConquered'; planetId: string }
  | { type: 'currency'; key: 'fp' | 'gi'; amount: number };
```
- Maintain JSON definitions to enable balance tweaks without touching logic.
- Provide editor tools (simple admin page) to adjust values and preview DPS curves.

## 10. Roadmap
1. **MVP (Week 1–2):** Reactor clicker, Drone Swarm, Asteroid Miner, basic UI, local persistence.
2. **Content Expansion (Week 3–4):** Add FP, Orbital Factory, Battlecruiser Yard, first two planets.
3. **Prestige & Meta (Week 5):** Implement GI, Stellar Gates, leaderboards.
4. **Polish (Week 6):** Pixel art, animations, SFX, accessibility options, performance pass.

## 11. Analytics & Balancing
- Track session length, time-to-first-planet, average GI per prestige.
- Use telemetry to adjust cost multipliers (aim for 20–30 minutes to first prestige cycle).
- A/B test FP decay values and combo meter impact to keep active play rewarding but optional.

## 12. Risks & Mitigations
- **Runaway inflation:** Solve with soft caps and multiplicative buffs tied to achievements.
- **Player churn after prestige:** Introduce unique narrative snippets and cosmetics each sector.
- **Performance:** Offload tick loop to Worker, memoize expensive React components.

