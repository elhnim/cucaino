// BOOM BLOCKS — a maze bomber. Drop bombs that blast in a cross, break crates to find
// power-ups (more bombs, bigger blasts, faster feet), set off chain reactions and pop every
// cartoon critter to open the exit door. Eight stages; stay out of your own blast!
// (Original game in the spirit of 8-bit maze bombers.)
//
// Look: a neon-lit vault — plated stone blocks on a deep navy floor, crates wrapped in orange
// tape, a cyan dome-head robot bomber, one-eyed jelly critters and a bright white-gold blast
// cross, matching the cabinet painting (tiles/boomBlocks.png). Big art is baked once, lazily,
// via `art()` the first time a round needs it, so module load stays tiny.
import { PAL, W, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Rng, type Sprite } from "../engine";
import { bake, hash2, outlined, shade } from "../art";

const T = 16;
const COLS = 15;
const ROWS = 13;
const OX = 8; // arena offset on screen (240 x 208 arena under a 16px HUD)
const OY = 16;
const STAGES = 8;
const FUSE = 150;
const FLAME = 26;

const WALL = 1;
const CRATE = 2;

// ── painting palette ──
const FLOOR_LO = "#141b42";
const FLOOR_HI = "#1b245a";
const WALL_BASE = "#8b93c0";
const WALL_BORDER = "#5a6294";
const CRATE_WOOD = "#d08d49";
const CRATE_TAPE = "#8a4a22";
const CRATE_EDGE = "#3c2110";
const BOT_CY = "#49d6ef";
const BOT_CYL = "#a9f4ff";
const BOT_CYD = "#1b7f9c";
const BOT_VISOR = "#0c0e1d";
const BOT_TREAD = "#2b2f44";
const BOT_TREADL = "#5a6080";
const GEM_CY = "#3fe0ff";
const GEM_HI = "#eaffff";
const GEM_LO = "#1484b0";

// ── sprites (baked lazily — see art() below) ──
interface Art {
  floor: [Sprite, Sprite];
  wallBorder: Sprite;
  wallInner: Sprite;
  crate: Sprite;
  bombBody: Sprite;
  gem: Sprite;
  flameIcon: Sprite;
  doorFrame: Sprite;
  player: Record<string, Sprite[]>;
  critters: Record<EKind, Sprite[]>;
}
/** a stone/metal plated block with a bevelled rim and four rivets (the maze's fixed pillars) */
function wallBlock(base: string): Sprite {
  return bake(T, T, (x, y) => {
    // a rounded bevelled plate: corners nick in slightly, a bright top-left rim, a dark seam
    const cornerCut = (x < 1 && y < 1) || (x > T - 2 && y < 1) || (x < 1 && y > T - 2) || (x > T - 2 && y > T - 2);
    if (cornerCut) return shade(base, -0.42);
    if (x === 0 || y === 0) return shade(base, 0.4);
    if (x === T - 1 || y === T - 1) return shade(base, -0.4);
    if (x === 1 || y === 1) return shade(base, 0.2);
    if (x === T - 2 || y === T - 2) return shade(base, -0.2);
    // scattered dark speckles, like weathered stone
    const n = hash2(x, y, 7);
    if (n > 0.9) return shade(base, -0.3);
    if (n > 0.8) return shade(base, -0.16);
    return shade(base, (n - 0.5) * 0.05);
  });
}
/** the open vault floor: a flat dark navy tile with a scatter of tiny light specks */
function floorTile(base: string, variant: number): Sprite {
  return bake(T, T, (x, y) => {
    const n = hash2(x + variant * 41, y + variant * 59, 31);
    if (n > 0.96) return shade(base, 0.35);
    if (n > 0.92) return shade(base, 0.16);
    return shade(base, (hash2(x, y, 3) - 0.5) * 0.03);
  });
}
/** a wood crate with a single diagonal strap, like the painting's packing crates */
function crateSprite(): Sprite {
  return bake(T, T, (x, y) => {
    if (x === 0 || y === 0 || x === T - 1 || y === T - 1) return CRATE_EDGE;
    if (x === 1 || y === 1 || x === T - 2 || y === T - 2) return shade(CRATE_EDGE, 0.5);
    let base = CRATE_WOOD;
    const d1 = x - y;
    if (d1 >= -1 && d1 <= 2) base = shade(CRATE_TAPE, d1 <= 0 ? 0.12 : -0.1);
    return shade(base, (hash2(x, y, 13) - 0.5) * 0.05);
  });
}
/** a glossy round bomb with a highlight, same art used on the floor and as the ammo icon */
function bombSprite(): Sprite {
  return bake(T, T, (x, y) => {
    const dx = x - 7.5;
    const dy = y - 8.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 6.6) return null;
    if (d > 5.9) return "#2a2e44";
    const hdx = x - 5.2;
    const hdy = y - 5.6;
    if (hdx * hdx + hdy * hdy < 2.4) return "#aab0d0";
    if (hdx * hdx + hdy * hdy < 6) return "#4a4e68";
    return "#15131f";
  });
}
/** the faceted cyan gem from the painting — used for the speed power-up */
function gemSprite(): Sprite {
  return bake(12, 12, (x, y) => {
    const dx = Math.abs(x - 6);
    const dy = y - 6;
    const top = dy < 0 ? -dy * 1.6 : dy;
    if (dx + top > 6.4) return null;
    if (dx + top > 5.3) return GEM_LO;
    if (dy < -1.5 && dx < 2.2) return GEM_HI;
    if (dx > dy) return shade(GEM_CY, -0.18);
    return GEM_CY;
  });
}
/** a static teardrop flame icon for the fire-range power-up */
function flameIconSprite(): Sprite {
  return bake(T, T, (x, y) => {
    const cx = 8;
    const cy = 11;
    const flick = Math.sin((x - cx) * 0.9) * 0.15;
    const dx = (x - cx) / 4.4;
    const dy = (y - cy) / 7 + flick;
    const d = dx * dx + dy * dy;
    if (d > 1.1) return null;
    if (d > 0.78) return "#ff6a1f";
    if (d > 0.4) return "#ffb23c";
    return "#fff6c4";
  });
}
/** a plated arch frame; the opening is filled at draw time (plank brown closed, glow when open) */
function doorFrameSprite(): Sprite {
  return bake(T, T, (x, y) => {
    if (x === 0 || y === 0 || x === T - 1 || y === T - 1) return "#232a4a";
    if (x === 1 || y === 1 || x === T - 2 || y === T - 2) return "#5a6294";
    return null;
  });
}
/** a round dome-head robot bomber: a cyan head with two round goggle-eyes, a pale belly
 *  patch, white glove hands and tread feet that alternate for the walk cycle. */
