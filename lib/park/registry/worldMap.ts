// Everything beyond Cucaino Island that the maps show: the far islands out at sea, the floating
// mountains overhead and the Abyss. One entry per place — add a new island here and both the
// little map and the big World map draw it. Pure data (derived from each place's own registry).
import { VILLAGE_ISLAND } from "./villageIsland";
import { SKY_ISLANDS } from "./skyIslands";
import { WRAP_R } from "./terrain";
import { ABYSS } from "./abyss";
import { FROST_ISLAND } from "./frostIsland";
import { DINO_ISLAND } from "./dinoIsland";

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
    how: `${DINO_ISLAND.name} is a lost world far out at sea, where dinosaurs roam (and mammoths in its icy valley)! Swim, ride a whale or fly the dragon there.`,
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
