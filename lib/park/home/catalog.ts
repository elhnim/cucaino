// My Home: the furniture / decor catalogue. Pure data (no three.js, no I/O) — shared by the 3D
// room (lib/park/home/scene.ts), the decorating bar (components/park/home/HomeEditor.tsx) and
// the server actions (lib/actions/home.ts), which re-check cost / unlocks / ownership.
//
// One entry = one thing a kid can put in their home. `w` x `d` is the floor footprint in grid
// cells (wall items: `w` cells along the wall). The 3D model for each id is hand-built in
// lib/park/home/furniture.ts (a missing builder falls back to a gift box, so data never breaks
// the room). Price is in park tickets (1 per finished quest); cost 0 = part of the free starter
// set. `unlock` gates by profile level (lifetime stars) and/or day streak.

export type HomeCategory = "beds" | "comfy" | "fun" | "decor" | "wall" | "pet" | "styles";

/**
 * floor   = furniture that stands on the floor (blocks walking when `solid`)
 * rug     = flat on the floor; furniture can stand on it, rugs can't overlap each other
 * wall    = hangs on a wall (posters, shelves, clock ...)
 * wallpaper / flooring = a room style, applied to a whole room rather than placed
 */
export type HomeSurface = "floor" | "rug" | "wall" | "wallpaper" | "flooring";

/** what the pet does with it */
export type PetUse = "sleep" | "eat" | "play" | "scratch";

export interface HomeItemDef {
  id: string;
  name: string;
  emoji: string;
  category: HomeCategory;
  surface: HomeSurface;
  /** footprint in cells: w along x (or along the wall), d along z. Styles: 0 x 0 */
  w: number;
  d: number;
  /** tickets per copy; 0 = free starter item */
  cost: number;
  /** most copies a home can have (free items: that many are always available) */
  max: number;
  unlock?: { level?: number; streak?: number };
  /** floor items: blocks the kid's walking path (default true for floor, never for rugs) */
  solid?: boolean;
  petUse?: PetUse;
  /** pet beds: how high the pet lies when it sleeps in it */
  seatY?: number;
  /** wall items: height of the item's centre on the wall */
  wallY?: number;
  /** styles: the swatch shown in the catalogue (CSS colours) */
  swatch?: [string, string];
}

export const HOME_CATEGORIES: { id: HomeCategory; label: string; emoji: string }[] = [
  { id: "beds", label: "Beds", emoji: "🛏️" },
  { id: "comfy", label: "Comfy", emoji: "🛋️" },
  { id: "fun", label: "Fun", emoji: "🎸" },
  { id: "decor", label: "Decor", emoji: "🪴" },
  { id: "wall", label: "Walls", emoji: "🖼️" },
  { id: "pet", label: "Pet", emoji: "🐾" },
  { id: "styles", label: "Paint", emoji: "🎨" },
];

