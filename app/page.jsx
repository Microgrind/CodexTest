
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

const UPGRADE_DEFS = {
  autoStroker: {
    id: "autoStroker",
    label: "Auto-Stroker",
    description: "Increases passive nut generation by +2 NPS per level.",
    baseCost: 25,
    costMultiplier: 1.35,
    perLevelNps: 2,
  },
  edgeMultiplier: {
    id: "edgeMultiplier",
    label: "Edge Multiplier",
    description: "Boosts manual clicks by +0.5 multiplier per level.",
    baseCost: 15,
    costMultiplier: 1.5,
    perLevelClick: 0.5,
  },
  goonerFlare: {
    id: "goonerFlare",
    label: "Gooner Flare",
    description: "Raises frenzied goon event odds by 5% per level.",
    baseCost: 100,
    costMultiplier: 1.8,
    perLevelChance: 0.05,
  },
};

const TABS = [
  { id: "factory", label: "Factory" },
  { id: "fleet", label: "Fleet" },
  { id: "galaxy", label: "Galaxy" },
  { id: "attack", label: "Attack" },
  { id: "defense", label: "Defense" },
];

const PLANET_COLORS = {
  unclaimed: "bg-slate-700 border-slate-500",
  player: "bg-emerald-600 border-emerald-400",
  enemy: "bg-purple-600 border-purple-400",
  attack: "bg-red-600 border-red-400 animate-pulse",
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
  const base = autoLevel * UPGRADE_DEFS.autoStroker.perLevelNps;
  const frenzyActive = profile?.frenzyBoostUntil && profile.frenzyBoostUntil > Date.now();
  return frenzyActive ? base * 2 : base;
}

