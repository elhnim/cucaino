// SPACE ROCKS — drift through a field of tumbling space rocks in a tiny rocket. Turn with
// left/right, thrust with up (you keep sliding, space has no brakes!) and zap the rocks:
// big ones crack into medium ones, then into little pebbles. A grumpy saucer pops by now
// and then, and B warps you somewhere random when things get tight. Clear the field to
// level up. (Original game in the spirit of vector-style arcade shooters.)
import { H, PAL, W, dist, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bayer, fbm, gradientColor, hash2, outlined, shade } from "../art";

const M = 16; // wrap margin, so rocks slide fully off-screen before reappearing
const SIZES = [0, 5, 10, 18]; // radius by size 1..3
const PTS = [0, 100, 50, 20];
const ROCK_COLORS = ["#d9b27c", "#a3763f", "#ada08c", "#8a90ac", "#c98aa0"] as const;

const wrap = (v: number, max: number) => (v < -M ? v + max + 2 * M : v > max + M ? v - max - 2 * M : v);

// ── baked art (built once, lazily, when a round actually starts — never at module load) ──

function bakeRock(radius: number, color: string, variant: number): Sprite {
  const pad = 4;
  const d = radius * 2 + pad * 2;
  const c = d / 2;
  const seed = variant * 101 + Math.round(radius * 4) + 7;
  // strongly irregular silhouette: a couple of big lumps/dents plus fine jaggedness
  const edge = (ang: number) => {
    const lobes = fbm(Math.cos(ang) * 1.05 + seed, Math.sin(ang) * 1.05 + seed, 2, seed);
    const jag = fbm(Math.cos(ang) * 3.6 + seed * 2, Math.sin(ang) * 3.6 + seed * 2, 2, seed + 5) - 0.5;
    return radius * Math.max(0.42, 0.56 + 0.42 * lobes + 0.22 * jag);
  };
  // a scatter of deterministic craters, bigger rocks get more of them, several sizes each
  const craterN = radius > 14 ? 8 : radius > 8 ? 5 : 3;
  const craters = Array.from({ length: craterN }, (_, i) => {
    const a = hash2(i, seed, 11) * Math.PI * 2;
    const rr = radius * (0.1 + hash2(i, seed, 23) * 0.62);
    const cr = radius * (0.14 + hash2(i, seed, 37) * 0.3);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: cr };
  });
  // 5-tone ramp: deep shadow .. base .. bright rim-lit highlight
  const ramp = [shade(color, -0.6), shade(color, -0.32), color, shade(color, 0.22), shade(color, 0.42)];
  return outlined(
    bake(d, d, (x, y) => {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const rr = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const R = edge(ang);
      if (rr > R) return null;
      // strong top-left lit / bottom-right shadow across the whole body
      const lightAmt = (-dx - dy) / (R * 1.3);
      let ci = lightAmt > 0.3 ? 3 : lightAmt > -0.05 ? 2 : lightAmt > -0.4 ? 1 : 0;
      // surface speckle so flats aren't perfectly flat
      const speck = fbm(dx * 0.5 + seed * 3, dy * 0.5 + seed * 3, 2, seed + 1);
      if (speck > 0.78) ci = Math.min(4, ci + 1);
      else if (speck < 0.2) ci = Math.max(0, ci - 1);
      // deep craters: dark bowl, bright crescent on the far (bottom-right) inner wall
      for (const cr of craters) {
        const cdx = dx - cr.x;
        const cdy = dy - cr.y;
        const cd = Math.hypot(cdx, cdy);
        if (cd < cr.r) {
          const t = cd / cr.r;
          if (t < 0.55) ci = 0;
          else if (cdx + cdy > 0) ci = 4;
          else ci = 0;
          break;
        }
      }
      // outer rim catching the light, right at the silhouette edge
      if (rr / R > 0.86) ci = lightAmt > 0 ? Math.min(4, ci + 1) : Math.max(0, ci - 1);
      return ramp[ci];
    }),
    "#140c28"
  );
}

