// BALLOON FLAP — a one-button flyer. Puff your little balloon upward with A (or a tap on the
// screen) while gravity tugs it down, and float through the gaps between candy-cane pillars.
// Grab coins on the way. Later the pillars start sliding up and down and silly birds flap
// across. One bump pops the balloon, so it's all about "one more go!". (Original game in the
// spirit of one-touch flyers.)
import { H, PAL, W, dist, rng, type GameInstance, type Gfx, type RetroGameDef } from "../engine";
import { bake, bakeRidge, drawStrip, gradientColor, hash2, mixHex, shade } from "../art";

const GRAV = 0.14;
const FLAP = -2.9;
const BX = 64; // balloon x (screen stays put, the world scrolls)
const BALLOON_R = 9; // the drawn balloon's body radius
const BR = 8; // balloon hit radius — kid-friendly, a touch inside the drawn body
const PIL_W = 24;
const SPACING = 124;
const GROUND = H - 16;

// Big glossy baked balloon: a round pink body with a cute face, a shine highlight, a knot and
// a 1px dark outline. The body's own centre (bcx, bcy) is exported so draw() can line it up
// exactly with the physics point (BX, b.y).
const bcx = BALLOON_R + 3;
const bcy = BALLOON_R + 3;
function buildBalloon() {
  const w = BALLOON_R * 2 + 6;
  const h = BALLOON_R + 3 + BALLOON_R + 5;
  const r = BALLOON_R;
  return bake(w, h, (x, y) => {
    const dx = x - bcx;
    const dy = y - bcy;
    const d = Math.hypot(dx, dy);
    if (d <= r) {
      if (d > r - 1.1) return "#140c28";
      // eyes
      if (Math.hypot(x - (bcx - 3), y - (bcy - 1)) < 1.3 || Math.hypot(x - (bcx + 3), y - (bcy - 1)) < 1.3) return "#140c28";
      // smile
      if (y === Math.round(bcy + 2) && x >= bcx - 2 && x <= bcx + 2) return "#140c28";
      if (y === Math.round(bcy + 1) && (x === bcx - 3 || x === bcx + 3)) return "#140c28";
      // glossy shine, upper-left
      const shineD = Math.hypot(x - (bcx - 4), y - (bcy - 4));
      if (shineD < 2.3) return "#fff8ff";
      if (shineD < 4.2) return mixHex(PAL.pink, "#ffffff", 0.45);
      // soft body shading, darker toward the lower-right
      const sh = (dx * 0.4 + dy * 0.6) / r;
      return shade(PAL.pink, -Math.max(0, sh) * 0.3);
    }
    // the knot, right below the body
    if (x >= bcx - 2 && x <= bcx + 2 && y > bcy + r - 2 && y < h - 1) {
      const kw = Math.max(0, 2 - (y - (bcy + r - 2)) * 0.7);
      if (Math.abs(x - bcx) <= kw) return x === bcx ? PAL.brown : shade(PAL.brown, -0.2);
    }
    return null;
  });
}

