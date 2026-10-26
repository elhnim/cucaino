// BUBBLE BUDDIES — an original single-screen platformer in the spirit of 8-bit "catch the
// critter in a bubble" classics. A chubby baby dino-like hero waddles round one screen of
// candy platforms, blows bubbles that float forward then drift up toward the ceiling, and
// traps any critter they touch. Jump into a trapped bubble to pop it — the critter floats
// off happily and drops a piece of fruit for points (pop several in a row for a chain
// bonus). Hold A to bounce on an empty bubble like a trampoline. Walk off either edge of
// the screen and you wrap round to the other side; fall through a gap in the floor and you
// wrap back in at the top. A trapped critter that isn't popped in time escapes and comes
// back faster and angrier. Clear every critter on screen to move on — twelve rounds, with
// walkers, jumpers, flyers and critters that lob things joining in as you go. No critter is
// ever really hurt: caught ones simply float away and turn into fruit.
import { H, PAL, W, clamp, overlap, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Rng, type Sprite } from "../engine";
import { bake, bakeGradient, bakeRidge, bayer, drawStrip, fbm, hash2, mixHex, shade } from "../art";

const T = 16; // tile size
const COLS = 16; // 16 * 16 = 256 = W
const ROWS = 14; // 14 * 16 = 224 = H
const GRAV = 0.3;
const MAXFALL = 5.2;
const COYOTE = 6;
const BUFFER = 6;
const WALK = 1.05;
const HW = 17; // hero footprint — platform landing, bubble/fruit pickup (bigger here is never harder)
const HH = 20;
const HURT_W = 12; // the hero's ORIGINAL hurt-box, centred inside the bigger sprite: the bigger
const HURT_H = 13; // art must not make critters/projectiles easier to touch the kid with
const TOTAL_ROUNDS = 12;
const MAX_BUBBLES = 3; // empty bubbles the hero can have drifting at once
const BUBBLE_FLY_FRAMES = 26;
const DRIFT_LIFE = 240;
const CHAIN_WINDOW = 110;
const FRUIT_LIFE = 260;
const FRUIT_BASE = 100;
const HURRY_AT = 2100; // ~35s of play before the level hurries you along

// ── single-screen tile maps: "#" is a one-way platform (land on top when falling, jump
// straight up through it from below), "." is open air. Walking off either edge of the
// screen wraps round to the other side; falling through a gap in the floor wraps back in
// at the top — exactly like the arcade games this is an homage to.
const LAYOUTS: string[][] = [
  [
    "................",
    "................",
    "....########....",
    "................",
    "................",
    "..####......####",
    "................",
    "................",
    "########........",
    "................",
    "................",
    "........########",
    "................",
    "######....######",
  ],
  [
    "................",
    "..########......",
    "................",
    "................",
    "......####......",
    "................",
    "####........####",
    "................",
    "................",
    "........####....",
    "................",
    "####......####..",
    "................",
    "########..######",
  ],
  [
    "................",
    "................",
    "..##........##..",
    "................",
    "................",
    "....####....####",
    "................",
    "................",
    "####....####....",
    "................",
    "................",
    "..####....####..",
    "................",
    "#######..#######",
  ],
  [
    "................",
    "....####....####",
    "................",
    "##....####....##",
    "................",
    "................",
    "..####....####..",
    "................",
    "................",
    "####....####....",
    "................",
    "....########....",
    "................",
    "#####..#########",
  ],
];
for (const l of LAYOUTS) {
  if (l.length !== ROWS || l.some((row) => row.length !== COLS)) throw new Error("bubbleBuddies: bad layout size");
}
const STARTS = [40, 40, 40, 24];
// ── four backdrop THEMES the round cycles through — sky, sunset, night, cave/undersea — so the
// world itself feels different every round, not just the platform layout (brief: "the backdrop
// theme should change every few rounds")
const THEME_COUNT = 4;
const THEME_SKY: string[][] = [
  ["#3d7de0", "#6cb6ff", "#cdeeff"], // day
  ["#5a2a66", "#ff7a3c", "#ffd9a0"], // sunset
  ["#05030f", "#140c3a", "#2a1f5e"], // night
  ["#021a22", "#063b48", "#0e5a6e"], // undersea cave
];
// the ridge's "true" hue — ridgeSprite blends this toward the sky's horizon colour for
// atmospheric perspective (far ridge mostly sky-coloured, near ridge a soft hazy version of the
// hue), so the backdrop always stays paler/less saturated than the platforms sitting in front of it
const THEME_RIDGE_HUE: { hue: string; rim: string }[] = [
  { hue: "#8a93e0", rim: "#eef1ff" }, // day: mid-tone lavender-blue hills (never platform-pink)
  { hue: "#b06a84", rim: "#ffd9c2" }, // sunset: mid-tone dusty mauve-rose hills
  { hue: "#6a60c4", rim: "#b0a8f0" }, // night: mid-tone periwinkle-violet hills
  { hue: "#2fa0b8", rim: "#8bf0e0" }, // undersea: mid-tone aqua-teal reef
];
const THEME_STREAK: [string, string][] = [
  ["#eaffff", "#bfe8ff"], // waterfall
  ["#fff2d9", "#ffd27a"], // golden-hour falls
  ["#d9d2ff", "#a699ff"], // moonlit falls
  ["#8bffe0", "#45d9c0"], // glowing vent
];
const THEME_GROUND: { band: string; glint: string; dots: boolean }[] = [
  { band: "#cdeeff", glint: "#ffffff", dots: false },
  { band: "#ffd9a0", glint: "#fff3d6", dots: false },
  { band: "#241a4a", glint: "#ffe8a0", dots: true },
  { band: "#0e5a6e", glint: "#8be8ff", dots: true },
];

type CritterKind = "walker" | "jumper" | "flyer" | "thrower";
const KIND_COLOR: Record<CritterKind, string> = { walker: PAL.purple, jumper: PAL.teal, flyer: PAL.pink, thrower: PAL.orange };
const KIND_DARK: Record<CritterKind, string> = { walker: "#5f36a8", jumper: "#136b61", flyer: "#b8459a", thrower: "#b8601e" };
const FRUIT_COLORS = [PAL.red, PAL.purple, PAL.orange, PAL.yellow];
/** visual body radius for each critter kind (ears/legs add a bit more); hitboxes below stay
 * a little smaller than the drawn body, per the brief ("never beyond it") */
const CRITTER_R: Record<CritterKind, number> = { walker: 7, jumper: 7, flyer: 7, thrower: 7 };
const CRITTER_DIMS: Record<CritterKind, [number, number]> = { walker: [15, 15], jumper: [15, 15], flyer: [17, 14], thrower: [15, 16] };
/** the critters' ORIGINAL sizes, used only for the contact-hurts-the-hero check (inset, centred
 * inside the bigger art) — their bigger CRITTER_DIMS box still applies when a bubble catches
 * them, which only makes them easier to trap */
const CRITTER_HURT_DIMS: Record<CritterKind, [number, number]> = { walker: [12, 11], jumper: [12, 11], flyer: [12, 10], thrower: [12, 12] };
const OUTLINE = "#140c28";

// ── baked backdrop + tile art (see "BAKE LAZILY" at the top of the brief) ──
const DITHER_W = 4; // kept narrow (and identical across its width) so it tiles seamlessly
const RIDGE_W = 128; // ridge/mountain strips tile seamlessly at this width (frequencies below are
// whole cycles across it, so wrap-around is exact, no seam)
function skyStrip(stops: string[]): Sprite {
  return bakeGradient(DITHER_W, H, stops);
}
function groundStrip(themeIdx: number): Sprite {
  // the band under the hills: a shimmering LAKE (day/sunset/night — soft dashed horizontal
  // reflection streaks + sparkle, instead of the flat diagonal-line "blank floor"), or for
  // undersea (already underwater) a sandy seabed MEADOW with coral/seaweed tufts poking up
  const st = THEME_GROUND[themeIdx];
  const w = 32, h = 28;
  if (themeIdx === 3) {
    return bake(w, h, (x, y) => {
      const tuftH = hash2(x, 0, 310) > 0.45 ? 1 + Math.floor(hash2(x, 1, 311) * 3) : 0;
      if (y < tuftH) return y === 0 ? st.glint : shade(st.glint, -0.15);
      const wave = fbm(x * 0.15, y * 0.4, 2, 73);
      const base = mixHex(st.band, "#000000", 0.05 + wave * 0.06);
      if (y === tuftH) return shade(base, 0.22);
      return hash2(Math.floor(x / 3), Math.floor(y / 4), 90) > 0.93 ? st.glint : base;
    });
  }
  return bake(w, h, (x, y) => {
    const wave = fbm(x * 0.15, y * 0.4, 2, 40 + themeIdx * 11);
    const base = mixHex(st.band, themeIdx === 2 ? "#000000" : "#ffffff", 0.08 + wave * 0.06);
    if (y === 0) return shade(base, 0.26); // the bright waterline where hill meets lake
    const rowOff = Math.sin(y * 0.7 + themeIdx) * 3;
    if (y % 3 === 1 && Math.sin((x + rowOff) * 0.5) > 0.55) return mixHex(base, st.glint, 0.55); // a dashed, rippling reflection streak
    if (hash2(x, y, 90 + themeIdx) > 0.965) return st.glint; // a sparkle of sunlight/moonlight on the water
    return base;
  });
}
/** a fluffy cloud silhouette made of overlapping puffs, lit from the top-left; an optional warm
 * tint for the sunset sky so clouds aren't always plain white */
