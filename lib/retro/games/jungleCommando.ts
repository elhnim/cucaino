// JUNGLE COMMANDO — a side-scrolling run-and-gun. Run right through the jungle, jump the
// pits, blast robot soldiers, turrets and drones, grab weapon capsules and take down the
// giant Robo Fortress at the end. (Original game in the spirit of 8-bit run-and-guns.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";
import { bake, drawStrip, fbm, hash2, mixHex, outlined, shade, tinted } from "../art";

const T = 16; // tile size
const COLS = 210;
const GROUND = 11; // default ground row
const GRAV = 0.26;

const pad = (w: number, s: string) => (s.length >= w ? s.slice(0, w) : s + ".".repeat(w - s.length));
const rowsOf = (w: number, lines: string[]) => lines.map((l) => pad(w, l));

const mirror = (lines: string[]) => lines.map((l) => l.split("").reverse().join(""));

// ── hero: brown hair, green shirt, blue trousers, backpack, gun — bigger (~22px tall, outlined) ──
const HC = {
  h: "#5a3a24",
  j: shade("#5a3a24", 0.3),
  t: PAL.tan,
  u: shade(PAL.tan, -0.3),
  g: "#36c653",
  f: shade("#36c653", 0.38),
  o: shade("#36c653", -0.38),
  b: "#2f5fae",
  v: shade("#2f5fae", -0.32),
  p: "#7a5230",
  q: shade("#7a5230", -0.3),
  m: PAL.grey,
  n: shade(PAL.grey, -0.45),
  k: PAL.black,
  w: PAL.white,
};
const HERO_TORSO = [
  ".......hhhh.......",
  "......hjhhhj......",
  ".....htttttth.....",
  ".....tt.k.tt......",
  ".....ttktkt t.....",
  ".....tuuuuut......",
  "....ttuuuuutt.....",
  "...pgggggggg......",
  "..ppggfggfggmmn...",
  "..pqogggggggomm...",
  "..pqoggggggoo.....",
  "...qoggggggoo.....",
  "....oobbbbbboo....",
];
const LEG_STAND = ["....bbbbbbbb......", "....bb....bb.....", "....bb....bb.....", "....vv....vv.....", "....vv....vv.....", "....kk....kk.....", "....kk....kk....."];
const LEG_STRIDE = [
  "....bbbbbbbb......",
  "....bb....bbb....",
  "...bb......bb....",
  "..vv........vv...",
  "..vv.........v...",
  ".kk...........k..",
  "................."];
const LEG_STRIDE2 = mirror(LEG_STRIDE);
const LEG_TUCK = ["....bbbbbbbb......", "....bbb..bbb.....", "....vbv..vbv.....", "....kk....kk.....", ".................", ".................", "................."];
const mkHero = (legs: string[]) => outlined(sprite(rowsOf(19, [...HERO_TORSO, ...legs]), HC));
const HERO_RUN = [mkHero(LEG_STAND), mkHero(LEG_STRIDE), mkHero(LEG_STAND), mkHero(LEG_STRIDE2)];
const HERO_JUMP = mkHero(LEG_TUCK);
const HERO_UP = outlined(
  sprite(
    rowsOf(19, [
      ".........mm.......",
      ".........mm.......",
      "........hhhh......",
      ".......hjhhhj......",
      "......htttttth.....",
      "......tt.k.tt......",
      "......tuuuuut......",
      ".....ttuuuuutt.....",
      "....pgggggggg......",
      "...ppggggggggmm....",
      "...pqoggggggoo.....",
      "....qoggggggoo.....",
      ".....oobbbbbboo....",
      ".....bbbbbbbbbb....",
      "......bb....bb.....",
      "......vv....vv.....",
      "......kk....kk.....",
    ]),
    HC,
  ),
);
const HERO_DUCK = outlined(
  sprite(
    rowsOf(19, [
      "......hhhh........",
      ".....htttth.......",
      ".....tt.k.tt......",
      ".....tuuuut.......",
      "....ttuuuutt......",
      "...pgggggggmmn....",
      "..pqogggggggomm...",
      "..pqoggggggggoo...",
      "...qoggggggggoo...",
      "....oobbbbbbboo...",
      "....bb......bb....",
      "....kk......kk....",
    ]),
    HC,
  ),
);

// ── purple armoured soldier bots (scaled to match the hero) ──
const BP = { k: PAL.black, d: PAL.grey, y: PAL.yellow, r: PAL.purple, f: shade(PAL.purple, 0.32), o: shade(PAL.purple, -0.32), m: PAL.grey, n: shade(PAL.grey, -0.4) };
const botRows = (stride: boolean) =>
  rowsOf(17, [
    ".....kkkk........",
    "....dyyyyd.......",
    "....dddddd.......",
    ".....dddd........",
    "...rrrrrrrrrr....",
    "..rrfrrrfrrrr....",
    "..rrrrrrrrrrr....",
    "..rrrrrrrrrr.mn..",
    "...oorrrroo...n..",
    "...oo....oo......",
    "...dd....dd......",
    stride ? "..dd......dd...." : "...dd....dd......",
    stride ? "..rr......rr...." : "...rr....rr......",
    stride ? "..rr......rr...." : "...rr....rr......",
    stride ? ".kk........kk..." : "...kk....kk......",
  ]);
const BOT = [outlined(sprite(botRows(false), BP)), outlined(sprite(botRows(true), BP))];

// ── purple wall turret on a riveted metal bunker ──
const TP = { k: PAL.black, p: PAL.purple, y: PAL.yellow, r: PAL.red, m: PAL.grey, d: shade(PAL.grey, -0.3) };
const TURRET = outlined(
  sprite(
    rowsOf(20, [
      "......kkkkk........",
      ".....kppppppk......",
      "....kpyyyyyyypk....",
      "....kpyyrrrypk.....",
      "....kpyyyyyyypk....",
      "...kppppppppppk...",
      "..kmmmmmmmmmmmmk..",
      ".kmdmdmdmdmdmdmk..",
      ".kmmmmmmmmmmmmmk..",
      ".kmdmdmdmdmdmdmk..",
      "kmmmmmmmmmmmmmmmk.",
      "kkkkkkkkkkkkkkkkk.",
    ]),
    TP,
  ),
);

// ── pink flying drone ──
const DP = { k: PAL.black, b: PAL.pink, w: PAL.white, g: shade(PAL.pink, -0.3) };
const droneRows = (up: boolean) =>
  rowsOf(20, [
    up ? "..kk............kk." : "...k..............k",
    "..kkkkkkkkkkkkkkkk..",
    ".kbbbbbbbbbbbbbbbbk.",
    "kbbwwbbbbbbbbwwbbbbk",
    ".kggggggggggggggk...",
    "..kkkkkkkkkkkkkk....",
  ]);
