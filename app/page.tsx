'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type Item = {
  id: string;
  name: string;
  baseCost: number;
  costMultiplier: number;
  cps?: number;
  clickBonus?: number;
  clickMultiplier?: number;
  globalMultiplier?: number;
  unlockAt: number;
  description: string;
  tag: string;
};

type Planet = {
  id: string;
  name: string;
  unlockAt: number;
  cost: number;
  cpsMultiplier: number;
  description: string;
};

const facilities: Item[] = [
  {
    id: 'probe',
    name: 'Orbital Probe',
    baseCost: 20,
    costMultiplier: 1.15,
    cps: 0.2,
    unlockAt: 0,
    description: 'Autonomous drone that scoops cosmic cookie crumbs.',
    tag: 'Starter'
  },
  {
    id: 'forge',
    name: 'Stellar Forge',
    baseCost: 120,
    costMultiplier: 1.17,
    cps: 1.6,
    unlockAt: 60,
    description: 'Repurposed space-forge that bakes in microgravity.',
    tag: 'Factory'
  },
  {
    id: 'harvester',
    name: 'Nebula Harvester',
    baseCost: 520,
    costMultiplier: 1.2,
    cps: 6,
    unlockAt: 250,
    description: 'Condenses stellar gases into crystallised sugar.',
    tag: 'Infrastructure'
  },
  {
    id: 'reactor',
    name: 'Quasar Reactor',
    baseCost: 2100,
    costMultiplier: 1.22,
    cps: 18,
    unlockAt: 900,
    description: 'Harnesses quasar jets for exponential baking.',
    tag: 'Power Core'
  }
];

const fleets: Item[] = [
  {
    id: 'scout',
    name: 'Scout Frigate',
    baseCost: 750,
    costMultiplier: 1.22,
    cps: 9,
    unlockAt: 350,
    description: 'Fast strike craft that raids derelict bakeries.',
    tag: 'Fleet'
  },
  {
    id: 'carrier',
    name: 'Carrier Armada',
    baseCost: 4200,
    costMultiplier: 1.23,
    cps: 32,
    unlockAt: 1800,
    description: 'Deploys boarding pods to commandeer ovens galaxy-wide.',
    tag: 'Fleet'
  },
  {
    id: 'dreadnought',
    name: 'Dreadnought Legion',
    baseCost: 16500,
    costMultiplier: 1.25,
    cps: 115,
    unlockAt: 7200,
    description: 'Siege platforms with planet-cracking rolling pins.',
    tag: 'Fleet'
  }
];

const research: Item[] = [
  {
    id: 'gauntlet',
    name: 'Quantum Gauntlet',
    baseCost: 80,
    costMultiplier: 1.6,
    clickBonus: 1,
    unlockAt: 40,
    description: 'Empowers manual clicks with quantum tunnelling.',
    tag: 'Research'
  },
  {
    id: 'synth',
    name: 'Synthwave Algorithms',
    baseCost: 500,
    costMultiplier: 1.7,
    globalMultiplier: 1.1,
    unlockAt: 240,
    description: 'Predictive AI tunes supply lines for +10% output.',
    tag: 'Research'
  },
  {
    id: 'chronoleap',
    name: 'Chrono-Leap Oven',
    baseCost: 4200,
    costMultiplier: 1.65,
    globalMultiplier: 1.12,
    unlockAt: 1900,
    description: 'Loops batches through micro time rifts (+12% CPS).',
    tag: 'Research'
  },
  {
    id: 'gravwell',
    name: 'Gravwell Tongs',
    baseCost: 9500,
    costMultiplier: 1.6,
    clickMultiplier: 1.5,
    unlockAt: 5200,
    description: 'Focuses gravitational waves for mega-clicks.',
    tag: 'Research'
  }
];

const planetCatalog: Planet[] = [
  {
    id: 'asteroid-belt',
    name: 'Asteroid Belt Syndicate',
    unlockAt: 2500,
    cost: 1800,
    cpsMultiplier: 0.08,
    description: 'Secure mining rights for +8% CPS.'
  },
  {
    id: 'europa',
    name: 'Europa Colony',
    unlockAt: 9000,
    cost: 7200,
    cpsMultiplier: 0.12,
    description: 'Flood the ice caverns with bakeries for +12% CPS.'
  },
  {
    id: 'kepler',
    name: 'Kepler Prime',
    unlockAt: 24000,
    cost: 18000,
    cpsMultiplier: 0.18,
    description: 'Ingrain the locals with confectionary diplomacy (+18% CPS).'
  },
  {
    id: 'andromeda',
    name: 'Andromeda Frontier',
    unlockAt: 60000,
    cost: 42000,
    cpsMultiplier: 0.25,
    description: 'Establish a pan-galactic bakery cartel (+25% CPS).'
  }
];

