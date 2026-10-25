// The lands, buildings and stations of Cucaino Park. Pure data: the world builder places them,
// paths wind from the plaza to each land's entrance, and the HUD decides what each `action`
// opens. To add a place: add an entry (and a land if it starts a new area).
import { SKY_PADS } from "./skyIslands";
import type { KitName } from "../assets/loader";

export type PlaceAction =
  | "quests"
  | "shop"
  | "pet"
  | "pet-feed"
  | "pet-wash"
  | "pet-sleep"
  | "pet-fetch"
  | "pet-tricks"
  | "friends"
  | "rides"
  | "gift"
  | "build"
  | "parent"
  | "home"
  | "market"
  | "learn"
  | "library"
  | "arcade"
  | "money-town"
  | "bank"
  | "golf"
  | "theatre"
  | "retro"
  | "wizard"
  | "skycoaster"
  | "carousel"
  | "karts"
  | "none";

/** The Sky Coaster's track: control points round the island (buildPark adds the hills and drops). */
export const SKY_LOOP_N = 32;
export function skyLoopXZ(i: number): [number, number] {
  const a = (i / SKY_LOOP_N) * Math.PI * 2;
  const rad = skyLoopRadius(a);
  return [Math.sin(a) * rad, Math.cos(a) * rad];
}
/**
 * How far out the Sky Coaster's track runs at heading `a` (atan2(x, z)): round the island at
 * ~100 m, but swinging out over the west-south-west sea to pass the Rainbow Falls mesa's sea cliffs
 * instead of cutting through the rainforest (lib/park/registry/jungle.ts).
 */
export function skyLoopRadius(a: number): number {
  const w = Math.atan2(Math.sin(a), Math.cos(a));
  const s = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const detour = s(-1.95, -1.6, w) * (1 - s(-0.55, -0.25, w));
  return 100 + Math.sin(a * 3) * 8 + detour * 68;
}
/** the control point where the station sits (south-west, beside Rides land) */
export const SKY_STATION_I = 20;
const [SKY_SX, SKY_SZ] = skyLoopXZ(SKY_STATION_I);

export interface PlaceModel {
  kit: KitName;
  id: string;
  scale: number;
  /** local offset from the place position (x, z) and extra yaw */
  offset?: [number, number];
  rotY?: number;
}

export type LandId = "plaza" | "pets" | "market" | "rides" | "friends" | "dream" | "forest" | "gate" | "books" | "golf" | "arcade" | "karts";

export interface PlaceDef {
  id: string;
  label: string;
  emoji: string;
  land: LandId;
  x: number;
  z: number;
  /** building footprint radius — the kid is gently pushed out of it */
  radius: number;
  /** walking within this distance opens the place (0 = decorative) */
  doorRadius: number;
  action: PlaceAction;
  models: PlaceModel[];
  signY: number;
  /** yaw override (default: face the plaza) */
  face?: number;
  /** stands on this floating mountain (lib/park/registry/skyIslands.ts SKY_PADS) instead of the ground */
  sky?: string;
}

export interface LandDef {
  id: LandId;
  name: string;
  emoji: string;
  x: number;
  z: number;
  radius: number;
  /** ground tint disc for the land */
  ground: string;
}

export const LANDS: LandDef[] = [
  { id: "pets", name: "Home & Pet Meadow", emoji: "🏡", x: -78, z: 18, radius: 18, ground: "#dcd690" },
  { id: "market", name: "Market Street", emoji: "🏪", x: 52, z: -72, radius: 16, ground: "#d9c8a6" },
  { id: "rides", name: "Ride Land", emoji: "🎢", x: -50, z: -68, radius: 15, ground: "#c9c2ae" },
  { id: "friends", name: "Friends Café", emoji: "💌", x: -55, z: 80, radius: 13, ground: "#b9d9c6" },
  { id: "dream", name: "My Dream Park", emoji: "🔨", x: 82, z: 8, radius: 18, ground: "#a6d69c" },
  { id: "forest", name: "Glow Forest", emoji: "🌌", x: 68, z: 80, radius: 28, ground: "#5d9c7c" },
  // outer lands: each gets its own winding path from the plaza
  { id: "books", name: "Book Nook", emoji: "📚", x: 112, z: -42, radius: 14, ground: "#dccb9e" },
  { id: "golf", name: "Golf Green", emoji: "⛳", x: -115, z: -30, radius: 16, ground: "#9ed688" },
  { id: "arcade", name: "Arcade Alley", emoji: "🕹️", x: 0, z: -118, radius: 15, ground: "#bdb4c9" },
  { id: "gate", name: "Park Gate", emoji: "🍭", x: 0, z: 62, radius: 6, ground: "#d9c8a6" },
  // just outside the park proper (PARK_RADIUS = 160), near Park Station — the land's centre and
  // radius mirror registry/kartTrack.ts's KART_SITE / KART_SITE_RADIUS (copied, not imported: that
  // file pulls in registry/island.ts, which reads LANDS/PLACES at its own module scope, so
  // importing it back here would be a live circular read, not just a circular import — see that
  // file's header). kartTrack.test.ts is the single source of truth for the real numbers; if it
  // ever moves the site, update this literal to match (places.test.ts checks the two stay in sync).
  { id: "karts", name: "Cucaino Karts", emoji: "🏎️", x: 279.2, z: -95.4, radius: 120, ground: "#c7c4bc" },
];

