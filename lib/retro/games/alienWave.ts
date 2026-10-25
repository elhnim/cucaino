// ALIEN WAVE — a fixed-screen shooter. Rows of wiggly pixel aliens march side to side and
// step down toward the planet. Slide your cannon left and right, fire one zap at a time,
// hide behind crumbly rock shields and pop the bonus saucer when it zooms across the top.
// The fewer aliens are left, the faster they march! (Original game in the spirit of
// classic fixed shooters.) Backdrop: a deep-space cabinet scene — nebula clouds, a spiral
// galaxy, a cratered moon and two planets peeking from the corners.
import { bake, bayer, gradientColor, hash2, mixHex, noise2, outlined, shade } from "../art";
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";

const COLS = 9;
const ROWS = 5;
const GAP_X = 20;
const GAP_Y = 15;
const AW = 15;
const AH = 10;
const PLAYER_Y = 200;
const SHIELD_Y = 164;
const SHIELD_W = 34;
const SHIELD_H = 20;
const SHIELD_XS = [24, 88, 152, 216].map((x) => x - SHIELD_W / 2);

// five original alien designs, one per row, matching the cabinet painting's colour order
type AlienKind = "antenna" | "crab" | "octo" | "bug" | "crab2";
const ALIEN_ORDER: AlienKind[] = ["antenna", "crab", "octo", "bug", "crab2"];
const ALIEN_BODY: Record<AlienKind, string> = { antenna: PAL.green, crab: PAL.red, octo: PAL.purple, bug: PAL.orange, crab2: PAL.cyan };
const ROW_PTS = [30, 20, 20, 10, 10];

// rock shield palette (dark -> light), and a moss tint for the tops
const ROCK = [shade(PAL.grey, -0.55), shade(PAL.grey, -0.2), PAL.grey, shade(PAL.grey, 0.3)];
/** a crumbly rock colour for one shield pixel: lit rim on top edges, dark crevice on side edges,
 *  a mossy fleck near the top, otherwise a noisy stone tone — all deterministic from art.hash2 */
function rockTone(s: Uint8Array, si: number, x: number, y: number): string {
  const solid = (xx: number, yy: number) => xx >= 0 && xx < SHIELD_W && yy >= 0 && yy < SHIELD_H && s[yy * SHIELD_W + xx] !== 0;
  if (!solid(x, y - 1)) return ROCK[3];
  if (!solid(x - 1, y) || !solid(x + 1, y)) return ROCK[0];
  if (y < 3 && hash2(x + si * 29, y, 88) < 0.2) return PAL.lime;
  const h = hash2(x + si * 41, y + si * 67, 77);
  return ROCK[h < 0.3 ? 0 : h < 0.6 ? 1 : h < 0.85 ? 2 : 3];
}

// ── pixel art, built lazily (never at module load) ──

/** one alien, 16x12 filling almost the whole formation cell, built from simple round shapes so
 *  every kind shares clean 3-tone shading, plus a 2x2 pupil-eye and kind-specific claw/tentacle detail */