function cloudPuff(w: number, h: number, dim: boolean, tint?: string, strength = 0.35): Sprite {
  const puffs: [number, number, number][] = [
    [w * 0.22, h * 0.58, w * 0.24],
    [w * 0.46, h * 0.36, w * 0.32],
    [w * 0.72, h * 0.5, w * 0.27],
    [w * 0.88, h * 0.62, w * 0.17],
  ];
  let lit = dim ? "#dcebff" : "#ffffff";
  let soft = dim ? "#b9d2f0" : "#cfe6ff";
  if (tint) {
    lit = mixHex(lit, tint, strength);
    soft = mixHex(soft, tint, Math.min(1, strength + 0.1));
  }
  return bake(w, h, (x, y) => {
    let inside = false;
    for (const [bx, by, br] of puffs) {
      const dx = (x - bx) / br;
      const dy = (y - by) / (br * 0.8);
      if (dx * dx + dy * dy < 1) inside = true;
    }
    if (!inside) return null;
    return y < h * 0.42 ? lit : soft;
  });
}
/** a tiled starfield strip for the night theme: scattered dots with varied brightness */
function starStrip(): Sprite {
  const w = 96, h = 90;
  return bake(w, h, (x, y) => {
    const v = hash2(x, y, 211);
    if (v > 0.986) return "#ffffff";
    if (v > 0.965) return "#cfe0ff";
    return null;
  });
}
/** the sun (day/sunset), moon (night, with craters) or a soft bioluminescent glow (undersea) —
 * a small disc with a soft TWO-STEP dithered halo (no ray-burst: that read as noisy spiky static
 * in a corner, which fought the sky instead of sitting quietly in it) */
function orbSprite(themeIdx: number): Sprite {
  const size = 26;
  const r = size / 2;
  const cfg = [
    { core: "#fff6d2", mid: "#ffe17a", craters: false },
    { core: "#fff0e0", mid: "#ff9a4a", craters: false },
    { core: "#f2f0ff", mid: "#cfc6ff", craters: true },
    { core: "#d9fff5", mid: "#7fe0c8", craters: false },
  ][themeIdx];
  const spots: [number, number, number][] = [[-3, -2.4, 2.4], [3, 3, 1.8], [-1.8, 4, 1.4]];
  const coreR = r * 0.56;
  return bake(size, size, (x, y) => {
    const dx = x - r + 0.5, dy = y - r + 0.5;
    const dist = Math.hypot(dx, dy);
    if (dist < coreR) {
      if (cfg.craters) for (const [sx, sy, sr] of spots) if (Math.hypot(dx - sx, dy - sy) < sr) return shade(cfg.core, -0.16);
      return cfg.core;
    }
    // halo step 1: a denser dithered ring right against the disc
    if (dist < coreR + 3) {
      const fall = 1 - (dist - coreR) / 3;
      if (fall > bayer(x, y) * 0.75) return cfg.mid;
    }
    // halo step 2: a sparser, softer ring further out
    if (dist < coreR + 7) {
      const fall = 1 - (dist - coreR - 3) / 4;
      if (fall > 0.35 + bayer(x, y) * 0.85) return cfg.mid;
    }
    return null;
  });
}
/** the height envelope of a row of round, overlapping domed hills (never a spiky zigzag ridge
 * line) — wrap-aware so it tiles seamlessly at width `w` */
function domeHeight(x: number, domes: { cx: number; r: number; h: number }[], w: number): number {
  let best = 0;
  for (const d of domes) {
    let dx = Math.abs(x - d.cx);
    dx = Math.min(dx, w - dx);
    const t = dx / d.r;
    if (t < 1) best = Math.max(best, d.h * Math.sqrt(1 - t * t));
  }
  return best;
}
/** small life growing on the ridge line: lollipop/crystal/coral "trees", gumdrop/anemone
 * "bushes" (near layer, up close) and a tiny distant candy-castle/windmill/shipwreck silhouette
 * (far layer) — all added as extra height ON TOP of the hill silhouette at a few fixed spots, so
 * they plant themselves naturally on the hill surface rather than floating */
function ridgeDecor(themeIdx: number, near: boolean, w: number): { extra: number[]; color: string[]; hi: string[]; win: (string | null)[] } {
  const extra = new Array<number>(w).fill(0);
  const color = new Array<string>(w).fill("");
  const hi = new Array<string>(w).fill("");
  const win = new Array<string | null>(w).fill(null);
  const put = (cx: number, r: number, peak: number, c: string, h: string) => {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const x = ((Math.round(cx) + dx) % w + w) % w;
      const t = Math.abs(dx) / r;
      if (t >= 1) continue;
      const e = peak * Math.sqrt(1 - t * t);
      if (e > extra[x]) {
        extra[x] = e;
        color[x] = c;
        hi[x] = h;
      }
    }
  };
  if (near) {
    const treeC = ["#ff8fd6", "#ffb24a", "#aea4f0", "#2fb8a6"][themeIdx];
    const bushC = ["#8ee678", "#e0855a", "#5a4fae", "#ff9a6a"][themeIdx];
    put(w * 0.12, 3, 9, treeC, shade(treeC, 0.3));
    put(w * 0.87, 3.4, 8, treeC, shade(treeC, 0.3));
    put(w * 0.36, 6, 4.5, bushC, shade(bushC, 0.3));
    put(w * 0.66, 5.4, 4, bushC, shade(bushC, 0.3));
  } else {
    const cx = w * 0.52;
    const wallC = ["#ffe3f3", "#ffd9a0", "#3a3570", "#0a3a46"][themeIdx];
    const roofC = ["#ff6fcf", "#b1538f", "#211c48", "#052226"][themeIdx];
    const litWindow = themeIdx >= 2; // night + undersea get lit/glowing windows (reads nicely dark)
    const windowC = themeIdx === 2 ? "#ffe14d" : "#8bffe0";
    for (let dx = -6; dx <= 6; dx++) {
      const x = ((Math.round(cx) + dx) % w + w) % w;
      const notch = Math.abs(dx) % 3 === 0 ? 0 : 1.6; // crenellation along the top
      extra[x] = 8 + notch;
      color[x] = wallC;
      hi[x] = roofC;
      if (litWindow && Math.abs(dx) !== 0 && Math.abs(dx) % 3 === 1) win[x] = windowC;
    }
    extra[Math.round(cx) % w] += 5; // a little central spire/flag
  }
  return { extra, color, hi, win };
}
/** distant/near candy-HILL ridge, themed: soft rounded gumdrop mountains (two overlapping rows
 * of domes — a hazier back row, a richer front row, both a clear MID-tone — kept less saturated
 * than the platforms and never platform-pink), with a lit rim, a shaded side, hill-top decor
 * (trees/bushes/a tiny distant castle) and one soft dithered streak on the near face */
