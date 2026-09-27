"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { World3D as World3DClass } from "@/lib/game3d/engine";
import { loadWorld, prefetchWorld } from "@/lib/game3d/loadWorld";
import type { SurpriseFind } from "@/lib/game3d/surprises";
import { seedFromString } from "@/lib/game3d/noise";
import { resolveDoorwayRoute } from "@/lib/game3d/registry/arcade";
import type { GolfEvent, GolfControls } from "@/lib/game3d/interiors/minigolf";
import type { Interior } from "@/lib/game3d/interiors/types";
import { LANDMARKS, type InitialGameData, type LandmarkKey } from "@/lib/game3d/types";
import { loadAnimalChoice, saveAnimalChoice, animalForPetSpecies, type AnimalDef } from "@/lib/game3d/registry/animals";
import { FUN_FACTS } from "@/lib/game3d/registry/facts";
import {
  evaluateHooks,
  recordVisit,
  isDailyGiftReady,
  claimDailyGift,
  doneToday,
  markDoneToday,
  DAILY_GIFTS,
} from "@/lib/game3d/registry/hooks";
import { getTheme } from "@/lib/themes/presets";
import { getSpecies, moodFor, type Pet } from "@/lib/pet/logic";
import GameFullscreen from "@/components/games/GameFullscreen";
import { Joystick } from "./Joystick";

// Panels are only needed once a kid walks into a building, so each loads on demand instead of
// weighing down the world's first download (QuizGame, FriendsPage, TodoTaskCard... add up).
const PetPanel = dynamic(() => import("./panels/PetPanel").then((m) => m.PetPanel), { ssr: false });
const TodoPanel = dynamic(() => import("./panels/TodoPanel").then((m) => m.TodoPanel), { ssr: false });
const RewardsPanel = dynamic(() => import("./panels/RewardsPanel").then((m) => m.RewardsPanel), { ssr: false });
const FriendsPanel = dynamic(() => import("./panels/FriendsPanel").then((m) => m.FriendsPanel), { ssr: false });
const QuizHubPanel = dynamic(() => import("./panels/QuizHubPanel").then((m) => m.QuizHubPanel), { ssr: false });
const QuizGamePanel = dynamic(() => import("./panels/QuizGamePanel").then((m) => m.QuizGamePanel), { ssr: false });
const WardrobePanel = dynamic(() => import("./panels/WardrobePanel").then((m) => m.WardrobePanel), { ssr: false });

type SimplePanelKey = "pet" | "work" | "shop" | "friends";
type Interiors = Awaited<ReturnType<typeof loadWorld>>[1];

const INTERIOR_FOR: Record<SimplePanelKey, keyof Interiors> = {
  pet: "buildPetHomeInterior",
  work: "buildScheduleInterior",
  shop: "buildStoreInterior",
  friends: "buildFriendsInterior",
};

