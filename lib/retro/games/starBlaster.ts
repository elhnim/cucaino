// STAR BLASTER — a vertical space shooter. Fly your little star fighter through a parallax
// starfield, blast formations of wobbly aliens as they swoop in and dive at you, dodge
// tumbling asteroids, grab power-ups (double shot, shield, speed) and beat a big mothership
// every fourth wave. B fires a smart bomb that clears the screen. (Original game in the
// spirit of 8-bit arcade shooters.)
import { H, PAL, W, clamp, dist, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bayer, fbm, mixHex, outlined, shade, tinted } from "../art";

type Kind = 0 | 1 | 2;
type PowKind = "D" | "S" | "F";
const POW_COLOR: Record<PowKind, string> = { D: PAL.orange, S: PAL.cyan, F: PAL.lime };

// ── big art: nebula sky, planet, galaxy, alien fortress, ship, aliens, rocks ──
// Baked ONCE (lazily, on first create()) and reused every frame — see `art()` below. Keep
// module load tiny: nothing here runs until a game actually starts.

/** shift each row right by a shrinking amount near the nose — gives a hand-drawn ship a lean */
function leanRows(rows: string[], amounts: number[]): string[] {
  return rows.map((row, y) => {
    const s = Math.max(0, Math.min(row.length - 1, amounts[y] ?? 0));
    return s > 0 ? ".".repeat(s) + row.slice(0, row.length - s) : row;
  });
}
/** mirror a half-width drawing (outer edge first, centreline last) into a full symmetric sprite */
const mirrorRows = (rows: string[]) => rows.map((row) => row + row.split("").reverse().join(""));

// the hero fighter, ~18-20 px tall like the painting: a clean white/red delta body with a cyan
// canopy stripe and twin cyan engines at the wingtips. Built from a function (not hand-typed
// ascii) so the silhouette is a true straight-edged delta, nose narrow, tail at full span.
const SHIP_W_HALF = 10;
const SHIP_H = 16;
function shipHalfChar(x: number, y: number): string {
  const inner = SHIP_W_HALF - 1 - x; // 0 at the centreline .. 9 at the outer edge
  // a slender fuselage runs the whole length (nose to tail); swept wings only flare out in the
  // rear half, so the silhouette reads as a jet, not a uniform cone/pyramid
  const fuselage = y < 2 ? y * 0.5 : Math.min(1.6, 0.85 + y * 0.06);
  const wingStart = 7.5;
  const wingSweep = y > wingStart ? Math.min(8.2, (y - wingStart) * 1.55) : 0;
  const hw = fuselage + wingSweep;
  if (inner > hw) return ".";
  if (y >= 1 && y <= 5 && inner <= 1.1) return "c"; // cyan canopy, a short run just behind the nose
  if (y >= 13 && inner >= 1.1 && inner <= 3.1) return y >= 14 ? "e" : "n"; // twin engines, inboard at the tail
  const edge = hw - inner;
  if (wingSweep > 0.6 && edge < 1.3) return "r"; // red wingtip trim along the swept wing's outer edge
  if (edge < 0.7) return "w"; // thin bright rim all round
  return inner <= fuselage + 0.3 ? (y % 2 === 0 ? "w" : "s") : y % 2 === 0 ? "b" : "n";
}
const SHIP_HALF: string[] = Array.from({ length: SHIP_H }, (_, y) =>
  Array.from({ length: SHIP_W_HALF }, (_, x) => shipHalfChar(x, y)).join(""),
);
const SHIP_ROWS = mirrorRows(SHIP_HALF);
const SHIP_PAL = {
  w: PAL.white,
  s: shade(PAL.white, -0.12), // silver fuselage shade
  c: PAL.cyan,
  b: shade(PAL.blue, 0.05),
  n: shade(PAL.blue, -0.4),
  r: PAL.red,
  e: mixHex(PAL.cyan, PAL.white, 0.35),
};
const FLAME_PAL = { c: PAL.cyan, w: PAL.white, b: PAL.blue };
const FLAME_A = sprite(["ww", "cc", "cc", "cb", ".b"], FLAME_PAL);
const FLAME_B = sprite(["ww", "cc", "cb", "bb", ".b"], FLAME_PAL);

// winged insect aliens, ~20-24 px across like the painting: a small lit thorax plus big sweeping
// wings that flap between two frames. Shared silhouette, 3 colour sets (green / red-pink / purple).
const ALIEN_W = 11; // half-width (mirrored to 22)
const ALIEN_H = 16;
function alienPixel(y: number, dx: number, frame: number, body: string, light: string, dark: string, eye: string): string | null {
  const adx = Math.abs(dx);
  // two small antenna strokes above the head
  if (y <= 1 && adx > 1.1 && adx < 2.4) return y === 0 ? eye : dark;
  const bodyProfile = [0.5, 2, 3.2, 4, 4.3, 4, 3.2, 1.8];
  if (y < bodyProfile.length) {
    const hw = bodyProfile[y];
    if (adx > hw) return null;
    if ((y === 2 || y === 3) && adx > 1 && adx < 2.4) return eye; // big bug eyes
    if (hw - adx < 0.9) return light;
    return y % 2 === 0 ? dark : body;
  }
  const wy = y - bodyProfile.length;
  const peak = frame === 0 ? 1 : 3.4;
  const reach = Math.max(0, 6.6 - Math.abs(wy - peak) * 1.3);
  const inner = 2.6 + wy * 0.2;
  if (adx < inner || adx > inner + reach) return null;
  const edgeDist = inner + reach - adx;
  if (edgeDist < 0.9) return dark;
  // wing vein stripes every couple of rows read as membrane segments, not a solid paper triangle
  return wy % 2 === 0 ? light : body;
}
function bakeAlien(frame: number, body: string, eye: string): Sprite {
  const light = shade(body, 0.32);
  const dark = shade(body, -0.3);
  return bake(ALIEN_W, ALIEN_H, (x, y) => alienPixel(y, ALIEN_W - 1 - x, frame, body, light, dark, eye));
}
const ALIEN_COLORS: [string, string][] = [
  [PAL.green, PAL.yellow], // kind 0 — green
  [mixHex(PAL.red, PAL.pink, 0.5), PAL.cyan], // kind 1 — red/pink
  [PAL.purple, PAL.orange], // kind 2 — purple
];
/** baked lazily (called from makeArt), not at module load */
function bakeAliens(): [Sprite, Sprite][] {
  return ALIEN_COLORS.map(([body, eye]) => {
    const half0 = bakeAlien(0, body, eye);
    const half1 = bakeAlien(1, body, eye);
    return [sprite(mirrorRows(half0.rows), half0.pal), sprite(mirrorRows(half1.rows), half1.pal)];
  });
}