function ridgeSprite(themeIdx: number, near: boolean): Sprite {
  const { hue, rim } = THEME_RIDGE_HUE[themeIdx];
  // blend toward the sky's own horizon colour for real atmospheric perspective (this correctly
  // lightens hazy hills in a bright sky AND darkens them in a dark one), but keep most of the hue
  // so the hills stay a clear, visible mid-tone rather than washing out
  const skyHorizon = THEME_SKY[themeIdx][2];
  const frontColor = mixHex(skyHorizon, hue, near ? 0.92 : 0.68);
  const backColor = mixHex(skyHorizon, hue, near ? 0.74 : 0.5);
  const rimColor = mixHex(skyHorizon, rim, near ? 0.85 : 0.6);
  const streak = THEME_STREAK[themeIdx];
  const w = RIDGE_W;
  const h = near ? 42 : 30;
  const baseH = near ? 17 : 12;
  const n = near ? 4 : 3;
  const spacing = w / n;
  const backDomes = Array.from({ length: n }, (_, i) => ({
    cx: ((i + 0.5) * spacing + themeIdx * 9) % w,
    r: spacing * 0.78,
    h: baseH + ((i * 37 + themeIdx * 13) % 9),
  }));
  const frontN = Math.max(3, n);
  const frontSpacing = w / frontN;
  const frontDomes = Array.from({ length: frontN }, (_, i) => ({
    cx: ((i + 0.5) * frontSpacing + themeIdx * 5 + spacing * 0.3) % w,
    r: frontSpacing * 0.74,
    h: baseH * 1.4 + ((i * 23 + themeIdx * 17) % 10),
  }));
  const heights = new Array<number>(w);
  const isFront = new Array<boolean>(w);
  for (let x = 0; x < w; x++) {
    const hb = domeHeight(x, backDomes, w);
    const hf = domeHeight(x, frontDomes, w);
    heights[x] = Math.max(hb, hf);
    isFront[x] = hf >= hb;
  }
  const decor = ridgeDecor(themeIdx, near, w);
  const topHeights = heights.map((hh, x) => hh + decor.extra[x]);
  const notchX = Math.round(w * 0.56);
  return bakeRidge(w, h, (x) => topHeights[x], frontColor, {
    rim: rimColor,
    tex: (x, y, depth) => {
      if (decor.extra[x] > 0 && depth < decor.extra[x]) {
        if (decor.win[x] && depth > 2 && depth < decor.extra[x] - 1.5) return decor.win[x];
        return depth < 1.4 ? decor.hi[x] : decor.color[x];
      }
      if (depth < 1) return null; // let the lit rim edge show, same as every other theme
      if (near && Math.abs(x - notchX) <= 2) return bayer(x, y) > 0.5 ? streak[0] : mixHex(streak[0], streak[1], 0.5);
      const base = isFront[x] ? frontColor : backColor;
      if (hash2(x, y, 55 + themeIdx) > 0.93) return shade(base, -0.1);
      const slope = heights[(x + 1) % w] - heights[(x - 1 + w) % w];
      return slope > 0.6 ? shade(base, 0.08) : slope < -0.6 ? shade(base, -0.08) : base;
    },
  });
}
/** a small floating island drifting across the very top strip of sky (kept short so it never
 * overlaps a platform row), candy-topped with a short waterfall/glow streak trailing off one side */
function islandSprite(themeIdx: number): Sprite {
  const w = 34, h = 16;
  const top = [PAL.lime, "#ffb27a", "#8d7dfb", "#45d9c0"][themeIdx];
  const rock = ["#caa6d9", "#8a4f6e", "#201a44", "#06303a"][themeIdx];
  const streak = THEME_STREAK[themeIdx];
  const cx = w / 2;
  return bake(w, h, (x, y) => {
    const topY = 3 + Math.abs(x - cx) * 0.1;
    if (y < topY - 1.6) return null;
    if (y < topY) return shade(top, 0.25);
    if (y < topY + 3) return top;
    const half = cx * 0.92;
    const bodyBottom = 5 + (h - 5) * (1 - Math.min(1, Math.abs(x - cx) / half));
    if (y > bodyBottom) return null;
    if (Math.abs(x - (cx + 5)) <= 1.6 && y > topY + 3) return bayer(x, y) > 0.5 ? streak[0] : streak[1];
    const deep = y - (topY + 3) > (bodyBottom - topY - 3) * 0.6;
    const base = deep ? shade(rock, -0.15) : rock;
    return hash2(x, y, 70 + themeIdx) > 0.88 ? shade(base, -0.2) : base;
  });
}
/** full-screen god rays for the undersea/cave theme — sheared, dithered-edge beams of light,
 * drawn once with low alpha rather than a flat glow dome */
function godRaySprite(): Sprite {
  const beamW = 46, period = 140, shear = 0.35;
  return bake(W, H, (x, y) => {
    const bx = x + y * shear;
    const phase = ((bx % period) + period) % period;
    if (phase >= beamW) return null;
    const edge = Math.min(phase, beamW - phase) / (beamW / 2);
    return edge > bayer(x, y) * 1.15 ? "#bfffe8" : null;
  });
}
/** one platform tile per theme: candy brick, frosted biscuit, gem crystal, coral/cave rock — each
 * a proper 14px-thick BLOCK: a dripping frosting cap, a patterned body, a dark outline edge and a
 * shaded underside. These are deliberately the most saturated, darkest-outlined things baked (the
 * ridge/backdrop colours are all blended toward the sky so the platforms always read on top). */
function platformTile(themeIdx: number): Sprite {
  const w = T, h = 14;
  const dripAt = (x: number) => hash2(Math.floor(x / 3), themeIdx, 301) > 0.5;
  if (themeIdx === 0) {
    const top = "#ffd3ee";
    const base = shade(PAL.pink, 0.04);
    const dark = shade(PAL.pink, -0.4);
    const darker = shade(PAL.pink, -0.55);
    return bake(w, h, (x, y) => {
      if (y <= 1) return y === 0 ? top : shade(top, -0.06);
      if (y === 2 && dripAt(x)) return shade(top, -0.1);
      if (y <= 8) return (x + y) % 9 < 2 ? shade(base, 0.22) : base;
      if (y === 9) return dark;
      return hash2(x, y, 31) > 0.84 ? mixHex(darker, "#ffffff", 0.4) : darker;
    });
  }
  if (themeIdx === 1) {
    const frosting = "#fffaf0";
    const base = "#e8c79a";
    const dark = shade(base, -0.34);
    const darker = shade(base, -0.5);
    const chip = "#4a2c18";
    return bake(w, h, (x, y) => {
      if (y <= 1) return y === 0 ? frosting : mixHex(frosting, base, 0.3);
      if (y === 2 && dripAt(x)) return frosting;
      if (y <= 8) return hash2(x, y, 44) > 0.85 ? chip : base;
      if (y === 9) return dark;
      return hash2(x, y, 45) > 0.8 ? mixHex(darker, "#2a1a0c", 0.4) : darker;
    });
  }
  if (themeIdx === 2) {
    const topC = "#f2ffff";
    const base = "#2fc0da";
    const dark = "#0a5a63";
    const darker = "#052e35";
    return bake(w, h, (x, y) => {
      if (y <= 1) return y === 0 ? topC : shade(topC, -0.08);
      if (y === 2 && dripAt(x)) return shade(topC, -0.1);
      if (y <= 8) {
        const facet = (x * 2 + y * 3) % 10 < 1;
        return facet ? shade(base, 0.4) : base;
      }
      if (y === 9) return dark;
      return hash2(x, y, 61) > 0.85 ? shade(darker, 0.35) : darker;
    });
  }
  const topC = "#bfe8e2";
  const base = "#3f6666";
  const dark = "#1c3030";
  const darker = "#101f1f";
  return bake(w, h, (x, y) => {
    if (y <= 1) return y === 0 ? topC : shade(topC, -0.1);
    if (y === 2 && dripAt(x)) return shade(topC, -0.14);
    if (y <= 8) return hash2(x, y, 73) > 0.88 ? shade(PAL.green, -0.1) : base;
    if (y === 9) return dark;
    return hash2(x, y, 74) > 0.8 ? shade(darker, -0.2) : darker;
  });
}
/** a soft dithered glow core — used for the empty "sparkle" bubbles, echoing the painting's
 * floating white sparkle rather than a flat glow dome */