// Start downloading three.js + the engine the moment this module is evaluated on the client —
// in parallel with hydration — instead of waiting for the first useEffect.
prefetchWorld();

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
  const [golf, setGolf] = useState<{ hole: number; name: string; par: number; strokes: number; scores: number[]; done?: { total: number; par: number } } | null>(null);
  const [playedGolf, setPlayedGolf] = useState(false);
  const golfControls = useRef<GolfControls>({});
  const [riding, setRiding] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [flash, setFlash] = useState(false);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState(false);
  const interiorsRef = useRef<Interiors | null>(null);
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
        playedGolfToday: playedGolf,
      }),
    // petMood is derived from pet
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.kid.name, pet, tasksDone, data.tasksToday.total, visitStreak, giftReady, playedGolf],
  );

  const applyEffects = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const keys = [...LANDMARKS.map((l) => l.key as string), "daily-gift", "wishing-well", "fireworks", "minigolf", "ferris-wheel", "carousel"];
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
      } else if (id === "ferris-wheel" || id === "carousel") {
        if (world?.isRiding) return;
        world?.startRide(id);
        setRiding(id);
        toast(id === "ferris-wheel" ? "Up, up and away! 🎡 Look at the whole park!" : "Wheee! Round and round! 🎠");
      } else if (id === "minigolf") {
        enterMiniGolf();
      } else if (id === "balloons") {
        world?.celebrate();
        toast("Here's a balloon for you! 🎈 Have a happy day!");
      } else if (id === "park-gate") {
        toast("🎡 Welcome to Cucaino Park! Ride, play and explore!");
      } else if (id === "fireworks") {
        const left = data.tasksToday.total - tasksDone;
        toast(left > 0 ? `Finish ${left} more chore${left === 1 ? "" : "s"} to light the fireworks! 🎆` : "Woohoo! Enjoy the show! 🎆");
      }
    },
    [kidId, toast, addSparkles, data.tasksToday.total, tasksDone],
  );
  const handleGolf = useCallback(
    (e: GolfEvent) => {
      if (e.type === "hole-start") {
        setGolf((g) => ({ hole: e.hole, name: e.name, par: e.par, strokes: 0, scores: e.hole === 1 ? [] : (g?.scores ?? []) }));
        if (e.hole > 1) toast(`⛳ Hole ${e.hole}: ${e.name} · Par ${e.par}`);
      } else if (e.type === "stroke") {
        setGolf((g) => (g ? { ...g, strokes: e.strokes } : g));
      } else if (e.type === "sunk") {
        setGolf((g) => (g ? { ...g, scores: [...g.scores, e.strokes] } : g));
        worldRef.current?.celebrate();
        const bonus = Math.max(1, 6 - (e.strokes - e.par) * 2);
        addSparkles(bonus);
        toast(`${e.label} (${e.strokes} stroke${e.strokes === 1 ? "" : "s"}) +${bonus} ✨`);
      } else if (e.type === "course-done") {
        setGolf((g) => (g ? { ...g, done: { total: e.total, par: e.par } } : g));
        markDoneToday(kidId, "golf");
        setPlayedGolf(true);
        worldRef.current?.celebrate();
        addSparkles(20);
        toast(`🏆 Course complete! ${e.total} strokes (par ${e.par}) +20 ✨`);
      }
    },
    [toast, addSparkles, kidId],
  );

  const enterMiniGolf = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    const build = interiorsRef.current?.buildMiniGolfInterior;
    if (!build) return;
    world.enterInterior((accent) => build(accent, (e) => golfRef.current(e), golfControls.current), "minigolf");
    toast("⛳ Drag back from anywhere to aim, let go to putt!");
  }, [toast]);
  const golfRef = useRef(handleGolf);
  golfRef.current = handleGolf;

  const leaveMiniGolf = useCallback(() => {
    worldRef.current?.exitInterior();
    setGolf(null);
  }, []);

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
      const interiors = interiorsRef.current;
      if (interiors && key === "playground") {
        worldRef.current?.enterInterior(interiors.buildPlayHallInterior, key);
        setInPlayHall(true);
      } else if (interiors) {
        worldRef.current?.enterInterior(interiors[INTERIOR_FOR[key as SimplePanelKey]] as (accent: string) => Interior, key);
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
    setPlayedGolf(doneToday(kidId, "golf"));

    loadWorld()
      .then(([{ World3D }, interiors]) => {
      if (disposed || !hostRef.current) return;
      interiorsRef.current = interiors;
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
        onRideEnd: () => setRiding(null),
        onReady: () => setReady(true),
      });
      worldRef.current = world;
      world.waveHello();
      applyEffectsRef.current();
    })
      .catch(() => {
        // chunk failed to download, or WebGL unavailable — don't leave the loader up forever
        if (!disposed) setBootError(true);
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

  const panelOpen = !!activePanel || showQuizHub || !!activeQuizBankId || showWardrobe || !!golf || !!riding;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#bfe6ff" }}>
      <style>
        {"@keyframes cucaino-flash { from { opacity: 1; } to { opacity: 0; } }" +
          "@keyframes cucaino-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }" +
          "@keyframes cucaino-pop { 0% { transform: translateY(-8px) scale(0.9); opacity: 0; } 12% { transform: none; opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }"}
      </style>
      <GameFullscreen />
      <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      <div style={hudTopStyle}>
        <div style={{ display: "flex", gap: 8 }}>
          {golf ? (
            <button style={backBtnStyle} onClick={leaveMiniGolf}>
              🚪 Leave Mini Golf
            </button>
          ) : inPlayHall ? (
            <button style={backBtnStyle} onClick={leavePlayHall}>
              🚪 Leave Arcade
            </button>
          ) : (
            <button style={backBtnStyle} onClick={() => router.push(`/kid/${kidId}/home`)}>
              ← Home
            </button>
          )}
          {!activePanel && !inPlayHall && !golf && (
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

      {golf && (
        <div style={golfCardStyle}>
          {golf.done ? (
            <>
              <div style={{ fontWeight: 900, fontSize: 18 }}>🏆 {golf.done.total} strokes · par {golf.done.par}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{golf.scores.map((s, i) => `${i + 1}:${s}`).join("  ")}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "center" }}>
                <button style={golfBtnStyle} onClick={() => { golfControls.current.restart?.(); setGolf((g) => (g ? { ...g, done: undefined, scores: [] } : g)); }}>
                  🔄 Play again
                </button>
                <button style={golfBtnStyle} onClick={leaveMiniGolf}>
                  🎡 Back to the park
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 900 }}>⛳ Hole {golf.hole} · {golf.name}</div>
              <div style={{ fontSize: 14 }}>
                Par {golf.par} · Strokes <b>{golf.strokes}</b>
                {golf.scores.length > 0 && ` · Total ${golf.scores.reduce((a, c) => a + c, 0)}`}
              </div>
            </>
          )}
        </div>
      )}

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

      {/* stays up until the first real frame is painted, then fades — no blank-sky wait */}
      <div style={{ ...loaderStyle, opacity: ready ? 0 : 1, pointerEvents: ready ? "none" : "auto" }} aria-hidden={ready}>
        {bootError ? (
          <>
            <div style={{ fontSize: 56 }}>🙈</div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#5a3a18", textAlign: "center", padding: "0 24px" }}>
              The park couldn&apos;t open on this device.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={backBtnStyle} onClick={() => window.location.reload()}>🔄 Try again</button>
              <button style={backBtnStyle} onClick={() => router.push(`/kid/${kidId}/home`)}>🏠 Home</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 64, animation: "cucaino-bounce 0.9s ease-in-out infinite" }}>{animal?.emoji ?? "🎡"}</div>
            <div style={{ fontWeight: 900, fontSize: 22, color: "#5a3a18" }}>Opening Cucaino Park…</div>
          </>
        )}
      </div>

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

const golfCardStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "max(20px, env(safe-area-inset-bottom))",
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(255,255,255,0.94)",
  color: "#1f5130",
  borderRadius: 20,
  padding: "10px 18px",
  textAlign: "center",
  boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  zIndex: 25,
  minWidth: 220,
};

const golfBtnStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "8px 14px",
  fontWeight: 800,
  background: "#3fb34f",
  color: "#fff",
  cursor: "pointer",
};

const loaderStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  background: "linear-gradient(#8fd7ff, #eaf6ff)",
  transition: "opacity 400ms ease",
  zIndex: 60,
};

const flashStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#fff",
  animation: "cucaino-flash 260ms ease-out",
  zIndex: 50,
  pointerEvents: "none",
};
