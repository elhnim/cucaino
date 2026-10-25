// SKY CLIMB — an endless bouncy climb into the sky. Pip the jelly-bean hops all by itself;
// steer left and right (walk off one side, pop out the other) to land on the next platform.
// Some platforms slide, some crumble, clouds puff away after one bounce and springs send you
// flying. Grab stars, ride a jetpack, bop grumpy storm puffs from above. Don't fall! (Original
// game in the spirit of endless jumpers.)
//
// Art: a painted night-sky cartridge look — a deep indigo/violet gradient sky full of twinkling
// stars from the very start, a sea of lilac/purple clouds rolling along the bottom with a hazier
// far layer hiding tiny distant spire silhouettes, mossy rock cliff columns framing the sides,
// chunky floating islands (bright grass cap + tapering rock body + hanging roots), a fluffy cloud
// platform, a two-tone spring, a big-eyed green slime hero with squash/stretch, big sparkly stars,
// a twin-rocket jetpack pickup, and a storm cloud with an angry face and lightning bolts.
import { H, PAL, W, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeGradient, drawStrip, hash2, mixHex, shade } from "../art";

const GRAV = 0.18;
const BOUNCE = -5.3; // ~78px jump
const SPRING = -9.2;
const PW = 32; // platform width
const HERO_W = 12;

const PUFF_BOLT = sprite([".y.", "yy.", ".yy", "yy.", ".y.", ".y."], { y: PAL.yellow });
const ROCKET_UNIT = ["..k..", ".kwk.", ".kwk.", ".krk.", "kkrkk", "krrrk", "krwrk", "krwrk", "krrrk", "krrrk", "kkrkk", ".oyo.", "..y..", "..o.."];
const ROCKET_RAW = sprite(
  ROCKET_UNIT.map((row) => row + "." + row),
  { k: "#140c28", r: PAL.red, w: PAL.white, o: PAL.orange, y: PAL.yellow },
);