function sparkSprite(r: number, color: string): Sprite {
  const d = r * 2 + 1;
  return bake(d, d, (x, y) => {
    const dx = x - r;
    const dy = y - r;
    const dist = Math.hypot(dx, dy);
    if (dist < r * 0.3) return "#ffffff";
    if (dist < r && 1 - dist / r > bayer(x, y) * 0.75) return color;
    return null;
  });
}
function fruitSprite(color: string): Sprite {
  const w = 14;
  const hi = shade(color, 0.36);
  const lo = shade(color, -0.3);
  return bake(w, w, (x, y) => {
    if (x >= 6 && x <= 7 && y <= 1) return "#1f9a3f"; // stem
    if (y === 1 && x >= 8 && x <= 11) return "#3ecf55"; // little leaf
    const dx = (x - 6.5) / 5.4;
    const dy = (y - 7.5) / 5.4;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    const light = -dx - dy * 0.7;
    if (light > 0.65) return "#ffffff"; // a bright glossy pinpoint shine
    return light > 0.35 ? hi : light < -0.55 ? lo : color;
  });
}
function pebbleSprite(): Sprite {
  return bake(7, 7, (x, y) => {
    const dx = (x - 3) / 3;
    const dy = (y - 3) / 3;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    const light = -dx - dy;
    return light > 0.4 ? "#c9a876" : light < -0.5 ? shade(PAL.brown, -0.3) : PAL.brown;
  });
}
/** a small drifting balloon (sunset theme's bit of life in the sky), with a string and a glossy
 * highlight */
function balloonSprite(color: string): Sprite {
  const w = 7, h = 10;
  return bake(w, h, (x, y) => {
    if (y >= 7) return x === 3 && y < 9 ? "#5a4530" : null; // a thin string
    const dx = (x - 3) / 3, dy = (y - 3.2) / 3.6;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    const light = -dx - dy * 0.6;
    return light > 0.5 ? shade(color, 0.4) : light < -0.4 ? shade(color, -0.22) : color;
  });
}
/** a tiny swimming fish (the undersea theme's bit of life), a round body, a tail fin and an eye */
function fishSprite(color: string): Sprite {
  const w = 9, h = 5;
  return bake(w, h, (x, y) => {
    if (x <= 1) return Math.abs(y - 2) <= 1 - x * 0.6 ? shade(color, -0.25) : null;
    const dx = (x - 5.2) / 3, dy = (y - 2) / 2;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (x === 7 && y === 1) return "#140c28"; // eye
    const light = -dx - dy * 0.5;
    return light > 0.4 ? shade(color, 0.32) : color;
  });
}
function makeArt() {
  const idx = Array.from({ length: THEME_COUNT }, (_, i) => i);
  return {
    skies: THEME_SKY.map((s) => skyStrip(s)),
    orbs: idx.map((i) => orbSprite(i)),
    ridgesFar: idx.map((i) => ridgeSprite(i, false)),
    ridgesNear: idx.map((i) => ridgeSprite(i, true)),
    islands: idx.map((i) => islandSprite(i)),
    grounds: idx.map((i) => groundStrip(i)),
    plats: idx.map((i) => platformTile(i)),
    cloudNearA: cloudPuff(46, 20, false),
    cloudNearB: cloudPuff(36, 17, false),
    cloudFar: cloudPuff(38, 16, true),
    cloudWarmA: cloudPuff(46, 20, false, "#ffcf9e"),
    cloudWarmB: cloudPuff(36, 17, true, "#ffcf9e"),
    mistFar: cloudPuff(38, 16, true, "#241a4a", 0.82),
    mistNear: cloudPuff(46, 20, false, "#241a4a", 0.78),
    stars: starStrip(),
    ambBubbleSmall: sparkSprite(3, "#bfffe8"),
    ambBubbleBig: sparkSprite(5, "#9bf5e0"),
    godRay: godRaySprite(),
    sparkWhite: sparkSprite(7, "#dff3ff"),
    fruit: FRUIT_COLORS.map((c) => fruitSprite(c)),
    pebble: pebbleSprite(),
    balloons: ["#ff6a6a", "#ffd24a", "#5ef2ff"].map((c) => balloonSprite(c)),
    fish: ["#ffb347", "#5ef2ff"].map((c) => fishSprite(c)),
  };
}
let A: ReturnType<typeof makeArt> | null = null;
const art = () => (A ??= makeArt());

interface Hero {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  coyote: number;
  buffer: number;
  jumping: boolean;
  anim: number;
  blowT: number;
  blowCd: number;
  inv: number;
}
interface Critter {
  kind: CritterKind;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 1 | -1;
  spd: number;
  vy: number;
  onGround: boolean;
  angry: boolean;
  t: number;
  jumpT?: number;
  baseY?: number;
  sway?: number;
  shootT?: number;
}
interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  state: "fly" | "drift" | "trapped";
  t: number;
  sway: number;
  kind?: CritterKind;
  angry?: boolean;
  dead: boolean;
}
interface Fruit {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  t: number;
  kind: number;
  dead: boolean;
}
interface Projectile {
  x: number;
  y: number;
  vx: number;
  t: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface Pop {
  x: number;
  y: number;
  t: number;
  text: string;
}
interface Seg {
  x1: number;
  x2: number;
  y: number;
}

// ── pure helpers (grid, wrap, physics) ──

function platformsOf(grid: string[]): Seg[] {
  const segs: Seg[] = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      if (grid[r][c] === "#") {
        let c2 = c;
        while (c2 < COLS && grid[r][c2] === "#") c2++;
        segs.push({ x1: c * T, x2: c2 * T, y: r * T });
        c = c2;
      } else c++;
    }
  }
  return segs;
}
const mod = (v: number, m: number) => ((v % m) + m) % m;
const wrapCol = (x: number) => (((Math.floor(x / T) % COLS) + COLS) % COLS);
function wrapLeft(e: { x: number; w: number }) {
  if (e.x + e.w < 0) e.x += W;
  else if (e.x > W) e.x -= W;
}
function wrapCenter(e: { x: number }, margin: number) {
  if (e.x < -margin) e.x += W;
  else if (e.x > W + margin) e.x -= W;
}
function wrapYBox(e: { y: number; h: number }) {
  if (e.y > H) e.y = -e.h + 2;
}
/** One-way platform landing: falling onto a "#" row lands on it; jumping up (dy<0) passes
 * straight through, which is how the hero (and critters) hop up through floors from below. */
function landOn<E extends { x: number; y: number; w: number; h: number }>(e: E, dy: number, grid: string[]): 0 | 1 {
  const prevBottom = e.y + e.h;
  e.y += dy;
  if (dy < 0) return 0;
  const bottom = e.y + e.h;
  const row = Math.floor(bottom / T);
  if (row < 0 || row >= ROWS || prevBottom > row * T + 2) return 0;
  const c1 = wrapCol(e.x + 2);
  const c2 = wrapCol(e.x + e.w - 2);
  if (grid[row][c1] === "#" || grid[row][c2] === "#") {
    e.y = row * T - e.h;
    return 1;
  }
  return 0;
}
function typesForRound(round: number): CritterKind[] {
  if (round <= 2) return ["walker"];
  if (round <= 4) return ["walker", "jumper"];
  if (round <= 7) return ["walker", "jumper", "flyer"];
  return ["walker", "jumper", "flyer", "thrower"];
}
function spawnCritter(kind: CritterKind, x: number, y: number, angry: boolean, speedMul: number, r: Rng): Critter {
  const base = kind === "walker" ? 0.55 : kind === "jumper" ? 0.5 : kind === "flyer" ? 0.8 : 0.32;
  const [w, h] = CRITTER_DIMS[kind];
  const c: Critter = { kind, x, y, w, h, dir: r.chance(0.5) ? 1 : -1, spd: base * speedMul, vy: 0, onGround: false, angry, t: 0 };
  if (kind === "jumper") c.jumpT = r.int(40, 90);
  if (kind === "flyer") {
    c.baseY = y;
    c.sway = r.range(0, 10);
  }
  if (kind === "thrower") c.shootT = r.int(90, 170);
  return c;
}
const bubbleBox = (b: Bubble) => ({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 });
const projBox = (p: Projectile) => ({ x: p.x - 3, y: p.y - 3, w: 6, h: 6 });
/** a smaller box of the given size, centred inside a bigger entity's footprint */
const centeredBox = (e: { x: number; y: number; w: number; h: number }, w: number, h: number) => ({
  x: e.x + (e.w - w) / 2,
  y: e.y + (e.h - h) / 2,
  w,
  h,
});

/** three small pixel-staircase points across the top of a round head/body — the little spiky
 * crown every buddy in the painting wears, instead of plain round ear nubs */