function deriveClickMultiplier(profile) {
  const base = 1 + getUpgradeLevel(profile, "edgeMultiplier") * UPGRADE_DEFS.edgeMultiplier.perLevelClick;
  const frenzyActive = profile?.frenzyBoostUntil && profile.frenzyBoostUntil > Date.now();
  return frenzyActive ? base * 2 : base;
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

function useUserProfile(db, ready, user) {
  const [profile, setProfile] = useState(null);
  const profileRef = useMemo(() => {
    if (!ready || !db || !user) {
      return null;
    }
    return doc(db, "artifacts", APP_ID, "users", user.uid, "user_data");
  }, [db, ready, user]);

  useEffect(() => {
    if (!profileRef) {
      setProfile(null);
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
  }, [profileRef]);

  useEffect(() => {
    if (!profileRef || !db || !ready || !user || profile) {
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
  }, [db, profile, profileRef, ready, user]);

  return [profile, setProfile, profileRef];
}

const DEFENSE_SEQUENCE_COLORS = ["bg-amber-400", "bg-emerald-400", "bg-blue-400", "bg-rose-400"];

function SpaceInvadersMinigame({ defenseLevel, onComplete, onCancel }) {
  const canvasRef = useRef(null);
  const [message, setMessage] = useState("Clear 3 waves to plant the bomb.");
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
      setMessage("Wave 1");
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
          setMessage("Bomb planted! Await defender response.");
        } else {
          setMessage(`Wave ${waveRef.current}`);
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
  }, [defenseLevel, onComplete]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-cyan-300">Space Invaders Offensive</h3>
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1 text-sm font-medium text-slate-200 hover:bg-slate-600"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <p className="text-sm text-slate-300">{message}</p>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full rounded border border-slate-600 bg-slate-900"
      />
      <p className="text-xs text-slate-400">Controls: Arrow keys to move, Space/Up to fire.</p>
    </div>
  );
}

function DefenseMinigame({ defenseLevel, onComplete, onCancel }) {
  const [sequence, setSequence] = useState([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [isShowing, setIsShowing] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(-1);
  const targetRounds = 3;

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-rose-200">Defense Memory Lock</h3>
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1 text-sm font-medium text-slate-200 hover:bg-slate-600"
          onClick={onCancel}
        >
          Leave
        </button>
      </div>
      <p className="text-sm text-slate-300">
        Repeat {targetRounds} sequences to diffuse the bomb. Difficulty scales with defense level.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {DEFENSE_SEQUENCE_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            className={`aspect-square rounded-xl border-2 border-slate-700 ${color} transition-transform hover:scale-105 ${
              isShowing && sequence[displayIndex] === index ? "ring-4 ring-white" : ""
            }`}
            onClick={() => handlePlayerPress(index)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>Round: {round}</span>
        <span>Sequence Length: {sequenceLength}</span>
      </div>
      <button
        type="button"
        className="rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-400"
        onClick={startRound}
      >
        {round === 0 ? "Begin Defense" : "Replay Sequence"}
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
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
        Colonize your first planet to appear on the leaderboard.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
      <h4 className="text-lg font-semibold text-cyan-200">Planetary Supremacy</h4>
      <ul className="mt-3 space-y-2 text-sm text-slate-200">
        {leaderboard.map((entry, index) => (
          <li key={entry.username} className="flex items-center justify-between">
            <span className="font-medium text-slate-100">#{index + 1} {entry.username}</span>
            <span className="text-cyan-300">{entry.planetsOwned} planets</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GalaxyMap({ planets, currentUserId, homePlanetId, onClaimPlanet, onAttackPlanet, onToggleTradeRoute }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-cyan-200">Nut Galaxy</h3>
        <p className="text-sm text-slate-300">Tap a planet to manage ownership and routes.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {planets.map((planet) => {
          const isUnclaimed = !planet.ownerId;
          const isPlayer = planet.ownerId === currentUserId;
          const isHome = planet.planetId === homePlanetId;
          const isUnderAttack = planet.isUnderAttack;
          const cardColor = isUnderAttack
            ? PLANET_COLORS.attack
            : isPlayer
            ? PLANET_COLORS.player
            : PLANET_COLORS.enemy;
          return (
            <div
              key={planet.planetId}
              className={`flex h-full flex-col justify-between rounded-xl border p-4 shadow-lg transition-transform hover:-translate-y-1 ${cardColor}`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-slate-100">
                    {planet.name}
                    {isHome && <span className="ml-2 rounded bg-slate-900/40 px-2 py-0.5 text-xs uppercase text-cyan-200">Home</span>}
                  </h4>
                  <span className="rounded bg-slate-900/40 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-200">
                    {planet.function}
                  </span>
                </div>
                <p className="text-sm text-slate-100">
                  Defense Level: <span className="font-semibold">{planet.defenseLevel}</span>
                </p>
                <p className="text-xs text-slate-200">
                  Status: {isUnderAttack ? "Under Attack" : isUnclaimed ? "Unclaimed" : `Controlled by ${planet.ownerUsername}`}
                </p>
              </div>
              <div className="mt-4 space-y-2">
                {isUnclaimed ? (
                  <button
                    type="button"
                    className="w-full rounded bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-300"
                    onClick={() => onClaimPlanet?.(planet)}
                  >
                    Claim Planet
                  </button>
                ) : isPlayer ? (
                  <button
                    type="button"
                    className="w-full rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300"
                    onClick={() => onToggleTradeRoute?.(planet)}
                  >
                    {planet.tradeRouteActive ? "Deactivate" : "Activate"} Trade Route
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full rounded bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-400"
                    onClick={() => onAttackPlanet?.(planet)}
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
  const nextShipCost = useMemo(() => {
    return Math.floor(200 * Math.pow(1.65, profile?.fleetSize ?? 0));
  }, [profile?.fleetSize]);
  const ownedPlanets = useMemo(
    () => planets.filter((planet) => planet.ownerId === profile?.userId),
    [planets, profile?.userId]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6">
        <h3 className="text-xl font-semibold text-cyan-200">Nut Fleet Command</h3>
        <p className="mt-2 text-sm text-slate-300">
          Expand your fleet to unlock simultaneous trade routes and offensive capacity.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-slate-100">
          <div className="rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Fleet Size</p>
            <p className="text-2xl font-bold text-emerald-300">{profile?.fleetSize ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-600 bg-slate-800/60 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Next Ship Cost</p>
            <p className="text-2xl font-bold text-cyan-300">{formatNumber(nextShipCost)} nuts</p>
          </div>
          <button
            type="button"
            className="rounded bg-emerald-400 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-300"
            onClick={() => onBuyShip(nextShipCost)}
          >
            Buy Nut Ship
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6">
        <h4 className="text-lg font-semibold text-cyan-100">Trade Routes</h4>
        {ownedPlanets.length === 0 ? (
          <p className="mt-2 text-sm text-slate-300">
            Claim a Resource Planet to start extracting nuts via trade routes.
          </p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm text-slate-200">
            {ownedPlanets.map((planet) => (
              <li
                key={planet.planetId}
                className="flex items-center justify-between rounded border border-slate-700 bg-slate-800/60 px-3 py-2"
              >
                <div>
                  <p className="font-semibold text-slate-100">{planet.name}</p>
                  <p className="text-xs text-slate-400">
                    {planet.tradeRouteActive
                      ? "Route active: delivering 500 nuts every 5 minutes"
                      : "Route idle: deploy a ship to begin shipments"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    planet.tradeRouteActive
                      ? "bg-rose-500 text-white hover:bg-rose-400"
                      : "bg-emerald-400 text-slate-900 hover:bg-emerald-300"
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

function UpgradePanel({ profile, onPurchase }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Object.values(UPGRADE_DEFS).map((upgrade) => {
        const level = getUpgradeLevel(profile, upgrade.id);
        const cost = getUpgradeCost(profile, upgrade);
        return (
          <div
            key={upgrade.id}
            className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-cyan-200">{upgrade.label}</h4>
              <span className="text-xs uppercase tracking-wide text-slate-400">Lvl {level}</span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{upgrade.description}</p>
            <p className="mt-4 text-sm font-semibold text-emerald-300">
              Cost: {formatNumber(cost)} nuts
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300"
              onClick={() => onPurchase(upgrade)}
            >
              Purchase
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AuthPanel({ auth, db, ready }) {
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
    <div className="mx-auto max-w-md rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-slate-100 shadow-xl">
      <h2 className="text-2xl font-bold text-cyan-200">Nut Invaders HQ</h2>
      <p className="mt-2 text-sm text-slate-300">
        {ready
          ? "Authenticate to join the galactic nut offensive."
          : "Provide Firebase environment variables to enable authentication."}
      </p>
      <div className="mt-4 space-y-4">
        {mode === "register" && (
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Username</label>
            <input
              type="text"
              className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Commander"
            />
          </div>
        )}
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
          <input
            type="email"
            className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="pilot@nuts.space"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="button"
          className="w-full rounded bg-cyan-400 px-4 py-2 font-semibold text-slate-900 hover:bg-cyan-300"
          onClick={mode === "login" ? handleLogin : handleRegister}
          disabled={loading}
        >
          {loading ? "Processing..." : mode === "login" ? "Log In" : "Sign Up"}
        </button>
        <button
          type="button"
          className="w-full rounded border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10"
          onClick={() => setMode((prev) => (prev === "login" ? "register" : "login"))}
        >
          {mode === "login" ? "Need an account? Register" : "Already enlisted? Log in"}
        </button>
      </div>
    </div>
  );
}

function NutButton({ onClick, frenzyActive }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative mx-auto block h-48 w-48 rounded-full border-4 border-cyan-300 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 text-3xl font-black text-slate-900 shadow-[0_0_25px_rgba(34,211,238,0.6)] transition-transform hover:scale-105 ${
        frenzyActive ? "animate-pulse" : ""
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

function FactoryTab({ profile, onClick, onPurchaseUpgrade, frenzyActive }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr,2fr]">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-center text-slate-100">
          <h3 className="text-xl font-semibold text-cyan-200">Nut Foundry</h3>
          <p className="mt-2 text-sm text-slate-300">
            Smash the NUT button to squeeze out precious currency. Passive factories scale with your Auto-Stroker network.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center space-y-4">
            <div className="text-4xl font-black text-emerald-300">
              {formatNumber(profile?.nuts ?? 0)} <span className="text-base font-semibold text-slate-300">NUTS</span>
            </div>
            <div className="text-sm font-semibold text-cyan-200">
              {deriveNps(profile).toFixed(1)} NPS • Click Multiplier ×{deriveClickMultiplier(profile).toFixed(2)}
            </div>
            <NutButton onClick={onClick} frenzyActive={frenzyActive} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-slate-100">
          <h4 className="text-lg font-semibold text-cyan-100">Upgrades</h4>
          <p className="mt-2 text-sm text-slate-300">
            Balance your production chain with synergistic upgrades. Costs scale exponentially, so diversify investments.
          </p>
          <div className="mt-4">
            <UpgradePanel profile={profile} onPurchase={onPurchaseUpgrade} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NutInvadersApp() {
  const firebase = useFirebaseServices();
  const user = useFirebaseUser(firebase.auth);
  const [profile, setProfile, profileRef] = useUserProfile(firebase.db, firebase.ready, user);
  const [planets, setPlanets] = usePlanets(firebase.db, firebase.ready);
  const [activeTab, setActiveTab] = useState("factory");
  const [attackTarget, setAttackTarget] = useState(null);
  const [defenseTarget, setDefenseTarget] = useState(null);

  const frenzyActive = profile?.frenzyBoostUntil && profile.frenzyBoostUntil > Date.now();

  const flushProfile = useCallback(
    async (nextProfile) => {
      if (!profileRef || !firebase.db || !firebase.ready) {
        return;
      }
      const payload = nextProfile || profile;
      if (!payload) {
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
    [firebase.db, firebase.ready, profile, profileRef]
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

  const handleBuyShip = (cost) => {
    if (!profile) {
      return;
    }
    setProfile((prev) => {
      if (!prev || prev.nuts < cost) {
        return prev;
      }
      const next = {
        ...prev,
        nuts: prev.nuts - cost,
        fleetSize: prev.fleetSize + 1,
      };
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

  const handleClaimPlanet = async (planet) => {
    if (!profile || !user) {
      return;
    }
    if (!planet.ownerId) {
      await updatePlanetDocument(planet.planetId, {
        ownerId: user.uid,
        ownerUsername: profile.username,
        tradeRouteActive: false,
        isUnderAttack: false,
      });
      if (!profile.homePlanetId) {
        setProfile((prev) => {
          if (!prev) {
            return prev;
          }
          const next = {
            ...prev,
            homePlanetId: planet.planetId,
          };
          flushProfile(next);
          return next;
        });
      }
    }
  };

  const handleToggleTradeRoute = async (planet) => {
    if (!profile || !user) {
      return;
    }
    const togglingOn = !planet.tradeRouteActive;
    const hasCapacity = (profile.tradeRoutes?.length || 0) < profile.fleetSize;
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
    if (!profile) {
      return undefined;
    }
    const interval = setInterval(() => {
      if (!profile.tradeRoutes || profile.tradeRoutes.length === 0) {
        return;
      }
      const payout = 500 * profile.tradeRoutes.length;
      setProfile((prev) => {
        if (!prev) {
          return prev;
        }
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
  }, [flushProfile, profile, setProfile]);

  const handleAttackPlanet = (planet) => {
    if (!profile || !user || profile.fleetSize === 0) {
      return;
    }
    setAttackTarget(planet);
    setActiveTab("attack");
  };

  const handleDefense = useCallback((planet) => {
    setDefenseTarget(planet);
    setActiveTab("defense");
  }, []);

  useEffect(() => {
    if (!firebase.db || !firebase.ready || !user) {
      return undefined;
    }
    const planetsRef = collection(firebase.db, "artifacts", APP_ID, "public", "data", "planets");
    const unsubscribe = onSnapshot(planetsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (data.ownerId === user.uid && data.isUnderAttack) {
          handleDefense({ planetId: change.doc.id, ...data });
        }
      });
    });
    return () => unsubscribe();
  }, [firebase.db, firebase.ready, handleDefense, user]);

  const handleAttackComplete = async (success) => {
    if (!attackTarget) {
      return;
    }
    if (success) {
      await updatePlanetDocument(attackTarget.planetId, {
        isUnderAttack: true,
      });
    }
    setAttackTarget(null);
    setActiveTab("galaxy");
  };

  const handleDefenseComplete = async (success) => {
    if (!defenseTarget) {
      return;
    }
    if (success) {
      await updatePlanetDocument(defenseTarget.planetId, {
        isUnderAttack: false,
      });
    } else {
      await updatePlanetDocument(defenseTarget.planetId, {
        isUnderAttack: false,
        ownerId: null,
        ownerUsername: null,
      });
    }
    setDefenseTarget(null);
    setActiveTab("galaxy");
  };

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

  if (!user) {
    return <AuthPanel auth={firebase.auth} db={firebase.db} ready={firebase.ready} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-black text-cyan-200">Nut Invaders</h1>
            <p className="text-sm text-slate-300">
              Multiplayer incremental strategy. Conquer the Nut Galaxy with industrial finesse and arcade mastery.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right text-sm">
              <p className="font-semibold text-emerald-300">{profile?.username}</p>
              <p className="text-xs text-slate-400">{Math.floor(profile?.nuts ?? 0).toLocaleString()} nuts</p>
            </div>
            <button
              type="button"
              className="rounded border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/10"
              onClick={() => signOut(firebase.auth)}
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
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-cyan-400 text-slate-900 shadow"
                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <main className="space-y-6">
          {activeTab === "factory" && (
            <FactoryTab
              profile={profile}
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
              currentUserId={user.uid}
              homePlanetId={profile?.homePlanetId}
              onClaimPlanet={handleClaimPlanet}
              onAttackPlanet={handleAttackPlanet}
              onToggleTradeRoute={handleToggleTradeRoute}
            />
          )}
          {activeTab === "attack" && attackTarget && (
            <SpaceInvadersMinigame
              defenseLevel={attackTarget.defenseLevel}
              onComplete={handleAttackComplete}
              onCancel={() => {
                setAttackTarget(null);
                setActiveTab("galaxy");
              }}
            />
          )}
          {activeTab === "defense" && defenseTarget && (
            <DefenseMinigame
              defenseLevel={defenseTarget.defenseLevel}
              onComplete={handleDefenseComplete}
              onCancel={() => {
                setDefenseTarget(null);
                setActiveTab("galaxy");
              }}
            />
          )}
          <Leaderboard planets={planets} />
        </main>
      </div>
    </div>
  );
}
