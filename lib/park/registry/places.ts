// The lands, buildings and stations of Cucaino Park. Pure data: the world builder places them,
// paths wind from the plaza to each land's entrance, and the HUD decides what each `action`
// opens. To add a place: add an entry (and a land if it starts a new area).
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
  | "none";

export interface PlaceModel {
  kit: KitName;
  id: string;
  scale: number;
  /** local offset from the place position (x, z) and extra yaw */
  offset?: [number, number];
  rotY?: number;
}

export type LandId = "plaza" | "pets" | "market" | "rides" | "friends" | "dream" | "forest" | "gate";

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
  /** where the winding path from the plaza arrives */
  entrance: [number, number];
  /** bend points the path passes through on the way (makes it wind, not a straight spoke) */
  via: [number, number][];
}

export const LANDS: LandDef[] = [
  { id: "pets", name: "Pet Meadow", emoji: "🐾", x: -47, z: 6, radius: 17, ground: "#fff1a8", entrance: [-31, 4], via: [[-14, 7], [-23, 12]] },
  { id: "market", name: "Market Street", emoji: "🏪", x: 30, z: -42, radius: 15, ground: "#ffd0e6", entrance: [20, -32], via: [[8, -14], [12, -26]] },
  { id: "rides", name: "Ride Land", emoji: "🎢", x: -34, z: -40, radius: 15, ground: "#e3d4ff", entrance: [-22, -30], via: [[-9, -12], [-17, -22]] },
  { id: "friends", name: "Friends Café", emoji: "💌", x: -30, z: 40, radius: 12, ground: "#cdeeff", entrance: [-21, 31], via: [[-8, 13], [-15, 24]] },
  { id: "dream", name: "My Dream Park", emoji: "🔨", x: 40, z: 12, radius: 18, ground: "#c9f7de", entrance: [23.6, 12.4], via: [[10, 5], [17, 12]] },
  { id: "forest", name: "Sweet Forest", emoji: "🍄", x: 42, z: 50, radius: 18, ground: "#9fe8bf", entrance: [28, 38], via: [[9, 14], [18, 30]] },
  { id: "gate", name: "Park Gate", emoji: "🍭", x: 0, z: 52, radius: 6, ground: "#ffd0e6", entrance: [0, 46], via: [[2, 26], [-1, 36]] },
];

export const PLACES: PlaceDef[] = [
  // ── Candy Plaza ──
  {
    id: "quest-board",
    label: "Quest Board",
    emoji: "📋",
    land: "plaza",
    x: 0,
    z: -17,
    radius: 2.6,
    doorRadius: 5,
    action: "quests",
    signY: 6.2,
    models: [
      { kit: "town", id: "stall-red", scale: 3.4 },
      { kit: "town", id: "banner-red", scale: 3, offset: [-2.2, 0.6] },
      { kit: "town", id: "banner-green", scale: 3, offset: [2.2, 0.6] },
      { kit: "holiday", id: "present-a-cube", scale: 2, offset: [-2.6, 2.2] },
      { kit: "holiday", id: "present-b-rectangle", scale: 2, offset: [2.7, 2] },
    ],
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
    models: [
      { kit: "holiday", id: "present-a-round", scale: 2.6 },
      { kit: "holiday", id: "present-b-cube", scale: 1.8, offset: [1, 0.6] },
    ],
  },

  // ── Pet Meadow ──
  {
    id: "pet-house",
    label: "Pet House",
    emoji: "🏡",
    land: "pets",
    x: -58,
    z: 3,
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
    x: -44,
    z: -6,
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
    x: -34,
    z: 11,
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
    x: -50,
    z: 19,
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
    x: -46,
    z: 6,
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
    x: -56,
    z: -9,
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
    x: 24,
    z: -41,
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

  // ── Ride Land ──
  {
    id: "ride-station",
    label: "Rides & Games",
    emoji: "🎢",
    land: "rides",
    x: -30,
    z: -38,
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

  // ── Friends Café ──
  {
    id: "friends-tower",
    label: "Friends Café",
    emoji: "💌",
    land: "friends",
    x: -32,
    z: 43,
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
    x: 23.6,
    z: 12.4,
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

  // ── Grown-ups' Control Room (parent area, PIN protected) ──
  {
    id: "control-room",
    label: "Grown-ups",
    emoji: "🔒",
    land: "gate",
    x: 9,
    z: 44,
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
    z: 52,
    radius: 0,
    doorRadius: 0,
    action: "none",
    signY: 9.2,
    face: 0,
    models: [{ kit: "coaster", id: "park-entrance", scale: 3.4, rotY: Math.PI }],
  },
];

export const SPAWN = { x: 0, z: 20 };

export function getPlace(id: string): PlaceDef | undefined {
  return PLACES.find((p) => p.id === id);
}

/** Walkable limit of the park (the kid is kept inside this radius). */
export const PARK_RADIUS = 95;