const DRONE = [outlined(sprite(droneRows(false), DP)), outlined(sprite(droneRows(true), DP))];

// ── gold weapon capsule ──
const CP = { k: PAL.black, y: PAL.orange, g: PAL.yellow, w: PAL.white };
const CAPSULE = outlined(
  sprite(rowsOf(14, [".kkkkkkkkkk.", "kgyyyyyyyygk", "kyyywwwwyyyk", "kyyyyyyyyyyk", "kyyyyyyyyyyk", "kgyyyyyyyygk", ".kkkkkkkkkk."]), CP),
);

// ── damaged cannon turret on the Robo Fortress ──
const CANNON = sprite(rowsOf(18, ["....kkkkkk......", "...kmmmmmmk.....", "..kmmddddmmk....", "..kmddkkddmk....", "..kmmddddmmk....", "...kmmmmmmk....."]), {
  k: PAL.black,
  m: PAL.dark,
  d: shade(PAL.dark, -0.25),
});
const CANNON_DEAD = tinted(CANNON, shade(PAL.dark, -0.5));

type Weapon = "N" | "S" | "R";
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Enemy {
  kind: "bot" | "turret" | "drone";
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  t: number;
  w: number;
  h: number;
  baseY?: number;
}
// e.w/e.h are the (bigger, drawn-to-match-the-art) boxes used when the hero SHOOTS an enemy —
// easier to hit is fine. Touching the hero only hurts within the smaller original box below,
// centred inside the bigger one, so bigger art never makes the game harder to survive.
const CONTACT_SIZE: Record<Enemy["kind"], [number, number]> = { bot: [10, 10], turret: [12, 10], drone: [12, 7] };
const contactBox = (e: Enemy) => {
  const [cw, ch] = CONTACT_SIZE[e.kind];
  return { x: e.x + (e.w - cw) / 2, y: e.y + (e.h - ch) / 2, w: cw, h: ch };
};
interface Pickup {
  x: number;
  y: number;
  vy: number;
  kind: Weapon | "L";
  flying: boolean;
  t: number;
}
interface Boom {
  x: number;
  y: number;
  t: number;
  big: boolean;
}

function buildLevel(seed: number) {
  const r = rng(seed);
  const ground: number[] = new Array(COLS).fill(GROUND);
  const platforms: { x: number; y: number; w: number }[] = [];
  const turrets: { col: number; row: number }[] = [];
  let col = 18;
  let h = GROUND;
  while (col < COLS - 30) {
    const feature = r.int(0, 5);
    if (feature === 0 && col > 24) {
      // a pit with a platform over it sometimes
      const w = r.int(2, 3);
      for (let i = 0; i < w; i++) ground[col + i] = 99;
      if (r.chance(0.5)) platforms.push({ x: (col - 1) * T, y: (h - 3) * T, w: (w + 2) * T });
      col += w;
    } else if (feature === 1) {
      h = clamp(h + r.pick([-1, 1]), 9, 12);
    } else if (feature === 2) {
      platforms.push({ x: col * T, y: (h - r.int(3, 4)) * T, w: r.int(3, 5) * T });
      if (r.chance(0.45)) turrets.push({ col: col + 1, row: h - 4 });
    } else if (feature === 3) {
      turrets.push({ col, row: h });
    }
    const run = r.int(3, 7);
    for (let i = 0; i < run && col < COLS; i++, col++) if (ground[col] !== 99) ground[col] = h;
  }
  for (; col < COLS; col++) ground[col] = GROUND; // flat arena for the boss
  for (let c = 0; c < 18; c++) ground[c] = GROUND;
  return { ground, platforms, turrets };
}

// a circle with a jagged, leafy rim (radius jitters per angular sector instead of being perfectly
// round) — the basic unit a messy jungle canopy is built from
function jagged(dx: number, dy: number, r: number, seed: number) {
  const ang = Math.atan2(dy, dx);
  const sector = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 10);
  const jag = 0.8 + hash2(sector, seed) * 0.35;
  return dx * dx + dy * dy <= r * r * jag * jag;
}
/** 3-6 overlapping, differently-sized leaf blobs clustered around one point — a messy clump of
 *  foliage rather than one perfect sphere */
function leafClump(cx: number, cy: number, baseR: number, seed: number) {
  const n = 3 + Math.floor(hash2(seed, 1) * 4);
  return Array.from({ length: n }, (_, j) => {
    const a = hash2(seed, j + 20) * 6.283;
    const dist = hash2(seed, j + 40) * baseR * 0.6;
    const r = baseR * (0.55 + hash2(seed, j + 60) * 0.55);
    return { ox: cx + Math.cos(a) * dist, oy: cy + Math.sin(a) * dist * 0.8, r, seed: seed * 37 + j };
  });
}

// ── rows of dense, irregular jungle tree crowns — clumps of overlapping jagged leaf blobs that
// overlap their neighbours too, not a smooth ridge or a row of perfect balls ──
function crownField(w: number, h: number, baseline: number, n: number, rLo: number, rHi: number, seedOff: number, greens: string[]) {
  const blobs = Array.from({ length: n }, (_, i) => {
    const cx = ((i + 0.5) / n) * w + (hash2(i, seedOff) - 0.5) * (w / n) * 1.1;
    const r = rLo + hash2(i, seedOff + 99) * (rHi - rLo);
    const cy = baseline - r * (0.25 + hash2(i, seedOff + 51) * 0.4);
    const tone = Math.floor(hash2(i, seedOff + 7) * greens.length);
    return leafClump(cx, cy, r, i + seedOff * 7919).map((b) => ({ ...b, tone }));
  }).flat();
  return bake(w, h, (x, y) => {
    let col: string | null = null;
    for (const b of blobs) {
      for (const ox of [-w, 0, w]) {
        const dx = x - (b.ox + ox);
        const dy = y - b.oy;
        if (jagged(dx, dy, b.r, b.seed)) {
          const nx = dx / b.r;
          const ny = dy / b.r;
          const light = Math.max(-0.42, Math.min(0.42, -(nx * 0.55 + ny * 0.55)));
          col = shade(greens[b.tone], light);
        }
      }
    }
    return col;
  });
}