function alienRows(kindI: AlienKind, frame: number): string[] {
  const Wd = 16;
  const Ht = 12;
  const g: string[][] = Array.from({ length: Ht }, () => Array(Wd).fill("."));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < Wd && y >= 0 && y < Ht) g[y][x] = c;
  };
  const cx = 7.5;
  const tone = (x: number, y: number, cy: number) => (x + y < cx + cy - 1.2 ? "h" : x + y > cx + cy + 2.2 ? "d" : "g");
  /** a 2x2 white eye with a 1px black pupil in one corner */
  const eye = (ex: number, ey: number, px: number, py: number) => {
    put(ex, ey, "w");
    put(ex + 1, ey, "w");
    put(ex, ey + 1, "w");
    put(ex + 1, ey + 1, "w");
    put(ex + px, ey + py, "k");
  };

  if (kindI === "antenna") {
    const cy = 6;
    for (let y = 0; y < 2; y++) {
      put(4, y, "g");
      put(11, y, "g");
    }
    put(4, 0, "h");
    put(11, 0, "h");
    for (let y = 2; y <= 10; y++)
      for (let x = 1; x <= 14; x++) {
        const dx = (x - cx) / 6.8;
        const dy = (y - cy) / 4.5;
        if (dx * dx + dy * dy <= 1) put(x, y, tone(x, y, cy));
      }
    eye(5, 5, 1, 1);
    eye(9, 5, 0, 1);
    put(7, 9, "d");
    put(8, 9, "d");
    const legs = frame === 0 ? [2, 5, 10, 13] : [1, 6, 9, 14];
    for (const x of legs) {
      put(x, 10, "g");
      put(x, 11, "d");
    }
  } else if (kindI === "crab" || kindI === "crab2") {
    const cy = 5;
    for (let y = 2; y <= 8; y++)
      for (let x = 0; x <= 15; x++) {
        const dx = (x - cx) / 8;
        const dy = (y - cy) / 3.7;
        if (dx * dx + dy * dy <= 1) put(x, y, tone(x, y, cy));
      }
    // forked claws
    const pinY = frame === 0 ? 4 : 3;
    put(0, pinY, "g");
    put(0, pinY + 1, "g");
    put(1, pinY - 1, "h");
    put(1, pinY + 2, "h");
    put(15, pinY, "g");
    put(15, pinY + 1, "g");
    put(14, pinY - 1, "h");
    put(14, pinY + 2, "h");
    // eyes on stalks
    put(5, 0, "g");
    put(10, 0, "g");
    eye(5, 1, 1, 1);
    eye(9, 1, 0, 1);
    const legs = frame === 0 ? [1, 3, 5, 10, 12, 14] : [2, 4, 6, 9, 11, 13];
    for (const x of legs) {
      put(x, 9, "g");
      put(x, 10, "d");
    }
  } else if (kindI === "octo") {
    const cy = 4.5;
    for (let y = 1; y <= 8; y++)
      for (let x = 1; x <= 14; x++) {
        const dx = (x - cx) / 6.8;
        const dy = (y - cy) / 4.6;
        if (dx * dx + dy * dy <= 1) put(x, y, tone(x, y, cy));
      }
    eye(5, 4, 1, 1);
    eye(9, 4, 0, 1);
    const off = frame === 0 ? 0 : 1;
    const xs = [2, 5, 8, 10, 13];
    for (const x of xs) {
      put(x, 9, "g");
      put(x + off, 10, "d");
      put(x, 11, "h"); // curled tentacle tip
    }
  } else if (kindI === "bug") {
    const cy = 6;
    for (let y = 2; y <= 10; y++)
      for (let x = 1; x <= 14; x++) {
        const dx = (x - cx) / 6.5;
        const dy = (y - cy) / 4.6;
        if (dx * dx + dy * dy <= 1) put(x, y, tone(x, y, cy));
      }
    eye(5, 5, 1, 1);
    eye(9, 5, 0, 1);
    put(6, 9, "d");
    put(7, 9, "d");
    put(8, 9, "d");
    put(9, 9, "d");
    put(4, 0, "h");
    put(11, 0, "h");
    put(4, 1, "g");
    put(11, 1, "g");
    const legs = frame === 0 ? [1, 14] : [2, 13];
    for (const x of legs) {
      put(x, 10, "g");
      put(x, 11, "d");
    }
  }
  return g.map((row) => row.join(""));
}
const alienPal = (kindI: AlienKind): Record<string, string> => {
  const b = ALIEN_BODY[kindI];
  return { g: b, h: shade(b, 0.4), d: shade(b, -0.35), w: PAL.white, k: PAL.black };
};

/** the kid's rocket fighter, 16x14: a tapered fuselage, a cyan cockpit, swept wings and twin
 *  engine glow (animated) either side of the tail — a bigger, more detailed ship than the old cannon */
