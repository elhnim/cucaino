// MINI RACERS — a top-down toy-car circuit race. ◀ ▶ steer (the car turns, not the camera),
// hold A to go, B uses whatever's in your item box (brake if you're not holding one). Three
// laps around a big winding circuit that scrolls under a following camera; grass and sand
// run-off slow you down, kerbs buzz, puddles make you slip, boost pads and jumps give you a
// kick, and the walls bounce you back if you plough into them. Three AI rivals follow the
// racing line at their own pace. ? boxes hand out a bouncing ball (fire it forward), an oil
// slick (drop it behind you), a turbo, or a shield. Finish top 3 to move to the next of 6
// circuits (meadow, beach, snow, city, desert, rainbow); 4th place earns a retry (2 of them)
// before it's game over. Win the rainbow cup finale to win the whole thing.
// (Original game in the spirit of 8-bit top-down kart racers — no borrowed names or characters.)
import { H, PAL, W, clamp, dist, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Rng, type Sprite } from "../engine";
import { bake, bakeShadow, fbm, hash2, outlined, shade } from "../art";

const TOP_SPEED = 6.2;
const ACCEL = 0.105;
const COAST = 0.045;
const BRAKE_DEC = 0.2;
const TURN_BASE = 0.05; // rad/frame steering rate at a standstill
const GRASS_BAND = 22; // world units of run-off before a solid wall
const LAPS = 3;
const ITEM_RADIUS = 16;

const normAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// ── car pixel art (facing "up" in its own grid; rotated per-pixel to the heading at draw time) ──
// a proper top-down kart: a pointed nose, a driver's round helmet + visor just behind it, a
// number/stripe plate across the cockpit, bulging side pods, and 4 black tyres planted at the
// four corners (poking out past the body, like a real kart's wheels do from directly above).
const KART_ROWS = [
  "....bbb....",
  "...bbbbb...",
  "..bbhhhbb..",
  "..bhhVhhb..",
  "..bbbbbbb..",
  "kk.bbbbb.kk",
  "kk.bsssb.kk",
  ".ppbsssbpp.",
  ".ppbsssbpp.",
  "kk.bbbbb.kk",
  "kk.bbbbb.kk",
  "..bbbbbbb..",
  "..bb...bb..",
  "...bb.bb...",
  "....bbb....",
];
const mkPal = (c: string, d: string) => ({ b: c, p: d, h: PAL.white, V: "#1c2440", s: PAL.white, k: PAL.black });
const CAR_PALS = [mkPal(PAL.red, "#b8262e"), mkPal(PAL.blue, PAL.navy), mkPal(PAL.green, "#1f8a3a"), mkPal(PAL.purple, "#5a2ea0")];
const KART_SCALE = 1.46; // tuned so the 11x15 grid draws at roughly 16x22 px on the 224-tall screen
const KART_OUTLINE = "#140c28";

/** rotate every pixel of a small sprite about its centre and stamp it, so a car can face any angle.
 *  Stamps a slightly-oversized dark pass first so the kart keeps a crisp 1px-ish outline even
 *  over busy, similarly-toned ground (kerbs, dust, other karts). */
function drawKart(g: Gfx, cx: number, cy: number, heading: number, scale: number) {
  return (pal: Record<string, string>) => {
    const w = KART_ROWS[0].length;
    const h = KART_ROWS.length;
    const phi = heading + Math.PI / 2; // row 0 is the nose, which points "up" in the grid
    const cf = Math.cos(phi);
    const sf = Math.sin(phi);
    const dot = scale * 1.3; // a touch oversized so rotated dots overlap with no gaps
    const plot = (i: number, j: number, col: string, dd: number) => {
      const lx = (i - (w - 1) / 2) * scale;
      const ly = (j - (h - 1) / 2) * scale;
      const rx = lx * cf - ly * sf;
      const ry = lx * sf + ly * cf;
      g.rect(cx + rx - dd / 2, cy + ry - dd / 2, dd, dd, col);
    };
    for (let j = 0; j < h; j++) {
      const row = KART_ROWS[j];
      for (let i = 0; i < w; i++) if (row[i] !== ".") plot(i, j, KART_OUTLINE, dot * 1.6);
    }
    for (let j = 0; j < h; j++) {
      const row = KART_ROWS[j];
      for (let i = 0; i < w; i++) {
        const ch = row[i];
        if (ch === ".") continue;
        const col = pal[ch];
        if (col) plot(i, j, col, dot);
      }
    }
  };
}

/** the same per-pixel rotate-and-stamp trick as `drawKart`, generalised to any small pixel grid —
 *  used for the painted corner chevrons (row 0 is the "pointing" end) */
function stampRows(g: Gfx, rows: string[], pal: Record<string, string>, cx: number, cy: number, heading: number, scale: number) {
  const w = rows[0].length;
  const h = rows.length;
  const phi = heading + Math.PI / 2;
  const cf = Math.cos(phi);
  const sf = Math.sin(phi);
  const dot = scale * 1.3;
  for (let j = 0; j < h; j++) {
    const row = rows[j];
    for (let i = 0; i < w; i++) {
      const ch = row[i];
      if (ch === ".") continue;
      const col = pal[ch];
      if (!col) continue;
      const lx = (i - (w - 1) / 2) * scale;
      const ly = (j - (h - 1) / 2) * scale;
      const rx = lx * cf - ly * sf;
      const ry = lx * sf + ly * cf;
      g.rect(cx + rx - dot / 2, cy + ry - dot / 2, dot, dot, col);
    }
  }
}
const ARROW_ROWS = ["..a..", ".aaa.", "a.a.a"];
const ARROW_PAL: Record<string, string> = { a: PAL.white };

// ── the circuit: a star-shaped polar curve, so it can never cross itself no matter the bumps ──
interface TrackPt {
  x: number;
  y: number;
  hw: number;
  kerb: boolean;
  ox: number; // outward unit normal (away from the circuit's centre)
  oy: number;
  tx: number; // forward unit tangent
  ty: number;
}
interface Theme {
  name: string;
  bg: string;
  trackCol: string;
  kerbA: string;
  kerbB: string;
  wallCol: string;
  decor: "tree" | "palm" | "pine" | "building" | "cactus" | "star";
  grip: number;
  rivalV: [number, number];
  boosts: number;
  puddles: number;
  jumps: number;
  rainbow?: boolean;
  /** corner barrier flavour — hay bales for soft, grassy cups; tyre stacks for the hard-edged ones */
  barrier: "hay" | "tyre";
  fenceCol: string;
  farCol: string; // distant backdrop silhouette colour (hills/dunes/skyline/nebula) behind the decor ring
  snowfall?: boolean;
  lagoon?: boolean; // beach-only still lagoons dotted among the palms
}
const THEMES: Theme[] = [
  { name: "MEADOW CUP", bg: "#3ecf55", trackCol: "#6b6f86", kerbA: PAL.red, kerbB: PAL.white, wallCol: "#4a4e6a", decor: "tree", grip: 1, rivalV: [0.72, 0.82], boosts: 2, puddles: 2, jumps: 1, barrier: "hay", fenceCol: PAL.white, farCol: "#2f9a44" },
  { name: "SANDY SHORES", bg: "#f2c48d", trackCol: "#7a7a82", kerbA: PAL.orange, kerbB: PAL.white, wallCol: "#4a4e6a", decor: "palm", grip: 0.95, rivalV: [0.8, 0.9], boosts: 2, puddles: 2, jumps: 1, barrier: "hay", fenceCol: "#9a5a32", farCol: "#2fa8c9", lagoon: true },
  { name: "FROSTY PEAK", bg: "#eaf6ff", trackCol: "#9fb7c9", kerbA: PAL.red, kerbB: PAL.white, wallCol: "#4a4e6a", decor: "pine", grip: 0.74, rivalV: [0.85, 0.95], boosts: 2, puddles: 1, jumps: 1, barrier: "tyre", fenceCol: PAL.red, farCol: "#cfe3f0", snowfall: true },
  { name: "CANDY CITY", bg: "#9aa0b8", trackCol: "#3a3d52", kerbA: PAL.yellow, kerbB: PAL.black, wallCol: "#26306b", decor: "building", grip: 0.97, rivalV: [0.9, 1.0], boosts: 3, puddles: 1, jumps: 1, barrier: "tyre", fenceCol: "#dfe3ee", farCol: "#2a2e48" },
  { name: "DUNE DRIFT", bg: "#e0b060", trackCol: "#8a7050", kerbA: PAL.red, kerbB: PAL.white, wallCol: "#4a4e6a", decor: "cactus", grip: 1, rivalV: [0.95, 1.05], boosts: 4, puddles: 1, jumps: 2, barrier: "hay", fenceCol: "#9a5a32", farCol: "#c68a3e" },
  { name: "RAINBOW RUSH", bg: "#1b1535", trackCol: "#3a2d6b", kerbA: PAL.pink, kerbB: PAL.cyan, wallCol: PAL.purple, decor: "star", grip: 1, rivalV: [1.0, 1.12], boosts: 6, puddles: 2, jumps: 2, rainbow: true, barrier: "tyre", fenceCol: PAL.cyan, farCol: "#5a2ea0" },
];
const RAINBOW_BAND = [PAL.red, PAL.orange, PAL.yellow, PAL.green, PAL.cyan, PAL.purple];

// ── baked art: ground tiles + scenery sprites, built once lazily (never at module load) ──
// TILE is a multiple of the 24px mown-stripe period (2 full light/dark bands per tile) so the
// diagonal stripe baked into each tile lines up seamlessly with its neighbours when stamped.
const TILE = 48;
const STRIPE_PX = 12;
/** the mown-lawn stripe band at a LOCAL tile pixel: wide alternating light/dark diagonal bands,
 *  not a per-pixel speckle — this is what actually reads as "mown" at a glance. */
const mowStripe = (x: number, y: number) => (Math.floor((x - y) / STRIPE_PX) & 1) === 0;
/** a seamless ground tile: a darker base colour, dithered fine texture, wide mown stripes, and
 *  clumps of a few small accent blobs (flowers / tufts / shells / pebbles) — not lone flecks, so
 *  they read as little clumps growing out of the grass. */