function robotFrame(facing: "down" | "up" | "side", step: number): Sprite {
  const GLOVE = "#eef8ff";
  return bake(16, 20, (x, y) => {
    if (x === 8 && y <= 1) return y === 0 ? GLOVE : BOT_TREADL; // antenna + ball tip
    const hx = x - 8;
    const hy = y - 6;
    const headD = hx * hx + hy * 1.15 * (hy * 1.15);
    if (headD <= 25) {
      if (facing !== "up") {
        // two round goggle-eyes (one, shifted, when seen from the side)
        const spread = facing === "side" ? 1.8 : 2.7;
        const ex = facing === "side" ? 1.4 : 0;
        for (const sgn of facing === "side" ? [1] : [-1, 1]) {
          const edx = x - (8 + ex + sgn * spread);
          const edy = y - 5.6;
          if (edx * edx / 1.7 + edy * edy / 2.5 <= 1) return BOT_VISOR;
        }
      } else if (hy >= -0.6 && hy <= 0.6 && Math.abs(hx) <= 2.2) return BOT_TREAD; // back vent seam
      if (hx < -1.4 && hy < -1) return BOT_CYL;
      if (hx > 1.6 || hy > 2.2) return BOT_CYD;
      return BOT_CY;
    }
    if (y >= 11 && y <= 16) {
      const w = 6 - Math.max(0, y - 14) * 0.6;
      if (Math.abs(hx) <= w) {
        if (y === 13) return BOT_CYD; // belt line
        if (facing !== "up" && y >= 14 && Math.abs(hx) <= 2) return "#dff6ff"; // pale belly patch
        if (hx < -2 && y < 14) return BOT_CYL;
        if (hx > 2 || y > 15) return BOT_CYD;
        return BOT_CY;
      }
    }
    if (y >= 12 && y <= 14 && (Math.abs(x - 1) <= 1 || Math.abs(x - 14) <= 1)) return GLOVE; // glove hands
    if (y >= 17 && y <= 19) {
      const lifted = step === 0;
      const left = x >= 3 && x <= 6;
      const right = x >= 9 && x <= 12;
      if (left && !(lifted && y === 19)) return y === 17 ? BOT_TREADL : BOT_TREAD;
      if (right && !(!lifted && y === 19)) return y === 17 ? BOT_TREADL : BOT_TREAD;
    }
    return null;
  });
}
/** a round one-eyed jelly critter; `blink` closes the eye for a frame of personality */
function critterFrame(color: string, angry: boolean, blink: boolean): Sprite {
  return bake(14, 13, (x, y) => {
    const cx = 7;
    const cy = 7;
    const dx = (x - cx) / 6.4;
    const dy = (y - cy) / 6;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    const ex = cx;
    const ey = cy - 1.6;
    const edx = (x - ex) / 3.6;
    const edy = (y - ey) / (blink ? 0.9 : 2.8);
    if (edx * edx + edy * edy <= 1) {
      if (blink) return "#140c28";
      const pdx = (x - ex) / 1.5;
      const pdy = (y - (ey + 0.5)) / 1.5;
      if (pdx * pdx + pdy * pdy <= 1) return "#140c28";
      return "#fbfbff";
    }
    if (angry && y <= cy - 2 && Math.abs(x - cx) <= 4) return "#140c28";
    const rim = dx < -0.25 && dy < -0.1;
    const sh = dx > 0.3 || dy > 0.45;
    return rim ? shade(color, 0.3) : sh ? shade(color, -0.3) : color;
  });
}