// ── tropical mid-jungle: tree trunks, round crowns and spiky-fronded palms, between the two
// crown rows so the jungle reads as actual trees/palms rather than smooth bushes ──
function jungleMid(w: number, h: number, baseline: number, n: number, seedOff: number, greens: string[]) {
  type Tree = { x: number; trunkH: number; palm: boolean; tone: number; fronds: { x: number; y: number }[]; blobs: { ox: number; oy: number; r: number; seed: number; tone: number }[] };
  const trees: Tree[] = Array.from({ length: n }, (_, i) => {
    const x = ((i + 0.5) / n) * w + (hash2(i, seedOff) - 0.5) * (w / n) * 0.9;
    const trunkH = 36 + hash2(i, seedOff + 1) * 34;
    const palm = hash2(i, seedOff + 2) < 0.55;
    const r = 13 + hash2(i, seedOff + 3) * 9;
    const tone = Math.floor(hash2(i, seedOff + 4) * greens.length);
    const fronds: { x: number; y: number }[] = [];
    let blobs: { ox: number; oy: number; r: number; seed: number; tone: number }[] = [];
    if (palm) {
      const apexY = baseline - trunkH;
      const fcount = 5 + Math.floor(hash2(i, seedOff + 5) * 3);
      for (let f = 0; f < fcount; f++) {
        const ang = -Math.PI / 2 + ((f + 0.5) / fcount - 0.5) * Math.PI * 1.5 + (hash2(i, f + seedOff) - 0.5) * 0.25;
        const len = 13 + hash2(i, f + seedOff + 9) * 9;
        for (let s = 2; s <= 9; s++) {
          const t = s / 9;
          fronds.push({ x: x + Math.cos(ang) * len * t, y: apexY + Math.sin(ang) * len * t * 0.75 + t * t * 3 });
        }
      }
    } else {
      blobs = leafClump(x, baseline - trunkH * 0.75, r, i + seedOff * 6151).map((b) => ({ ...b, tone }));
    }
    return { x, trunkH, palm, tone, fronds, blobs };
  });
  return bake(w, h, (px, py) => {
    // leaves first (so a trunk pixel that falls under a leaf blob stays hidden, as it should)
    for (const t of trees)
      for (const ox of [-w, 0, w]) {
        if (t.palm) {
          for (const p of t.fronds) {
            const dx = px - (p.x + ox);
            const dy = py - p.y;
            if (dx * dx + dy * dy <= 2.6) return greens[t.tone];
          }
        } else {
          for (const b of t.blobs) {
            const dx = px - (b.ox + ox);
            const dy = py - b.oy;
            if (jagged(dx, dy, b.r, b.seed)) {
              const nx = dx / b.r;
              const ny = dy / b.r;
              const light = Math.max(-0.4, Math.min(0.4, -(nx * 0.5 + ny * 0.5)));
              return shade(greens[b.tone], light);
            }
          }
        }
      }
    for (const t of trees)
      for (const ox of [-w, 0, w])
        if (Math.abs(px - (t.x + ox)) <= 1.4 && py > baseline - t.trunkH * 0.65 && py <= baseline + 2)
          return shade("#4a3018", ((baseline - py) / t.trunkH) * -0.25);
    return null;
  });
}