function bakeGroundTile(base: string, seed: number, opts: { ripple?: boolean; stripe?: boolean; accents?: string[]; clumpChance?: number } = {}): Sprite {
  const { ripple = false, stripe = false, accents = [], clumpChance = 0.22 } = opts;
  // clump centres on a coarse 8px grid, each a tiny fixed cluster of 3-4 accent pixels — reads as
  // a clump of flowers/tufts, not single dots scattered at random
  const CELL = 8;
  const clumpAt = (x: number, y: number) => {
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(y / CELL);
    if (hash2(gx, gy, seed + 400) >= clumpChance) return null;
    const ox = 2 + Math.floor(hash2(gx, gy, seed + 401) * (CELL - 4));
    const oy = 2 + Math.floor(hash2(gx, gy, seed + 402) * (CELL - 4));
    const lx = x - gx * CELL;
    const ly = y - gy * CELL;
    const SHAPE = [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (const [dx, dy] of SHAPE) if (lx === ox + dx && ly === oy + dy) return accents[Math.floor(hash2(gx, gy, seed + 403) * accents.length)];
    return null;
  };
  return bake(TILE, TILE, (x, y) => {
    const n = fbm(x * 0.2, y * 0.2, 2, seed);
    let col = n > 0.6 ? shade(base, 0.05) : n < 0.33 ? shade(base, -0.09) : base;
    if (ripple) {
      const band = Math.sin(x * 0.35 + y * 0.12 + seed) * 0.5 + 0.5;
      col = shade(base, (band - 0.5) * 0.22 + (n - 0.5) * 0.08);
    }
    if (stripe) col = mowStripe(x, y) ? shade(col, 0.045) : shade(col, -0.065);
    if (accents.length) {
      const c = clumpAt(x, y);
      if (c) return c;
    }
    return col;
  });
}
function bakeCityTile(): Sprite {
  const base = "#7d8298";
  return bake(TILE, TILE, (x, y) => {
    // candy city pavement: slab joints every 8px plus light speckle, with a broad resurfacing
    // band so even plain tarmac isn't perfectly flat
    const edge = x % 8 === 0 || y % 8 === 0;
    const n = fbm(x * 0.2, y * 0.2, 2, 4);
    const b = mowStripe(x, y) ? shade(base, n > 0.6 ? 0.06 : 0.02) : shade(base, n < 0.33 ? -0.07 : -0.03);
    return edge ? shade(b, -0.18) : b;
  });
}
function bakeRainbowTile(): Sprite {
  const base = "#17122c";
  return bake(TILE, TILE, (x, y) => {
    // rainbow night sky ground: deep purple with tiny stars
    const n = fbm(x * 0.15, y * 0.15, 2, 6);
    const b = n > 0.62 ? shade(base, 0.08) : base;
    if (hash2(x, y, 206) < 0.025) return hash2(x + 1, y, 207) < 0.5 ? PAL.cyan : PAL.white;
    return b;
  });
}
/** every theme's off-track surface as one seamless tile: darker overall than before (so the
 *  bright kerb and glossy karts pop off it) with mown stripes where that makes sense (grass,
 *  pavement) and clumps of flowers/tufts/shells/pebbles scattered through it. */
function bakeAllGround(): Sprite[] {
  return [
    bakeGroundTile("#2e9e45", 1, { stripe: true, accents: [PAL.pink, PAL.yellow, "#eafccf"], clumpChance: 0.3 }), // meadow: mown grass + flower clumps
    bakeGroundTile("#d9a868", 2, { ripple: true, accents: ["#f0e0bc", "#b4834e"], clumpChance: 0.16 }), // sand: ripples + shell clumps
    bakeGroundTile("#d7e9f5", 3, { accents: ["#ffffff"], clumpChance: 0.14 }), // frosty: sparkle clumps
    bakeCityTile(),
    bakeGroundTile("#c08a46", 5, { ripple: true, accents: ["#8a5a2c"], clumpChance: 0.16 }), // dune: ripples + pebble clumps
    bakeRainbowTile(),
  ];
}

/** round foliage canopy + a slim trunk, lit from the top-left, outlined so it pops off the grass */
function bakeTreeSprite(): Sprite {
  const base = "#2f9a44";
  return outlined(
    bake(18, 22, (x, y) => {
      if (y >= 17) return x >= 7 && x <= 10 ? shade("#6b4a2a", (x - 8.5) * -0.1) : null;
      const cx = 9;
      const cy = 9;
      const dx = x - cx;
      const dy = (y - cy) * 1.05;
      const d = Math.hypot(dx, dy);
      if (d > 8.2) return null;
      const light = clamp(-(dx + dy) / 11, -1, 1);
      return shade(base, light * 0.32 - 0.04);
    }),
  );
}
function bakePalmSprite(): Sprite {
  return outlined(
    bake(20, 24, (x, y) => {
      // leaning trunk
      const trunkX = 10 + Math.round((22 - y) * 0.12);
      if (y >= 10 && y < 23 && Math.abs(x - trunkX) <= 1) return shade("#9a5a32", (x - trunkX) * 0.15);
      // fan of fronds from the crown
      const cx = trunkX;
      const cy = 9;
      const dx = x - cx;
      const dy = y - cy;
      const ang = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy);
      for (let k = 0; k < 6; k++) {
        const fa = (k / 6) * Math.PI * 2 + 0.3;
        const da = Math.abs(normAngle(ang - fa));
        if (d < 9 && d > 1 && da < 0.42 * (1 - d / 14)) return shade("#2f9a44", (1 - da * 2) * 0.2);
      }
      return null;
    }),
  );
}
function bakePineSprite(): Sprite {
  return outlined(
    bake(18, 24, (x, y) => {
      if (y >= 20) return x >= 7 && x <= 10 ? "#6b4a2a" : null;
      // three stacked conifer tiers, widest at the bottom
      const cx = 9;
      for (let tier = 0; tier < 3; tier++) {
        const ty = 5 + tier * 5;
        const half = 8 - tier * 2.2;
        const h0 = 6;
        const dy = y - ty;
        if (dy < 0 || dy > h0) continue;
        const w = half * (1 - dy / h0);
        if (Math.abs(x - cx) <= w) {
          const light = (cx - x) / (half + 1);
          return shade("#1fb3a3", light * 0.3 - 0.05);
        }
      }
      return null;
    }),
  );
}
function bakeBuildingSprite(): Sprite {
  return outlined(
    bake(16, 26, (x, y) => {
      if (y < 4) return null;
      const edge = x === 0 || x === 15;
      const base = "#4a4e6a";
      if (edge) return shade(base, -0.15);
      const wx = (x - 2) % 4;
      const wy = (y - 6) % 6;
      if (x >= 2 && x <= 13 && y >= 6 && wx < 2 && wy < 3) return PAL.yellow;
      return shade(base, ((x + y) % 2 ? 0.03 : -0.03));
    }),
  );
}
function bakeCactusSprite(): Sprite {
  const base = "#2f9a44";
  return outlined(
    bake(14, 20, (x, y) => {
      const main = Math.abs(x - 7) <= 2 && y >= 2;
      const armL = x >= 2 && x <= 4 && y >= 7 && y <= 14;
      const armR = x >= 10 && x <= 12 && y >= 5 && y <= 12;
      if (!main && !armL && !armR) return null;
      const light = (7 - x) * 0.06;
      return shade(base, light);
    }),
  );
}
function bakeCandyStarSprite(): Sprite {
  return outlined(
    bake(16, 16, (x, y) => {
      const dx = x - 8;
      const dy = y - 8;
      const main = (Math.abs(dx) <= 1.4 && Math.abs(dy) <= 7) || (Math.abs(dy) <= 1.4 && Math.abs(dx) <= 7);
      const diag = Math.abs(Math.abs(dx) - Math.abs(dy)) <= 1 && Math.abs(dx) <= 4.5;
      if (!main && !diag) return null;
      const d = Math.hypot(dx, dy);
      return d < 2.4 ? PAL.white : PAL.yellow;
    }),
  );
}
/** a squat round bush — two overlapping leafy blobs, no trunk, sits low beside the trees */
function bakeBushSprite(): Sprite {
  const base = "#2f9a44";
  return outlined(
    bake(16, 10, (x, y) => {
      const d1 = Math.hypot((x - 5) * 1, (y - 6) * 1.3);
      const d2 = Math.hypot((x - 11) * 1, (y - 6) * 1.3);
      const d = Math.min(d1, d2);
      if (d > 5.4) return null;
      const light = clamp(-((x - 8) + (y - 6)) / 9, -1, 1);
      return shade(base, light * 0.28 - 0.02);
    }),
  );
}
/** a round-on-its-side hay bale: straw gold with a few binding bands, outlined */
function bakeHayBaleSprite(): Sprite {
  const base = "#e0b454";
  return outlined(
    bake(16, 12, (x, y) => {
      const dx = x - 8;
      const dy = (y - 6) * 1.5;
      const d = Math.hypot(dx, dy);
      if (d > 6) return null;
      const band = x === 4 || x === 8 || x === 12;
      const light = clamp(-(dx + dy) / 8, -1, 1) * 0.3;
      return band ? shade("#a9772e", light * 0.4) : shade(base, light);
    }),
  );
}
/** stacked tyres marking a corner: alternating black rubber and a white sidewall ring */
function bakeTyreStackSprite(): Sprite {
  return outlined(
    bake(14, 16, (x, y) => {
      const rows = [
        { cy: 12, rx: 6.5, ry: 3.4 },
        { cy: 7.5, rx: 6.5, ry: 3.4 },
        { cy: 3.5, rx: 6, ry: 3.1 },
      ];
      for (const rrow of rows) {
        const dx = (x - 7) / rrow.rx;
        const dy = (y - rrow.cy) / rrow.ry;
        const d = dx * dx + dy * dy;
        if (d <= 1) {
          const inner = dx * dx * 2.6 + dy * dy * 2.6;
          if (inner <= 1) return "#cfd3e0";
          return (x + Math.floor(rrow.cy)) % 5 === 0 ? "#2a2840" : PAL.black;
        }
      }
      return null;
    }),
  );
}
/** a soft, far-off backdrop blob (a hill, a dune, a rooftop, a nebula puff) — big, low detail,
 *  two lit bands only, so it reads as something distant behind the foreground scenery */
