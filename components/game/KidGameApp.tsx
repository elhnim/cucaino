"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { World3D as World3DClass } from "@/lib/game3d/engine";
import type { SurpriseFind } from "@/lib/game3d/surprises";
import { seedFromString } from "@/lib/game3d/noise";
import { buildPetHomeInterior } from "@/lib/game3d/interiors/pethome";
import { buildScheduleInterior } from "@/lib/game3d/interiors/schedule";
import { buildStoreInterior } from "@/lib/game3d/interiors/store";
import { buildFriendsInterior } from "@/lib/game3d/interiors/friends";
import { buildPlayHallInterior, resolveDoorwayRoute } from "@/lib/game3d/interiors/playhall";
import type { Interior } from "@/lib/game3d/interiors/types";
import { LANDMARKS, type InitialGameData, type LandmarkKey } from "@/lib/game3d/types";
import { loadAnimalChoice, saveAnimalChoice, animalForPetSpecies, type AnimalDef } from "@/lib/game3d/registry/animals";
import { FUN_FACTS } from "@/lib/game3d/registry/attractions";
import {
  evaluateHooks,
  recordVisit,
  isDailyGiftReady,
  claimDailyGift,
  DAILY_GIFTS,
} from "@/lib/game3d/registry/hooks";
import { getTheme } from "@/lib/themes/presets";
import { getSpecies, moodFor, type Pet } from "@/lib/pet/logic";
import GameFullscreen from "@/components/games/GameFullscreen";
import { Joystick } from "./Joystick";
import { PetPanel } from "./panels/PetPanel";
import { TodoPanel } from "./panels/TodoPanel";
import { RewardsPanel } from "./panels/RewardsPanel";
import { FriendsPanel } from "./panels/FriendsPanel";
import { QuizHubPanel } from "./panels/QuizHubPanel";
import { QuizGamePanel } from "./panels/QuizGamePanel";
import { WardrobePanel } from "./panels/WardrobePanel";

type SimplePanelKey = "pet" | "work" | "shop" | "friends";

const INTERIOR_BUILDERS: Record<SimplePanelKey, (accent: string) => Interior> = {
  pet: buildPetHomeInterior,
  work: buildScheduleInterior,
  shop: buildStoreInterior,
  friends: buildFriendsInterior,
};

const TOAST_MS = 2800;

/**
 * Mounts the full-viewport three.js canvas and the HUD/panel overlays on top of it.
 * three.js is imported dynamically inside the effect so nothing WebGL-only ever
 * runs during SSR.
 */