export const HOME_ITEMS: HomeItemDef[] = [
  // ── beds ──
  { id: "bed", name: "Cosy Bed", emoji: "🛏️", category: "beds", surface: "floor", w: 2, d: 3, cost: 0, max: 1 },
  { id: "bed-bunk", name: "Bunk Bed", emoji: "🪜", category: "beds", surface: "floor", w: 2, d: 3, cost: 8, max: 1, unlock: { level: 2 } },
  { id: "bed-canopy", name: "Canopy Bed", emoji: "👑", category: "beds", surface: "floor", w: 2, d: 3, cost: 12, max: 1, unlock: { level: 3 } },
  { id: "nightstand", name: "Bedside Table", emoji: "🕯️", category: "beds", surface: "floor", w: 1, d: 1, cost: 0, max: 2 },

  // ── comfy ──
  { id: "rug-rose", name: "Rose Rug", emoji: "🌹", category: "comfy", surface: "rug", w: 3, d: 2, cost: 0, max: 1 },
  { id: "fireplace", name: "Cosy Fireplace", emoji: "🔥", category: "comfy", surface: "floor", w: 3, d: 1, cost: 0, max: 1 },
  { id: "rug-round", name: "Round Rug", emoji: "⭕", category: "comfy", surface: "rug", w: 2, d: 2, cost: 0, max: 2 },
  { id: "rug-rainbow", name: "Rainbow Rug", emoji: "🌈", category: "comfy", surface: "rug", w: 3, d: 2, cost: 3, max: 2 },
  { id: "rug-paw", name: "Paw Print Rug", emoji: "🐾", category: "comfy", surface: "rug", w: 2, d: 2, cost: 2, max: 2 },
  { id: "beanbag", name: "Bean Bag", emoji: "🫘", category: "comfy", surface: "floor", w: 1, d: 1, cost: 2, max: 3 },
  { id: "armchair", name: "Armchair", emoji: "💺", category: "comfy", surface: "floor", w: 1, d: 1, cost: 4, max: 2 },
  { id: "sofa", name: "Squishy Sofa", emoji: "🛋️", category: "comfy", surface: "floor", w: 3, d: 1, cost: 6, max: 1 },

  // ── fun ──
  { id: "desk", name: "Homework Desk", emoji: "✏️", category: "fun", surface: "floor", w: 2, d: 1, cost: 0, max: 1 },
  { id: "chair", name: "Desk Chair", emoji: "🪑", category: "fun", surface: "floor", w: 1, d: 1, cost: 0, max: 2 },
  { id: "toy-chest", name: "Toy Chest", emoji: "🧸", category: "fun", surface: "floor", w: 2, d: 1, cost: 3, max: 1 },
  { id: "keyboard", name: "Piano Keys", emoji: "🎹", category: "fun", surface: "floor", w: 2, d: 1, cost: 8, max: 1 },
  { id: "guitar", name: "Guitar Stand", emoji: "🎸", category: "fun", surface: "floor", w: 1, d: 1, cost: 4, max: 1 },
  { id: "drums", name: "Drum Kit", emoji: "🥁", category: "fun", surface: "floor", w: 2, d: 2, cost: 10, max: 1, unlock: { streak: 5 } },
  { id: "tv", name: "Games TV", emoji: "📺", category: "fun", surface: "floor", w: 2, d: 1, cost: 9, max: 1, unlock: { level: 2 } },
  { id: "tent", name: "Play Tent", emoji: "⛺", category: "fun", surface: "floor", w: 2, d: 2, cost: 7, max: 1 },
  { id: "telescope", name: "Star Telescope", emoji: "🔭", category: "fun", surface: "floor", w: 1, d: 1, cost: 6, max: 1, unlock: { streak: 3 } },

  // ── decor ──
  { id: "lamp", name: "Floor Lamp", emoji: "💡", category: "decor", surface: "floor", w: 1, d: 1, cost: 0, max: 3 },
  { id: "plant", name: "Potted Plant", emoji: "🪴", category: "decor", surface: "floor", w: 1, d: 1, cost: 0, max: 4 },
  { id: "plant-big", name: "Big Leafy Plant", emoji: "🌿", category: "decor", surface: "floor", w: 1, d: 1, cost: 2, max: 3 },
  { id: "bookshelf", name: "Bookshelf", emoji: "📚", category: "decor", surface: "floor", w: 2, d: 1, cost: 4, max: 2 },
  { id: "aquarium", name: "Fish Tank", emoji: "🐠", category: "decor", surface: "floor", w: 2, d: 1, cost: 10, max: 1, unlock: { level: 2 } },

  // ── walls ──
  { id: "poster-star", name: "Star Poster", emoji: "⭐", category: "wall", surface: "wall", w: 1, d: 1, cost: 0, max: 3, wallY: 2.3 },
  { id: "poster-rocket", name: "Rocket Poster", emoji: "🚀", category: "wall", surface: "wall", w: 1, d: 1, cost: 2, max: 2, wallY: 2.3 },
  { id: "poster-dino", name: "Dino Poster", emoji: "🦕", category: "wall", surface: "wall", w: 1, d: 1, cost: 2, max: 2, wallY: 2.3 },
  { id: "poster-rainbow", name: "Rainbow Picture", emoji: "🌈", category: "wall", surface: "wall", w: 2, d: 1, cost: 3, max: 2, wallY: 2.4 },
  { id: "wall-shelf", name: "Wall Shelf", emoji: "📗", category: "wall", surface: "wall", w: 2, d: 1, cost: 2, max: 3, wallY: 2.0 },
  { id: "trophy-shelf", name: "Trophy Shelf", emoji: "🏆", category: "wall", surface: "wall", w: 2, d: 1, cost: 5, max: 1, wallY: 2.2, unlock: { level: 2 } },
  { id: "clock", name: "Cuckoo Clock", emoji: "🕰️", category: "wall", surface: "wall", w: 1, d: 1, cost: 2, max: 1, wallY: 2.6 },
  { id: "mirror", name: "Magic Mirror", emoji: "🪞", category: "wall", surface: "wall", w: 1, d: 1, cost: 3, max: 2, wallY: 2.1 },
  { id: "bunting", name: "Party Bunting", emoji: "🎏", category: "wall", surface: "wall", w: 3, d: 1, cost: 3, max: 2, wallY: 3.1 },
  { id: "fairy-lights", name: "Fairy Lights", emoji: "✨", category: "wall", surface: "wall", w: 3, d: 1, cost: 4, max: 2, wallY: 3.15, unlock: { streak: 3 } },

  // ── pet ──
  { id: "pet-bed", name: "Pet Bed", emoji: "🧺", category: "pet", surface: "floor", w: 2, d: 2, cost: 0, max: 1, solid: false, petUse: "sleep", seatY: 0.28 },
  { id: "pet-castle", name: "Cushion Castle", emoji: "🏰", category: "pet", surface: "floor", w: 2, d: 2, cost: 6, max: 1, solid: false, petUse: "sleep", seatY: 0.34 },
  { id: "bowl", name: "Food Bowl", emoji: "🥣", category: "pet", surface: "floor", w: 1, d: 1, cost: 0, max: 2, solid: false, petUse: "eat" },
  { id: "bowl-fancy", name: "Snack Station", emoji: "🦴", category: "pet", surface: "floor", w: 1, d: 1, cost: 3, max: 1, solid: false, petUse: "eat" },
  { id: "pet-ball", name: "Bouncy Ball", emoji: "🎾", category: "pet", surface: "floor", w: 1, d: 1, cost: 0, max: 2, solid: false, petUse: "play" },
  { id: "ducky", name: "Squeaky Duck", emoji: "🐤", category: "pet", surface: "floor", w: 1, d: 1, cost: 2, max: 2, solid: false, petUse: "play" },
  { id: "scratch-post", name: "Scratch Tower", emoji: "🪵", category: "pet", surface: "floor", w: 1, d: 1, cost: 3, max: 1, petUse: "scratch" },
  { id: "pet-tunnel", name: "Play Tunnel", emoji: "🌀", category: "pet", surface: "floor", w: 2, d: 1, cost: 4, max: 1, solid: false, petUse: "play" },

  // ── styles (whole room) ──
  { id: "wp-roses", name: "Rose Garden", emoji: "🌹", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 0, max: 1, swatch: ["#fbf1dc", "#e58fa5"] },
  { id: "wp-paws", name: "Minty Paws", emoji: "🐾", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 0, max: 1, swatch: ["#bfe3c8", "#ffffff"] },
  { id: "wp-cream", name: "Buttercream", emoji: "🧈", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 0, max: 1, swatch: ["#fff1d6", "#f6dcb4"] },
  { id: "wp-stripes", name: "Candy Stripes", emoji: "🍬", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 0, max: 1, swatch: ["#ffd7e6", "#ffffff"] },
  { id: "wp-dots", name: "Mint Dots", emoji: "🟢", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 2, max: 1, swatch: ["#c9f2df", "#ffffff"] },
  { id: "wp-hearts", name: "Sweet Hearts", emoji: "💗", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 3, max: 1, swatch: ["#ffe2ef", "#ff8fb8"] },
  { id: "wp-clouds", name: "Sky Clouds", emoji: "☁️", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 3, max: 1, swatch: ["#bfe6ff", "#ffffff"] },
  { id: "wp-stars", name: "Starry Night", emoji: "🌌", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 5, max: 1, unlock: { level: 2 }, swatch: ["#3b3a86", "#ffe27a"] },
  { id: "wp-leaves", name: "Jungle Leaves", emoji: "🍃", category: "styles", surface: "wallpaper", w: 0, d: 0, cost: 5, max: 1, unlock: { streak: 3 }, swatch: ["#dff5c8", "#5fbf6a"] },
  { id: "fl-wood", name: "Honey Wood", emoji: "🪵", category: "styles", surface: "flooring", w: 0, d: 0, cost: 0, max: 1, swatch: ["#e3ad6f", "#c98d52"] },
  { id: "fl-checker", name: "Picnic Check", emoji: "🏁", category: "styles", surface: "flooring", w: 0, d: 0, cost: 0, max: 1, swatch: ["#ffe7b8", "#ffc98a"] },
  { id: "fl-tiles", name: "Mint Tiles", emoji: "🧊", category: "styles", surface: "flooring", w: 0, d: 0, cost: 2, max: 1, swatch: ["#bdeedd", "#ffffff"] },
  { id: "fl-carpet", name: "Lilac Carpet", emoji: "🟣", category: "styles", surface: "flooring", w: 0, d: 0, cost: 3, max: 1, swatch: ["#d8c4ff", "#c5acff"] },
  { id: "fl-dark", name: "Choco Wood", emoji: "🍫", category: "styles", surface: "flooring", w: 0, d: 0, cost: 3, max: 1, swatch: ["#a8704a", "#8a5a3a"] },
  { id: "fl-candy", name: "Candy Swirl", emoji: "🍭", category: "styles", surface: "flooring", w: 0, d: 0, cost: 5, max: 1, unlock: { level: 2 }, swatch: ["#ffd0e4", "#bfe8ff"] },
];

const BY_ID = new Map(HOME_ITEMS.map((i) => [i.id, i]));

export function getHomeItem(id: string): HomeItemDef | undefined {
  return BY_ID.get(id);
}

export function isPlaceable(def: HomeItemDef): boolean {
  return def.surface === "floor" || def.surface === "rug" || def.surface === "wall";
}
export function isStyle(def: HomeItemDef): boolean {
  return def.surface === "wallpaper" || def.surface === "flooring";
}
/** floor items block walking unless they say otherwise; rugs and wall items never do */
export function isSolid(def: HomeItemDef): boolean {
  return def.surface === "floor" && def.solid !== false;
}