function bakeFarBlobSprite(col: string): Sprite {
  return bake(26, 16, (x, y) => {
    const d = Math.hypot((x - 13) / 13, (y - 11) / 7);
    if (d > 1) return null;
    return d > 0.62 ? shade(col, -0.08) : shade(col, 0.05);
  });
}
/** a small still lagoon among the beach palms: banded water with a pale foam ring */
function bakeLagoonSprite(): Sprite {
  return bake(22, 14, (x, y) => {
    const dx = (x - 11) / 11;
    const dy = (y - 7) / 7;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (d > 0.78) return "#eaf6ff";
    const band = Math.sin(x * 0.7 + y * 0.4) * 0.5 + 0.5;
    return shade("#2fa8c9", (band - 0.5) * 0.25);
  });
}
/** a real little grandstand, ~56x20: three tiered ROWS of simple fans — a 2px skin-tone head over
 *  a 3px shirt, each one boxed off by a dark gap on every side so individual people actually read
 *  instead of a mush of coloured noise — over a panelled fascia wall. Two phases flip a few shirts
 *  brighter each swap, the cheap stand-in for a wave. */
function bakeCrowdSprite(phase: 0 | 1): Sprite {
  const shirtCols = [PAL.red, PAL.blue, PAL.yellow, "#2f9a44", PAL.purple, PAL.orange];
  const skinCols = ["#f2c48d", "#c99a6a", "#8a5a32", "#e8b48a"];
  const W2 = 56;
  const H2 = 20;
  const CELL = 7; // one fan per 7px cell, 8 fans per row, no remainder so the tile stays seamless
  return bake(W2, H2, (x, y) => {
    if (y >= 15) {
      // the stand's front wall: panelled fascia, a darker rail along the very top edge
      if (y === 15) return "#1c2440";
      const panel = Math.floor(x / 6) % 2 === 0;
      return panel ? "#2a3660" : "#233055";
    }
    const row = Math.floor(y / 5); // 0 = back row (furthest), 2 = front row
    const ly = y - row * 5; // 0..4 within this row's band
    if (ly === 4) return null; // a dark gap between rows
    const fanIdx = Math.floor(x / CELL);
    const lx = x - fanIdx * CELL; // 0..6 within this fan's own cell
    const key = fanIdx * 7 + row * 31;
    const skin = skinCols[Math.floor(hash2(key, 0, 510) * skinCols.length)];
    const shirtBase = shirtCols[Math.floor(hash2(key, 1, 511) * shirtCols.length)];
    const shirt = shade(shirtBase, row * 0.05 - 0.08); // back rows read a touch darker/further off
    const wave = (fanIdx + row + phase) % 4 === 0;
    if (ly <= 1) return lx === 2 || lx === 3 ? (wave ? shade(skin, 0.15) : skin) : null; // 2x2 head
    return lx >= 2 && lx <= 4 ? (wave ? shade(shirt, 0.25) : shirt) : null; // 3x2 shirt
  });
}
/** the striped roof overhang sitting above the crowd, wide enough to shade the whole stand */
function bakeStandRoofSprite(): Sprite {
  return outlined(
    bake(60, 8, (x, y) => {
      if (y >= 5) return x % 8 < 1 ? shade(PAL.dark, -0.2) : null; // a few support posts peeking below the eave
      return shade(PAL.red, x % 4 < 2 ? 0.08 : -0.1);
    }),
  );
}
interface Art {
  ground: Sprite[];
  decor: Record<Theme["decor"], Sprite>;
  bush: Sprite;
  hay: Sprite;
  tyre: Sprite;
  far: Record<Theme["decor"], Sprite>;
  lagoon: Sprite;
  crowd: [Sprite, Sprite];
  standRoof: Sprite;
  shadow: Sprite;
}
let ART: Art | null = null;
const art = (): Art =>
  (ART ??= {
    ground: bakeAllGround(),
    decor: {
      tree: bakeTreeSprite(),
      palm: bakePalmSprite(),
      pine: bakePineSprite(),
      building: bakeBuildingSprite(),
      cactus: bakeCactusSprite(),
      star: bakeCandyStarSprite(),
    },
    bush: bakeBushSprite(),
    hay: bakeHayBaleSprite(),
    tyre: bakeTyreStackSprite(),
    far: {
      tree: bakeFarBlobSprite("#2f9a44"),
      palm: bakeFarBlobSprite("#2fa8c9"),
      pine: bakeFarBlobSprite("#cfe3f0"),
      building: bakeFarBlobSprite("#2a2e48"),
      cactus: bakeFarBlobSprite("#c68a3e"),
      star: bakeFarBlobSprite("#5a2ea0"),
    },
    lagoon: bakeLagoonSprite(),
    crowd: [bakeCrowdSprite(0), bakeCrowdSprite(1)],
    standRoof: bakeStandRoofSprite(),
    shadow: bakeShadow(14, 7, "#000000"),
  });

interface TrackData {
  theme: Theme;
  pts: TrackPt[];
  cum: number[];
  totalLen: number;
  N: number;
  maxR: number;
  itemBoxes: { x: number; y: number; cd: number }[];
  boosts: { x: number; y: number }[];
  puddles: { x: number; y: number; r: number }[];
  jumps: { x: number; y: number }[];
  decor: { x: number; y: number; bush: boolean }[];
  /** hay bales / tyre stacks guarding the outside of the sharpest corners */
  barriers: { x: number; y: number }[];
  /** painted chevrons through the bends, pointing the way round */
  arrows: { x: number; y: number; heading: number }[];
  /** sparse big silhouettes well beyond the fence line — the backdrop depth layer */
  far: { x: number; y: number }[];
  /** beach-only still ponds dotted among the palms */
  lagoons: { x: number; y: number }[];
  /** baked-in asphalt speckle + old tyre scuffs, scattered once per track so the tarmac isn't flat */
  flecks: { x: number; y: number; s: number; c: string }[];
  /** a MUCH finer resample of the same centreline (so neighbours sit only a few px apart) purely
   *  for the kerb: stamping at the real point spacing (~30 px) left visible gaps between blocks,
   *  which read as "dots" instead of a solid band. `cum` is this array's own running arc length,
   *  for even stripe sizing. */
  kerbPts: { x: number; y: number; ox: number; oy: number; hw: number; kerb: boolean }[];
  kerbCum: number[];
  /** indices (excluding the start/finish at 0) a car must reach, in order, before a lap counts */
  checkpoints: number[];
  cpRequired: number;
}