const MOTHER_ROWS = [
  "..........kkkkkkkkkkkk..........",
  "........kkppppppppppppkk........",
  "......kkppwwppppppppwwppkk......",
  ".....kppppwkppppppppwkppppk.....",
  "....kpppppppppppppppppppppk.....",
  "..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..",
  ".kddddddddddddddddddddddddddddk.",
  "kddyydddyydddyydddyydddyydddyydk",
  "kdddddddllllllllddddddddddddddk.",
  ".kkkddddlccccccldddddddddddkkk.",
  "....kkkkddllllllddddddkkkk....",
  "........kkrrkkrrkkrrkkrrkk......",
  "..........kk..kk..kk..kk........",
];
const MOTHER_PAL = { k: PAL.black, p: PAL.purple, w: PAL.white, d: PAL.grey, y: PAL.yellow, r: PAL.red, l: shade(PAL.purple, -0.3), c: PAL.cyan };
const MOTHER_PAL2 = { ...MOTHER_PAL, c: PAL.pink };

// ── backdrop: deep gradient sky, soft nebula clouds, a spiral galaxy and a big cratered planet,
// all baked once as transparent-background sprites and layered behind the action ──
function bakeSky(): Sprite {
  // deep navy/near-black like the painting — the nebula band and planet glow carry the colour,
  // not the base sky
  const top = "#07081c";
  const mid = "#0a0c24";
  const low = "#121640";
  return bake(W, H, (x, y) => {
    const t = y / H + (bayer(x, y) - 0.5) * 0.03; // tiny dither so the gradient never bands
    return t < 0.55 ? mixHex(top, mid, clamp(t / 0.55, 0, 1)) : mixHex(mid, low, clamp((t - 0.55) / 0.45, 0, 1));
  });
}
// a soft nebula band running diagonally across the whole screen, like the painting's backdrop haze
function bakeNebulaBand(w: number, h: number, seed: number, a: string, b: string): Sprite {
  // the band runs along direction u=(0.7,1) through the canvas centre; `along` is the signed
  // distance down that axis, `across` the signed perpendicular distance from its centreline —
  // both get perturbed by low-frequency noise so nothing about the shape is a straight line.
  const ulen = Math.hypot(0.7, 1);
  const ux = 0.7 / ulen;
  const uy = 1 / ulen;
  const px = -uy;
  const py = ux;
  const along0 = w * 0.6;
  return bake(w, h, (x, y) => {
    const rx = x - w / 2;
    const ry = y - h / 2;
    const along = rx * ux + ry * uy;
    const across = rx * px + ry * py;
    const an = along / along0; // roughly -1..1 along the band's length
    // the centreline meanders and the band billows wider/narrower along its length
    const meander = (fbm(an * 2.1 + seed * 13, 4.4, 2, seed) - 0.5) * 30;
    const widthMod = 0.4 + fbm(an * 1.5 + seed * 5, 1.1, 2, seed + 4) * 1.1;
    const localAcross = across - meander;
    const baseWidth = 24;
    const core = Math.max(0, 1 - Math.abs(localAcross) / (baseWidth * widthMod));
    // turbulent texture for wispy density, bright knots and a few detached puffs clear of the core
    const knot = fbm(x * 0.055 + seed * 17, y * 0.065 + seed * 11, 3, seed + 2);
    const wisp = Math.max(0, knot - 0.72) * 2.6 * Math.max(0, 1 - Math.abs(localAcross) / (baseWidth * 2.6));
    let v = Math.max(core * (0.4 + knot * 0.75), wisp);
    if (v < 0.15) return null;
    // dither only the faint fringe; the cloud's body is a smooth, billowing fill — no hard edges
    if (v < 0.24) {
      if (bayer(x, y) >= (v - 0.15) / 0.09) return null;
      v = 0.3;
    }
    const col = mixHex(a, b, clamp(knot * 0.6 + core * 0.4, 0, 1));
    return knot > 0.8 ? mixHex(col, PAL.white, (knot - 0.8) * 2.2) : col;
  });
}
function bakeGalaxy(d: number, seed: number): Sprite {
  const c = (d - 1) / 2;
  return bake(d, d, (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const r = Math.hypot(dx, dy) / c;
    if (r > 1) return null;
    const ang = Math.atan2(dy, dx);
    const arm = Math.sin(ang * 2 - r * 7 + seed) * 0.5 + 0.5;
    const core = Math.max(0, 1 - r / 0.3);
    const v = Math.max(arm * (1 - r) * 0.85, core);
    if (v < 0.42) return null;
    const col = mixHex("#241347", mixHex(PAL.purple, PAL.pink, 0.4), Math.min(1, core * 1.2 + arm * 0.3));
    return core > 0.55 ? PAL.white : col;
  });
}
// a big planet with a soft dithered atmosphere glow halo around its lit edge (not a hard-edged disc)
function bakePlanet(solidD: number, glowPad: number, base: string, glowColor: string, seed: number): Sprite {
  const d = solidD + glowPad * 2;
  const c = (d - 1) / 2;
  const solidR = solidD / 2;
  return bake(d, d, (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const r = Math.hypot(dx, dy);
    const lightDot = clamp(-(dx / solidR) * 0.65 - (dy / solidR) * 0.55, -1, 1);
    if (r > solidR) {
      // dithered outer glow: denser near the lit limb, thinning out to nothing
      const falloff = 1 - (r - solidR) / glowPad;
      if (falloff <= 0) return null;
      const v = falloff * falloff * (0.3 + Math.max(0, lightDot) * 0.7);
      return v > bayer(x, y) * 0.5 + 0.22 ? shade(glowColor, 0.1 * falloff) : null;
    }
    const nx = dx / solidR;
    const ny = dy / solidR;
    let t = clamp(lightDot * 0.5, -0.65, 0.22);
    const n = fbm((x + seed * 19) * 0.1, (y + seed * 13) * 0.1, 2, seed);
    if (n > 0.6) t -= 0.16;
    else if (n < 0.22) t += 0.06;
    const rim = 1 - Math.sqrt(nx * nx + ny * ny);
    if (rim < 0.04 && lightDot > 0.15) return shade(PAL.pink, 0.1);
    return shade(base, t);
  });
}
// the big PURPLE alien mothership/fortress hanging across the top: a wide domed hull with a
// glowing magenta core "eye", layered plating and pink-lit wing pylons reaching to the edges.
const MAGENTA = "#ff39c8";
function bakeMothership(w: number, h: number, glow: number): Sprite {
  const cx = (w - 1) / 2;
  const hull = "#6a44c8";
  return bake(w, h, (x, y) => {
    const dx = (x - cx) / cx; // -1..1
    const dome = h * 0.86 * Math.exp(-dx * dx * 2.4); // the big central dome
    const plate = h * 0.32 + Math.sin(x * 0.45) * 1.6; // plating ripple reaches to the edges
    const pylonAt = [cx - 96, cx - 50, cx + 50, cx + 96];
    let pylon = 0;
    for (const px of pylonAt) pylon = Math.max(pylon, Math.max(0, 1 - Math.abs(x - px) / 9) * h * 0.46);
    const edgeY = Math.max(dome, plate, pylon);
    if (y > edgeY) return null;
    const depth = edgeY - y;
    // the glowing magenta core eye, low in the dome — a hot white pupil in a magenta iris
    const eyeR = Math.hypot(x - cx, y - h * 0.58);
    if (eyeR < 1.8 + glow * 0.5) return PAL.white;
    if (eyeR < 4.2 + glow) return MAGENTA;
    if (eyeR < 8 + glow) return mixHex(hull, MAGENTA, Math.max(0, 1 - (eyeR - 4) / 5));
    // pink pylon running lights
    for (const px of pylonAt) if (Math.abs(x - px) < 2 && depth > 3 && depth < h * 0.42) return Math.floor(depth) % 5 === 0 ? PAL.white : PAL.pink;
    const seam = x % 14 < 1;
    let t = -depth * 0.022;
    if (seam) t -= 0.16;
    if (depth < 1.3) t += 0.3; // rim light along the jagged under-edge
    return shade(hull, clamp(t, -0.4, 0.3));
  });
}
const ROCK_DIAM = 20;
function bakeRock(variant: number): Sprite {
  const c = (ROCK_DIAM - 1) / 2;
  const rot = variant * (Math.PI / 2);
  return bake(ROCK_DIAM, ROCK_DIAM, (x, y) => {
    const dx0 = x - c;
    const dy0 = y - c;
    const dx = dx0 * Math.cos(rot) - dy0 * Math.sin(rot);
    const dy = dx0 * Math.sin(rot) + dy0 * Math.cos(rot);
    const bump = (fbm(dx * 0.25 + 40, dy * 0.25 + 40, 2, 3) - 0.5) * 0.3;
    const r = Math.hypot(dx, dy) / c;
    if (r > 0.9 + bump) return null;
    const lightDot = clamp(-(dx / c) * 0.6 - (dy / c) * 0.6, -1, 1);
    let t = lightDot * 0.5 - 0.08;
    const crater = fbm(dx * 0.35, dy * 0.35, 2, 11);
    if (crater > 0.6) t -= 0.22;
    return shade(PAL.brown, t);
  });
}
// a long glowing cyan laser bolt: a wide dim halo baked in behind a bright white-cyan core
function bakeShot(): Sprite {
  return bake(7, 12, (x, y) => {
    const dx = Math.abs(x - 3);
    const core = y > 1 && y < 10 && dx < 0.7;
    const glow = dx < (y < 2 ? 1.6 : y > 9 ? 2.2 : 1.3);
    if (!glow) return null;
    if (core) return y < 4 ? PAL.white : PAL.cyan;
    return shade(PAL.cyan, -0.1 - dx * 0.08);
  });
}
// red/pink droplet enemy shots — a pointed trailing tail, a rounded glossy head
function bakeDroplet(core: string): Sprite {
  const w = 7;
  const h = 9;
  const cx = (w - 1) / 2;
  return bake(w, h, (x, y) => {
    const dx = Math.abs(x - cx);
    if (y < 3) {
      const rad = (y / 3) * 1.6;
      if (dx > rad) return null;
      return dx > rad - 0.7 ? shade(core, -0.25) : core;
    }
    const r = Math.hypot(dx, (y - 5.3) * 0.95);
    if (r > 2.3) return null;
    if (r < 1) return PAL.white;
    return r > 1.7 ? shade(core, -0.3) : core;
  });
}
function bakePow(kind: PowKind): Sprite {
  const col = POW_COLOR[kind];
  if (kind === "S") {
    // a glowing cyan shield emblem: rounded top, pointed base, a bright spine down the middle
    const w = 11;
    const h = 12;
    const cx = (w - 1) / 2;
    return bake(w, h, (x, y) => {
      const dx = x - cx;
      const adx = Math.abs(dx);
      if (y <= 6) {
        if (Math.hypot(dx, y - 6) > 5.3) return null;
      } else {
        const t = (y - 6) / (h - 1 - 6);
        if (adx > 5.3 * (1 - t)) return null;
      }
      if (adx < 1) return PAL.white;
      const edge = 5.3 - Math.hypot(dx, Math.max(0, y - 6));
      if (edge < 0.9) return shade(col, 0.4);
      return shade(col, 0.05 - adx * 0.02);
    });
  }
  return bake(10, 10, (x, y) => {
    const dx = x - 4.5;
    const dy = y - 4.5;
    const r = Math.max(Math.abs(dx), Math.abs(dy));
    if (r > 4.5) return null;
    if (r > 3.6) return shade(col, -0.25);
    if (kind === "D" && (y === 2 || y === 5) && Math.abs(dx) < 3 - Math.abs(y - (y === 2 ? 2 : 5))) return PAL.white;
    if (kind === "F" && x - y > -2 && x - y < 2 && y > 1 && y < 8) return PAL.white;
    return shade(col, 0.05);
  });
}

