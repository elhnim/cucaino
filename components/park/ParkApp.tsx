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
import type { UnlockedBadge } from "@/lib/domain/types";
import { getQuizGameData, type QuizGameData } from "@/lib/actions/world-panels";
import type { CoasterControls } from "@/lib/park/rides/quizCoaster";
import type { GolfEvent, GolfControls } from "@/lib/game3d/interiors/minigolf";
import { getDreamPark, placePiece, movePiece, removePiece, type DreamPark } from "@/lib/actions/park";
import { getPiece } from "@/lib/park/registry/pieces";
import { TICKETS_PER_QUEST, cellCenter, zoneBounds } from "@/lib/park/builder/rules";
import { BuilderBar, type BuilderSelection } from "./builder/BuilderBar";
import type { PetMode, PetFx } from "./pet/PetCareSheet";
import { getPlace } from "@/lib/park/registry/places";
import { playWithPet } from "@/lib/actions/pet";
import { PLAY_SECONDS } from "@/lib/pet/config";
import { todaysTreasures, dayKey, TREASURES_PER_DAY } from "@/lib/park/world/treasures";
import { seedFromString } from "@/lib/game3d/noise";
import { CandySheet } from "./ui/CandySheet";
import { MoodCheck } from "./MoodCheck";
import { WelcomeTour } from "./WelcomeTour";

// Every building panel loads on demand, never in the park's first download.
const PetCareSheet = dynamic(() => import("./pet/PetCareSheet").then((m) => m.PetCareSheet), { ssr: false });
const QuestBoard = dynamic(() => import("./quests/QuestBoard").then((m) => m.QuestBoard), { ssr: false });
const BadgeUnlockModal = dynamic(() => import("@/components/kid/BadgeUnlockModal"), { ssr: false });
const PrizeShop = dynamic(() => import("./shop/PrizeShop").then((m) => m.PrizeShop), { ssr: false });
const NuggetMarket = dynamic(() => import("./market/NuggetMarket").then((m) => m.NuggetMarket), { ssr: false });
const GameHall = dynamic(() => import("./games/GameHalls").then((m) => m.GameHall), { ssr: false });
const HALLS = ["learn", "library", "arcade", "money-town", "bank"] as const;
type Hall = (typeof HALLS)[number];
const FriendsPanel = dynamic(() => import("@/components/game/panels/FriendsPanel").then((m) => m.FriendsPanel), { ssr: false });
const QuizHubPanel = dynamic(() => import("@/components/game/panels/QuizHubPanel").then((m) => m.QuizHubPanel), { ssr: false });
const QuizGamePanel = dynamic(() => import("@/components/game/panels/QuizGamePanel").then((m) => m.QuizGamePanel), { ssr: false });
const DressUpPanel = dynamic(() => import("./DressUpPanel").then((m) => m.DressUpPanel), { ssr: false });

// start fetching three.js + the engine as soon as this module evaluates (parallel to hydration)
prefetchPark();

type Panel = Exclude<PlaceAction, "gift" | "none" | "build" | "parent"> | "dressup" | "quiz-hub";