function shipRows(flameFrame: number): string[] {
  const Wd = 16;
  const Ht = 14;
  const g: string[][] = Array.from({ length: Ht }, () => Array(Wd).fill("."));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < Wd && y >= 0 && y < Ht) g[y][x] = c;
  };
  const cx = 7.5;
  // fuselage: a narrow nose widening toward the tail
  for (let y = 0; y <= 8; y++) {
    const half = Math.max(0.6, 0.8 + y * 0.62);
    for (let x = 0; x < Wd; x++) {
      const dx = x - cx;
      if (Math.abs(dx) <= half) put(x, y, y < 2 ? "h" : dx < -half * 0.25 ? "h" : dx > half * 0.25 ? "n" : "b");
    }
  }
  // cockpit window
  put(Math.round(cx) - 1, 4, "c");
  put(Math.round(cx), 4, "c");
  put(Math.round(cx) - 1, 5, "c");
  put(Math.round(cx), 5, "c");
  // swept wings, one diagonal of pixels either side
  for (let i = 0; i < 4; i++) {
    put(Math.round(cx - 6 + i * 0.4), 7 + i, "n");
    put(Math.round(cx + 6 - i * 0.4), 7 + i, "n");
  }
  put(1, 9, "h");
  put(14, 9, "h");
  for (let x = Math.round(cx - 4); x <= Math.round(cx + 4); x++) put(x, 9, "k");
  // twin engine glow either side of the tail
  const flameLen = flameFrame === 0 ? 2 : 3;
  for (const ex of [cx - 3, cx + 3]) {
    const rx = Math.round(ex);
    put(rx - 1, 10, "o");
    put(rx + 1, 10, "o");
    for (let i = 0; i < flameLen; i++) put(rx, 10 + i, i < flameLen - 1 ? "o" : "f");
  }
  return g.map((row) => row.join(""));
}
const SHIP_PAL = { h: shade(PAL.blue, 0.45), b: PAL.blue, n: shade(PAL.blue, -0.3), c: PAL.cyan, k: PAL.black, o: PAL.orange, f: PAL.yellow };

/** the bonus saucer, 18x10, a silvery dome over a wide disk */
function saucerRows(): string[] {
  const Wd = 18;
  const Ht = 10;
  const g: string[][] = Array.from({ length: Ht }, () => Array(Wd).fill("."));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < Wd && y >= 0 && y < Ht) g[y][x] = c;
  };
  const cx = 8.5;
  for (let y = 0; y <= 3; y++)
    for (let x = 0; x < Wd; x++) {
      const dx = (x - cx) / 3.4;
      const dy = (y - 3) / 3.2;
      if (dx * dx + dy * dy <= 1) put(x, y, y === 0 ? "w" : x < cx ? "c" : "d");
    }
  for (let y = 2; y <= 7; y++)
    for (let x = 0; x < Wd; x++) {
      const dx = (x - cx) / 9;
      const dy = (y - 4.5) / 3;
      if (dx * dx + dy * dy <= 1) put(x, y, y < 4 ? "h" : y > 6 ? "d" : "g");
    }
  for (let x = 1; x < Wd - 1; x++) if (g[5][x] !== ".") put(x, 5, "h");
  return g.map((row) => row.join(""));
}
const SAUCER_PAL = { w: PAL.white, c: PAL.cyan, d: shade(PAL.grey, -0.4), g: PAL.grey, h: shade(PAL.grey, 0.35) };

/** a small radial blast (ring r), deterministic from art.hash2 — used for every explosion */
function boomRows(rad: number, seed: number): string[] {
  const n = rad * 2 + 1;
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const h = hash2(x, y, seed);
      const d = Math.hypot(x - rad, y - rad) + (h - 0.5) * rad * 0.5;
      row += h < 0.08 && d > rad * 0.45 ? "." : d < rad * 0.35 ? "w" : d < rad * 0.68 ? "o" : d < rad ? "r" : ".";
    }
    rows.push(row);
  }
  return rows;
}
const BOOM_PAL = { w: PAL.white, o: PAL.orange, r: PAL.red };