function buildTrack(seed: number, ti: number, theme: Theme): TrackData {
  const r = rng(seed * 1000 + ti * 131 + 7);
  const N = 150;
  const R0 = 740 + ti * 55;
  const scaleY = 0.72 + r.range(-0.05, 0.05);
  const amp: [number, number, number] = [r.range(70, 150), r.range(40, 95), r.range(18, 50)];
  const ph: [number, number, number] = [r.range(0, 6.283), r.range(0, 6.283), r.range(0, 6.283)];
  const freq: [number, number, number] = [2, 3, 5];
  const w0 = 54 - ti;
  const wAmp = r.range(10, 24);
  const wPh = r.range(0, 6.283);

  // the one parametric formula for the whole circuit's shape — shared by the N real track points
  // AND the much finer kerb resample below, so the kerb can never drift off the real edge
  const curveAt = (t: number) => {
    let rad = R0;
    for (let k = 0; k < 3; k++) rad += amp[k] * Math.sin(freq[k] * t + ph[k]);
    const x = Math.cos(t) * rad;
    const y = Math.sin(t) * rad * scaleY;
    const hw = clamp(w0 + wAmp * Math.sin(3 * t + wPh), 32, 96);
    return { x, y, hw };
  };

  const pts: TrackPt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const { x, y, hw } = curveAt(t);
    pts.push({ x, y, hw, kerb: false, ox: 0, oy: 0, tx: 0, ty: 0 });
  }
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const pr = pts[(i - 1 + N) % N];
    const pn = pts[(i + 1) % N];
    const d = Math.hypot(p.x, p.y) || 1;
    p.ox = p.x / d;
    p.oy = p.y / d;
    const tx = pn.x - pr.x;
    const ty = pn.y - pr.y;
    const tl = Math.hypot(tx, ty) || 1;
    p.tx = tx / tl;
    p.ty = ty / tl;
  }
  const angAt = (i: number) => Math.atan2(pts[i].ty, pts[i].tx);
  for (let i = 0; i < N; i++) {
    const turn = Math.abs(normAngle(angAt((i + 5) % N) - angAt((i - 5 + N) % N)));
    pts[i].kerb = turn > 0.42;
  }

  // a MUCH finer resample of the same centreline, just for the kerb and the darker "racing line"
  // overlay — real track points are ~30 px apart, too sparse to read as a solid painted band; at
  // this density consecutive blocks overlap and the kerb reads as one continuous strip. Scaled to
  // the circuit's own (rough) circumference so bigger cups (bigger R0) don't end up with wider
  // gaps between kerb blocks than smaller ones.
  const NKERB = clamp(Math.round((2 * Math.PI * R0) / 4), 700, 1500);
  const kerbPts: { x: number; y: number; ox: number; oy: number; hw: number; kerb: boolean }[] = [];
  for (let i2 = 0; i2 < NKERB; i2++) {
    const t = (i2 / NKERB) * Math.PI * 2;
    const { x, y, hw } = curveAt(t);
    const d = Math.hypot(x, y) || 1;
    const nearestCoarse = Math.round((i2 / NKERB) * N) % N;
    kerbPts.push({ x, y, ox: x / d, oy: y / d, hw, kerb: pts[nearestCoarse].kerb });
  }
  const kerbCum: number[] = [0];
  for (let i2 = 0; i2 < NKERB; i2++) {
    const j2 = (i2 + 1) % NKERB;
    kerbCum.push(kerbCum[i2] + Math.hypot(kerbPts[j2].x - kerbPts[i2].x, kerbPts[j2].y - kerbPts[i2].y));
  }

  const cum: number[] = [0];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    cum.push(cum[i] + Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y));
  }
  const totalLen = cum[N];

  const itemBoxes = [];
  for (let k = 0; k < 6; k++) {
    const idx = (Math.floor(((k + 0.5) / 6) * N + r.range(-4, 4)) + N) % N;
    const p = pts[idx];
    const side = r.range(-0.4, 0.4);
    itemBoxes.push({ x: p.x + p.ox * side * p.hw, y: p.y + p.oy * side * p.hw, cd: 0 });
  }
  const boosts = [];
  for (let k = 0; k < theme.boosts; k++) {
    const p = pts[r.int(0, N - 1)];
    boosts.push({ x: p.x, y: p.y });
  }
  const puddles = [];
  for (let k = 0; k < theme.puddles; k++) {
    const p = pts[r.int(0, N - 1)];
    puddles.push({ x: p.x + p.ox * r.range(-0.3, 0.3) * p.hw, y: p.y + p.oy * r.range(-0.3, 0.3) * p.hw, r: r.range(14, 22) });
  }
  const jumps = [];
  for (let k = 0; k < theme.jumps; k++) {
    const p = pts[r.int(0, N - 1)];
    jumps.push({ x: p.x, y: p.y });
  }
  // trees/bushes grow in little CLUSTERS around a chosen spot (not lone scattered singles), so the
  // circuit reads as framed by proper foliage rather than a few dotted trees
  const decor: { x: number; y: number; bush: boolean }[] = [];
  for (let i = 0; i < N; i += 2) {
    if (!r.chance(0.7)) continue;
    const p = pts[i];
    const side = r.chance(0.5) ? 1 : -1;
    const off = p.hw + GRASS_BAND + r.range(10, 70);
    const cx = p.x + p.ox * side * off;
    const cy = p.y + p.oy * side * off;
    const clusterN = r.int(2, 4);
    for (let k = 0; k < clusterN; k++) decor.push({ x: cx + r.range(-14, 14), y: cy + r.range(-14, 14), bush: r.chance(0.35) });
  }
  // hay bales / tyre stacks guard the outside of the sharpest bends, like a real circuit's runoff
  const barriers: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (!pts[i].kerb || !r.chance(0.3)) continue;
    const p = pts[i];
    const side = r.chance(0.5) ? 1 : -1;
    const off = p.hw + GRASS_BAND * 0.55 + 8;
    barriers.push({ x: p.x + p.ox * side * off, y: p.y + p.oy * side * off });
  }
  // a painted chevron at the start of each corner run, pointing the way round the bend
  const arrows: { x: number; y: number; heading: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (pts[i].kerb && !pts[(i - 1 + N) % N].kerb) {
      const p = pts[(i + 3) % N];
      arrows.push({ x: p.x, y: p.y, heading: Math.atan2(p.ty, p.tx) });
    }
  }
  // a sparse ring of big, soft silhouettes well past the fence — a backdrop depth layer even
  // though the camera looks straight down, the way a far tree-line still reads as "distance"
  const far: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i += 7) {
    const p = pts[i];
    const side = r.chance(0.5) ? 1 : -1;
    const off = p.hw + GRASS_BAND + r.range(140, 210);
    far.push({ x: p.x + p.ox * side * off, y: p.y + p.oy * side * off });
  }
  const lagoons: { x: number; y: number }[] = [];
  if (theme.lagoon) {
    for (let k = 0; k < 4; k++) {
      const p = pts[r.int(0, N - 1)];
      const side = r.chance(0.5) ? 1 : -1;
      const off = p.hw + GRASS_BAND + r.range(30, 90);
      lagoons.push({ x: p.x + p.ox * side * off, y: p.y + p.oy * side * off });
    }
  }
  // flecks of speckle (3 grey tones, dithered) and old tyre scuffs baked straight onto the tarmac
  // once, rather than a flat fill colour — scattered across every point's width so the whole
  // ribbon reads as used asphalt
  const flecks: { x: number; y: number; s: number; c: string }[] = [];
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const n = r.int(3, 5);
    for (let k = 0; k < n; k++) {
      const off = r.range(-0.85, 0.85) * p.hw;
      const tone = r.next();
      flecks.push({
        x: p.x + p.ox * off,
        y: p.y + p.oy * off,
        s: r.range(1, 2.6),
        c: tone < 0.33 ? shade(theme.trackCol, 0.1) : tone < 0.66 ? shade(theme.trackCol, -0.06) : shade(theme.trackCol, -0.17),
      });
    }
    // tyre scuffs at bends: a curved pair of dark streaks (several overlapping flecks stretched
    // along the direction of travel), not a single dot, so it actually reads as braking marks
    if (p.kerb && r.chance(0.7)) {
      for (const laneSide of [-0.45, 0.1]) {
        const off = laneSide * p.hw + r.range(-6, 6);
        const bx = p.x + p.ox * off;
        const by = p.y + p.oy * off;
        for (let s = -2; s <= 2; s++) flecks.push({ x: bx - p.tx * s * 3, y: by - p.ty * s * 3, s: r.range(2, 3.4), c: "#17141f" });
      }
    }
  }
  let maxR = 0;
  for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x, p.y));

  const checkpoints: number[] = [];
  for (let k = 1; k < 8; k++) checkpoints.push(Math.round((k / 8) * N) % N);
  const cpRequired = Math.ceil(checkpoints.length * 0.6);

  return { theme, pts, cum, totalLen, N, maxR: maxR + 40, itemBoxes, boosts, puddles, jumps, decor, barriers, arrows, far, lagoons, flecks, kerbPts, kerbCum, checkpoints, cpRequired };
}

/** shortest signed distance from index a to index b around a loop of length N */
const circDist = (a: number, b: number, N: number) => Math.abs((((a - b + N / 2) % N) + N) % N - N / 2);

