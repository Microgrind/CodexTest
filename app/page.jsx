
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const APP_ID = process.env.NEXT_PUBLIC_APP_ID || "nut-invaders";
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedFirebase = null;

const PREVIEW_USER = {
  uid: "preview-user",
  displayName: "Preview Commander",
  email: "preview@local",
};

const PREVIEW_STORAGE_KEY = "nut-invaders-preview-profile";

function ensureFirebase() {
  if (cachedFirebase) {
    return cachedFirebase;
  }
  if (typeof window === "undefined") {
    cachedFirebase = { ready: false };
    return cachedFirebase;
  }
  const missingConfig = Object.values(firebaseConfig).every((value) => !value);
  if (missingConfig) {
    cachedFirebase = { ready: false };
    return cachedFirebase;
  }
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  cachedFirebase = {
    ready: true,
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
  return cachedFirebase;
}

function useFirebaseServices() {
  const [services, setServices] = useState(() => ensureFirebase());
  useEffect(() => {
    setServices(ensureFirebase());
  }, []);
  return services;
}

function useFirebaseUser(auth) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!auth) {
      return undefined;
    }
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      setUser(next);
    });
    return () => unsubscribe();
  }, [auth]);
  return user;
}

const INITIAL_USER_STATE = {
  nuts: 10,
  nutsPerSecond: 0,
  clickMultiplier: 1,
  upgrades: {},
  fleetSize: 0,
  homePlanetId: null,
  tradeRoutes: [],
  frenzyBoostUntil: null,
};

const UPGRADE_CATEGORIES = {
  industry: {
    id: "industry",
    label: "Factory Systems",
    blurb: "Scale the nut works with automated roasting and orbital forging.",
  },
  click: {
    id: "click",
    label: "Manual Offense",
    blurb: "Sharpen your clicking edge for devastating volleys.",
  },
  logistics: {
    id: "logistics",
    label: "Logistics",
    blurb: "Amplify trade hauls and territorial reach.",
  },
  warfare: {
    id: "warfare",
    label: "Warfare",
    blurb: "Fortify planets and manipulate invasion tempos.",
  },
};

const UPGRADE_DEFS = {
  autoStroker: {
    id: "autoStroker",
    category: "industry",
    label: "Auto-Stroker",
    description: "Installs basic nut automation adding +2 NPS per level.",
    baseCost: 25,
    costMultiplier: 1.35,
    perLevelNps: 2,
  },
  roastingKiln: {
    id: "roastingKiln",
    category: "industry",
    label: "Roasting Kiln",
    description: "Boosts passive nut output by +15% per level.",
    baseCost: 160,
    costMultiplier: 1.55,
    perLevelMultiplier: 0.15,
    requires: { autoStroker: 3 },
  },
  orbitalFoundry: {
    id: "orbitalFoundry",
    category: "industry",
    label: "Orbital Foundry",
    description: "Forges hull plating that adds +1 base NPS per Auto-Stroker level.",
    baseCost: 360,
    costMultiplier: 1.6,
    perLevelAutoBonus: 1,
    requires: { autoStroker: 6 },
  },
  edgeMultiplier: {
    id: "edgeMultiplier",
    category: "click",
    label: "Edge Multiplier",
    description: "Boosts manual clicks by +0.5 multiplier per level.",
    baseCost: 15,
    costMultiplier: 1.5,
    perLevelClick: 0.5,
  },
  shellAblator: {
    id: "shellAblator",
    category: "click",
    label: "Shell Ablator",
    description: "Installs recoil springs granting +0.75 click power per level.",
    baseCost: 120,
    costMultiplier: 1.6,
    perLevelClick: 0.75,
    requires: { edgeMultiplier: 4 },
  },
  goonerFlare: {
    id: "goonerFlare",
    category: "warfare",
    label: "Gooner Flare",
    description: "Raises frenzied goon odds by +5% per level.",
    baseCost: 100,
    costMultiplier: 1.8,
    perLevelChance: 0.05,
  },
  orbitalTradeNet: {
    id: "orbitalTradeNet",
    category: "logistics",
    label: "Orbital Trade Net",
    description: "Amplifies trade payouts by +25% per route level.",
    baseCost: 220,
    costMultiplier: 1.65,
    perLevelTrade: 0.25,
    requiresPlanets: 1,
  },
  wormholeBroker: {
    id: "wormholeBroker",
    category: "logistics",
    label: "Wormhole Broker",
    description: "Cuts claim costs by 10% per level (minimum cost applies).",
    baseCost: 280,
    costMultiplier: 1.6,
    perLevelDiscount: 0.1,
    requiresPlanets: 2,
  },
  commandBridge: {
    id: "commandBridge",
    category: "logistics",
    label: "Command Bridge",
    description: "Expands fleet control, adding +1 trade route capacity per level.",
    baseCost: 320,
    costMultiplier: 1.7,
    perLevelCapacity: 1,
    requires: { orbitalTradeNet: 2 },
  },
  siegeRelay: {
    id: "siegeRelay",
    category: "warfare",
    label: "Siege Relay",
    description: "Scrambles enemy shields, reducing effective defense by 1 per level when you attack.",
    baseCost: 260,
    costMultiplier: 1.55,
    perLevelDefensePierce: 1,
    requiresPlanets: 1,
  },
};

const ATTACK_WINDOW_MS = 5 * 60 * 1000;

const TABS = [
  { id: "factory", label: "Factory" },
  { id: "fleet", label: "Fleet" },
  { id: "galaxy", label: "Galaxy" },
  { id: "arcade", label: "Arcade" },
  { id: "attack", label: "Attack" },
  { id: "defense", label: "Defense" },
];

const PLANET_COLORS = {
  unclaimed: "border-emerald-500/40 bg-emerald-900/40",
  player: "border-emerald-200 bg-emerald-500/40 shadow-[0_0_18px_rgba(74,222,128,0.55)]",
  enemy: "border-cyan-300/70 bg-emerald-950/60",
  attack: "border-rose-300 bg-rose-700/50 shadow-[0_0_20px_rgba(251,113,133,0.6)] animate-pulse",
};

function getUpgradeLevel(profile, id) {
  return profile?.upgrades?.[id] ?? 0;
}

function getUpgradeCost(profile, def) {
  const level = getUpgradeLevel(profile, def.id);
  return Math.round(def.baseCost * Math.pow(def.costMultiplier, level));
}

function formatNumber(value) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return Math.floor(value).toLocaleString();
}

function deriveNps(profile) {
  const autoLevel = getUpgradeLevel(profile, "autoStroker");
  if (autoLevel === 0) {
    return 0;
  }
  const foundryLevel = getUpgradeLevel(profile, "orbitalFoundry");
  const kilnLevel = getUpgradeLevel(profile, "roastingKiln");
  const perAuto =
    UPGRADE_DEFS.autoStroker.perLevelNps +
    foundryLevel * (UPGRADE_DEFS.orbitalFoundry.perLevelAutoBonus || 0);
  const base = autoLevel * perAuto;
  const multiplier = 1 + kilnLevel * (UPGRADE_DEFS.roastingKiln.perLevelMultiplier || 0);
  const frenzyActive = profile?.frenzyBoostUntil && profile.frenzyBoostUntil > Date.now();
  const total = base * multiplier;
  return frenzyActive ? total * 2 : total;
}

function deriveClickMultiplier(profile) {
  const base =
    1 +
    getUpgradeLevel(profile, "edgeMultiplier") * UPGRADE_DEFS.edgeMultiplier.perLevelClick +
    getUpgradeLevel(profile, "shellAblator") * (UPGRADE_DEFS.shellAblator.perLevelClick || 0);
  const frenzyActive = profile?.frenzyBoostUntil && profile.frenzyBoostUntil > Date.now();
  return frenzyActive ? base * 2 : base;
}

function getOwnedPlanetCount(profile, planets) {
  if (!profile || !planets) {
    return 0;
  }
  return planets.filter((planet) => planet.ownerId === profile.userId).length;
}

function deriveTradeRoutePayout(profile) {
  const base = 500;
  const tradeLevel = getUpgradeLevel(profile, "orbitalTradeNet");
  const multiplier = 1 + tradeLevel * (UPGRADE_DEFS.orbitalTradeNet.perLevelTrade || 0);
  return Math.floor(base * multiplier);
}