function buildArt(): Art {
  const player: Record<string, Sprite[]> = {
    down: [outlined(robotFrame("down", 0)), outlined(robotFrame("down", 1))],
    up: [outlined(robotFrame("up", 0)), outlined(robotFrame("up", 1))],
    side: [outlined(robotFrame("side", 0)), outlined(robotFrame("side", 1))],
  };
  const critters = {} as Record<EKind, Sprite[]>;
  for (const kind of Object.keys(E_INFO) as EKind[]) {
    const { color, angry } = E_INFO[kind];
    critters[kind] = [outlined(critterFrame(color, angry, false)), outlined(critterFrame(color, angry, true))];
  }
  return {
    floor: [floorTile(FLOOR_LO, 0), floorTile(FLOOR_HI, 1)],
    wallBorder: wallBlock(WALL_BORDER),
    wallInner: wallBlock(WALL_BASE),
    crate: crateSprite(),
    bombBody: bombSprite(),
    gem: gemSprite(),
    flameIcon: flameIconSprite(),
    doorFrame: doorFrameSprite(),
    player,
    critters,
  };
}
let ART: Art | null = null;
const art = (): Art => (ART ??= buildArt());

type EKind = "puff" | "drop" | "chaser" | "ghost";
const E_INFO: Record<EKind, { speed: number; pts: number; color: string; angry: boolean }> = {
  puff: { speed: 0.5, pts: 100, color: "#ff4d5e", angry: false },
  drop: { speed: 0.7, pts: 200, color: "#3ddc7a", angry: false },
  chaser: { speed: 0.72, pts: 400, color: "#ff9d3c", angry: true },
  ghost: { speed: 0.45, pts: 800, color: "#a55bff", angry: true },
};

