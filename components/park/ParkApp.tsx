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
import { getDreamPark, placePiece, movePiece, removePiece, payForPlay, type DreamPark } from "@/lib/actions/park";
import { hasFreePlay, spendFreePlay } from "@/lib/park/freePlays";
import { getHabits, type HabitState, type ChestPrize } from "@/lib/actions/park-habits";
import { PET_TREAT_XP } from "@/lib/data/park-tickets";
import { levelFromXp, stageFromLevel } from "@/lib/pet/logic";
import { getPiece } from "@/lib/park/registry/pieces";
import { TICKETS_PER_QUEST, cellCenter, zoneBounds, levelFor, LEVELS } from "@/lib/park/builder/rules";
import { BuilderBar, type BuilderSelection } from "./builder/BuilderBar";
import type { PetMode, PetFx } from "./pet/PetCareSheet";
import { getPlace } from "@/lib/park/registry/places";
import { playWithPet } from "@/lib/actions/pet";
import { PLAY_SECONDS } from "@/lib/pet/config";
import { todaysTreasures, dayKey, TREASURES_PER_DAY } from "@/lib/park/world/treasures";
import { seedFromString } from "@/lib/game3d/noise";
import { CandySheet } from "./ui/CandySheet";
import { C, FONT, PARK_CSS, alpha, cardStyle, display, glass } from "./ui/theme";
import { GameButton } from "./ui/GameButton";
import { GameDialog } from "./ui/GameDialog";
import { IconChip } from "./ui/IconChip";
import { PlayerBadge, WalletBar, QuestBanner, RoundButton, Toast, PromptCard } from "./ui/Hud";
import { MoodCheck } from "./MoodCheck";
import { WelcomeTour } from "./WelcomeTour";
import { MiniMap, routeToSpot, type MapPin } from "./MiniMap";
import { Ambience } from "@/lib/park/audio/ambience";
import { MOUNTS, MOUNT_SKINS, type MountKind, type MountSkin } from "@/lib/park/characters/mounts";
import { SHARD_COUNT, RING_COUNT } from "@/lib/park/world/quests3d";
import { PEARL_COUNT } from "@/lib/park/world/underwater";
import { SKY_ISLANDS, SKY_SPOTS, skyIslandById } from "@/lib/park/registry/skyIslands";
import { VILLAGE_ISLAND } from "@/lib/park/registry/villageIsland";
import { WIZARDS, todaysLesson, dayNumber, type WizardId } from "@/lib/park/wizards";
import { readWisdom, addWisdom } from "@/lib/park/wizards/wisdomBook";

// Every building panel loads on demand, never in the park's first download.
const PetCareSheet = dynamic(() => import("./pet/PetCareSheet").then((m) => m.PetCareSheet), { ssr: false });
const WizardSheet = dynamic(() => import("./wizards/WizardSheet").then((m) => m.WizardSheet), { ssr: false });
const BookOfWisdom = dynamic(() => import("./wizards/BookOfWisdom").then((m) => m.BookOfWisdom), { ssr: false });
const MysteryChest = dynamic(() => import("./habits/MysteryChest").then((m) => m.MysteryChest), { ssr: false });
const QuestBoard = dynamic(() => import("./quests/QuestBoard").then((m) => m.QuestBoard), { ssr: false });
const BadgeUnlockModal = dynamic(() => import("@/components/kid/BadgeUnlockModal"), { ssr: false });
const PrizeShop = dynamic(() => import("./shop/PrizeShop").then((m) => m.PrizeShop), { ssr: false });
const RetroArcade = dynamic(() => import("./retro/RetroArcade").then((m) => m.RetroArcade), { ssr: false });
const NuggetMarket = dynamic(() => import("./market/NuggetMarket").then((m) => m.NuggetMarket), { ssr: false });
const GameHall = dynamic(() => import("./games/GameHalls").then((m) => m.GameHall), { ssr: false });
const HALLS = ["learn", "library", "theatre", "arcade", "money-town", "bank"] as const;
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

/** The park's finish, per device: "diorama" (the storybook look — ink outlines, stepped colour,
 *  chunky pixels, a higher model-railway camera; the default) or "smooth" (classic). */
