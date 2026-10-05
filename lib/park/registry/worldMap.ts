// Everything beyond Cucaino Island that the maps show: the far islands out at sea, the floating
// mountains overhead and the Abyss. One entry per place — add a new island here and both the
// little map and the big World map draw it. Pure data (derived from each place's own registry).
import { VILLAGE_ISLAND } from "./villageIsland";
import { SKY_ISLANDS } from "./skyIslands";
import { TERRAIN_X0, TERRAIN_X1, TERRAIN_Z0, TERRAIN_Z1, WRAP_R } from "./terrain";
import { ABYSS } from "./abyss";
import { FROST_ISLAND } from "./frostIsland";
import { DINO_ISLAND, dinoOutline } from "./dinoIsland";
import { STATIONS } from "./railway";
import { SETTLEMENTS } from "./settlements";
import { WONDERS } from "./wonders";

export interface WorldPlace {
  id: string;
  name: string;
  emoji: string;
  x: number;
  z: number;
  r: number;
  /** how it's drawn: a sea island (sand + land colour), a floating mountain, or a deep crack */
  kind: "island" | "sky" | "abyss";
  /** the island's land colour on the map */
  land?: string;
  /** how to get there (shown when a kid taps it) */
  how: string;
  /** for the abyss: the crack's winding path */
  path?: { x: number; z: number }[];
  /** an island's real shape, when it isn't round: its coast, and its beach's outer edge */
  outline?: { x: number; z: number }[];
  shore?: { x: number; z: number }[];
}

export const WORLD_PLACES: WorldPlace[] = [
  {
    id: VILLAGE_ISLAND.id,
    name: VILLAGE_ISLAND.name,
    emoji: "🏝️",
    x: VILLAGE_ISLAND.x,
    z: VILLAGE_ISLAND.z,
    r: VILLAGE_ISLAND.r,
    kind: "island",
    land: "#7fd36b",
    how: `${VILLAGE_ISLAND.name} is far out at sea, home of ${VILLAGE_ISLAND.clan}. Swim, ride the manta or fly the dragon there!`,
  },
  {
    id: DINO_ISLAND.id,
    name: DINO_ISLAND.name,
    emoji: "🦖",
    x: DINO_ISLAND.x,
    z: DINO_ISLAND.z,
    r: DINO_ISLAND.r,
    kind: "island",
    land: "#5fb04a",
    how: `${DINO_ISLAND.name} is a long, wild lost world out west, where dinosaurs roam free (and mammoths over its land bridge)! Swim, sail or fly the dragon there.`,
    outline: dinoOutline(-4, 72),
    shore: dinoOutline(6, 72),
  },
  {
    id: FROST_ISLAND.id,
    name: FROST_ISLAND.name,
    emoji: "🐧",
    x: FROST_ISLAND.x,
    z: FROST_ISLAND.z,
    r: FROST_ISLAND.r,
    kind: "island",
    land: "#f4f8ff",
    how: `${FROST_ISLAND.name} is a snowy island far out at sea where penguins waddle up the hill and slide down into the water! Swim, ride a dolphin or fly the dragon there.`,
  },
  {
    id: ABYSS.id,
    name: ABYSS.name,
    emoji: "🦈",
    x: ABYSS.path[Math.floor(ABYSS.path.length / 2)].x,
    z: ABYSS.path[Math.floor(ABYSS.path.length / 2)].z,
    r: ABYSS.width / 2,
    kind: "abyss",
    how: `${ABYSS.name} is a deep, dark crack in the ocean floor where the rarest sea creatures live — even a megalodon! Swim or ride the manta there and dive down.`,
    path: ABYSS.path,
  },
  ...SKY_ISLANDS.filter((s) => s.r >= 11).map((s) => ({
    id: s.id,
    name: s.name,
    emoji: s.kind === "mountain" ? "⛰️" : s.kind === "crystal" ? "💎" : s.kind === "ruins" ? "🏛️" : "☁️",
    x: s.x,
    z: s.z,
    r: s.r,
    kind: "sky" as const,
    how: `${s.name} floats high in the sky. Fly up on the dragon or manta and tap "Land"!`,
  })),
];

/** the edge of the world: sail past it and you come back round from the other side */
export const WORLD_EDGE = WRAP_R;

// ── the whole ~3 km island (the park + the Wildlands), for the big map's "Island" tab and the
// HUD's wide Wildlands view: a square framing centred on the island's middle, big enough to hold
// the whole coastline (reusing terrain.ts's own field bounds, so it always matches) ──
export const ISLAND_CENTER = { x: (TERRAIN_X0 + TERRAIN_X1) / 2, z: (TERRAIN_Z0 + TERRAIN_Z1) / 2 };
export const ISLAND_VIEW = Math.max(TERRAIN_X1 - TERRAIN_X0, TERRAIN_Z1 - TERRAIN_Z0) / 2 + 40;

/** a place a kid can tap on the Island tab to go to: the five railway stations (lib/park/registry/
 *  railway.ts) — Park Station plus the four named Wildlands stops (the Great Falls, the Great Lake,
 *  the Lone Peak and the Sunny Plains). Tapping one flies a dragon there (riding a flier), or hints
 *  at the train. */
export interface MapDestination {
  id: string;
  name: string;
  emoji: string;
  x: number;
  z: number;
  blurb: string;
}
export const ISLAND_DESTINATIONS: MapDestination[] = [
  ...STATIONS.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, x: s.x, z: s.z, blurb: s.blurb })),
  // Wildlands settlements (registry/settlements.ts): one pin each, tappable and dragon-flyable just
  // like a station — new settlements need nothing added here, they just appear
  ...SETTLEMENTS.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, x: s.x, z: s.z, blurb: `${s.name}, home of ${s.clan}.` })),
  // the Natural Wonders of the World (registry/wonders.ts): one pin each, tappable and dragon-flyable
  ...WONDERS.map((w) => ({ id: w.id, name: w.name, emoji: w.emoji, x: w.x, z: w.z, blurb: w.blurb })),
];

/** mountains labelled on the Island tab (not themselves destinations — the Lone Peak already has
 *  its own station marker, so only the long Great Ridge needs a label of its own) */
export const ISLAND_LANDMARKS: { id: string; name: string; emoji: string; x: number; z: number }[] = [{ id: "great-ridge", name: "Great Ridge", emoji: "⛰️", x: 860, z: -927 }];
