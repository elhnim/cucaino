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

export type LandId = "plaza" | "pets" | "market" | "rides" | "friends" | "dream" | "forest" | "gate" | "books" | "golf" | "arcade";

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
  { id: "pets", name: "Pet Meadow", emoji: "🐾", x: -78, z: 18, radius: 18, ground: "#dcd690" },
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
];

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
    x: -89,
    z: 15,
    radius: 3,
    doorRadius: 6,
    action: "pet",
    signY: 5.8,
    face: Math.PI / 2,
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
    x: -75,
    z: 6,
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
    x: -65,
    z: 23,
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
    x: -81,
    z: 31,
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
    x: -87,
    z: 3,
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
    x: 46,
    z: -71,
    radius: 3.6,
    doorRadius: 6,
    action: "shop",
    signY: 7,
    face: Math.PI / 2,
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
    x: 60,
    z: -79,
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
    x: 66,
    z: -66,
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
    x: -46,
    z: -66,
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
    x: 6,
    z: -122,
    radius: 2.4,
    doorRadius: 4.4,
    action: "arcade",
    signY: 6,
    models: [{ kit: "city", id: "building-a", scale: 3.6 }],
  },
  {
    id: "retro-arcade",
    label: "Retro Arcade",
    emoji: "👾",
    land: "arcade",
    x: -7,
    z: -122,
    radius: 2.6,
    doorRadius: 4.6,
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
    x: -40,
    z: -78,
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
    radius: 2.6,
    doorRadius: 4.6,
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
    x: 116,
    z: -48,
    radius: 2.6,
    doorRadius: 4.6,
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
    x: 107,
    z: -33,
    radius: 1.8,
    doorRadius: 4,
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
  { id: "my-home", label: "My Home", emoji: "🏡", land: "gate", x: -13, z: 50, radius: 3.4, doorRadius: 5, action: "home", signY: 6.8, models: [] }, // hand-built: lib/park/home/exterior.ts

  // ── Grown-ups' Control Room (parent area, PIN protected) ──
  {
    id: "control-room",
    label: "Grown-ups",
    emoji: "🔒",
    land: "gate",
    x: 9,
    z: 54,
    radius: 1.8,
    doorRadius: 3,
    action: "parent",
    signY: 4.4,
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
];

/** where the kid starts (and comes out when they leave home): right beside their cottage, on the
 *  camera's side of it so they're in view, just clear of its door */
export const SPAWN = (() => {
  const h = PLACES.find((p) => p.id === "my-home")!;
  return { x: h.x + h.doorRadius + 1.5, z: h.z + 1 };
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

/** Walkable limit of the park (the kid is kept inside this radius). */
export const PARK_RADIUS = 160;