function crownSpikes(g: Gfx, cx: number, topY: number, r: number, color: string) {
  const dk = shade(color, -0.22);
  for (const ox of [-r * 0.55, 0, r * 0.55]) {
    const x = cx + ox;
    g.rect(x - 1.5, topY, 3, 1.4, color);
    g.rect(x - 1, topY + 1.3, 2, 1.3, color);
    g.rect(x - 0.5, topY + 2.5, 1, 1.4, dk);
  }
}
/** the painting's big round eye with a small square black pupil, not a soft circular dot */
function bigEye(g: Gfx, x: number, y: number, r: number, pupilDx: number) {
  g.circle(x, y, r, PAL.white);
  const pw = r * 0.62;
  g.rect(x - pw / 2 + pupilDx, y - pw / 2, pw, pw, PAL.black);
}

/** A trapped/angry critter, chubby and round with a little spike crown — bigger and shinier
 * than the original 10px dots, with a dark silhouette behind for a readable 1px-style outline. */
function drawCritter(g: Gfx, c: Critter) {
  const col = c.angry ? PAL.red : KIND_COLOR[c.kind];
  const dark = c.angry ? "#7a1c28" : KIND_DARK[c.kind];
  const hi = shade(col, 0.32);
  const r = CRITTER_R[c.kind];
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2 - (c.kind === "flyer" ? 0 : 1);

  if (c.kind === "flyer") {
    const wing = Math.sin(c.t * 0.3) * 3;
    g.circle(cx - 7, cy - wing, 5, OUTLINE);
    g.circle(cx + 7, cy - wing, 5, OUTLINE);
    g.circle(cx, cy, r + 1.3, OUTLINE);
    g.circle(cx - 7, cy - wing, 3.8, hi);
    g.circle(cx + 7, cy - wing, 3.8, hi);
  } else {
    g.circle(cx, cy, r + 1.3, OUTLINE);
  }

  // limbs, drawn before the body so it overlaps their tops like a real socket
  if (c.kind === "walker") {
    const leg = Math.sin(c.t * 0.4) * 2;
    g.rect(cx - 4, cy + r - 2, 3, 3 + Math.max(0, leg), dark);
    g.rect(cx + 1, cy + r - 2, 3, 3 + Math.max(0, -leg), dark);
  } else if (c.kind === "jumper") {
    const squat = c.onGround && (c.jumpT ?? 99) > 44 ? 1.4 : 0.75;
    g.rect(cx - 4, cy + r - 2, 3, 3 * squat, dark);
    g.rect(cx + 1, cy + r - 2, 3, 3 * squat, dark);
  } else if (c.kind === "thrower") {
    g.rect(cx - 3, cy + r - 2, 3, 3, dark);
    g.rect(cx + 1, cy + r - 2, 3, 3, dark);
    const armX = c.dir > 0 ? cx + r - 1 : cx - r - 5;
    g.rect(armX, cy - 1, 6, 2.4, dark);
    g.circle(c.dir > 0 ? armX + 7 : armX - 1, cy, 2, "#c9a876");
  }

  if (c.kind !== "flyer") crownSpikes(g, cx, cy - r - 1, r, col);

  // body + glossy highlight
  g.circle(cx, cy, r, col);
  g.circle(cx - r * 0.35, cy - r * 0.35, r * 0.42, hi);

  // a little wind-up key on the back — every critter is a wind-up toy
  if (c.kind !== "flyer") {
    const keyX = cx - c.dir * r * 0.7;
    const spin = Math.floor(c.t * 0.15) % 2 === 0;
    g.rect(keyX - 1, cy - r * 0.6, 2, 3.2, "#8a8a9a");
    g.rect(keyX - (spin ? 1.6 : 0.2), cy - r * 0.6 - 1.6, spin ? 3.2 : 0.4, 1.6, "#bcbccb");
    g.rect(keyX - (spin ? 0.2 : 1.6), cy - r * 0.6 - 0.2, spin ? 0.4 : 3.2, 1.6, "#bcbccb");
  }

  // eyes
  const eyeY = cy - r * 0.08;
  bigEye(g, cx - r * 0.34, eyeY, r * 0.4, 0.4);
  bigEye(g, cx + r * 0.34, eyeY, r * 0.4, 0.4);
}

/** three small dorsal spines along the hero's back (opposite the facing side) — the painting's
 * baby-dino silhouette reads "dino" mostly from this ridge */
function backSpines(g: Gfx, cx: number, cy: number, r: number, dir: 1 | -1, color: string) {
  const dk = shade(color, -0.25);
  const bx = cx - dir * r * 0.6;
  for (let i = 0; i < 3; i++) {
    const yy = cy - r * 0.75 + (i / 2) * r * 1.2;
    g.rect(bx - 1.6, yy - 0.5, 3.2, 2.6, dk);
    g.rect(bx - 1.1, yy - 1.8, 2.2, 1.8, color);
  }
}

/** Bubblo, the chubby baby dino hero — a bigger body (to match the painting's proportions), back
 * spikes, a belly patch, a big friendly eye, a dark outline silhouette, a walk cycle and a bit of
 * squash/stretch on jumps, landings and the blow pose. */
function drawHero(g: Gfx, hero: Hero) {
  const dir = hero.facing;
  const cx = hero.x + hero.w / 2;
  const bodyCy = hero.y + hero.h / 2 + 2;
  const legSwing = hero.onGround && Math.abs(hero.vx) > 0.1 ? Math.sin(hero.anim * 2) : 0;
  const squashY = hero.vy < -1.5 ? 0.84 : hero.vy > 2.2 ? 1.16 : 1;
  const bodyR = 9.4;
  const headR = 7.6;
  const headX = cx + dir * 7.5;
  const headY = hero.y + 7.5;

  // outline silhouette behind body + head
  g.circle(cx, bodyCy, bodyR * squashY + 1.5, OUTLINE);
  g.circle(headX, headY, headR + 1.3, OUTLINE);

  // legs + tail, overlapped by the body on top
  const legY = hero.y + hero.h - 5;
  g.rect(cx - 6, legY, 4.2, legSwing > 0.15 ? 6.5 : 4.2, shade(PAL.green, -0.35));
  g.rect(cx + 2, legY, 4.2, legSwing < -0.15 ? 6.5 : 4.2, shade(PAL.green, -0.35));
  g.circle(cx - dir * 9.5, bodyCy + 2.5, 3.3, shade(PAL.green, -0.12));

  // the back spine ridge, drawn before the body so it reads as rooted in the silhouette
  backSpines(g, cx, bodyCy, bodyR, dir, PAL.orange);

  // body + a soft belly patch + head
  g.circle(cx, bodyCy, bodyR * squashY, PAL.green);
  g.circle(cx - dir * 1.8, bodyCy - 1.8, bodyR * 0.56, shade(PAL.green, 0.3));
  g.circle(cx - dir * 0.6, bodyCy + bodyR * 0.46, bodyR * 0.5, PAL.lime);
  g.circle(headX, headY, headR, PAL.green);
  g.circle(headX - dir * 1.8, headY - 1.8, headR * 0.5, shade(PAL.green, 0.32));
  crownSpikes(g, headX, headY - headR - 1, headR * 0.85, PAL.orange);

  // puffed cheek when blowing, drawn under the eye so it peeks out from behind it
  if (hero.blowT > 0) g.circle(headX + dir * headR * 0.55, headY + headR * 0.35, 2.6, shade(PAL.green, 0.22));

  // one big friendly eye, like every buddy in the park
  bigEye(g, headX + dir * 2.9, headY - 0.7, 3.6, dir * 0.6);

  if (hero.blowT > 0) {
    const k = 1 - hero.blowT / 14;
    const bubR = 1.8 + k * 6;
    const bx = headX + dir * (headR + 2 + bubR);
    g.alpha(0.55);
    g.circle(bx, headY + 2, bubR, PAL.cyan);
    g.alpha(1);
    g.circle(bx - dir * 1.8, headY + 0.5, 1.2, PAL.white);
  }
}

