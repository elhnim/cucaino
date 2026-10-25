// Fishing mini-game data: what a kid can reel in off the Great Lake pier (fresh water only —
// no sea fish here). Pure data, no logic — lib/park/fishing/logic.ts does the picking/weighting.
// Each entry has one true, kid-level fact (<=120 chars). A few are "let it go" catches (the
// turtle) or just-for-laughs junk (the boot, the lily pad) rather than real fish.

export type FishKind = "fish" | "critter" | "junk" | "plant";

export interface FishDef {
  id: string;
  name: string;
  /** quick-reference emoji (used in lists/silhouette fallbacks) */
  emoji: string;
  /** simple flat colours for drawing the SVG fish shape */
  colors: { body: string; belly: string; fin: string; spot?: string };
  kind: FishKind;
  /** rarity weight for weighted-random picking — bigger = more common. Always > 0. */
  weight: number;
  /** size range in cm, inclusive */
  sizeCm: readonly [number, number];
  /** one true, kid-level fact, <=120 characters */
  fact: string;
  /** a kind catch you gently let go instead of keeping (e.g. the turtle) */
  releaseOnly?: boolean;
}

export const FISH_FACTS: readonly FishDef[] = [
  {
    id: "rainbow-trout",
    name: "Rainbow Trout",
    emoji: "🐟",
    colors: { body: "#6fb8e0", belly: "#eaf6ff", fin: "#3f86b5", spot: "#ff8fa8" },
    kind: "fish",
    weight: 9,
    sizeCm: [20, 55],
    fact: "Rainbow trout get their name from the shimmering pink stripe along their silvery sides.",
  },
  {
    id: "perch",
    name: "Perch",
    emoji: "🐠",
    colors: { body: "#8fcf6a", belly: "#f3ffe0", fin: "#e8822f", spot: "#2c6b2f" },
    kind: "fish",
    weight: 15,
    sizeCm: [10, 30],
    fact: "Perch have spiky fins that pop straight up to make them harder for bigger fish to swallow.",
  },
  {
    id: "carp",
    name: "Carp",
    emoji: "🐟",
    colors: { body: "#c9a15c", belly: "#fff2d6", fin: "#8a6a2e" },
    kind: "fish",
    weight: 11,
    sizeCm: [25, 70],
    fact: "Carp are one of the oldest farmed fish — people have been raising them for food for 2,000+ years.",
  },
  {
    id: "catfish",
    name: "Catfish",
    emoji: "🐡",
    colors: { body: "#6b6f78", belly: "#d8dde6", fin: "#4a4e57" },
    kind: "fish",
    weight: 7,
    sizeCm: [20, 60],
    fact: "Catfish have whisker-like barbels that help them taste and feel in muddy water.",
  },
  {
    id: "pike",
    name: "Pike",
    emoji: "🐊",
    colors: { body: "#4f8c53", belly: "#eef7e4", fin: "#2f5f33", spot: "#dff0c8" },
    kind: "fish",
    weight: 5,
    sizeCm: [30, 80],
    fact: "Northern pike hide very still in weeds, then dart out fast to ambush their next meal.",
  },
  {
    id: "bluegill",
    name: "Bluegill",
    emoji: "🐟",
    colors: { body: "#5aa7c9", belly: "#eaf7ff", fin: "#2f6fa0", spot: "#1c3f66" },
    kind: "fish",
    weight: 16,
    sizeCm: [8, 20],
    fact: "Bluegill get their name from the dark blue edge on their gill covers, near logs and weeds.",
  },
  {
    id: "eel",
    name: "Eel",
    emoji: "🐍",
    colors: { body: "#5a5e3f", belly: "#dde4c2", fin: "#3b3e29" },
    kind: "fish",
    weight: 4,
    sizeCm: [25, 70],
    fact: "Freshwater eels can wriggle short distances over wet grass to reach a new pond.",
  },
  {
    id: "yabby",
    name: "Yabby",
    emoji: "🦞",
    colors: { body: "#2f6f5a", belly: "#cdeee1", fin: "#1f4d3e" },
    kind: "critter",
    weight: 8,
    sizeCm: [5, 15],
    fact: "Yabbies are freshwater crayfish that scuttle along the lake bed and can even swim backwards fast.",
  },
  {
    id: "turtle",
    name: "Freshwater Turtle",
    emoji: "🐢",
    colors: { body: "#5f8a4a", belly: "#e4f0c8", fin: "#3e5c30", spot: "#8fae6c" },
    kind: "critter",
    weight: 3,
    sizeCm: [10, 25],
    fact: "Freshwater turtles breathe air, so they paddle up for a gulp — let this one go back home!",
    releaseOnly: true,
  },
  {
    id: "old-boot",
    name: "Old Boot",
    emoji: "👢",
    colors: { body: "#6b4a33", belly: "#a3785a", fin: "#49311f" },
    kind: "junk",
    weight: 6,
    sizeCm: [20, 35],
    fact: "Just an old boot! Someone must have lost it off the pier a long, long time ago.",
  },
  {
    id: "lily-pad",
    name: "Lily Pad",
    emoji: "🪷",
    colors: { body: "#4f9d5a", belly: "#bfe8c3", fin: "#2f6b3a" },
    kind: "plant",
    weight: 7,
    sizeCm: [10, 30],
    fact: "A lily pad floats flat on the water to soak up sunlight for the whole plant growing below.",
  },
  {
    id: "golden-fish",
    name: "Golden Lucky Fish",
    emoji: "✨",
    colors: { body: "#ffd36b", belly: "#fff3cf", fin: "#e89a1c", spot: "#fff6d6" },
    kind: "fish",
    weight: 1,
    sizeCm: [15, 35],
    fact: "Legend says whoever spots the golden lucky fish gets a little extra luck for the day!",
  },
] as const;

export function getFish(id: string): FishDef | undefined {
  return FISH_FACTS.find((f) => f.id === id);
}

export const TOTAL_FISH_WEIGHT: number = FISH_FACTS.reduce((sum, f) => sum + f.weight, 0);