/**
 * A spot on a land's own little square: `deg` degrees round from the way in (0 = the entrance,
 * 180 = straight across from it), `r` out from the land's middle, FACING the middle — so every
 * building of a land stands round the same paved square, front to it, with a lane to its door
 * (registry/island.ts lays the lanes), and none hides behind another.
 */
/** round Pet Meadow's square: the pet house, the snack bar, the bath, the bed and the stage (degrees
 *  round from the way in), and how far out the kid's cottage stands at its head */
const PET_RING = [230, 60, 305, 265, 105];
const HOME_R = 16;

function ring(landId: string, deg: number, r: number): { x: number; z: number; face: number } {
  const l = LANDS.find((q) => q.id === landId)!;
  // (the way in is the side nearest the plaza: the loop trail runs between them)
  const a = Math.atan2(-l.x, -l.z) + (deg * Math.PI) / 180;
  const x = Math.round((l.x + Math.sin(a) * r) * 10) / 10;
  const z = Math.round((l.z + Math.cos(a) * r) * 10) / 10;
  return { x, z, face: Math.atan2(l.x - x, l.z - z) };
}

export const PLACES: PlaceDef[] = [
  // ── Candy Plaza ──
  {
    id: "quest-board",
    label: "Quest Board",
    emoji: "📋",
    land: "plaza",
    // off the fountain's axis, so the crystal never hides it from the plaza's south side
    x: -6.8,
    z: -14.6,
    radius: 2.6,
    doorRadius: 5,
    action: "quests",
    signY: 6.2,
    models: [], // hand-built in lib/park/world/landmarks.ts
  },
  {
    id: "daily-gift",
    label: "Daily Gift",
    emoji: "🎁",
    land: "plaza",
    x: 5.5,
    z: 4.5,
    radius: 1.1,
    doorRadius: 2.4,
    action: "gift",
    signY: 3.4,
    models: [], // hand-built in lib/park/world/landmarks.ts
  },

  // ── Pet Meadow ──
  {
    id: "pet-house",
    label: "Pet House",
    emoji: "🏡",
    land: "pets",
    ...ring("pets", PET_RING[0], 12.5),
    radius: 3,
    doorRadius: 6,
    action: "pet",
    signY: 5.8,
    models: [
      { kit: "city", id: "building-c", scale: 3.8, rotY: Math.PI / 2 },
      { kit: "town", id: "hedge-curved", scale: 3, offset: [3.6, 3] },
    ],
  },
  {
    id: "pet-food",
    label: "Snack Bar",
    emoji: "🍎",
    land: "pets",
    ...ring("pets", PET_RING[1], 12.5),
    radius: 1.4,
    doorRadius: 3,
    action: "pet-feed",
    signY: 3.8,
    models: [
      { kit: "town", id: "stall-green", scale: 2.2 },
      { kit: "food", id: "watermelon", scale: 2, offset: [1.6, 0.8] },
    ],
  },
  {
    id: "pet-bath",
    label: "Bubble Bath",
    emoji: "🛁",
    land: "pets",
    ...ring("pets", PET_RING[2], 12.5),
    radius: 1.6,
    doorRadius: 3,
    action: "pet-wash",
    signY: 3.4,
    models: [{ kit: "town", id: "fountain-round-detail", scale: 1.3 }],
  },
  {
    id: "pet-bed",
    label: "Cosy Bed",
    emoji: "🛏️",
    land: "pets",
    ...ring("pets", PET_RING[3], 12.5),
    radius: 1.4,
    doorRadius: 3,
    action: "pet-sleep",
    signY: 3.2,
    models: [
      { kit: "food", id: "donut-sprinkles", scale: 12 },
      { kit: "holiday", id: "present-b-cube", scale: 1.2, offset: [1.6, -0.8] },
    ],
  },
  {
    id: "pet-ball",
    label: "Fetch Field",
    emoji: "🎾",
    land: "pets",
    x: -77,
    z: 18,
    radius: 0,
    doorRadius: 2.6,
    action: "pet-fetch",
    signY: 2.8,
    models: [{ kit: "coaster", id: "flowers", scale: 2 }],
  },
  {
    id: "pet-stage",
    label: "Trick Stage",
    emoji: "🌟",
    land: "pets",
    ...ring("pets", PET_RING[4], 12.5),
    radius: 1.8,
    doorRadius: 3.4,
    action: "pet-tricks",
    signY: 4.4,
    models: [
      { kit: "town", id: "stall-red", scale: 2.4 },
      { kit: "holiday", id: "lights-colored", scale: 3, offset: [0, 1.4] },
    ],
  },

  // ── Market Street ──
  {
    id: "prize-shop",
    label: "Prize Shop",
    emoji: "🏪",
    land: "market",
    ...ring("market", 180, 11),
    radius: 3.6,
    doorRadius: 6,
    action: "shop",
    signY: 7,
    models: [
      { kit: "city", id: "building-k", scale: 3.6, rotY: -Math.PI / 2 },
      { kit: "city", id: "detail-parasol-a", scale: 3.2, offset: [-4.2, 2.6] },
      { kit: "food", id: "cupcake", scale: 5, offset: [-4.4, -2.4] },
    ],
  },

  {
    id: "nugget-market",
    label: "Nugget Market",
    emoji: "📈",
    land: "market",
    ...ring("market", 100, 11),
    radius: 2,
    doorRadius: 4,
    action: "market",
    signY: 5,
    models: [
      { kit: "town", id: "stall-green", scale: 3 },
      { kit: "town", id: "banner-green", scale: 2.6, offset: [-2, 0.4] },
      { kit: "holiday", id: "present-a-round", scale: 1.6, offset: [2, 1] },
    ],
  },

  {
    id: "bank",
    label: "The Bank",
    emoji: "🏦",
    land: "market",
    ...ring("market", 260, 11),
    radius: 2.6,
    doorRadius: 4.6,
    action: "bank",
    signY: 6.2,
    models: [{ kit: "city", id: "building-e", scale: 3.4 }],
  },

  // ── Ride Land ──
  {
    id: "ride-station",
    label: "Rides & Games",
    emoji: "🎢",
    land: "rides",
    ...ring("rides", 300, 12),
    radius: 3,
    doorRadius: 5.5,
    action: "rides",
    signY: 5.4,
    models: [
      { kit: "coaster", id: "station", scale: 3.2, rotY: Math.PI / 4 },
      { kit: "coaster", id: "coaster-train-front", scale: 3, offset: [0.4, 0.2], rotY: Math.PI / 4 },
      { kit: "coaster", id: "ride-entrance", scale: 3, offset: [3.2, 2.4], rotY: Math.PI / 4 },
    ],
  },

  // the Grand Carousel: built by world/carousel.ts (plan: registry/carousel.ts — keep x, z in step),
  // so it has no kit models of its own; `radius` keeps the kid off the turning deck
  {
    id: "carousel",
    label: "Grand Carousel",
    emoji: "🎠",
    land: "rides",
    x: -64,
    z: -40,
    radius: 8.4,
    doorRadius: 11.5,
    action: "carousel",
    signY: 10.2,
    models: [],
  },
  {
    id: "sky-coaster",
    label: "Sky Coaster",
    emoji: "🎢",
    land: "rides",
    // just inside the track, so you step up under the train
    x: SKY_SX * 0.93,
    z: SKY_SZ * 0.93,
    radius: 1.6,
    doorRadius: 4.6,
    action: "skycoaster",
    signY: 5.2,
    models: [{ kit: "coaster", id: "ride-entrance", scale: 3, rotY: Math.PI / 4 }],
  },

  {
    id: "arcade",
    label: "AI Arcade",
    emoji: "🕹️",
    land: "arcade",
    ...ring("arcade", 120, 8.5),
    radius: 5,
    doorRadius: 6.6,
    action: "arcade",
    signY: 6,
    models: [{ kit: "city", id: "building-a", scale: 3.6 }],
  },
  {
    id: "retro-arcade",
    label: "Retro Arcade",
    emoji: "👾",
    land: "arcade",
    ...ring("arcade", 240, 8.5),
    radius: 5,
    doorRadius: 6.6,
    action: "retro",
    signY: 7,
    models: [
      { kit: "city", id: "building-e", scale: 3.6, rotY: Math.PI / 2 },
      { kit: "holiday", id: "lights-colored", scale: 3.6, offset: [0, 2.6] },
      { kit: "holiday", id: "lantern-hanging", scale: 2.2, offset: [-2.6, 2.4] },
    ],
  },
  {
    id: "mini-golf",
    label: "Candy Golf",
    emoji: "⛳",
    land: "golf",
    x: -117,
    z: -32,
    radius: 2.4,
    doorRadius: 4.6,
    action: "golf",
    signY: 6.4,
    models: [
      { kit: "town", id: "windmill", scale: 2.6 },
      { kit: "holiday", id: "candy-cane-red", scale: 2.2, offset: [-2.6, 1.6] },
      { kit: "holiday", id: "candy-cane-green", scale: 2.2, offset: [2.6, 1.6] },
      { kit: "coaster", id: "flowers", scale: 2, offset: [0, 3] },
    ],
  },
  {
    id: "money-town",
    label: "Money Town",
    emoji: "💰",
    land: "rides",
    ...ring("rides", 60, 12),
    radius: 2.2,
    doorRadius: 4.2,
    action: "money-town",
    signY: 5,
    models: [
      { kit: "town", id: "stall-green", scale: 2.8 },
      { kit: "holiday", id: "present-b-rectangle", scale: 1.8, offset: [2, 1] },
    ],
  },

  // ── Sweet Forest: the Story Theatre stage ──
  {
    id: "story-theatre",
    label: "Story Theatre",
    emoji: "🎭",
    land: "forest",
    x: 62,
    z: 74,
    radius: 5.2,
    doorRadius: 6.8,
    action: "theatre",
    signY: 6,
    models: [
      { kit: "town", id: "stall-red", scale: 3.2 },
      { kit: "holiday", id: "lights-colored", scale: 3.4, offset: [0, 1.6] },
    ],
  },

  // ── Book Nook: reading & learning ──
  {
    id: "library",
    label: "Library",
    emoji: "📚",
    land: "books",
    ...ring("books", 125, 8),
    radius: 5.4,
    doorRadius: 7,
    action: "library",
    signY: 6,
    models: [
      { kit: "city", id: "building-g", scale: 3.6, rotY: -Math.PI / 2 },
      { kit: "holiday", id: "lights-colored", scale: 3.4, offset: [0, 2.8] },
    ],
  },
  {
    id: "learning-tree",
    label: "Learning Tree",
    emoji: "🎓",
    land: "books",
    ...ring("books", 245, 8),
    radius: 4,
    doorRadius: 5.6,
    action: "learn",
    signY: 7.6,
    models: [{ kit: "town", id: "tree-high-round", scale: 3.2 }],
  },

  // ── Friends Café ──
  {
    id: "friends-tower",
    label: "Friends Café",
    emoji: "💌",
    land: "friends",
    x: -57,
    z: 83,
    radius: 2.4,
    doorRadius: 5,
    action: "friends",
    signY: 8,
    models: [
      { kit: "city", id: "building-g", scale: 3.6 },
      { kit: "city", id: "detail-parasol-a", scale: 3, offset: [4, 3] },
      { kit: "city", id: "detail-parasol-a", scale: 3, offset: [-4, 3.4] },
    ],
  },

  // ── Dream Park entrance ──
  {
    id: "dream-park",
    label: "My Dream Park",
    emoji: "🔨",
    land: "dream",
    x: 65.6,
    z: 8.4,
    radius: 0,
    doorRadius: 2.6,
    action: "build",
    signY: 5.6,
    face: -Math.PI / 2,
    models: [
      { kit: "town", id: "banner-green", scale: 3.2, offset: [-2.6, 0] },
      { kit: "town", id: "banner-red", scale: 3.2, offset: [2.6, 0] },
      { kit: "food", id: "lollypop", scale: 8, offset: [-3.4, 0.6] },
      { kit: "food", id: "lollypop", scale: 8, offset: [3.4, 0.6] },
    ],
  },

  // ── My Home (the kid's cottage: decorate the rooms, look after the pet) ──
  // (it stands at the head of Pet Meadow's square, straight across from the way in: the pet's
  //  things — its house, bed, bath, snack bar and stage — are the home's own garden, round the same square)
  { id: "my-home", label: "My Home", emoji: "🏡", land: "pets", ...ring("pets", 180, HOME_R), radius: 3.4, doorRadius: 5, action: "home", signY: 9.2, models: [] }, // hand-built: lib/park/home/exterior.ts

  // ── Grown-ups' Control Room (parent area, PIN protected) ──
  {
    id: "control-room",
    label: "Parents' Office",
    emoji: "🗝️",
    land: "gate",
    x: 9,
    z: 54,
    radius: 2.8,
    doorRadius: 4.4,
    action: "parent",
    signY: 7.2,
    models: [{ kit: "coaster", id: "stall-information", scale: 2.6 }],
  },

  // ── Gate ──
  {
    id: "gate",
    label: "Cucaino Park",
    emoji: "🍭",
    land: "gate",
    x: 0,
    z: 62,
    radius: 0,
    doorRadius: 0,
    action: "none",
    signY: 9.2,
    face: 0,
    models: [{ kit: "coaster", id: "park-entrance", scale: 3.4, rotY: Math.PI }],
  },

  // ── Cucaino Karts (just outside the park, near Park Station) ──
  // the pit garage door — exactly registry/kartTrack.ts's KART_DOOR (kartTrack.test.ts checks it);
  // walking up offers "🏎️ Race!" (components/park/ParkApp.tsx handlePlace -> action "karts").
  // models: [] — the whole circuit (track, kerbs, gantry, grandstand, pit garage, tyre walls) is
  // hand-built in lib/park/world/karts/index.ts from the same registry/kartTrack.ts data.
  {
    id: "go-karts",
    label: "Cucaino Karts",
    emoji: "🏎️",
    land: "karts",
    // the pit garage door — exactly lib/park/world/karts/index.ts's kartDoorWorld() (copied, not
    // imported: see the "karts" land's own comment above). places.test.ts checks the two match.
    x: 224.4,
    z: -140.3,
    radius: 6,
    doorRadius: 9,
    action: "karts",
    signY: 7,
    models: [],
  },
];