// Chunky bird: a round body (blue back, white belly), an orange beak and a wing that swings
// through 3 positions for a simple flap cycle.
function buildBird(phase: -1 | 0 | 1) {
  const w = 20;
  const h = 18;
  const cx = 12;
  const cy = 9;
  const rx = 7;
  const ry = 5.4;
  const wingCx = cx + 1;
  const wingCy = cy - 1 - phase * 5;
  const wingRx = 6.5;
  const wingRy = 3;
  const wingAng = phase * 0.5;
  return bake(w, h, (x, y) => {
    const bdx = (x - cx) / rx;
    const bdy = (y - cy) / ry;
    const bd = bdx * bdx + bdy * bdy;
    if (bd <= 1) {
      if (bd > 0.86) return "#140c28";
      // a bright cartoon eye with a tiny sparkle
      const eyeD = Math.hypot(x - (cx - rx * 0.5), y - (cy - ry * 0.35));
      if (eyeD < 1.5) return "#140c28";
      if (eyeD < 2.1) return "#fff8f8";
      // clean 2-tone body: a sky-blue back, a white belly, a light gloss along the top
      if (y > cy + ry * 0.05) return y > cy + ry * 0.3 ? "#fff8f8" : mixHex(PAL.sky, "#ffffff", 0.55);
      return y < cy - ry * 0.45 ? shade(PAL.sky, 0.22) : PAL.sky;
    }
    const wdx0 = x - wingCx;
    const wdy0 = y - wingCy;
    const wdx = wdx0 * Math.cos(wingAng) - wdy0 * Math.sin(wingAng);
    const wdy = wdx0 * Math.sin(wingAng) + wdy0 * Math.cos(wingAng);
    const wd = (wdx * wdx) / (wingRx * wingRx) + (wdy * wdy) / (wingRy * wingRy);
    if (wd <= 1 && x > cx - 7) return wd > 0.75 ? "#140c28" : shade(PAL.sky, -0.2);
    // beak, pointing toward travel (left)
    const bx0 = cx - rx - 4;
    if (x >= bx0 && x < cx - rx + 1) {
      const bw = (x - bx0) * 0.95;
      if (Math.abs(y - cy) <= bw) return PAL.orange;
    }
    return null;
  });
}

// Big shiny spin coins: 4 frames squashing from a full ellipse to a thin sliver and back, like
// a coin tumbling edge-over-edge.
function buildCoin(rx: number) {
  const ry = 6;
  const w = Math.max(3, Math.round(rx * 2) + 2);
  const h = ry * 2 + 2;
  const cx = w / 2;
  const cy = h / 2;
  return bake(w, h, (x, y) => {
    const ex = (x - cx + 0.5) / rx;
    const ey = (y - cy + 0.5) / ry;
    const d = ex * ex + ey * ey;
    if (d > 1) return null;
    if (d > 0.82) return "#8a5a12";
    if (ex < -0.1 && ey < -0.25 && d < 0.4) return "#fff6c8";
    if (d > 0.55) return PAL.yellow;
    return shade(PAL.yellow, -0.12);
  });
}

// ── big baked pictures: candy-dusk sky, three depth layers of hills, a candy-cane texture,
// cut-end caps and a frosting ground. Built once, lazily, by art() — never at module load. ──
const SKY_STOPS = ["#140c33", "#2d1f5e", "#5a3178", "#a1507f", "#e8835f"];
const FAR_BASE = "#6b4e8f";
const NEAR_BASE = "#4a3570";
const HILL_PINK = "#ffb3d9";
const HILL_LILAC = "#caa3f2";
const SPRINKLE = [PAL.yellow, PAL.cyan, PAL.lime, PAL.red, PAL.white];
const LOLLI_COLORS: [string, string][] = [
  [PAL.pink, "#c43f8f"],
  [PAL.purple, "#6a2fc9"],
];

function buildLollipop(top: string) {
  const w = 18;
  const h = 30;
  const cx = 9;
  const cy = 10;
  const r = 9;
  return bake(w, h, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d <= r) {
      if (d > r - 1.1) return "#140c28";
      const ang = Math.atan2(dy, dx);
      const swirl = (ang / (Math.PI * 2)) * 5 + d * 0.55;
      const band = Math.floor(swirl) % 2 === 0;
      return band ? top : "#fff6ec";
    }
    // stick
    if (x >= cx - 1 && x <= cx + 1 && y > cy + r - 3 && y < h - 1) return x === cx ? "#f2c48d" : "#b9834f";
    return null;
  });
}