function queryTrack(track: TrackData, x: number, y: number, guess: number) {
  const N = track.N;
  let best = guess;
  let bestD = Infinity;
  const scan = (w: number) => {
    for (let k = -w; k <= w; k++) {
      const i = (((guess + k) % N) + N) % N;
      const p = track.pts[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  };
  scan(10);
  // only widen the search if the local window genuinely lost the car (e.g. after a reset) — a
  // periodic unconditional full-track rescan used to let a tight hairpin's far side "steal" the
  // index and fake a lap, since two points close in space can be far apart along the path
  if (bestD > 140 * 140) scan(Math.floor(N / 2));
  const p = track.pts[best];
  const offset = (x - p.x) * p.ox + (y - p.y) * p.oy;
  return { idx: best, offset, hw: p.hw };
}

// ── the four racers ──
type Item = "ball" | "oil" | "turbo" | "shield";
const ITEM_KINDS: Item[] = ["ball", "oil", "turbo", "shield"];
interface CarT {
  x: number;
  y: number;
  heading: number;
  speed: number;
  slip: number;
  idx: number;
  surface: "track" | "grass";
  prevS: number;
  lap: number;
  pos: number;
  item: Item | null;
  shield: boolean;
  spin: number;
  spinDir: number;
  boostT: number;
  puddleT: number;
  jumpT: number;
  isPlayer: boolean;
  pal: Record<string, string>;
  rivalV: number;
  aiPhase: number;
  cpNext: number; // how many of this lap's checkpoints have been reached, in order
  wheelPhase: number; // accumulated distance, so the wheels visibly spin while moving
}
interface Oil {
  x: number;
  y: number;
  t: number;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

/** shared ground/steering/hazard physics for the player AND the AI, so they feel the same track */
function stepCar(c: CarT, steer: number, gas: boolean, brake: boolean, track: TrackData, oils: Oil[], r: Rng): string[] {
  const events: string[] = [];
  if (c.spin > 0) {
    c.spin--;
    c.heading += c.spinDir * 0.32;
    c.speed *= 0.94;
    c.slip *= 0.9;
    const fx = Math.cos(c.heading);
    const fy = Math.sin(c.heading);
    c.x += fx * c.speed * 0.5;
    c.y += fy * c.speed * 0.5;
  } else {
    const rate = TURN_BASE * (1 - clamp(c.speed / TOP_SPEED, 0, 1) * 0.4);
    c.heading += steer * rate;
    if (steer === 0 && c.surface === "track" && c.speed > 0.6) {
      const tang = Math.atan2(track.pts[c.idx].ty, track.pts[c.idx].tx);
      c.heading += normAngle(tang - c.heading) * 0.02;
    }
    const surfTop = c.boostT > 0 ? TOP_SPEED * 1.45 : c.surface === "grass" ? TOP_SPEED * 0.55 * track.theme.grip : TOP_SPEED * track.theme.grip;
    if (gas) c.speed += ACCEL;
    else c.speed -= COAST;
    if (brake) c.speed -= BRAKE_DEC;
    if (c.speed > surfTop) c.speed = Math.max(surfTop, c.speed - 0.1);
    c.speed = clamp(c.speed, -1.6, TOP_SPEED * 1.5);
    const gripRate = c.puddleT > 0 ? 0.05 : c.surface === "grass" ? 0.1 : 0.26;
    const slipTarget = steer * Math.min(Math.abs(c.speed), TOP_SPEED) * 0.22;
    c.slip += (slipTarget - c.slip) * gripRate;
    const fx = Math.cos(c.heading);
    const fy = Math.sin(c.heading);
    c.x += fx * c.speed - fy * c.slip;
    c.y += fy * c.speed + fx * c.slip;
  }
  if (c.boostT > 0) c.boostT--;
  if (c.puddleT > 0) c.puddleT--;
  if (c.jumpT > 0) c.jumpT--;
  c.wheelPhase += Math.abs(c.speed);

  const q = queryTrack(track, c.x, c.y, c.idx);
  c.idx = q.idx;
  const absOff = Math.abs(q.offset);
  if (absOff <= q.hw) {
    c.surface = "track";
  } else if (absOff <= q.hw + GRASS_BAND) {
    c.surface = "grass";
  } else {
    const sign = Math.sign(q.offset) || 1;
    const p = track.pts[q.idx];
    c.x = p.x + p.ox * sign * (q.hw + GRASS_BAND);
    c.y = p.y + p.oy * sign * (q.hw + GRASS_BAND);
    c.speed *= 0.35;
    c.slip *= 0.2;
    if (c.spin === 0) events.push("wall");
    c.surface = "grass";
  }
  for (const pd of track.puddles) {
    if (dist(c.x, c.y, pd.x, pd.y) < pd.r) {
      if (c.puddleT <= 0) events.push("splash");
      c.puddleT = 10;
      break;
    }
  }
  for (const bp of track.boosts) {
    if (dist(c.x, c.y, bp.x, bp.y) < 20 && c.surface === "track") {
      if (c.boostT < 8) events.push("boost");
      c.boostT = 26;
      break;
    }
  }
  for (const jp of track.jumps) {
    if (dist(c.x, c.y, jp.x, jp.y) < 18 && c.jumpT <= 0) {
      c.jumpT = 18;
      events.push("jump");
      break;
    }
  }
  if (c.spin === 0) {
    for (const ol of oils) {
      if (dist(c.x, c.y, ol.x, ol.y) < 12) {
        if (c.shield) {
          c.shield = false;
          events.push("shieldpop");
        } else {
          c.spin = 46;
          c.spinDir = r.chance(0.5) ? 1 : -1;
          c.speed *= 0.4;
          events.push("oil");
        }
        break;
      }
    }
  }

  // a checkpoint only counts when it's the next one in order, so wiggling or reversing near a
  // single point can't rack them up — only genuinely driving most of the way round can
  if (c.cpNext < track.checkpoints.length && circDist(c.idx, track.checkpoints[c.cpNext], track.N) <= 2) c.cpNext++;

  const s = track.cum[c.idx];
  const ds = s - c.prevS;
  if (ds < -track.totalLen / 2) {
    // crossed the start/finish moving forward — only counts as a lap if most checkpoints were
    // reached in order first, so reversing over the line or spinning on it can't fake one
    if (c.cpNext >= track.cpRequired) c.lap++;
    c.cpNext = 0;
  } else if (ds > track.totalLen / 2) {
    c.lap = Math.max(0, c.lap - 1);
    c.cpNext = 0;
  }
  c.prevS = s;
  return events;
}

function aiInput(c: CarT, track: TrackData, frame: number) {
  const look = clamp(6 + Math.floor(c.speed * 1.8), 6, 22);
  const N = track.N;
  const ti = (c.idx + look) % N;
  const tp = track.pts[ti];
  const wob = Math.sin(frame * 0.02 + c.aiPhase) * 0.5;
  const lateral = wob * tp.hw * 0.5;
  const tx = tp.x + tp.ox * lateral;
  const ty = tp.y + tp.oy * lateral;
  const desired = Math.atan2(ty - c.y, tx - c.x);
  const steer = clamp(normAngle(desired - c.heading) * 2.4, -1, 1);
  const a1 = Math.atan2(track.pts[ti].ty, track.pts[ti].tx);
  const ti2 = (ti + 10) % N;
  const a2 = Math.atan2(track.pts[ti2].ty, track.pts[ti2].tx);
  const curveFactor = clamp(1 - Math.abs(normAngle(a2 - a1)) * 1.3, 0.4, 1);
  const want = TOP_SPEED * c.rivalV * curveFactor;
  return { steer, gas: c.speed < want, brake: c.speed > want + 1.2 };
}

function mkCar(isPlayer: boolean, pal: Record<string, string>, rivalV: number, aiPhase: number, p0: TrackPt, row: number, col: number): CarT {
  const perpX = -p0.ty;
  const perpY = p0.tx;
  return {
    x: p0.x - p0.tx * row * 26 + perpX * col * 20,
    y: p0.y - p0.ty * row * 26 + perpY * col * 20,
    heading: Math.atan2(p0.ty, p0.tx),
    speed: 0,
    slip: 0,
    idx: 0,
    surface: "track",
    prevS: 0,
    lap: 0,
    pos: 1,
    item: null,
    shield: false,
    spin: 0,
    spinDir: 1,
    boostT: 0,
    puddleT: 0,
    jumpT: 0,
    isPlayer,
    pal,
    rivalV,
    aiPhase,
    cpNext: 0,
    wheelPhase: 0,
  };
}

function create(seed: number): GameInstance {
  const r = rng(seed + 777);
  let ti = 0;
  let track = buildTrack(seed, ti, THEMES[ti]);
  let retries = 2;
  let frame = 0;
  let camX = 0;
  let camY = 0;
  let camInit = false;
  let state: "count" | "race" | "result" | "over" | "won" = "count";
  let stateT = 160;
  let startBoost = false;
  let resultPos = 1;
  let prevPlayerPos = 1;
  let nextScoreDist = 300;
  let msg = "";
  let msgT = 0;
  let shake = 0;
  let engineT = 0;
  let screechT = 0;
  const bits: Bit[] = [];
  const marks: { x: number; y: number; a: number }[] = [];
  let oils: Oil[] = [];
  let balls: Ball[] = [];

  const say = (s: string, t = 70) => {
    msg = s;
    msgT = t;
  };
  const puff = (x: number, y: number, c: string, n = 4) => {
    for (let i = 0; i < n; i++) bits.push({ x, y, vx: r.range(-1.2, 1.2), vy: r.range(-1.2, 1.2), life: r.int(14, 26), c });
  };

  const positions: [number, number][] = [
    [0, 0],
    [1, -1],
    [1, 1],
    [2, 0],
  ];
  let player = mkCar(true, CAR_PALS[0], 1, 0, track.pts[0], positions[0][0], positions[0][1]);
  let rivals = [1, 2, 3].map((i) => mkCar(false, CAR_PALS[i], r.range(track.theme.rivalV[0], track.theme.rivalV[1]), r.range(0, 6.28), track.pts[0], positions[i][0], positions[i][1]));

  const resetRace = () => {
    player = mkCar(true, CAR_PALS[0], 1, 0, track.pts[0], positions[0][0], positions[0][1]);
    rivals = [1, 2, 3].map((i) => mkCar(false, CAR_PALS[i], r.range(track.theme.rivalV[0], track.theme.rivalV[1]), r.range(0, 6.28), track.pts[0], positions[i][0], positions[i][1]));
    oils = [];
    balls = [];
    marks.length = 0;
    camInit = false;
    nextScoreDist = 300;
    prevPlayerPos = 1;
    state = "count";
    stateT = 160;
    startBoost = false;
    shake = 0;
  };

  const useItem = (io: IO) => {
    const it = player.item;
    if (!it) return;
    player.item = null;
    const fx = Math.cos(player.heading);
    const fy = Math.sin(player.heading);
    if (it === "ball") {
      balls.push({ x: player.x + fx * 10, y: player.y + fy * 10, vx: fx * 9, vy: fy * 9, t: 70 });
      io.sfx.play("laser");
      say("BALL AWAY!", 40);
    } else if (it === "oil") {
      if (oils.length >= 4) oils.shift();
      oils.push({ x: player.x - fx * 12, y: player.y - fy * 12, t: 0 });
      io.sfx.play("bounce");
      say("OIL DROPPED!", 40);
    } else if (it === "turbo") {
      player.boostT = 60;
      player.speed = TOP_SPEED * 1.4;
      io.sfx.play("powerup");
      io.sfx.slide?.(160, 720, 0.3, "sawtooth", 0.1);
      say("TURBO!", 40);
    } else if (it === "shield") {
      player.shield = true;
      io.sfx.play("powerup");
      io.sfx.tone(700, 0.2, "sine", 0.08);
      say("SHIELD UP!", 40);
    }
  };

  const rank = () => {
    const cars = [player, ...rivals];
    const score = cars.map((c) => c.lap * track.totalLen + track.cum[c.idx]);
    const order = cars.map((_, i) => i).sort((a, b) => score[b] - score[a]);
    order.forEach((ci, i) => (cars[ci].pos = i + 1));
  };

  const finishRace = (io: IO) => {
    resultPos = player.pos;
    const bonus = resultPos === 1 ? 1500 : resultPos === 2 ? 900 : resultPos === 3 ? 500 : 150;
    io.score(bonus);
    io.sfx.play(resultPos <= 3 ? "win" : "die");
    if (resultPos <= 3) {
      io.sfx.play("cheer");
      const confetti = [PAL.red, PAL.yellow, PAL.cyan, PAL.lime, PAL.pink];
      for (let k = 0; k < 18; k++) puff(player.x, player.y, confetti[k % confetti.length], 1);
    }
    state = "result";
    stateT = 150;
  };

  let prevJumpT = 0;
  const dustColor = (theme: Theme) =>
    theme.decor === "palm" || theme.decor === "cactus" ? "#d9a868" : theme.decor === "pine" ? PAL.white : theme.decor === "building" ? PAL.grey : theme.decor === "star" ? PAL.purple : "#c8e6a8";

  return {
    update(io) {
      if (state === "over" || state === "won") return;
      frame++;
      if (msgT > 0) msgT--;
      if (shake > 0) shake--;
      if (engineT > 0) engineT--;
      if (screechT > 0) screechT--;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx;
        b.y += b.vy;
        if (--b.life <= 0) bits.splice(i, 1);
      }
      for (let i = marks.length - 1; i >= 0; i--) {
        marks[i].a -= 0.012;
        if (marks[i].a <= 0) marks.splice(i, 1);
      }

      if (state === "count") {
        stateT--;
        if (stateT === 110 || stateT === 70 || stateT === 30) io.sfx.tone(440, 0.15, "square", 0.08);
        if (io.input.pressed.a && stateT <= 24) startBoost = true;
        if (stateT <= 0) {
          state = "race";
          if (startBoost) player.speed = TOP_SPEED * 0.85;
          io.sfx.tone(880, 0.3, "square", 0.1);
          say("GO!", 40);
        }
        return;
      }

      if (state === "result") {
        player.speed = Math.max(0, player.speed - 0.08);
        stateT--;
        if (stateT <= 0) {
          if (resultPos <= 3) {
            if (ti >= THEMES.length - 1) {
              state = "won";
              io.win();
              return;
            }
            ti++;
            track = buildTrack(seed, ti, THEMES[ti]);
            resetRace();
          } else if (retries > 0) {
            retries--;
            track = buildTrack(seed, ti, THEMES[ti]);
            resetRace();
          } else {
            state = "over";
            io.gameOver();
          }
        }
        return;
      }

      // ── race ──
      const inp = io.input;
      const steer = (inp.held.left ? -1 : 0) + (inp.held.right ? 1 : 0);
      if (player.item && inp.pressed.b) useItem(io);
      const gas = !!inp.held.a;
      const brake = !player.item && !!inp.held.b;
      const prevJumpT = player.jumpT;
      const evs = stepCar(player, steer, gas, brake, track, oils, r);
      for (const e of evs) {
        if (e === "wall") {
          io.sfx.play("hit");
          say("BONK!", 30);
          puff(player.x, player.y, PAL.white, 6);
          shake = 9;
        } else if (e === "oil") {
          io.sfx.play("bounce");
          say("OIL SLICK!", 40);
          puff(player.x, player.y, "#6a4ea0", 7);
          shake = 6;
        } else if (e === "boost") {
          io.sfx.play("powerup");
          io.sfx.slide?.(220, 660, 0.22, "sawtooth", 0.08);
        } else if (e === "jump") {
          io.sfx.play("jump");
          puff(player.x, player.y, "#e8c89a", 4);
        } else if (e === "splash") {
          io.sfx.play("splash");
          puff(player.x, player.y, "#bfe6ff", 5);
        } else if (e === "shieldpop") {
          io.sfx.play("blip");
          say("SHIELD BLOCKED IT!", 40);
        }
      }
      if (prevJumpT > 0 && player.jumpT <= 0) {
        io.sfx.play("thud");
        puff(player.x, player.y, track.theme.wallCol, 4);
      }
      // engine hum + dust/skid, throttled so they never spam the mixer
      if (engineT <= 0 && player.speed > 0.3) {
        engineT = 9;
        const f = 90 + clamp(player.speed / (TOP_SPEED * 1.5), 0, 1) * 150;
        io.sfx.tone(f, 0.1, "sawtooth", 0.025);
      }
      if (player.surface === "grass" && Math.abs(player.speed) > 1 && frame % 4 === 0) {
        const fx = Math.cos(player.heading);
        const fy = Math.sin(player.heading);
        puff(player.x - fx * 6, player.y - fy * 6, dustColor(track.theme), 2);
      }
      if (player.surface === "track" && Math.abs(player.slip) > 1.4 && player.spin === 0) {
        if (frame % 3 === 0) {
          const fx = Math.cos(player.heading);
          const fy = Math.sin(player.heading);
          marks.push({ x: player.x - fx * 5 - fy * 3, y: player.y - fy * 5 + fx * 3, a: 0.5 });
          marks.push({ x: player.x - fx * 5 + fy * 3, y: player.y - fy * 5 - fx * 3, a: 0.5 });
          if (marks.length > 140) marks.splice(0, marks.length - 140);
        }
        if (screechT <= 0) {
          screechT = 22;
          io.sfx.noise?.(0.14, 0.05, 1400, 700);
        }
      }
      for (const ib of track.itemBoxes) {
        if (ib.cd > 0) {
          ib.cd--;
          continue;
        }
        if (!player.item && dist(player.x, player.y, ib.x, ib.y) < ITEM_RADIUS) {
          player.item = ITEM_KINDS[r.int(0, ITEM_KINDS.length - 1)];
          ib.cd = 320;
          io.sfx.play("coin");
          say(`GOT AN ITEM!`, 35);
        }
      }

      for (const rv of rivals) {
        const ai = aiInput(rv, track, frame);
        stepCar(rv, ai.steer, ai.gas, ai.brake, track, oils, r);
      }
      // gentle push-apart so cars don't stack on each other
      const all = [player, ...rivals];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i];
          const b = all[j];
          const d = dist(a.x, a.y, b.x, b.y);
          if (d > 0 && d < 14) {
            const push = (14 - d) / 2;
            const nx = (a.x - b.x) / d;
            const ny = (a.y - b.y) / d;
            a.x += nx * push;
            a.y += ny * push;
            b.x -= nx * push;
            b.y -= ny * push;
          }
        }

      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        b.x += b.vx;
        b.y += b.vy;
        if (--b.t <= 0) {
          balls.splice(i, 1);
          continue;
        }
        let hit = false;
        for (const rv of rivals) {
          if (rv.spin === 0 && dist(b.x, b.y, rv.x, rv.y) < 11) {
            rv.spin = 50;
            rv.spinDir = r.chance(0.5) ? 1 : -1;
            rv.speed *= 0.4;
            io.score(150);
            io.sfx.play("hit");
            puff(rv.x, rv.y, PAL.yellow, 8);
            hit = true;
            break;
          }
        }
        if (hit) balls.splice(i, 1);
      }
      for (let i = oils.length - 1; i >= 0; i--) if (++oils[i].t > 1200) oils.splice(i, 1);

      rank();
      if (player.pos < prevPlayerPos) io.score(50 * (prevPlayerPos - player.pos));
      prevPlayerPos = player.pos;
      const total = player.lap * track.totalLen + track.cum[player.idx];
      while (total >= nextScoreDist) {
        io.score(10);
        nextScoreDist += 150;
      }
      if (player.lap > 0 && player.lap < LAPS && Math.floor(total) % Math.floor(track.totalLen) < 4 && msgT === 0) {
        say(`LAP ${player.lap + 1}/${LAPS}`, 60);
        io.score(200 * player.lap);
        io.sfx.tone(523 + player.lap * 90, 0.16, "square", 0.09);
      }
      if (player.lap >= LAPS) finishRace(io);
    },

    draw(g: Gfx) {
      if (!camInit) {
        camX = player.x;
        camY = player.y;
        camInit = true;
      }
      const lookAhead = clamp(player.speed, 0, TOP_SPEED) * 3;
      const targetX = player.x + Math.cos(player.heading) * lookAhead;
      const targetY = player.y + Math.sin(player.heading) * lookAhead;
      camX += (targetX - camX) * 0.08;
      camY += (targetY - camY) * 0.08;

      const theme = track.theme;
      g.clear(theme.bg);
      const shx = shake > 0 ? Math.sin(frame * 1.7) * (shake / 9) * 3 : 0;
      const shy = shake > 0 ? Math.cos(frame * 2.3) * (shake / 9) * 3 : 0;
      g.camera(camX - W / 2 + shx, camY - H / 2 + shy);
      const nearCam = (x: number, y: number, r2: number) => (x - camX) * (x - camX) + (y - camY) * (y - camY) < r2 * r2;
      // only trace the kerb/fence for the stretch of circuit the kid is actually near IN ARC
      // LENGTH, not just in raw screen distance — this track is a wobbly star shape, so a far-away
      // loop of the SAME circuit can swing physically close to the camera without crossing it
      // (queryTrack's own comment flags this). Without this check a distant loop's kerb/fence
      // would draw right through the near one's grass, reading as a stray line for no reason.
      const nearArc = (i: number) => circDist(i, player.idx, track.N) <= 20;
      // same idea, but indexed into the much finer kerbPts/kerbCum resample (see buildTrack) — the
      // kerb/racing-line loop below walks a bounded range around this centre directly, rather
      // than scanning the whole (up to 1500-point) array and filtering
      const fineCenter = Math.round((player.idx / track.N) * track.kerbPts.length);

      // a sparse ring of big, soft silhouettes well beyond the fence — the one depth layer this
      // straight-down camera can still show, so the cup never just stops at a flat field edge
      const farSprite = art().far[theme.decor];
      for (const fd of track.far) if (nearCam(fd.x, fd.y, 230)) g.sprite(farSprite, fd.x - 13, fd.y - 8);

      // tiled ground texture under everything (mown grass / rippled sand / snow / pavement /
      // stars) — the mown-stripe pattern is baked seamlessly into the tile itself (see TILE/
      // STRIPE_PX), so plain repeated stamping is all this loop needs to do
      const groundTile = art().ground[ti];
      const left = camX - W / 2 - TILE;
      const top = camY - H / 2 - TILE;
      const x0 = Math.floor(left / TILE) * TILE;
      const y0 = Math.floor(top / TILE) * TILE;
      for (let ty = y0; ty < camY + H / 2 + TILE; ty += TILE) for (let tx = x0; tx < camX + W / 2 + TILE; tx += TILE) g.sprite(groundTile, tx, ty);

      for (const lg of track.lagoons) if (nearCam(lg.x, lg.y, 210)) g.sprite(art().lagoon, lg.x - 11, lg.y - 7);

      // a chunky post-and-rail fence strung along both sides of the circuit, set back from the
      // kerb so it reads as a boundary marker rather than a stray line through the grass. Offsets
      // off the TANGENT's normal (not the radial ox/oy, which can swing hard relative to its
      // neighbour near a sharp bend and turn a big offset into a wild spike) — the tangent turns
      // only as fast as the track itself actually curves, so neighbouring fence points stay
      // neighbours. The rail is TWO parallel strokes (a visible 2px band) and every point gets a
      // small shadowed post, so short stretches read as fencing even before the eye follows the
      // whole run.
      for (let i = 0; i < track.N; i++) {
        const p = track.pts[i];
        if (!nearCam(p.x, p.y, 230) || !nearArc(i)) continue;
        const pn = track.pts[(i + 1) % track.N];
        const nx = -p.ty;
        const ny = p.tx;
        const nnx = -pn.ty;
        const nny = pn.tx;
        for (const side of [-1, 1]) {
          const off = p.hw + GRASS_BAND + 28;
          const offn = pn.hw + GRASS_BAND + 28;
          const fx1 = p.x + nx * side * off;
          const fy1 = p.y + ny * side * off;
          const fx2 = pn.x + nnx * side * offn;
          const fy2 = pn.y + nny * side * offn;
          if (dist(fx1, fy1, fx2, fy2) > 40) continue; // never bridge a stray long gap
          g.line(fx1, fy1, fx2, fy2, shade(theme.fenceCol, -0.3));
          g.line(fx1 + nx * side, fy1 + ny * side, fx2 + nnx * side, fy2 + nny * side, theme.fenceCol);
          g.line(fx1 + nx * side * 2, fy1 + ny * side * 2, fx2 + nnx * side * 2, fy2 + nny * side * 2, theme.fenceCol);
          g.rect(fx1 - 1.5, fy1 - 1, 2, 5, "rgba(0,0,0,0.3)"); // post shadow
          g.rect(fx1 - 1.5, fy1 - 6, 3, 6, "#2a2418"); // a dark post always pops, whatever the rail colour
          g.rect(fx1 - 1, fy1 - 6, 1, 2, shade(theme.fenceCol, 0.2)); // cap highlight
        }
      }

      for (const d of track.decor) if (nearCam(d.x, d.y, 200)) drawDecor(g, d.x, d.y, theme.decor, d.bush);

      // the road: every point along the centreline stamps a slightly-oversized rim disc, then a
      // true-width surface disc on top — stamping every point (not every other) with that much
      // overlap turns the chain of circles into one smooth ribbon with a crisp, constant-width
      // edge, instead of the scalloped "row of dots" look a sparser pass gives
      // (two passes: every rim disc first, then every surface disc — stamping rim + surface per
      // point let each point's rim paint over the previous point's road, leaving brown ring arcs
      // across the track)
      for (let i = 0; i < track.N; i++) {
        const p = track.pts[i];
        if (nearCam(p.x, p.y, 190)) g.circle(p.x, p.y, p.hw + 2, theme.wallCol);
      }
      for (let i = 0; i < track.N; i++) {
        const p = track.pts[i];
        if (!nearCam(p.x, p.y, 190)) continue;
        const col = theme.rainbow ? RAINBOW_BAND[Math.floor(i / 6) % RAINBOW_BAND.length] : theme.trackCol;
        g.circle(p.x, p.y, p.hw, col);
      }
      // baked-in asphalt speckle and old tyre scuffs — scattered once per track, not flat tarmac
      for (const fl of track.flecks) if (nearCam(fl.x, fl.y, 190)) g.rect(fl.x - fl.s / 2, fl.y - fl.s / 2, fl.s, fl.s, fl.c);
      // the racing line AND the kerb both walk the same dense kerbPts resample, so they share ONE
      // bounded walk from fineCenter-70..+70 (the only part of up to 1500 points that could ever
      // be on screen) instead of two separate full-array scans — same visuals, far fewer iterations.
      {
        const fineLen = track.kerbPts.length;
        for (let k = -50; k <= 50; k++) {
          const i = (((fineCenter + k) % fineLen) + fineLen) % fineLen;
          const p = track.kerbPts[i];
          if (!nearCam(p.x, p.y, 190)) continue;
          // a subtle darker "racing line" down the centre of the asphalt — a narrow fixed width
          // at this density overlaps tightly enough to read as one smooth band, not blotches
          const rw = Math.min(p.hw * 0.22, 7);
          g.rect(p.x - rw / 2, p.y - rw / 2, rw, rw, shade(theme.trackCol, -0.06));
          // red-and-white kerb: a SOLID band hugging the true edge (real track points are ~30 px
          // apart — far too sparse to read as anything but dots) plus a thin dark line right on
          // the grass side so the band reads as a kerb, not a dashed border
          const a = Math.floor(track.kerbCum[i] / 6) % 2 ? theme.kerbA : theme.kerbB;
          const kw = p.kerb ? 6 : 5;
          for (const side of [-1, 1]) {
            const ex = p.x + p.ox * side * p.hw;
            const ey = p.y + p.oy * side * p.hw;
            g.rect(ex - kw / 2, ey - kw / 2, kw, kw, a);
            g.rect(ex + p.ox * side * kw - 1.3, ey + p.oy * side * kw - 1.3, 2.6, 2.6, "#1c1a2e");
          }
        }
      }
      // painted chevrons through the bends, pointing the way round
      for (const ar of track.arrows) if (nearCam(ar.x, ar.y, 190)) stampRows(g, ARROW_ROWS, ARROW_PAL, ar.x, ar.y, ar.heading, 2.1);
      // hay bales / tyre stacks guarding the outside of the sharpest corners
      for (const ba of track.barriers) if (nearCam(ba.x, ba.y, 200)) drawBarrier(g, ba.x, ba.y, theme.barrier);
      // finish line banner, chequered the full width of the track, under a lifted starting gantry
      const fp = track.pts[0];
      for (let k = -5; k <= 5; k++) {
        const off = (k / 5) * fp.hw;
        g.rect(fp.x + fp.ox * off - 2, fp.y + fp.oy * off - 2, 4, 4, (k + 5) % 2 ? PAL.black : PAL.white);
      }
      if (nearCam(fp.x, fp.y, 230)) drawGantry(g, fp);
      if (nearCam(fp.x, fp.y, 230)) drawGrandstand(g, fp, frame);
      for (const m of marks) if (nearCam(m.x, m.y, 190)) {
        g.alpha(m.a);
        g.rect(m.x - 1.5, m.y - 1.5, 3, 3, "#1c1a2e");
        g.alpha(1);
      }
      for (const pu of track.puddles) if (nearCam(pu.x, pu.y, 190)) {
        g.alpha(0.65);
        g.circle(pu.x, pu.y, pu.r, "#3a7aa8");
        g.circle(pu.x, pu.y, pu.r * 0.72, "#5ea8d8");
        g.alpha(0.8);
        // a slow-drifting specular streak, like a puddle catching the light
        const sh = Math.sin(frame * 0.03 + pu.x) * pu.r * 0.3;
        g.rect(pu.x - pu.r * 0.4, pu.y - pu.r * 0.3 + sh, pu.r * 0.8, 1.5, "#eaf6ff");
        g.alpha(1);
      }
      for (const bp of track.boosts)
        if (nearCam(bp.x, bp.y, 190)) {
          const c = Math.floor(frame / 6) % 2 ? PAL.cyan : PAL.yellow;
          g.circle(bp.x, bp.y, 8, c);
          g.circle(bp.x, bp.y, 4, PAL.white);
        }
      for (const jp of track.jumps)
        if (nearCam(jp.x, jp.y, 190)) {
          g.circle(jp.x, jp.y, 12, "#e8c89a");
          g.circle(jp.x, jp.y, 7, "#c98a4a");
        }
      for (const ib of track.itemBoxes) if (ib.cd <= 0 && nearCam(ib.x, ib.y, 190)) drawItemBox(g, ib.x, ib.y, frame);
      for (const ol of oils) if (nearCam(ol.x, ol.y, 190)) drawOil(g, ol.x, ol.y);
      for (const b of balls)
        if (nearCam(b.x, b.y, 190)) {
          g.circle(b.x, b.y, 4, PAL.white);
          g.circle(b.x, b.y, 2, PAL.red);
        }

      for (const rv of rivals) if (nearCam(rv.x, rv.y, 190)) drawRacer(g, rv, frame);
      drawRacer(g, player, frame);
      for (const b of bits) g.rect(b.x - 1, b.y - 1, 2, 2, b.c);

      g.camera(0, 0);
      if (theme.snowfall) {
        // a handful of drifting flakes over the whole screen — deterministic from frame + index,
        // never Math.random, so replays and the crash test stay reproducible
        for (let k = 0; k < 16; k++) {
          const sx = (hash2(k, 0, 940) * W + frame * (0.3 + hash2(k, 1, 940) * 0.5)) % W;
          const sy = (hash2(k, 2, 940) * H + frame * (0.7 + hash2(k, 3, 940) * 0.6)) % H;
          g.rect(sx, sy, 1, 1, "rgba(255,255,255,0.8)");
        }
      }
      drawHud(g, track, player, frame, retries);
      drawMiniMap(g, track, player, rivals);
      // event messages live right under the HUD bar, never over the middle of the screen where
      // the kid's own car sits — a "BONK!" banner used to blank it out right over the action
      if (msgT > 0) {
        g.rect(0, 20, W, 10, "rgba(13,11,26,0.6)");
        g.text(msg, W / 2, 22, PAL.yellow, { align: "center" });
      }
      if (state === "count") {
        const n = Math.ceil(stateT / 40);
        g.rect(0, 70, W, 44, "rgba(13,11,26,0.45)");
        g.text(theme.name, W / 2, 76, PAL.white, { align: "center" });
        g.text(n > 0 ? `${n}` : "GO!", W / 2, 90, n > 0 ? PAL.yellow : PAL.lime, { align: "center", size: 2 });
      }
      if (state === "result") {
        g.rect(0, 60, W, 70, "rgba(13,11,26,0.75)");
        const label = resultPos === 1 ? "1ST PLACE!" : resultPos === 2 ? "2ND PLACE!" : resultPos === 3 ? "3RD PLACE!" : "4TH PLACE";
        g.text(label, W / 2, 70, resultPos <= 3 ? PAL.lime : PAL.red, { align: "center", size: 2 });
        const order = [player, ...rivals].slice().sort((a, b) => a.pos - b.pos);
        for (let i = 0; i < order.length; i++) {
          const c = order[i];
          g.text(`${i + 1}.`, 70, 96 + i * 10, PAL.white);
          g.rect(90, 97 + i * 10, 7, 7, c.pal.b);
          g.text(c.isPlayer ? "YOU" : "RIVAL", 104, 96 + i * 10, c.isPlayer ? PAL.yellow : PAL.grey);
        }
        g.text(resultPos <= 3 ? (ti >= THEMES.length - 1 ? "CUP CHAMPION!" : "NEXT TRACK...") : retries > 0 ? `${retries} RETRY LEFT` : "OUT OF RETRIES", W / 2, 122, PAL.white, { align: "center" });
      }
    },
  };
}