const LOOK_KEY = "cucaino.look";
function readLook(): "diorama" | "smooth" {
  try {
    return window.localStorage.getItem(LOOK_KEY) === "smooth" ? "smooth" : "diorama";
  } catch {
    return "diorama";
  }
}

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
  theatre: "theatre",
  retro: "retro",
  arcade: "arcade",
  "money-town": "money-town",
  bank: "bank",
  golf: "golf",
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
  // ── habit loop: streak + daily chest (server), and the pet growing with every quest ──
  const [habits, setHabits] = useState<HabitState | null>(null);
  const [showChest, setShowChest] = useState(false);
  const [petXp, setPetXp] = useState(data.pet?.xp ?? 0);
  const [points, setPoints] = useState(data.kid.pointsBalance);
  // lifetime stars earned -> the HUD level + XP bar (same levels as the Dream Park)
  const [starsEarned, setStarsEarned] = useState(data.kid.totalStarsEarned ?? 0);
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
  const [golf, setGolf] = useState<{ hole: number; of: number; name: string; par: number; tip: string | null; strokes: number; scores: number[]; done?: { total: number; par: number } } | null>(null);
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
  // ── wizards: 6 of them hide somewhere new each day, each with one lesson ──
  const wizDay = useRef(dayNumber(new Date()));
  const [wisdom, setWisdom] = useState<Record<string, string>>({});
  const [wizardSpots, setWizardSpots] = useState<{ id: string; x: number; z: number }[]>([]);
  const [showBook, setShowBook] = useState(false);
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
  const [questNudge, setQuestNudge] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // ── rides round the island: pick a pony, manta or dragon ──
  const [pickMount, setPickMount] = useState(false);
  // ── exploration: Star Shards found (per device) + the Sky Rings course ──
  const shardKey = `cucaino.shards.${kidId}`;
  const [shards, setShards] = useState<number[]>([]);
  const [skin, setSkin] = useState<MountSkin>("classic");
  const [ringRun, setRingRun] = useState<{ passed: number; t0: number } | null>(null);
  const shardRef = useRef<(id: number) => void>(() => {});
  const pearlKey = `cucaino.pearls.${kidId}`;
  const [pearls, setPearls] = useState<number[]>([]);
  const pearlRef = useRef<(id: number) => void>(() => {});
  const ringRef = useRef<(passed: number, lap?: number) => void>(() => {});
  const [riding, setRiding] = useState<{ kind: MountKind; flying: boolean; landing: boolean } | null>(null);
  // swimming in the sea (on foot, or on a manta under the waves): shows the swim up / dive buttons
  const [swim, setSwim] = useState<{ under: boolean } | null>(null);
  const [onCoaster, setOnCoaster] = useState(false);
  // a Coralcove villager talking to the kid
  const [villageTalk, setVillageTalk] = useState<{ name: string; line: string } | null>(null);
  // floating mountains: the one you're flying over (to land on), and the treasures found
  const [landName, setLandName] = useState<string | null>(null);
  const skyKey = `cucaino.skychests.${kidId}`;
  const [skyFound, setSkyFound] = useState<string[]>([]);
  // discoveries on the floating mountains (caves, nests, rune circles, telescopes …)
  const spotKey = `cucaino.skyspots.${kidId}`;
  const [spots, setSpots] = useState<string[]>([]);
  const swimHinted = useRef(false);

  // ── plays cost a ticket (earned from quests); every game's first play each day is free ──
  const [payAsk, setPayAsk] = useState<{ game: string; what: string; busy?: boolean; error?: string } | null>(null);
  const payResolve = useRef<((ok: boolean) => void) | null>(null);
  const payPlay = useCallback(
    (game: string, what: string): Promise<boolean> => {
      if (hasFreePlay(kidId, game)) {
        spendFreePlay(kidId, game);
        toast("🎁 Your free play today — enjoy!");
        return Promise.resolve(true);
      }
      payResolve.current?.(false);
      return new Promise<boolean>((resolve) => {
        payResolve.current = resolve;
        setPayAsk({ game, what });
      });
    },
    [kidId, toast],
  );
  const closePay = (ok: boolean) => {
    payResolve.current?.(ok);
    payResolve.current = null;
    setPayAsk(null);
  };
  const confirmPay = async () => {
    setPayAsk((p) => (p ? { ...p, busy: true, error: undefined } : p));
    const res = await payForPlay(kidId);
    setDream((d) => (d ? { ...d, tickets: res.tickets } : d));
    if (res.ok) {
      playSfx("coin");
      closePay(true);
    } else setPayAsk((p) => (p ? { ...p, busy: false, error: res.error } : p));
  };
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
      if (place.action === "skycoaster") {
        worldRef.current?.rideSkyCoaster();
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
          look: readLook(),
          kidAnimal: chosen.id,
          petAnimal: data.pet ? parkAnimalForPet(data.pet.species) : null,
          themeId: data.kid.themeId,
          accent: theme.accent,
          // ?hour=21 previews the twilight (handy for grown-ups and for screenshots)
          hour: (() => {
            const h = Number(new URLSearchParams(window.location.search).get("hour"));
            return Number.isFinite(h) && h > 0 && h <= 24 ? () => h : undefined;
          })(),
          onPlace: (p) => placeRef.current(p),
          onLeavePlace: (id) => setAsk((a) => (a?.id === id ? null : a)),
          onBuildTap: (x, z) => buildTapRef.current(x, z),
          onPieceTap: (uid) => pieceTapRef.current(uid),
          onFetchCatch: () => fetchCatchRef.current(),
          treasures: { spots: treasures.current, found },
          onTreasure: (id) => treasureRef.current(id),
          onShard: (id) => shardRef.current(id),
          onPearl: (id) => pearlRef.current(id),
          onSkyCoaster: (on) => {
            setOnCoaster(on);
            playSfx(on ? "win" : "tap");
            if (on) toast("🎢 Hold on tight! Round the whole island we go!");
          },
          onWrap: () => toast("🌍 All the way round the world — and back to Cucaino Island!"),
          onVillageTalk: (t) => setVillageTalk(t ? { name: t.name, line: t.line } : null),
          onVillage: (name, clan) => {
            playSfx("win");
            toast(`🏝️ You found ${name}, home of ${clan}! Say hello to the villagers`);
          },
          onSkyIsland: (id, what) => {
            if (what === "glide") toast("🍃 Wheee — floating gently down!");
            else toast(`🏝️ You landed on ${skyIslandById(id ?? "")?.name ?? "a floating mountain"}! Can you find its treasure chest?`);
          },
          onSkySpot: (sp) => {
            setSpots((cur) => {
              if (cur.includes(sp.id)) return cur;
              const next = [...cur, sp.id];
              try {
                window.localStorage.setItem(spotKey, JSON.stringify(next));
              } catch {}
              if (sp.kind === "launcher") toast(`💥 Whoosh! Off to ${skyIslandById(sp.target ?? "")?.name ?? "another island"}!`);
              else {
                playSfx("sparkle");
                toast(`✨ ${sp.name}! ${sp.text} (${next.length}/${SKY_SPOTS.length})`);
              }
              return next;
            });
          },
          onSkyTreasure: (id) => {
            setSkyFound((cur) => {
              if (cur.includes(id)) return cur;
              const next = [...cur, id];
              try {
                window.localStorage.setItem(skyKey, JSON.stringify(next));
              } catch {}
              playSfx("win");
              worldRef.current?.fireworks(next.length >= SKY_ISLANDS.length ? 6 : 3);
              toast(next.length >= SKY_ISLANDS.length ? `🏆 Every sky treasure found! You've explored all ${SKY_ISLANDS.length} floating mountains!` : `🎁 The treasure of ${skyIslandById(id)?.name ?? "the island"}! (${next.length}/${SKY_ISLANDS.length})`);
              return next;
            });
          },
          onSwim: (inSea) => {
            ambience.current?.splash();
            if (inSea && !swimHinted.current) {
              swimHinted.current = true;
              toast("🌊 Splash! Hold ▼ to dive under the waves and explore the reef");
            }
          },
          onRing: (passed, lap) => ringRef.current(passed, lap),
          onError: () => !disposed && setBootError(true),
          onReady: () => {
            setReady(true);
            try {
              const saved = JSON.parse(window.localStorage.getItem(`cucaino.shards.${kidId}`) ?? "[]") as number[];
              if (Array.isArray(saved)) {
                setShards(saved);
                world?.setShardsFound(saved);
              }
              const savedPearls = JSON.parse(window.localStorage.getItem(`cucaino.pearls.${kidId}`) ?? "[]") as number[];
              if (Array.isArray(savedPearls)) {
                setPearls(savedPearls);
                world?.setPearlsFound(savedPearls);
              }
              const savedSpots = JSON.parse(window.localStorage.getItem(`cucaino.skyspots.${kidId}`) ?? "[]") as string[];
              if (Array.isArray(savedSpots)) {
                setSpots(savedSpots);
                world?.setSkySpotsFound(savedSpots);
              }
              const savedSky = JSON.parse(window.localStorage.getItem(`cucaino.skychests.${kidId}`) ?? "[]") as string[];
              if (Array.isArray(savedSky)) {
                setSkyFound(savedSky);
                world?.setSkyTreasuresOpened(savedSky);
              }
              const sk = window.localStorage.getItem(`cucaino.mountskin.${kidId}`) as MountSkin | null;
              if (sk) setSkin(sk);
            } catch {}
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
    // chores first: a friendly nudge that walks you straight to the Quest Board
    if (left > 0) {
      window.setTimeout(() => setQuestNudge(true), 4200);
      window.setTimeout(() => setQuestNudge(false), 16000);
    }
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
      setStarsEarned((s) => s + pts);
      setDream((d) => (d ? { ...d, tickets: d.tickets + TICKETS_PER_QUEST } : d));
      setPetXp((x) => x + PET_TREAT_XP);
      worldRef.current?.celebrate(true);
      playSfx("coin");
      if (detail.name) toast(`${detail.icon ?? "🎉"} Quest complete! +${pts} ⭐ +${TICKETS_PER_QUEST} 🎟️${data.pet ? " · 🍪 treat for your pet!" : ""}`);
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
      setStarsEarned((s) => Math.max(0, s - pts));
      setDream((d) => (d ? { ...d, tickets: Math.max(0, d.tickets - TICKETS_PER_QUEST) } : d));
      setPetXp((x) => Math.max(0, x - PET_TREAT_XP));
    };
    const onTickets = (e: Event) => {
      const t = (e as CustomEvent<{ tickets?: number }>).detail?.tickets;
      if (typeof t === "number") setDream((d) => (d ? { ...d, tickets: t } : d));
    };
    window.addEventListener("tickets-changed", onTickets);
    window.addEventListener("task-completed", onDone);
    window.addEventListener("task-uncompleted", onUndone);
    return () => {
      window.removeEventListener("task-completed", onDone);
      window.removeEventListener("task-uncompleted", onUndone);
      window.removeEventListener("badge-unlocked", onBadge);
      window.removeEventListener("stars-spent", onSpent);
      window.removeEventListener("tickets-changed", onTickets);
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
        window.setTimeout(() => toast("🎁 A mystery chest appeared — tap the button to open it!"), 2600);
      }, 1200);
    }
  }, [ready, done, data.tasksToday.total, toast]);

  // ── the dreamy soundscape: starts on the first tap (browsers need one), follows the world ──
  const ambience = useRef<Ambience | null>(null);
  useEffect(() => {
    if (!ready) return;
    const amb = (ambience.current = new Ambience());
    const kick = () => amb.start();
    window.addEventListener("pointerdown", kick, { once: false });
    return () => {
      window.removeEventListener("pointerdown", kick);
      amb.stop();
      ambience.current = null;
    };
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const a = worldRef.current?.getAmbient();
      if (a) ambience.current?.setScene({ ...a, quiet: busyRef.current });
    }, 500);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const book = readWisdom(kidId);
    setWisdom(book);
    const day = wizDay.current;
    const spots =
      worldRef.current?.setWizards(
        WIZARDS.map((w) => ({ id: w.id, name: w.name, robe: w.robe, hat: w.hat, hasLesson: !book[todaysLesson(w.id, day).id] })),
        day * 7919 + 13,
      ) ?? [];
    setWizardSpots(spots);
    try {
      const k = `cucaino.wizards.hello.${kidId}.${day}`;
      if (!window.localStorage.getItem(k)) {
        window.localStorage.setItem(k, "1");
        window.setTimeout(() => toast("🧙 The wizards have flown up to the floating mountains! Fly up on the dragon or manta to find today's lessons ✨"), 9000);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, kidId]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const r = worldRef.current?.riding ?? null;
      setRiding((cur) => (cur?.kind === r?.kind && cur?.flying === r?.flying && cur?.landing === r?.landing ? cur : r));
      const ln = worldRef.current?.skyLandable ?? null;
      setLandName((cur) => (cur === ln ? cur : ln));
      const sw = worldRef.current?.swim ?? null;
      setSwim((cur) => (!!cur === !!sw && cur?.under === sw?.under ? cur : sw ? { under: sw.under } : null));
    }, 200);
    return () => window.clearInterval(id);
  }, [ready]);
  shardRef.current = (id: number) => {
    setShards((cur) => {
      if (cur.includes(id)) return cur;
      const next = [...cur, id];
      try {
        window.localStorage.setItem(shardKey, JSON.stringify(next));
      } catch {}
      playSfx("win");
      const unlocked = MOUNT_SKINS.find((s) => s.shards === next.length && s.shards > 0);
      toast(unlocked ? `✦ Star Shard ${next.length}/${SHARD_COUNT}! You unlocked the ${unlocked.name} mount colours!` : `✦ Star Shard ${next.length}/${SHARD_COUNT} found!`);
      return next;
    });
  };
  pearlRef.current = (id: number) => {
    setPearls((cur) => {
      if (cur.includes(id)) return cur;
      const next = [...cur, id];
      try {
        window.localStorage.setItem(pearlKey, JSON.stringify(next));
      } catch {}
      playSfx(next.length >= PEARL_COUNT ? "win" : "sparkle");
      toast(next.length >= PEARL_COUNT ? `🫧 All ${PEARL_COUNT} Sea Pearls! You're a true ocean explorer!` : `🫧 Sea Pearl ${next.length}/${PEARL_COUNT}!`);
      if (next.length >= PEARL_COUNT) worldRef.current?.fireworks(4);
      return next;
    });
  };
  ringRef.current = (passed: number, lap?: number) => {
    playSfx(lap !== undefined ? "win" : "sparkle");
    if (lap !== undefined) {
      setRingRun(null);
      const key = `cucaino.rings.best.${kidId}`;
      let best = Infinity;
      try {
        best = Number(window.localStorage.getItem(key) ?? Infinity);
        if (lap < best) window.localStorage.setItem(key, String(lap));
      } catch {}
      const secs = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
      toast(lap < best ? `🏆 Sky Rings in ${secs(lap)} — a new best!` : `🏁 Sky Rings in ${secs(lap)} (best ${secs(best)})`);
      worldRef.current?.fireworks(4);
    } else setRingRun((r) => ({ passed, t0: passed === 1 ? performance.now() : r?.t0 ?? performance.now() }));
  };
  const hopOn = (kind: MountKind) => {
    setPickMount(false);
    if (worldRef.current?.onSkyIslandName && !MOUNTS.find((x) => x.kind === kind)?.flies) {
      toast("🐴 Ponies can't fly! Pick the dragon or the manta to leave the floating mountain");
      return;
    }
    worldRef.current?.mountUp(kind, theme.accent, skin);
    playSfx("sparkle");
    const m = MOUNTS.find((x) => x.kind === kind)!;
    toast(m.flies ? `${m.emoji} Up we go! Hold ▲ to fly higher, ▼ to swoop down` : `${m.emoji} Giddy-up! Off we gallop`);
  };

  // streak + chest state from the server (re-read after quests change)
  useEffect(() => {
    if (!ready) return;
    getHabits(kidId)
      .then(setHabits)
      .catch(() => {});
  }, [ready, kidId, done]);

  // the pet grows with every quest: bigger in the park, and a party when it reaches a new stage
  const petStage = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !data.pet) return;
    const level = levelFromXp(petXp);
    const stage = stageFromLevel(level);
    const grew = petStage.current !== null && petStage.current !== stage;
    petStage.current = stage;
    worldRef.current?.setPetGrowth(Math.min(1.35, 0.7 + (level - 1) * 0.05), grew);
    if (grew) {
      playSfx("win");
      toast(`🎉 ${data.pet.name} grew up into a ${stage === "child" ? "big kid" : stage}! Keep doing quests to help them grow!`);
      worldRef.current?.petSay(`I'm a ${stage} now! 🎉`, 4);
    }
  }, [ready, petXp, data.pet, toast]);

  // on arrival the pet reminds you about quests (a little mopey if the streak slipped)
  const petAsked = useRef(false);
  useEffect(() => {
    if (!ready || !habits || !data.pet || petAsked.current) return;
    petAsked.current = true;
    const left = habits.quests.total - habits.quests.done;
    if (left <= 0) return;
    const missed = habits.streak.current === 0 && habits.streak.week.slice(0, 6).some((d) => d.state === "done");
    window.setTimeout(() => worldRef.current?.petSay(missed ? "I missed you! 🥺 Can we do a quest?" : "Quest time? I'd love a treat! 🍪", 5), 6500);
  }, [ready, habits, data.pet]);

  const chestReady = data.tasksToday.total > 0 && done >= data.tasksToday.total && !!habits && !habits.chestOpenedToday;
  const onChestPrize = (prize: ChestPrize, tickets: number) => {
    setDream((d) => (d ? { ...d, tickets } : d));
    setHabits((h) => (h ? { ...h, chestOpenedToday: true, tickets } : h));
    worldRef.current?.fireworks(4);
    if (prize.kind === "pet") setPetXp((x) => x + prize.amount);
    if (prize.kind === "sticker") {
      setAlbum((a) => {
        const next = [...a, prize.sticker];
        try {
          window.localStorage.setItem(albumKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  };

  // full-screen overlays cover the canvas: stop drawing 3D under them (battery)
  useEffect(() => {
    worldRef.current?.setPaused(!!quizBank || !!page);
  }, [quizBank, page]);

  const pickRide = (r: RideEntry) => {
    if (r.route === "coaster") setPanel({ kind: "quiz-hub", placeId: panel?.placeId });
    else if (r.route === "golf") setPanel({ kind: "golf", placeId: panel?.placeId });
    else if (r.route === "retro") setPanel({ kind: "retro", placeId: panel?.placeId });
    else if (r.route === "market") setPanel({ kind: "market", placeId: panel?.placeId });
    else if (typeof r.route === "function") setPage({ src: r.route(kidId), title: `${r.emoji} ${r.name}` });
    else if ((HALLS as readonly string[]).includes(r.route)) setPanel({ kind: r.route as Hall, placeId: panel?.placeId });
  };

  const startCoaster = async (bankId: string) => {
    if (!(await payPlay("coaster", "a ride on the Quiz Coaster"))) return;
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

  const rideFrom = useRef<string | undefined>(undefined);
  const leaveRide = () => {
    worldRef.current?.exitRide();
    setCoaster(null);
    setGolf(null);
    // walk back out of the door we came in by, and hand the controls back
    if (rideFrom.current) worldRef.current?.stepOutOf(rideFrom.current);
    rideFrom.current = undefined;
    worldRef.current?.setInputEnabled(true);
  };

  const onGolf = useCallback(
    (e: GolfEvent) => {
      if (e.type === "hole-start") {
        setGolf((g) => ({ hole: e.hole, of: e.of, name: e.name, par: e.par, tip: e.tip, strokes: 0, scores: g && !g.done ? g.scores : [] }));
        if (e.tip) toast(e.tip);
      } else if (e.type === "stroke") {
        setGolf((g) => (g ? { ...g, strokes: e.strokes } : g));
        playSfx("tap");
      } else if (e.type === "splash") {
        setGolf((g) => (g ? { ...g, strokes: e.strokes } : g));
        playSfx("wrong");
        toast("💦 Splash! +1 stroke — try again from where you hit it");
      } else if (e.type === "fx") {
        if (e.kind !== "bounce") playSfx("sparkle");
      } else if (e.type === "picked-up") {
        setGolf((g) => (g ? { ...g, scores: [...g.scores, e.strokes] } : g));
        toast("🙌 Picked up! On to the next hole");
      } else if (e.type === "sunk") {
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

  const startGolf = async (from: number, count: number) => {
    const { buildMiniGolfInterior } = await import("@/lib/game3d/interiors/minigolf");
    rideFrom.current = panel?.placeId;
    setPanel(null);
    setGolf(null);
    worldRef.current?.enterRide((accent) => buildMiniGolfInterior(accent, (e) => golfRef.current(e), golfCtl.current, { from, count }));
    toast("⛳ Drag back from anywhere to aim, let go to putt!");
  };

  const pickAnimal = (a: ParkAnimal) => {
    setAnimal(a);
    saveParkAnimalChoice(kidId, a.id);
    void worldRef.current?.setKidAnimal(a.id);
    playSfx("sparkle");
  };

  const busy = !!panel || !!quizBank || !!page || !!coaster || !!golf;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const questsLeft = Math.max(0, data.tasksToday.total - done);
  const hudLevel = levelFor(starsEarned);
  const levelFloor = LEVELS[hudLevel - 1] ?? 0;
  const levelCeil = LEVELS[hudLevel];
  const hudXp = levelCeil === undefined ? 1 : (starsEarned - levelFloor) / Math.max(1, levelCeil - levelFloor);
  const shownStreak = Math.max(streak, data.kid.currentStreak);
  const questBoard = getPlace("quest-board");
  const mapPins: MapPin[] = [
    ...(questBoard ? [{ id: "quest-board", x: questBoard.x, z: questBoard.z, emoji: "📋", label: "Quest Board", badge: questsLeft, pulse: questsLeft > 0 }] : []),
    { id: "coralcove", x: VILLAGE_ISLAND.x, z: VILLAGE_ISLAND.z, emoji: "🏝️", label: VILLAGE_ISLAND.name, far: true },
    ...wizardSpots.map((s) => {
      const w = WIZARDS.find((x) => x.id === s.id)!;
      const fresh = !wisdom[todaysLesson(w.id, wizDay.current).id];
      return { id: `wizard:${s.id}`, x: s.x, z: s.z, emoji: "🧙", label: w.name.split(" ")[0], pulse: fresh, sky: true };
    }),
  ];
  const wizardOpen = panel?.kind === "wizard" && panel.placeId ? WIZARDS.find((w) => `wizard:${w.id}` === panel.placeId) : undefined;

  // iPhone Safari can show the page behind the fixed 3D view (where its toolbar was): paint the
  // page the same colour as the scene so there's never a grey strip
  const pageBg = golf ? "#a6e8bd" : "#141233";
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.background, document.body.style.background];
    html.style.background = document.body.style.background = pageBg;
    return () => {
      html.style.background = prev[0];
      document.body.style.background = prev[1];
    };
  }, [pageBg]);

  return (
    <div style={{ position: "fixed", inset: 0, height: "100lvh", overflow: "hidden", background: pageBg, fontFamily: FONT.body }} className="font-fun">
      <style>{PARK_CSS + css}</style>
      {/* keeps KidShell chrome hidden; its ⤡ toggle isn't needed in the park (and iPhone can't go full screen) */}
      <GameFullscreen className="hidden" />
      <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {/* top HUD: one "Me" menu button (left) and one wallet pill (right) — nothing else up here */}
      <div style={{ ...hudTop, display: building || coaster || golf ? "none" : "flex" }}>
        <PlayerBadge emoji={animal?.emoji ?? "🐾"} level={hudLevel} xp={hudXp} open={menuOpen} onClick={() => setMenuOpen((m) => !m)} />
        <WalletBar
          items={[
            { icon: "⭐", value: points, color: C.gold, label: "stars" },
            { icon: "🎟️", value: dream?.tickets ?? 0, color: C.cyan, label: "tickets" },
            ...(shownStreak >= 2 ? [{ icon: "🔥", value: shownStreak, color: C.fire, label: "day streak" }] : []),
          ]}
        />
      </div>
      {menuOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)}>
          <div style={menuCard} className="gp-popin" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "4px 6px 8px" }}>
              <div style={display(20)}>{data.kid.name}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, marginTop: 2 }}>
                Level {hudLevel} · {levelCeil === undefined ? "max level!" : `${Math.max(0, levelCeil - starsEarned)} ⭐ to level ${hudLevel + 1}`}
              </div>
            </div>
            {[
              { e: animal?.emoji ?? "🐾", t: "Dress up my animal", on: () => openPanel("dressup") },
              { e: "🔨", t: "Build my Dream Park", on: () => enterBuild() },
              { e: "📖", t: `Book of Wisdom · ${Object.keys(wisdom).length}`, on: () => setShowBook(true) },
              { e: "🗺️", t: `Sticker album · ${foundToday.length}/${TREASURES_PER_DAY} today`, on: () => setShowAlbum(true) },
              {
                e: "🖼️",
                t: readLook() === "diorama" ? "Look: Storybook ✓ (tap for Classic)" : "Look: Classic (tap for Storybook)",
                on: () => {
                  try {
                    window.localStorage.setItem(LOOK_KEY, readLook() === "diorama" ? "smooth" : "diorama");
                  } catch {}
                  window.location.reload();
                },
              },
              { e: "🔭", t: `Sky discoveries · ${spots.length}/${SKY_SPOTS.length}`, on: () => toast(spots.length >= SKY_SPOTS.length ? "🏆 You've discovered everything on the floating mountains!" : "🔭 The floating mountains hide caves, a dragon egg, rune circles, telescopes, sky cannons, a treehouse and more. Land and explore!") },
              { e: "🏝️", t: `Sky treasures · ${skyFound.length}/${SKY_ISLANDS.length}`, on: () => toast(skyFound.length >= SKY_ISLANDS.length ? "🏆 You've opened every sky treasure!" : "🏝️ Each floating mountain hides a treasure chest. Fly up on the dragon or manta, land on top and explore!") },
              { e: "🫧", t: `Sea Pearls · ${pearls.length}/${PEARL_COUNT}`, on: () => toast(pearls.length >= PEARL_COUNT ? "🫧 You found every Sea Pearl!" : "🫧 Sea Pearls glow inside giant clams on the reef, by the shipwreck and the sunken ruins. Swim out past the beach and dive!") },
              { e: "✦", t: `Star Shards · ${shards.length}/${SHARD_COUNT}`, on: () => toast(shards.length >= SHARD_COUNT ? "✦ You found every Star Shard — a true explorer!" : "✦ Star Shards hide on peaks, sky islands, ruins, ancient trees, crystals and coves. Fly to reach the high ones!") },
              { e: "🔄", t: "Switch player", on: () => router.push("/select-kid") },
            ].map((it) => (
              <button
                key={it.t}
                type="button"
                style={menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  playSfx("tap");
                  it.on();
                }}
              >
                <IconChip color={C.cyan} size={36} style={{ fontSize: 20 }}>
                  {it.e}
                </IconChip>
                <span>{it.t}</span>
                <span aria-hidden style={{ marginLeft: "auto", color: C.mute, fontSize: 20 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={toastStack}>
        {toasts.slice(-1).map((t) => (
          <Toast key={t.id} text={t.text} ms={TOAST_MS} />
        ))}
      </div>

      {ready && (
        <MiniMap
          world={worldRef}
          hidden={busy || building}
          pins={mapPins}
          onSkyPin={(p) =>
            toast(
              p.far
                ? `🏝️ ${VILLAGE_ISLAND.name} is far out at sea, this way! Swim, ride the manta or fly the dragon to visit ${VILLAGE_ISLAND.clan}`
                : `🧙 ${p.label} is up on a floating mountain! Hop on the dragon or manta and fly there — then tap "Land"`,
            )
          }
        />
      )}
      {ready && !busy && !building && (
        <QuestBanner
          state={chestReady ? "chest" : questsLeft > 0 ? "todo" : data.tasksToday.total === 0 ? "none" : "done"}
          left={questsLeft}
          onClick={() => (chestReady ? setShowChest(true) : openPanel("quests", "quest-board"))}
          label={chestReady ? "Open your mystery chest" : "Open my quests"}
          sub={chestReady ? "A reward is waiting ✨" : data.tasksToday.total === 0 ? "No quests today" : questsLeft > 0 ? `${questsLeft} to do · ⭐ + 🎟️` : `${done}/${data.tasksToday.total} finished`}
        />
      )}
      {questNudge && !busy && !ask && !building && (
        // a slim one-line hint above the quest button (a big card here hid half the world on phones)
        <div style={nudgePill}>
          <button
            type="button"
            style={nudgeGo}
            onClick={() => {
              setQuestNudge(false);
              const p = worldRef.current?.getPose();
              const qb = getPlace("quest-board");
              if (p && qb) worldRef.current?.walkKidPath(routeToSpot(p, qb.x, qb.z + 4));
            }}
          >
            📜 Walk me to the Quest Board
          </button>
          <button type="button" aria-label="Not now" style={nudgeX} onClick={() => setQuestNudge(false)}>
            ✕
          </button>
        </div>
      )}
      {ready && !busy && !building && !onCoaster && <Joystick onChange={(x, y) => worldRef.current?.setMove(x, y)} />}
      {ready && !busy && !building && (
        <div style={rideBar}>
          {((riding && MOUNTS.find((m) => m.kind === riding.kind)?.flies && !riding.landing) || (swim && !riding)) && (
            <>
              {(["up", "down"] as const).map((dir) => (
                <RoundButton
                  key={dir}
                  size={50}
                  style={{ fontSize: 20, touchAction: "none" }}
                  onPointerDown={(e) => {
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    worldRef.current?.setFly(dir === "up" ? 1 : -1);
                  }}
                  onPointerUp={() => worldRef.current?.setFly(0)}
                  onPointerCancel={() => worldRef.current?.setFly(0)}
                  aria-label={swim && !riding ? (dir === "up" ? "Swim up" : "Dive") : dir === "up" ? "Fly higher" : "Fly lower"}
                >
                  {dir === "up" ? "▲" : "▼"}
                </RoundButton>
              ))}
            </>
          )}
          <RoundButton
            size={62}
            active={!!riding}
            style={{ fontSize: riding ? 14 : 30, lineHeight: 1.05, textAlign: "center" }}
            onClick={() => {
              if (riding) {
                worldRef.current?.dismount();
                playSfx("tap");
              } else setPickMount(true);
            }}
            aria-label={riding ? "Hop off" : "Ride an animal"}
          >
            {riding ? (riding.landing ? "…" : "Hop off") : "🦄"}
          </RoundButton>
        </div>
      )}
      {villageTalk && !busy && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 240px)", zIndex: 23, maxWidth: "min(92vw, 420px)", pointerEvents: "none" }}>
          <div style={{ background: "rgba(255,250,240,0.96)", color: "#2a2340", borderRadius: 18, padding: "10px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.3)", border: `2px solid ${alpha(C.gold, 0.8)}`, fontWeight: 800, fontSize: 15, lineHeight: 1.35 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#8a5a10", letterSpacing: 0.5, marginBottom: 2 }}>🧚 {villageTalk.name}</div>
            {villageTalk.line}
          </div>
        </div>
      )}
      {landName && !busy && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 230px)", zIndex: 23 }}>
          <GameButton
            onClick={() => {
              worldRef.current?.dismount();
              playSfx("tap");
            }}
          >
            🏝️ Land on {landName}
          </GameButton>
        </div>
      )}
      {ringRun && riding?.flying && (
        <div style={{ position: "fixed", top: "calc(max(14px, env(safe-area-inset-top)) + 64px)", left: "50%", transform: "translateX(-50%)", zIndex: 22, pointerEvents: "none", padding: "8px 14px", borderRadius: 14, background: "rgba(18,16,44,0.78)", border: `1px solid ${alpha(C.cyan, 0.5)}`, color: "#fff", fontWeight: 900, fontSize: 15 }}>
          ◎ Sky Rings {ringRun.passed}/{RING_COUNT}
        </div>
      )}
      {pickMount && (
        <GameDialog onDismiss={() => setPickMount(false)} edge="cyan">
          <div style={display(24)}>Choose your mount</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.dim, marginTop: -6 }}>Ride round the whole island ✨</div>
          <div style={{ display: "grid", gap: 8, width: "100%" }}>
            {MOUNTS.map((m) => (
              <button key={m.kind} type="button" onClick={() => hopOn(m.kind)} style={{ ...cardStyle(m.flies ? C.violet : C.gold), ...mountPick }} className="gp-press">
                <IconChip color={m.flies ? C.violet : C.gold} size={52} style={{ fontSize: 30 }}>
                  {m.emoji}
                </IconChip>
                <span style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, ...display(18) }}>
                    {m.name}
                    <span style={{ fontSize: 11, letterSpacing: 1, padding: "2px 7px", borderRadius: 6, color: m.flies ? "#e4ccff" : C.goldHi, background: alpha(m.flies ? C.violet : C.gold, 0.18), border: `1px solid ${alpha(m.flies ? C.violet : C.gold, 0.5)}` }}>
                      {m.flies ? "FLIES" : "GALLOPS"}
                    </span>
                  </span>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: C.dim, marginTop: 2 }}>{m.blurb}</span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ width: "100%" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.dim, letterSpacing: 1, marginBottom: 6 }}>COLOURS · ✦ {shards.length}/{SHARD_COUNT} STAR SHARDS</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MOUNT_SKINS.map((s) => {
                const open = shards.length >= s.shards;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!open}
                    onClick={() => {
                      setSkin(s.id);
                      try {
                        window.localStorage.setItem(`cucaino.mountskin.${kidId}`, s.id);
                      } catch {}
                    }}
                    style={{ flex: "1 1 70px", minHeight: 40, borderRadius: 10, border: `1px solid ${skin === s.id ? C.gold : alpha(C.cyan, 0.3)}`, background: skin === s.id ? alpha(C.gold, 0.2) : alpha("#000000", 0.25), color: open ? "#fff" : C.dim, fontWeight: 900, fontSize: 12, cursor: open ? "pointer" : "default" }}
                  >
                    {open ? s.name : `🔒 ${s.shards}✦`}
                  </button>
                );
              })}
            </div>
          </div>
          <GameButton variant="secondary" small onClick={() => setPickMount(false)}>
            Maybe later
          </GameButton>
        </GameDialog>
      )}
      {ask && !busy && (
        <PromptCard
          icon={ask.emoji}
          title={(ASK_TEXT[ask.action]?.q ?? ((l: string) => `Visit ${l}?`))(ask.label)}
          hint={ASK_HINT[ask.action] ?? ""}
          no="Not now"
          yes={ASK_TEXT[ask.action]?.go ?? "Let's go! →"}
          onNo={() => setAsk(null)}
          onYes={() => {
            const p = ask;
            setAsk(null);
            enterPlace(p);
          }}
        />
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
            <div style={{ ...display(22), textAlign: "center", padding: "0 24px" }}>The park couldn&apos;t open on this device.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <GameButton variant="primary" onClick={() => window.location.reload()}>🔄 Try again</GameButton>
              <GameButton variant="secondary" onClick={() => router.push(`/kid/${kidId}/home`)}>📋 Simple view</GameButton>
            </div>
          </>
        ) : (
          <>
            <div style={loaderRing}>
              <div style={loaderSpin} />
              <div style={{ fontSize: 60, lineHeight: 1, animation: "gp-float 1.8s ease-in-out infinite", filter: "drop-shadow(0 0 14px rgba(255,211,107,0.6))" }}>{animal?.emoji ?? "✨"}</div>
            </div>
            <div style={{ ...display(24), textShadow: "0 0 18px rgba(94,242,255,0.45), 0 2px 0 rgba(0,0,0,0.4)" }}>Opening Cucaino Park…</div>
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
          <IconChip color={C.gold} size={42} round>
            🎾
          </IconChip>
          <div>
            <div style={display(21)}>Catches: {fetchGame.score}</div>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: C.dim }}>Tap the field to throw! ⏱ {fetchGame.left}s</div>
          </div>
        </div>
      )}
      {panel?.kind === "rides" && <RidesMenu onPick={pickRide} onClose={closePanel} />}
      {panel?.kind === "retro" && <RetroArcade kidId={kidId} onClose={closePanel} pay={payPlay} />}
      {panel?.kind === "golf" && (
        <CandySheet title="⛳ Candy Golf" subtitle="18 holes of windmills, portals, hills, ice and water!" color={C.success} onClose={closePanel}>
          <div style={{ display: "grid", gap: 10 }}>
            {GOLF_ROUNDS.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => void payPlay("golf", "a round of Candy Golf").then((ok) => {
                    if (ok) void startGolf(c.from, c.count);
                  })}
                style={{ ...cardStyle(c.count === 18 ? "gold" : C.success), ...golfPick }}
                className="gp-press"
              >
                <IconChip color={c.count === 18 ? C.gold : C.success} size={54} style={{ fontSize: 30 }}>
                  {c.emoji}
                </IconChip>
                <span style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", ...display(19) }}>{c.name}</span>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: C.dim, marginTop: 2 }}>{c.sub}</span>
                </span>
                <span aria-hidden style={display(24, C.gold)}>›</span>
              </button>
            ))}
          </div>
        </CandySheet>
      )}
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
        <GameButton variant="secondary" small style={{ position: "fixed", top: "max(14px, env(safe-area-inset-top))", left: 14, zIndex: 32 }} onClick={leaveRide}>
          🚪 Back to the park
        </GameButton>
      )}
      {coaster && coaster.gate !== null && (
        <div style={rideCard}>
          <div style={{ ...display(13, C.cyan), letterSpacing: 1, textTransform: "uppercase" }}>
            Gate {coaster.gate + 1} of {coaster.quiz.questions.length} · {coaster.quiz.bankName}
          </div>
          <div style={{ fontWeight: 900, fontSize: 19, color: C.text, margin: "6px 0 12px", lineHeight: 1.3 }}>{coaster.quiz.questions[coaster.gate].prompt}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {coaster.quiz.questions[coaster.gate].choices.map((ch, i) => {
              const picked = coaster.answered === i;
              const show = coaster.answered !== null;
              const tone = show ? (ch.isCorrect ? C.success : picked ? C.danger : "#6b6f8e") : [C.cyan, C.gold, C.violet, "#ff7ab8"][i % 4];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => answerCoaster(i)}
                  disabled={show}
                  className="gp-press"
                  style={{ ...cardStyle(tone, alpha(tone, show && (ch.isCorrect || picked) ? 0.45 : 0.16)), minHeight: 52, padding: "10px 10px", fontWeight: 900, fontSize: 15, color: C.text, cursor: "pointer", opacity: show && !ch.isCorrect && !picked ? 0.55 : 1 }}
                >
                  {show && ch.isCorrect ? "✓ " : show && picked ? "✕ " : ""}
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
          <div style={{ ...display(24), textAlign: "center" }}>
            {coaster.correct}/{coaster.quiz.questions.length} gates right!
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
            <GameButton onClick={leaveRide}>🎡 Back to the park</GameButton>
          </div>
        </div>
      )}
      {golf && (
        <div style={{ ...rideCard, top: "auto", bottom: "max(18px, env(safe-area-inset-bottom))", textAlign: "center" }}>
          {golf.done ? (
            <>
              <div style={display(20)}>🏆 {golf.done.total} strokes · par {golf.done.par}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                <GameButton small onClick={() => { golfCtl.current.restart?.(); setGolf((g) => (g ? { ...g, done: undefined, scores: [] } : g)); }}>🔄 Play again</GameButton>
                <GameButton small variant="secondary" onClick={leaveRide}>🎡 Park</GameButton>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                <div>
                  <div style={display(17)}>
                    ⛳ Hole {golf.hole}/{golf.of} · {golf.name}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.dim, marginTop: 2 }}>
                    Par {golf.par} · Strokes <b>{golf.strokes}</b>
                    {golf.scores.length > 0 && ` · Total ${golf.scores.reduce((a, c) => a + c, 0)}`}
                  </div>
                </div>
                <GameButton small variant="secondary" onClick={() => golfCtl.current.skip?.()} aria-label="Skip this hole">
                  ⏭ Skip
                </GameButton>
              </div>
            </>
          )}
        </div>
      )}
      {wizardOpen && (
        <WizardSheet
          wizard={wizardOpen}
          lesson={todaysLesson(wizardOpen.id as WizardId, wizDay.current)}
          learned={!!wisdom[todaysLesson(wizardOpen.id as WizardId, wizDay.current).id]}
          onLearned={() => {
            const l = todaysLesson(wizardOpen.id as WizardId, wizDay.current);
            setWisdom(addWisdom(kidId, l.id, dayKey()));
            worldRef.current?.setWizardSparkle(wizardOpen.id, false);
            worldRef.current?.celebrate(true);
          }}
          onClose={closePanel}
        />
      )}
      {showBook && <BookOfWisdom kidId={kidId} onClose={() => setShowBook(false)} />}
      {showChest && <MysteryChest kidId={kidId} onClose={() => setShowChest(false)} onPrize={onChestPrize} />}
      {payAsk && (
        <GameDialog edge="gold">
          <div style={payTicket}>🎟️</div>
          {(dream?.tickets ?? 0) > 0 ? (
            <>
              <div style={display(22)}>Use 1 ticket for {payAsk.what}?</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.dim }}>
                You have <b style={{ color: C.cyan }}>🎟️ {dream?.tickets ?? 0}</b>. Today&apos;s free play is used, so this one costs a ticket.
              </div>
            </>
          ) : (
            <>
              <div style={display(22)}>You need a ticket to play again</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.dim }}>Finish a quest to earn 🎟️ tickets. Every quest = 1 ticket!</div>
            </>
          )}
          {payAsk.error && <div style={{ fontWeight: 900, color: C.danger }}>{payAsk.error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 4 }}>
            <GameButton variant="secondary" onClick={() => closePay(false)}>
              Not now
            </GameButton>
            {(dream?.tickets ?? 0) > 0 ? (
              <GameButton disabled={payAsk.busy} onClick={() => void confirmPay()}>
                {payAsk.busy ? "…" : "Play! 🎟️ 1"}
              </GameButton>
            ) : (
              <GameButton
                onClick={() => {
                  closePay(false);
                  if (worldRef.current?.inRide) leaveRide();
                  setPanel({ kind: "quests", placeId: "quest-board" });
                }}
              >
                📜 My Quests
              </GameButton>
            )}
          </div>
        </GameDialog>
      )}
      {showAlbum && (
        <CandySheet title="📒 My Sticker Album" subtitle={`${foundToday.length}/${TREASURES_PER_DAY} treasures found today · new ones hide every day!`} color={C.violet} onClose={() => setShowAlbum(false)}>
          {album.length === 0 ? (
            <p style={{ textAlign: "center", fontWeight: 800, color: C.dim }}>No stickers yet — treasures are hiding in the Sweet Forest 🍄 and all over the park!</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 8 }}>
              {album.map((s, i) => (
                <div key={i} style={{ ...cardStyle(C.violet), fontSize: 40, textAlign: "center", padding: 8 }}>
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

const css =
  "@keyframes park-bounce { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-18px) rotate(4deg); } }" +
  "@keyframes park-pop { 0% { transform: translateY(-10px) scale(0.85); opacity: 0; } 10% { transform: none; opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }" +
  // the quest button gives a little wiggle every few seconds until today's quests are done
  "@keyframes quest-wiggle { 0%,86%,100% { transform: none; } 89% { transform: rotate(-5deg) scale(1.06); } 92% { transform: rotate(5deg) scale(1.06); } 95% { transform: rotate(-3deg); } }" +
  ".quest-wiggle { animation: quest-wiggle 3.2s ease-in-out infinite; }";

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

const menuCard: React.CSSProperties = {
  ...glass({ edge: "cyan", fill: "rgba(18,16,44,0.9)", blur: 12 }),
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 84px)",
  left: "max(14px, env(safe-area-inset-left))",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: 10,
  borderRadius: 18,
  minWidth: 260,
  maxWidth: "calc(100vw - 28px)",
};
const menuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 48,
  padding: "6px 10px 6px 6px",
  border: "1px solid rgba(160,190,255,0.12)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  fontWeight: 800,
  fontSize: 15,
  color: C.text,
  textAlign: "left",
  cursor: "pointer",
};

const nudgePill: React.CSSProperties = {
  position: "fixed",
  left: "max(16px, env(safe-area-inset-left))",
  // above the joystick's reach (it sits bottom-right and is ~150px tall)
  bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 160px)",
  zIndex: 22,
  display: "flex",
  alignItems: "stretch",
  borderRadius: 999,
  overflow: "hidden",
  border: `1px solid ${alpha(C.gold, 0.6)}`,
  background: "rgba(18,16,44,0.82)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
};
const nudgeGo: React.CSSProperties = { background: "none", border: 0, color: "#fff", fontWeight: 900, fontSize: 14, padding: "10px 12px 10px 14px", cursor: "pointer", fontFamily: "inherit" };
const nudgeX: React.CSSProperties = { background: "rgba(255,255,255,0.08)", border: 0, color: C.dim, fontWeight: 900, fontSize: 13, padding: "0 12px", cursor: "pointer", minWidth: 40 };

const toastStack: React.CSSProperties = {
  // up top, beside the mini map and under the wallet: mid-screen they sat right on the kid
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 58px)",
  left: "min(128px, 30vw)",
  right: 16,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  zIndex: 30,
  pointerEvents: "none",
};

/** what the walk-up prompt says for each kind of place (a fountain isn't something you "go into") */
const ASK_TEXT: Partial<Record<PlaceAction, { q: (label: string) => string; go: string }>> = {
  quests: { q: () => "Check the Quest Board?", go: "Let's see! 📋" },
  skycoaster: { q: () => "Ride the Sky Coaster round the whole island?", go: "All aboard! 🎢" },
  shop: { q: (l) => `Visit the ${l}?`, go: "Let's shop! 🛍️" },
  pet: { q: () => "Visit your pet's home?", go: "Let's go! 🏠" },
  "pet-feed": { q: () => "Give your pet a snack?", go: "Yum! 🍪" },
  "pet-wash": { q: () => "Bubble bath time?", go: "Splash! 🫧" },
  "pet-sleep": { q: () => "Nap time for your pet?", go: "Snuggle 💤" },
  "pet-fetch": { q: () => "Play fetch together?", go: "Let's play! 🎾" },
  "pet-tricks": { q: () => "Practise some tricks?", go: "Show time! ✨" },
  friends: { q: () => "Pop into the Friends Café?", go: "Let's chat! 💌" },
  rides: { q: () => "Take a ride?", go: "All aboard! 🎢" },
  market: { q: () => "Trade at the Nugget Market?", go: "Let's trade! 📈" },
  learn: { q: () => "Learn something at the Learning Tree?", go: "Let's learn! 🎓" },
  library: { q: () => "Read a book at the Library?", go: "Let's read! 📚" },
  theatre: { q: () => "Story time at the Story Theatre?", go: "Story time! 🎭" },
  arcade: { q: () => "Play in the AI Arcade?", go: "Let's play! 🕹️" },
  retro: { q: () => "Play at the Retro Arcade?", go: "Game on! 👾" },
  "money-town": { q: () => "Play Money Town?", go: "Let's play! 💰" },
  bank: { q: () => "Visit the Bank?", go: "Let's go! 🏦" },
  golf: { q: () => "Play Candy Golf?", go: "Tee off! ⛳" },
  wizard: { q: (l) => `Talk to ${l}?`, go: "Hello! 👋" },
  build: { q: () => "Build your Dream Park?", go: "Let's build! 🔨" },
  parent: { q: () => "Go to the grown-ups' area?", go: "OK →" },
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
  library: "Chapter books to read bit by bit — earn stars",
  theatre: "Fables, myths and short tales — earn stars",
  arcade: "AI brain games with sparks",
  "money-town": "The family money board game",
  wizard: "A wizard with a lesson for you today ✨",
  golf: "18 holes of candy mini golf",
  retro: "20 classic-style pixel games",
  bank: "Real-money investing (grown-ups switch it on)",
  parent: "A grown-up PIN is needed",
};

const GOLF_ROUNDS = [
  { from: 0, count: 9, emoji: "🌱", name: "Front 9", sub: "Holes 1–9 · a great place to start" },
  { from: 9, count: 9, emoji: "🔥", name: "Back 9", sub: "Holes 10–18 · portals, a volcano & the Grand Finale" },
  { from: 0, count: 18, emoji: "🏆", name: "All 18 holes", sub: "The full championship course" },
];

const golfPick: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "12px 16px 12px 12px",
  borderRadius: 18,
  cursor: "pointer",
};