interface Art {
  sky: Sprite;
  nebulaBand: Sprite;
  galaxy: Sprite;
  planet: Sprite;
  fortress: [Sprite, Sprite];
  ship: Sprite;
  shipBank: Sprite;
  aliens: [Sprite, Sprite][];
  aliensFlash: Sprite[];
  mother: [Sprite, Sprite];
  rocks: Sprite[];
  shot: Sprite;
  eshot: [Sprite, Sprite];
  pow: Record<PowKind, Sprite>;
}
let ART: Art | null = null;
const art = () => (ART ??= makeArt());
function makeArt(): Art {
  const shipBase = sprite(SHIP_ROWS, SHIP_PAL);
  const shipBankBase = sprite(leanRows(SHIP_ROWS, [3, 3, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0]), SHIP_PAL);
  const aliensRaw = bakeAliens();
  return {
    sky: bakeSky(),
    nebulaBand: bakeNebulaBand(W, H, 2, "#6a3fc8", "#2a6bd6"),
    galaxy: bakeGalaxy(50, 1.4),
    planet: bakePlanet(78, 22, "#33559c", PAL.cyan, 6),
    fortress: [bakeMothership(W, 44, 0), bakeMothership(W, 44, 2)],
    ship: outlined(shipBase),
    shipBank: outlined(shipBankBase),
    aliens: aliensRaw.map(([a, b]) => [outlined(a), outlined(b)] as [Sprite, Sprite]),
    aliensFlash: aliensRaw.map(([a]) => outlined(tinted(a, PAL.white))),
    mother: [outlined(sprite(MOTHER_ROWS, MOTHER_PAL)), outlined(sprite(MOTHER_ROWS, MOTHER_PAL2))],
    rocks: [0, 1, 2, 3].map(bakeRock),
    shot: bakeShot(),
    eshot: [bakeDroplet(PAL.red), bakeDroplet(PAL.pink)],
    pow: { D: bakePow("D"), S: bakePow("S"), F: bakePow("F") },
  };
}