function drawRacer(g: Gfx, c: CarT, frame: number) {
  g.sprite(SHADOW_SPRITE(), c.x - 9, c.y - 2);
  // spinning fades the car instead of hiding it outright, so it's never just gone off-screen
  const fading = c.spin > 0 && Math.floor(c.spin / 4) % 2 === 0;
  if (fading) g.alpha(0.4);
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  if (c.boostT > 0) {
    // a layered, flickering flame-coloured trail streaming off the back while boosting
    const flick = Math.sin(frame * 1.3) * 1.2;
    g.circle(c.x - fx * 8, c.y - fy * 8, 5 + flick * 0.3, "#b8262e");
    g.circle(c.x - fx * 10, c.y - fy * 10, 4 + flick * 0.4, PAL.orange);
    g.circle(c.x - fx * 13, c.y - fy * 13, 2.6 + flick * 0.3, PAL.yellow);
  } else if (Math.abs(c.speed) > 1.5 && Math.floor(frame / 5) % 2 === 0) {
    // a little puff of exhaust at a steady cruise, so the kart never looks like it's gliding
    g.alpha(0.35);
    g.circle(c.x - fx * 7, c.y - fy * 7, 1.6, PAL.grey);
    g.alpha(1);
  }
  // wheels flicker between two shades as the kart rolls, a cheap stand-in for spinning spokes
  const wheelPal = Math.floor(c.wheelPhase / 5) % 2 ? c.pal : { ...c.pal, k: shade(c.pal.k, 0.22) };
  drawKart(g, c.x, c.y, c.heading, KART_SCALE)(wheelPal);
  if (fading) g.alpha(1);
  if (c.isPlayer) {
    // a bright pin above the kid's own kart so it's always easy to pick out from the rivals
    const bob = Math.sin(frame * 0.15) * 1.5;
    g.rect(c.x - 1, c.y - 26 + bob, 2, 3, PAL.yellow);
    g.rect(c.x - 2, c.y - 23 + bob, 4, 2, PAL.yellow);
    g.rect(c.x - 3, c.y - 21 + bob, 6, 2, PAL.yellow);
    // two little paint-job sparkle stars on the hood, like a toy car's decal shine
    if (Math.floor(frame / 24) % 2 === 0) drawSparkle(g, c.x - 6, c.y - 3, 3);
    drawSparkle(g, c.x + 5, c.y + 2, Math.floor(frame / 24) % 2 === 0 ? 2 : 3);
  }
  if (c.shield) {
    g.alpha(0.5);
    g.circle(c.x, c.y, 13 + Math.sin(frame * 0.2) * 1.2, PAL.cyan);
    g.alpha(1);
  }
}
let SHADOW: Sprite | null = null;
const SHADOW_SPRITE = () => (SHADOW ??= bakeShadow(18, 9, "#000000"));