export default function KidGameApp({ data }: { data: InitialGameData }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World3DClass | null>(null);
  const router = useRouter();
  const kidId = data.kid.id;
  const theme = getTheme(data.kid.themeId);

  const [pet, setPet] = useState(data.pet);
  const [points, setPoints] = useState(data.kid.pointsBalance);
  const [tasksDone, setTasksDone] = useState(data.tasksToday.done);
  const [sparkles, setSparkles] = useState(0);
  const [arrival, setArrival] = useState<LandmarkKey | null>(null);
  const [activePanel, setActivePanel] = useState<SimplePanelKey | null>(null);
  const [inPlayHall, setInPlayHall] = useState(false);
  const [showQuizHub, setShowQuizHub] = useState(false);
  const [activeQuizBankId, setActiveQuizBankId] = useState<string | null>(null);
  const [showWardrobe, setShowWardrobe] = useState(false);
  const [animal, setAnimal] = useState<AnimalDef | null>(null);
  const [visitStreak, setVisitStreak] = useState(0);
  const [giftReady, setGiftReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [flash, setFlash] = useState(false);
  const toastId = useRef(0);
  const bonusSparkles = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const addSparkles = useCallback((n: number) => {
    bonusSparkles.current += n;
    setSparkles((s) => s + n);
  }, []);

  // ── habit hooks: re-evaluated whenever the kid's day changes, pushed into the world ──
  const petMood = pet ? moodFor(pet) : null;
  const effects = useMemo(
    () =>
      evaluateHooks({
        kidName: data.kid.name,
        petName: pet?.name ?? null,
        tasksDone,
        tasksTotal: data.tasksToday.total,
        petMood,
        visitStreak,
        petCareStreak: pet?.careStreak ?? 0,
        dailyGiftReady: giftReady,
      }),
    // petMood is derived from pet
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.kid.name, pet, tasksDone, data.tasksToday.total, visitStreak, giftReady],
  );

  const applyEffects = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const keys = [...LANDMARKS.map((l) => l.key as string), "daily-gift", "wishing-well", "fireworks"];
    for (const k of keys) world.setBeacon(k, effects.beacons[k] ?? null);
    for (const [id, st] of Object.entries(effects.attractionState)) world.setAttractionState(id, st);
    const m = petMood;
    world.setPetMood(m && m.id !== "happy" ? m.emoji : null);
  }, [effects, petMood]);

  useEffect(applyEffects, [applyEffects]);

  // ── what happens when the kid walks up to a plaza attraction (registry/attractions.ts) ──
  const handleAttraction = useCallback(
    (id: string) => {
      const world = worldRef.current;
      if (id === "daily-gift") {
        if (!isDailyGiftReady(kidId)) {
          toast("Come back tomorrow for a new gift! 🌙");
          return;
        }
        claimDailyGift(kidId);
        setGiftReady(false);
        const gift = DAILY_GIFTS[Math.floor(Math.random() * DAILY_GIFTS.length)];
        world?.burstAt("daily-gift");
        world?.celebrate();
        addSparkles(gift.sparkles);
        toast(`🎁 ${gift.message} +${gift.sparkles} ✨`);
      } else if (id === "wishing-well") {
        world?.setAttractionState("wishing-well", { splash: true });
        toast(`🪙 Did you know? ${FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)]}`);
      } else if (id === "fireworks") {
        const left = data.tasksToday.total - tasksDone;
        toast(left > 0 ? `Finish ${left} more chore${left === 1 ? "" : "s"} to light the fireworks! 🎆` : "Woohoo! Enjoy the show! 🎆");
      }
    },
    [kidId, toast, addSparkles, data.tasksToday.total, tasksDone],
  );
  const attractionRef = useRef(handleAttraction);
  attractionRef.current = handleAttraction;

  const handleSurprise = useCallback((find: SurpriseFind) => toast(`${find.message} +${find.sparkles} ✨`), [toast]);

  const leavePlayHall = useCallback(() => {
    worldRef.current?.exitInterior();
    setInPlayHall(false);
    setShowQuizHub(false);
    setActiveQuizBankId(null);
  }, []);

  const handleZone = useCallback(
    (key: string) => {
      if (key === "quiz-corner") {
        setShowQuizHub(true);
        return;
      }
      const route = resolveDoorwayRoute(key, kidId);
      if (route) router.push(route);
    },
    [kidId, router],
  );

  const handleArrive = useCallback((key: LandmarkKey) => {
    const def = LANDMARKS.find((l) => l.key === key);
    if (!def) return;
    setArrival(key);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    worldRef.current?.setInputEnabled(false);
    window.setTimeout(() => {
      setArrival(null);
      if (key === "playground") {
        worldRef.current?.enterInterior(buildPlayHallInterior, key);
        setInPlayHall(true);
      } else {
        worldRef.current?.enterInterior(INTERIOR_BUILDERS[key as SimplePanelKey], key);
        setActivePanel(key as SimplePanelKey);
      }
      worldRef.current?.setInputEnabled(true);
    }, 420);
  }, []);

  const handlePetTap = useCallback(() => {
    const p = petRef.current;
    if (!p) return;
    const m = moodFor(p);
    toast(`${getSpecies(p.species).babyEmoji ?? "🐾"} ${m.message}`);
  }, [toast]);
  const petRef = useRef(pet);
  petRef.current = pet;

  // ── boot the 3D world once ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let world: World3DClass | undefined;
    const chosen = loadAnimalChoice(kidId, data.kid.avatar);
    setAnimal(chosen);
    const streak = recordVisit(kidId);
    setVisitStreak(streak);
    setGiftReady(isDailyGiftReady(kidId));

    import("@/lib/game3d/engine").then(({ World3D }) => {
      if (disposed || !hostRef.current) return;
      world = new World3D(hostRef.current, {
        playerAccent: theme.accent,
        playerAnimal: chosen,
        themeId: data.kid.themeId,
        petSpeciesColor: data.pet ? getSpecies(data.pet.species).color : undefined,
        petAnimal: data.pet ? animalForPetSpecies(data.pet.species) : undefined,
        worldSeed: seedFromString(kidId),
        onArrive: handleArrive,
        onZone: handleZone,
        onSparkle: (n) => setSparkles(n + bonusSparkles.current),
        onPetTap: handlePetTap,
        onAttraction: (id) => attractionRef.current(id),
        onSurprise: handleSurprise,
      });
      worldRef.current = world;
      world.waveHello();
      applyEffectsRef.current();
    });

    return () => {
      disposed = true;
      world?.dispose();
      worldRef.current = null;
    };
    // boot once; live updates flow through React state + the world's setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const applyEffectsRef = useRef(applyEffects);
  applyEffectsRef.current = applyEffects;

  // greet once, after the first hook evaluation with real streak/gift info
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current || visitStreak === 0) return;
    greeted.current = true;
    effects.greetings.slice(0, 2).reverse().forEach((g, i) => window.setTimeout(() => toast(g), 600 + i * 1800));
  }, [effects, visitStreak, toast]);

  // chores finished inside the Schedule panel → confetti, happy pet, live HUD counts
  useEffect(() => {
    const onDone = (e: Event) => {
      const pts = (e as CustomEvent<{ points?: number }>).detail?.points ?? 0;
      setTasksDone((d) => Math.min(data.tasksToday.total, d + 1));
      setPoints((p) => p + pts);
      worldRef.current?.celebrate();
    };
    const onUndone = (e: Event) => {
      const pts = (e as CustomEvent<{ points?: number }>).detail?.points ?? 0;
      setTasksDone((d) => Math.max(0, d - 1));
      setPoints((p) => Math.max(0, p - pts));
    };
    window.addEventListener("task-completed", onDone);
    window.addEventListener("task-uncompleted", onUndone);
    return () => {
      window.removeEventListener("task-completed", onDone);
      window.removeEventListener("task-uncompleted", onUndone);
    };
  }, [data.tasksToday.total]);

  // the quiz covers the whole screen — stop rendering 3D underneath it to save battery
  useEffect(() => {
    worldRef.current?.setPaused(!!activeQuizBankId);
  }, [activeQuizBankId]);

  const closePanel = () => {
    setActivePanel(null);
    worldRef.current?.exitInterior();
  };

  const pickAnimal = (a: AnimalDef) => {
    setAnimal(a);
    saveAnimalChoice(kidId, a.id);
    worldRef.current?.setPlayerAnimal(a);
  };

  const panelOpen = !!activePanel || showQuizHub || !!activeQuizBankId || showWardrobe;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#bfe6ff" }}>
      <style>
        {"@keyframes cucaino-flash { from { opacity: 1; } to { opacity: 0; } }" +
          "@keyframes cucaino-pop { 0% { transform: translateY(-8px) scale(0.9); opacity: 0; } 12% { transform: none; opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }"}
      </style>
      <GameFullscreen />
      <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      <div style={hudTopStyle}>
        <div style={{ display: "flex", gap: 8 }}>
          {inPlayHall ? (
            <button style={backBtnStyle} onClick={leavePlayHall}>
              🚪 Leave Arcade
            </button>
          ) : (
            <button style={backBtnStyle} onClick={() => router.push(`/kid/${kidId}/home`)}>
              ← Home
            </button>
          )}
          {!activePanel && !inPlayHall && (
            <button style={backBtnStyle} onClick={() => setShowWardrobe(true)} aria-label="Choose your animal">
              {animal?.emoji ?? "🐾"} Me
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Chip emoji="🪙" value={points} />
          <Chip emoji="⭐" value={tasksDone} suffix={`/${data.tasksToday.total}`} />
          {visitStreak >= 2 && <Chip emoji="🔥" value={visitStreak} />}
          {sparkles > 0 && <Chip emoji="✨" value={sparkles} />}
        </div>
      </div>

      <div style={{ ...arrivalStyle, opacity: arrival ? 1 : 0 }}>
        {arrival && `${LANDMARKS.find((l) => l.key === arrival)?.emoji} ${LANDMARKS.find((l) => l.key === arrival)?.label}!`}
      </div>

      <div style={toastStackStyle}>
        {toasts.map((t) => (
          <div key={t.id} style={toastStyle}>
            {t.text}
          </div>
        ))}
      </div>

      {flash && <div style={flashStyle} />}

      {!panelOpen && <Joystick onChange={(x, y) => worldRef.current?.setMoveVector(x, y)} />}

      {activePanel === "pet" && (
        <PetPanel
          kidId={kidId}
          pet={pet}
          onPetChange={(p: Pet) => setPet(p)}
          onPointsChange={setPoints}
          onClose={closePanel}
          onReaction={() => worldRef.current?.celebratePet()}
        />
      )}
      {activePanel === "work" && <TodoPanel kidId={kidId} accentColor={theme.accent} onClose={closePanel} />}
      {activePanel === "shop" && <RewardsPanel kidId={kidId} onClose={closePanel} />}
      {activePanel === "friends" && <FriendsPanel kidId={kidId} accentColor={theme.accent} onClose={closePanel} />}

      {showWardrobe && (
        <WardrobePanel
          currentId={animal?.id ?? ""}
          accentColor={theme.accent}
          onPick={pickAnimal}
          onClose={() => setShowWardrobe(false)}
        />
      )}

      {showQuizHub && (
        <QuizHubPanel
          onClose={() => setShowQuizHub(false)}
          onPick={(bankId) => {
            setShowQuizHub(false);
            setActiveQuizBankId(bankId);
          }}
        />
      )}
      {activeQuizBankId && (
        <QuizGamePanel
          kidId={kidId}
          bankId={activeQuizBankId}
          onExit={() => {
            setActiveQuizBankId(null);
            setShowQuizHub(true);
          }}
        />
      )}
    </div>
  );
}