// a mound's centre wraps around the 256-wide tile, so one sitting near the seam still reads
// as a single whole shape instead of being cut in half
const wrapDx = (x: number, cx: number) => {
  let d = (x - cx) % 256;
  if (d > 128) d -= 256;
  if (d < -128) d += 256;
  return d;
};
interface Mound {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  base: string;
  frost: string;
  amp: number;
  gum?: string;
  sprinkle?: boolean;
}
// two overlapping rows of ROUND candy mounds (cupcake / ice-cream shapes): a smaller, muted
// back row, then a bigger, brighter front row with a thick dripping frosting cap, sprinkles
// and a gumdrop on top — pink, lilac, chocolate and mint, like the painting's candy ground
const MOUNDS: Mound[] = [
  { cx: 20, cy: 40, rx: 20, ry: 16, base: "#8a6bb0", frost: "#c9aee8", amp: 2 },
  { cx: 72, cy: 38, rx: 22, ry: 17, base: "#a8678f", frost: "#e7a8c8", amp: 2.4 },
  { cx: 124, cy: 39, rx: 20, ry: 16, base: "#79598f", frost: "#b79ae2", amp: 2 },
  { cx: 176, cy: 38, rx: 21, ry: 17, base: "#8a7257", frost: "#c7a881", amp: 2.2 },
  { cx: 228, cy: 39, rx: 20, ry: 16, base: "#5f8a82", frost: "#a6d9cd", amp: 2 },
  { cx: 0, cy: 58, rx: 27, ry: 25, base: HILL_LILAC, frost: "#fff2fb", amp: 4, gum: PAL.purple, sprinkle: true },
  { cx: 43, cy: 60, rx: 25, ry: 24, base: HILL_PINK, frost: "#fff4fa", amp: 3.6, gum: PAL.cyan, sprinkle: true },
  { cx: 85, cy: 57, rx: 27, ry: 25, base: "#caa3f2", frost: "#fff1fb", amp: 4, gum: PAL.yellow, sprinkle: true },
  { cx: 128, cy: 60, rx: 26, ry: 24, base: "#bdeee0", frost: "#f2fffb", amp: 3.4, gum: PAL.pink, sprinkle: true },
  { cx: 171, cy: 57, rx: 27, ry: 25, base: "#ffb3d9", frost: "#fff4fa", amp: 4, gum: PAL.lime, sprinkle: true },
  { cx: 213, cy: 60, rx: 26, ry: 24, base: "#d2a679", frost: "#ffe9cf", amp: 3.6, gum: PAL.red, sprinkle: true },
];
function buildCandyMounds(h: number) {
  return bake(256, h, (x, y) => {
    let out: string | null = null;
    for (const m of MOUNDS) {
      const dx = wrapDx(x, m.cx);
      if (Math.abs(dx) > m.rx) continue;
      const topLocal = m.cy - m.ry * Math.sqrt(Math.max(0, 1 - (dx / m.rx) * (dx / m.rx)));
      if (y < topLocal) continue;
      const depth = y - topLocal;
      const frostH = 5 + Math.sin(dx * 0.3 + m.cx) * m.amp;
      let c: string;
      if (depth < 1) c = "#fff8ff"; // a thin glossy frosting rim
      else if (depth < frostH) c = m.frost; // the thick dripping frosting cap
      else c = depth < frostH + 5 ? shade(m.base, 0.1) : shade(m.base, depth > frostH + 18 ? -0.14 : 0);
      if (m.gum && Math.hypot(dx, y - (topLocal - 1)) < 2.6) c = m.gum; // a gumdrop on top
      if (m.sprinkle && depth >= 1 && depth < frostH + 2) {
        const s = hash2(x, y, 77);
        if (s > 0.975) c = SPRINKLE[Math.floor(s * 61) % SPRINKLE.length];
      }
      out = c;
    }
    if (out === null && y > h - 6) out = shade(HILL_LILAC, -0.2); // safety net, never leaks sky
    return out;
  });
}

interface Art {
  sky: ReturnType<typeof bake>;
  farHills: ReturnType<typeof bakeRidge>;
  nearHills: ReturnType<typeof bakeRidge>;
  candyHills: ReturnType<typeof bake>;
  ground: ReturnType<typeof bake>;
  caneTile: ReturnType<typeof bake>;
  caneCap: ReturnType<typeof bake>;
  lollipops: ReturnType<typeof bake>[];
  balloon: ReturnType<typeof bake>;
  bird: ReturnType<typeof bake>[];
  coin: ReturnType<typeof bake>[];
}