interface Foe {
  kind: Kind;
  x: number;
  y: number;
  hp: number;
  state: "wait" | "enter" | "hold" | "dive";
  t: number;
  delay: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  slotX: number;
  slotY: number;
  vx: number;
  flash: number;
  drop: boolean;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  spin: number;
}
interface Pow {
  x: number;
  y: number;
  kind: PowKind;
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

const MAX_PARTS = 160;

function create(seed: number): GameInstance {
  const AR = art();
  const r = rng(seed);
  const ship = { x: W / 2 - 6, y: H - 30, lives: 3, inv: 120, dead: -1, cool: 0, gun: 1, speed: 1.6, shield: 0, bombs: 3, bank: 0 };
  const shots: Shot[] = [];
  const eshots: Shot[] = [];
  const foes: Foe[] = [];
  const rocks: Rock[] = [];
  const pows: Pow[] = [];
  const parts: Part[] = [];
  // starfield: 3 layers, preallocated
  const starTints = [PAL.white, PAL.white, PAL.white, PAL.sky, PAL.yellow];
  const stars = Array.from({ length: 130 }, (_, i) => ({ x: r.range(0, W), y: r.range(0, H), layer: i % 3, tint: r.pick(starTints) }));
  // corner-anchored backdrop like the painting: a big planet with an atmosphere glow sits in the
  // lower-left (partly off-screen), a spiral galaxy off to the right — both mostly still, just a
  // slow bob — plus a few dim decorative asteroids drifting at the sides (no collision, pure set
  // dressing, darker/dimmer than anything the kid actually plays against).
  const planetPos = { x: -36, y: H - 88 };
  const galaxyPos = { x: W - 48, y: 44 };
  const bgRocks = Array.from({ length: 4 }, (_, i) => ({
    x: i % 2 === 0 ? r.range(2, 20) : r.range(W - 22, W - 4),
    y: r.range(-200, H),
    vy: 0.08 + i * 0.025,
    scale: r.range(0.45, 0.85),
    variant: i % 4,
  }));
  let fortressT = 0;
  const rings: { x: number; y: number; r: number; max: number; life: number; color: string }[] = [];
  let wave = 0;
  let waveT = 90; // countdown to the next wave
  let frame = 0;
  let diveT = 200;
  let rockT = 300;
  let shake = 0;
  let over = false;
  const boss = { active: false, x: W / 2 - 32, y: -40, hp: 0, max: 0, t: 0 };

  const ringBurst = (x: number, y: number, max: number, color: string) => {
    if (rings.length < 6) rings.push({ x, y, r: 2, max, life: 1, color });
  };

  const burst = (x: number, y: number, n: number, colors: string[]) => {
    for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.4, 2.4);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(14, 32), color: r.pick(colors) });
    }
  };

  const startWave = (io: IO) => {
    wave++;
    diveT = 180;
    if (wave % 4 === 0) {
      boss.active = true;
      boss.x = W / 2 - 32;
      boss.y = -40;
      boss.max = 50 + wave * 8;
      boss.hp = boss.max;
      boss.t = 0;
      io.sfx.slide?.(140, 50, 500, "sawtooth", 0.3);
      return;
    }
    io.sfx.play("select");
    const count = Math.min(24, 8 + wave * 2);
    const cols = 8;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fromLeft = Math.floor(i / 4) % 2 === 0;
      const kind = (row === 0 && wave > 1 ? 2 : row === 1 ? 1 : 0) as Kind;
      foes.push({
        kind,
        x: -20,
        y: -20,
        hp: kind === 2 ? 2 : 1,
        state: "wait",
        t: 0,
        delay: Math.floor(i / 4) * 40 + (i % 4) * 9,
        sx: fromLeft ? -16 : W + 6,
        sy: r.range(10, 60),
        cx: fromLeft ? W - 40 : 40,
        cy: 170,
        slotX: 36 + col * 24,
        slotY: 26 + row * 18,
        vx: 0,
        flash: 0,
        drop: r.chance(0.12),
      });
    }
  };

  const formX = () => Math.sin(frame * 0.015) * 18;

  const killFoe = (f: Foe, io: IO) => {
    f.hp = 0;
    const kc = f.kind === 0 ? PAL.green : f.kind === 1 ? PAL.pink : PAL.purple;
    burst(f.x + 5, f.y + 4, 14, [PAL.yellow, PAL.orange, PAL.white, kc]);
    io.score(f.state === "dive" ? 150 : f.kind === 2 ? 120 : 80);
    io.sfx.play("explode");
    if (f.drop || r.chance(0.05)) pows.push({ x: f.x, y: f.y, kind: r.pick(["D", "S", "F", "D"] as const), t: 0 });
  };

  const hurtShip = (io: IO) => {
    if (ship.inv > 0 || ship.dead >= 0) return;
    if (ship.shield > 0) {
      ship.shield = 0;
      ship.inv = 60;
      burst(ship.x + 6, ship.y + 5, 14, [PAL.cyan, PAL.white]);
      ringBurst(ship.x + 6, ship.y + 5, 14, PAL.cyan);
      io.sfx.play("hit");
      return;
    }
    ship.dead = 0;
    shake = 14;
    burst(ship.x + 6, ship.y + 5, 30, [PAL.white, PAL.yellow, PAL.orange, PAL.red]);
    ringBurst(ship.x + 6, ship.y + 5, 26, PAL.orange);
    io.sfx.play("die");
    io.sfx.noise?.(260, 0.3, 500, 60);
  };

  const bomb = (io: IO) => {
    ship.bombs--;
    shake = 10;
    eshots.length = 0;
    ringBurst(ship.x + 6, ship.y + 5, 30, PAL.white);
    ringBurst(ship.x + 6, ship.y + 5, 20, PAL.cyan);
    io.sfx.play("explode");
    io.sfx.noise?.(400, 0.35, 1800, 120);
    for (const f of foes) if (f.hp > 0 && f.state !== "wait" && f.y > -10 && f.y < H) killFoe(f, io);
    for (const k of rocks) {
      k.hp = 0;
      burst(k.x, k.y, 8, [PAL.grey, PAL.tan]);
      io.score(50);
    }
    if (boss.active && boss.y > -20) boss.hp = Math.max(1, boss.hp - 12);
  };

  const aimAt = (x: number, y: number, sp: number) => {
    const a = Math.atan2(ship.y + 5 - y, ship.x + 6 - x);
    eshots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      const inp = io.input;
      shake = Math.max(0, shake - 1);
      for (const s of stars) {
        s.y += 0.3 + s.layer * 0.6;
        if (s.y > H) {
          s.y -= H;
          s.x = r.range(0, W);
        }
      }
      fortressT += 0.05;
      for (const o of bgRocks) {
        o.y += o.vy;
        if (o.y - 22 > H) {
          o.y = -r.range(20, 200);
          o.x = o.x < W / 2 ? r.range(2, 20) : r.range(W - 22, W - 4);
        }
      }
      for (const rg of rings) {
        rg.r = Math.min(rg.max, rg.r + (rg.max - rg.r) * 0.2 + 0.8);
        rg.life -= 0.05;
      }

      // ── ship ──
      if (ship.dead >= 0) {
        ship.dead++;
        if (ship.dead > 80) {
          ship.lives--;
          if (ship.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          ship.dead = -1;
          ship.x = W / 2 - 6;
          ship.y = H - 30;
          ship.inv = 150;
          ship.gun = Math.max(1, ship.gun - 1);
          ship.speed = 1.6;
        }
      } else {
        ship.inv = Math.max(0, ship.inv - 1);
        ship.shield = Math.max(0, ship.shield - 1);
        const dx = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
        const dy = (inp.held.down ? 1 : 0) - (inp.held.up ? 1 : 0);
        const k = dx && dy ? 0.72 : 1;
        ship.x = clamp(ship.x + dx * ship.speed * k, 0, W - 13);
        // bottom bound leaves room for the bigger 20x16 ship art + its twin engine flames below it
        ship.y = clamp(ship.y + dy * ship.speed * k, 40, H - 21);
        ship.bank = dx;
        ship.cool = Math.max(0, ship.cool - 1);
        if (inp.held.a && ship.cool === 0 && shots.length < 30) {
          const cx = ship.x + 6;
          if (ship.gun === 1) shots.push({ x: cx, y: ship.y, vx: 0, vy: -5 });
          else {
            shots.push({ x: cx - 4, y: ship.y + 2, vx: 0, vy: -5 }, { x: cx + 4, y: ship.y + 2, vx: 0, vy: -5 });
            if (ship.gun >= 3) shots.push({ x: cx - 5, y: ship.y + 3, vx: -1.2, vy: -4.6 }, { x: cx + 5, y: ship.y + 3, vx: 1.2, vy: -4.6 });
          }
          ship.cool = 8;
          io.sfx.play("shoot");
        }
        if (inp.pressed.b && ship.bombs > 0) bomb(io);
      }

      // ── waves ──
      const waveDone = !boss.active && foes.length === 0;
      if (waveDone) {
        waveT--;
        if (waveT <= 0) {
          startWave(io);
          waveT = 110;
        }
      }

      // ── foes ──
      const fx = formX();
      const holders: Foe[] = [];
      const fireChance = Math.min(0.004, 0.0002 + wave * 0.0003);
      for (const f of foes) {
        f.flash = Math.max(0, f.flash - 1);
        if (f.state === "wait") {
          if (--f.delay <= 0) {
            f.state = "enter";
            f.t = 0;
          }
          continue;
        }
        if (f.state === "enter") {
          f.t = Math.min(1, f.t + 1 / 90);
          const u = f.t;
          const ex = f.slotX + fx;
          f.x = (1 - u) * (1 - u) * f.sx + 2 * (1 - u) * u * f.cx + u * u * ex;
          f.y = (1 - u) * (1 - u) * f.sy + 2 * (1 - u) * u * f.cy + u * u * f.slotY;
          if (u >= 1) f.state = "hold";
        } else if (f.state === "hold") {
          f.x = f.slotX + fx;
          f.y = f.slotY + Math.sin(frame * 0.05 + f.slotX) * 1.5;
          holders.push(f);
          if (ship.dead < 0 && r.chance(fireChance)) aimAt(f.x + 5, f.y + 8, 1.3 + wave * 0.05);
        } else {
          // dive: swoop down toward the ship, then loop back in from the top
          f.t++;
          const target = ship.x + 1;
          const turn = Math.min(1.6, 0.9 + wave * 0.1);
          f.vx = clamp(f.vx + Math.sign(target - f.x) * 0.04, -turn, turn);
          f.x += f.vx;
          f.y += Math.min(2.4, 1.2 + wave * 0.08);
          if (f.t === 30 && wave > 1 && ship.dead < 0) aimAt(f.x + 5, f.y + 8, 1.6);
          if (f.y > H + 12) {
            f.state = "enter";
            f.t = 0;
            f.sx = f.x;
            f.sy = -12;
            f.cx = f.slotX;
            f.cy = 40;
          }
        }
        if (ship.dead < 0 && ship.inv === 0 && overlap({ x: ship.x + 3, y: ship.y + 2, w: 7, h: 7 }, { x: f.x + 1, y: f.y + 1, w: 8, h: 6 })) {
          hurtShip(io);
          killFoe(f, io);
        }
      }
      diveT--;
      if (diveT <= 0 && holders.length) {
        diveT = Math.max(50, 230 - wave * 15);
        const n = wave > 3 && r.chance(0.4) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const f = r.pick(holders);
          if (f.state !== "hold") continue;
          f.state = "dive";
          f.t = 0;
          f.vx = 0;
          io.sfx.play("blip");
        }
      }

      // ── mothership ──
      if (boss.active) {
        boss.t++;
        if (boss.y < 24) boss.y += 0.5;
        else {
          boss.x = W / 2 - 32 + Math.sin(boss.t * 0.012) * 80;
          const rage = boss.hp < boss.max / 2;
          if (boss.t % (rage ? 60 : 85) === 0) {
            for (let i = -2; i <= 2; i++) eshots.push({ x: boss.x + 32, y: boss.y + 24, vx: i * 0.5, vy: 1.4 });
            io.sfx.play("laser");
          }
          if (boss.t % 50 === 25 && ship.dead < 0) aimAt(boss.x + 8, boss.y + 22, 1.7);
          if (boss.t % 50 === 0 && rage && ship.dead < 0) aimAt(boss.x + 56, boss.y + 22, 1.7);
        }
        if (ship.dead < 0 && overlap({ x: ship.x + 3, y: ship.y + 2, w: 7, h: 7 }, { x: boss.x, y: boss.y + 4, w: 64, h: 20 })) hurtShip(io);
      }

      // ── asteroids ──
      rockT--;
      if (rockT <= 0 && wave > 0) {
        rockT = r.int(Math.max(120, 360 - wave * 20), 480);
        const rad = r.pick([6, 8, 10]);
        rocks.push({ x: r.range(20, W - 20), y: -12, vx: r.range(-0.4, 0.4), vy: r.range(0.6, 1.1), r: rad, hp: rad > 8 ? 4 : 2, spin: r.range(0, 6) });
      }
      for (const k of rocks) {
        k.x += k.vx;
        k.y += k.vy;
        k.spin += 0.03;
        if (k.y > H + 20) k.hp = 0;
        if (ship.dead < 0 && k.hp > 0 && dist(k.x, k.y, ship.x + 6, ship.y + 6) < k.r + 3) hurtShip(io);
      }

      // ── player shots ──
      for (const s of shots) {
        s.x += s.vx;
        s.y += s.vy;
        let hit = false;
        for (const f of foes) {
          if (f.hp > 0 && f.state !== "wait" && overlap({ x: s.x - 1, y: s.y, w: 3, h: 6 }, { x: f.x, y: f.y, w: 10, h: 8 })) {
            hit = true;
            f.hp--;
            f.flash = 6;
            if (f.hp <= 0) killFoe(f, io);
            else io.sfx.play("hit");
            break;
          }
        }
        if (!hit)
          for (const k of rocks) {
            if (k.hp > 0 && dist(s.x, s.y, k.x, k.y) < k.r + 1) {
              hit = true;
              k.hp--;
              burst(s.x, s.y, 3, [PAL.grey, PAL.tan]);
              io.sfx.play("hit");
              if (k.hp <= 0) {
                burst(k.x, k.y, 12, [PAL.grey, PAL.tan, PAL.brown]);
                io.score(50);
                io.sfx.play("explode");
              }
              break;
            }
          }
        if (!hit && boss.active && overlap({ x: s.x - 1, y: s.y, w: 3, h: 6 }, { x: boss.x + 2, y: boss.y, w: 60, h: 22 })) {
          hit = true;
          boss.hp--;
          burst(s.x, s.y, 2, [PAL.yellow, PAL.white]);
          io.sfx.play("hit");
          if (boss.hp <= 0) {
            boss.active = false;
            shake = 24;
            for (let i = 0; i < 6; i++) burst(boss.x + r.range(0, 64), boss.y + r.range(0, 24), 14, [PAL.yellow, PAL.orange, PAL.white, PAL.purple]);
            ringBurst(boss.x + 32, boss.y + 12, 26, PAL.pink);
            ringBurst(boss.x + 32, boss.y + 12, 16, PAL.white);
            io.score(3000 + wave * 250);
            io.sfx.play("explode");
            io.sfx.noise?.(500, 0.35, 1400, 80);
            io.sfx.play("win");
            ship.bombs = Math.min(5, ship.bombs + 1);
            pows.push({ x: boss.x + 28, y: boss.y + 10, kind: "D", t: 0 }, { x: boss.x + 12, y: boss.y + 10, kind: "S", t: 0 });
            eshots.length = 0;
          }
        }
        if (hit || s.y < -8 || s.x < -8 || s.x > W + 8) s.y = -100;
      }

      // ── enemy shots ──
      for (const s of eshots) {
        s.x += s.vx;
        s.y += s.vy;
        if (ship.dead < 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: ship.x + 4, y: ship.y + 3, w: 5, h: 6 })) {
          s.y = H + 100;
          hurtShip(io);
        }
      }

      // ── power-ups ──
      for (const p of pows) {
        p.t++;
        p.y += 0.7;
        p.x += Math.sin(p.t * 0.08) * 0.5;
        if (ship.dead < 0 && overlap({ x: ship.x, y: ship.y, w: 13, h: 11 }, { x: p.x, y: p.y, w: 10, h: 10 })) {
          if (p.kind === "D") {
            ship.gun = Math.min(3, ship.gun + 1);
            io.sfx.slide?.(500, 900, 140, "square", 0.3);
          } else if (p.kind === "S") {
            ship.shield = 900;
            io.sfx.play("pickup");
            io.sfx.tone(700, 160, "sine", 0.25);
          } else {
            ship.speed = Math.min(2.6, ship.speed + 0.4);
            io.sfx.play("whoosh");
          }
          io.score(300);
          io.sfx.play("powerup");
          burst(p.x + 5, p.y + 5, 10, [POW_COLOR[p.kind], PAL.white]);
          ringBurst(p.x + 5, p.y + 5, 16, POW_COLOR[p.kind]);
          p.t = -1;
        }
      }

      // ── particles ──
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life--;
      }

      // cleanup
      const keep = <X>(arr: X[], ok: (x: X) => boolean) => {
        for (let i = arr.length - 1; i >= 0; i--) if (!ok(arr[i])) arr.splice(i, 1);
      };
      keep(shots, (s) => s.y > -50);
      keep(eshots, (s) => s.y < H + 10 && s.y > -20 && s.x > -10 && s.x < W + 10);
      keep(foes, (f) => f.hp > 0);
      keep(rocks, (k) => k.hp > 0);
      keep(pows, (p) => p.t >= 0 && p.y < H + 10);
      keep(parts, (p) => p.life > 0);
      keep(rings, (rg) => rg.life > 0);
    },

    draw(g: Gfx) {
      g.clear(PAL.black);
      g.sprite(AR.sky, 0, 0);
      g.alpha(0.42);
      g.sprite(AR.nebulaBand, 0, 0);
      g.alpha(0.8);
      g.sprite(AR.galaxy, Math.round(galaxyPos.x), Math.round(galaxyPos.y + Math.sin(fortressT * 0.6) * 2));
      g.alpha(0.82);
      g.sprite(AR.planet, Math.round(planetPos.x), Math.round(planetPos.y + Math.sin(fortressT * 0.4) * 2));
      g.alpha(0.55);
      for (const o of bgRocks) g.sprite(AR.rocks[o.variant], o.x - 10 * o.scale, o.y - 10 * o.scale, { scale: o.scale });
      g.alpha(1);
      g.sprite(AR.fortress[Math.floor(frame / 24) % 2], 0, Math.sin(fortressT) * 1.5 - 4);
      for (const s of stars) {
        const c = s.layer === 0 ? PAL.dark : s.layer === 1 ? PAL.grey : s.tint;
        g.rect(s.x, s.y, 1, s.layer === 2 ? 2 : 1, c);
      }
      const sx = shake ? r.range(-2, 2) : 0;
      const sy = shake ? r.range(-2, 2) : 0;
      g.camera(sx, sy);

      for (const k of rocks) {
        const scale = (k.r * 2) / ROCK_DIAM;
        const fi = Math.floor(k.spin * 1.3) % 4;
        g.sprite(AR.rocks[fi], k.x - k.r, k.y - k.r, { scale });
      }
      if (boss.active) {
        const bf = boss.t % 20 < 10 ? 0 : 1;
        g.sprite(AR.mother[bf], boss.x - 2, boss.y - 2, { scale: 2 });
        g.circle(boss.x + 32, boss.y + 26, 3 + (boss.t % 20 < 10 ? 1 : 0), PAL.orange);
      }
      for (const f of foes) {
        if (f.state === "wait") continue;
        if (f.flash % 2) g.sprite(AR.aliensFlash[f.kind], f.x - 1, f.y - 1);
        else g.sprite(AR.aliens[f.kind][Math.floor(frame / 12) % 2], f.x - 1, f.y - 1);
      }
      for (const p of pows) {
        const bob = Math.sin(p.t * 0.12) * 1.2;
        g.sprite(AR.pow[p.kind], p.x, p.y + bob);
      }
      for (const s of shots) g.sprite(AR.shot, s.x - 3, s.y - 1);
      for (const s of eshots) g.sprite(AR.eshot[Math.floor(frame / 4) % 2], s.x - 3, s.y - 5);
      // explosion / impact rings (fading glow, grows then fades)
      for (const rg of rings) {
        g.alpha(Math.max(0, rg.life) * 0.35);
        g.circle(rg.x, rg.y, rg.r, rg.color);
      }
      g.alpha(1);
      // ship — the bigger 20x16 sprite is centred over the old (smaller) hitbox anchor. Its
      // twin engines are inboard near the tail now (a swept-wing jet, not a wide delta), so the
      // flame sprites sit close together behind the fuselage rather than out at the wingtips.
      if (ship.dead < 0 && !(ship.inv > 0 && Math.floor(ship.inv / 4) % 2)) {
        const flame = frame % 6 < 3 ? FLAME_A : FLAME_B;
        g.sprite(flame, ship.x + 1, ship.y + 11);
        g.sprite(flame, ship.x + 6, ship.y + 11);
        if (ship.cool >= 7) {
          g.alpha(0.75);
          g.circle(ship.x + 5, ship.y - 6, 2, PAL.white);
          g.alpha(1);
        }
        g.sprite(ship.bank ? AR.shipBank : AR.ship, ship.x - 5, ship.y - 4, { flipX: ship.bank < 0 });
        if (ship.shield > 0 && (ship.shield > 120 || frame % 8 < 4)) {
          g.alpha(0.4);
          g.circle(ship.x + 6, ship.y + 4, 13, PAL.cyan);
          g.alpha(0.7);
          g.circle(ship.x + 6, ship.y + 4, 9, PAL.white);
          g.alpha(1);
        }
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      g.camera(0, 0);
      // HUD: a framed instrument panel
      g.rect(0, 0, W, 12, "#0d0b22");
      g.rect(0, 11, W, 1, PAL.navy);
      for (let i = 0; i < ship.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.box(46, 1, 46, 9, PAL.dark);
      g.circle(52, 5, 3, PAL.dark);
      g.rect(50, 4, 4, 2, PAL.orange);
      g.text(`${ship.bombs}`, 60, 2, PAL.orange);
      g.text(`WAVE ${wave}`, W - 4, 2, PAL.cyan, { align: "right" });
      if (boss.active) {
        g.box(95, 3, 66, 5, PAL.dark);
        g.rect(96, 4, 64, 3, PAL.night);
        g.rect(96, 4, (64 * boss.hp) / boss.max, 3, PAL.pink);
      }
      if (!boss.active && foes.length === 0 && waveT < 100) {
        const next = wave + 1;
        g.text(next % 4 === 0 ? "MOTHERSHIP!" : `WAVE ${next}`, W / 2, H / 2 - 10, next % 4 === 0 ? PAL.pink : PAL.yellow, { align: "center", size: 2 });
        if (wave === 0) g.text("HOLD A TO FIRE  B = BOMB", W / 2, H / 2 + 12, PAL.white, { align: "center" });
      }
    },
  };
}

export const starBlaster: RetroGameDef = {
  id: "star-blaster",
  title: "Star Blaster",
  blurb: "Blast alien waves, dodge rocks and beat the mothership!",
  genre: "Shooter",
  emoji: "🚀",
  color: "#5ef2ff",
  controls: "D-pad fly · A fire (hold) · B smart bomb",
  pad: { dpad: "4", a: "Fire", b: "Bomb" },
  create,
};