function getFleetCapacity(profile) {
  const base = profile?.fleetSize ?? 0;
  const bonus = getUpgradeLevel(profile, "commandBridge") * (UPGRADE_DEFS.commandBridge.perLevelCapacity || 0);
  return base + bonus;
}

function getNextShipCost(profile) {
  const fleetSize = profile?.fleetSize ?? 0;
  return Math.floor(200 * Math.pow(1.65, fleetSize));
}

function getClaimCost(profile, planets) {
  const owned = getOwnedPlanetCount(profile, planets);
  const baseCost = 400 + owned * 250;
  const discountLevel = getUpgradeLevel(profile, "wormholeBroker");
  const rawDiscount = discountLevel * (UPGRADE_DEFS.wormholeBroker.perLevelDiscount || 0);
  const discount = Math.min(rawDiscount, 0.6);
  return Math.max(150, Math.floor(baseCost * (1 - discount)));
}

function getDefenseUpgradeCost(planet) {
  const level = planet?.defenseLevel ?? 1;
  return Math.floor(300 * Math.pow(1.45, level - 1));
}

function isUpgradeUnlocked(profile, upgrade, planets) {
  if (!upgrade) {
    return true;
  }
  if (!profile) {
    return false;
  }
  if (upgrade.requires) {
    const meetsTree = Object.entries(upgrade.requires).every(([id, level]) => getUpgradeLevel(profile, id) >= level);
    if (!meetsTree) {
      return false;
    }
  }
  if (upgrade.requiresPlanets) {
    const ownedPlanets = getOwnedPlanetCount(profile, planets || []);
    if (ownedPlanets < upgrade.requiresPlanets) {
      return false;
    }
  }
  return true;
}

function getUpgradeUnlockText(upgrade) {
  const parts = [];
  if (upgrade.requires) {
    Object.entries(upgrade.requires).forEach(([id, level]) => {
      const ref = UPGRADE_DEFS[id];
      parts.push(`${ref?.label || id} Lv ${level}`);
    });
  }
  if (upgrade.requiresPlanets) {
    parts.push(`${upgrade.requiresPlanets} owned planet${upgrade.requiresPlanets > 1 ? "s" : ""}`);
  }
  return parts.join(", ");
}

function deriveEffectiveDefenseLevel(planetDefense, attackerProfile) {
  const pierceLevel = getUpgradeLevel(attackerProfile, "siegeRelay");
  const pierce = pierceLevel * (UPGRADE_DEFS.siegeRelay.perLevelDefensePierce || 0);
  return Math.max(1, Math.round((planetDefense ?? 1) - pierce));
}

function generateFallbackPlanets() {
  return Array.from({ length: 18 }).map((_, index) => {
    const id = `P-${101 + index}`;
    return {
      id,
      planetId: id,
      name: `Mock Planet ${index + 1}`,
      coordinates: { x: Math.random() * 100, y: Math.random() * 100 },
      ownerId: null,
      ownerUsername: null,
      function: index % 2 === 0 ? "RESOURCE" : "POWER",
      defenseLevel: 1 + (index % 5),
      tradeRouteActive: false,
      isUnderAttack: false,
      attackerId: null,
      attackerUsername: null,
      attackInitiatedAt: null,
      attackEndsAt: null,
      attackToken: null,
    };
  });
}

function usePlanets(db, ready) {
  const [planets, setPlanets] = useState(() => generateFallbackPlanets());

  useEffect(() => {
    if (!ready || !db) {
      return undefined;
    }
    const planetsRef = collection(db, "artifacts", APP_ID, "public", "data", "planets");
    const unsubscribe = onSnapshot(planetsRef, (snapshot) => {
      if (snapshot.empty) {
        return;
      }
      const result = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setPlanets(result);
    });
    return () => unsubscribe();
  }, [db, ready]);

  return [planets, setPlanets];
}