function makeArt(): Art {
  const sunCx = 128;
  const sunCy = GROUND - 92;
  const sunR = 10;
  const sky = bake(W, H, (x, y) => {
    const mcx = 198;
    const mcy = 32;
    const mr = 12;
    const dMoon = Math.hypot(x - mcx, y - mcy);
    if (dMoon < mr) {
      const dShadow = Math.hypot(x - (mcx + 5), y - (mcy - 2));
      if (dShadow > mr - 3) return "#fff6c8";
    }
    // a small setting sun glowing low on the horizon, mostly tucked behind the mountains
    const dSun = Math.hypot(x - sunCx, y - sunCy);
    if (dSun < sunR) return mixHex("#fff3b0", "#ff9a52", Math.min(1, dSun / sunR));
    if (y < 150) {
      const s = hash2(x, y, 7);
      if (s > 0.991) return "#ffffff";
      if (s > 0.986) return "#cdd7ff";
    }
    const base = gradientColor(SKY_STOPS, y / (H - 1), x, y);
    // a soft halo right around the sun — no hard edge, no full-width band
    const gx = (x - sunCx) / 40;
    const gy = (y - sunCy) / 15;
    const glow = Math.exp(-(gx * gx + gy * gy) * 2.2);
    return glow > 0.06 ? mixHex(base, "#ffb37a", Math.min(0.3, glow * 0.45)) : base;
  });

  // mountain silhouettes use only frequencies that are exact multiples of 2π/256, and plain
  // cosines (not abs(sin), which makes pointy repeated "teeth") for soft, rounded, varied peaks
  const TAU = Math.PI * 2;
  const freq = (k: number) => (TAU * k) / 256;
  const farHills = bakeRidge(
    256,
    60,
    (x) => 30 + Math.cos(x * freq(2) + 0.4) * 12 + Math.cos(x * freq(3) + 2.1) * 6 + Math.cos(x * freq(5) + 4) * 3,
    FAR_BASE,
    { rim: "#cdb8e6", tex: (_x, _y, depth) => (depth < 2 ? "#cdb8e6" : null) },
  );
  // a second, nearer mountain layer in a deeper purple, for a clear depth step before the hills
  const nearHills = bakeRidge(
    256,
    56,
    (x) => 32 + Math.cos(x * freq(3) + 1.1) * 10 + Math.cos(x * freq(1) + 3.2) * 5,
    NEAR_BASE,
    { rim: "#7a5aa8", tex: (_x, _y, depth) => (depth < 2 ? "#7a5aa8" : null) },
  );

  const candyHills = buildCandyMounds(70);

  const ground = bake(32, H - GROUND, (x, y) => {
    if (y === 0) return "#fff2fb";
    if (y === 1) return mixHex(HILL_PINK, HILL_LILAC, (Math.sin(x * 0.4) + 1) / 2);
    const s = hash2(x, y, 52);
    if (s > 0.9) return SPRINKLE[Math.floor(s * 53) % SPRINKLE.length];
    return y > 6 ? shade(HILL_LILAC, -0.1) : HILL_LILAC;
  });

  const period = 8;
  const caneTile = bake(PIL_W, 16, (x, y) => {
    const diag = (x + y) % period < period / 2;
    let c = diag ? PAL.red : "#fff8f8";
    // a cylinder light curve: dark down the right edge, a bright highlight stripe inset from
    // the left, so the cane reads as round rather than a flat painted board
    const t = x / (PIL_W - 1);
    const curve = Math.cos((t - 0.28) * Math.PI * 0.95);
    c = shade(c, curve * 0.32 - (t > 0.8 ? (t - 0.8) * 0.9 : 0));
    if (x === 0 || x === PIL_W - 1) c = "#140c28";
    return c;
  });

  const caneCap = bake(PIL_W, 8, (x, y) => {
    const ex = (x - PIL_W / 2) / (PIL_W / 2);
    const ey = (y - 3.5) / 3.5;
    const d = Math.hypot(ex, ey);
    if (d > 1) return null;
    if (d > 0.82) return "#140c28";
    if (d > 0.7) return "#fff8f8"; // a bright rim right at the gap end
    const ring = Math.floor(d * 5) % 2 === 0;
    return ring ? PAL.red : "#fff8f8";
  });

  const lollipops = LOLLI_COLORS.map(([top]) => buildLollipop(top));

  return {
    sky,
    farHills,
    nearHills,
    candyHills,
    ground,
    caneTile,
    caneCap,
    lollipops,
    balloon: buildBalloon(),
    bird: [buildBird(-1), buildBird(0), buildBird(1)],
    coin: [buildCoin(6), buildCoin(4), buildCoin(1.6), buildCoin(4)],
  };
}