/** a tiny 4-point sparkle, the kind painted on a toy racer's bodywork */
function drawSparkle(g: Gfx, x: number, y: number, s: number) {
  g.rect(x - 0.5, y - s, 1, s * 2, PAL.white);
  g.rect(x - s, y - 0.5, s * 2, 1, PAL.white);
}

/** a shiny "? box" that reads as a spinning cube: the front face narrows and swaps side to side
 *  (a cheap billboard spin) with a diagonal highlight sweeping across it */
function drawItemBox(g: Gfx, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.1) * 2;
  const spin = Math.sin(frame * 0.07);
  const yy = y - 6 + bob;
  const faceW = 7 + spin * 3;
  g.rect(x - 6, yy - 6, 12, 12, "#8a4a10");
  g.rect(x - faceW / 2, yy - 5, faceW, 10, PAL.orange);
  g.box(x - faceW / 2, yy - 5, faceW, 10, "#5a2e08");
  const sweep = ((frame * 1.5) % 24) - 6;
  if (Math.abs(sweep) < faceW / 2 + 3) g.rect(x - faceW / 2 + sweep, yy - 5, 1.5, 10, "#ffe9b8");
  g.text("?", x, yy - 3, PAL.white, { align: "center" });
}

function drawOil(g: Gfx, x: number, y: number) {
  g.circle(x, y, 7, "#2a2240");
  g.circle(x - 2, y - 1, 2, PAL.purple);
  g.circle(x + 2, y + 2, 1.5, PAL.purple);
}