function useUserProfile(db, ready, user, previewMode) {
  const [profile, setProfile] = useState(null);
  const previewLoadedRef = useRef(false);

  const profileRef = useMemo(() => {
    if (previewMode || !ready || !db || !user) {
      return null;
    }
    return doc(db, "artifacts", APP_ID, "users", user.uid, "user_data");
  }, [db, previewMode, ready, user]);

  useEffect(() => {
    if (!previewMode) {
      previewLoadedRef.current = false;
      return;
    }
    if (previewLoadedRef.current) {
      return;
    }
    previewLoadedRef.current = true;
    if (typeof window === "undefined") {
      setProfile({
        ...INITIAL_USER_STATE,
        userId: PREVIEW_USER.uid,
        username: user?.displayName || PREVIEW_USER.displayName,
      });
      return;
    }
    try {
      const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setProfile({
          ...INITIAL_USER_STATE,
          ...parsed,
          userId: PREVIEW_USER.uid,
          username: parsed.username || PREVIEW_USER.displayName,
        });
        return;
      }
    } catch (err) {
      console.warn("Failed to load preview profile", err);
    }
    setProfile({
      ...INITIAL_USER_STATE,
      userId: PREVIEW_USER.uid,
      username: user?.displayName || PREVIEW_USER.displayName,
    });
  }, [previewMode, user?.displayName]);

  useEffect(() => {
    if (!previewMode || !profile || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        PREVIEW_STORAGE_KEY,
        JSON.stringify({
          ...profile,
          userId: PREVIEW_USER.uid,
        })
      );
    } catch (err) {
      console.warn("Failed to persist preview profile", err);
    }
  }, [previewMode, profile]);

  useEffect(() => {
    if (previewMode || !profileRef) {
      return undefined;
    }
    const unsubscribe = onSnapshot(profileRef, (snapshot) => {
      if (!snapshot.exists()) {
        setProfile(null);
        return;
      }
      setProfile(snapshot.data());
    });
    return () => unsubscribe();
  }, [previewMode, profileRef]);

  useEffect(() => {
    if (previewMode || !profileRef || !db || !ready || !user || profile) {
      return;
    }
    const initializeProfile = async () => {
      const existing = await getDoc(profileRef);
      if (existing.exists()) {
        return;
      }
      await setDoc(profileRef, {
        userId: user.uid,
        username: user.displayName || user.email?.split("@")[0] || "Pilot",
        ...INITIAL_USER_STATE,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    };
    initializeProfile();
  }, [db, previewMode, profile, profileRef, ready, user]);

  return [profile, setProfile, profileRef];
}

const DEFENSE_SEQUENCE_COLORS = ["bg-amber-400", "bg-emerald-400", "bg-blue-400", "bg-rose-400"];

function SpaceInvadersMinigame({ defenseLevel, practice = false, onComplete, onCancel }) {
  const canvasRef = useRef(null);
  const [message, setMessage] = useState(
    practice ? "Clear 3 waves to complete the simulation." : "Clear 3 waves to plant the bomb."
  );
  const waveRef = useRef(1);
  const playerRef = useRef({ x: 280, y: 360, width: 40, height: 16, speed: 4 });
  const bulletsRef = useRef([]);
  const enemiesRef = useRef([]);
  const enemyBulletsRef = useRef([]);
  const keysRef = useRef({});
  const livesRef = useRef(3);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return undefined;
    }
    const width = canvas.width;
    const height = canvas.height;

    const createWave = (wave) => {
      const rows = 2 + Math.min(4, wave + Math.floor(defenseLevel / 2));
      const cols = 6 + Math.floor(defenseLevel / 2);
      const enemies = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          enemies.push({
            x: 40 + col * 60,
            y: 40 + row * 40,
            width: 36,
            height: 24,
            hp: defenseLevel >= 5 ? 2 : 1,
          });
        }
      }
      enemiesRef.current = enemies;
    };

    const resetGame = () => {
      waveRef.current = 1;
      livesRef.current = 3;
      bulletsRef.current = [];
      enemyBulletsRef.current = [];
      createWave(waveRef.current);
      setMessage(practice ? "Simulation Wave 1" : "Wave 1");
    };

    resetGame();

    const onKeyDown = (event) => {
      keysRef.current[event.key] = true;
    };
    const onKeyUp = (event) => {
      keysRef.current[event.key] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const shoot = () => {
      bulletsRef.current.push({
        x: playerRef.current.x + playerRef.current.width / 2 - 2,
        y: playerRef.current.y,
        width: 4,
        height: 12,
        speed: 6,
      });
    };

    const spawnEnemyBullet = (enemy) => {
      enemyBulletsRef.current.push({
        x: enemy.x + enemy.width / 2 - 2,
        y: enemy.y + enemy.height,
        width: 4,
        height: 12,
        speed: 2.5 + defenseLevel * 0.2,
      });
    };

    let shootCooldown = 0;
    let enemyCooldown = 0;
    let direction = 1;

    const loop = () => {
      animationRef.current = requestAnimationFrame(loop);
      ctx.fillStyle = "#050516";
      ctx.fillRect(0, 0, width, height);

      const player = playerRef.current;
      if (keysRef.current["ArrowLeft"]) {
        player.x = Math.max(10, player.x - player.speed);
      }
      if (keysRef.current["ArrowRight"]) {
        player.x = Math.min(width - player.width - 10, player.x + player.speed);
      }
      if (keysRef.current[" "] || keysRef.current["ArrowUp"]) {
        if (shootCooldown <= 0) {
          shoot();
          shootCooldown = 12 - Math.min(6, defenseLevel);
        }
      }
      shootCooldown -= 1;

      ctx.fillStyle = "#facc15";
      ctx.fillRect(player.x, player.y, player.width, player.height);

      bulletsRef.current = bulletsRef.current
        .map((bullet) => ({ ...bullet, y: bullet.y - bullet.speed }))
        .filter((bullet) => bullet.y + bullet.height > 0);

      ctx.fillStyle = "#fde68a";
      bulletsRef.current.forEach((bullet) => {
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
      });

      const horizontalSpeed = 0.3 + defenseLevel * 0.05 + waveRef.current * 0.1;
      let minX = width;
      let maxX = 0;
      enemiesRef.current.forEach((enemy) => {
        minX = Math.min(minX, enemy.x);
        maxX = Math.max(maxX, enemy.x + enemy.width);
      });
      if (maxX >= width - 20) {
        direction = -1;
        enemiesRef.current = enemiesRef.current.map((enemy) => ({
          ...enemy,
          y: enemy.y + 10,
        }));
      } else if (minX <= 20) {
        direction = 1;
        enemiesRef.current = enemiesRef.current.map((enemy) => ({
          ...enemy,
          y: enemy.y + 10,
        }));
      }
      enemiesRef.current = enemiesRef.current.map((enemy) => ({
        ...enemy,
        x: enemy.x + horizontalSpeed * direction,
      }));

      ctx.fillStyle = "#22d3ee";
      enemiesRef.current.forEach((enemy) => {
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
      });

      bulletsRef.current.forEach((bullet) => {
        enemiesRef.current.forEach((enemy) => {
          const collides =
            bullet.x < enemy.x + enemy.width &&
            bullet.x + bullet.width > enemy.x &&
            bullet.y < enemy.y + enemy.height &&
            bullet.y + bullet.height > enemy.y;
          if (collides) {
            enemy.hp -= 1;
            bullet.hit = true;
          }
        });
      });
      enemiesRef.current = enemiesRef.current.filter((enemy) => enemy.hp > 0);
      bulletsRef.current = bulletsRef.current.filter((bullet) => !bullet.hit);

      enemyCooldown -= 1;
      if (enemyCooldown <= 0 && enemiesRef.current.length > 0) {
        const shooters = enemiesRef.current.slice(0, 4 + defenseLevel);
        shooters.forEach((enemy) => {
          if (Math.random() < 0.02 + defenseLevel * 0.01) {
            spawnEnemyBullet(enemy);
          }
        });
        enemyCooldown = 30;
      }

      enemyBulletsRef.current = enemyBulletsRef.current
        .map((shot) => ({ ...shot, y: shot.y + shot.speed }))
        .filter((shot) => shot.y < height);

      ctx.fillStyle = "#f87171";
      enemyBulletsRef.current.forEach((shot) => {
        ctx.fillRect(shot.x, shot.y, shot.width, shot.height);
      });

      enemyBulletsRef.current.forEach((shot) => {
        const collides =
          shot.x < player.x + player.width &&
          shot.x + shot.width > player.x &&
          shot.y < player.y + player.height &&
          shot.y + shot.height > player.y;
        if (collides) {
          shot.hit = true;
          livesRef.current -= 1;
          setMessage(`Hit! Lives remaining: ${livesRef.current}`);
          if (livesRef.current <= 0) {
            cancelAnimationFrame(animationRef.current);
            onComplete?.(false);
          }
        }
      });
      enemyBulletsRef.current = enemyBulletsRef.current.filter((shot) => !shot.hit);

      if (enemiesRef.current.length === 0) {
        waveRef.current += 1;
        if (waveRef.current > 3) {
          cancelAnimationFrame(animationRef.current);
          onComplete?.(true);
          setMessage(practice ? "Simulation complete!" : "Bomb planted! Await defender response.");
        } else {
          setMessage(practice ? `Simulation Wave ${waveRef.current}` : `Wave ${waveRef.current}`);
          createWave(waveRef.current);
        }
      }
    };

    loop();

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [defenseLevel, onComplete, practice]);

  return (
    <div className="retro-panel space-y-4 p-6 text-emerald-100">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="retro-subheading text-lg font-semibold text-emerald-200">
            {practice ? "Space Invaders Training" : "Space Invaders Offensive"}
          </h3>
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">Defense Level {defenseLevel}</p>
        </div>
        <button
          type="button"
          className="retro-button retro-button--danger px-4 py-1 text-xs"
          onClick={onCancel}
        >
          {practice ? "Exit" : "Cancel"}
        </button>
      </div>
      <p className="text-sm text-emerald-200/80">{message}</p>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full rounded border border-emerald-400/40 bg-emerald-950/60 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
      />
      <p className="text-xs text-emerald-200/70">Controls: Arrow keys to move, Space/Up to fire.</p>
    </div>
  );
}