function Chip({ emoji, value, suffix }: { emoji: string; value: number; suffix?: string }) {
  return (
    <div style={chipStyle}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <span style={{ fontWeight: 800, color: "#6b4a1f" }}>
        {value}
        {suffix ?? ""}
      </span>
    </div>
  );
}

const hudTopStyle: React.CSSProperties = {
  position: "fixed",
  left: "max(16px, env(safe-area-inset-left))",
  right: "max(16px, env(safe-area-inset-right))",
  top: "max(16px, env(safe-area-inset-top))",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  zIndex: 20,
  pointerEvents: "none",
};

const backBtnStyle: React.CSSProperties = {
  pointerEvents: "auto",
  border: "none",
  borderRadius: 999,
  padding: "10px 16px",
  fontWeight: 700,
  color: "#6b4a1f",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const chipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(255,255,255,0.85)",
  borderRadius: 999,
  padding: "8px 12px",
  boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
};

const arrivalStyle: React.CSSProperties = {
  position: "fixed",
  top: "14%",
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(255,255,255,0.95)",
  color: "#5a3a18",
  fontWeight: 800,
  fontSize: 22,
  padding: "10px 22px",
  borderRadius: 999,
  boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
  transition: "opacity 200ms ease",
  zIndex: 30,
  pointerEvents: "none",
};

const toastStackStyle: React.CSSProperties = {
  position: "fixed",
  top: "22%",
  left: 16,
  right: 16,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  zIndex: 35,
  pointerEvents: "none",
};

const toastStyle: React.CSSProperties = {
  maxWidth: 520,
  textAlign: "center",
  background: "rgba(255,255,255,0.96)",
  color: "#5a3a18",
  fontWeight: 800,
  fontSize: 17,
  padding: "10px 18px",
  borderRadius: 18,
  boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  animation: `cucaino-pop ${TOAST_MS}ms ease forwards`,
};

const flashStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#fff",
  animation: "cucaino-flash 260ms ease-out",
  zIndex: 50,
  pointerEvents: "none",
};