function create(seed: number): GameInstance {
  const rnd = rng(seed);
  let tick = 0;
  let lives = 3;
  let round = 1;
  let over = false;
  let won = false;
  let state: "ready" | "play" | "dead" | "clear" = "ready";
  let stateT = 0;
  let grid: string[] = LAYOUTS[0];
  let spawnX = 40;
  let spawnY = (ROWS - 1) * T - HH;
  let roundSpeedMul = 1;
  let hurried = false;
  let hurryBanner = 0;
  let roundTimer = 0;
  let chain = 1;
  let lastPop = -999;

  const hero: Hero = { x: spawnX, y: spawnY, w: HW, h: HH, vx: 0, vy: 0, facing: 1, onGround: false, coyote: 0, buffer: 0, jumping: false, anim: 0, blowT: 0, blowCd: 0, inv: 0 };
  let critters: Critter[] = [];
  let bubbles: Bubble[] = [];
  let fruits: Fruit[] = [];
  let projectiles: Projectile[] = [];
  let parts: Part[] = [];
  let pops: Pop[] = [];
  let rings: { x: number; y: number; t: number }[] = [];

  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 0.6, life: 24, color });
    }
  };
  const popText = (x: number, y: number, text: string) => pops.push({ x, y, t: 0, text });
  const popRing = (x: number, y: number) => rings.push({ x, y, t: 0 });
  const trapLifetime = () => (hurried ? 340 : 560);

  const setupRound = (n: number) => {
    round = n;
    const li = (round - 1) % LAYOUTS.length;
    grid = LAYOUTS[li];
    spawnX = STARTS[li];
    spawnY = (ROWS - 1) * T - HH;
    hero.x = spawnX;
    hero.y = spawnY;
    hero.vx = 0;
    hero.vy = 0;
    hero.onGround = false;
    hero.facing = 1;
    hero.blowCd = 0;
    hero.blowT = 0;
    hero.inv = 60;
    roundSpeedMul = 1 + (round - 1) * 0.035;
    const segs = platformsOf(grid);
    const types = typesForRound(round);
    const count = Math.min(3 + round, 10);
    critters = [];
    for (let i = 0; i < count; i++) {
      const seg = rnd.pick(segs);
      const kind = rnd.pick(types);
      const hi = Math.max(seg.x1 + 2, seg.x2 - 16);
      const x = rnd.range(seg.x1 + 2, hi);
      // the original fixed -12 offset, not the (bigger) drawn height: a flyer's hover baseline
      // is captured from this y on its first update, so this must match the original exactly
      // or critters would reach higher/lower than before
      critters.push(spawnCritter(kind, x, seg.y - 12, false, roundSpeedMul, rnd));
    }
    bubbles = [];
    fruits = [];
    projectiles = [];
    chain = 1;
    lastPop = -999;
    hurried = false;
    hurryBanner = 0;
    roundTimer = 0;
    state = "ready";
    stateT = 0;
  };
  setupRound(1);

  const spawnBubble = (): Bubble => ({
    x: hero.x + (hero.facing > 0 ? hero.w + 2 : -2),
    y: hero.y + 4,
    vx: hero.facing * 2.3,
    vy: 0,
    r: 9,
    state: "fly",
    t: 0,
    sway: rnd.range(0, 10),
    dead: false,
  });
  const spawnFruit = (x: number, y: number): Fruit => ({ x: x - 5, y: y - 5, w: 10, h: 10, vy: -1.2, t: 0, kind: rnd.int(0, FRUIT_COLORS.length - 1), dead: false });

  const hurt = (io: IO) => {
    if (hero.inv > 0 || state !== "play") return;
    lives--;
    io.sfx.play(lives <= 0 ? "die" : "hurt");
    burst(hero.x + hero.w / 2, hero.y + hero.h / 2, PAL.red, 10);
    if (lives <= 0) {
      state = "dead";
      stateT = 0;
    } else {
      hero.x = spawnX;
      hero.y = spawnY;
      hero.vx = 0;
      hero.vy = 0;
      hero.onGround = false;
      hero.inv = 100;
    }
  };

  const updateHero = (io: IO) => {
    const inp = io.input;
    if (inp.held.left && !inp.held.right) {
      hero.vx = Math.max(-WALK, hero.vx - 0.3);
      hero.facing = -1;
    } else if (inp.held.right && !inp.held.left) {
      hero.vx = Math.min(WALK, hero.vx + 0.3);
      hero.facing = 1;
    } else {
      hero.vx *= 0.78;
      if (Math.abs(hero.vx) < 0.05) hero.vx = 0;
    }
    hero.x += hero.vx;
    wrapLeft(hero);
    hero.anim += Math.abs(hero.vx) * 0.15;
    if (hero.onGround && Math.abs(hero.vx) > 0.4 && tick % 14 === 0) io.sfx.play("step");

    hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
    hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
    if (hero.buffer > 0 && hero.coyote > 0) {
      hero.vy = -5.3;
      hero.buffer = 0;
      hero.coyote = 0;
      hero.onGround = false;
      hero.jumping = true;
      io.sfx.play("jump");
    }
    if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
    hero.vy = Math.min(MAXFALL, hero.vy + GRAV);
    const landed = landOn(hero, hero.vy, grid);
    if (landed === 1) {
      hero.vy = 0;
      hero.onGround = true;
      hero.jumping = false;
    } else hero.onGround = false;
    wrapYBox(hero);
    if (hero.y < 0) {
      hero.y = 0;
      if (hero.vy < 0) hero.vy = 0;
    }

    hero.blowCd = Math.max(0, hero.blowCd - 1);
    hero.blowT = Math.max(0, hero.blowT - 1);
    const blown = bubbles.filter((b) => !b.dead && b.state !== "trapped").length;
    if (inp.pressed.b && hero.blowCd === 0 && blown < MAX_BUBBLES) {
      bubbles.push(spawnBubble());
      hero.blowCd = 22;
      hero.blowT = 14;
      io.sfx.play("shoot");
    }
    hero.inv = Math.max(0, hero.inv - 1);
  };

  const updateCritters = (io: IO) => {
    for (const c of critters) {
      c.t++;
      const spd = c.spd * (c.angry ? 1.6 : 1) * (hurried ? 1.35 : 1);
      if (c.kind === "flyer") {
        c.baseY = c.baseY ?? c.y;
        c.y = clamp(c.baseY + Math.sin((tick + (c.sway ?? 0)) * 0.06) * 10, 10, H - 24);
        c.x += c.dir * spd;
        wrapLeft(c);
        if (rnd.chance(0.006)) c.dir = (-c.dir) as 1 | -1;
        continue;
      }
      c.vy = Math.min(MAXFALL, c.vy + GRAV);
      const landed = landOn(c, c.vy, grid);
      if (landed === 1) {
        c.vy = 0;
        c.onGround = true;
      } else c.onGround = false;
      wrapYBox(c);
      if (c.onGround) {
        const aheadX = c.x + (c.dir > 0 ? c.w + 2 : -2);
        const col = wrapCol(aheadX);
        const rowBelow = Math.floor((c.y + c.h + 2) / T);
        if (rowBelow >= ROWS || grid[rowBelow][col] !== "#") c.dir = (-c.dir) as 1 | -1;
      }
      if (c.kind === "jumper") {
        c.jumpT = (c.jumpT ?? 0) - 1;
        if (c.onGround && c.jumpT <= 0) {
          c.vy = -4.3;
          c.jumpT = rnd.int(50, 110);
        }
      }
      const moveSpd = c.kind === "thrower" ? spd * 0.4 : spd;
      c.x += c.dir * moveSpd;
      wrapLeft(c);
      if (c.kind === "thrower") {
        c.shootT = (c.shootT ?? 0) - 1;
        if (c.shootT <= 0) {
          const dir: 1 | -1 = hero.x < c.x ? -1 : 1;
          projectiles.push({ x: c.x + (dir > 0 ? c.w : 0), y: c.y + c.h / 2, vx: dir * 1.7, t: 0 });
          io.sfx.play("zap");
          c.shootT = Math.round(rnd.int(110, 190) / (c.angry ? 1.4 : 1));
        }
      }
    }
  };

  const updateProjectiles = () => {
    for (const p of projectiles) {
      p.x += p.vx;
      wrapCenter(p, 4);
      p.t++;
    }
    projectiles = projectiles.filter((p) => p.t < 240);
  };

  const updateBubbles = (io: IO) => {
    for (const b of bubbles) {
      if (b.dead) continue;
      b.t++;
      if (b.state === "fly") {
        b.x += b.vx;
        wrapCenter(b, b.r);
        for (const c of critters) {
          if (overlap(bubbleBox(b), c)) {
            b.state = "trapped";
            b.kind = c.kind;
            b.angry = c.angry;
            b.vx = 0;
            b.vy = -0.25;
            critters.splice(critters.indexOf(c), 1);
            break;
          }
        }
        if (b.state === "fly" && b.t > BUBBLE_FLY_FRAMES) b.state = "drift";
      } else {
        const wasBelow = b.y > 22.01;
        b.vy = Math.max(-0.8, b.vy - 0.02);
        b.y += b.vy;
        b.x += Math.sin((tick + b.sway) * 0.05) * 0.4;
        wrapCenter(b, b.r);
        if (b.y < 22) {
          b.y = 22;
          b.vy = 0;
          if (wasBelow) io.sfx.play("blip");
        }
        if (b.state === "drift" && b.t > BUBBLE_FLY_FRAMES + DRIFT_LIFE) b.dead = true;
        if (b.state === "trapped" && b.t > trapLifetime()) {
          // the original fixed offsets (not the bigger drawn size) — same reach-safety reason
          // as the round-start spawn above
          io.sfx.play("whoosh");
          critters.push(spawnCritter(b.kind!, b.x - 6, b.y - 5, true, roundSpeedMul, rnd));
          b.dead = true;
        }
      }
    }
    bubbles = bubbles.filter((b) => !b.dead);
  };

  const updateFruit = () => {
    for (const f of fruits) {
      f.t++;
      f.vy = Math.min(MAXFALL, f.vy + GRAV * 0.7);
      const landed = landOn(f, f.vy, grid);
      if (landed === 1) f.vy = 0;
      wrapYBox(f);
      // a little shine sparkle while it bobs, waiting to be collected
      if (f.t % 47 === 0) parts.push({ x: f.x + 5, y: f.y + 3, vx: 0, vy: -0.35, life: 16, color: PAL.white });
    }
    fruits = fruits.filter((f) => !f.dead && f.t < FRUIT_LIFE);
  };

  const hurtCheck = (io: IO) => {
    if (hero.inv > 0 || state !== "play") return;
    const heroBox = centeredBox(hero, HURT_W, HURT_H);
    for (const c of critters) {
      if (overlap(heroBox, centeredBox(c, ...CRITTER_HURT_DIMS[c.kind]))) return hurt(io);
    }
    for (const p of projectiles) {
      if (overlap(heroBox, projBox(p))) return hurt(io);
    }
  };
  const bubbleCheck = (io: IO) => {
    if (state !== "play") return;
    for (const b of bubbles) {
      if (!overlap(hero, bubbleBox(b))) continue;
      if (b.state === "trapped") {
        io.sfx.play("pop");
        chain = tick - lastPop < CHAIN_WINDOW ? Math.min(chain + 1, 8) : 1;
        if (chain > 1) io.sfx.slide?.(380 + chain * 70, 820 + chain * 70, 0.14, "square", 0.35);
        fruits.push(spawnFruit(b.x, b.y));
        popRing(b.x, b.y);
        burst(b.x, b.y, PAL.cyan, 7);
        lastPop = tick;
        io.score(10 * chain);
        popText(b.x, b.y - 10, `+${10 * chain}`);
        b.dead = true;
      } else if (io.input.held.a && hero.vy > 0.4 && hero.y + hero.h - hero.vy <= b.y + 2) {
        hero.vy = -5.6;
        hero.onGround = false;
        hero.jumping = false;
        io.sfx.play("bounce");
      }
    }
    bubbles = bubbles.filter((b) => !b.dead);
  };
  const fruitCheck = (io: IO) => {
    for (const f of fruits) {
      if (f.dead || !overlap(hero, f)) continue;
      io.sfx.play("pickup");
      const pts = FRUIT_BASE * chain;
      io.score(pts);
      popText(f.x, f.y - 8, `+${pts}`);
      f.dead = true;
    }
  };
  const checkClear = (io: IO) => {
    if (state !== "play") return;
    if (critters.length === 0 && bubbles.every((b) => b.state !== "trapped")) {
      state = "clear";
      stateT = 0;
      io.sfx.play("win");
      io.score(300 + lives * 50);
    }
  };

  return {
    update(io) {
      if (over || won) return;
      tick++;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life--;
      }
      parts = parts.filter((p) => p.life > 0);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 36);
      for (const r of rings) r.t++;
      rings = rings.filter((r) => r.t < 16);
      hurryBanner = Math.max(0, hurryBanner - 1);

      if (state === "ready") {
        stateT++;
        if (stateT > 80) {
          state = "play";
          stateT = 0;
        }
        return;
      }
      if (state === "dead") {
        stateT++;
        if (stateT > 90) {
          over = true;
          io.gameOver();
        }
        return;
      }
      if (state === "clear") {
        stateT++;
        if (stateT > 130) {
          if (round >= TOTAL_ROUNDS) {
            won = true;
            io.score(lives * 500);
            io.win();
            return;
          }
          setupRound(round + 1);
        }
        return;
      }

      roundTimer++;
      if (!hurried && roundTimer > HURRY_AT) {
        hurried = true;
        hurryBanner = 150;
      }

      updateHero(io);
      updateCritters(io);
      updateProjectiles();
      updateBubbles(io);
      updateFruit();
      hurtCheck(io);
      bubbleCheck(io);
      fruitCheck(io);
      checkClear(io);
    },

    draw(g: Gfx) {
      const a = art();
      const themeIdx = (round - 1) % THEME_COUNT;

      // sky: a 3-stop dithered gradient (never a flat fill), tiled from a 4px strip
      for (let x = 0; x < W; x += DITHER_W) g.sprite(a.skies[themeIdx], x, 0);

      // undersea/cave: soft sheared god-rays instead of a sun, drawn once at low alpha
      if (themeIdx === 3) {
        g.alpha(0.16);
        g.sprite(a.godRay, 0, 0);
        g.alpha(1);
      }

      // the sun / moon / glow — a small disc, tucked in a top corner (just below the HUD bar) so
      // it never competes with the playfield
      const orbX = themeIdx === 3 ? 150 : themeIdx === 1 ? 188 : 22;
      g.sprite(a.orbs[themeIdx], orbX - 13, 15);

      // two rows of soft, rounded candy hills on the horizon — kept low (lower ~40% of the
      // screen only) and blended toward the sky colour (atmospheric perspective), so they never
      // compete with the saturated platforms sitting in front of them
      drawStrip(g, a.ridgesFar[themeIdx], tick * 0.018, 150);
      drawStrip(g, a.ridgesNear[themeIdx], tick * 0.05, 172);

      // a floating island (with its own little waterfall) drifting at a fixed altitude every one
      // of the four single-screen layouts keeps entirely free of platforms (row 7 of 14), so it
      // never overlaps the playfield
      for (let i = 0; i < 2; i++) {
        const w = 34;
        const x = mod(i * 170 + 60 - tick * (0.03 + i * 0.012), W + w) - w;
        g.sprite(a.islands[themeIdx], x, 112);
      }

      // the ambient foreground layer: 2 depths of clouds (day/sunset/night-as-mist) or rising
      // bubbles (undersea, 2 sizes/speeds) — every theme gets a small-far + big-near pair
      if (themeIdx === 0 || themeIdx === 1) {
        const warm = themeIdx === 1;
        const far = warm ? a.cloudWarmB : a.cloudFar;
        const nearA = warm ? a.cloudWarmA : a.cloudNearA;
        const nearB = warm ? a.cloudWarmB : a.cloudNearB;
        for (let i = 0; i < 2; i++) {
          const w = 38;
          const x = mod(i * 150 + 40 - tick * 0.045, W + w) - w;
          g.sprite(far, x, 16 + (i % 2) * 20);
        }
        for (let i = 0; i < 3; i++) {
          const cloud = i % 2 === 0 ? nearA : nearB;
          const w = i % 2 === 0 ? 46 : 36;
          const x = mod(i * 160 + 90 - tick * 0.1, W + w) - w;
          g.sprite(cloud, x, 15 + (i % 2) * 18);
        }
      } else if (themeIdx === 2) {
        drawStrip(g, a.stars, tick * 0.01, 14);
        drawStrip(g, a.stars, tick * 0.022, 56);
        g.alpha(0.5);
        for (let i = 0; i < 2; i++) {
          const w = 38;
          const x = mod(i * 150 + 40 - tick * 0.03, W + w) - w;
          g.sprite(a.mistFar, x, 20 + (i % 2) * 16);
        }
        for (let i = 0; i < 2; i++) {
          const w = 46;
          const x = mod(i * 170 + 90 - tick * 0.06, W + w) - w;
          g.sprite(a.mistNear, x, 18 + (i % 2) * 20);
        }
        g.alpha(1);
      } else {
        for (let i = 0; i < 4; i++) {
          const y = mod(H - 20 - (tick * 0.35 + i * 51), H - 40) + 20;
          const x = 20 + i * 58 + Math.sin((tick + i * 23) * 0.025) * 7;
          g.alpha(0.5);
          g.sprite(a.ambBubbleSmall, x - 3, y - 3);
          g.alpha(1);
        }
        for (let i = 0; i < 2; i++) {
          const y = mod(H - 30 - (tick * 0.6 + i * 80), H - 40) + 20;
          const x = 60 + i * 120 + Math.sin((tick + i * 40) * 0.02) * 9;
          g.alpha(0.55);
          g.sprite(a.ambBubbleBig, x - 5, y - 5);
          g.alpha(1);
        }
      }

      // a little life drifting through every sky: birds (day), balloons (sunset), bats (night),
      // fish (undersea) — the same slow parallax loop as the clouds/bubbles above, re-themed
      for (let i = 0; i < 3; i++) {
        const w = 10;
        const x = mod(i * 95 + 30 - tick * (0.5 + i * 0.07), W + w) - w;
        const y = 26 + i * 12 + Math.sin((tick + i * 33) * 0.05) * 4;
        if (themeIdx === 0 || themeIdx === 2) {
          // a bird (day) or bat (night) drawn as two flapping wing strokes
          const flap = Math.floor(tick / 10 + i) % 2 === 0;
          const col = themeIdx === 0 ? "#2a3a66" : "#15102e";
          const wingY = flap ? y - 2 : y + 1;
          g.line(x, y, x + 3, wingY, col);
          g.line(x + 3, wingY, x + 6, y, col);
          if (themeIdx === 2) {
            g.line(x + 1, y - 1, x + 3, wingY - 1, col);
            g.line(x + 3, wingY - 1, x + 5, y - 1, col);
          }
        } else if (themeIdx === 1) {
          g.sprite(a.balloons[i % a.balloons.length], x - 3, y - 4);
        } else {
          g.sprite(a.fish[i % a.fish.length], x - 4, y - 2, { flipX: Math.sin(i) > 0 });
        }
      }

      // the pale, shimmering horizon band
      for (let x = 0; x < W; x += 32) g.sprite(a.grounds[themeIdx], x, H - 28);

      // platforms: a baked themed BLOCK per cell (candy brick / frosted biscuit / gem crystal /
      // coral rock) — a dripping frosting cap, a patterned body, a dark outline and a soft cast
      // shadow in the gap below, the most saturated and darkest-outlined things in the scene
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] !== "#") continue;
          g.alpha(0.22);
          g.rect(c * T + 1, r * T + 14, T - 2, 2, "#000000");
          g.alpha(1);
          g.sprite(a.plats[themeIdx], c * T, r * T);
        }
      }

      // fruit (a baked little candy fruit with a stem + leaf, bobbing gently)
      for (const f of fruits) {
        const bob = Math.sin((f.t + f.x) * 0.18) * 1.3;
        g.sprite(a.fruit[f.kind], f.x - 2, f.y - 2 + bob);
      }

      // bubbles: a soft rim-lit soap bubble; empty ones carry the painting's white sparkle,
      // trapped ones glow with the critter's own colour inside, visibly struggling to get free
      for (const b of bubbles) {
        const wob = Math.sin((tick + b.sway) * 0.15);
        const rr = b.r + wob;
        g.alpha(0.4);
        g.circle(b.x, b.y, rr + 1, "#ffffff");
        g.alpha(1);
        g.alpha(0.3);
        g.circle(b.x, b.y, rr, PAL.cyan);
        g.alpha(1);
        if (b.state === "trapped" && b.kind) {
          const col = b.angry ? PAL.red : KIND_COLOR[b.kind];
          const strugX = Math.sin((tick + b.t * 3) * 0.3) * 1.4;
          const strugY = Math.cos((tick + b.t * 2) * 0.26) * 1.1;
          g.circle(b.x + strugX, b.y + strugY, 4.4, col);
          g.circle(b.x - 1 + strugX, b.y - 1 + strugY, 1.6, shade(col, 0.32));
          if (tick % 10 < 2) {
            g.line(b.x - rr + 1, b.y - 2, b.x - rr - 2, b.y - 4, "#ffffff");
            g.line(b.x + rr - 1, b.y - 2, b.x + rr + 2, b.y - 4, "#ffffff");
          }
        } else {
          g.sprite(a.sparkWhite, b.x - 4, b.y - 4);
        }
      }

      // pop rings: a soft fading ring where a bubble just burst
      for (const r of rings) {
        const k = r.t / 16;
        g.alpha(Math.max(0, 0.55 * (1 - k)));
        g.circle(r.x, r.y, 4 + k * 16, "#ffffff");
        g.alpha(1);
      }

      for (const c of critters) drawCritter(g, c);

      // thrown pebbles, with a faint motion trail
      for (const p of projectiles) {
        g.alpha(0.35);
        g.sprite(a.pebble, p.x - 3.5 - Math.sign(p.vx) * 3, p.y - 3.5);
        g.alpha(1);
        g.sprite(a.pebble, p.x - 3.5, p.y - 3.5);
      }

      // hero — Bubblo, the chubby baby dino
      const blink = hero.inv > 0 && Math.floor(hero.inv / 4) % 2 === 1;
      if (!blink) drawHero(g, hero);

      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.5, PAL.white);

      // HUD — a small framed instrument panel with a lit top rim and corner studs
      g.rect(0, 0, W, 13, "#141233");
      g.rect(0, 0, W, 1, shade("#141233", 0.3));
      g.rect(0, 13, W, 1, OUTLINE);
      g.rect(0, 14, W, 1, "rgba(255,255,255,0.12)");
      g.circle(3, 6, 1.2, PAL.cyan);
      g.circle(W - 3, 6, 1.2, PAL.cyan);
      for (let i = 0; i < lives; i++) g.text("♥", 8 + i * 9, 3, PAL.red);
      const left = critters.length + bubbles.filter((b) => b.state === "trapped").length;
      g.text(`${left} LEFT`, 74, 3, PAL.cyan);
      g.text(`ROUND ${round}/${TOTAL_ROUNDS}`, W - 8, 3, PAL.white, { align: "right" });

      if (state === "ready") {
        g.rect(40, 94, W - 80, 30, "rgba(13,11,26,0.8)");
        g.box(40, 94, W - 80, 30, PAL.pink);
        g.text(`ROUND ${round}`, W / 2, 100, PAL.yellow, { align: "center" });
        g.text("TRAP THE CRITTERS!", W / 2, 112, PAL.white, { align: "center" });
      }
      if (state === "clear") {
        g.rect(40, 94, W - 80, 30, "rgba(13,11,26,0.8)");
        g.box(40, 94, W - 80, 30, PAL.lime);
        g.text(round >= TOTAL_ROUNDS ? "YOU DID IT!" : "ROUND CLEAR!", W / 2, 100, PAL.pink, { align: "center" });
        g.text(round >= TOTAL_ROUNDS ? "ALL BUDDIES SAVED" : "NICE BUBBLING!", W / 2, 112, PAL.white, { align: "center" });
      }
      if (state === "dead" && lives <= 0) {
        g.rect(40, 94, W - 80, 24, "rgba(13,11,26,0.8)");
        g.box(40, 94, W - 80, 24, PAL.red);
        g.text("OUT OF BUBBLES!", W / 2, 102, PAL.red, { align: "center" });
      }
      if (hurryBanner > 0 && Math.floor(hurryBanner / 10) % 2 === 0) {
        g.text("HURRY UP!", W / 2, 16, PAL.yellow, { align: "center", size: 1 });
      }
    },
  };
}

export const bubbleBuddies: RetroGameDef = {
  id: "bubble-buddies",
  title: "Bubble Buddies",
  blurb: "Blow bubbles to trap critters, pop them for fruit, and clear 12 rounds!",
  genre: "Platformer",
  emoji: "🫧",
  color: "#5ef2ff",
  controls: "◀ ▶ walk · A jump (jump up through platforms) · B blow a bubble · hold A to bounce on bubbles",
  pad: { dpad: "lr", a: "Jump", b: "Bubble" },
  create,
};
