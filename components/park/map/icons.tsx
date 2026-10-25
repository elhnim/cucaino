// Tiny shared bits for drawing a category consistently across the Where-to chips, the search
// results and the trip buttons.
import type { MapCategory } from "@/lib/park/map/entities";
import type { TripMode } from "@/lib/park/map/planner";

export const CATEGORY_COLOR: Record<MapCategory, string> = {
  quest: "#ff2f6d",
  home: "#ffb020",
  ride: "#c48ae8",
  village: "#7fd36b",
  wonder: "#2b8fd6",
  station: "#8a5a34",
  island: "#2b8fd6",
  mountain: "#8899bb",
  land: "#5a2350",
  dock: "#2f6fa8",
  dragon: "#e8475e",
};

/** an undiscovered place never shows its real icon (that would spoil the surprise) — but a bare
 *  "❓" scattered everywhere told a kid nothing. This is the faint hint drawn in its place: "a
 *  village-shaped mystery", "a wonder-shaped mystery" — the real "?" still shows as a small corner
 *  badge (MapCanvas.tsx), so it's unmistakably "not found yet", just not unmistakably *nothing*. */
export const MYSTERY_SILHOUETTE: Record<MapCategory, string> = {
  village: "🏘️",
  wonder: "🌍",
  island: "🏝️",
  mountain: "☁️",
  quest: "❓",
  home: "❓",
  ride: "❓",
  station: "❓",
  land: "❓",
  dock: "❓",
  dragon: "❓",
};

export const MODE_EMOJI: Record<TripMode, string> = {
  walk: "🚶",
  train: "🚂",
  fly: "🐉",
  boat: "⛵",
  jeep: "🚙",
};