/** a wispy, dithered nebula patch — a single faint tint, never a solid blob */
function cloudPx(x: number, y: number, ox: number, oy: number, rad: number, seed: number, tint: string) {
  const dx = (x - ox) / rad;
  const dy = (y - oy) / (rad * 0.7);
  const d = Math.hypot(dx, dy);
  if (d >= 1) return null;
  const n = noise2(x * 0.1 + seed, y * 0.1, seed + 5);
  const density = (1 - d) * (0.25 + 0.9 * n);
  const thresh = 0.48 + (bayer(x, y) - 0.5) * 0.4;
  return density > thresh ? tint : null;
}

/** the whole starfield backdrop: nebulae, a spiral galaxy, a moon and two cratered planets */
function makeBackdrop(): Sprite {
  const SKY = [shade(PAL.purple, -0.3), PAL.night, PAL.black];
  // kept low and small so they only ever peek from the very corners, well clear of the ship's lane
  const P1 = { ox: 8, oy: 236, r: 22, base: PAL.brown };
  const P2 = { ox: 250, oy: 234, r: 20, base: PAL.orange };
  return bake(W, H, (x, y) => {
    let d = Math.hypot(x - P1.ox, y - P1.oy);
    if (d < P1.r) {
      if (hash2(x, y, 31) < 0.05 && d < P1.r * 0.85) return shade(P1.base, -0.35);
      return x + y < P1.ox + P1.oy ? shade(P1.base, 0.1) : shade(P1.base, -0.3);
    }
    d = Math.hypot(x - P2.ox, y - P2.oy);
    if (d < P2.r) {
      if (hash2(x, y, 42) < 0.05 && d < P2.r * 0.85) return shade(P2.base, -0.3);
      return x + y < P2.ox + P2.oy ? shade(P2.base, 0.15) : shade(P2.base, -0.25);
    }
    const gx = x - 222;
    const gy = y - 34;
    const gd = Math.hypot(gx, gy);
    if (gd < 15) {
      if (gd > 12 && bayer(x, y) < (gd - 12) / 3) return null; // soft dithered rim
      if (gd < 3) return PAL.white;
      if (gd < 6.5) return PAL.cyan;
      const ang = Math.atan2(gy, gx);
      const arm = Math.sin(ang * 2.4 + gd * 0.4);
      return arm > 0.1 ? PAL.sky : PAL.navy;
    }
    const mx = x - 26;
    const my = y - 22;
    const md = Math.hypot(mx, my);
    if (md < 11) {
      if (hash2(x, y, 21) < 0.08 && md < 9) return shade(PAL.tan, -0.3);
      return mx + my < 0 ? shade(PAL.tan, 0.15) : shade(PAL.tan, -0.2);
    }
    const c1 = cloudPx(x, y, 232, 150, 42, 3, mixHex(PAL.night, PAL.purple, 0.4));
    if (c1) return c1;
    const c2 = cloudPx(x, y, 18, 128, 38, 11, mixHex(PAL.night, PAL.pink, 0.3));
    if (c2) return c2;
    const base = gradientColor(SKY, y / (H - 1), x, y);
    const sv = hash2(x, y, 5);
    if (sv > 0.9975) return PAL.white;
    if (sv > 0.994) return PAL.sky;
    return base;
  });
}

interface Art {
  backdrop: Sprite;
  aliens: Record<AlienKind, [Sprite, Sprite]>;
  ship: [Sprite, Sprite];
  saucer: Sprite;
  boom: Sprite[];
}
let A: Art | null = null;
const art = (): Art =>
  (A ??= {
    backdrop: makeBackdrop(),
    aliens: Object.fromEntries(ALIEN_ORDER.map((kindI) => [kindI, [outlined(sprite(alienRows(kindI, 0), alienPal(kindI))), outlined(sprite(alienRows(kindI, 1), alienPal(kindI)))]])) as Record<AlienKind, [Sprite, Sprite]>,
    ship: [outlined(sprite(shipRows(0), SHIP_PAL)), outlined(sprite(shipRows(1), SHIP_PAL))],
    saucer: outlined(sprite(saucerRows(), SAUCER_PAL)),
    boom: [5, 8, 11].map((r, i) => sprite(boomRows(r, r * 7 + i * 3 + 1), BOOM_PAL)),
  });