/** where the kid starts (and comes out when they leave home): right beside their cottage, on the
 *  camera's side of it so they're in view, just clear of its door */
export const SPAWN = (() => {
  // (out in front of its door, on the square it faces)
  const h = PLACES.find((p) => p.id === "my-home")!;
  const f = h.face ?? 0;
  return { x: h.x + Math.sin(f) * (h.doorRadius + 1.5), z: h.z + Math.cos(f) * (h.doorRadius + 1.5) };
})();

export function getPlace(id: string): PlaceDef | undefined {
  return PLACES.find((p) => p.id === id);
}

// Some adventure places live up on the floating mountains: they take their pad's spot, island
// and facing (flat, clear pads planned in skyIslands.ts). Everyday places stay on the ground.
for (const pad of SKY_PADS) {
  const p = PLACES.find((q) => q.id === pad.placeId);
  if (!p) continue;
  p.x = pad.x;
  p.z = pad.z;
  p.face = pad.face;
  p.sky = pad.island;
  p.radius = Math.min(p.radius, pad.r - 1.5);
}

/**
 * Everything the park's GROUND is planned round (hills, trees, animal trails keep clear of these):
 * every place standing on the ground.
 */
export const GROUND_KEEPOUTS: { x: number; z: number; radius: number }[] = [...PLACES.filter((p) => !p.sky)];
/**
 * Frozen history, for the two things that were SITED when five buildings still hung over the park
 * on the floating mountains and kept clear of the spots under them: the park's hills
 * (registry/island.ts) and the kart circuit's site search (registry/kartTrack.ts). They still count
 * these spots, so neither a hill nor the circuit has moved. Nothing else should use this.
 */
export const SITED_ROUND: { x: number; z: number; radius: number }[] = [
  ...GROUND_KEEPOUTS,
  { x: 0, z: -115, radius: 2.4 },
  { x: -87.1393, z: 11.9603, radius: 2.6 },
  { x: -95.9605, z: 0.2696, radius: 1.8 },
  { x: 113.2333, z: 115.0896, radius: 2.6 },
  { x: 140.3951, z: -36.9461, radius: 2.6 },
];

/** Walkable limit of the park (the kid is kept inside this radius). */
export const PARK_RADIUS = 160;