// canonical ship art, nose pointing +x, rotated into 16 baked frames
const BODY: [number, number][] = [
  [13, 0],
  [-7, -7],
  [-3, 0],
  [-7, 7],
];
const FIN_L: [number, number][] = [
  [-4, -6],
  [-10, -9.5],
  [-6, -4],
];
const FIN_R: [number, number][] = [
  [-4, 6],
  [-10, 9.5],
  [-6, 4],
];
function inPoly(px: number, py: number, pts: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const SHIP_WHITE = "#eef1fb";
const SHIP_LIT = shade(SHIP_WHITE, 0.14);
const SHIP_SHADOW = shade(SHIP_WHITE, -0.24);
const SHIP_NOSE = shade(SHIP_WHITE, 0.2);
function shipPixel(lx: number, ly: number): string | null {
  if (inPoly(lx, ly, FIN_L) || inPoly(lx, ly, FIN_R)) return "#c23b3b";
  if (!inPoly(lx, ly, BODY)) return null;
  const cdx = (lx - 4.5) / 2.6;
  const cdy = ly / 1.7;
  if (cdx * cdx + cdy * cdy < 1) return cdy < -0.25 ? "#bdf4ff" : "#2ab8e6";
  if (Math.abs(ly) < 0.9 && lx > -2 && lx < 11) return "#3c6cf0";
  if (lx > 8) return SHIP_NOSE;
  if (ly < -2) return SHIP_LIT;
  if (ly > 2) return SHIP_SHADOW;
  return SHIP_WHITE;
}
function bakeShipFrame(angle: number): Sprite {
  const d = 28;
  const c = d / 2;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return outlined(
    bake(d, d, (x, y) => {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const lx = dx * cosA + dy * sinA;
      const ly = -dx * sinA + dy * cosA;
      return shipPixel(lx, ly);
    }),
    "#140c28"
  );
}
const SHIP_FRAMES_N = 16;

function ufoPixel(lx: number, ly: number): string | null {
  if (Math.abs(lx) < 0.6 && ly > -8.5 && ly < -3) return "#caa7ff";
  if (lx * lx + (ly + 8.6) * (ly + 8.6) < 1.3) return "#ffe14d";
  const ddx = lx / 5.2;
  const ddy = (ly + 3) / 3.6;
  if (ddx * ddx + ddy * ddy < 1 && ly < 1.2) {
    if (Math.abs(lx) > 1.1 && Math.abs(lx) < 2.8 && ly > -4.3 && ly < -2.2) return "#140c28";
    return ddy < -0.3 ? "#d9ffb0" : "#7be24a";
  }
  const rdx = lx / 10.5;
  const rdy = (ly - 1) / 3.1;
  if (rdx * rdx + rdy * rdy < 1) {
    if (ly < -0.2) return "#b28cf0";
    if (ly > 2.4) return "#4a2f73";
    return "#8a5cd9";
  }
  return null;
}
function bakeUfoSprite(): Sprite {
  const w = 26;
  const h = 18;
  const cx = 13;
  const cy = 9.6;
  return outlined(
    bake(w, h, (x, y) => ufoPixel(x + 0.5 - cx, y + 0.5 - cy)),
    "#140c28"
  );
}

function galaxyPixel(lx: number, ly: number): string | null {
  const d = Math.hypot(lx, ly);
  if (d > 9) return null;
  const ang = Math.atan2(ly, lx);
  const arm = Math.sin(ang * 2 - d * 0.8);
  if (d < 1.6) return "#fff6e0";
  if (d < 2.6) return "#cfe8ff";
  if (arm > 0.3) return d < 6 ? "#8fd0ff" : "#6a7fe0";
  if (arm > -0.1 && d < 8) return "#4a5bb0";
  if ((9 - d) / 9 > bayer(Math.round(lx + 9), Math.round(ly + 9)) * 0.9) return "#241a44";
  return null;
}
const bakeGalaxySprite = (): Sprite => {
  const d = 20;
  const c = d / 2;
  return bake(d, d, (x, y) => galaxyPixel(x + 0.5 - c, y + 0.5 - c));
};

const BG_DARK = "#0a0716";
// deep indigo -> violet -> magenta: gradientColor always dithers (via the bayer matrix) between
// whichever two of these a pixel falls between, so there is never a hard edge anywhere
const NEB_STOPS = [BG_DARK, BG_DARK, "#201840", "#3a2868", "#5a3478", "#7a3f74"];
function bakeSpaceBg(): Sprite {
  // one broad diagonal axis the streamers stretch along, elongated low-frequency on that axis
  // and compressed cross-wise, so clouds read as long wisps rather than round blobs
  const ang = 0.58;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  return bake(W, H, (x, y) => {
    const u = x * ca + y * sa;
    const v = -x * sa + y * ca;
    const streamer = fbm(u * 0.009, v * 0.032, 3, 5);
    const ang2 = -0.35;
    const ca2 = Math.cos(ang2);
    const sa2 = Math.sin(ang2);
    const u2 = x * ca2 + y * sa2;
    const v2 = -x * sa2 + y * ca2;
    const streamer2 = fbm(u2 * 0.011 + 90, v2 * 0.03 + 40, 3, 31);
    const mottle = fbm(x * 0.05 + 20, y * 0.05 + 70, 2, 17);
    // soft, continuous density (no binary cutoff) — most of the screen stays near 0 (pure dark)
    const density = Math.max(0, streamer - 0.46) * 1.9 + Math.max(0, streamer2 - 0.5) * 1.6;
    const t = Math.min(1, density * (0.6 + 0.6 * mottle));
    let base = gradientColor(NEB_STOPS, t, x, y);
    const h = hash2(x, y, 99);
    // a few pale pink-white stars clustering inside the denser parts of the nebula
    if (t > 0.3 && hash2(x, y, 77) > 0.986) return "#ffd9ec";
    if (h > 0.996) return "#ffffff";
    if (h > 0.988) return hash2(x, y, 51) > 0.45 ? "#c7d0ff" : "#ffe9c0";
    if (h > 0.978) return "#8a90c0";
    return base;
  });
}

interface SpaceArt {
  bg: Sprite;
  galaxy: Sprite;
  ship: Sprite[];
  ufo: Sprite;
  rocks: Map<string, Sprite>;
}
let A: SpaceArt | null = null;
function makeArt(): SpaceArt {
  const rocks = new Map<string, Sprite>();
  for (let size = 1; size <= 3; size++)
    for (const color of ROCK_COLORS) for (let variant = 0; variant < 2; variant++) rocks.set(`${size}_${color}_${variant}`, bakeRock(SIZES[size], color, variant));
  return {
    bg: bakeSpaceBg(),
    galaxy: bakeGalaxySprite(),
    ship: Array.from({ length: SHIP_FRAMES_N }, (_, i) => bakeShipFrame((i / SHIP_FRAMES_N) * Math.PI * 2)),
    ufo: bakeUfoSprite(),
    rocks,
  };
}
const art = () => (A ??= makeArt());
function rockSprite(size: number, color: string, variant: number): Sprite {
  const a = art();
  const key = `${size}_${color}_${variant}`;
  return a.rocks.get(key) ?? bakeRock(SIZES[size], color, variant);
}

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  a: number;
  spin: number;
  color: string;
  variant: number;
  alive: boolean;
}
interface Shot {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  chunk?: boolean;
}
interface Flash {
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  scale: number;
}