// ── big painted backdrop, baked once (lazily — never at module load) ──
function makeArt() {
  const sky = bake(W, 150, (x, y) => {
    const t = y / 149;
    return mixHex("#2f86df", "#d8f3ff", t);
  });
  const clouds = bake(260, 34, (x, y) => {
    const blobs = [
      { cx: 30, cy: 14, r: 10 },
      { cx: 42, cy: 10, r: 8 },
      { cx: 20, cy: 18, r: 8 },
      { cx: 150, cy: 10, r: 9 },
      { cx: 164, cy: 15, r: 7 },
      { cx: 210, cy: 18, r: 11 },
      { cx: 226, cy: 13, r: 8 },
    ];
    for (const b of blobs) {
      const dx = x - b.cx;
      const dy = y - b.cy;
      if (dx * dx + dy * dy <= b.r * b.r) return dy > b.r * 0.2 ? "#dff3ff" : "#ffffff";
    }
    return null;
  });
  // a small, bluer, hazier distant range (2-3 peaks) + the Robo Fortress's own silhouette on a
  // rise to its right, both parallaxed so slowly (drawn at 0.05-0.1 in draw()) that the fortress
  // — the goal the kid is walking toward — sits in view in the sky from the very first frame
  const MTN_W = 300;
  const MTN_PEAKS = [
    { cx: 40, h: 28, w: 46 },
    { cx: 92, h: 40, w: 55 },
    { cx: 130, h: 24, w: 36 },
  ];
  const wrapDist = (x: number, cx: number) => Math.min(Math.abs(x - cx), MTN_W - Math.abs(x - cx));
  // a castle-robot silhouette, far off on its own cliff: a tall central keep (crenellations, a
  // robot face — two glowing eyes + a grille — an antenna), two shorter crenellated side towers
  // with their own antennae, on a dark rocky base; FX0 is where it sits within the mountain tile
  const FORTRESS_FX0 = 178;
  const fortressPx = (fx: number, fy: number): string | null => {
    if (fx < 0 || fx >= 50 || fy < 0) return null;
    if ((fx === 24 || fx === 25) && fy < 8) return fy === 0 ? "#ff5a6a" : "#33334a";
    if (fx === 7 && fy < 12) return "#33334a";
    if (fx === 44 && fy < 12) return "#33334a";
    const cliffTop = 27 + Math.floor(hash2(Math.floor(fx / 3), 850) * 3);
    if (fy >= cliffTop) return shade("#3a3226", ((33 - fy) / 6) * -0.15 + 0.08);
    if (fx >= 18 && fx <= 30) {
      const lx = fx - 18;
      if (fy < 8) return lx % 3 === 0 ? null : "#2a2a3a";
      if (fy >= 13 && fy <= 14 && (lx === 3 || lx === 9)) return "#ff5a6a"; // robot eyes
      if (fy >= 16 && fy <= 19 && fy % 2 === 0 && lx >= 2 && lx <= 10) return shade("#2a2a3a", -0.25); // grille
      return "#2a2a3a";
    }
    if ((fx >= 2 && fx <= 13) || (fx >= 37 && fx <= 48)) {
      const lx = fx >= 37 ? fx - 37 : fx - 2;
      if (fy < 13) return null;
      if (fy < 16) return lx % 3 === 0 ? null : "#2a2a3a"; // crenellations
      return "#2a2a3a";
    }
    return null;
  };
  const mtnFar = bake(MTN_W, 62, (x, y) => {
    const peak = Math.max(...MTN_PEAKS.map((p) => p.h * Math.exp(-((wrapDist(x, p.cx) / p.w) ** 2))));
    const base = 9 + 3 * Math.sin((x / MTN_W) * 2 * Math.PI * 3); // low ridge, periodic -> tiles with no seam
    const h = base + peak;
    const rock = fbm(x * 0.07, y * 0.1, 2, 900) * 6 - 3; // gentle low-freq rock texture, no stripes
    const fortress = fortressPx(x - FORTRESS_FX0, y - 30);
    if (fortress) return fortress === "#ff5a6a" ? fortress : mixHex(fortress, "#b6cbea", 0.34);
    if (y > 62 - h + rock * 0.3) {
      const depth = y - (62 - h);
      const col = mixHex("#4a63b8", "#8098d6", Math.min(1, depth / 34));
      const haze = Math.max(0, 1 - y / 62) * 0.22 + 0.1;
      return shade(mixHex(col, "#e4f0ff", haze), rock * 0.02);
    }
    return null;
  });
  // a waterfall catching the light on a cliff in the mid-ground — the painting's signature,
  // animated via 2 alternating baked frames swapped a few times a second in draw()
  const midFall = (phase: number) =>
    bake(256, 96, (x, y) => {
      const cx = 150;
      const cliffW = 34;
      if (x < cx - cliffW / 2 - 10 || x > cx + cliffW / 2 + 10 || y < 10) return null;
      const lx = x - (cx - cliffW / 2);
      const mist = y > 80 ? Math.max(0, 1 - (y - 80) / 16) : 0;
      if (lx > cliffW * 0.3 && lx < cliffW * 0.7) {
        const n = fbm(x * 0.5 + phase * 8, y * 0.22, 2, 500);
        const c = n > 0.62 ? "#ffffff" : n > 0.34 ? "#cdeeff" : "#8fd0f0";
        return mist > 0.3 ? mixHex(c, "#eaf6ff", mist) : c;
      }
      if (lx < 0 || lx > cliffW) return mist > 0.5 ? "#eaf6ff" : null;
      const n2 = fbm(x * 0.25, y * 0.2, 2, 501);
      const base = n2 > 0.6 ? "#6a5a48" : "#584636";
      return mist > 0.4 ? mixHex(base, "#eaf6ff", mist * 0.5) : base;
    });
  const midFallTiles = [midFall(0), midFall(1)];
  const crownsBack = crownField(256, 88, 82, 7, 20, 28, 11, ["#1f5a3c", "#245f3e", "#1a4e34"]);
  const jungleTrunks = jungleMid(256, 100, 96, 8, 333, ["#1d6b52", "#2f8a66", "#175a44", "#3aa374"]);
  const crownsFront = crownField(256, 108, 104, 6, 28, 40, 212, ["#2f7a46", "#368a4c", "#296e3e", "#3f9a56"]);
  // canopy fringe at the top, with a few hanging vines/lianas dropping into the scene
  const canopy = bake(256, 110, (x, y) => {
    const big = x > 170 && x < 230; // one big frond cluster per period
    const hang = (big ? 20 : 8) + fbm(x * 0.05, 2, 2, 31) * (big ? 16 : 22);
    if (y <= hang) {
      const edge = hang - y;
      return edge < 2 ? "#0e2a1c" : edge < 11 ? "#163a28" : "#1f4a32";
    }
    const vx = Math.floor(x / 34);
    const vineX = vx * 34 + 16 + Math.sin(vx * 12.9) * 5;
    if (Math.abs(x - vineX) < 1.1 && hash2(vx, 77) > 0.72) {
      const len = 16 + hash2(vx, 78) * 26;
      const vy = y - hang;
      if (vy > 0 && vy < len) return shade("#1f4a32", -0.1 + Math.sin(vy * 0.2) * 0.08);
      if (vy >= len && vy < len + 4 && hash2(vx, 79) > 0.3) return "#2f6a46";
    }
    return null;
  });
  const bigFrond = sprite(
    rowsOf(16, [
      "..gg....gg......",
      ".gfgg..ggfg.....",
      "gg.gg..gg.gg....",
      "g...ggg...g.....",
      "....ggg.........",
      ".....ng.........",
      ".....nn.........",
      "....nnn.........",
      "....nn..........",
      "...nnn..........",
      "...nn...........",
      "..nnn...........",
      "..nn............",
      ".nn.............",
    ]),
    { g: "#1b6a35", f: "#2f8a44", n: "#4a3018" },
  );
  const cliffTile = (variant: number) =>
    bake(16, 64, (x, y) => {
      const capBottom = 4 + Math.round(fbm(x * 0.3, variant * 9, 2, 300) * 3);
      if (y < capBottom) return y < 1 ? "#bff25a" : shade(PAL.green, (capBottom - y) / capBottom - 0.2);
      if (y < capBottom + 3 && fbm(x * 0.4, y + variant * 5, 2, 301) > 0.55) return shade(PAL.green, -0.35); // hanging tuft
      const block = Math.floor((x + variant * 3) / 8) + Math.floor(y / 10);
      const crack = (x + variant * 2) % 8 === 0 || (y + variant * 3) % 10 === 0;
      const base = block % 2 === 0 ? "#6a5338" : "#5c452c";
      if (crack) return shade(base, -0.3);
      return fbm(x * 0.3, y * 0.3, 2, 302 + variant) > 0.82 ? shade(base, 0.12) : base;
    });
  const cliffTiles = [cliffTile(0), cliffTile(1), cliffTile(2)];
  const fgLeaves = bake(220, 34, (x, y) => {
    // two big dark banana leaves anchored at the corners (wrap-safe), smaller humps between
    const corner = [
      { cx: 0, r: 30, h: 1.3 },
      { cx: 220, r: 30, h: 1.3 },
    ];
    for (const b of corner) {
      const dx = (x - b.cx) / b.r;
      const dy = (y - 34) / (b.r * b.h);
      if (dx * dx + dy * dy <= 1) return y > 34 - b.r * 0.4 * b.h ? "#081f10" : "#0e2a16";
    }
    const blobs = [
      { cx: 40, r: 17, h: 0.85 },
      { cx: 78, r: 14, h: 0.75 },
      { cx: 115, r: 20, h: 1 },
      { cx: 155, r: 15, h: 0.8 },
      { cx: 190, r: 19, h: 0.95 },
    ];
    for (const b of blobs) {
      const dx = (x - b.cx) / b.r;
      const dy = (y - 34) / (b.r * b.h);
      if (dx * dx + dy * dy <= 1) return y > 34 - b.r * 0.3 * b.h ? "#0e3a1c" : "#153d22";
    }
    const flower = [
      { cx: 30, cy: 14 },
      { cx: 110, cy: 11 },
      { cx: 165, cy: 15 },
    ];
    for (const f of flower) {
      const dx = x - f.cx;
      const dy = y - f.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 2) return PAL.yellow;
      if (d2 <= 10) return "#e8344a";
    }
    return null;
  });
  const rockDeco = sprite(["kggg", "gggk"], { g: "#8a8878", k: shade("#8a8878", -0.3) });
  const fernDeco = sprite(["..g.g..", ".ggggg.", "gggggGg"], { g: "#245f3e", G: shade(PAL.teal, 0.1) });
  const rootDeco = sprite(["n..", "nn.", ".nn"], { n: "#4a3018" });
  const waterTiles = [0, 1].map((p) =>
    bake(16, 16, (x, y) => {
      const n = fbm(x * 0.3, y * 0.3 + p * 5, 2, 60);
      return n > 0.62 ? "#bdeeff" : n > 0.35 ? "#4fb8e8" : "#1f6fae";
    }),
  );
  const waterfallTiles = [0, 1].map((p) =>
    bake(16, 16, (x, y) => {
      const n = fbm(x * 0.4 + p * 7, y * 0.18, 2, 70);
      return n > 0.58 ? "#ffffff" : n > 0.32 ? "#cdf4ff" : "#8fdcff";
    }),
  );
  const rockWall = bake(16, 16, (x, y) => {
    const n = fbm(x * 0.25, y * 0.25, 2, 44);
    return n > 0.55 ? "#5a4a3a" : n > 0.3 ? "#473a2c" : "#362a20";
  });
  const fortress = bake(72, 190, (x, y) => {
    if (y < 10 && Math.floor(x / 9) % 2 === 0) return null; // crenellations
    const seam = x % 12 === 0 || y % 14 === 0;
    const rivet = x % 12 === 6 && y % 14 === 7;
    if (rivet) return "#6a6a86";
    if (seam) return "#232336";
    const band = Math.floor(y / 14) % 4 === 1 && x > 8 && x < 64; // warning stripe band
    const base = band ? "#4a3650" : "#34344a";
    return fbm(x * 0.2, y * 0.08, 2, 80) > 0.85 ? shade(base, 0.1) : base;
  });
  const hud = bake(W, 16, (x, y) => {
    const base = y < 2 ? "#54567a" : "#23213a";
    return fbm(x * 0.2, y * 0.3, 2, 90) > 0.86 ? shade(base, 0.1) : base;
  });
  const mossTuft = sprite(["m.m.m.m.", "m.m.m.m."], { m: shade(PAL.teal, -0.1) });
  return {
    sky,
    clouds,
    mtnFar,
    midFallTiles,
    crownsBack,
    jungleTrunks,
    crownsFront,
    canopy,
    bigFrond,
    cliffTiles,
    fgLeaves,
    rockDeco,
    fernDeco,
    rootDeco,
    waterTiles,
    waterfallTiles,
    rockWall,
    fortress,
    hud,
    mossTuft,
  };
}
let ART: ReturnType<typeof makeArt> | null = null;
const art = () => (ART ??= makeArt());