interface Alien {
  x: number;
  y: number;
  row: number;
  alive: boolean;
}
interface Shot {
  x: number;
  y: number;
  vy: number;
  zig: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface Popup {
  x: number;
  y: number;
  text: string;
  t: number;
}

interface Boom {
  x: number;
  y: number;
  t: number;
  size: number;
}

function create(seed: number): GameInstance {
  const gfx = art();
  const r = rng(seed);
  const aliens: Alien[] = [];
  const shields = SHIELD_XS.map(() => new Uint8Array(SHIELD_W * SHIELD_H));
  const player = { x: W / 2 - 6, lives: 3, dead: -1, inv: 60 };
  let shot: { x: number; y: number } | null = null;
  const bombs: Shot[] = [];
  const parts: Part[] = [];
  const popups: Popup[] = [];
  const booms: Boom[] = [];
  const stars = Array.from({ length: 60 }, () => ({ x: r.range(0, W), y: r.range(12, 216), tw: r.range(0, 6) }));
  let wave = 0;
  let dir = 1;
  let stepT = 30;
  let animFrame = 0;
  let dropNext = false;
  let ufo: { x: number; vx: number; pts: number } | null = null;
  let ufoT = 900;
  let frame = 0;
  let pause = 0; // short freeze between waves / after a hit
  let over = false;
  let shake = 0;
  let stepNote = 0;

  // the arch shape is authored at a 24x14 reference size and sampled at whatever SHIELD_W/H
  // actually are, so scaling the constants scales the whole rock arch (and its hole) together
  const SX = SHIELD_W / 24;
  const SY = SHIELD_H / 14;
  const resetShields = () => {
    for (const s of shields) {
      for (let y = 0; y < SHIELD_H; y++)
        for (let x = 0; x < SHIELD_W; x++) {
          const yy = y / SY;
          const xx = x / SX;
          // a rounded bunker with an arch cut out underneath
          const corner = (yy < 3 && (xx < 3 - yy || xx > 24 - 4 + yy)) || (yy > 7 && xx > 7 && xx < 24 - 8);
          s[y * SHIELD_W + x] = corner ? 0 : 1;
        }
    }
  };

  const startWave = () => {
    wave++;
    aliens.length = 0;
    const top = 30 + Math.min(40, (wave - 1) * 8);
    for (let row = 0; row < ROWS; row++)
      for (let c = 0; c < COLS; c++) aliens.push({ x: 30 + c * GAP_X, y: top + row * GAP_Y, row, alive: true });
    dir = 1;
    dropNext = false;
    shot = null;
    bombs.length = 0;
    resetShields();
    pause = 90;
  };

  const burst = (x: number, y: number, n: number, color: string) => {
    for (let i = 0; i < n && parts.length < 120; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.3, 1.8);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(12, 26), color });
    }
  };
  const boom = (x: number, y: number, size: number) => booms.push({ x, y, t: 0, size });

  /** does a point hit a shield pixel? if so blow a small hole and return true */
  const hitShield = (io: IO, px: number, py: number, down: boolean) => {
    for (let i = 0; i < shields.length; i++) {
      const lx = Math.floor(px - SHIELD_XS[i]);
      const ly = Math.floor(py - SHIELD_Y);
      if (lx < 0 || lx >= SHIELD_W || ly < 0 || ly >= SHIELD_H) continue;
      const s = shields[i];
      if (!s[ly * SHIELD_W + lx]) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = lx + dx;
          const y = ly + dy + (down ? 1 : -1);
          if (x < 0 || x >= SHIELD_W || y < 0 || y >= SHIELD_H) continue;
          if (Math.abs(dx) + Math.abs(dy) <= 2 || r.chance(0.35)) s[y * SHIELD_W + x] = 0;
        }
      burst(px, py, 5, PAL.grey);
      io.sfx.play("thud");
      return true;
    }
    return false;
  };

  const alive = () => {
    let n = 0;
    for (const a of aliens) if (a.alive) n++;
    return n;
  };

  const hurtPlayer = (io: IO) => {
    if (player.dead >= 0 || player.inv > 0) return;
    player.dead = 0;
    shake = 16;
    burst(player.x + 6, PLAYER_Y + 4, 26, PAL.orange);
    burst(player.x + 6, PLAYER_Y + 4, 12, PAL.cyan);
    boom(player.x + 6, PLAYER_Y + 4, 2);
    io.sfx.play("die");
  };

  startWave();

  return {
    update(io) {
      if (over) return;
      frame++;
      shake = Math.max(0, shake - 1);
      const inp = io.input;

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
      }
      for (const p of popups) {
        p.t++;
        p.y -= 0.3;
      }

      if (pause > 0) {
        pause--;
        return;
      }

      // ── player ──
      if (player.dead >= 0) {
        player.dead++;
        if (player.dead > 90) {
          player.lives--;
          if (player.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          player.dead = -1;
          player.inv = 90;
          player.x = W / 2 - 6;
          bombs.length = 0;
        }
      } else {
        player.inv = Math.max(0, player.inv - 1);
        if (inp.held.left) player.x -= 1.5;
        if (inp.held.right) player.x += 1.5;
        player.x = clamp(player.x, 4, W - 17);
        if (inp.pressed.a && !shot) {
          shot = { x: player.x + 6, y: PLAYER_Y - 4 };
          burst(player.x + 6, PLAYER_Y - 4, 4, PAL.cyan);
          io.sfx.play("laser");
        }
      }

      // ── player zap (one at a time) ──
      if (shot) {
        shot.y -= 5;
        let gone = shot.y < 12 || hitShield(io, shot.x, shot.y, false);
        if (!gone)
          for (const a of aliens) {
            if (a.alive && overlap({ x: shot.x - 1, y: shot.y, w: 2, h: 6 }, { x: a.x, y: a.y, w: AW, h: AH })) {
              a.alive = false;
              gone = true;
              const kindI = ALIEN_ORDER[a.row];
              burst(a.x + 6, a.y + 4, 12, ALIEN_BODY[kindI]);
              boom(a.x + 6, a.y + 4, ROW_PTS[a.row] >= 30 ? 1 : 0);
              io.score(ROW_PTS[a.row] * (1 + Math.floor((wave - 1) / 2)));
              io.sfx.play(ROW_PTS[a.row] >= 20 ? "explode" : "pop");
              break;
            }
          }
        if (!gone && ufo && overlap({ x: shot.x - 1, y: shot.y, w: 2, h: 6 }, { x: ufo.x, y: 16, w: 14, h: 6 })) {
          gone = true;
          io.score(ufo.pts);
          popups.push({ x: ufo.x + 7, y: 16, text: String(ufo.pts), t: 0 });
          burst(ufo.x + 7, 19, 20, PAL.red);
          boom(ufo.x + 7, 19, 2);
          io.sfx.play("coin");
          ufo = null;
        }
        if (gone) shot = null;
      }

      // ── the march ──
      const n = alive();
      if (n === 0) {
        io.score(500 * wave);
        io.sfx.play("win");
        startWave();
        return;
      }
      stepT--;
      if (stepT <= 0) {
        stepT = Math.max(2, Math.round(3 + n * 0.55 - Math.min(6, wave)));
        animFrame ^= 1;
        stepNote = (stepNote + 1) % 4;
        io.sfx.tone([98, 87, 78, 73][stepNote], 0.06, "square", 0.15);
        if (dropNext) {
          for (const a of aliens) a.y += 6;
          dropNext = false;
          dir = -dir;
          io.sfx.noise?.(0.09, 0.12, 260, 70);
        } else {
          const dx = dir * 3;
          for (const a of aliens) a.x += dx;
          let lo = W;
          let hi = 0;
          for (const a of aliens)
            if (a.alive) {
              lo = Math.min(lo, a.x);
              hi = Math.max(hi, a.x + AW);
            }
          if ((dir > 0 && hi >= W - 6) || (dir < 0 && lo <= 6)) dropNext = true;
        }
        // aliens chew through shields they touch; reaching the ground costs a life
        let lowest = 0;
        for (const a of aliens) {
          if (!a.alive) continue;
          lowest = Math.max(lowest, a.y + AH);
          if (a.y + AH >= SHIELD_Y)
            for (let i = 0; i < shields.length; i++) {
              const s = shields[i];
              for (let y = 0; y < SHIELD_H; y++)
                for (let x = 0; x < SHIELD_W; x++) {
                  const px = SHIELD_XS[i] + x;
                  const py = SHIELD_Y + y;
                  if (px >= a.x && px < a.x + AW && py >= a.y && py < a.y + AH) s[y * SHIELD_W + x] = 0;
                }
            }
        }
        if (lowest >= PLAYER_Y - 2 && player.dead < 0) {
          player.inv = 0;
          hurtPlayer(io);
          // push the invaders back up so the kid gets another go
          for (const a of aliens) a.y -= 60;
        }
      }

      // ── alien bombs: only the bottom alien in a column drops them ──
      const maxBombs = Math.min(6, 2 + Math.floor(wave / 2));
      if (player.dead < 0 && bombs.length < maxBombs && r.chance(0.02 + wave * 0.004)) {
        const c = r.int(0, COLS - 1);
        let shooter: Alien | null = null;
        for (let row = ROWS - 1; row >= 0; row--) {
          const a = aliens[row * COLS + c];
          if (a.alive) {
            shooter = a;
            break;
          }
        }
        if (shooter) bombs.push({ x: shooter.x + 6, y: shooter.y + AH, vy: Math.min(2.4, 1.2 + wave * 0.1), zig: r.int(0, 3) });
      }
      for (const b of bombs) {
        b.y += b.vy;
        if (hitShield(io, b.x, b.y + 4, true)) b.y = H + 50;
        else if (player.dead < 0 && overlap({ x: b.x - 1, y: b.y, w: 3, h: 5 }, { x: player.x + 1, y: PLAYER_Y + 2, w: 11, h: 6 })) {
          b.y = H + 50;
          hurtPlayer(io);
        } else if (shot && Math.abs(shot.x - b.x) < 3 && Math.abs(shot.y - b.y) < 5) {
          // zaps can cancel bombs
          burst(b.x, b.y, 5, PAL.white);
          b.y = H + 50;
          shot = null;
          io.score(5);
          io.sfx.play("zap");
        }
      }
      for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i].y > H) bombs.splice(i, 1);

      // ── bonus saucer ──
      ufoT--;
      if (ufoT <= 0 && !ufo) {
        ufoT = r.int(900, 1500);
        const fromLeft = r.chance(0.5);
        ufo = { x: fromLeft ? -16 : W + 2, vx: fromLeft ? 0.9 : -0.9, pts: r.pick([100, 150, 200, 300]) };
      }
      if (ufo) {
        ufo.x += ufo.vx;
        if (frame % 16 === 0) {
          const base = ufo.vx > 0 ? 660 : 620;
          io.sfx.slide?.(base, base - (ufo.vx > 0 ? 40 : -40), 0.14, "sine", 0.09);
          io.sfx.tone(base, 0.05, "sine", 0.06);
        }
        if (ufo.x < -20 || ufo.x > W + 6) ufo = null;
      }

      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t > 50) popups.splice(i, 1);
      for (let i = booms.length - 1; i >= 0; i--) if (++booms[i].t > 16) booms.splice(i, 1);
    },

    draw(g: Gfx) {
      g.sprite(gfx.backdrop, 0, 0);
      for (const s of stars) if ((frame + s.tw * 20) % 120 < 100) g.rect(s.x, s.y, 1, 1, s.tw > 4 ? PAL.white : PAL.dark);
      if (shake) g.camera(r.range(-2, 2), r.range(-1, 1));

      for (const a of aliens) if (a.alive) g.sprite(gfx.aliens[ALIEN_ORDER[a.row]][animFrame], a.x - 2, a.y - 2);
      if (ufo) {
        g.sprite(gfx.saucer, ufo.x, 16);
        const lit = Math.floor(frame / 6) % 3;
        for (let k = 0; k < 3; k++) g.rect(ufo.x + 3 + k * 5, 24, 2, 1, k === lit ? PAL.yellow : shade(PAL.yellow, -0.5));
      }
      // shields: crumbly, shaded rock, drawn as runs of equal colour
      for (let i = 0; i < shields.length; i++) {
        const s = shields[i];
        for (let y = 0; y < SHIELD_H; y++) {
          let x = 0;
          while (x < SHIELD_W) {
            if (!s[y * SHIELD_W + x]) {
              x++;
              continue;
            }
            const col = rockTone(s, i, x, y);
            let x1 = x + 1;
            while (x1 < SHIELD_W && s[y * SHIELD_W + x1] && rockTone(s, i, x1, y) === col) x1++;
            g.rect(SHIELD_XS[i] + x, SHIELD_Y + y, x1 - x, 1, col);
            x = x1;
          }
        }
      }
      if (shot) {
        g.rect(shot.x - 1, shot.y - 3, 2, 3, shade(PAL.cyan, -0.3));
        g.rect(shot.x - 1, shot.y, 2, 6, PAL.white);
        g.rect(shot.x, shot.y, 1, 7, PAL.cyan);
      }
      for (const b of bombs) {
        const z = (Math.floor(b.y / 3) + b.zig) % 2 ? 1 : -1;
        g.rect(b.x - 1 - z, b.y - 2, 1, 2, shade(PAL.orange, -0.4));
        g.rect(b.x - 1 + z, b.y, 2, 2, PAL.yellow);
        g.rect(b.x - 1 - z, b.y + 2, 2, 2, PAL.orange);
      }
      if (player.dead < 0 && !(player.inv > 0 && Math.floor(player.inv / 4) % 2)) {
        const flameFrame = Math.floor(frame / 4) % 2;
        g.sprite(gfx.ship[flameFrame], player.x - 2, PLAYER_Y - 4);
      }
      for (const b of booms) g.sprite(gfx.boom[Math.min(gfx.boom.length - 1, b.size + Math.floor(b.t / 6))], b.x - 6, b.y - 6);
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      for (const p of popups) g.text(p.text, p.x, p.y, PAL.yellow, { align: "center" });
      g.camera(0, 0);

      // HUD: a thin framed panel so the readout doesn't fight the starfield
      g.alpha(0.55);
      g.rect(0, 0, W, 10, PAL.night);
      g.alpha(1);
      g.rect(0, 9, W, 1, PAL.navy);
      for (let i = 0; i < player.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`WAVE ${wave}`, W - 4, 2, PAL.lime, { align: "right" });
      if (pause > 0) {
        g.alpha(0.6);
        g.rect(0, 96, W, 40, PAL.night);
        g.alpha(1);
        g.text(`WAVE ${wave}`, W / 2, 110, PAL.yellow, { align: "center", size: 2 });
        g.text("GET READY!", W / 2, 130, PAL.white, { align: "center" });
      }
    },
  };
}

export const alienWave: RetroGameDef = {
  id: "alien-wave",
  title: "Alien Wave",
  blurb: "Stop the marching alien rows before they land!",
  genre: "Shooter",
  emoji: "👾",
  color: "#b6f24a",
  controls: "◀ ▶ move · A fire (one zap at a time)",
  pad: { dpad: "lr", a: "Fire" },
  create,
};