const PET_MODE: Partial<Record<Panel, PetMode>> = {
  pet: "home",
  "pet-feed": "feed",
  "pet-wash": "wash",
  "pet-sleep": "sleep",
  "pet-tricks": "tricks",
  "pet-fetch": "fetch",
};
const STATION_FOR: Record<PetMode, string> = {
  home: "pet-house",
  feed: "pet-food",
  wash: "pet-bath",
  sleep: "pet-bed",
  tricks: "pet-stage",
  fetch: "pet-ball",
};
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
  market: "market",
  learn: "learn",
  library: "library",
  arcade: "arcade",
  "money-town": "money-town",
  bank: "bank",
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
  const [badges, setBadges] = useState<UnlockedBadge[]>([]);
  const [showTour, setShowTour] = useState(false);
  const [showMood, setShowMood] = useState(false);
  // ── Dream Park builder ──
  const [dream, setDream] = useState<DreamPark | null>(null);
  const [building, setBuilding] = useState(false);
  const [selection, setSelection] = useState<BuilderSelection | null>(null);
  const [selectedPlaced, setSelectedPlaced] = useState<{ uid: string; piece: string } | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildMsg, setBuildMsg] = useState<string | null>(null);
  const lastTap = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  // ── Fetch Field game ──
  const [fetchGame, setFetchGame] = useState<{ score: number; left: number } | null>(null);
  // ── rides ──
  const [coaster, setCoaster] = useState<{ quiz: QuizGameData; gate: number | null; answered: number | null; correct: number; done: boolean } | null>(null);
  const coasterCtl = useRef<CoasterControls>({});
  const [golf, setGolf] = useState<{ hole: number; name: string; par: number; strokes: number; scores: number[]; done?: { total: number; par: number } } | null>(null);
  const golfCtl = useRef<GolfControls>({});
  const fetchScore = useRef(0);
  const [questRefresh, setQuestRefresh] = useState(0);
  const firedAllDone = useRef(data.tasksToday.total > 0 && data.tasksToday.done >= data.tasksToday.total);
  const toastId = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  // ── daily treasure hunt + sticker album (per device) ──
  const treasures = useRef(todaysTreasures(seedFromString(kidId)));
  const [foundToday, setFoundToday] = useState<number[]>([]);
  const [album, setAlbum] = useState<string[]>([]);
  const [showAlbum, setShowAlbum] = useState(false);
  const huntKey = `cucaino.park.hunt.${kidId}.${dayKey()}`;
  const albumKey = `cucaino.park.album.${kidId}`;
  const onTreasure = useCallback(
    (id: number) => {
      const spot = treasures.current.find((t) => t.id === id);
      if (!spot) return;
      setFoundToday((f) => {
        const next = f.includes(id) ? f : [...f, id];
        try {
          window.localStorage.setItem(huntKey, JSON.stringify(next));
        } catch {}
        toast(`🗺️ Treasure! You found a ${spot.sticker} sticker! (${next.length}/${TREASURES_PER_DAY})`);
        if (next.length === TREASURES_PER_DAY) window.setTimeout(() => toast("🏆 You found ALL of today's treasures!"), 1500);
        return next;
      });
      setAlbum((a) => {
        const next = [...a, spot.sticker];
        try {
          window.localStorage.setItem(albumKey, JSON.stringify(next));
        } catch {}
        return next;
      });
      playSfx("win");
    },
    [huntKey, albumKey, toast],
  );
  const treasureRef = useRef(onTreasure);
  treasureRef.current = onTreasure;

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

  // walking up to a building asks first ("Go into the Prize Shop?") instead of popping it open
  const [ask, setAsk] = useState<PlaceDef | null>(null);
  const enterPlace = useCallback(
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
      if (place.action === "build") {
        enterBuildRef.current();
        return;
      }
      if (place.action === "parent") {
        router.push("/parent"); // parent area asks for the grown-up PIN
        return;
      }
      openPanel(place.action, place.id);
    },
    [kidId, openPanel, toast, router],
  );
  const handlePlace = useCallback(
    (place: PlaceDef) => {
      if (place.action === "none") return;
      if (place.action === "gift") {
        enterPlace(place); // the daily gift just pops — no need to ask
        return;
      }
      worldRef.current?.setMove(0, 0);
      setAsk(place);
      playSfx("tap");
    },
    [enterPlace],
  );
  const placeRef = useRef(handlePlace);
  placeRef.current = handlePlace;

  const flash = useCallback((text: string) => {
    setBuildMsg(text);
    window.setTimeout(() => setBuildMsg((m) => (m === text ? null : m)), 2600);
  }, []);

  const enterBuild = useCallback(() => {
    worldRef.current?.setInputEnabled(false);
    worldRef.current?.setBuildMode(true);
    setBuilding(true);
    setSelection(null);
    setSelectedPlaced(null);
    playSfx("tap");
  }, []);
  const enterBuildRef = useRef(enterBuild);
  enterBuildRef.current = enterBuild;

  const exitBuild = useCallback(() => {
    worldRef.current?.setBuildMode(false);
    worldRef.current?.stepOutOf("dream-park");
    worldRef.current?.setInputEnabled(true);
    setBuilding(false);
    setSelection(null);
    setSelectedPlaced(null);
  }, []);

  const moveGhost = useCallback((sel: BuilderSelection, x: number, z: number) => {
    lastTap.current = { x, z };
    const cell = worldRef.current?.setGhost(sel.pieceId, x, z, sel.r, sel.uid) ?? null;
    setSelection({ ...sel, cell });
  }, []);

  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onBuildTap = useCallback(
    (x: number, z: number) => {
      const sel = selectionRef.current;
      if (sel) moveGhost(sel, x, z);
      else {
        setSelectedPlaced(null);
        worldRef.current?.highlightPiece(null);
      }
    },
    [moveGhost],
  );
  const dreamRef = useRef(dream);
  dreamRef.current = dream;
  const onPieceTap = useCallback((uid: string) => {
    if (selectionRef.current) return;
    const item = dreamRef.current?.layout.find((p) => p.uid === uid);
    if (!item) return;
    setSelectedPlaced({ uid, piece: item.piece });
    worldRef.current?.highlightPiece(uid);
    playSfx("tap");
  }, []);
  const buildTapRef = useRef(onBuildTap);
  buildTapRef.current = onBuildTap;
  const pieceTapRef = useRef(onPieceTap);
  pieceTapRef.current = onPieceTap;

  const pickPiece = (pieceId: string) => {
    const def = getPiece(pieceId);
    if (!def || !dream) return;
    if (dream.tickets < def.cost) {
      flash(`You need ${def.cost - dream.tickets} more 🎟️ — finish a quest to earn tickets!`);
      playSfx("wrong");
      return;
    }
    const zb = zoneBounds();
    moveGhost({ pieceId, r: 0, cell: null }, (zb.minX + zb.maxX) / 2, (zb.minZ + zb.maxZ) / 2);
    playSfx("tap");
  };

  const applyPark = (p: DreamPark) => {
    setDream(p);
    void worldRef.current?.setLayout(p.layout);
  };

  const confirmBuild = async () => {
    const sel = selection;
    if (!sel?.cell?.ok || buildBusy) return;
    setBuildBusy(true);
    const res = sel.uid
      ? await movePiece(kidId, sel.uid, sel.cell.gx, sel.cell.gz, sel.r)
      : await placePiece(kidId, sel.pieceId, sel.cell.gx, sel.cell.gz, sel.r);
    setBuildBusy(false);
    if (!res.ok) {
      flash(res.error);
      playSfx("wrong");
      return;
    }
    applyPark(res.park);
    worldRef.current?.setGhost(null);
    const c = cellCenter(sel.pieceId, sel.cell.gx, sel.cell.gz, sel.r);
    worldRef.current?.cheerAt(c.x, c.z);
    playSfx(sel.uid ? "tap" : "win");
    if (!sel.uid) flash(`${getPiece(sel.pieceId)?.emoji ?? "✨"} Your park is growing!`);
    setSelection(null);
  };

  const removeSelected = async () => {
    if (!selectedPlaced || buildBusy) return;
    setBuildBusy(true);
    const res = await removePiece(kidId, selectedPlaced.uid);
    setBuildBusy(false);
    if (!res.ok) {
      flash(res.error);
      return;
    }
    applyPark(res.park);
    worldRef.current?.highlightPiece(null);
    setSelectedPlaced(null);
    playSfx("tap");
  };

  const startMove = () => {
    if (!selectedPlaced) return;
    const item = dream?.layout.find((p) => p.uid === selectedPlaced.uid);
    if (!item) return;
    worldRef.current?.highlightPiece(null);
    const c = cellCenter(item.piece, item.gx, item.gz, item.r);
    moveGhost({ pieceId: item.piece, uid: item.uid, r: item.r, cell: null }, c.x, c.z);
    setSelectedPlaced(null);
  };

  const petFx: PetFx = {
    react: async (mode, anim) => {
      const w = worldRef.current;
      const st = getPlace(STATION_FOR[mode]);
      if (!w) return;
      if (st && mode !== "home" && mode !== "sleep") {
        await w.petGoTo(st.x + 1.6, st.z + 1.6);
      }
      w.petAnim(anim);
      if (mode === "wash") w.cheerAt(st?.x ?? 0, st?.z ?? 0);
      window.setTimeout(() => w.petFollow(), 2600);
    },
    say: (t) => worldRef.current?.petSay(t),
    status: (p) => worldRef.current?.setPetStatus(p),
    sleep: (on) => {
      const bed = getPlace("pet-bed");
      worldRef.current?.setPetSleeping(on, bed ? { x: bed.x, z: bed.z } : undefined);
    },
    celebrate: () => worldRef.current?.celebrate(true),
  };

  const startFetch = () => {
    const w = worldRef.current;
    const field = getPlace("pet-ball");
    if (!w || !field || !pet) return;
    setPanel(null);
    w.setInputEnabled(false);
    w.startFetch({ x: field.x, z: field.z });
    fetchScore.current = 0;
    setFetchGame({ score: 0, left: PLAY_SECONDS });
    playSfx("tap");
    const started = Date.now();
    const timer = window.setInterval(async () => {
      const left = Math.max(0, PLAY_SECONDS - Math.floor((Date.now() - started) / 1000));
      setFetchGame((g) => (g ? { ...g, left } : g));
      if (left > 0) return;
      window.clearInterval(timer);
      const score = fetchScore.current;
      worldRef.current?.stopFetch();
      worldRef.current?.setInputEnabled(true);
      setFetchGame(null);
      const res = await playWithPet(kidId, score);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      setPet(res.pet);
      setPoints(res.pointsBalance);
      worldRef.current?.setPetStatus(res.pet);
      worldRef.current?.celebrate(true);
      playSfx("win");
      toast(`🎾 ${score} catch${score === 1 ? "" : "es"}! ${res.pet.name} had so much fun!`);
      window.setTimeout(() => worldRef.current?.setPetStatus(null), 4000);
    }, 250);
  };
  const onFetchCatch = useCallback(() => {
    fetchScore.current += 1;
    setFetchGame((g) => (g ? { ...g, score: fetchScore.current } : g));
    playSfx("coin");
  }, []);
  const fetchCatchRef = useRef(onFetchCatch);
  fetchCatchRef.current = onFetchCatch;

  // show the pet's need bars while its screens are open
  useEffect(() => {
    const mode = panel ? PET_MODE[panel.kind] : undefined;
    if (mode && pet) worldRef.current?.setPetStatus(pet);
    else if (!fetchGame) worldRef.current?.setPetStatus(null);
  }, [panel, pet, fetchGame]);

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
    let found: number[] = [];
    try {
      found = JSON.parse(window.localStorage.getItem(`cucaino.park.hunt.${kidId}.${dayKey()}`) ?? "[]");
      setAlbum(JSON.parse(window.localStorage.getItem(`cucaino.park.album.${kidId}`) ?? "[]"));
    } catch {}
    setFoundToday(found);
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
          onLeavePlace: (id) => setAsk((a) => (a?.id === id ? null : a)),
          onBuildTap: (x, z) => buildTapRef.current(x, z),
          onPieceTap: (uid) => pieceTapRef.current(uid),
          onFetchCatch: () => fetchCatchRef.current(),
          treasures: { spots: treasures.current, found },
          onTreasure: (id) => treasureRef.current(id),
          onError: () => !disposed && setBootError(true),
          onReady: () => {
            setReady(true);
            getDreamPark(kidId)
              .then((p) => {
                if (!p || disposed) return;
                setDream(p);
                void world?.setLayout(p.layout);
              })
              .catch(() => {});
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
    w.setBeacon("pet-house", !pet ? "🥚" : null);
    const need: Record<string, string> = { starving: "pet-food", dirty: "pet-bath", tired: "pet-bed", sleeping: "pet-bed", lonely: "pet-ball" };
    for (const st of ["pet-food", "pet-bath", "pet-bed", "pet-ball"]) w.setBeacon(st, mood && need[mood.id] === st ? mood.emoji : null);
    w.setBeacon("daily-gift", giftReady ? "🎁" : null);
  }, [ready, done, data.tasksToday.total, pet, giftReady]);

  // a pet that was already asleep starts the visit tucked up in its bed
  useEffect(() => {
    if (ready && data.pet?.isSleeping) {
      const bed = getPlace("pet-bed");
      worldRef.current?.setPetSleeping(true, bed ? { x: bed.x, z: bed.z } : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // greet once the park is on screen
  const greeted = useRef(false);
  useEffect(() => {
    if (!ready || greeted.current) return;
    greeted.current = true;
    if (!data.kid.tourSeen) setShowTour(true);
    else {
      try {
        const key = `cucaino.park.mood.${kidId}.${dayKey()}`;
        if (!window.localStorage.getItem(key)) {
          window.localStorage.setItem(key, "1");
          window.setTimeout(() => setShowMood(true), 2600);
        }
      } catch {}
    }
    const left = data.tasksToday.total - done;
    const lines = [
      streak >= 2 ? `Welcome back ${data.kid.name}! 🔥 ${streak} days in a row` : `Hi ${data.kid.name}! Welcome to Cucaino Park 🍭`,
      left > 0 ? `${left} quest${left === 1 ? "" : "s"} waiting on the Quest Board 📋` : giftReady ? "Your daily gift is on the plaza 🎁" : "",
    ].filter(Boolean);
    lines.forEach((l, i) => window.setTimeout(() => toast(l), 500 + i * 1800));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, streak, done, giftReady, data.kid.name, data.tasksToday.total, toast]);

  // quests finished inside the Quest Board → confetti, happy pet, sound, live counts
  useEffect(() => {
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent<{ points?: number; name?: string; icon?: string }>).detail ?? {};
      const pts = detail.points ?? 0;
      setDone((d) => Math.min(data.tasksToday.total, d + 1));
      setPoints((p) => p + pts);
      setDream((d) => (d ? { ...d, tickets: d.tickets + TICKETS_PER_QUEST } : d));
      worldRef.current?.celebrate(true);
      playSfx("coin");
      if (detail.name) toast(`${detail.icon ?? "🎉"} Quest complete! +${pts} ⭐ +${TICKETS_PER_QUEST} 🎟️`);
    };
    const onBadge = (e: Event) => {
      const b = (e as CustomEvent<{ badges?: UnlockedBadge[] }>).detail?.badges;
      if (b?.length) {
        setBadges(b);
        playSfx("win");
      }
    };
    window.addEventListener("badge-unlocked", onBadge);
    const onSpent = (e: Event) => {
      const amt = (e as CustomEvent<{ amount?: number }>).detail?.amount ?? 0;
      setPoints((p) => Math.max(0, p - amt));
      worldRef.current?.celebrate(true);
      playSfx("win");
    };
    window.addEventListener("stars-spent", onSpent);
    const onUndone = (e: Event) => {
      const pts = (e as CustomEvent<{ points?: number }>).detail?.points ?? 0;
      setDone((d) => Math.max(0, d - 1));
      setPoints((p) => Math.max(0, p - pts));
      setDream((d) => (d ? { ...d, tickets: Math.max(0, d.tickets - TICKETS_PER_QUEST) } : d));
    };
    window.addEventListener("task-completed", onDone);
    window.addEventListener("task-uncompleted", onUndone);
    return () => {
      window.removeEventListener("task-completed", onDone);
      window.removeEventListener("task-uncompleted", onUndone);
      window.removeEventListener("badge-unlocked", onBadge);
      window.removeEventListener("stars-spent", onSpent);
    };
  }, [data.tasksToday.total, toast]);

  // every quest done today → the park's fireworks show (once per visit)
  useEffect(() => {
    if (!ready || firedAllDone.current) return;
    if (data.tasksToday.total > 0 && done >= data.tasksToday.total) {
      firedAllDone.current = true;
      window.setTimeout(() => {
        worldRef.current?.fireworks(6);
        playSfx("win");
        toast("🎆 ALL QUESTS DONE! Fireworks for you! 🎆");
      }, 1200);
    }
  }, [ready, done, data.tasksToday.total, toast]);

  // full-screen overlays cover the canvas: stop drawing 3D under them (battery)
  useEffect(() => {
    worldRef.current?.setPaused(!!quizBank || !!page);
  }, [quizBank, page]);

  const pickRide = (r: RideEntry) => {
    if (r.route === "coaster") setPanel({ kind: "quiz-hub", placeId: panel?.placeId });
    else if (r.route === "golf") void startGolf();
    else if (r.route === "market") setPanel({ kind: "market", placeId: panel?.placeId });
    else if (typeof r.route === "function") setPage({ src: r.route(kidId), title: `${r.emoji} ${r.name}` });
    else if ((HALLS as readonly string[]).includes(r.route)) setPanel({ kind: r.route as Hall, placeId: panel?.placeId });
  };

  const startCoaster = async (bankId: string) => {
    const quiz = await getQuizGameData(kidId, bankId);
    if (!quiz || quiz.questions.length === 0) {
      toast("That quiz has no questions yet!");
      return;
    }
    const { buildQuizCoaster } = await import("@/lib/park/rides/quizCoaster");
    const questions = quiz.questions.slice(0, 6);
    const q = { ...quiz, questions };
    setPanel(null);
    setCoaster({ quiz: q, gate: null, answered: null, correct: 0, done: false });
    worldRef.current?.enterRide(
      buildQuizCoaster(
        questions.length,
        (i) => {
          setCoaster((c) => (c ? { ...c, gate: i, answered: null } : c));
          playSfx("tap");
        },
        () => {
          setCoaster((c) => (c ? { ...c, gate: null, done: true } : c));
          playSfx("win");
        },
        coasterCtl.current,
      ),
    );
    toast("🎢 Hold on tight! Answer at every gate!");
  };

  const answerCoaster = (choice: number) => {
    setCoaster((c) => {
      if (!c || c.gate === null || c.answered !== null) return c;
      const right = c.quiz.questions[c.gate].choices[choice]?.isCorrect ?? false;
      playSfx(right ? "correct" : "wrong");
      window.setTimeout(() => {
        setCoaster((cc) => (cc ? { ...cc, gate: null, answered: null } : cc));
        coasterCtl.current.resume?.(right);
      }, 1100);
      return { ...c, answered: choice, correct: c.correct + (right ? 1 : 0) };
    });
  };

  const leaveRide = () => {
    worldRef.current?.exitRide();
    setCoaster(null);
    setGolf(null);
  };

  const onGolf = useCallback(
    (e: GolfEvent) => {
      if (e.type === "hole-start") setGolf((g) => ({ hole: e.hole, name: e.name, par: e.par, strokes: 0, scores: e.hole === 1 ? [] : (g?.scores ?? []) }));
      else if (e.type === "stroke") setGolf((g) => (g ? { ...g, strokes: e.strokes } : g));
      else if (e.type === "sunk") {
        setGolf((g) => (g ? { ...g, scores: [...g.scores, e.strokes] } : g));
        playSfx("win");
        toast(`${e.label} (${e.strokes} stroke${e.strokes === 1 ? "" : "s"})`);
      } else if (e.type === "course-done") {
        setGolf((g) => (g ? { ...g, done: { total: e.total, par: e.par } } : g));
        playSfx("win");
      }
    },
    [toast],
  );
  const golfRef = useRef(onGolf);
  golfRef.current = onGolf;

  const startGolf = async () => {
    const { buildMiniGolfInterior } = await import("@/lib/game3d/interiors/minigolf");
    setPanel(null);
    worldRef.current?.enterRide((accent) => buildMiniGolfInterior(accent, (e) => golfRef.current(e), golfCtl.current));
    toast("⛳ Drag back from anywhere to aim, let go to putt!");
  };

  const pickAnimal = (a: ParkAnimal) => {
    setAnimal(a);
    saveParkAnimalChoice(kidId, a.id);
    void worldRef.current?.setKidAnimal(a.id);
    playSfx("sparkle");
  };

  const busy = !!panel || !!quizBank || !!page || !!coaster || !!golf;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#ffe3f1" }} className="font-fun">
      <style>{css}</style>
      <GameFullscreen />
      <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {/* top HUD */}
      <div style={{ ...hudTop, display: building ? "none" : "flex" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={pill} onClick={() => router.push("/select-kid")} aria-label="Switch profile">
            🔄
          </button>
          <button style={pill} onClick={() => openPanel("dressup")} aria-label="Choose your animal">
            {animal?.emoji ?? "🐾"} Me
          </button>
          <button style={pill} onClick={enterBuild} aria-label="Build my Dream Park">
            🔨 Build
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Chip emoji="⭐" value={`${points}`} />
          <Chip emoji="📋" value={`${done}/${data.tasksToday.total}`} />
          {dream && <Chip emoji="🎟️" value={`${dream.tickets}`} />}
          <button style={{ ...chip, border: "none", cursor: "pointer", pointerEvents: "auto" }} onClick={() => setShowAlbum(true)} aria-label="Sticker album">
            <span style={{ fontSize: 20 }}>🗺️</span>
            <span style={{ fontWeight: 900, color: "#7a2e62" }}>
              {foundToday.length}/{TREASURES_PER_DAY}
            </span>
          </button>
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

      {ready && !busy && !building && <Joystick onChange={(x, y) => worldRef.current?.setMove(x, y)} />}
      {ready && !busy && !building && (
        <div style={turnBar}>
          <button style={turnBtn} onClick={() => worldRef.current?.rotateView(Math.PI / 4)} aria-label="Turn view left">⟲</button>
          <button style={turnBtn} onClick={() => worldRef.current?.rotateView(-Math.PI / 4)} aria-label="Turn view right">⟳</button>
        </div>
      )}
      {ask && !busy && (
        <div style={askCard}>
          <div style={{ fontSize: 38, lineHeight: 1 }}>{ask.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#5a2350" }}>{ask.action === "build" ? "Build your Dream Park?" : ask.action === "parent" ? "Go to the grown-ups' area?" : `Go into ${ask.label}?`}</div>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#9b7090" }}>{ASK_HINT[ask.action] ?? ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...pill, background: "linear-gradient(#ffffff,#f3e8f1)" }} onClick={() => setAsk(null)}>
              Not now
            </button>
            <button
              style={{ ...pill, color: "#fff", background: "linear-gradient(#ff7fbd,#ff4f9e)", boxShadow: "0 4px 0 #d23a82" }}
              onClick={() => {
                const p = ask;
                setAsk(null);
                enterPlace(p);
              }}
            >
              Go in! →
            </button>
          </div>
        </div>
      )}

      {building && (
        <BuilderBar
          tickets={dream?.tickets ?? 0}
          level={dream?.level ?? 1}
          streak={dream?.streak ?? 0}
          selection={selection}
          selectedPlaced={selectedPlaced}
          busy={buildBusy}
          message={buildMsg}
          onPick={pickPiece}
          onRotate={() => selection && moveGhost({ ...selection, r: (selection.r + 1) % 4 }, lastTap.current.x, lastTap.current.z)}
          onConfirm={confirmBuild}
          onCancel={() => {
            worldRef.current?.setGhost(null);
            worldRef.current?.highlightPiece(null);
            setSelection(null);
            setSelectedPlaced(null);
          }}
          onMove={startMove}
          onRemove={removeSelected}
          onDone={exitBuild}
        />
      )}

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

      {panel?.kind === "quests" && (
        <QuestBoard kidId={kidId} accentColor={theme.accent} onClose={closePanel} onOpenPage={(src, title) => setPage({ src, title })} refreshKey={questRefresh} />
      )}
      {panel?.kind === "shop" && <PrizeShop kidId={kidId} onClose={closePanel} />}
      {panel?.kind === "market" && <NuggetMarket kidId={kidId} onClose={closePanel} onStars={setPoints} />}
      {panel && (HALLS as readonly string[]).includes(panel.kind) && <GameHall kind={panel.kind as Hall} kidId={kidId} onClose={closePanel} />}
      {panel?.kind === "friends" && <FriendsPanel kidId={kidId} accentColor={theme.accent} onClose={closePanel} />}
      {panel && PET_MODE[panel.kind] && (
        <PetCareSheet
          kidId={kidId}
          pet={pet}
          mode={PET_MODE[panel.kind]!}
          points={points}
          onPet={(p, pts) => {
            if (!pet) void worldRef.current?.setPetAnimal(parkAnimalForPet(p.species)); // just adopted!
            setPet(p);
            setPoints(pts);
          }}
          onStartFetch={startFetch}
          onClose={closePanel}
          fx={petFx}
        />
      )}
      {fetchGame && (
        <div style={fetchHud}>
          <div style={{ fontSize: 28 }}>🎾</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Catches: {fetchGame.score}</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Tap the field to throw! ⏱ {fetchGame.left}s</div>
          </div>
        </div>
      )}
      {panel?.kind === "rides" && <RidesMenu onPick={pickRide} onClose={closePanel} />}
      {panel?.kind === "quiz-hub" && (
        <QuizHubPanel
          onClose={closePanel}
          onPick={(bankId) => {
            void startCoaster(bankId);
          }}
        />
      )}
      {panel?.kind === "dressup" && <DressUpPanel currentId={animal?.id ?? ""} onPick={pickAnimal} onClose={closePanel} />}
      {quizBank && <QuizGamePanel kidId={kidId} bankId={quizBank} onExit={() => setQuizBank(null)} />}
      {page && (
        <WorldPageWindow
          src={page.src}
          title={page.title}
          onClose={() => {
            setPage(null);
            setQuestRefresh((n) => n + 1); // a Practice Stage may have completed a quest
          }}
        />
      )}
      {badges.length > 0 && <BadgeUnlockModal badges={badges} onDismiss={() => setBadges([])} />}
      {showTour && <WelcomeTour kidId={kidId} onDone={() => setShowTour(false)} />}
      {showMood && (
        <MoodCheck
          kidId={kidId}
          name={data.kid.name}
          onDone={(reply) => {
            setShowMood(false);
            if (reply) {
              toast(reply);
              worldRef.current?.celebrate();
              playSfx("sparkle");
            }
          }}
        />
      )}

      {(coaster || golf) && (
        <button style={{ ...pill, position: "fixed", top: "max(14px, env(safe-area-inset-top))", left: 14, zIndex: 32 }} onClick={leaveRide}>
          🚪 Back to the park
        </button>
      )}
      {coaster && coaster.gate !== null && (
        <div style={rideCard}>
          <div style={{ fontWeight: 900, fontSize: 13, color: "#c26a9f" }}>
            ❓ Gate {coaster.gate + 1} of {coaster.quiz.questions.length} · {coaster.quiz.bankName}
          </div>
          <div style={{ fontWeight: 900, fontSize: 19, color: "#5a2350", margin: "6px 0 12px" }}>{coaster.quiz.questions[coaster.gate].prompt}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {coaster.quiz.questions[coaster.gate].choices.map((ch, i) => {
              const picked = coaster.answered === i;
              const show = coaster.answered !== null;
              const bg = show ? (ch.isCorrect ? "#2fcf8f" : picked ? "#ff4f6d" : "#e9dbe4") : ["#ff5fa8", "#36b8ff", "#f5b400", "#a96bff"][i % 4];
              return (
                <button key={i} type="button" onClick={() => answerCoaster(i)} disabled={show} style={{ border: "none", borderRadius: 18, padding: "12px 10px", fontWeight: 900, fontSize: 15, color: "#fff", background: bg, boxShadow: "0 4px 0 rgba(0,0,0,0.15)", cursor: "pointer" }}>
                  {ch.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {coaster?.done && (
        <div style={rideCard}>
          <div style={{ fontSize: 44, textAlign: "center" }}>{coaster.correct === coaster.quiz.questions.length ? "🏆" : "🎉"}</div>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#5a2350", textAlign: "center" }}>
            {coaster.correct}/{coaster.quiz.questions.length} gates right!
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
            <button style={pill} onClick={leaveRide}>🎡 Back to the park</button>
          </div>
        </div>
      )}
      {golf && (
        <div style={{ ...rideCard, top: "auto", bottom: "max(18px, env(safe-area-inset-bottom))", textAlign: "center" }}>
          {golf.done ? (
            <>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#1f5130" }}>🏆 {golf.done.total} strokes · par {golf.done.par}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
                <button style={pill} onClick={() => { golfCtl.current.restart?.(); setGolf((g) => (g ? { ...g, done: undefined, scores: [] } : g)); }}>🔄 Play again</button>
                <button style={pill} onClick={leaveRide}>🎡 Park</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 900, color: "#1f5130" }}>⛳ Hole {golf.hole} · {golf.name}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1f5130" }}>
                Par {golf.par} · Strokes <b>{golf.strokes}</b>{golf.scores.length > 0 && ` · Total ${golf.scores.reduce((a, c) => a + c, 0)}`}
              </div>
            </>
          )}
        </div>
      )}
      {showAlbum && (
        <CandySheet title="📒 My Sticker Album" subtitle={`${foundToday.length}/${TREASURES_PER_DAY} treasures found today · new ones hide every day!`} color="#a96bff" onClose={() => setShowAlbum(false)}>
          {album.length === 0 ? (
            <p style={{ textAlign: "center", fontWeight: 800, color: "#9b7090" }}>No stickers yet — treasures are hiding in the Sweet Forest 🍄 and all over the park!</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 8 }}>
              {album.map((s, i) => (
                <div key={i} style={{ fontSize: 40, textAlign: "center", background: "#fff", borderRadius: 18, padding: 6, boxShadow: "0 3px 0 #f5d3e6" }}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </CandySheet>
      )}
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

const ASK_HINT: Partial<Record<PlaceAction, string>> = {
  quests: "See today's quests and earn stars + tickets",
  shop: "Spend your stars on prizes",
  pet: "Visit your pet's home",
  "pet-feed": "Give your pet a snack",
  "pet-wash": "Bubble bath time!",
  "pet-sleep": "Nap time for your pet",
  "pet-fetch": "Play fetch together",
  "pet-tricks": "Learn and show off tricks",
  friends: "Chat with your friends",
  rides: "Quiz Coaster, Mini Golf and games",
  build: "Place new things with your tickets",
  market: "Buy and sell shares with your nuggets",
  learn: "Life-skill mini-courses — earn stars",
  library: "Read stories and chapter books — earn stars",
  arcade: "AI brain games with sparks",
  "money-town": "The family money board game",
  bank: "Real-money investing (grown-ups switch it on)",
  parent: "A grown-up PIN is needed",
};

const askCard: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "calc(max(16px, env(safe-area-inset-bottom)) + 150px)",
  transform: "translateX(-50%)",
  width: "min(560px, calc(100vw - 24px))",
  zIndex: 33,
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  borderRadius: 26,
  padding: "12px 14px",
  background: "linear-gradient(#ffffff, #fff4fa)",
  boxShadow: "0 6px 0 #ffb8d9, 0 12px 28px rgba(122,46,98,0.22)",
};

const turnBar: React.CSSProperties = {
  position: "fixed",
  left: "max(16px, env(safe-area-inset-left))",
  bottom: "max(22px, env(safe-area-inset-bottom))",
  zIndex: 20,
  display: "flex",
  gap: 10,
};

const turnBtn: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 999,
  border: "none",
  fontSize: 26,
  fontWeight: 900,
  color: "#7a2e62",
  background: "linear-gradient(#ffffff, #ffe6f2)",
  boxShadow: "0 4px 0 #ffb8d9, 0 8px 16px rgba(122,46,98,0.18)",
  cursor: "pointer",
};

const rideCard: React.CSSProperties = {
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 58px)",
  left: "50%",
  transform: "translateX(-50%)",
  width: "min(560px, calc(100vw - 24px))",
  zIndex: 31,
  borderRadius: 26,
  padding: "14px 16px",
  background: "linear-gradient(#ffffff, #fff4fa)",
  boxShadow: "0 6px 0 #ffb8d9, 0 12px 28px rgba(122,46,98,0.22)",
};

const fetchHud: React.CSSProperties = {
  position: "fixed",
  top: "max(14px, env(safe-area-inset-top))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: 24,
  padding: "10px 20px",
  color: "#7a2e62",
  background: "linear-gradient(#fff,#fff6d6)",
  boxShadow: "0 5px 0 #ffd84a, 0 10px 22px rgba(122,46,98,0.2)",
  pointerEvents: "none",
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