function create(seed: number): GameInstance {
  const A = art();
  const level = buildLevel(7); // the same jungle every time, so kids can learn it
  const r = rng(seed);
  const hero = { x: 40, y: 100, vx: 0, vy: 0, onGround: false, facing: 1, duck: false, aimUp: false, lives: 3, inv: 90, cool: 0, dead: -1, anim: 0, landT: 0, stepT: 0 };
  let weapon: Weapon = "N";
  let camX = 0;
  const shots: Bullet[] = [];
  const enemyShots: Bullet[] = [];
  const enemies: Enemy[] = [];
  const pickups: Pickup[] = [];
  const booms: Boom[] = [];
  const spawnedTurrets = new Set<number>();
  let spawnT = 60;
  let droneT = 240;
  let capsuleT = 420;
  let shakeT = 0;
  let bossWasActive = false;
  let tick = 0;
  const boss = { x: (COLS - 12) * T, hp: 40, cannons: [6, 6], t: 0, active: false, dead: false };
  let won = false;
  let over = false;

  const groundAt = (px: number) => {
    const c = Math.floor(px / T);
    if (c < 0) return GROUND * T;
    if (c >= COLS) return GROUND * T;
    const g = level.ground[c];
    return g === 99 ? 9999 : g * T;
  };
  const surfaceBelow = (x: number, y0: number, y1: number, w: number) => {
    // highest surface the feet cross between y0 -> y1 (ground or one-way platform)
    let best = Infinity;
    for (const fx of [x + 2, x + w - 2]) {
      const g = groundAt(fx);
      if (y0 <= g + 4 && y1 >= g) best = Math.min(best, g);
    }
    for (const p of level.platforms) {
      if (x + w - 2 > p.x && x + 2 < p.x + p.w && y0 <= p.y + 1 && y1 >= p.y) best = Math.min(best, p.y);
    }
    return best;
  };

  const boom = (x: number, y: number, big = false) => {
    booms.push({ x, y, t: 0, big });
    shakeT = Math.max(shakeT, big ? 14 : 6);
  };

  const hurtHero = (io: IO) => {
    if (hero.inv > 0 || hero.dead >= 0) return;
    hero.dead = 0;
    boom(hero.x + 6, hero.y + 6);
    io.sfx.play("die");
    io.sfx.noise?.(0.3, 0.35, 700, 120);
  };

  const fire = (io: IO) => {
    let dx = hero.facing;
    let dy = 0;
    const h = io.input.held;
    if (h.up) {
      dy = -1;
      dx = h.left || h.right ? hero.facing : 0;
    } else if (h.down && !hero.onGround) {
      dy = 1;
      dx = h.left || h.right ? hero.facing : 0;
    }
    const len = Math.hypot(dx, dy) || 1;
    const sp = 4.2;
    const mx = hero.x + (dx > 0 ? 12 : dx < 0 ? -2 : 5);
    const my = hero.y + (hero.duck ? 8 : dy < 0 ? -2 : 5);
    const add = (ang: number) => {
      const a = Math.atan2(dy / len, dx / len) + ang;
      shots.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 70 });
    };
    if (weapon === "S") [-0.28, -0.14, 0, 0.14, 0.28].forEach(add);
    else add(0);
    hero.cool = weapon === "R" ? 6 : weapon === "S" ? 16 : 11;
    io.sfx.play("shoot");
    if (weapon === "R") io.sfx.slide?.(300, 90, 0.15);
  };

  return {
    update(io) {
      tick++;
      if (shakeT > 0) shakeT--;
      if (won || over) return;
      const inp = io.input;
      // ── hero ──
      if (hero.dead >= 0) {
        hero.dead++;
        if (hero.dead > 70) {
          hero.lives--;
          if (hero.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          hero.dead = -1;
          hero.x = camX + 32;
          hero.y = 20;
          hero.vy = 0;
          hero.inv = 150;
          weapon = "N";
        }
      } else {
        hero.inv = Math.max(0, hero.inv - 1);
        hero.duck = inp.held.down && hero.onGround;
        hero.aimUp = inp.held.up;
        const run = hero.duck ? 0 : 1.45;
        hero.vx = inp.held.left ? -run : inp.held.right ? run : 0;
        if (hero.vx) hero.facing = Math.sign(hero.vx);
        if (inp.pressed.a && hero.onGround) {
          hero.vy = -5.4;
          hero.onGround = false;
          io.sfx.play("jump");
        }
        hero.cool = Math.max(0, hero.cool - 1);
        if (inp.held.b && hero.cool === 0) fire(io);

        // horizontal: blocked by steps taller than a small lip
        const nx = clamp(hero.x + hero.vx, camX, (COLS - 1) * T);
        const lead = hero.vx > 0 ? nx + 11 : nx + 1;
        if (groundAt(lead) >= hero.y + 12 - 5 || groundAt(lead) > 9000) hero.x = nx;
        hero.anim += Math.abs(hero.vx) * 0.12;

        const wasGround = hero.onGround;
        const oldY = hero.y;
        hero.vy = Math.min(6, hero.vy + GRAV);
        hero.y += hero.vy;
        hero.onGround = false;
        if (hero.vy >= 0) {
          const s = surfaceBelow(hero.x, oldY + 12, hero.y + 12, 12);
          if (s !== Infinity && !(inp.held.down && inp.pressed.a)) {
            hero.y = s - 12;
            hero.vy = 0;
            hero.onGround = true;
          }
        }
        if (!wasGround && hero.onGround) {
          hero.landT = 10;
          io.sfx.play("thud");
        }
        hero.landT = Math.max(0, hero.landT - 1);
        if (hero.onGround && hero.vx !== 0) {
          hero.stepT--;
          if (hero.stepT <= 0) {
            hero.stepT = 11;
            io.sfx.play("step");
          }
        } else hero.stepT = 0;
        if (hero.y > H + 20) hurtHero(io);
      }

      // camera: follows, never scrolls back (like the classics)
      const target = clamp(hero.x - 100, 0, COLS * T - W);
      if (!boss.active) camX = Math.max(camX, target);
      if (hero.x > boss.x - 180) {
        if (!bossWasActive) {
          bossWasActive = true;
          io.sfx.play("zap");
          io.sfx.slide?.(220, 660, 0.4);
        }
        boss.active = true;
        camX = Math.max(camX, Math.min(boss.x + 10 * T - W, target));
      }

      // ── spawns ──
      spawnT--;
      if (spawnT <= 0 && !boss.active) {
        spawnT = r.int(50, 110);
        const x = camX + W + 8;
        if (groundAt(x) < 9000) enemies.push({ kind: "bot", x, y: groundAt(x) - 10, vx: -0.8 - r.next() * 0.5, vy: 0, hp: 1, t: 0, w: 12, h: 14 });
      }
      droneT--;
      if (droneT <= 0 && !boss.active) {
        droneT = r.int(160, 300);
        const y = r.range(30, 90);
        enemies.push({ kind: "drone", x: camX + W + 8, y, baseY: y, vx: -1.1, vy: 0, hp: 1, t: r.range(0, 6), w: 15, h: 9 });
      }
      capsuleT--;
      if (capsuleT <= 0 && !boss.active) {
        capsuleT = r.int(500, 800);
        pickups.push({ x: camX + W + 8, y: 50, vy: 0, kind: r.pick(["S", "R", "S", "L"] as const), flying: true, t: 0 });
      }
      level.turrets.forEach((tu, i) => {
        const x = tu.col * T + 2;
        if (!spawnedTurrets.has(i) && x < camX + W + 16 && x > camX) {
          spawnedTurrets.add(i);
          enemies.push({ kind: "turret", x, y: tu.row * T - 10, vx: 0, vy: 0, hp: 3, t: r.int(0, 60), w: 15, h: 14 });
        }
      });

      // ── enemies ──
      for (const e of enemies) {
        e.t++;
        if (e.kind === "bot") {
          e.x += e.vx;
          e.vy = Math.min(5, e.vy + GRAV);
          e.y += e.vy;
          const g = groundAt(e.x + 5);
          if (e.y + 10 >= g && e.y + 10 - e.vy <= g + 4) {
            e.y = g - 10;
            e.vy = 0;
          }
          if (e.y > H + 10) e.hp = 0;
        } else if (e.kind === "drone") {
          e.x += e.vx;
          e.y = (e.baseY ?? 60) + Math.sin(e.t * 0.06) * 18;
          if (e.t % 110 === 60 && hero.dead < 0) {
            const a = Math.atan2(hero.y - e.y, hero.x - e.x);
            enemyShots.push({ x: e.x + 6, y: e.y + 6, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 200 });
          }
        } else if (e.kind === "turret") {
          if (e.t % 100 === 85 && e.x < camX + W && e.x > camX) io.sfx.play("blip");
          if (e.t % 100 === 0 && e.x < camX + W && e.x > camX && hero.dead < 0) {
            const a = Math.atan2(hero.y + 4 - e.y, hero.x - e.x);
            enemyShots.push({ x: e.x + 6, y: e.y + 2, vx: Math.cos(a) * 1.7, vy: Math.sin(a) * 1.7, life: 220 });
            io.sfx.play("laser");
          }
        }
        if (hero.dead < 0 && overlap({ x: hero.x + 2, y: hero.y + (hero.duck ? 6 : 1), w: 8, h: hero.duck ? 6 : 11 }, contactBox(e))) hurtHero(io);
      }

      // ── boss: Robo Fortress (two cannons, then the core) ──
      if (boss.active && !boss.dead) {
        boss.t++;
        boss.cannons.forEach((hp, i) => {
          if (hp > 0 && boss.t % (70 + i * 25) === 0) {
            const cy = 60 + i * 60;
            const a = Math.atan2(hero.y - cy, hero.x - boss.x);
            enemyShots.push({ x: boss.x, y: cy, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 240 });
            io.sfx.play("laser");
          }
        });
        if (boss.cannons.every((c) => c <= 0) && boss.t % 45 === 0) {
          for (const a of [-0.5, 0, 0.5]) enemyShots.push({ x: boss.x + 20, y: 120, vx: -2 * Math.cos(a), vy: 2 * Math.sin(a), life: 200 });
        }
      }
      // ambient waterfall whoosh
      if (tick % 400 === 0) io.sfx.noise?.(1.0, 0.12, 500, 180);

      // ── bullets ──
      for (const s of shots) {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (s.x < camX - 8 || s.x > camX + W + 8 || s.y < -8 || s.y > H + 8) s.life = 0;
        for (const e of enemies) {
          if (e.hp > 0 && s.life > 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
            e.hp--;
            s.life = 0;
            io.sfx.play("hit");
            if (e.hp <= 0) {
              boom(e.x + 5, e.y + 5);
              io.score(e.kind === "turret" ? 300 : e.kind === "drone" ? 200 : 100);
              io.sfx.play("explode");
            }
          }
        }
        for (const p of pickups) {
          if (p.flying && s.life > 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: p.x, y: p.y, w: 10, h: 6 })) {
            p.flying = false;
            s.life = 0;
            io.sfx.play("blip");
          }
        }
        if (boss.active && !boss.dead && s.life > 0) {
          boss.cannons.forEach((hp, i) => {
            if (hp > 0 && s.life > 0 && overlap({ x: s.x, y: s.y, w: 2, h: 2 }, { x: boss.x - 6, y: 52 + i * 60, w: 14, h: 16 })) {
              boss.cannons[i]--;
              s.life = 0;
              io.sfx.play("hit");
              if (boss.cannons[i] <= 0) {
                boom(boss.x, 60 + i * 60, true);
                io.score(1000);
                io.sfx.play("explode");
              }
            }
          });
          if (s.life > 0 && boss.cannons.every((c) => c <= 0) && overlap({ x: s.x, y: s.y, w: 2, h: 2 }, { x: boss.x + 14, y: 104, w: 18, h: 32 })) {
            boss.hp--;
            s.life = 0;
            io.sfx.play("hit");
            if (boss.hp <= 0) {
              boss.dead = true;
              for (let i = 0; i < 8; i++) boom(boss.x + r.range(0, 60), r.range(30, 170), true);
              io.score(5000 + hero.lives * 1000);
              io.sfx.play("explode");
              io.sfx.play("cheer");
              won = true;
              io.win();
            }
          }
        }
      }
      for (const s of enemyShots) {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (hero.dead < 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: hero.x + 3, y: hero.y + (hero.duck ? 7 : 2), w: 6, h: hero.duck ? 5 : 9 })) {
          s.life = 0;
          hurtHero(io);
        }
      }

      // ── pickups ──
      for (const p of pickups) {
        p.t++;
        if (p.flying) {
          p.x -= 0.9;
          p.y = 50 + Math.sin(p.t * 0.05) * 20;
        } else {
          p.vy = Math.min(4, p.vy + 0.15);
          p.y += p.vy;
          const g = surfaceBelow(p.x, p.y + 8 - p.vy, p.y + 8, 10);
          if (g !== Infinity) {
            p.y = g - 8;
            p.vy = 0;
          }
        }
        if (!p.flying && hero.dead < 0 && overlap({ x: hero.x, y: hero.y, w: 12, h: 12 }, { x: p.x, y: p.y, w: 10, h: 8 })) {
          if (p.kind === "L") {
            hero.lives = Math.min(5, hero.lives + 1);
            io.sfx.play("pickup");
          } else {
            weapon = p.kind;
            io.sfx.play("powerup");
          }
          p.t = -1;
          io.score(500);
        }
      }

      // cleanup
      const alive = <X extends { life?: number; hp?: number }>(arr: X[], ok: (x: X) => boolean) => {
        for (let i = arr.length - 1; i >= 0; i--) if (!ok(arr[i])) arr.splice(i, 1);
      };
      alive(shots, (s) => s.life > 0);
      alive(enemyShots, (s) => s.life > 0 && s.x > camX - 20 && s.x < camX + W + 20 && s.y > -20 && s.y < H + 20);
      alive(enemies, (e) => e.hp > 0 && e.x > camX - 40);
      alive(pickups as (Pickup & { life?: number })[], (p) => p.t >= 0 && p.x > camX - 20 && p.y < H + 20);
      alive(booms as (Boom & { life?: number })[], (b) => b.t++ < (b.big ? 40 : 24));
    },

    draw(g: Gfx) {
      const shx = shakeT > 0 ? (hash2(tick, 1) - 0.5) * 5 * (shakeT / 14) : 0;
      const shy = shakeT > 0 ? (hash2(tick, 2) - 0.5) * 5 * (shakeT / 14) : 0;
      // ── painted backdrop: bright day sky, clouds, the small hazy range + the Robo Fortress's
      // own far silhouette (barely moves — it's the goal), a cliff waterfall catching the light,
      // then tropical mid-jungle (trunks + spiky palms) under two rows of overlapping crowns ──
      g.sprite(A.sky, 0, 0);
      drawStrip(g, A.clouds, camX * 0.04, 4);
      drawStrip(g, A.mtnFar, camX * 0.06 + shx * 0.15, 46);
      drawStrip(g, A.crownsBack, camX * 0.2 + shx * 0.3, 96);
      drawStrip(g, A.midFallTiles[(tick >> 4) & 1], camX * 0.28 + shx * 0.4, 86);
      drawStrip(g, A.crownsFront, camX * 0.38 + shx * 0.6, 92);
      drawStrip(g, A.jungleTrunks, camX * 0.3 + shx * 0.45, 90);

      g.camera(camX + shx, shy);
      // ground + pits (waterfall/river between rock cliffs, mossy grass ledges)
      const c0 = Math.floor(camX / T);
      for (let c = c0; c <= c0 + W / T + 1 && c < COLS; c++) {
        const h = level.ground[c];
        if (h === 99) {
          let nb = GROUND;
          for (let k = 1; k < 6; k++) {
            const cc = c - k;
            if (cc >= 0 && level.ground[cc] !== 99) {
              nb = level.ground[cc];
              break;
            }
          }
          const topY = nb * T;
          const waterY = Math.min(H - 20, topY + 26);
          for (let y = topY; y < waterY; y += 16) g.sprite(A.waterfallTiles[(tick >> 3) & 1], c * T, y);
          for (let y = waterY; y < H; y += 16) g.sprite(A.waterTiles[(tick >> 4) & 1], c * T, y);
          continue;
        }
        const variant = Math.floor(hash2(c, 40) * 3);
        for (let y = h * T, i = 0; y < H; y += 64, i++) g.sprite(A.cliffTiles[(variant + i) % 3], c * T, y);
        const deco = hash2(c, 41);
        if (deco > 0.8) g.sprite(A.rockDeco, c * T + 2, h * T - 3);
        else if (deco > 0.6) g.sprite(A.fernDeco, c * T + 1, h * T - 5);
        else if (deco > 0.45) g.sprite(A.rootDeco, c * T + 5, h * T + 2);
        const leftPit = level.ground[c - 1] === 99;
        const rightPit = level.ground[c + 1] === 99;
        if (leftPit) {
          g.sprite(A.rockWall, c * T - 4, h * T);
          g.sprite(A.mossTuft, c * T - 2, h * T - 2);
        }
        if (rightPit) {
          g.sprite(A.rockWall, c * T + T - 12, h * T);
          g.sprite(A.mossTuft, c * T + T - 8, h * T - 2);
        }
      }
      for (const p of level.platforms) {
        if (p.x > camX + W || p.x + p.w < camX) continue;
        g.rect(p.x, p.y, p.w, 6, "#8a5a2c");
        g.rect(p.x, p.y, p.w, 2, PAL.lime);
        if (hash2(Math.floor(p.x), 3, 20) > 0.5) g.sprite(A.mossTuft, p.x + 4, p.y - 3);
      }
      // boss
      if (!boss.dead && boss.x < camX + W + 80) {
        g.sprite(A.fortress, boss.x - 10, 16);
        g.circle(boss.x + 24, 14, 2, (tick >> 4) & 1 ? PAL.red : shade(PAL.red, -0.4));
        boss.cannons.forEach((hp, i) => {
          const cy = 54 + i * 60;
          if (hp > 0) {
            g.sprite(CANNON, boss.x - 14, cy - 6);
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.2 + i);
            g.circle(boss.x - 7, cy - 3, 2.2 + pulse * 1.3, PAL.red);
            g.circle(boss.x - 7, cy - 3, 1, PAL.white);
          } else {
            g.sprite(CANNON_DEAD, boss.x - 14, cy - 6);
          }
        });
        const open = boss.cannons.every((c) => c <= 0);
        g.rect(boss.x + 14, 104, 18, 32, open ? (Math.floor(boss.t / 6) % 2 ? PAL.red : PAL.orange) : PAL.dark);
        if (open) g.rect(boss.x + 16, 106 + (40 - boss.hp) * 0.7, 14, Math.max(0, 28 - (40 - boss.hp) * 0.7), PAL.yellow);
      }
      for (const e of enemies) {
        if (e.kind === "bot") {
          g.sprite(BOT[Math.floor(e.t / 8) % 2], e.x - 3, e.y - 9, { flipX: e.vx > 0 });
          if (e.t % 70 < 3) {
            const gx = e.x + (e.vx < 0 ? -3 : 13);
            g.alpha(0.4);
            g.circle(gx, e.y + 2, 3, PAL.pink);
            g.alpha(1);
            g.circle(gx, e.y + 2, 1.3, PAL.white);
          }
        } else if (e.kind === "drone") {
          g.sprite(DRONE[Math.floor(e.t / 4) % 2], e.x - 3, e.y - 3);
          g.circle(e.x + 7, e.y + 7, 2.8 + Math.sin(e.t * 0.3), e.t % 4 < 2 ? PAL.cyan : PAL.white);
        } else {
          g.sprite(TURRET, e.x - 3, e.y - 8);
          const phase = e.t % 100;
          const bright = phase > 85 || phase < 3;
          g.circle(e.x + 7, e.y - 2, bright ? 3 : 1.9, bright ? PAL.red : shade(PAL.red, -0.3));
        }
      }
      for (const p of pickups) {
        if (p.flying) {
          g.sprite(CAPSULE, p.x, p.y);
          if ((Math.floor(p.t / 6) & 1) === 0) g.circle(p.x + 2, p.y + 1, 1, PAL.white);
        } else {
          g.box(p.x - 1, p.y - 1, 12, 10, PAL.yellow);
          g.rect(p.x, p.y, 10, 8, p.kind === "L" ? PAL.pink : PAL.orange);
          g.text(p.kind === "L" ? "♥" : p.kind, p.x + 3 - camX, p.y + 1, PAL.white); // text ignores the camera
        }
      }
      for (const s of shots) {
        g.alpha(0.35);
        g.circle(s.x, s.y, weapon === "R" ? 5 : 4, PAL.cyan);
        g.alpha(1);
        g.circle(s.x, s.y, 1.6, PAL.white);
        g.line(s.x, s.y, s.x - s.vx * 1.4, s.y - s.vy * 1.4, PAL.cyan);
      }
      for (const s of enemyShots) {
        g.alpha(0.32);
        g.circle(s.x, s.y, 4, PAL.pink);
        g.alpha(1);
        g.circle(s.x, s.y, 1.5, PAL.pink);
        g.line(s.x, s.y, s.x - s.vx * 1.3, s.y - s.vy * 1.3, PAL.pink);
      }
      // hero
      if (hero.dead < 0 && !(hero.inv > 0 && Math.floor(hero.inv / 3) % 2)) {
        const squash = hero.landT > 0 ? hero.landT / 10 : 0;
        const spr = hero.duck ? HERO_DUCK : hero.aimUp && !hero.vx ? HERO_UP : hero.onGround ? HERO_RUN[hero.vx ? Math.floor(hero.anim) % 4 : 0] : HERO_JUMP;
        g.sprite(spr, hero.x - 5, hero.y - 10 + squash * 2, { flipX: hero.facing < 0 });
        if (hero.cool > 0 && hero.cool > (weapon === "R" ? 3 : weapon === "S" ? 10 : 7)) {
          const mx = hero.x + (hero.facing > 0 ? 15 : -5);
          g.alpha(0.4);
          g.circle(mx, hero.y + 4, 4, PAL.cyan);
          g.alpha(1);
          g.circle(mx, hero.y + 4, 1.8, PAL.white);
        }
      }
      for (const b of booms) {
        const rr = (b.big ? 14 : 7) * Math.min(1, b.t / 8);
        g.circle(b.x, b.y, rr, b.t % 6 < 3 ? PAL.orange : PAL.yellow);
        if (b.t > 6) g.circle(b.x, b.y, rr * 0.5, PAL.white);
        const n = b.big ? 6 : 3;
        for (let i = 0; i < n; i++) {
          const ang = hash2(i, Math.floor(b.x) + Math.floor(b.y)) * 6.283;
          const dist = b.t * (b.big ? 1.8 : 1.1);
          g.rect(b.x + Math.cos(ang) * dist, b.y + Math.sin(ang) * dist, 2, 2, i % 2 ? PAL.grey : PAL.orange);
        }
      }
      g.camera(0, 0);
      // foreground canopy overhead + big dark leaves/flowers along the very bottom edge
      // (both closer than the play field, so they scroll a touch faster than the world)
      drawStrip(g, A.canopy, camX * 0.85, -4);
      for (let i = 0; i < 4; i++) {
        const x = (((i * 180 - camX * 0.95) % (4 * 180)) + 4 * 180) % (4 * 180) - 40;
        g.sprite(A.bigFrond, x, -6, { scale: 2.3 });
      }
      drawStrip(g, A.fgLeaves, camX * 0.95, H - 30);
      g.alpha(1);
      // HUD
      g.sprite(A.hud, 0, 0);
      for (let i = 0; i < hero.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.box(60, 1, 44, 9, PAL.dark);
      g.text(`GUN ${weapon === "N" ? "-" : weapon}`, 64, 2, PAL.yellow);
      const prog = clamp(hero.x / ((COLS - 12) * T), 0, 1);
      g.box(149, 3, 102, 5, PAL.dark);
      g.rect(150, 4, 100 * prog, 3, PAL.lime);
      if (boss.active && !boss.dead) g.text("ROBO FORTRESS!", W / 2, 16, PAL.red, { align: "center" });
    },
  };
}

export const jungleCommando: RetroGameDef = {
  id: "jungle-commando",
  title: "Jungle Commando",
  blurb: "Run, jump and blast through the robot jungle!",
  genre: "Action",
  emoji: "🪖",
  color: "#3ecf55",
  controls: "◀ ▶ run · ▲ aim up · ▼ duck · A jump · B shoot (hold)",
  pad: { dpad: "4", a: "Jump", b: "Shoot" },
  create,
};