let A: Art | null = null;
const art = () => (A ??= makeArt());

interface Pillar {
  x: number;
  gapY: number; // centre of the gap
  baseY: number;
  gap: number;
  amp: number;
  phase: number;
  passed: boolean;
}
interface Coin {
  x: number;
  y: number;
  got: boolean;
}
interface Bird {
  x: number;
  y: number;
  baseY: number;
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

function create(seed: number): GameInstance {
  const r = rng(seed);
  const b = { y: H / 2 - 20, vy: 0, t: 0, puff: 0 };
  const pillars: Pillar[] = [];
  const coins: Coin[] = [];
  const birds: Bird[] = [];
  const parts: Part[] = [];
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 50 + r.range(0, 30), y: r.range(14, 90), s: r.range(0.7, 1.3) }));
  let started = false;
  let popped = -1;
  let over = false;
  let passed = 0;
  let scroll = 0;
  let frame = 0;
  let nextX = W + 40;
  let shake = 0;
  let flapStreak = 0;

  const speed = () => Math.min(2, 1.2 + passed * 0.025);

  const addPillar = (x: number) => {
    const gap = Math.max(58, 84 - passed * 1.1);
    const gapY = r.range(30 + gap / 2, GROUND - 16 - gap / 2);
    const moving = passed >= 8 && r.chance(Math.min(0.6, 0.25 + (passed - 8) * 0.03));
    const amp = moving ? Math.min(26, 10 + (passed - 8)) : 0;
    const clampedY = Math.max(30 + gap / 2 + amp, Math.min(GROUND - 16 - gap / 2 - amp, gapY));
    pillars.push({ x, gapY: clampedY, baseY: clampedY, gap, amp, phase: r.range(0, 6), passed: false });
    coins.push({ x: x + PIL_W / 2, y: clampedY, got: false });
    // a bonus coin floating between pillars
    if (r.chance(0.6)) coins.push({ x: x + PIL_W + SPACING / 2 - 6, y: r.range(40, GROUND - 40), got: false });
    if (passed >= 12 && r.chance(Math.min(0.5, 0.15 + (passed - 12) * 0.02))) {
      const y = r.range(40, GROUND - 40);
      birds.push({ x: x + PIL_W + SPACING / 2 + 30, y, baseY: y, t: r.range(0, 6) });
    }
  };

  const burst = (x: number, y: number, n: number, colors: string[], sp = 2) => {
    for (let i = 0; i < n && parts.length < 90; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.3, sp);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, life: r.int(16, 36), color: r.pick(colors) });
    }
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      const inp = io.input;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.life--;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      if (shake > 0) shake--;

      if (popped >= 0) {
        if (++popped > 50) {
          over = true;
          io.gameOver();
        }
        return;
      }

      const flap = inp.pressed.a || inp.tap !== null;
      if (!started) {
        b.t++;
        b.y = H / 2 - 20 + Math.sin(b.t * 0.08) * 4;
        if (!flap) return;
        started = true;
      }
      if (flap) {
        b.vy = FLAP;
        b.puff = 8;
        flapStreak = Math.min(6, flapStreak + 1);
        io.sfx.play("jump");
        io.sfx.slide?.(520 + flapStreak * 18, 760 + flapStreak * 18, 0.07, "triangle", 0.18);
        burst(BX, b.y + 14, 4, [PAL.white, PAL.sky], 0.9);
      } else if (flapStreak > 0 && frame % 10 === 0) {
        flapStreak--;
      }
      b.puff = Math.max(0, b.puff - 1);
      b.vy = Math.min(3.6, b.vy + GRAV);
      b.y += b.vy;
      if (b.y < 8) {
        b.y = 8;
        b.vy = Math.max(0, b.vy);
      }
      // a little trail of puffed air behind the balloon, even between flaps
      if (frame % 5 === 0) burst(BX - 7, b.y + 6, 1, [PAL.sky, "#dff3ff"], 0.4);

      const sp = speed();
      scroll += sp;
      nextX -= sp;
      if (nextX < W + 40) {
        addPillar(nextX + 30);
        nextX += SPACING;
      }

      const pop = () => {
        popped = 0;
        shake = 10;
        burst(BX, b.y, 34, [PAL.pink, PAL.white, PAL.yellow, PAL.purple], 2.6);
        io.sfx.play("die");
        io.sfx.noise?.(0.3, 0.5, 700, 90);
      };

      if (b.y + BR >= GROUND) return pop();

      for (const p of pillars) {
        p.x -= sp;
        if (p.amp) p.gapY = p.baseY + Math.sin(frame * 0.03 + p.phase) * p.amp;
        // circle vs the two pillar rectangles
        const top = p.gapY - p.gap / 2;
        const bot = p.gapY + p.gap / 2;
        const cx = Math.max(p.x - 3, Math.min(BX, p.x + PIL_W + 3));
        if (dist(cx, Math.min(b.y, top), BX, b.y) < BR - 1 || dist(cx, Math.max(b.y, bot), BX, b.y) < BR - 1) return pop();
        if (!p.passed && p.x + PIL_W < BX - BR) {
          p.passed = true;
          passed++;
          io.score(100);
          io.sfx.play("blip");
          if (passed % 5 === 0) {
            io.sfx.play("cheer");
            io.sfx.slide?.(660, 990, 0.18, "square", 0.2);
          }
        }
      }
      for (const c of coins) {
        c.x -= sp;
        if (!c.got && dist(c.x, c.y, BX, b.y) < BR + 4) {
          c.got = true;
          io.score(50);
          io.sfx.play("coin");
          io.sfx.tone(1100, 0.05, "square", 0.15);
          burst(c.x, c.y, 10, [PAL.yellow, PAL.white, PAL.orange]);
        }
      }
      for (const bd of birds) {
        bd.t++;
        bd.x -= sp + 0.7;
        bd.y = bd.baseY + Math.sin(bd.t * 0.06) * 14;
        if (dist(bd.x + 6, bd.y + 3, BX, b.y) < BR + 4) return pop();
      }
      for (let i = pillars.length - 1; i >= 0; i--) if (pillars[i].x < -PIL_W - 10) pillars.splice(i, 1);
      for (let i = coins.length - 1; i >= 0; i--) if (coins[i].got || coins[i].x < -10) coins.splice(i, 1);
      for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x < -16) birds.splice(i, 1);
    },

    draw(g: Gfx) {
      const a = art();
      g.clear(SKY_STOPS[0]);
      g.sprite(a.sky, 0, 0);

      // screen shake on a pop — a few decaying frames, world only (not the HUD)
      const sk = shake > 0 ? Math.ceil(shake / 2) : 0;
      const shx = sk ? (frame % 2 ? sk : -sk) : 0;
      const shy = sk ? -Math.floor(sk / 2) : 0;
      g.camera(shx, shy);

      // dusk clouds drifting slowly
      for (const c of clouds) {
        const x = ((((c.x - scroll * 0.15 * c.s) % (W + 60)) + W + 60) % (W + 60)) - 30;
        const cc = mixHex("#ffffff", "#f3b3d9", 0.45);
        g.circle(x, c.y, 9 * c.s, cc);
        g.circle(x + 10 * c.s, c.y + 3, 7 * c.s, cc);
        g.circle(x - 9 * c.s, c.y + 4, 6 * c.s, cc);
      }

      // three depth layers, slowest (farthest) to fastest (nearest) parallax
      drawStrip(g, a.farHills, scroll * 0.1, GROUND - 100);
      drawStrip(g, a.nearHills, scroll * 0.2, GROUND - 84);
      drawStrip(g, a.candyHills, scroll * 0.35, GROUND - 78);

      // lollipops standing among the mounds
      const lp = 85;
      for (let i = 0; i < 6; i++) {
        const x = ((((i * lp - scroll * 0.35) % (lp * 6)) + lp * 6) % (lp * 6)) - lp;
        g.sprite(a.lollipops[i % 2], x, GROUND - 73 - (i % 2 === 0 ? 0 : 6));
      }

      // candy-cane pillars: diagonal-striped tiles anchored flush against the gap, so a tile
      // never overdraws into the gap kids fly through; a cut-candy cross-section caps each end
      const tileH = 16;
      for (const p of pillars) {
        const top = p.gapY - p.gap / 2;
        const bot = p.gapY + p.gap / 2;
        const segBottom = top - 8;
        for (let y = segBottom - tileH; y + tileH > 0; y -= tileH) g.sprite(a.caneTile, p.x, y);
        const segTop = bot + 8;
        for (let y = segTop; y < GROUND; y += tileH) g.sprite(a.caneTile, p.x, y);
        g.sprite(a.caneCap, p.x, segBottom);
        g.sprite(a.caneCap, p.x, bot);
      }

      for (const c of coins) {
        const f = a.coin[Math.floor((frame + c.x) / 6) % 4];
        g.sprite(f, c.x - f.rows[0].length / 2, c.y - 7);
      }
      for (const bd of birds) {
        const f = a.bird[Math.floor(bd.t / 6) % 3];
        g.sprite(f, bd.x - 6, bd.y - 6);
      }

      // frosted candy-cream ground strip
      drawStrip(g, a.ground, scroll, GROUND);

      // balloon + a curly string down to a little knot
      if (popped < 0) {
        const sway = Math.sin(frame * 0.15) * 2.5;
        const sway2 = Math.sin(frame * 0.15 + 1.6) * 1.6;
        g.line(BX, b.y + 13, BX + sway, b.y + 18, PAL.dark);
        g.line(BX + sway, b.y + 18, BX - sway2, b.y + 22, PAL.dark);
        g.line(BX - sway2, b.y + 22, BX + sway2 * 0.6, b.y + 25, PAL.dark);
        const bs = b.puff > 4 ? 1.16 : 1;
        g.sprite(a.balloon, BX - bcx * bs, b.y - bcy * bs, { scale: bs });
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      if (popped >= 0) g.text("POP!", BX + 14, b.y - 10, PAL.red, { size: 2 });

      g.camera(0, 0);
      // HUD
      g.text(String(passed), W / 2, 12, PAL.white, { align: "center", size: 2 });
      if (!started) {
        g.text("BALLOON FLAP", W / 2, 60, PAL.pink, { align: "center", size: 2 });
        g.text("TAP OR PRESS A TO PUFF UP!", W / 2, 150, PAL.white, { align: "center" });
      }
    },
  };
}

export const balloonFlap: RetroGameDef = {
  id: "balloon-flap",
  title: "Balloon Flap",
  blurb: "Puff your balloon through the candy-cane pillars!",
  genre: "Action",
  emoji: "🎈",
  color: "#ff6fcf",
  controls: "A or tap the screen to puff up · don't bump anything!",
  pad: { dpad: "none", a: "Flap", tap: true },
  create,
};
