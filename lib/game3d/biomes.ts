// Per-theme look for the outdoor world, so each kid's world reads as a different place.
// Deliberately tiny: sky gradient + fog colour + a multiply tint on the shared grass
// texture — no extra textures or geometry, so switching biome costs nothing at runtime.
import type { ThemeId } from "@/lib/domain/types";

export interface Biome {
  skyTop: string;
  skyBottom: string;
  fog: number;
  /** multiplied over the grass texture (white = unchanged) */
  grassTint: string;
}

const BIOMES: Record<ThemeId, Biome> = {
  adventure: { skyTop: "#ffc47f", skyBottom: "#fff1dc", fog: 0xffe6c7, grassTint: "#fff0cf" },
  magical: { skyTop: "#cfa8ff", skyBottom: "#fbeaff", fog: 0xf1dcff, grassTint: "#f1e4ff" },
  galactic: { skyTop: "#7f86ff", skyBottom: "#dcdfff", fog: 0xd3d6ff, grassTint: "#dfe8ff" },
  ocean: { skyTop: "#8fd7ff", skyBottom: "#eaf6ff", fog: 0xdcefff, grassTint: "#ffffff" },
  dino: { skyTop: "#9fdcaa", skyBottom: "#f0fbe8", fog: 0xe3f5da, grassTint: "#e3ffd2" },
  garden: { skyTop: "#ffb4cc", skyBottom: "#fff0f5", fog: 0xffe3ec, grassTint: "#ffffff" },
};

export function biomeFor(themeId: ThemeId | undefined): Biome {
  return (themeId && BIOMES[themeId]) || BIOMES.ocean;
}