const TICK_MS = 100;
const SAVE_KEY = 'galactic-foundry-save';

const allItems: Item[] = [...facilities, ...fleets, ...research];

const formatNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
};

const getCostForItem = (item: Item, count: number) =>
  Math.floor(item.baseCost * Math.pow(item.costMultiplier, count));

export default function HomePage() {
  const [cookies, setCookies] = useState(0);
  const [totalCookies, setTotalCookies] = useState(0);
  const [purchases, setPurchases] = useState<Record<string, number>>({});
  const [conquered, setConquered] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        cookies: number;
        totalCookies: number;
        purchases: Record<string, number>;
        conquered: string[];
      };
      if (typeof parsed.cookies === 'number') setCookies(parsed.cookies);
      if (typeof parsed.totalCookies === 'number') setTotalCookies(parsed.totalCookies);
      if (parsed.purchases && typeof parsed.purchases === 'object') setPurchases(parsed.purchases);
      if (Array.isArray(parsed.conquered)) setConquered(parsed.conquered);
    } catch (error) {
      console.warn('Failed to load save data', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify({ cookies, totalCookies, purchases, conquered });
    window.localStorage.setItem(SAVE_KEY, payload);
  }, [cookies, totalCookies, purchases, conquered]);

  const clickAdditive = useMemo(
    () =>
      allItems.reduce((sum, item) => sum + (item.clickBonus || 0) * (purchases[item.id] || 0), 0),
    [purchases]
  );

  const clickMultiplier = useMemo(
    () =>
      allItems.reduce(
        (product, item) =>
          product * Math.pow(item.clickMultiplier || 1, purchases[item.id] ? purchases[item.id] : 0),
        1
      ),
    [purchases]
  );

  const baseCps = useMemo(
    () => allItems.reduce((sum, item) => sum + (item.cps || 0) * (purchases[item.id] || 0), 0),
    [purchases]
  );

  const researchMultiplier = useMemo(
    () =>
      allItems.reduce(
        (product, item) =>
          product * Math.pow(item.globalMultiplier || 1, purchases[item.id] ? purchases[item.id] : 0),
        1
      ),
    [purchases]
  );

  const conquestMultiplier = useMemo(
    () =>
      conquered.reduce((product, planetId) => {
        const planet = planetCatalog.find((entry) => entry.id === planetId);
        if (!planet) return product;
        return product * (1 + planet.cpsMultiplier);
      }, 1),
    [conquered]
  );

  const totalCps = useMemo(
    () => baseCps * researchMultiplier * conquestMultiplier,
    [baseCps, researchMultiplier, conquestMultiplier]
  );

  const clickPower = useMemo(
    () => (1 + clickAdditive) * clickMultiplier,
    [clickAdditive, clickMultiplier]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (totalCps <= 0) return;
      const gain = totalCps * (TICK_MS / 1000);
      setCookies((prev) => prev + gain);
      setTotalCookies((prev) => prev + gain);
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [totalCps]);

  const handleManualClick = () => {
    setCookies((prev) => prev + clickPower);
    setTotalCookies((prev) => prev + clickPower);
  };

  const buyItem = (item: Item) => {
    const owned = purchases[item.id] || 0;
    const cost = getCostForItem(item, owned);
    if (cookies < cost) return;
    setCookies((prev) => prev - cost);
    setPurchases((prev) => ({ ...prev, [item.id]: owned + 1 }));
  };

  const conquerPlanet = (planet: Planet) => {
    if (conquered.includes(planet.id)) return;
    if (cookies < planet.cost) return;
    setCookies((prev) => prev - planet.cost);
    setConquered((prev) => [...prev, planet.id]);
  };

  const renderItemCard = (item: Item) => {
    const owned = purchases[item.id] || 0;
    const cost = getCostForItem(item, owned);
    const unlocked = totalCookies >= item.unlockAt || owned > 0;
    if (!unlocked) {
      return (
        <article key={item.id} className={`${styles.card} ${styles.lockedCard}`}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{item.name}</span>
            <span className={styles.tag}>{item.tag}</span>
          </div>
          <span>Unlocks at {formatNumber(item.unlockAt)} cookies forged.</span>
        </article>
      );
    }

    const meta: string[] = [];
    if (item.cps) meta.push(`+${formatNumber(item.cps)} /s`);
    if (item.clickBonus) meta.push(`+${formatNumber(item.clickBonus)} click power`);
    if (item.clickMultiplier && item.clickMultiplier !== 1)
      meta.push(`x${item.clickMultiplier.toFixed(2)} click`);
    if (item.globalMultiplier && item.globalMultiplier !== 1)
      meta.push(`+${Math.round((item.globalMultiplier - 1) * 100)}% CPS`);

    return (
      <article key={item.id} className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>{item.name}</div>
            <div className={styles.cost}>Cost: {formatNumber(cost)} cookies</div>
          </div>
          <span className={styles.tag}>{item.tag}</span>
        </div>
        <p className={styles.description}>{item.description}</p>
        <div className={styles.meta}>
          <span>Owned: {owned}</span>
          {meta.map((entry) => (
            <span key={entry}>{entry}</span>
          ))}
        </div>
        <button className={styles.buyButton} disabled={cookies < cost} onClick={() => buyItem(item)}>
          Purchase
        </button>
      </article>
    );
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1>Galactic Cookie Foundry</h1>
          <p className={styles.subtitle}>
            Forge cosmic confectionery, assemble invasion fleets, and conquer distant worlds.
          </p>
        </header>

        <section className={styles.hud}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Cookies</span>
            <span className={styles.statValue}>{formatNumber(cookies)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Total Baked</span>
            <span className={styles.statValue}>{formatNumber(totalCookies)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Cookies / Second</span>
            <span className={styles.statValue}>{formatNumber(totalCps)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Click Power</span>
            <span className={styles.statValue}>{formatNumber(clickPower)}</span>
          </div>
        </section>

        <div className={styles.columns}>
          <section>
            <div className={styles.clickZone}>
              <h2 className={styles.panelTitle}>Manual Production</h2>
              <button className={styles.bigButton} onClick={handleManualClick}>
                Forge Cookie +{formatNumber(clickPower)}
              </button>
              <p className={styles.flavorText}>
                Each click channels reactor heat into a perfect, shimmering cookie.
              </p>
            </div>

            <div className={styles.planets}>
              <h2 className={styles.panelTitle}>Galactic Conquest</h2>
              {planetCatalog.map((planet) => {
                const unlocked = totalCookies >= planet.unlockAt || conquered.includes(planet.id);
                const conqueredPlanet = conquered.includes(planet.id);
                return (
                  <article key={planet.id} className={styles.planetCard}>
                    <div className={styles.planetTitleRow}>
                      <div>
                        <div className={styles.cardTitle}>{planet.name}</div>
                        <div className={styles.cost}>Tribute: {formatNumber(planet.cost)} cookies</div>
                      </div>
                      <span className={`${styles.tag} ${conqueredPlanet ? styles.conqueredTag : ''}`}>
                        {conqueredPlanet ? 'Conquered' : 'Target'}
                      </span>
                    </div>
                    <p className={styles.description}>{planet.description}</p>
                    <div className={styles.meta}>
                      <span>Unlocks at {formatNumber(planet.unlockAt)} total cookies</span>
                      <span>Bonus: +{Math.round(planet.cpsMultiplier * 100)}% CPS</span>
                    </div>
                    <button
                      className={styles.planetButton}
                      disabled={!unlocked || conqueredPlanet || cookies < planet.cost}
                      onClick={() => conquerPlanet(planet)}
                    >
                      {conqueredPlanet ? 'Secured' : 'Conquer'}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className={styles.panelTitle}>Industrial Facilities</h2>
            <div className={styles.cardStack}>{facilities.map((item) => renderItemCard(item))}</div>

            <h2 className={styles.panelTitle} style={{ marginTop: '1.5rem' }}>
              Fleet Command
            </h2>
            <div className={styles.cardStack}>{fleets.map((item) => renderItemCard(item))}</div>

            <h2 className={styles.panelTitle} style={{ marginTop: '1.5rem' }}>
              Research &amp; Upgrades
            </h2>
            <div className={styles.cardStack}>{research.map((item) => renderItemCard(item))}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