type PowKind = "bomb" | "fire" | "speed" | "heart";
interface Bomb {
  c: number;
  r: number;
  t: number;
  range: number;
  pass: boolean;
  done: boolean;
}
interface Flame {
  c: number;
  r: number;
  t: number;
  axis: "c" | "h" | "v";
}
interface Enemy {
  kind: EKind;
  x: number;
  y: number;
  dx: number;
  dy: number;
  tc: number;
  tr: number;
  dead: number; // -1 alive
  t: number;
}
interface Pow {
  c: number;
  r: number;
  kind: PowKind;
  hidden: boolean;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

function buildStage(stage: number, r: Rng) {
  const grid: number[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row: number[] = [];
    for (let x = 0; x < COLS; x++) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 || (x % 2 === 0 && y % 2 === 0)) row.push(WALL);
      else row.push(r.chance(0.42 + stage * 0.025) ? CRATE : 0);
    }
    grid.push(row);
  }
  // a safe corner to start in
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3]]) grid[y][x] = 0;
  // critters start far from the hero, on cleared floor
  const kinds: EKind[] = [];
  const count = Math.min(9, 3 + stage);
  for (let i = 0; i < count; i++) {
    if (stage >= 4 && i % 4 === 3) kinds.push("ghost");
    else if (stage >= 2 && i % 3 === 2) kinds.push("chaser");
    else if (stage >= 1 && i % 2 === 1) kinds.push("drop");
    else kinds.push("puff");
  }
  const enemies: Enemy[] = [];
  let guard = 0;
  while (enemies.length < kinds.length && guard++ < 500) {
    const c = r.int(1, COLS - 2);
    const rr = r.int(1, ROWS - 2);
    if (grid[rr][c] === WALL || c + rr < 8 || enemies.some((e) => e.tc === c && e.tr === rr)) continue;
    grid[rr][c] = 0;
    if (c + 1 < COLS - 1 && grid[rr][c + 1] === CRATE) grid[rr][c + 1] = 0; // room to move
    enemies.push({ kind: kinds[enemies.length], x: c * T, y: rr * T, dx: 0, dy: 0, tc: c, tr: rr, dead: -1, t: r.int(0, 30) });
  }
  // the exit door and power-ups hide under crates
  const crates: [number, number][] = [];
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (grid[y][x] === CRATE) crates.push([x, y]);
  for (let i = crates.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [crates[i], crates[j]] = [crates[j], crates[i]];
  }
  const far = crates.findIndex(([x, y]) => x + y > 10);
  const [dc, dr] = crates.length ? crates.splice(Math.max(0, far), 1)[0] : [COLS - 2, ROWS - 2];
  if (!crates.length) grid[dr][dc] = CRATE;
  const door = { c: dc, r: dr };
  const kindsP: PowKind[] = ["bomb", "fire", "speed", "bomb", "fire"];
  if (stage % 3 === 2) kindsP.push("heart");
  const pows: Pow[] = kindsP.slice(0, crates.length).map((kind, i) => ({ c: crates[i][0], r: crates[i][1], kind, hidden: true }));
  return { grid, enemies, door, pows };
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let stage = 0;
  let lv = buildStage(0, r);
  let lives = 3;
  let maxBombs = 1;
  let range = 2;
  let speed = 1.1;
  let over = false;
  let won = false;
  let tick = 0;
  let state: "intro" | "play" | "dead" | "clear" = "intro";
  let stateT = 0;
  let doorOpen = false;
  let doorShown = false;
  const hero = { x: T, y: T, facing: "down", flip: false, anim: 0, inv: 0 };
  let bombs: Bomb[] = [];
  let flames: Flame[] = [];
  let parts: Part[] = [];
  let pops: { x: number; y: number; t: number; text: string }[] = [];
  let shake = 0;

  const newStage = () => {
    lv = buildStage(stage, r);
    hero.x = T;
    hero.y = T;
    hero.facing = "down";
    hero.inv = 0;
    bombs = [];
    flames = [];
    parts = [];
    pops = [];
    doorOpen = false;
    doorShown = false;
    state = "intro";
    stateT = 0;
  };

  const bombAt = (c: number, rr: number) => bombs.find((b) => !b.done && b.c === c && b.r === rr);
  const heroFree = (c: number, rr: number) => {
    if (c < 0 || rr < 0 || c >= COLS || rr >= ROWS || lv.grid[rr][c] !== 0) return false;
    const b = bombAt(c, rr);
    return !b || b.pass;
  };
  const enemyFree = (e: Enemy, c: number, rr: number) => {
    if (c < 1 || rr < 1 || c >= COLS - 1 || rr >= ROWS - 1) return false;
    const g = lv.grid[rr][c];
    if (g === WALL || (g === CRATE && e.kind !== "ghost")) return false;
    return !bombAt(c, rr);
  };
  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.next();
      const s = r.range(0.6, 2);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(14, 26), color });
    }
  };

  /** Grid movement that feels smooth: to go along a corridor you must line up with it, and
   *  if you're a little off we slide you around the corner automatically. */
  const moveHero = (dx: number, dy: number) => {
    const sp = speed;
    if (dx) {
      const row = Math.round(hero.y / T);
      const off = hero.y - row * T;
      if (Math.abs(off) > 0.01) {
        const col = hero.x / T + dx; // x is aligned whenever y isn't
        const other = row + Math.sign(off);
        const ahead = Math.round(col);
        if (heroFree(ahead, row)) hero.y -= Math.sign(off) * Math.min(sp, Math.abs(off));
        else if (Math.abs(off) > 3 && heroFree(ahead, other)) hero.y += Math.sign(off) * Math.min(sp, T - Math.abs(off));
        return;
      }
      hero.y = row * T;
      if (dx > 0) {
        const c = Math.floor(hero.x / T);
        const frac = hero.x - c * T;
        const limit = frac > 0.01 || heroFree(c + 1, row) ? (c + 1) * T + (heroFree(c + 2, row) ? T : 0) : c * T;
        hero.x = Math.min(hero.x + sp, limit);
      } else {
        const c = Math.ceil(hero.x / T);
        const frac = c * T - hero.x;
        const limit = frac > 0.01 || heroFree(c - 1, row) ? (c - 1) * T - (heroFree(c - 2, row) ? T : 0) : c * T;
        hero.x = Math.max(hero.x - sp, limit);
      }
    } else if (dy) {
      const col = Math.round(hero.x / T);
      const off = hero.x - col * T;
      if (Math.abs(off) > 0.01) {
        const ahead = Math.round(hero.y / T + dy);
        const other = col + Math.sign(off);
        if (heroFree(col, ahead)) hero.x -= Math.sign(off) * Math.min(sp, Math.abs(off));
        else if (Math.abs(off) > 3 && heroFree(other, ahead)) hero.x += Math.sign(off) * Math.min(sp, T - Math.abs(off));
        return;
      }
      hero.x = col * T;
      if (dy > 0) {
        const rr = Math.floor(hero.y / T);
        const frac = hero.y - rr * T;
        const limit = frac > 0.01 || heroFree(col, rr + 1) ? (rr + 1) * T + (heroFree(col, rr + 2) ? T : 0) : rr * T;
        hero.y = Math.min(hero.y + sp, limit);
      } else {
        const rr = Math.ceil(hero.y / T);
        const frac = rr * T - hero.y;
        const limit = frac > 0.01 || heroFree(col, rr - 1) ? (rr - 1) * T - (heroFree(col, rr - 2) ? T : 0) : rr * T;
        hero.y = Math.max(hero.y - sp, limit);
      }
    }
  };

  const explode = (io: IO, b: Bomb, chain = 0) => {
    if (b.done) return;
    b.done = true;
    shake = 6;
    io.sfx.play("explode");
    io.sfx.tone?.(260 + chain * 90, 70, "square", 0.22);
    flames.push({ c: b.c, r: b.r, t: FLAME, axis: "c" });
    burst(b.c * T + 8, b.r * T + 8, PAL.orange, 6);
    burst(b.c * T + 8, b.r * T + 8, "#fff6c4", 4);
    let brokeCrate = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let i = 1; i <= b.range; i++) {
        const c = b.c + dx * i;
        const rr = b.r + dy * i;
        const g = lv.grid[rr]?.[c];
        if (g === undefined || g === WALL) break;
        flames.push({ c, r: rr, t: FLAME, axis: dx ? "h" : "v" });
        if (g === CRATE) {
          lv.grid[rr][c] = 0;
          burst(c * T + 8, rr * T + 8, CRATE_TAPE, 7);
          io.score(10);
          brokeCrate = true;
          const pw = lv.pows.find((p) => p.c === c && p.r === rr);
          if (pw) pw.hidden = false;
          if (lv.door.c === c && lv.door.r === rr) doorShown = true;
          break;
        }
        const other = bombAt(c, rr);
        if (other) {
          explode(io, other, chain + 1); // chain reaction!
          break;
        }
      }
    }
    if (brokeCrate) io.sfx.play("thud");
  };

  const heroDie = (io: IO) => {
    if (state !== "play" || hero.inv > 0) return;
    state = "dead";
    stateT = 0;
    io.sfx.play("die");
    burst(hero.x + 8, hero.y + 8, PAL.white, 12);
  };

  const inFlame = (x: number, y: number, pad: number) =>
    flames.some((f) => x + pad < f.c * T + T && x + T - pad > f.c * T && y + pad < f.r * T + T && y + T - pad > f.r * T);

  const updateEnemies = (io: IO) => {
    const hc = Math.round(hero.x / T);
    const hr = Math.round(hero.y / T);
    for (const e of lv.enemies) {
      e.t++;
      if (e.dead >= 0) {
        e.dead--;
        continue;
      }
      const sp = E_INFO[e.kind].speed + stage * 0.03;
      const tx = e.tc * T;
      const ty = e.tr * T;
      const d = Math.abs(tx - e.x) + Math.abs(ty - e.y);
      if (d <= sp) {
        // at a cell centre: pick where to go next
        e.x = tx;
        e.y = ty;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => enemyFree(e, e.tc + dx, e.tr + dy));
        if (dirs.length) {
          let pick = dirs.find(([dx, dy]) => dx === e.dx && dy === e.dy && r.chance(0.75));
          const near = Math.abs(hc - e.tc) + Math.abs(hr - e.tr) < 7;
          if (e.kind === "chaser" && near && r.chance(0.7)) {
            dirs.sort((a, b) => Math.abs(hc - e.tc - a[0]) + Math.abs(hr - e.tr - a[1]) - (Math.abs(hc - e.tc - b[0]) + Math.abs(hr - e.tr - b[1])));
            pick = dirs[0];
          }
          if (!pick) pick = r.pick(dirs);
          e.dx = pick[0];
          e.dy = pick[1];
          e.tc += e.dx;
          e.tr += e.dy;
        } else {
          e.dx = 0;
          e.dy = 0;
        }
      } else {
        // a bomb landed in our path: turn back
        if (!enemyFree(e, e.tc, e.tr)) {
          e.tc -= e.dx;
          e.tr -= e.dy;
          e.dx = -e.dx;
          e.dy = -e.dy;
        }
        e.x += Math.sign(tx - e.x) * Math.min(sp, Math.abs(tx - e.x));
        e.y += Math.sign(ty - e.y) * Math.min(sp, Math.abs(ty - e.y));
      }
      if (inFlame(e.x, e.y, 4)) {
        e.dead = 30;
        const pts = E_INFO[e.kind].pts;
        io.score(pts);
        pops.push({ x: e.x, y: e.y, t: 0, text: String(pts) });
        io.sfx.play("hit");
        io.sfx.tone?.(260 + pts / 3, 90, "square", 0.3);
        burst(e.x + 8, e.y + 8, E_INFO[e.kind].color, 10);
        continue;
      }
      if (state === "play" && Math.abs(e.x - hero.x) < 11 && Math.abs(e.y - hero.y) < 11) heroDie(io);
    }
    lv.enemies = lv.enemies.filter((e) => e.dead !== 0);
  };

  return {
    update(io) {
      if (over || won) return;
      tick++;
      shake = Math.max(0, shake - 1);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.life--;
      }
      parts = parts.filter((p) => p.life > 0);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 40);

      if (state === "intro") {
        if (++stateT > 80) state = "play";
        return;
      }
      if (state === "clear") {
        stateT++;
        if (stateT === 1) io.sfx.play("win");
        if (stateT > 120) {
          stage++;
          if (stage >= STAGES) {
            won = true;
            io.score(lives * 2000);
            io.win();
            return;
          }
          newStage();
        }
        return;
      }

      // bombs + flames (keep ticking while the hero is dazed)
      for (const b of bombs) {
        if (b.pass && !(Math.abs(hero.x - b.c * T) < T - 1 && Math.abs(hero.y - b.r * T) < T - 1)) b.pass = false;
        if (b.t === 45 || b.t === 30 || b.t === 18) io.sfx.tone?.(500, 40, "square", 0.12);
        if (--b.t <= 0) explode(io, b);
      }
      bombs = bombs.filter((b) => !b.done);
      for (const f of flames) f.t--;
      flames = flames.filter((f) => f.t > 0);

      if (state === "dead") {
        stateT++;
        updateEnemies(io);
        if (stateT > 90) {
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          hero.x = T;
          hero.y = T;
          hero.inv = 150;
          hero.facing = "down";
          bombs = [];
          flames = [];
          state = "play";
        }
        return;
      }

      // ── hero ──
      hero.inv = Math.max(0, hero.inv - 1);
      const inp = io.input.held;
      const ox = hero.x;
      const oy = hero.y;
      if (inp.left) {
        moveHero(-1, 0);
        hero.facing = "side";
        hero.flip = true;
      } else if (inp.right) {
        moveHero(1, 0);
        hero.facing = "side";
        hero.flip = false;
      } else if (inp.up) {
        moveHero(0, -1);
        hero.facing = "up";
      } else if (inp.down) {
        moveHero(0, 1);
        hero.facing = "down";
      }
      const moved = Math.abs(hero.x - ox) + Math.abs(hero.y - oy);
      hero.anim += moved * 0.08;
      if (moved && Math.floor(hero.anim) !== Math.floor(hero.anim - moved * 0.08) && Math.floor(hero.anim) % 2 === 0) io.sfx.play("step");
      if (io.input.pressed.a) {
        const c = Math.round(hero.x / T);
        const rr = Math.round(hero.y / T);
        if (bombs.length < maxBombs && !bombAt(c, rr) && lv.grid[rr][c] === 0) {
          bombs.push({ c, r: rr, t: FUSE, range, pass: true, done: false });
          io.sfx.play("blip");
        }
      }
      // power-ups
      const hc = Math.round(hero.x / T);
      const hr = Math.round(hero.y / T);
      for (const p of lv.pows) {
        if (p.hidden || p.c !== hc || p.r !== hr) continue;
        p.hidden = true;
        p.c = -1;
        io.sfx.play("powerup");
        io.sfx.slide?.(600, 1000, 180, "triangle", 0.3);
        io.score(200);
        const label = p.kind === "bomb" ? "BOMB +1" : p.kind === "fire" ? "FIRE +1" : p.kind === "speed" ? "SPEED UP" : "1UP";
        if (p.kind === "bomb") maxBombs = Math.min(6, maxBombs + 1);
        else if (p.kind === "fire") range = Math.min(6, range + 1);
        else if (p.kind === "speed") speed = Math.min(2, speed + 0.25);
        else lives = Math.min(5, lives + 1);
        pops.push({ x: hero.x - 8, y: hero.y - 4, t: 0, text: label });
      }
      if (inFlame(hero.x, hero.y, 5)) heroDie(io); // must be well inside the blast to get caught
      updateEnemies(io);

      // exit door
      if (!doorOpen && lv.enemies.every((e) => e.dead >= 0)) {
        doorOpen = true;
        if (!doorShown) {
          doorShown = true;
          lv.grid[lv.door.r][lv.door.c] = 0;
          burst(lv.door.c * T + 8, lv.door.r * T + 8, PAL.yellow, 12);
        }
        io.sfx.play("powerup");
        io.sfx.slide?.(500, 900, 260, "triangle", 0.3);
        pops.push({ x: lv.door.c * T - 16, y: lv.door.r * T - 6, t: -30, text: "EXIT OPEN!" });
      }
      if (state === "play" && doorOpen && lv.grid[lv.door.r][lv.door.c] === 0 && Math.abs(hero.x - lv.door.c * T) < 6 && Math.abs(hero.y - lv.door.r * T) < 6) {
        state = "clear";
        stateT = 0;
        io.score(1000 * (stage + 1));
      }
    },

    draw(g: Gfx) {
      const A = art();
      g.clear(FLOOR_LO);
      const sx = shake ? ((tick % 2) * 2 - 1) * 2 : 0;
      const sy = shake ? ((Math.floor(tick / 2) % 2) * 2 - 1) * 2 : 0;
      g.camera(-OX - sx, -OY - sy);
      // arena
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const px = x * T;
          const py = y * T;
          const cell = lv.grid[y][x];
          if (cell === WALL) {
            const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
            g.sprite(border ? A.wallBorder : A.wallInner, px, py);
            if (!border && (x + y) % 7 === 0) g.rect(px + 7, py + 7, 2, 2, tick % 40 < 20 ? "#fff6c4" : "#ffd23f");
            continue;
          }
          g.sprite(A.floor[(x + y) % 2], px, py);
          if (x === lv.door.c && y === lv.door.r && doorShown) {
            g.sprite(A.doorFrame, px, py);
            if (doorOpen) {
              const glow = Math.floor(tick / 8) % 2 ? "#ffe38a" : "#ff9d3c";
              g.rect(px + 2, py + 2, T - 4, T - 4, "#1a0f06");
              g.rect(px + 3, py + 3, T - 6, T - 6, glow);
            } else {
              g.rect(px + 2, py + 2, T - 4, T - 4, "#5c3414");
              g.rect(px + 4, py + 4, T - 8, T - 8, "#8a4f24");
              g.rect(px + 4, py + 4, T - 8, 2, "#b1672f");
            }
          }
          const pw = lv.pows.find((p) => !p.hidden && p.c === x && p.r === y);
          if (pw && cell === 0) {
            const pulse = Math.floor(tick / 10) % 2;
            g.circle(px + 8, py + 9, 7, pulse ? "rgba(255,210,100,0.3)" : "rgba(255,160,60,0.2)");
            if (pw.kind === "bomb") g.sprite(A.bombBody, px, py);
            else if (pw.kind === "fire") g.sprite(A.flameIcon, px, py);
            else if (pw.kind === "speed") g.sprite(A.gem, px + 2, py + 2);
            else g.text("♥", px + 5 + OX, py + 4 + OY, PAL.red);
          }
          if (cell === CRATE) g.sprite(A.crate, px, py);
        }
      }
      // bombs
      for (const b of bombs) {
        const cx = b.c * T;
        const cy = b.r * T;
        const urgent = b.t < 40;
        if (urgent && Math.floor(b.t / 4) % 2) g.circle(cx + 8, cy + 8, 9, "rgba(255,70,40,0.3)");
        g.sprite(A.bombBody, cx, cy);
        const fx = cx + 11;
        const fy = cy - (urgent ? 2 : 1);
        g.rect(fx, fy, 2, 4, "#6a4a2a");
        g.circle(fx + 1, fy - 2, urgent ? (tick % 2 ? 2 : 1) : 1, tick % 4 < 2 ? PAL.yellow : PAL.orange);
      }
      // flames
      for (const f of flames) {
        const k = f.t / FLAME;
        const th = Math.max(3, Math.round(13 * Math.min(1, k * 1.6)));
        const px = f.c * T;
        const py = f.r * T;
        const outer = f.t % 4 < 2 ? "#ff7a1f" : "#ff3b30";
        if (f.axis === "h" || f.axis === "c") g.rect(px, py + 8 - th / 2, T, th, outer);
        if (f.axis === "v" || f.axis === "c") g.rect(px + 8 - th / 2, py, th, T, outer);
        const mid = Math.max(2, th - 5);
        if (f.axis === "h" || f.axis === "c") g.rect(px, py + 8 - mid / 2, T, mid, PAL.yellow);
        if (f.axis === "v" || f.axis === "c") g.rect(px + 8 - mid / 2, py, mid, T, PAL.yellow);
        const core = th - 9;
        if (core > 0) {
          if (f.axis === "h" || f.axis === "c") g.rect(px + 2, py + 8 - core / 2, T - 4, core, "#fff6c4");
          if (f.axis === "v" || f.axis === "c") g.rect(px + 8 - core / 2, py + 2, core, T - 4, "#fff6c4");
        }
        if (f.axis === "c") {
          g.circle(px + 8, py + 8, th / 2 + 1, "#fff6c4");
          if (f.t > FLAME - 7) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) g.line(px + 8, py + 8, px + 8 + dx * 10, py + 8 + dy * 10, "#ffe38a");
        }
      }
      // critters
      for (const e of lv.enemies) {
        const cyc = e.t % 90;
        const fr = A.critters[e.kind][cyc > 84 ? 1 : 0];
        const bob = Math.sin(e.t * 0.2) > 0.6 ? 1 : 0;
        if (e.dead >= 0) {
          if (Math.floor(e.dead / 3) % 2) g.sprite(fr, e.x + 1, e.y + 2, { flipY: true });
          continue;
        }
        if (e.kind === "ghost") g.alpha(0.75);
        g.sprite(fr, e.x + 1, e.y + 1 - bob, { flipX: e.dx < 0 });
        g.alpha(1);
      }
      // hero
      if (state === "dead") {
        if (stateT < 50 && Math.floor(stateT / 4) % 2 === 0) g.sprite(A.player.down[0], hero.x, hero.y - 4, { flipY: stateT > 20 });
      } else if (!(hero.inv > 0 && Math.floor(hero.inv / 3) % 2)) {
        g.sprite(A.player[hero.facing][Math.floor(hero.anim) % 2], hero.x, hero.y - 4, { flipX: hero.flip && hero.facing === "side" });
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      for (const p of pops) if (p.t >= 0) g.text(p.text, p.x + OX, p.y + OY - p.t * 0.5, PAL.white);
      g.camera(0, 0);
      // HUD
      g.rect(0, 0, W, OY, "#0c0f22");
      g.rect(0, OY - 2, W, 1, "#454d8a");
      g.rect(0, OY - 1, W, 1, "#05061a");
      g.text(`STAGE ${stage + 1}`, 4, 4, PAL.yellow);
      g.text(`♥X${lives}`, 66, 4, PAL.red);
      g.sprite(A.bombBody, 102, 0);
      g.text(`${maxBombs}`, 113, 4, PAL.white);
      g.sprite(A.flameIcon, 128, 0);
      g.text(`${range}`, 142, 4, PAL.white);
      g.sprite(A.gem, 158, 2);
      g.text(`${Math.round((speed - 1.1) / 0.25) + 1}`, 172, 4, PAL.white);
      const left = lv.enemies.filter((e) => e.dead < 0).length;
      g.text(left ? `FOES ${left}` : "EXIT!", W - 4, 4, left ? PAL.pink : PAL.lime, { align: "right" });
      if (state === "intro") {
        g.rect(40, 94, W - 80, 36, "#0c0f22");
        g.rect(40, 94, W - 80, 2, "#5a6294");
        g.rect(40, 128, W - 80, 2, "#232a4a");
        g.text(`STAGE ${stage + 1}`, W / 2, 102, PAL.yellow, { align: "center" });
        g.text("POP THEM ALL!", W / 2, 116, PAL.white, { align: "center" });
      }
      if (state === "clear") g.text(stage >= STAGES - 1 ? "ALL CLEAR!" : "STAGE CLEAR!", W / 2, 104, PAL.yellow, { align: "center", size: 2 });
    },
  };
}

export const boomBlocks: RetroGameDef = {
  id: "boom-blocks",
  title: "Boom Blocks",
  blurb: "Drop bombs, blast crates and pop every critter to open the exit!",
  genre: "Action",
  emoji: "💣",
  color: "#ff4a4a",
  controls: "✚ walk · A drop a bomb · break crates for power-ups · don't stand in the blast!",
  pad: { dpad: "4", a: "Bomb" },
  create,
};