type PKind = "normal" | "moving" | "crumble" | "spring" | "cloud";
interface Plat {
  x: number;
  y: number;
  kind: PKind;
  vx: number;
  alive: boolean;
  fall: number; // crumble: >0 once broken
  squash: number;
}
interface Item {
  x: number;
  y: number;
  kind: "star" | "jet";
  got: boolean;
}
interface Puff {
  x: number;
  y: number;
  baseX: number;
  t: number;
  alive: boolean;
  dy: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// deep night sky throughout: dusk violet low, near-black navy high
const SKY = ["#372c64", "#302859", "#2a2450", "#242047", "#1f1c3f", "#1a1737", "#16132f", "#120f28", "#0d0a20", "#090618"];

// ── baked art (lazy: never at module load, only the first time a round is created) ──
function bakeHero(w: number, h: number, rxF: number, ryF: number, cyF: number): Sprite {
  const cx = w / 2;
  const cy = h * cyF;
  const rx = w * rxF;
  const ry = h * ryF;
  const armR = rx * 0.24;
  const armY = cy + ry * 0.05;
  const armDX = rx * 0.95;
  const inEllipse = (x: number, y: number, ex: number, ey: number, erx: number, ery: number) => {
    const dx = (x - ex) / erx;
    const dy = (y - ey) / ery;
    return dx * dx + dy * dy <= 1;
  };
  const body = (x: number, y: number) =>
    inEllipse(x, y, cx, cy, rx, ry) || inEllipse(x, y, cx - armDX, armY, armR, armR * 0.8) || inEllipse(x, y, cx + armDX, armY, armR, armR * 0.8);
  const ring = (x: number, y: number) =>
    inEllipse(x, y, cx, cy, rx + 1.3, ry + 1.3) ||
    inEllipse(x, y, cx - armDX, armY, armR + 1.3, armR * 0.8 + 1.3) ||
    inEllipse(x, y, cx + armDX, armY, armR + 1.3, armR * 0.8 + 1.3);
  const eyeY = cy - ry * 0.3;
  const eyeDX = rx * 0.34;
  const eyeR = Math.max(1.3, rx * 0.17);
  const mouthY = cy + ry * 0.14;
  return bake(w, h, (x, y) => {
    if (!body(x, y)) return ring(x, y) ? "#140c28" : null;
    for (const sgn of [-1, 1]) {
      const ex = cx + sgn * eyeDX;
      const dx = x - ex;
      const dy = y - eyeY;
      if (dx * dx + dy * dy <= eyeR * eyeR) return dx * dx + dy * dy <= (eyeR * 0.5) * (eyeR * 0.5) ? "#140c28" : "#ffffff";
    }
    const mdx = (x - cx) / (rx * 0.55);
    if (Math.abs(mdx) <= 1) {
      const curve = mouthY + (1 - Math.abs(mdx)) * (ry * 0.16);
      if (y >= curve && y < curve + 1.6) return "#7a2f2a";
    }
    for (const sgn of [-1, 1]) {
      if (inEllipse(x, y, cx + sgn * eyeDX * 1.6, mouthY - 1, eyeR * 0.65, eyeR * 0.55)) return "#ff8fd6";
    }
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    if (nx + ny < -0.5) return "#d9fb8c";
    if (ny > 0.35) return "#2fae46";
    return "#3ecf55";
  });
}
function bakeStar(w: number, h: number): Sprite {
  const cx = w / 2 - 0.5;
  const cy = h / 2 - 0.5;
  const spikes = 5;
  const outerR = w * 0.47;
  const innerR = outerR * 0.42;
  const seg = (Math.PI * 2) / spikes;
  const radiusAt = (ang: number) => {
    const a = ((ang % seg) + seg) % seg;
    const t = a / seg;
    const tri = 1 - Math.abs(t - 0.5) * 2;
    return innerR + (outerR - innerR) * tri;
  };
  return bake(w, h, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) + Math.PI / 2;
    const R = radiusAt(ang);
    if (r > R + 1) return null;
    if (r > R - 0.8) return "#a66a16";
    if (r < R * 0.32) return "#ffffff";
    return r > R * 0.68 ? "#ffb23c" : "#ffe14d";
  });
}
function bakeStormCloud(w: number, h: number, mad: number): Sprite {
  const cx = w / 2;
  const cy = h * 0.54;
  const bumps = [
    { dx: -0.34, dy: 0.04, r: 0.27 },
    { dx: -0.1, dy: -0.14, r: 0.33 },
    { dx: 0.2, dy: -0.04, r: 0.31 },
    { dx: 0.4, dy: 0.1, r: 0.24 },
    { dx: 0.02, dy: 0.18, r: 0.33 },
  ];
  const inBump = (x: number, y: number, pad: number) => {
    for (const b of bumps) {
      const bx = cx + b.dx * w;
      const by = cy + b.dy * h;
      const r = b.r * w + pad;
      const dx = x - bx;
      const dy = y - by;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  };
  const eyeY = cy - h * 0.06;
  const eyeDX = w * 0.17;
  const eyeR = w * 0.08;
  return bake(w, h, (x, y) => {
    if (!inBump(x, y, 0)) return inBump(x, y, 1.1) ? "#120e22" : null;
    for (const sgn of [-1, 1]) {
      const ex = cx + sgn * eyeDX;
      const browY = eyeY - eyeR * 1.7;
      const bdx = x - (ex - sgn * eyeR * 0.3);
      const bdy = y - browY;
      const rot = sgn * (-0.5 - mad * 0.25);
      const rx = bdx * Math.cos(rot) - bdy * Math.sin(rot);
      const ry = bdx * Math.sin(rot) + bdy * Math.cos(rot);
      if (Math.abs(rx) < eyeR * 1.4 && Math.abs(ry) < eyeR * 0.45) return "#120e22";
      const dx = x - ex;
      const dy = y - eyeY;
      if (dx * dx + dy * dy <= eyeR * eyeR) return dx * dx + dy * dy <= (eyeR * 0.45) * (eyeR * 0.45) ? "#120e22" : "#ffffff";
    }
    const mdx = (x - cx) / (w * 0.22);
    const mdy = y - (cy + h * 0.1);
    if (Math.abs(mdx) <= 1) {
      const curve = Math.abs(mdx) * (h * 0.06);
      if (mdy > -curve - 1 && mdy < -curve + 1.3) return "#120e22";
    }
    return y < cy - h * 0.04 ? "#6b7196" : "#4a5072";
  });
}
function bakeIsland(style: "grass" | "stone" | "crumble"): Sprite {
  const w = PW;
  const h = 20;
  const border = "#140c28";
  const pal =
    style === "grass"
      ? { hi: PAL.lime, lo: shade(PAL.green, -0.12), base: PAL.brown, light: shade(PAL.brown, 0.16), dark: shade(PAL.brown, -0.35), vine: "#2d8a3f" as string | null }
      : style === "stone"
        ? { hi: "#c7cdd9", lo: "#8d93a6", base: "#6b7184", light: "#8d93a6", dark: "#454a58", vine: "#2d8a3f" as string | null }
        : { hi: shade(PAL.tan, 0.08), lo: shade(PAL.tan, -0.2), base: shade(PAL.brown, -0.08), light: shade(PAL.brown, 0.12), dark: shade(PAL.brown, -0.45), vine: null as string | null };
  const seedBase = style === "grass" ? 70 : style === "stone" ? 80 : 90;
  return bake(w, h, (x, y) => {
    if (y < 2) {
      const tuft = hash2(x, y, seedBase) > (y === 0 ? 0.55 : 0.3);
      return tuft ? (y === 0 ? pal.hi : pal.lo) : null;
    }
    if (y === 2) return x === 0 || x === w - 1 ? border : pal.hi;
    if (y === 3) return x === 0 || x === w - 1 ? border : pal.lo;
    if (y <= 15) {
      const depth = y - 4;
      const inset = Math.min(11, Math.floor(depth / 3) * 2);
      if (x < inset || x > w - 1 - inset) return null;
      if (x === inset || x === w - 1 - inset || y === 15) return border;
      const n = hash2(x, y, seedBase + 1);
      if (style === "crumble" && (x + y * 2) % 9 === 0 && n > 0.25) return border;
      if (n > 0.88) return pal.dark;
      if (n < 0.12) return pal.light;
      return pal.base;
    }
    if (!pal.vine) return null;
    for (const vx of [Math.floor(w * 0.3), Math.floor(w * 0.68)]) {
      const wig = Math.round(Math.sin(y * 0.8 + vx) * 1);
      if (x === vx + wig && hash2(x, y, seedBase + 2) > 0.15) return pal.vine;
    }
    return null;
  });
}
function bakeCloudPlat(): Sprite {
  const w = PW;
  const h = 13;
  const circles = [
    { cx: 7, cy: 7, r: 6 },
    { cx: 16, cy: 4, r: 7 },
    { cx: 25, cy: 7, r: 6 },
    { cx: 12, cy: 8, r: 5 },
    { cx: 20, cy: 8, r: 5 },
  ];
  return bake(w, h, (x, y) => {
    let inside = false;
    let top = false;
    for (const c of circles) {
      const dx = x - c.cx;
      const dy = y - c.cy;
      if (dx * dx + dy * dy <= c.r * c.r) {
        inside = true;
        if (dy < -c.r * 0.25) top = true;
      }
    }
    if (!inside) return null;
    if (top) return "#ffffff";
    if (y > h * 0.65) return "#c3cbe2";
    return "#eef3fb";
  });
}
function bakeSpring(coilH: number): Sprite {
  const w = 12;
  const h = 9;
  const capY = h - coilH - 2;
  return bake(w, h, (x, y) => {
    if (x === 0 || x === w - 1) return null;
    if (y < capY) return null;
    if (y < capY + 2) return y === capY ? "#ff8a3c" : "#ff4a4a";
    const cy = y - (capY + 2);
    if (cy >= coilH) return null;
    if (x === 1 || x === w - 2) return "#6a6f8a";
    return Math.floor(cy / 2) % 2 === 0 ? "#c9ced8" : "#4a4e6a";
  });
}
function bakeCloudSea(w: number, h: number, base: string, rim: string, spireEvery?: number): Sprite {
  // puffy round bump tops (cy/r as fractions of h, so they never get clipped by the canvas)
  // sit above a solid base fill, guaranteeing a continuous rolling cloud silhouette with no gaps
  const bumps = [
    { cx: 0.06, cy: 0.8, r: 0.42 },
    { cx: 0.2, cy: 0.62, r: 0.5 },
    { cx: 0.36, cy: 0.78, r: 0.46 },
    { cx: 0.5, cy: 0.64, r: 0.44 },
    { cx: 0.64, cy: 0.8, r: 0.48 },
    { cx: 0.8, cy: 0.62, r: 0.46 },
    { cx: 0.94, cy: 0.78, r: 0.4 },
  ];
  const wrapDx = (x: number, bx: number) => {
    const a = (((x - bx) % w) + w) % w;
    return Math.min(a, w - a);
  };
  const bumpHit = (x: number, y: number) => {
    for (const b of bumps) {
      const dx = wrapDx(x, b.cx * w);
      const dy = y - b.cy * h;
      const r = b.r * h;
      if (dx * dx + dy * dy <= r * r) return dy < -r * 0.3 ? 2 : 1;
    }
    return 0;
  };
  return bake(w, h, (x, y) => {
    if (spireEvery) {
      const sx = ((x % spireEvery) + spireEvery) % spireEvery;
      if (sx < 3) {
        const tip = h * 0.4 - (3 - sx) * 4;
        if (y > h * 0.16 && y < tip) return mixHex(base, "#0a0716", 0.6);
      }
    }
    if (y > h * 0.78) return y > h * 0.92 ? shade(base, -0.14) : base;
    const hit = bumpHit(x, y);
    if (!hit) return null;
    return hit === 2 ? rim : base;
  });
}
function bakeCliff(w: number, h: number, seed: number): Sprite {
  const vineX = Math.floor(w * 0.32);
  return bake(w, h, (x, y) => {
    const edgeJitter = hash2(y, 0, seed) * 3;
    if (x < edgeJitter || x > w - 1 - edgeJitter) return null;
    if (y % h < 3) {
      if (y % h === 0) return hash2(x, 1, seed + 1) > 0.4 ? "#2fae46" : null;
      return "#3ecf55";
    }
    const wig = Math.round(Math.sin(y * 0.5 + seed) * 2);
    if (y % h > 5 && y % h < h - 5 && Math.abs(x - (vineX + wig)) <= 1 && hash2(x, y, seed + 2) > 0.3) return "#2d8a3f";
    const n = hash2(x, y, seed + 3);
    if (n > 0.9) return "#3a4a3a";
    if (n > 0.8) return "#5c5468";
    if (n < 0.1) return "#847a98";
    return "#625a74";
  });
}
function makeArt() {
  return {
    skyBands: SKY.map((c) => bakeGradient(W, H, [shade(c, -0.15), shade(c, 0.12)])),
    heroIdle: bakeHero(20, 20, 0.44, 0.46, 0.54),
    heroSquash: bakeHero(20, 20, 0.5, 0.34, 0.66),
    heroStretch: bakeHero(20, 20, 0.32, 0.52, 0.48),
    islandGrass: bakeIsland("grass"),
    islandStone: bakeIsland("stone"),
    islandCrumble: bakeIsland("crumble"),
    cloudPlat: bakeCloudPlat(),
    springFull: bakeSpring(6),
    springSquash: bakeSpring(3),
    star: bakeStar(13, 13),
    rocket: ROCKET_RAW,
    stormA: bakeStormCloud(20, 14, 0),
    stormB: bakeStormCloud(20, 14, 1),
    cloudSeaFar: bakeCloudSea(128, 30, "#473a73", "#7466a8", 64),
    cloudSeaNear: bakeCloudSea(128, 40, "#9a7ae0", "#c9b6ff"),
    cliff: bakeCliff(18, 64, 5),
  };
}
let ART: ReturnType<typeof makeArt> | null = null;
const art = () => (ART ??= makeArt());

/** tile a sprite vertically down the screen at a fixed x, wrapped by `scroll` px (like
 *  art.ts's drawStrip but for a column instead of a row) */
function drawVStrip(g: Gfx, s: Sprite, scroll: number, x: number, opts?: { flipX?: boolean }) {
  const h = s.rows.length;
  if (!h) return;
  let y = -(((scroll % h) + h) % h);
  for (; y < H; y += h) g.sprite(s, x, y, opts);
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  const A = art();
  const START_Y = H - 40;
  const hero = { x: W / 2 - 6, y: START_Y - 12, vx: 0, vy: BOUNCE, lives: 3, inv: 0, jet: 0, face: 1, squash: 0, falling: -1 };
  const plats: Plat[] = [];
  const items: Item[] = [];
  const puffs: Puff[] = [];
  const parts: Part[] = [];
  const clouds = Array.from({ length: 7 }, () => ({ x: r.range(-20, W), y: r.range(0, H), s: r.range(0.6, 1.4) }));
  const skyStars = Array.from({ length: 56 }, () => ({ x: r.range(0, W), y: r.range(0, H), tw: r.next() }));
  let camY = 0;
  let topY = START_Y; // highest generated platform
  let best = 0; // metres scored so far
  let lastBand = 0;
  let frame = 0;
  let over = false;

  // the starting floor: a row of platforms so nobody falls straight away
  for (let x = 0; x < W; x += PW) plats.push({ x, y: START_Y, kind: "normal", vx: 0, alive: true, fall: 0, squash: 0 });

  const heightAt = (y: number) => Math.max(0, (START_Y - y) / 4); // metres

  const generate = () => {
    while (topY > camY - 60) {
      const m = heightAt(topY);
      const gap = r.range(22, 30 + Math.min(32, m / 25));
      topY -= gap;
      const x = r.range(0, W - PW);
      let kind: PKind = "normal";
      const roll = r.next();
      if (roll < 0.07) kind = "spring";
      else if (m > 80 && roll < 0.07 + Math.min(0.35, m / 1500)) kind = "moving";
      else if (m > 180 && roll < 0.55 && r.chance(0.3)) kind = "cloud";
      plats.push({ x, y: topY, kind, vx: kind === "moving" ? r.pick([-1, 1]) * r.range(0.5, Math.min(1.6, 0.6 + m / 800)) : 0, alive: true, fall: 0, squash: 0 });
      // decoy crumbling platforms never replace the safe path, they sit between
      if (m > 120 && r.chance(Math.min(0.35, m / 1200))) plats.push({ x: r.range(0, W - PW), y: topY + gap / 2, kind: "crumble", vx: 0, alive: true, fall: 0, squash: 0 });
      if (r.chance(0.28)) items.push({ x: x + PW / 2 - 3, y: topY - 16, kind: "star", got: false });
      else if (m > 60 && kind === "normal" && r.chance(0.018)) items.push({ x: x + PW / 2 - 4, y: topY - 10, kind: "jet", got: false });
      if (m > 150 && r.chance(Math.min(0.12, 0.02 + m / 6000))) {
        const px = r.range(8, W - 24);
        puffs.push({ x: px, y: topY - gap / 2 - 5, baseX: px, t: r.range(0, 6), alive: true, dy: 0 });
      }
    }
  };
  generate();

  const burst = (x: number, y: number, n: number, colors: string[]) => {
    for (let i = 0; i < n && parts.length < 100; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.3, 1.8);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(12, 28), color: r.pick(colors) });
    }
  };

  const hurt = (io: IO) => {
    hero.lives--;
    hero.inv = 100;
    io.sfx.play("hurt");
    burst(hero.x + 6, hero.y + 6, 12, [PAL.white, PAL.grey]);
    if (hero.lives <= 0) {
      hero.falling = 0;
      io.sfx.play("die");
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
        p.vy += 0.05;
        p.life--;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);

      if (hero.falling >= 0) {
        // out of lives: tumble down, then end the run
        hero.falling++;
        hero.vy = Math.min(6, hero.vy + GRAV);
        hero.y += hero.vy;
        if (hero.falling > 70) {
          over = true;
          io.gameOver();
        }
        return;
      }

      // ── steering (wraps around the edges) ──
      const want = inp.held.left ? -2.3 : inp.held.right ? 2.3 : 0;
      hero.vx += (want - hero.vx) * 0.18;
      if (want) hero.face = Math.sign(want);
      hero.x += hero.vx;
      if (hero.x < -HERO_W / 2) hero.x += W;
      if (hero.x > W - HERO_W / 2) hero.x -= W;
      hero.inv = Math.max(0, hero.inv - 1);
      hero.squash = Math.max(0, hero.squash - 1);

      const oldFeet = hero.y + 12;
      if (hero.jet > 0) {
        hero.jet--;
        hero.vy = -6;
        if (frame % 2 === 0 && parts.length < 100) parts.push({ x: hero.x + 6 + r.range(-2, 2), y: hero.y + 13, vx: r.range(-0.3, 0.3), vy: 1.5, life: 14, color: r.pick([PAL.orange, PAL.yellow, PAL.red]) });
        if (frame % 6 === 0) io.sfx.play("step");
      } else {
        hero.vy = Math.min(7, hero.vy + GRAV);
        if (hero.vy > 3 && frame % 6 === 0) burst(hero.x + 6, hero.y + 2, 2, [PAL.white]);
        if (hero.vy < -3 && frame % 3 === 0) burst(hero.x + 6, hero.y + 16, 2, [PAL.lime, "#d9fb8c"]);
      }
      hero.y += hero.vy;
      const feet = hero.y + 12;

      // ── platforms ──
      for (const p of plats) {
        if (!p.alive) continue;
        p.squash = Math.max(0, p.squash - 1);
        if (p.kind === "moving") {
          p.x += p.vx;
          if (p.x < 0 || p.x > W - PW) p.vx = -p.vx;
        }
        if (p.fall > 0) {
          p.fall++;
          p.y += 2.5;
          if (p.fall > 60) p.alive = false;
          continue;
        }
        if (hero.vy > 0 && hero.jet === 0 && oldFeet <= p.y + 2 && feet >= p.y && hero.x + HERO_W - 2 > p.x && hero.x + 2 < p.x + PW) {
          if (p.kind === "crumble") {
            p.fall = 1;
            burst(p.x + PW / 2, p.y + 2, 8, [PAL.brown, PAL.tan]);
            io.sfx.play("thud");
            continue;
          }
          hero.y = p.y - 12;
          hero.vy = p.kind === "spring" ? SPRING : BOUNCE;
          hero.squash = 6;
          p.squash = 6;
          burst(hero.x + 6, p.y, 5, [PAL.white, "#cdd3e0"]);
          io.sfx.play(p.kind === "spring" ? "powerup" : "jump");
          if (p.kind === "cloud") {
            p.alive = false;
            io.sfx.play("pop");
            burst(p.x + PW / 2, p.y + 3, 12, [PAL.white, PAL.sky]);
          }
        }
      }

      // ── items ──
      for (const it of items) {
        if (it.got) continue;
        if (overlap({ x: hero.x, y: hero.y, w: 12, h: 12 }, { x: it.x - 2, y: it.y - 2, w: it.kind === "jet" ? 13 : 11, h: 13 })) {
          it.got = true;
          if (it.kind === "star") {
            io.score(100);
            io.sfx.play("coin");
            burst(it.x + 3, it.y + 3, 8, [PAL.yellow, PAL.white]);
          } else {
            hero.jet = 170;
            io.score(200);
            io.sfx.play("powerup");
            io.sfx.slide?.(300, 900, 0.35);
          }
        }
      }

      // ── storm puffs ──
      for (const e of puffs) {
        if (!e.alive) {
          e.dy += 0.2;
          e.y += e.dy;
          continue;
        }
        e.t += 0.025;
        e.x = e.baseX + Math.sin(e.t) * 30;
        const box = { x: e.x + 1, y: e.y + 1, w: 14, h: 8 };
        if (overlap({ x: hero.x + 1, y: hero.y + 1, w: 10, h: 11 }, box)) {
          if (hero.jet > 0) {
            e.alive = false;
            io.score(150);
            io.sfx.play("explode");
            burst(e.x + 8, e.y + 5, 14, [PAL.grey, PAL.white]);
          } else if (hero.vy > 0 && oldFeet <= e.y + 5) {
            e.alive = false;
            hero.vy = BOUNCE - 1;
            io.score(150);
            io.sfx.play("bounce");
            burst(e.x + 8, e.y + 5, 14, [PAL.grey, PAL.white]);
          } else if (hero.inv === 0) {
            io.sfx.play("zap");
            hurt(io);
            hero.vy = Math.max(hero.vy, 1.5);
            if (hero.falling >= 0) return;
          }
        }
      }

      // ── camera climbs, never drops ──
      camY = Math.min(camY, hero.y - 90);
      const m = Math.floor(heightAt(hero.y + 12));
      if (m > best) {
        io.score((m - best) * 10);
        best = m;
      }
      const band = Math.min(SKY.length - 1, Math.floor(best / 250));
      if (band > lastBand) {
        lastBand = band;
        io.sfx.slide?.(360, 760, 0.4);
      }
      generate();

      // fell off the bottom: a rescue bounce while lives remain
      if (hero.y > camY + H + 8) {
        hurt(io);
        if (hero.falling >= 0) return;
        hero.y = camY + H;
        hero.vy = -10;
        hero.inv = 120;
        io.sfx.play("whoosh");
      }

      // cleanup below the screen
      const bottom = camY + H + 40;
      for (let i = plats.length - 1; i >= 0; i--) if (!plats[i].alive || plats[i].y > bottom) plats.splice(i, 1);
      for (let i = items.length - 1; i >= 0; i--) if (items[i].got || items[i].y > bottom) items.splice(i, 1);
      for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].y > bottom) puffs.splice(i, 1);
    },

    draw(g: Gfx) {
      const band = Math.min(SKY.length - 1, Math.floor(best / 250));
      g.clear(SKY[band]);
      g.sprite(A.skyBands[band], 0, 0);
      for (const s of skyStars) {
        const sy = (((s.y - camY * 0.05) % H) + H) % H;
        if (Math.sin(frame * 0.07 + s.tw * 26) <= 0.1) continue;
        const big = s.tw > 0.88;
        const col = s.tw > 0.94 ? PAL.yellow : PAL.white;
        g.rect(s.x, sy, 1, 1, col);
        if (big) {
          g.rect(s.x - 1, sy, 1, 1, PAL.white);
          g.rect(s.x + 1, sy, 1, 1, PAL.white);
          g.rect(s.x, sy - 1, 1, 1, PAL.white);
          g.rect(s.x, sy + 1, 1, 1, PAL.white);
        }
      }
      for (const c of clouds) {
        const y = ((((c.y - camY * 0.3 * c.s) % (H + 40)) + H + 40) % (H + 40)) - 20;
        g.alpha(0.5);
        g.circle(c.x, y, 10 * c.s, PAL.white);
        g.circle(c.x + 12 * c.s, y + 2, 8 * c.s, PAL.white);
        g.circle(c.x - 11 * c.s, y + 3, 7 * c.s, PAL.white);
        g.alpha(1);
      }
      // a sea of clouds rolling along the bottom (far = hazy, carries tiny distant spires)
      g.alpha(0.6);
      drawStrip(g, A.cloudSeaFar, -frame * 0.05, H - 48);
      g.alpha(0.95);
      drawStrip(g, A.cloudSeaNear, frame * 0.1, H - 36);
      g.alpha(1);
      // mossy rock cliffs framing the sides
      drawVStrip(g, A.cliff, camY * 0.35, -5);
      drawVStrip(g, A.cliff, camY * 0.35 + 20, W - 13, { flipX: true });
      g.camera(0, camY);
      for (const p of plats) {
        if (!p.alive) continue;
        const sq = p.squash ? 1 : 0;
        if (p.kind === "cloud") {
          g.sprite(A.cloudPlat, p.x, p.y - 4 + sq);
          continue;
        }
        const tile = p.kind === "moving" ? A.islandStone : p.kind === "crumble" ? A.islandCrumble : A.islandGrass;
        g.sprite(tile, p.x, p.y - 2 + sq);
        if (p.kind === "spring") g.sprite(p.squash ? A.springSquash : A.springFull, p.x + PW / 2 - 6, p.y - 9);
      }
      for (const it of items) {
        const bob = Math.sin(frame * 0.1 + it.x) * 1.5;
        if (it.kind === "star") g.sprite(A.star, it.x - 4, it.y + bob - 4);
        else g.sprite(A.rocket, it.x - 2, it.y + bob - 2);
      }
      for (const e of puffs) {
        g.sprite(Math.floor(frame / 15) % 2 === 0 ? A.stormA : A.stormB, e.x - 4, e.y - 4, { flipY: !e.alive });
        if (e.alive) {
          const pulse = 0.55 + 0.45 * Math.sin(frame * 0.25 + e.baseX * 0.1);
          g.alpha(pulse);
          g.sprite(PUFF_BOLT, e.x + 2, e.y + 9);
          g.sprite(PUFF_BOLT, e.x + 10, e.y + 9);
          g.alpha(1);
        }
      }
      // hero
      if (!(hero.inv > 0 && Math.floor(hero.inv / 4) % 2)) {
        const launching = hero.vy < -3.2 && hero.jet === 0;
        const heroArt = hero.squash > 0 ? A.heroSquash : launching ? A.heroStretch : A.heroIdle;
        const hx = hero.x - 4;
        const hy = hero.y - 7;
        if (hero.jet > 0) g.sprite(A.rocket, hero.x - 4, hero.y + 8, { scale: 0.9 });
        g.sprite(heroArt, hx, hy, { flipX: hero.face < 0, flipY: hero.falling >= 0 });
        // wrap ghost so Pip looks right crossing an edge
        if (hero.x > W - HERO_W) g.sprite(heroArt, hx - W, hy, { flipX: hero.face < 0 });
        if (hero.x < 0) g.sprite(heroArt, hx + W, hy, { flipX: hero.face < 0 });
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      g.camera(0, 0);
      // HUD
      g.rect(0, 0, W, 11, "rgba(13,11,26,0.45)");
      g.rect(0, 11, W, 1, "rgba(182,242,74,0.35)");
      for (let i = 0; i < hero.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`${best} M`, W - 4, 2, PAL.white, { align: "right" });
      if (hero.jet > 0) {
        g.rect(W / 2 - 20, 4, 40, 3, PAL.dark);
        g.rect(W / 2 - 20, 4, (40 * hero.jet) / 170, 3, PAL.orange);
      }
      if (best < 3) g.text("< > STEER!", W / 2, 40, PAL.white, { align: "center" });
    },
  };
}

export const skyClimb: RetroGameDef = {
  id: "sky-climb",
  title: "Sky Climb",
  blurb: "Bounce from cloud to cloud and climb as high as you can!",
  genre: "Platformer",
  emoji: "☁️",
  color: "#6cb6ff",
  controls: "◀ ▶ steer (wrap around the sides) · bop puffs from above",
  pad: { dpad: "lr" },
  create,
};
