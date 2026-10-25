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
import { bake, bayer, fbm, hash2, mixHex, shade } from "../art";

const T = 16; // tile size
const COLS = 16; // 16 * 16 = 256 = W
const ROWS = 14; // 14 * 16 = 224 = H
const GRAV = 0.3;
const MAXFALL = 5.2;
const COYOTE = 6;
const BUFFER = 6;
const WALK = 1.05;
const HW = 14; // hero footprint — platform landing, bubble/fruit pickup (bigger here is never harder)
const HH = 15;
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
const SKYS: [string, string][] = [
  ["#6cb6ff", "#a8dcff"],
  ["#ff9a3c", "#ffc1e6"],
  ["#5ec8ff", "#c8f4ff"],
  ["#9a5cff", "#c89aff"],
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
function skyStrip(stops: [string, string]): Sprite {
  // a smooth vertical blend — the two stops are close in hue, so an ordered dither here just
  // reads as sparkly noise; a plain blend is the cleaner 16-bit look
  return bake(DITHER_W, H, (_x, y) => mixHex(stops[0], stops[1], y / (H - 1)));
}
function groundStrip(bandColor: string): Sprite {
  // the pale horizon band under the sky: a soft syrupy shimmer, not a flat rect
  const w = 32, h = 28;
  return bake(w, h, (x, y) => {
    const wave = fbm(x * 0.15, y * 0.4, 2, 40);
    const base = mixHex(bandColor, "#ffffff", 0.12 + wave * 0.07);
    if (y === 0) return shade(base, 0.22);
    const glint = Math.sin((x - y * 0.6) * 0.4) > 0.97;
    return glint ? mixHex(base, "#ffffff", 0.6) : base;
  });
}
/** a fluffy cloud silhouette made of overlapping puffs, lit from the top-left */
function cloudPuff(w: number, h: number, dim: boolean): Sprite {
  const puffs: [number, number, number][] = [
    [w * 0.22, h * 0.58, w * 0.24],
    [w * 0.46, h * 0.36, w * 0.32],
    [w * 0.72, h * 0.5, w * 0.27],
    [w * 0.88, h * 0.62, w * 0.17],
  ];
  const lit = dim ? "#dcebff" : "#ffffff";
  const soft = dim ? "#b9d2f0" : "#cfe6ff";
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
/** one candy-pink platform tile: glossy top rim, faint diagonal stripe, sprinkled underside */
function platformTile(): Sprite {
  const w = T;
  const h = 12;
  const top = "#ffc8ea";
  const base = shade(PAL.pink, -0.06);
  const dark = shade(PAL.pink, -0.34);
  const darker = shade(PAL.pink, -0.48);
  return bake(w, h, (x, y) => {
    if (y === 0) return top;
    if (y <= 6) return (x + y) % 9 < 2 ? shade(base, 0.2) : base;
    if (y === 7) return dark;
    return hash2(x, y, 31) > 0.84 ? mixHex(darker, "#ffffff", 0.45) : darker;
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
  const w = 12;
  const hi = shade(color, 0.3);
  const lo = shade(color, -0.3);
  return bake(w, w, (x, y) => {
    if (x >= 5 && x <= 6 && y <= 1) return "#1f9a3f"; // stem
    if (y === 1 && x >= 7 && x <= 9) return "#3ecf55"; // little leaf
    const dx = (x - 5.5) / 4.6;
    const dy = (y - 6.5) / 4.6;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    const light = -dx - dy * 0.7;
    return light > 0.5 ? hi : light < -0.55 ? lo : color;
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
function makeArt() {
  return {
    skies: SKYS.map((s) => skyStrip(s)),
    grounds: SKYS.map((s) => groundStrip(s[1])),
    cloudNearA: cloudPuff(46, 20, false),
    cloudNearB: cloudPuff(36, 17, false),
    cloudFar: cloudPuff(38, 16, true),
    plat: platformTile(),
    sparkWhite: sparkSprite(7, "#dff3ff"),
    fruit: FRUIT_COLORS.map((c) => fruitSprite(c)),
    pebble: pebbleSprite(),
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

  // eyes
  const eyeY = cy - r * 0.08;
  bigEye(g, cx - r * 0.34, eyeY, r * 0.4, 0.4);
  bigEye(g, cx + r * 0.34, eyeY, r * 0.4, 0.4);
}

/** Bubblo, the chubby baby dino hero — bigger body, back spikes, a big friendly eye, a dark
 * outline silhouette and a bit of squash/stretch on jumps and landings. */
function drawHero(g: Gfx, hero: Hero) {
  const dir = hero.facing;
  const cx = hero.x + hero.w / 2;
  const bodyCy = hero.y + hero.h / 2 + 2;
  const legSwing = hero.onGround && Math.abs(hero.vx) > 0.1 ? Math.sin(hero.anim * 2) : 0;
  const squashY = hero.vy < -1.5 ? 0.86 : hero.vy > 2.2 ? 1.14 : 1;
  const bodyR = 7.6;
  const headR = 6.2;
  const headX = cx + dir * 6;
  const headY = hero.y + 6;

  // outline silhouette behind body + head
  g.circle(cx, bodyCy, bodyR * squashY + 1.4, OUTLINE);
  g.circle(headX, headY, headR + 1.2, OUTLINE);

  // legs + tail, overlapped by the body on top
  const legY = hero.y + hero.h - 4;
  g.rect(cx - 5, legY, 3.4, legSwing > 0.15 ? 5 : 3.4, shade(PAL.green, -0.35));
  g.rect(cx + 1.6, legY, 3.4, legSwing < -0.15 ? 5 : 3.4, shade(PAL.green, -0.35));
  g.circle(cx - dir * 8, bodyCy + 2, 2.6, shade(PAL.green, -0.12));

  // body + a soft belly patch + head
  g.circle(cx, bodyCy, bodyR * squashY, PAL.green);
  g.circle(cx - dir * 1.5, bodyCy - 1.5, bodyR * 0.55, shade(PAL.green, 0.3));
  g.circle(cx - dir * 0.5, bodyCy + bodyR * 0.5, bodyR * 0.4, PAL.lime);
  g.circle(headX, headY, headR, PAL.green);
  g.circle(headX - dir * 1.5, headY - 1.5, headR * 0.5, shade(PAL.green, 0.32));
  crownSpikes(g, headX, headY - headR - 1, headR * 0.85, PAL.orange);

  // one big friendly eye, like every buddy in the park
  bigEye(g, headX + dir * 2.4, headY - 0.6, 3, dir * 0.6);

  if (hero.blowT > 0) {
    const k = 1 - hero.blowT / 14;
    const bubR = 1.5 + k * 5;
    const bx = headX + dir * (headR + 2 + bubR);
    g.alpha(0.55);
    g.circle(bx, headY + 2, bubR, PAL.cyan);
    g.alpha(1);
    g.circle(bx - dir * 1.5, headY + 0.5, 1, PAL.white);
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

  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 0.6, life: 24, color });
    }
  };
  const popText = (x: number, y: number, text: string) => pops.push({ x, y, t: 0, text });
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
      const skyIdx = (round - 1) % SKYS.length;

      // sky: a dithered gradient (never a flat fill), tiled from a 4px strip
      for (let x = 0; x < W; x += DITHER_W) g.sprite(a.skies[skyIdx], x, 0);

      // distant pale clouds drift slowly; nearer, whiter ones drift a touch faster — two depths
      // of the same simple shape, not a wall of jungle the painting never had
      for (let i = 0; i < 2; i++) {
        const w = 38;
        const x = mod(i * 150 + 40 - tick * 0.045, W + w) - w;
        g.sprite(a.cloudFar, x, 16 + (i % 2) * 20);
      }
      for (let i = 0; i < 3; i++) {
        const cloud = i % 2 === 0 ? a.cloudNearA : a.cloudNearB;
        const w = i % 2 === 0 ? 46 : 36;
        const x = mod(i * 160 + 90 - tick * 0.1, W + w) - w;
        g.sprite(cloud, x, 15 + (i % 2) * 18);
      }

      // the pale, shimmering horizon band
      for (let x = 0; x < W; x += 32) g.sprite(a.grounds[skyIdx], x, H - 28);

      // platforms: a baked candy-pink tile per cell, glossy top + sprinkled underside
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] !== "#") continue;
          g.sprite(a.plat, c * T, r * T);
        }
      }

      // fruit (a baked little candy fruit with a stem + leaf, bobbing gently)
      for (const f of fruits) {
        const bob = Math.sin((f.t + f.x) * 0.18) * 1.3;
        g.sprite(a.fruit[f.kind], f.x - 1, f.y - 1 + bob);
      }

      // bubbles: a soft rim-lit soap bubble; empty ones carry the painting's white sparkle,
      // trapped ones glow with the critter's own colour inside
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
          g.circle(b.x, b.y, 4.4, col);
          g.circle(b.x - 1, b.y - 1, 1.6, shade(col, 0.32));
        } else {
          g.sprite(a.sparkWhite, b.x - 4, b.y - 4);
        }
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

      // HUD — a small framed instrument panel
      g.rect(0, 0, W, 13, "#141233");
      g.rect(0, 13, W, 1, OUTLINE);
      for (let i = 0; i < lives; i++) g.text("♥", 4 + i * 9, 3, PAL.red);
      const left = critters.length + bubbles.filter((b) => b.state === "trapped").length;
      g.text(`${left} LEFT`, 70, 3, PAL.cyan);
      g.text(`ROUND ${round}/${TOTAL_ROUNDS}`, W - 4, 3, PAL.white, { align: "right" });

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
