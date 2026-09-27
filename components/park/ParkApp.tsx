"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { ParkWorld } from "@/lib/park/engine/ParkWorld";
import type { PlaceDef, PlaceAction } from "@/lib/park/registry/places";
import type { ParkInitialData } from "@/lib/park/types";
import { loadPark, prefetchPark } from "@/lib/park/loadPark";
import { loadParkAnimalChoice, saveParkAnimalChoice, parkAnimalForPet, type ParkAnimal } from "@/lib/park/registry/animals";
import { isDailyGiftReady, claimDailyGift, DAILY_GIFTS, recordVisit } from "@/lib/game3d/registry/hooks";
import { isEmbedded, closeWorldWindow } from "@/lib/embed";
import { playSfx } from "@/lib/audio/sound-manager";
import { getTheme } from "@/lib/themes/presets";
import { moodFor, type Pet } from "@/lib/pet/logic";
import GameFullscreen from "@/components/games/GameFullscreen";
import { Joystick } from "@/components/game/Joystick";
import { WorldPageWindow } from "@/components/game/WorldPageWindow";
import { RidesMenu, type RideEntry } from "./RidesMenu";

// Every building panel loads on demand, never in the park's first download.
const PetPanel = dynamic(() => import("@/components/game/panels/PetPanel").then((m) => m.PetPanel), { ssr: false });
const TodoPanel = dynamic(() => import("@/components/game/panels/TodoPanel").then((m) => m.TodoPanel), { ssr: false });
const RewardsPanel = dynamic(() => import("@/components/game/panels/RewardsPanel").then((m) => m.RewardsPanel), { ssr: false });
const FriendsPanel = dynamic(() => import("@/components/game/panels/FriendsPanel").then((m) => m.FriendsPanel), { ssr: false });
const QuizHubPanel = dynamic(() => import("@/components/game/panels/QuizHubPanel").then((m) => m.QuizHubPanel), { ssr: false });
const QuizGamePanel = dynamic(() => import("@/components/game/panels/QuizGamePanel").then((m) => m.QuizGamePanel), { ssr: false });
const DressUpPanel = dynamic(() => import("./DressUpPanel").then((m) => m.DressUpPanel), { ssr: false });

// start fetching three.js + the engine as soon as this module evaluates (parallel to hydration)
prefetchPark();

type Panel = Exclude<PlaceAction, "gift" | "none"> | "dressup" | "quiz-hub";
const TOAST_MS = 3000;

/** Old ?enter= deep links (nav tabs, bookmarks) -> park places. */
const ENTER_MAP: Record<string, Panel> = {
  work: "quests",
  quests: "quests",
  shop: "shop",
  friends: "friends",
  pet: "pet",
  playground: "rides",
  rides: "rides",
};