function create(seed: number): GameInstance {
  art(); // warm the sprite cache once, at round start, never mid-draw
  const r = rng(seed);
  const ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, lives: 3, inv: 120, dead: -1, cool: 0, warp: 0, thrust: false };
  const pt = (fx: number, fy: number): [number, number] => {
    const c = Math.cos(ship.a);
    const s = Math.sin(ship.a);
    return [ship.x + c * fx - s * fy, ship.y + s * fx + c * fy];
  };
  const rocks: Rock[] = [];
  const shots: Shot[] = [];
  const ufoShots: Shot[] = [];
  const parts: Part[] = [];
  const flashes: Flash[] = [];
  const stars = Array.from({ length: 70 }, () => ({ x: r.range(0, W), y: r.range(0, H), b: r.chance(0.25), ph: r.int(0, 46), tint: r.pick(["#eef2ff", "#bfe0ff", "#ffe9c0"] as const) }));
  const glintStars = Array.from({ length: 7 }, () => ({ x: r.range(14, W - 14), y: r.range(16, H - 14), ph: r.int(0, 90), tint: r.pick(["#ffffff", "#bfe0ff", "#ffe9c0"] as const) }));
  let level = 0;
  let levelT = 0;
  let frame = 0;
  let shake = 0;
  let combo = 0;
  let ufo: { x: number; y: number; vx: number; t: number; hp: number } | null = null;
  let ufoT = 1200;
  let beat = 0;
  let nextLife = 10000;
  let scoreSum = 0;
  let over = false;

  const addScore = (io: IO, p: number) => {
    io.score(p);
    scoreSum += p;
    if (scoreSum >= nextLife) {
      nextLife += 10000;
      ship.lives = Math.min(6, ship.lives + 1);
      io.sfx.play("powerup");
    }
  };

  const makeRock = (x: number, y: number, size: number, speed: number): Rock => {
    const a = r.range(0, Math.PI * 2);
    const sp = speed * r.range(0.6, 1.2) * (size === 1 ? 1.6 : size === 2 ? 1.25 : 1);
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size, a: r.range(0, 6), spin: r.range(-0.03, 0.03), color: r.pick(ROCK_COLORS), variant: r.int(0, 1), alive: true };
  };

  const startLevel = () => {
    level++;
    const n = Math.min(8, 2 + level);
    const speed = Math.min(1.1, 0.4 + level * 0.08);
    for (let i = 0; i < n; i++) {
      // spawn along the edges, well away from the ship
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 10; tries++) {
        x = r.chance(0.5) ? r.range(0, W) : r.chance(0.5) ? 0 : W;
        y = x === 0 || x === W ? r.range(0, H) : r.chance(0.5) ? 0 : H;
        if (dist(x, y, ship.x, ship.y) > 80) break;
      }
      rocks.push(makeRock(x, y, 3, speed));
    }
    levelT = 100;
  };

  const burst = (x: number, y: number, n: number, color: string, sp = 1.6) => {
    for (let i = 0; i < n && parts.length < 140; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.2, sp);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(14, 34), color });
    }
  };

  const breakRock = (k: Rock, io: IO, fromShot: boolean) => {
    k.alive = false;
    burst(k.x, k.y, 6 + k.size * 4, k.color);
    addScore(io, PTS[k.size]);
    if (k.size >= 2) {
      // a few chunky tumbling rock-debris specks, purely cosmetic
      const chunks = k.size === 3 ? 6 : 3;
      for (let i = 0; i < chunks && parts.length < 140; i++) {
        const a = r.range(0, Math.PI * 2);
        const s = r.range(0.6, 2.1);
        parts.push({ x: k.x, y: k.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(22, 40), color: shade(k.color, r.chance(0.5) ? -0.35 : 0.2), chunk: true });
      }
    }
    if (k.size === 3) {
      shake = 10;
      flashes.push({ x: k.x, y: k.y, life: 16, max: 16, color: "#ffe6b0", scale: 1 });
      io.sfx.play("explode");
      io.sfx.noise?.(0.25, 0.3, 320, 60);
    } else if (k.size === 2) {
      shake = Math.max(shake, 5);
      flashes.push({ x: k.x, y: k.y, life: 12, max: 12, color: "#ffe6b0", scale: 0.6 });
      io.sfx.play("hit");
    } else {
      io.sfx.play("pop");
    }
    if (fromShot) {
      combo = Math.min(8, combo + 1);
      io.sfx.tone(380 + combo * 60, 0.05, "square", 0.16);
    } else {
      combo = 0;
    }
    if (k.size > 1) {
      const speed = Math.min(1.1, 0.4 + level * 0.08);
      for (let i = 0; i < 2; i++) {
        const c = makeRock(k.x, k.y, k.size - 1, speed);
        c.color = k.color;
        rocks.push(c);
      }
    }
  };

  const hurtShip = (io: IO) => {
    if (ship.dead >= 0 || ship.inv > 0) return;
    ship.dead = 0;
    combo = 0;
    shake = 10;
    burst(ship.x, ship.y, 30, PAL.cyan, 2.4);
    burst(ship.x, ship.y, 16, PAL.white, 1.2);
    flashes.push({ x: ship.x, y: ship.y, life: 12, max: 12, color: "#bdf4ff", scale: 0.55 });
    io.sfx.play("die");
    io.sfx.noise?.(0.3, 0.3, 260, 50);
  };

  const safeSpot = () => {
    for (const k of rocks) if (k.alive && dist(k.x, k.y, W / 2, H / 2) < SIZES[k.size] + 30) return false;
    return true;
  };

  startLevel();

  return {
    update(io) {
      if (over) return;
      frame++;
      const inp = io.input;
      shake = Math.max(0, shake - 1);

      // ── ship ──
      if (ship.dead >= 0) {
        ship.dead++;
        if (ship.dead > 90 && (safeSpot() || ship.dead > 300)) {
          ship.lives--;
          if (ship.lives <= 0) {
            over = true;
            io.sfx.slide?.(240, 60, 0.6, "sawtooth", 0.28);
            io.gameOver();
            return;
          }
          Object.assign(ship, { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, dead: -1, inv: 150 });
        }
      } else {
        ship.inv = Math.max(0, ship.inv - 1);
        ship.cool = Math.max(0, ship.cool - 1);
        ship.warp = Math.max(0, ship.warp - 1);
        if (inp.held.left) ship.a -= 0.075;
        if (inp.held.right) ship.a += 0.075;
        ship.thrust = inp.held.up;
        if (ship.thrust) {
          ship.vx += Math.cos(ship.a) * 0.08;
          ship.vy += Math.sin(ship.a) * 0.08;
          if (frame % 3 === 0 && parts.length < 140) {
            const [ex, ey] = pt(-8, 0);
            parts.push({ x: ex, y: ey, vx: -Math.cos(ship.a + r.range(-0.4, 0.4)) * 1.2, vy: -Math.sin(ship.a + r.range(-0.4, 0.4)) * 1.2, life: 12, color: r.pick([PAL.orange, PAL.yellow]) });
          }
          if (frame % 10 === 0) {
            if (io.sfx.noise) io.sfx.noise(0.12, 0.1, 190, 140);
            else io.sfx.play("step");
          }
        }
        const sp = Math.hypot(ship.vx, ship.vy);
        if (sp > 3.2) {
          ship.vx *= 3.2 / sp;
          ship.vy *= 3.2 / sp;
        }
        ship.vx *= 0.992;
        ship.vy *= 0.992;
        ship.x += ship.vx;
        ship.y += ship.vy;
        if (ship.x < 0) ship.x += W;
        if (ship.x > W) ship.x -= W;
        if (ship.y < 0) ship.y += H;
        if (ship.y > H) ship.y -= H;
        if (inp.pressed.a && ship.cool === 0 && shots.length < 6) {
          const sx = ship.x + Math.cos(ship.a) * 7;
          const sy = ship.y + Math.sin(ship.a) * 7;
          shots.push({ x: sx, y: sy, px: sx, py: sy, vx: Math.cos(ship.a) * 4 + ship.vx, vy: Math.sin(ship.a) * 4 + ship.vy, life: 52 });
          ship.cool = 5;
          io.sfx.play("shoot");
          io.sfx.slide?.(900, 500, 0.06, "square", 0.14);
        }
        if (inp.pressed.b && ship.warp === 0) {
          burst(ship.x, ship.y, 12, PAL.purple);
          ship.x = r.range(20, W - 20);
          ship.y = r.range(20, H - 20);
          ship.vx = ship.vy = 0;
          ship.inv = Math.max(ship.inv, 40); // a moment to get your bearings
          ship.warp = 90;
          burst(ship.x, ship.y, 12, PAL.pink);
          io.sfx.play("whoosh");
          io.sfx.slide?.(200, 1100, 0.18, "sine", 0.2);
        }
      }

      // ── rocks ──
      let count = 0;
      for (const k of rocks) {
        if (!k.alive) continue;
        count++;
        k.x = wrap(k.x + k.vx, W);
        k.y = wrap(k.y + k.vy, H);
        k.a += k.spin;
        if (ship.dead < 0 && dist(k.x, k.y, ship.x, ship.y) < SIZES[k.size] * 0.85 + 4) {
          if (ship.inv === 0) {
            hurtShip(io);
            breakRock(k, io, false);
          }
        }
      }
      // heartbeat that speeds up as the field thins
      if (count > 0 && frame % Math.max(18, 20 + count * 2) === 0) {
        beat ^= 1;
        io.sfx.tone(beat ? 70 : 62, 0.08, "triangle", 0.2);
      }

      // ── shots ──
      for (const s of shots) {
        const ox = s.x;
        const oy = s.y;
        s.x += s.vx;
        s.y += s.vy;
        let wrapped = false;
        if (s.x < 0) {
          s.x += W;
          wrapped = true;
        }
        if (s.x > W) {
          s.x -= W;
          wrapped = true;
        }
        if (s.y < 0) {
          s.y += H;
          wrapped = true;
        }
        if (s.y > H) {
          s.y -= H;
          wrapped = true;
        }
        s.px = wrapped ? s.x : ox;
        s.py = wrapped ? s.y : oy;
        s.life--;
        for (const k of rocks) {
          if (k.alive && s.life > 0 && dist(s.x, s.y, k.x, k.y) < SIZES[k.size] + 1) {
            s.life = 0;
            breakRock(k, io, true);
            break;
          }
        }
        if (ufo && s.life > 0 && Math.abs(s.x - ufo.x) < 9 && Math.abs(s.y - ufo.y) < 5) {
          s.life = 0;
          addScore(io, 500);
          burst(ufo.x, ufo.y, 24, PAL.lime, 2);
          shake = 8;
          flashes.push({ x: ufo.x, y: ufo.y, life: 14, max: 14, color: "#bdf7a0", scale: 0.8 });
          io.sfx.play("explode");
          io.sfx.slide?.(500, 1200, 0.2, "square", 0.2);
          ufo = null;
        }
      }

      // ── saucer ──
      ufoT--;
      if (!ufo && ufoT <= 0 && level > 1) {
        ufoT = r.int(1200, 1800);
        const fromLeft = r.chance(0.5);
        ufo = { x: fromLeft ? -10 : W + 10, y: r.range(30, H - 30), vx: fromLeft ? 0.8 : -0.8, t: 0, hp: 1 };
        io.sfx.noise?.(0.3, 0.12, 700, 300);
      }
      if (ufo) {
        ufo.t++;
        ufo.x += ufo.vx;
        ufo.y += Math.sin(ufo.t * 0.03) * 0.7;
        if (ufo.t % 20 === 0) io.sfx.tone(ufo.t % 40 ? 520 : 440, 0.05, "square", 0.08);
        if (ufo.t % 100 === 50 && ship.dead < 0) {
          const a = Math.atan2(ship.y - ufo.y, ship.x - ufo.x) + r.range(-0.4, 0.4);
          const vx = Math.cos(a) * 1.6;
          const vy = Math.sin(a) * 1.6;
          ufoShots.push({ x: ufo.x, y: ufo.y, px: ufo.x, py: ufo.y, vx, vy, life: 120 });
          io.sfx.play("laser");
        }
        if (ship.dead < 0 && ship.inv === 0 && Math.abs(ship.x - ufo.x) < 11 && Math.abs(ship.y - ufo.y) < 7) {
          hurtShip(io);
          ufo = null;
        } else if (ufo.x < -20 || ufo.x > W + 20) ufo = null;
      }
      for (const s of ufoShots) {
        s.px = s.x;
        s.py = s.y;
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (ship.dead < 0 && dist(s.x, s.y, ship.x, ship.y) < 5) {
          s.life = 0;
          hurtShip(io);
        }
      }

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
      }
      for (let i = rocks.length - 1; i >= 0; i--) if (!rocks[i].alive) rocks.splice(i, 1);
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].life <= 0) shots.splice(i, 1);
      for (let i = ufoShots.length - 1; i >= 0; i--) if (ufoShots[i].life <= 0) ufoShots.splice(i, 1);
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life--;
        if (flashes[i].life <= 0) flashes.splice(i, 1);
      }

      // ── level clear ──
      if (levelT > 0) levelT--;
      if (rocks.length === 0 && levelT === 0) {
        addScore(io, 250 * level);
        io.sfx.play("win");
        io.sfx.slide?.(420, 900, 0.35, "square", 0.22);
        levelT = -90; // short break, then the next field
      } else if (levelT < 0 && ++levelT === 0) startLevel();
    },

    draw(g: Gfx) {
      const Aa = art();
      let ox = 0;
      let oy = 0;
      if (shake > 0) {
        const k = shake / 10;
        ox = (hash2(frame, 11, 3) - 0.5) * 5 * k;
        oy = (hash2(frame, 29, 7) - 0.5) * 5 * k;
      }
      g.camera(ox, oy);
      g.clear(PAL.black);
      g.sprite(Aa.bg, 0, 0);
      g.sprite(Aa.galaxy, 34, 18);

      for (const s of stars) {
        if (s.b) {
          const tw = (frame + s.ph) % 46 < 5;
          g.rect(s.x, s.y, 1, 1, tw ? PAL.white : s.tint);
        } else {
          g.rect(s.x, s.y, 1, 1, "#6a6f92");
        }
      }
      for (const gs of glintStars) {
        const t = (frame + gs.ph) % 90;
        const b = t < 45 ? t / 45 : (90 - t) / 45;
        if (b > 0.1) {
          g.alpha(b);
          g.rect(gs.x - 2, gs.y, 5, 1, gs.tint);
          g.rect(gs.x, gs.y - 2, 1, 5, gs.tint);
          g.alpha(b * 0.55);
          g.rect(gs.x - 1, gs.y - 1, 1, 1, gs.tint);
          g.rect(gs.x + 1, gs.y - 1, 1, 1, gs.tint);
          g.rect(gs.x - 1, gs.y + 1, 1, 1, gs.tint);
          g.rect(gs.x + 1, gs.y + 1, 1, 1, gs.tint);
          g.alpha(1);
        }
      }

      for (const k of rocks) {
        const s = rockSprite(k.size, k.color, k.variant);
        const bucket = (((Math.floor(k.a / (Math.PI / 2)) % 4) + 4) % 4);
        g.sprite(s, k.x - s.rows[0].length / 2, k.y - s.rows.length / 2, { flipX: bucket === 1 || bucket === 2, flipY: bucket === 2 || bucket === 3 });
      }

      if (ufo) {
        const s = Aa.ufo;
        g.sprite(s, ufo.x - s.rows[0].length / 2, ufo.y - s.rows.length / 2);
        for (let i = 0; i < 5; i++) {
          const on = (Math.floor(ufo.t / 4) + i) % 5 < 2;
          g.rect(ufo.x - 7 + i * 3.5, ufo.y + 3, 1, 1, on ? PAL.yellow : "#4a2f5a");
        }
      }

      for (const s of shots) {
        g.line(s.px, s.py, s.x, s.y, "#1fb3a3");
        g.alpha(0.4);
        g.circle(s.x, s.y, 2.6, PAL.cyan);
        g.alpha(1);
        g.rect(s.x - 1, s.y - 1, 2, 2, "#ddfbff");
      }
      for (const s of ufoShots) {
        g.line(s.px, s.py, s.x, s.y, frame % 6 < 3 ? PAL.lime : "#5a2a4a");
        g.rect(s.x - 1, s.y - 1, 2, 2, frame % 6 < 3 ? PAL.lime : PAL.white);
      }

      if (ship.dead < 0 && !(ship.inv > 0 && Math.floor(ship.inv / 4) % 2)) {
        if (ship.thrust) {
          const flick = frame % 3;
          const [bx, by] = pt(-5, 0);
          const [tipX, tipY] = pt(-12 - flick * 1.5, 0);
          const [sideAx, sideAy] = pt(-9 - flick, 2.2);
          const [sideBx, sideBy] = pt(-9 - flick, -2.2);
          g.alpha(0.4);
          g.circle(bx, by, 4, PAL.orange);
          g.alpha(1);
          g.line(bx, by, sideAx, sideAy, PAL.orange);
          g.line(bx, by, sideBx, sideBy, PAL.orange);
          g.line(bx, by, tipX, tipY, PAL.yellow);
          g.rect(bx - 1, by - 1, 2, 2, "#fff6d8");
        }
        const frames = Aa.ship;
        const norm = (((ship.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
        const idx = Math.round((norm / (Math.PI * 2)) * frames.length) % frames.length;
        const s = frames[idx];
        g.sprite(s, ship.x - s.rows[0].length / 2, ship.y - s.rows.length / 2);
      }

      for (const f of flashes) {
        const t = f.life / f.max;
        const grow = (1 - t) * f.scale;
        g.alpha(Math.min(1, t * 1.4));
        g.circle(f.x, f.y, grow * 3 + 2 * f.scale, "#ffffff");
        g.alpha(t * 0.85);
        g.circle(f.x, f.y, grow * 9 + 4 * f.scale, f.color);
        g.alpha(1);
        const rayN = 7;
        for (let i = 0; i < rayN; i++) {
          const ang = (i / rayN) * Math.PI * 2 + hash2(Math.round(f.x) + i, Math.round(f.y), 5) * 0.6;
          const len = (5 + grow * 20) * (0.55 + 0.45 * hash2(i, Math.round(f.x + f.y), 9));
          g.alpha(t * 0.8);
          g.line(f.x, f.y, f.x + Math.cos(ang) * len, f.y + Math.sin(ang) * len, i % 2 === 0 ? "#ffe14d" : "#ff9a3c");
        }
        g.alpha(1);
      }

      for (const p of parts) {
        if (p.chunk) g.rect(p.x - 1, p.y - 1, 2, 2, p.color);
        else if (Math.abs(p.vx) + Math.abs(p.vy) > 1.4 && p.life > 6) g.line(p.x, p.y, p.x - p.vx * 1.6, p.y - p.vy * 1.6, p.color);
        else g.rect(p.x, p.y, 1, 1, p.color);
      }

      g.camera(0, 0);

      // HUD
      g.alpha(0.55);
      g.rect(0, 0, W, 11, PAL.black);
      g.alpha(1);
      for (let i = 0; i < ship.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`LEVEL ${level}`, W - 4, 2, PAL.grey, { align: "right" });
      if (ship.warp === 0 && ship.dead < 0) g.text("B:WARP", W / 2, 2, PAL.purple, { align: "center" });
      if (levelT > 0) {
        g.alpha(0.5);
        g.rect(W / 2 - 70, H / 2 - 34, 140, 20, PAL.black);
        g.alpha(1);
        g.text(`LEVEL ${level}`, W / 2, H / 2 - 24, PAL.yellow, { align: "center", size: 2 });
      }
      if (levelT < 0) {
        g.alpha(0.5);
        g.rect(W / 2 - 90, H / 2 - 18, 180, 20, PAL.black);
        g.alpha(1);
        g.text("FIELD CLEAR!", W / 2, H / 2 - 8, PAL.lime, { align: "center", size: 2 });
      }
    },
  };
}

export const spaceRocks: RetroGameDef = {
  id: "space-rocks",
  title: "Space Rocks",
  blurb: "Spin, thrust and zap tumbling space rocks to pebbles!",
  genre: "Shooter",
  emoji: "☄️",
  color: "#9aa0b8",
  controls: "◀ ▶ turn · ▲ thrust · A shoot · B warp",
  pad: { dpad: "4", a: "Shoot", b: "Warp" },
  create,
};
