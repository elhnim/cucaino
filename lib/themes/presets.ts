/**
 * Theme registry — adding a new theme is one entry here.
 *
 * Each theme drives the kid-view's whole look: header gradient, accent
 * colour for buttons/checkmarks, and a vibe (icon set + microcopy).
 * Both kids can pick any theme — none of these are gender-locked.
 */

import type { ThemeId } from "@/lib/domain/types";

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  /** Tailwind gradient classes for the kid header */
  headerGradient: string;
  /** Tailwind background gradient for the page */
  pageGradient: string;
  /** Hex accent colour for borders, primary buttons, focus rings */
  accent: string;
  /** Hex accent (light) for soft fills */
  accentSoft: string;
  /** Tailwind text class for prominent headings */
  headingText: string;
  /** Decorative emoji used in the section dividers ("🌅 MORNING", etc.) */
  decoration: string;
  /** Friendly noun used in greetings — "Hi, Liam!" stays simple, but used elsewhere */
  flavor: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  adventure: {
    id: "adventure",
    name: "Adventure",
    description: "Warm orange & amber, fox/forest vibes",
    headerGradient: "from-orange-500 to-amber-500",
    pageGradient: "from-orange-50 to-amber-50",
    accent: "#f97316",
    accentSoft: "#fed7aa",
    headingText: "text-orange-700",
    decoration: "🦊",
    flavor: "adventure",
  },
  magical: {
    id: "magical",
    name: "Magical",
    description: "Purple, pink & mint with sparkle accents",
    headerGradient: "from-fuchsia-600 via-pink-500 to-teal-500",
    pageGradient: "from-fuchsia-50 via-pink-50 to-teal-50",
    accent: "#c026d3",
    accentSoft: "#f5d0fe",
    headingText: "text-fuchsia-700",
    decoration: "✨",
    flavor: "magic",
  },
  galactic: {
    id: "galactic",
    name: "Galactic",
    description: "Deep blue & cyan with starry gold",
    headerGradient: "from-indigo-700 to-cyan-500",
    pageGradient: "from-indigo-50 to-cyan-50",
    accent: "#4f46e5",
    accentSoft: "#c7d2fe",
    headingText: "text-indigo-700",
    decoration: "🚀",
    flavor: "mission",
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    description: "Cool teal & blue, dolphin energy",
    headerGradient: "from-teal-500 to-sky-500",
    pageGradient: "from-teal-50 to-sky-50",
    accent: "#0ea5e9",
    accentSoft: "#bae6fd",
    headingText: "text-sky-700",
    decoration: "🐬",
    flavor: "voyage",
  },
  dino: {
    id: "dino",
    name: "Dino",
    description: "Earthy green & rust, prehistoric fun",
    headerGradient: "from-emerald-600 to-amber-600",
    pageGradient: "from-emerald-50 to-amber-50",
    accent: "#059669",
    accentSoft: "#a7f3d0",
    headingText: "text-emerald-700",
    decoration: "🦕",
    flavor: "expedition",
  },
  garden: {
    id: "garden",
    name: "Garden",
    description: "Soft green & rose, flower power",
    headerGradient: "from-rose-400 to-lime-500",
    pageGradient: "from-rose-50 to-lime-50",
    accent: "#e11d48",
    accentSoft: "#fecdd3",
    headingText: "text-rose-700",
    decoration: "🌸",
    flavor: "bloom",
  },
};

export function getTheme(id: ThemeId): Theme {
  return THEMES[id];
}

export function listThemes(): Theme[] {
  return Object.values(THEMES);
}