export default function ParkApp({ data }: { data: ParkInitialData }) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<ParkWorld | null>(null);
  const kidId = data.kid.id;
  const theme = getTheme(data.kid.themeId);

  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState(false);
  const [panel, setPanel] = useState<{ kind: Panel; placeId?: string } | null>(null);
  const [quizBank, setQuizBank] = useState<string | null>(null);
  const [page, setPage] = useState<{ src: string; title: string } | null>(null);
  const [pet, setPet] = useState<Pet | null>(data.pet);
  const [points, setPoints] = useState(data.kid.pointsBalance);
  const [done, setDone] = useState(data.tasksToday.done);
  const [animal, setAnimal] = useState<ParkAnimal | null>(null);
  const [streak, setStreak] = useState(0);
  const [giftReady, setGiftReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  const openPanel = useCallback((kind: Panel, placeId?: string) => {
    worldRef.current?.setInputEnabled(false);
    playSfx("tap");
    setPanel({ kind, placeId });
  }, []);

  const closePanel = useCallback(() => {
    const placeId = panel?.placeId;
    setPanel(null);
    if (placeId) worldRef.current?.stepOutOf(placeId);
    worldRef.current?.setInputEnabled(true);
  }, [panel]);

  const handlePlace = useCallback(
    (place: PlaceDef) => {
      if (place.action === "gift") {
        if (!isDailyGiftReady(kidId)) {
          toast("You've opened today's gift — come back tomorrow! 🌙");
          return;
        }
        claimDailyGift(kidId);
        setGiftReady(false);
        const gift = DAILY_GIFTS[Math.floor(Math.random() * DAILY_GIFTS.length)];
        worldRef.current?.celebrate(true);
        playSfx("win");
        toast(`🎁 ${gift.message}`);
        return;
      }
      if (place.action === "none") return;
      openPanel(place.action, place.id);
    },
    [kidId, openPanel, toast],
  );
  const placeRef = useRef(handlePlace);
  placeRef.current = handlePlace;

  // ── boot the 3D park once ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (isEmbedded()) {
      closeWorldWindow(); // never nest a park inside an in-park window
      return;
    }
    let disposed = false;
    let world: ParkWorld | undefined;
    const chosen = loadParkAnimalChoice(kidId, data.kid.avatar);
    setAnimal(chosen);
    setStreak(recordVisit(kidId));
    setGiftReady(isDailyGiftReady(kidId));

    loadPark()
      .then(({ ParkWorld }) => {
        if (disposed || !hostRef.current) return;
        world = new ParkWorld(hostRef.current, {
          kidAnimal: chosen.id,
          petAnimal: data.pet ? parkAnimalForPet(data.pet.species) : null,
          themeId: data.kid.themeId,
          onPlace: (p) => placeRef.current(p),
          onError: () => !disposed && setBootError(true),
          onReady: () => {
            setReady(true);
            const enter = new URLSearchParams(window.location.search).get("enter");
            if (enter && ENTER_MAP[enter]) {
              window.history.replaceState(null, "", window.location.pathname);
              openPanel(ENTER_MAP[enter]);
            }
          },
        });
        worldRef.current = world;
      })
      .catch(() => !disposed && setBootError(true));

    return () => {
      disposed = true;
      world?.dispose();
      worldRef.current = null;
    };
    // boot once; live updates go through the world's setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── beacons: what needs doing, floating over the buildings ──
  useEffect(() => {
    const w = worldRef.current;
    if (!w || !ready) return;
    w.setBeacon("quest-board", done < data.tasksToday.total ? "❗" : data.tasksToday.total > 0 ? "⭐" : null);
    const mood = pet ? moodFor(pet) : null;
    w.setBeacon("pet-house", mood && mood.id !== "happy" && mood.id !== "ecstatic" ? mood.emoji : null);
    w.setBeacon("daily-gift", giftReady ? "🎁" : null);
  }, [ready, done, data.tasksToday.total, pet, giftReady]);

  // greet once the park is on screen
  const greeted = useRef(false);
  useEffect(() => {
    if (!ready || greeted.current) return;
    greeted.current = true;
    const left = data.tasksToday.total - done;
    const lines = [
      streak >= 2 ? `Welcome back ${data.kid.name}! 🔥 ${streak} days in a row` : `Hi ${data.kid.name}! Welcome to Cucaino Park 🍭`,
      left > 0 ? `${left} quest${left === 1 ? "" : "s"} waiting on the Quest Board 📋` : giftReady ? "Your daily gift is on the plaza 🎁" : "",
    ].filter(Boolean);
    lines.forEach((l, i) => window.setTimeout(() => toast(l), 500 + i * 1800));
  }, [ready, streak, done, giftReady, data.kid.name, data.tasksToday.total, toast]);

  // quests finished inside the Quest Board → confetti, happy pet, sound, live counts
  useEffect(() => {
    const onDone = (e: Event) => {
      const pts = (e as CustomEvent<{ points?: number }>).detail?.points ?? 0;
      setDone((d) => Math.min(data.tasksToday.total, d + 1));
      setPoints((p) => p + pts);
      worldRef.current?.celebrate(true);
      playSfx("coin");
    };
    const onUndone = (e: Event) => {
      const pts = (e as CustomEvent<{ points?: number }>).detail?.points ?? 0;
      setDone((d) => Math.max(0, d - 1));
      setPoints((p) => Math.max(0, p - pts));
    };
    window.addEventListener("task-completed", onDone);
    window.addEventListener("task-uncompleted", onUndone);
    return () => {
      window.removeEventListener("task-completed", onDone);
      window.removeEventListener("task-uncompleted", onUndone);
    };
  }, [data.tasksToday.total]);

  // full-screen overlays cover the canvas: stop drawing 3D under them (battery)
  useEffect(() => {
    worldRef.current?.setPaused(!!quizBank || !!page);
  }, [quizBank, page]);

  const pickRide = (r: RideEntry) => {
    if (r.route === "quiz") setPanel({ kind: "quiz-hub", placeId: panel?.placeId });
    else setPage({ src: r.route(kidId), title: `${r.emoji} ${r.name}` });
  };

  const pickAnimal = (a: ParkAnimal) => {
    setAnimal(a);
    saveParkAnimalChoice(kidId, a.id);
    void worldRef.current?.setKidAnimal(a.id);
    playSfx("sparkle");
  };

  const busy = !!panel || !!quizBank || !!page;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#ffe3f1" }} className="font-fun">
      <style>{css}</style>
      <GameFullscreen />
      <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {/* top HUD */}
      <div style={hudTop}>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={pill} onClick={() => router.push("/select-kid")} aria-label="Switch profile">
            🔄
          </button>
          <button style={pill} onClick={() => openPanel("dressup")} aria-label="Choose your animal">
            {animal?.emoji ?? "🐾"} Me
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Chip emoji="⭐" value={`${points}`} />
          <Chip emoji="📋" value={`${done}/${data.tasksToday.total}`} />
          {Math.max(streak, data.kid.currentStreak) >= 2 && <Chip emoji="🔥" value={`${Math.max(streak, data.kid.currentStreak)}`} />}
        </div>
      </div>

      <div style={toastStack}>
        {toasts.map((t) => (
          <div key={t.id} style={toastStyle}>
            {t.text}
          </div>
        ))}
      </div>

      {ready && !busy && <Joystick onChange={(x, y) => worldRef.current?.setMove(x, y)} />}

      {/* loader stays until the first real frame is on screen */}
      <div style={{ ...loader, opacity: ready ? 0 : 1, pointerEvents: ready ? "none" : "auto" }}>
        {bootError ? (
          <>
            <div style={{ fontSize: 56 }}>🙈</div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#7a2e62", textAlign: "center", padding: "0 24px" }}>The park couldn&apos;t open on this device.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={pill} onClick={() => window.location.reload()}>🔄 Try again</button>
              <button style={pill} onClick={() => router.push(`/kid/${kidId}/home`)}>📋 Simple view</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 72, animation: "park-bounce 0.9s ease-in-out infinite" }}>{animal?.emoji ?? "🍭"}</div>
            <div style={{ fontWeight: 900, fontSize: 22, color: "#7a2e62" }}>Opening Cucaino Park…</div>
          </>
        )}
      </div>

      {panel?.kind === "quests" && <TodoPanel kidId={kidId} accentColor={theme.accent} onClose={closePanel} onOpenPage={(src, title) => setPage({ src, title })} />}
      {panel?.kind === "shop" && <RewardsPanel kidId={kidId} onClose={closePanel} onOpenPage={(src, title) => setPage({ src, title })} />}
      {panel?.kind === "friends" && <FriendsPanel kidId={kidId} accentColor={theme.accent} onClose={closePanel} />}
      {panel?.kind === "pet" && (
        <PetPanel
          kidId={kidId}
          pet={pet}
          onPetChange={setPet}
          onPointsChange={setPoints}
          onClose={closePanel}
          onReaction={() => worldRef.current?.celebrate()}
        />
      )}
      {panel?.kind === "rides" && <RidesMenu onPick={pickRide} onClose={closePanel} />}
      {panel?.kind === "quiz-hub" && (
        <QuizHubPanel
          onClose={closePanel}
          onPick={(bankId) => {
            setQuizBank(bankId);
          }}
        />
      )}
      {panel?.kind === "dressup" && <DressUpPanel currentId={animal?.id ?? ""} onPick={pickAnimal} onClose={closePanel} />}
      {quizBank && <QuizGamePanel kidId={kidId} bankId={quizBank} onExit={() => setQuizBank(null)} />}
      {page && <WorldPageWindow src={page.src} title={page.title} onClose={() => setPage(null)} />}
    </div>
  );
}

