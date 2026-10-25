// Weaving mini-game data: the wool palette, the pattern cards the Peakfolk can teach, and kid-
// level true facts about wool, weaving and mountains. Pure data, no logic — lib/park/weaving/
// logic.ts does the grid work and the pattern matching. Each fact is <=120 characters.
export interface WoolColor {
  id: string;
  name: string;
  hex: string;
}

/** Dyed yak wool colours a kid can pick from — bright and kid-friendly. */
export const WOOL_COLORS: readonly WoolColor[] = [
  { id: "ruby", name: "Ruby Red", hex: "#e8485f" },
  { id: "gold", name: "Sunshine Gold", hex: "#ffc23d" },
  { id: "sky", name: "Sky Blue", hex: "#4fb4e8" },
  { id: "moss", name: "Moss Green", hex: "#5aa852" },
  { id: "plum", name: "Berry Plum", hex: "#a860d6" },
  { id: "snow", name: "Snow White", hex: "#f6f3ea" },
] as const;

export function getWool(id: string): WoolColor | undefined {
  return WOOL_COLORS.find((w) => w.id === id);
}

export interface PatternDef {
  id: string;
  name: string;
  /** 1 (easiest) to 5 (hardest) — shown as little stars on the pattern card */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** true = the accent colour belongs here; false = the base colour (or left plain) */
  template: (col: number, row: number) => boolean;
}

export const PATTERNS: readonly PatternDef[] = [
  {
    id: "stripes",
    name: "Stripes",
    difficulty: 1,
    template: (_col, row) => Math.floor(row / 2) % 2 === 1,
  },
  {
    id: "checks",
    name: "Checks",
    difficulty: 2,
    template: (col, row) => (col + row) % 2 === 0,
  },
  {
    id: "zigzag",
    name: "Zigzag",
    difficulty: 3,
    template: (col, row) => {
      const period = 6;
      const phase = col % period;
      const tri = phase < period / 2 ? phase : period - phase;
      return ((row - tri + 8) % 4) < 2;
    },
  },
  {
    id: "diamonds",
    name: "Diamonds",
    difficulty: 4,
    template: (col, row) => {
      const cx = col % 4;
      const cy = row % 4;
      return Math.abs(cx - 2) + Math.abs(cy - 2) === 2;
    },
  },
  {
    id: "waves",
    name: "Waves",
    difficulty: 5,
    template: (col, row) => {
      const wave = Math.round(1.5 * Math.sin((col / 5) * Math.PI));
      const centre = 4 + wave;
      return row === centre || row === centre + 1;
    },
  },
] as const;

export function getPattern(id: string): PatternDef | undefined {
  return PATTERNS.find((p) => p.id === id);
}

export interface WeaveFact {
  id: string;
  text: string;
}

export const WEAVE_FACTS: readonly WeaveFact[] = [
  { id: "yak-warm", text: "Yak wool is very warm and soft — mountain herders spin it into yarn." },
  { id: "oldest-craft", text: "Weaving is one of the oldest crafts — people have woven cloth for thousands of years." },
  { id: "plant-dyes", text: "Plants and flowers can make dyes: onion skins make yellow, indigo makes blue." },
  { id: "warp-weft", text: "A loom holds still 'warp' threads so a weaver can pass 'weft' thread over and under." },
  { id: "yak-altitude", text: "Yaks live happily at altitudes where there's barely enough oxygen for most animals." },
  { id: "shuttle", text: "A weaver's shuttle carries the thread back and forth, a bit like a tiny boat." },
  { id: "spinning", text: "Before wool can be woven, it's spun into yarn by twisting the soft fibres together." },
  { id: "mountain-cold", text: "High mountain nights can be freezing even in summer, so warm wool matters a lot." },
  { id: "colour-symbol", text: "In many mountain cultures, certain woven colours and patterns have their own meaning." },
  { id: "double-coat", text: "Yaks grow a thick undercoat for winter and shed it when warmer weather comes." },
] as const;

export function getWeaveFact(id: string): WeaveFact | undefined {
  return WEAVE_FACTS.find((f) => f.id === id);
}