const mountPick: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px 10px 10px",
  borderRadius: 16,
  cursor: "pointer",
};

const payTicket: React.CSSProperties = {
  fontSize: 46,
  lineHeight: 1,
  filter: "drop-shadow(0 0 16px rgba(94,242,255,0.7))",
  animation: "gp-float 2s ease-in-out infinite",
};

const rideBar: React.CSSProperties = {
  position: "fixed",
  right: "max(22px, env(safe-area-inset-right))",
  bottom: "calc(max(20px, env(safe-area-inset-bottom)) + 150px)",
  zIndex: 21,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const rideCard: React.CSSProperties = {
  ...glass({ edge: "cyan", fill: "rgba(18,16,44,0.86)" }),
  position: "fixed",
  top: "calc(max(14px, env(safe-area-inset-top)) + 62px)",
  left: 0,
  right: 0,
  margin: "0 auto",
  width: "min(560px, calc(100vw - 24px))",
  zIndex: 31,
  borderRadius: 20,
  padding: "14px 16px",
};

const fetchHud: React.CSSProperties = {
  ...glass({ edge: "gold", fill: "rgba(18,16,44,0.84)" }),
  position: "fixed",
  top: "max(14px, env(safe-area-inset-top))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: 18,
  padding: "8px 18px 8px 8px",
  pointerEvents: "none",
};

const loaderRing: React.CSSProperties = { position: "relative", width: 132, height: 132, display: "flex", alignItems: "center", justifyContent: "center" };
const loaderSpin: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  background: "conic-gradient(from 0deg, transparent, #5ef2ff, transparent 35%, #ffd36b 55%, transparent 70%, #b06bff, transparent)",
  WebkitMask: "radial-gradient(circle, transparent 58%, #000 60%, #000 66%, transparent 68%)",
  mask: "radial-gradient(circle, transparent 58%, #000 60%, #000 66%, transparent 68%)",
  animation: "gp-spin 2.4s linear infinite",
  filter: "drop-shadow(0 0 10px rgba(94,242,255,0.6))",
};

const loader: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
  background: "radial-gradient(120% 80% at 50% 30%, #3a2f8f 0%, #1a1650 40%, #090818 80%)",
  color: C.text,
  transition: "opacity 450ms ease",
  zIndex: 60,
};