function Chip({ emoji, value }: { emoji: string; value: string }) {
  return (
    <div style={chip}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <span style={{ fontWeight: 900, color: "#7a2e62" }}>{value}</span>
    </div>
  );
}

const css =
  "@keyframes park-bounce { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-18px) rotate(4deg); } }" +
  "@keyframes park-pop { 0% { transform: translateY(-10px) scale(0.85); opacity: 0; } 10% { transform: none; opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }";

const hudTop: React.CSSProperties = {
  position: "fixed",
  top: "max(14px, env(safe-area-inset-top))",
  left: "max(14px, env(safe-area-inset-left))",
  right: "max(14px, env(safe-area-inset-right))",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  zIndex: 20,
  pointerEvents: "none",
};

const pill: React.CSSProperties = {
  pointerEvents: "auto",
  border: "none",
  borderRadius: 999,
  padding: "10px 16px",
  fontWeight: 900,
  fontSize: 15,
  color: "#7a2e62",
  background: "linear-gradient(#ffffff, #ffe6f2)",
  boxShadow: "0 4px 0 #ffb8d9, 0 8px 16px rgba(122,46,98,0.18)",
  cursor: "pointer",
};

const chip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  padding: "7px 14px",
  background: "linear-gradient(#ffffff, #fff0f8)",
  boxShadow: "0 4px 0 #ffb8d9, 0 8px 16px rgba(122,46,98,0.16)",
};

const toastStack: React.CSSProperties = {
  position: "fixed",
  top: "18%",
  left: 16,
  right: 16,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  zIndex: 30,
  pointerEvents: "none",
};

const toastStyle: React.CSSProperties = {
  maxWidth: 520,
  textAlign: "center",
  borderRadius: 22,
  padding: "11px 20px",
  fontWeight: 900,
  fontSize: 17,
  color: "#7a2e62",
  background: "linear-gradient(#ffffff, #ffeaf5)",
  boxShadow: "0 5px 0 #ffb8d9, 0 10px 22px rgba(122,46,98,0.2)",
  animation: `park-pop ${TOAST_MS}ms ease forwards`,
};

const loader: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  background: "linear-gradient(#b9a6ff, #ffc2e2 55%, #ffe3cc)",
  transition: "opacity 450ms ease",
  zIndex: 60,
};