function DefenseMinigame({ defenseLevel, attackerUsername, attackDeadline, practice = false, onComplete, onCancel }) {
  const [sequence, setSequence] = useState([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [isShowing, setIsShowing] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(-1);
  const targetRounds = 3;
  const [timeLeft, setTimeLeft] = useState(() => (attackDeadline ? attackDeadline - Date.now() : null));
  const endedRef = useRef(false);

  const sequenceLength = useMemo(() => Math.min(8, 4 + defenseLevel), [defenseLevel]);
  const displaySpeed = useMemo(() => Math.max(400 - defenseLevel * 25, 120), [defenseLevel]);

  useEffect(() => {
    if (!isShowing) {
      return undefined;
    }
    if (displayIndex >= sequence.length) {
      const timeout = setTimeout(() => {
        setIsShowing(false);
        setDisplayIndex(-1);
      }, displaySpeed);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => {
      setDisplayIndex((index) => index + 1);
    }, displaySpeed);
    return () => clearTimeout(timeout);
  }, [displayIndex, displaySpeed, isShowing, sequence.length]);

  useEffect(() => {
    if (practice || !attackDeadline) {
      return undefined;
    }
    const tick = () => {
      const remaining = attackDeadline - Date.now();
      if (remaining <= 0 && !endedRef.current) {
        endedRef.current = true;
        setTimeLeft(0);
        onComplete?.(false);
      } else {
        setTimeLeft(Math.max(0, remaining));
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attackDeadline, onComplete, practice]);

  useEffect(() => {
    endedRef.current = false;
  }, [attackDeadline, practice]);

  const startRound = () => {
    const nextSequence = Array.from({ length: sequenceLength }).map(() =>
      Math.floor(Math.random() * DEFENSE_SEQUENCE_COLORS.length)
    );
    setSequence(nextSequence);
    setInputIndex(0);
    setRound((value) => value + 1);
    setIsShowing(true);
    setDisplayIndex(0);
  };

  const handlePlayerPress = (index) => {
    if (isShowing || sequence.length === 0) {
      return;
    }
    const expected = sequence[inputIndex];
    if (index === expected) {
      if (inputIndex + 1 >= sequence.length) {
        if (round >= targetRounds) {
          onComplete?.(true);
        } else {
          startRound();
        }
      } else {
        setInputIndex((value) => value + 1);
      }
    } else {
      onComplete?.(false);
    }
  };

  return (
    <div className="retro-panel space-y-4 p-6 text-emerald-100">
      <div className="flex items-center justify-between">
        <h3 className="retro-subheading text-lg font-semibold text-emerald-200">Defense Memory Lock</h3>
        <button
          type="button"
          className="retro-button retro-button--danger px-4 py-1 text-xs"
          onClick={onCancel}
        >
          {practice ? "Exit" : "Leave"}
        </button>
      </div>
      <p className="text-sm text-emerald-200/80">
        {practice
          ? "Run simulations to memorize the sequence order. Difficulty scales with defense level."
          : `Repeat ${targetRounds} sequences to diffuse the bomb from ${attackerUsername || "an invader"}.`}
      </p>
      {!practice && typeof timeLeft === "number" && (
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-200">
          Time Remaining: {`${Math.max(0, Math.floor(timeLeft / 60000))}:${String(Math.floor((timeLeft % 60000) / 1000)).padStart(2, "0")}`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        {DEFENSE_SEQUENCE_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            className={`aspect-square rounded-xl border-2 border-emerald-400/40 ${color} transition-transform hover:scale-105 ${
              isShowing && sequence[displayIndex] === index ? "ring-4 ring-emerald-200" : ""
            }`}
            onClick={() => handlePlayerPress(index)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-emerald-200/70">
        <span>Round: {round}</span>
        <span>Sequence Length: {sequenceLength}</span>
      </div>
      <button
        type="button"
        className="retro-button"
        onClick={startRound}
      >
        {round === 0 ? (practice ? "Begin Simulation" : "Begin Defense") : "Replay Sequence"}
      </button>
    </div>
  );
}

function Leaderboard({ planets }) {
  const leaderboard = useMemo(() => {
    const standings = new Map();
    planets.forEach((planet) => {
      if (!planet.ownerUsername) {
        return;
      }
      standings.set(planet.ownerUsername, (standings.get(planet.ownerUsername) || 0) + 1);
    });
    return Array.from(standings.entries())
      .map(([username, planetsOwned]) => ({ username, planetsOwned }))
      .sort((a, b) => b.planetsOwned - a.planetsOwned);
  }, [planets]);

  if (leaderboard.length === 0) {
    return (
      <div className="retro-panel p-4 text-sm text-emerald-200/80">
        Colonize your first planet to appear on the leaderboard.
      </div>
    );
  }

  return (
    <div className="retro-panel p-5 text-emerald-100">
      <h4 className="retro-subheading text-lg font-semibold text-emerald-200">Planetary Supremacy</h4>
      <ul className="mt-3 space-y-2 text-sm text-emerald-100/90">
        {leaderboard.map((entry, index) => (
          <li key={entry.username} className="flex items-center justify-between">
            <span className="font-medium text-emerald-100">#{index + 1} {entry.username}</span>
            <span className="text-emerald-200">{entry.planetsOwned} planets</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GalaxyMap({ planets, profile, onClaimPlanet, onAttackPlanet, onToggleTradeRoute, onUpgradeDefense }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentUserId = profile?.userId;
  const homePlanetId = profile?.homePlanetId;
  const claimCost = getClaimCost(profile, planets);
  const hasShip = (profile?.fleetSize ?? 0) > 0;

  return (
    <div className="retro-panel space-y-4 p-6 text-emerald-100">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h3 className="retro-subheading text-xl font-semibold text-emerald-200">Nut Galaxy</h3>
        <p className="text-sm text-emerald-200/70">Tap a planet to manage ownership and routes.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {planets.map((planet) => {
          const isUnclaimed = !planet.ownerId;
          const isPlayer = planet.ownerId === currentUserId;
          const isHome = planet.planetId === homePlanetId;
          const isUnderAttack = planet.isUnderAttack;
          const defenseLevel = planet.defenseLevel;
          const timeRemaining = planet.attackEndsAt ? Math.max(0, planet.attackEndsAt - now) : null;
          const countdown = timeRemaining
            ? `${Math.floor(timeRemaining / 60000)}:${String(Math.floor((timeRemaining % 60000) / 1000)).padStart(2, "0")}`
            : null;
          const defenseCost = getDefenseUpgradeCost(planet);
          const defenseMaxed = defenseLevel >= 10;
          const canUpgradeDefense = (profile?.nuts ?? 0) >= defenseCost && !defenseMaxed;
          const cardColor = isUnderAttack
            ? PLANET_COLORS.attack
            : isPlayer
            ? PLANET_COLORS.player
            : PLANET_COLORS.enemy;
          return (
            <div
              key={planet.planetId}
              className={`flex h-full flex-col justify-between rounded-xl border p-4 shadow-[0_0_18px_rgba(16,185,129,0.35)] transition-transform hover:-translate-y-1 ${cardColor}`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-emerald-100">
                    {planet.name}
                    {isHome && (
                      <span className="retro-chip ml-2 inline-block px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.25em]">
                        Home
                      </span>
                    )}
                  </h4>
                  <span className="retro-chip inline-block px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.25em]">
                    {planet.function}
                  </span>
                </div>
                <p className="text-sm text-emerald-100">
                  Defense Level: <span className="font-semibold">{defenseLevel}</span>
                </p>
                <p className="text-xs text-emerald-200/70">
                  {isUnderAttack
                    ? `Under attack by ${planet.attackerUsername || "Unknown"}`
                    : isUnclaimed
                    ? "Unclaimed"
                    : `Controlled by ${planet.ownerUsername}`}
                </p>
                {countdown && (
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-200">Timer: {countdown}</p>
                )}
              </div>
              <div className="mt-4 space-y-2 text-xs">
                {isUnclaimed ? (
                  <>
                    <button
                      type="button"
                      className={`retro-button w-full ${
                        !hasShip || (profile?.nuts ?? 0) < claimCost ? "cursor-not-allowed opacity-40" : ""
                      }`}
                      onClick={() => hasShip && (profile?.nuts ?? 0) >= claimCost && onClaimPlanet?.(planet)}
                      disabled={!hasShip || (profile?.nuts ?? 0) < claimCost}
                    >
                      Claim for {formatNumber(claimCost)} nuts
                    </button>
                    <p className="text-[0.65rem] text-emerald-200/70">Requires an available Nut Ship.</p>
                  </>
                ) : isPlayer ? (
                  <>
                    <button
                      type="button"
                      className={`retro-button w-full ${planet.isUnderAttack ? "cursor-not-allowed opacity-40" : ""}`}
                      onClick={() => !planet.isUnderAttack && onToggleTradeRoute?.(planet)}
                      disabled={planet.isUnderAttack}
                    >
                      {planet.tradeRouteActive ? "Deactivate" : "Activate"} Trade Route
                    </button>
                    <button
                      type="button"
                      className={`retro-button w-full ${
                        !canUpgradeDefense ? "cursor-not-allowed opacity-40" : ""
                      }`}
                      onClick={() => canUpgradeDefense && onUpgradeDefense?.(planet)}
                      disabled={!canUpgradeDefense}
                    >
                      {defenseMaxed ? "Defense Maxed" : `Upgrade Defense (${formatNumber(defenseCost)})`}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`retro-button retro-button--danger w-full ${
                      planet.isUnderAttack ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    onClick={() => !planet.isUnderAttack && onAttackPlanet?.(planet)}
                    disabled={planet.isUnderAttack}
                  >
                    Attack Planet
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FleetManagement({ profile, onBuyShip, onToggleTradeRoute, planets }) {
  const nextShipCost = useMemo(() => getNextShipCost(profile), [profile]);
  const tradePayout = useMemo(() => deriveTradeRoutePayout(profile), [profile]);
  const routeCapacity = useMemo(() => getFleetCapacity(profile), [profile]);
  const routesUsed = profile?.tradeRoutes?.length || 0;
  const ownedPlanets = useMemo(
    () => planets.filter((planet) => planet.ownerId === profile?.userId),
    [planets, profile?.userId]
  );

  return (
    <div className="space-y-6">
      <div className="retro-panel p-6 text-emerald-100">
        <h3 className="retro-subheading text-xl font-semibold text-emerald-200">Nut Fleet Command</h3>
        <p className="mt-2 text-sm text-emerald-200/70">
          Expand your fleet to unlock simultaneous trade routes and offensive capacity.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-emerald-100">
          <div className="retro-chip px-5 py-3">
            <p className="text-[0.55rem] uppercase tracking-[0.3em] text-emerald-200/70">Fleet Size</p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">{profile?.fleetSize ?? 0}</p>
          </div>
          <div className="retro-chip px-5 py-3">
            <p className="text-[0.55rem] uppercase tracking-[0.3em] text-emerald-200/70">Trade Capacity</p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">{routesUsed} / {routeCapacity}</p>
          </div>
          <div className="retro-chip px-5 py-3">
            <p className="text-[0.55rem] uppercase tracking-[0.3em] text-emerald-200/70">Next Ship Cost</p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">{formatNumber(nextShipCost)} nuts</p>
          </div>
          <button
            type="button"
            className="retro-button"
            onClick={() => onBuyShip()}
          >
            Buy Nut Ship
          </button>
        </div>
      </div>
      <div className="retro-panel p-6 text-emerald-100">
        <h4 className="retro-subheading text-lg font-semibold text-emerald-200">Trade Routes</h4>
        {ownedPlanets.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-200/70">
            Claim a Resource Planet to start extracting nuts via trade routes.
          </p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm text-emerald-100/90">
            {ownedPlanets.map((planet) => (
              <li
                key={planet.planetId}
                className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-2 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
              >
                <div>
                  <p className="font-semibold text-emerald-100">{planet.name}</p>
                  <p className="text-xs text-emerald-200/70">
                    {planet.tradeRouteActive
                      ? `Route active: delivering ${formatNumber(tradePayout)} nuts every 5 minutes`
                      : "Route idle: deploy a ship to begin shipments"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wide shadow-[0_0_12px_rgba(16,185,129,0.35)] ${
                    planet.tradeRouteActive
                      ? "border border-rose-300 bg-rose-600/80 text-white hover:bg-rose-500/90"
                      : "border border-emerald-300 bg-emerald-500/80 text-emerald-950 hover:bg-emerald-400/90"
                  }`}
                  onClick={() => onToggleTradeRoute?.(planet)}
                >
                  {planet.tradeRouteActive ? "Suspend" : "Activate"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ArcadeDeck({ onPracticeAttack, onPracticeDefense }) {
  const [attackLevel, setAttackLevel] = useState(4);
  const [defenseLevel, setDefenseLevel] = useState(4);

  return (
    <div className="retro-panel space-y-6 p-6 text-emerald-100">
      <div>
        <h3 className="retro-subheading text-xl font-semibold text-emerald-200">Arcade Simulator</h3>
        <p className="mt-2 text-sm text-emerald-200/70">
          Practice both invasion and defense minigames without risking your holdings.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-emerald-200/70">
            <span>Attack Difficulty</span>
            <span>Lv {attackLevel}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={attackLevel}
            onChange={(event) => setAttackLevel(Number(event.target.value))}
            className="w-full accent-emerald-400"
          />
          <button
            type="button"
            className="retro-button w-full"
            onClick={() => onPracticeAttack?.(attackLevel)}
          >
            Launch Invasion Drill
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-emerald-200/70">
            <span>Defense Difficulty</span>
            <span>Lv {defenseLevel}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={defenseLevel}
            onChange={(event) => setDefenseLevel(Number(event.target.value))}
            className="w-full accent-emerald-400"
          />
          <button
            type="button"
            className="retro-button w-full"
            onClick={() => onPracticeDefense?.(defenseLevel)}
          >
            Start Defense Drill
          </button>
        </div>
      </div>
      <p className="text-xs text-emerald-200/70">
        Simulations use level-based difficulty but do not affect real planets or resources.
      </p>
    </div>
  );
}

function UpgradePanel({ profile, planets, onPurchase }) {
  const describeUpgradeEffect = useCallback((upgrade) => {
    if (upgrade.perLevelNps) {
      return `+${upgrade.perLevelNps} NPS per level`;
    }
    if (upgrade.perLevelMultiplier) {
      return `+${Math.round(upgrade.perLevelMultiplier * 100)}% passive output per level`;
    }
    if (upgrade.perLevelAutoBonus) {
      return `+${upgrade.perLevelAutoBonus} NPS to each Auto-Stroker`;
    }
    if (upgrade.perLevelClick) {
      return `+${upgrade.perLevelClick.toFixed(2)} click power per level`;
    }
    if (upgrade.perLevelChance) {
      return `+${Math.round(upgrade.perLevelChance * 100)}% frenzy odds per level`;
    }
    if (upgrade.perLevelTrade) {
      return `+${Math.round(upgrade.perLevelTrade * 100)}% trade yield per level`;
    }
    if (upgrade.perLevelDiscount) {
      return `-${Math.round(upgrade.perLevelDiscount * 100)}% claim cost per level`;
    }
    if (upgrade.perLevelCapacity) {
      return `+${upgrade.perLevelCapacity} trade slots per level`;
    }
    if (upgrade.perLevelDefensePierce) {
      return `-${upgrade.perLevelDefensePierce} defense level when attacking per level`;
    }
    return "Scales with level.";
  }, []);

  return (
    <div className="space-y-6">
      {Object.values(UPGRADE_CATEGORIES).map((category) => {
        const upgrades = Object.values(UPGRADE_DEFS).filter((entry) => entry.category === category.id);
        return (
          <div key={category.id} className="space-y-3">
            <div>
              <h5 className="retro-subheading text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200/80">
                {category.label}
              </h5>
              <p className="text-xs text-emerald-200/70">{category.blurb}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {upgrades.map((upgrade) => {
                const level = getUpgradeLevel(profile, upgrade.id);
                const cost = getUpgradeCost(profile, upgrade);
                const unlocked = isUpgradeUnlocked(profile, upgrade, planets);
                const canAfford = (profile?.nuts ?? 0) >= cost;
                const unlockText = getUpgradeUnlockText(upgrade);
                return (
                  <div key={upgrade.id} className="retro-panel p-5 text-emerald-100">
                    <div className="flex items-center justify-between">
                      <h4 className="retro-subheading text-lg font-semibold text-emerald-200">{upgrade.label}</h4>
                      <span className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Lv {level}</span>
                    </div>
                    <p className="mt-3 text-sm text-emerald-200/80">{upgrade.description}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.25em] text-emerald-200/60">
                      {describeUpgradeEffect(upgrade)}
                    </p>
                    <p className="mt-4 text-sm font-semibold text-emerald-200">
                      Cost: {formatNumber(cost)} nuts
                    </p>
                    {unlockText && !unlocked && (
                      <p className="mt-2 text-xs text-emerald-200/60">Requires: {unlockText}</p>
                    )}
                    <button
                      type="button"
                      className={`retro-button mt-4 w-full ${
                        !unlocked || !canAfford ? "cursor-not-allowed opacity-40" : ""
                      }`}
                      onClick={() => unlocked && onPurchase(upgrade)}
                      disabled={!unlocked || !canAfford}
                    >
                      {unlocked ? (canAfford ? "Purchase" : "Insufficient nuts") : "Locked"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuthPanel({ auth, db, ready, onEnterPreview }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!ready || !auth) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!ready || !auth || !db) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      if (!username.trim()) {
        throw new Error("Username required");
      }
      const usernameKey = username.trim().toLowerCase();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: username.trim() });
      await runTransaction(db, async (transaction) => {
        const usernameRef = doc(db, "artifacts", APP_ID, "public", "data", "usernames", usernameKey);
        const usernameDoc = await transaction.get(usernameRef);
        if (usernameDoc.exists()) {
          throw new Error("Username already taken");
        }
        transaction.set(usernameRef, {
          username: username.trim(),
          userId: userCredential.user.uid,
          createdAt: serverTimestamp(),
        });
        const userRef = doc(db, "artifacts", APP_ID, "users", userCredential.user.uid, "user_data");
        transaction.set(userRef, {
          userId: userCredential.user.uid,
          username: username.trim(),
          ...INITIAL_USER_STATE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl">
      <div className="retro-panel p-6 text-emerald-100">
        <h2 className="retro-heading text-xl">Nut Invaders HQ</h2>
        <p className="mt-3 text-sm text-emerald-200/80">
          {ready
            ? "Authenticate to join the galactic nut offensive."
            : "Firebase credentials missing. Enter preview mode to play locally with a simulated commander profile."}
        </p>
        <div className="mt-5 space-y-4">
          {mode === "register" && (
            <div>
              <label className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">Username</label>
              <input
                type="text"
                className="retro-input mt-1"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Commander"
              />
            </div>
          )}
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">Email</label>
            <input
              type="email"
              className="retro-input mt-1"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="pilot@nuts.space"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">Password</label>
            <input
              type="password"
              className="retro-input mt-1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="button"
            className="retro-button w-full"
            onClick={mode === "login" ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading ? "Processing..." : mode === "login" ? "Log In" : "Sign Up"}
          </button>
          <button
            type="button"
            className="retro-button retro-button--ghost w-full"
            onClick={() => setMode((prev) => (prev === "login" ? "register" : "login"))}
          >
            {mode === "login" ? "Need an account? Register" : "Already enlisted? Log in"}
          </button>
          {!ready && (
            <button
              type="button"
              className="retro-button w-full"
              onClick={() => onEnterPreview?.()}
            >
              Enter Preview Mode
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NutButton({ onClick, frenzyActive }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative mx-auto block h-48 w-48 rounded-full border-4 border-emerald-300 bg-[radial-gradient(circle_at_top,_rgba(74,222,128,0.95),_rgba(21,128,61,0.9))] text-3xl font-black text-emerald-950 shadow-[0_0_45px_rgba(74,222,128,0.6)] transition-transform hover:scale-105 ${
        frenzyActive ? "animate-[pulse_1s_ease-in-out_infinite]" : ""
      }`}
    >
      NUT
      {frenzyActive && (
        <span className="absolute -top-3 right-2 rounded-full bg-fuchsia-500 px-3 py-1 text-xs font-bold uppercase text-white shadow-lg">
          Frenzy!
        </span>
      )}
    </button>
  );
}

function FactoryTab({ profile, planets, onClick, onPurchaseUpgrade, frenzyActive }) {
  const tradePayout = deriveTradeRoutePayout(profile);
  const routesUsed = profile?.tradeRoutes?.length || 0;
  const routeCapacity = getFleetCapacity(profile);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr,2fr]">
        <div className="retro-panel p-6 text-center text-emerald-100">
          <h3 className="retro-subheading text-xl font-semibold text-emerald-200">Nut Foundry</h3>
          <p className="mt-2 text-sm text-emerald-200/70">
            Smash the NUT button to squeeze out precious currency. Passive factories scale with your Auto-Stroker network.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center space-y-4">
            <div className="retro-text-glow text-4xl font-black text-emerald-200">
              {formatNumber(profile?.nuts ?? 0)} <span className="text-base font-semibold text-emerald-200/80">NUTS</span>
            </div>
            <div className="text-sm font-semibold text-emerald-200/80">
              {deriveNps(profile).toFixed(1)} NPS • Click Multiplier ×{deriveClickMultiplier(profile).toFixed(2)}
            </div>
            <NutButton onClick={onClick} frenzyActive={frenzyActive} />
            <div className="mt-4 grid w-full grid-cols-1 gap-3 text-left text-xs sm:grid-cols-3">
              <div className="retro-chip">
                <p className="uppercase tracking-[0.25em] text-emerald-200/70">Trade Yield</p>
                <p className="mt-1 text-sm font-semibold text-emerald-100">{formatNumber(tradePayout)} nuts / route</p>
              </div>
              <div className="retro-chip">
                <p className="uppercase tracking-[0.25em] text-emerald-200/70">Routes Active</p>
                <p className="mt-1 text-sm font-semibold text-emerald-100">
                  {routesUsed} / {routeCapacity}
                </p>
              </div>
              <div className="retro-chip">
                <p className="uppercase tracking-[0.25em] text-emerald-200/70">Fleet Size</p>
                <p className="mt-1 text-sm font-semibold text-emerald-100">{profile?.fleetSize ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="retro-panel p-6 text-emerald-100">
          <h4 className="retro-subheading text-lg font-semibold text-emerald-200">Upgrades</h4>
          <p className="mt-2 text-sm text-emerald-200/70">
            Balance your production chain with synergistic upgrades. Costs scale exponentially, so diversify investments.
          </p>
          <div className="mt-4">
            <UpgradePanel profile={profile} planets={planets} onPurchase={onPurchaseUpgrade} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NutInvadersApp() {
  const firebase = useFirebaseServices();
  const [previewActive, setPreviewActive] = useState(false);
  const previewMode = !firebase.ready && previewActive;
  const authUser = useFirebaseUser(firebase.auth);
  const user = previewMode ? PREVIEW_USER : authUser;
  const [profile, setProfile, profileRef] = useUserProfile(firebase.db, firebase.ready, user, previewMode);
  const [planets, setPlanets] = usePlanets(firebase.db, firebase.ready);
  const [activeTab, setActiveTab] = useState("factory");
  const [attackTarget, setAttackTarget] = useState(null);
  const [defenseTarget, setDefenseTarget] = useState(null);
  const resolvedAttacks = useRef(new Set());

  const frenzyActive = profile?.frenzyBoostUntil && profile.frenzyBoostUntil > Date.now();

  const flushProfile = useCallback(
    async (nextProfile) => {
      const payload = nextProfile || profile;
      if (!payload) {
        return;
      }
      if (previewMode) {
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              PREVIEW_STORAGE_KEY,
              JSON.stringify({
                ...payload,
                userId: PREVIEW_USER.uid,
              })
            );
          } catch (err) {
            console.warn("Failed to persist preview profile", err);
          }
        }
        return;
      }
      if (!profileRef || !firebase.db || !firebase.ready) {
        return;
      }
      await setDoc(
        profileRef,
        {
          ...payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [firebase.db, firebase.ready, previewMode, profile, profileRef]
  );

  useEffect(() => {
    if (!profileRef) {
      return undefined;
    }
    const interval = setInterval(() => {
      flushProfile();
    }, 10000);
    return () => clearInterval(interval);
  }, [flushProfile, profileRef]);

  useEffect(() => {
    if (!profileRef) {
      return undefined;
    }
    const handler = () => {
      flushProfile();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flushProfile, profileRef]);

  useEffect(() => {
    if (!profile) {
      return undefined;
    }
    const interval = setInterval(() => {
    setProfile((prev) => {
      if (!prev) {
        return prev;
      }
      const nps = deriveNps(prev);
      const nutsGain = nps / 10;
      const next = {
        ...prev,
        nuts: prev.nuts + nutsGain,
        nutsPerSecond: nps,
      };
      next.clickMultiplier = deriveClickMultiplier(next);
      return next;
    });
  }, 100);
  return () => clearInterval(interval);
}, [profile, setProfile]);

  useEffect(() => {
    if (!profile) {
      return undefined;
    }
    const interval = setInterval(() => {
    setProfile((prev) => {
      if (!prev) {
        return prev;
      }
      const chanceBase = 0.05;
      const flareBonus = getUpgradeLevel(prev, "goonerFlare") * UPGRADE_DEFS.goonerFlare.perLevelChance;
      if (Math.random() < chanceBase + flareBonus) {
        const next = {
          ...prev,
          frenzyBoostUntil: Date.now() + 10_000,
        };
        next.nutsPerSecond = deriveNps(next);
        next.clickMultiplier = deriveClickMultiplier(next);
        return next;
      }
      return prev;
    });
  }, 60_000);
  return () => clearInterval(interval);
  }, [profile, setProfile]);

  const handleManualClick = () => {
    if (!profile) {
      return;
    }
    setProfile((prev) => {
      if (!prev) {
        return prev;
      }
      const multiplier = deriveClickMultiplier(prev);
      const next = {
        ...prev,
        nuts: prev.nuts + 1 * multiplier,
      };
      next.clickMultiplier = deriveClickMultiplier(next);
      next.nutsPerSecond = deriveNps(next);
      flushProfile(next);
      return next;
    });
  };

  const handlePurchaseUpgrade = (upgrade) => {
    if (!profile) {
      return;
    }
    setProfile((prev) => {
      if (!prev) {
        return prev;
      }
      if (!isUpgradeUnlocked(prev, upgrade, planets)) {
        return prev;
      }
      const cost = getUpgradeCost(prev, upgrade);
      if (prev.nuts < cost) {
        return prev;
      }
      const nextLevel = getUpgradeLevel(prev, upgrade.id) + 1;
      const next = {
        ...prev,
        nuts: prev.nuts - cost,
        upgrades: {
          ...prev.upgrades,
          [upgrade.id]: nextLevel,
        },
      };
      next.nutsPerSecond = deriveNps(next);
      next.clickMultiplier = deriveClickMultiplier(next);
      flushProfile(next);
      return next;
    });
  };

  const handleBuyShip = () => {
    if (!profile) {
      return;
    }
    setProfile((prev) => {
      if (!prev) {
        return prev;
      }
      const cost = getNextShipCost(prev);
      if (prev.nuts < cost) {
        return prev;
      }
      const next = {
        ...prev,
        nuts: prev.nuts - cost,
        fleetSize: prev.fleetSize + 1,
      };
      next.nutsPerSecond = deriveNps(next);
      next.clickMultiplier = deriveClickMultiplier(next);
      flushProfile(next);
      return next;
    });
  };

  const updatePlanetLocally = useCallback(
    (planetId, updates) => {
      setPlanets((prev) =>
        prev.map((planet) =>
          planet.planetId === planetId ? { ...planet, ...updates } : planet
        )
      );
    },
    [setPlanets]
  );

  const updatePlanetDocument = useCallback(
    async (planetId, updates) => {
      updatePlanetLocally(planetId, updates);
      if (!firebase.db || !firebase.ready) {
        return;
      }
      const planetRef = doc(firebase.db, "artifacts", APP_ID, "public", "data", "planets", planetId);
      await updateDoc(planetRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    },
    [firebase.db, firebase.ready, updatePlanetLocally]
  );

  const initiatePlanetAttack = useCallback(
    async (planet) => {
      if (!user) {
        return null;
      }
      const now = Date.now();
      const token = `${user.uid}-${planet.planetId}-${now}`;
      const payload = {
        isUnderAttack: true,
        attackerId: user.uid,
        attackerUsername: profile?.username || user.displayName || user.email?.split("@")[0] || "Unknown",
        attackInitiatedAt: now,
        attackEndsAt: now + ATTACK_WINDOW_MS,
        attackToken: token,
      };
      updatePlanetLocally(planet.planetId, payload);
      if (!firebase.ready || !firebase.db) {
        return token;
      }
      const planetRef = doc(firebase.db, "artifacts", APP_ID, "public", "data", "planets", planet.planetId);
      try {
        await runTransaction(firebase.db, async (transaction) => {
          const snapshot = await transaction.get(planetRef);
          if (!snapshot.exists()) {
            throw new Error("Planet missing");
          }
          const data = snapshot.data();
          if (data.isUnderAttack) {
            throw new Error("Planet already under attack");
          }
          transaction.update(planetRef, {
            ...payload,
            updatedAt: serverTimestamp(),
          });
        });
        return token;
      } catch (err) {
        console.error("Failed to initiate attack", err);
        updatePlanetLocally(planet.planetId, {
          isUnderAttack: planet.isUnderAttack,
          attackerId: planet.attackerId || null,
          attackerUsername: planet.attackerUsername || null,
          attackInitiatedAt: planet.attackInitiatedAt || null,
          attackEndsAt: planet.attackEndsAt || null,
          attackToken: planet.attackToken || null,
        });
        return null;
      }
    },
    [firebase.db, firebase.ready, profile?.username, updatePlanetLocally, user]
  );

  const finalizePlanetAttack = useCallback(
    async (planet, defenderSucceeded) => {
      if (!planet) {
        return;
      }
      const resetPayload = {
        isUnderAttack: false,
        attackerId: null,
        attackerUsername: null,
        attackInitiatedAt: null,
        attackEndsAt: null,
        attackToken: null,
      };
      const ownerUpdate = defenderSucceeded
        ? {}
        : {
            ownerId: planet.attackerId || null,
            ownerUsername: planet.attackerUsername || null,
            tradeRouteActive: false,
          };
      updatePlanetLocally(planet.planetId, {
        ...resetPayload,
        ...ownerUpdate,
      });
      if (!firebase.ready || !firebase.db) {
        return;
      }
      const planetRef = doc(firebase.db, "artifacts", APP_ID, "public", "data", "planets", planet.planetId);
      try {
        await runTransaction(firebase.db, async (transaction) => {
          const snapshot = await transaction.get(planetRef);
          if (!snapshot.exists()) {
            return;
          }
          const data = snapshot.data();
          if (planet.attackToken && data.attackToken && planet.attackToken !== data.attackToken) {
            return;
          }
          const updates = {
            ...resetPayload,
            updatedAt: serverTimestamp(),
          };
          if (!defenderSucceeded) {
            updates.ownerId = data.attackerId || planet.attackerId || null;
            updates.ownerUsername = data.attackerUsername || planet.attackerUsername || null;
            updates.tradeRouteActive = false;
          }
          transaction.update(planetRef, updates);
        });
      } catch (err) {
        console.error("Failed to resolve attack", err);
      }
    },
    [firebase.db, firebase.ready, updatePlanetLocally]
  );

  const handleClaimPlanet = async (planet) => {
    if (!profile || !user || !planet || planet.ownerId) {
      return;
    }
    if ((profile.fleetSize ?? 0) === 0) {
      return;
    }
    const cost = getClaimCost(profile, planets);
    if ((profile.nuts ?? 0) < cost) {
      return;
    }
    const ownerUsername = profile.username || user.displayName || user.email?.split("@")[0] || "Commander";
    const applyLocalClaim = () => {
      updatePlanetLocally(planet.planetId, {
        ownerId: user.uid,
        ownerUsername,
        tradeRouteActive: false,
        isUnderAttack: false,
        attackerId: null,
        attackerUsername: null,
        attackInitiatedAt: null,
        attackEndsAt: null,
        attackToken: null,
      });
      setProfile((prev) => {
        if (!prev || prev.nuts < cost) {
          return prev;
        }
        const next = {
          ...prev,
          nuts: prev.nuts - cost,
          homePlanetId: prev.homePlanetId || planet.planetId,
        };
        next.nutsPerSecond = deriveNps(next);
        next.clickMultiplier = deriveClickMultiplier(next);
        flushProfile(next);
        return next;
      });
    };

    if (!firebase.ready || !firebase.db) {
      applyLocalClaim();
      return;
    }

    const planetRef = doc(firebase.db, "artifacts", APP_ID, "public", "data", "planets", planet.planetId);
    try {
      await runTransaction(firebase.db, async (transaction) => {
        const snapshot = await transaction.get(planetRef);
        if (!snapshot.exists()) {
          throw new Error("Planet does not exist");
        }
        const existing = snapshot.data();
        if (existing.ownerId) {
          throw new Error("Planet already claimed");
        }
        transaction.update(planetRef, {
          ownerId: user.uid,
          ownerUsername,
          tradeRouteActive: false,
          isUnderAttack: false,
          attackerId: null,
          attackerUsername: null,
          attackInitiatedAt: null,
          attackEndsAt: null,
          attackToken: null,
          claimedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      applyLocalClaim();
    } catch (err) {
      console.error("Failed to claim planet", err);
    }
  };

  const handleUpgradeDefense = async (planet) => {
    if (!profile || !user || planet.ownerId !== user.uid) {
      return;
    }
    if (planet.defenseLevel >= 10) {
      return;
    }
    const cost = getDefenseUpgradeCost(planet);
    if ((profile.nuts ?? 0) < cost) {
      return;
    }
    const nextLevel = Math.min(10, (planet.defenseLevel ?? 1) + 1);
    setProfile((prev) => {
      if (!prev || prev.nuts < cost) {
        return prev;
      }
      const next = {
        ...prev,
        nuts: prev.nuts - cost,
      };
      next.nutsPerSecond = deriveNps(next);
      next.clickMultiplier = deriveClickMultiplier(next);
      flushProfile(next);
      return next;
    });
    await updatePlanetDocument(planet.planetId, {
      defenseLevel: nextLevel,
    });
  };

  const handleToggleTradeRoute = async (planet) => {
    if (!profile || !user) {
      return;
    }
    const togglingOn = !planet.tradeRouteActive;
    const capacity = getFleetCapacity(profile);
    const used = profile.tradeRoutes?.length || 0;
    const hasCapacity = used < capacity;
    if (togglingOn && !hasCapacity) {
      return;
    }
    await updatePlanetDocument(planet.planetId, {
      tradeRouteActive: togglingOn,
    });
    setProfile((prev) => {
      if (!prev) {
        return prev;
      }
      const existing = prev.tradeRoutes || [];
      const nextRoutes = togglingOn
        ? [...existing.filter((id) => id !== planet.planetId), planet.planetId]
        : existing.filter((id) => id !== planet.planetId);
      const next = {
        ...prev,
        tradeRoutes: nextRoutes,
      };
      flushProfile(next);
      return next;
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setProfile((prev) => {
        if (!prev || !prev.tradeRoutes || prev.tradeRoutes.length === 0) {
          return prev;
        }
        const payout = deriveTradeRoutePayout(prev) * prev.tradeRoutes.length;
        const next = {
          ...prev,
          nuts: prev.nuts + payout,
        };
        next.nutsPerSecond = deriveNps(next);
        next.clickMultiplier = deriveClickMultiplier(next);
        flushProfile(next);
        return next;
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [flushProfile, setProfile]);

  const handleAttackPlanet = (planet) => {
    if (!profile || !user || (profile.fleetSize ?? 0) === 0 || planet.isUnderAttack) {
      return;
    }
    const effectiveDefense = deriveEffectiveDefenseLevel(planet.defenseLevel, profile);
    setAttackTarget({ ...planet, effectiveDefense, practice: false });
    setActiveTab("attack");
  };

  const handleDefense = useCallback(
    (planet) => {
      if (!planet) {
        return;
      }
      setDefenseTarget((current) => {
        if (current && current.attackToken === planet.attackToken) {
          return current;
        }
        return { ...planet, practice: false };
      });
      setActiveTab("defense");
    },
    [setActiveTab]
  );

  useEffect(() => {
    if (!firebase.db || !firebase.ready || !user) {
      return undefined;
    }
    const planetsRef = collection(firebase.db, "artifacts", APP_ID, "public", "data", "planets");
    const unsubscribe = onSnapshot(planetsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (data.ownerId === user.uid && data.isUnderAttack) {
          if (!data.attackEndsAt || data.attackEndsAt > Date.now()) {
            handleDefense({ planetId: change.doc.id, ...data });
          }
        }
      });
    });
    return () => unsubscribe();
  }, [firebase.db, firebase.ready, handleDefense, user]);

  const handleAttackComplete = async (success) => {
    if (!attackTarget) {
      return;
    }
    if (attackTarget.practice) {
      setAttackTarget(null);
      setActiveTab("arcade");
      return;
    }
    if (success) {
      await initiatePlanetAttack(attackTarget);
    }
    setAttackTarget(null);
    setActiveTab("galaxy");
  };

  const handleDefenseComplete = async (success) => {
    if (!defenseTarget) {
      return;
    }
    if (defenseTarget.practice) {
      setDefenseTarget(null);
      setActiveTab("arcade");
      return;
    }
    await finalizePlanetAttack(defenseTarget, success);
    setDefenseTarget(null);
    setActiveTab("galaxy");
  };

  const handlePracticeAttack = useCallback(
    (level) => {
      const simulatedLevel = Math.max(1, Math.min(10, level));
      setAttackTarget({
        planetId: `simulation-${simulatedLevel}`,
        name: `Simulator Stronghold Lv${simulatedLevel}`,
        defenseLevel: simulatedLevel,
        effectiveDefense: simulatedLevel,
        practice: true,
      });
      setActiveTab("attack");
    },
    [setActiveTab]
  );

  const handlePracticeDefense = useCallback(
    (level) => {
      const simulatedLevel = Math.max(1, Math.min(10, level));
      const deadline = Date.now() + ATTACK_WINDOW_MS;
      setDefenseTarget({
        planetId: `simulation-${simulatedLevel}`,
        name: `Defense Drill Lv${simulatedLevel}`,
        defenseLevel: simulatedLevel,
        attackerUsername: "Simulator",
        attackEndsAt: deadline,
        practice: true,
      });
      setActiveTab("defense");
    },
    [setActiveTab]
  );

  useEffect(() => {
    planets.forEach((planet) => {
      if (!planet.isUnderAttack || !planet.attackEndsAt) {
        return;
      }
      if (planet.attackEndsAt > Date.now()) {
        return;
      }
      const key = planet.attackToken || planet.planetId;
      if (resolvedAttacks.current.has(key)) {
        return;
      }
      resolvedAttacks.current.add(key);
      finalizePlanetAttack(planet, false);
    });
  }, [finalizePlanetAttack, planets]);

  useEffect(() => {
    if (!profile || profile.homePlanetId) {
      return;
    }
    const owned = planets.find((planet) => planet.ownerId === profile.userId);
    if (!owned) {
      return;
    }
    setProfile((prev) => {
      if (!prev || prev.homePlanetId) {
        return prev;
      }
      const next = {
        ...prev,
        homePlanetId: owned.planetId,
      };
      flushProfile(next);
      return next;
    });
  }, [flushProfile, planets, profile, setProfile]);

  useEffect(() => {
    if (activeTab === "factory") {
      return;
    }
    if (attackTarget && activeTab !== "attack") {
      setAttackTarget(null);
    }
    if (defenseTarget && activeTab !== "defense") {
      setDefenseTarget(null);
    }
  }, [activeTab, attackTarget, defenseTarget]);

  const handleLogout = () => {
    if (previewMode) {
      setPreviewActive(false);
      setProfile(null);
      setActiveTab("factory");
      setAttackTarget(null);
      setDefenseTarget(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
      }
      return;
    }
    signOut(firebase.auth);
  };

  if (!user) {
    return (
      <AuthPanel
        auth={firebase.auth}
        db={firebase.db}
        ready={firebase.ready}
        onEnterPreview={() => setPreviewActive(true)}
      />
    );
  }

  return (
    <div className="crt-overlay">
      <div className="relative min-h-screen overflow-hidden px-6 py-10">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.18),_transparent_65%)]" />
        <div className="retro-grid -z-10" />
        <div className="relative z-10 mx-auto max-w-6xl space-y-8">
        <header className="retro-panel flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center">
          <div>
            <h1 className="retro-heading text-3xl">Nut Invaders</h1>
            <p className="mt-2 text-sm text-emerald-200/80">
              Multiplayer incremental strategy. Conquer the Nut Galaxy with industrial finesse and arcade mastery.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right text-sm">
              <p className="retro-text-glow font-semibold text-emerald-200">{profile?.username}</p>
              <p className="text-xs text-emerald-200/70">{Math.floor(profile?.nuts ?? 0).toLocaleString()} nuts</p>
            </div>
            {previewMode && (
              <span className="retro-chip text-xs font-semibold uppercase tracking-wide text-emerald-100">
                Preview Mode
              </span>
            )}
            <button
              type="button"
              className="retro-button retro-button--danger px-5 py-2 text-xs"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-3">
          {TABS.map((tab) => {
            const disabled =
              (tab.id === "attack" && !attackTarget) || (tab.id === "defense" && !defenseTarget);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => !disabled && setActiveTab(tab.id)}
                className={`${activeTab === tab.id ? "retro-tab retro-tab--active" : "retro-tab"} ${
                  disabled ? "cursor-not-allowed opacity-40" : ""
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <main className="space-y-8">
          {activeTab === "factory" && (
            <FactoryTab
              profile={profile}
              planets={planets}
              onClick={handleManualClick}
              onPurchaseUpgrade={handlePurchaseUpgrade}
              frenzyActive={frenzyActive}
            />
          )}
          {activeTab === "fleet" && (
            <FleetManagement
              profile={profile}
              onBuyShip={handleBuyShip}
              onToggleTradeRoute={handleToggleTradeRoute}
              planets={planets}
            />
          )}
          {activeTab === "galaxy" && (
            <GalaxyMap
              planets={planets}
              profile={profile}
              onClaimPlanet={handleClaimPlanet}
              onAttackPlanet={handleAttackPlanet}
              onToggleTradeRoute={handleToggleTradeRoute}
              onUpgradeDefense={handleUpgradeDefense}
            />
          )}
          {activeTab === "arcade" && (
            <ArcadeDeck
              onPracticeAttack={handlePracticeAttack}
              onPracticeDefense={handlePracticeDefense}
            />
          )}
          {activeTab === "attack" && attackTarget && (
            <SpaceInvadersMinigame
              defenseLevel={attackTarget.effectiveDefense ?? attackTarget.defenseLevel}
              practice={attackTarget.practice}
              onComplete={handleAttackComplete}
              onCancel={() => {
                const wasPractice = attackTarget?.practice;
                setAttackTarget(null);
                setActiveTab(wasPractice ? "arcade" : "galaxy");
              }}
            />
          )}
          {activeTab === "defense" && defenseTarget && (
            <DefenseMinigame
              defenseLevel={defenseTarget.defenseLevel}
              attackerUsername={defenseTarget.attackerUsername}
              attackDeadline={defenseTarget.attackEndsAt}
              practice={defenseTarget.practice}
              onComplete={handleDefenseComplete}
              onCancel={() => {
                const wasPractice = defenseTarget?.practice;
                setDefenseTarget(null);
                setActiveTab(wasPractice ? "arcade" : "galaxy");
              }}
            />
          )}
          <Leaderboard planets={planets} />
        </main>
        </div>
      </div>
    </div>
  );
}