/** baked scenery, feet planted on the ground with a soft dithered shadow (candy stars just float).
 *  A third of spots grow a low round bush instead of the theme's tall tree, for variety. */
function drawDecor(g: Gfx, x: number, y: number, kind: Theme["decor"], bush: boolean) {
  if (bush && kind !== "star") {
    const bs = art().bush;
    g.sprite(art().shadow, x - 7, y - 2);
    g.sprite(bs, x - 8, y - 9);
    return;
  }
  const s = art().decor[kind];
  const w = s.rows[0]?.length ?? 0;
  const h = s.rows.length;
  if (kind === "star") {
    const bob = Math.sin((x + y) * 0.05) * 1.5;
    g.sprite(s, x - w / 2, y - h / 2 + bob);
    return;
  }
  g.sprite(art().shadow, x - 7, y - 3);
  g.sprite(s, x - w / 2, y - h + 5);
}

/** a hay bale or tyre stack guarding a corner's outside edge */
function drawBarrier(g: Gfx, x: number, y: number, kind: "hay" | "tyre") {
  const s = kind === "hay" ? art().hay : art().tyre;
  const w = s.rows[0]?.length ?? 0;
  const h = s.rows.length;
  g.sprite(art().shadow, x - 7, y - 2);
  g.sprite(s, x - w / 2, y - h + 4);
}

/** a chequered starting gantry straddling the start/finish line — drawn with a fixed "lift" in
 *  world-y, the cheap trick this top-down view uses everywhere to suggest something stands tall */
function drawGantry(g: Gfx, fp: TrackPt) {
  const lift = 30;
  for (const side of [-1, 1]) {
    const px = fp.x + fp.ox * side * (fp.hw + 8);
    const py = fp.y + fp.oy * side * (fp.hw + 8);
    g.rect(px - 2, py - lift, 4, lift + 6, "#3a3d52");
    g.rect(px - 3, py - lift - 5, 6, 6, PAL.yellow);
    g.rect(px - 1, py - lift - 9, 2, 5, side > 0 ? PAL.red : PAL.cyan);
  }
  for (let k = -6; k <= 6; k++) {
    const off = (k / 6) * (fp.hw + 8);
    const bx = fp.x + fp.ox * off;
    const by = fp.y + fp.oy * off - lift;
    g.rect(bx - 3, by - 4, 6, 7, (k + 6) % 2 ? PAL.black : PAL.white);
  }
}

/** a real little grandstand beside the start line — tiered fans over a panelled wall under a
 *  striped roof overhang, flickering a few brighter heads each "wave" (about as much life as a
 *  straight-down camera can show) */
function drawGrandstand(g: Gfx, fp: TrackPt, frame: number) {
  const off = fp.hw + 66;
  const bx = fp.x - fp.tx * 24 + fp.ox * off;
  const by = fp.y - fp.ty * 24 + fp.oy * off;
  const crowd = art().crowd[Math.floor(frame / 24) % 2];
  g.sprite(art().shadow, bx - 20, by + 8);
  g.sprite(crowd, bx - 28, by - 10);
  g.sprite(art().standRoof, bx - 30, by - 18);
}

function drawHud(g: Gfx, track: TrackData, player: CarT, frame: number, retries: number) {
  // two rows so short labels never run into each other (position+lap+retries on row 1, the
  // track name alone on row 2 — a single crowded row used to read as "LAP 1/3MEADOW CUP")
  g.rect(0, 0, W, 20, "rgba(13,11,26,0.65)");
  g.rect(0, 19, W, 1, "rgba(255,255,255,0.25)");
  const medal = player.pos === 1 ? PAL.yellow : player.pos === 2 ? "#d8d8e8" : player.pos === 3 ? "#cf8a4a" : "#4a4e6a";
  g.rect(2, 2, 22, 9, medal);
  const ord = player.pos === 1 ? "1ST" : player.pos === 2 ? "2ND" : player.pos === 3 ? "3RD" : "4TH";
  g.text(ord, 4, 3, player.pos <= 3 ? PAL.black : PAL.white);
  g.text(`LAP ${Math.min(player.lap + 1, LAPS)}/${LAPS}`, 32, 3, PAL.white);
  g.text(`RETRY ${retries}`, W - 4, 3, PAL.grey, { align: "right" });
  g.text(track.theme.name, W / 2, 12, PAL.grey, { align: "center" });
  // item slot, bottom-left — a small checkered flag swatch marks it as "the box" at a glance
  g.rect(4, H - 18, 16, 14, "rgba(13,11,26,0.6)");
  g.box(4, H - 18, 16, 14, PAL.white);
  if (player.item) drawItemIcon(g, player.item, 12, H - 11);
  if (player.shield && Math.floor(frame / 10) % 2) g.text("SHIELD", 24, H - 15, PAL.cyan);
}

function drawItemIcon(g: Gfx, item: Item, x: number, y: number) {
  if (item === "ball") {
    g.circle(x, y, 4, PAL.white);
    g.circle(x, y, 1.5, PAL.dark);
  } else if (item === "oil") {
    g.circle(x, y, 4, "#2a2240");
    g.circle(x - 1, y - 1, 1, PAL.purple);
  } else if (item === "turbo") {
    g.circle(x, y, 4, PAL.orange);
    g.circle(x, y, 2, PAL.yellow);
  } else {
    g.circle(x, y, 4, PAL.cyan);
    g.rect(x - 1, y - 3, 2, 6, PAL.white);
  }
}

function drawMiniMap(g: Gfx, track: TrackData, player: CarT, rivals: CarT[]) {
  const cx = W - 32;
  const cy = H - 32;
  const scale = 26 / track.maxR;
  g.rect(cx - 30, cy - 30, 60, 60, "rgba(13,11,26,0.86)");
  g.box(cx - 30, cy - 30, 60, 60, PAL.white);
  for (let i = 0; i < track.N; i += 5) {
    const p = track.pts[i];
    g.rect(cx + p.x * scale - 1, cy + p.y * scale - 1, 2, 2, PAL.grey);
  }
  for (const rv of rivals) g.rect(cx + rv.x * scale - 1, cy + rv.y * scale - 1, 2, 2, rv.pal.b);
  g.rect(cx + player.x * scale - 1.5, cy + player.y * scale - 1.5, 3, 3, PAL.yellow);
}

export const miniRacers: RetroGameDef = {
  id: "mini-racers",
  title: "Mini Racers",
  blurb: "Race toy cars round 6 wild circuits — drift, boost and bash your rivals!",
  genre: "Racing",
  emoji: "🏎️",
  color: "#3c6cf0",
  controls: "◀ ▶ steer · A gas · B use item (or brake) · grab ? boxes · top 3 to advance!",
  pad: { dpad: "lr", a: "Gas", b: "Item" },
  create,
};
