// DIRT DASH — a side-view motocross race over 3 original tracks. Hold A to throttle, hold B
// for turbo (watch the HEAT gauge — overheat and the engine stalls for a moment), ▲ ▼ to
// switch between the 4 lanes, and ◀ ▶ to lean the bike in the air: land level with the
// ground or you tumble. Hay bales knock you off, mud slows you down, rival riders get in
// the way. Beat each track's qualify time to move on; clear all 3 to win the cup.
// (Original game in the spirit of 8-bit motocross racers.)
import { PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeGradient, bayer, drawStrip, hash2, shade } from "../art";

const LANE_Y = [136, 152, 168, 184]; // wheel baseline of each lane (far → near)
// a jump/mound is one physical feature shared by all 4 lanes (same groundH everywhere), but drawn
// at FULL height on every lane it would overlap itself into a solid wall; scale it down for the
// farther lanes (and the bike riding them) so it reads as one hill seen in depth, biggest up front
const RAMP_LANE_SCALE = [0.4, 0.6, 0.8, 1];
const BIKE_SX = 72; // the bike's screen x
const GRAV = 0.13;
const LAND_OK = 0.55; // how far off the ground angle (radians) a landing may be

interface Track {
  name: string;
  seed: number;
  len: number;
  time: number;
  dirt: string; // track surface base colour
  sky: string[]; // dusk gradient stops, top -> horizon
  sun: string; // sun disc core colour
  halo: string; // sun glow colour
  mountain: string; // far mountain silhouette
  tree: string; // pine treeline silhouette (closer, darker)
  rivalV: [number, number];
}
// every track races at dusk, like the cabinet painting — a low sun behind purple mountains and a
// dark pine treeline — but each has its own sunset hue so the 3 tracks still read apart.
const TRACKS: Track[] = [
  {
    name: "SUNNY HILLS",
    seed: 11,
    len: 6400,
    time: 56,
    dirt: "#c98a4a",
    sky: ["#2c2150", "#523766", "#9a4f6e", "#f0a05c"],
    sun: "#fff6c8",
    halo: "#ffb35c",
    mountain: "#3a2f57",
    tree: "#1c2a20",
    rivalV: [2.1, 2.6],
  },
  {
    name: "CANDY CANYON",
    seed: 23,
    len: 7400,
    time: 63,
    dirt: "#d9906a",
    sky: ["#3a1f55", "#6a2f74", "#c14f8c", "#ffb3e6"],
    sun: "#fffbe0",
    halo: "#ff8fd6",
    mountain: "#5a2f66",
    tree: "#2a1f3a",
    rivalV: [2.3, 2.9],
  },
  {
    name: "THUNDER DUNES",
    seed: 37,
    len: 8400,
    time: 70,
    dirt: "#e0b060",
    sky: ["#140c28", "#241a44", "#3a2a66", "#5c3c8a"],
    sun: "#ffd9a0",
    halo: "#e0703c",
    mountain: "#241a3c",
    tree: "#120c1f",
    rivalV: [2.5, 3.1],
  },
];
const FENCE_WOOD = "#8a5a2c";

interface Ramp {
  x: number;
  up: number;
  top: number;
  down: number; // 0 = sheer drop (a jump)
  h: number;
}
interface Spot {
  x: number;
  lane: number;
  w: number;
  gone: boolean;
}
interface Rider {
  x: number;
  lane: number;
  y: number; // current baseline (animates between lanes)
  alt: number;
  vy: number;
  air: boolean;
  pitch: number;
  v: number;
  color: string;
  passed: boolean;
  t: number;
  squash: number;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

// ── baked art (lazy: never at module load, only the first time a round is created) ──

/** a round golden hay bale with straw-strand shading and dark twine bands */
function bakeHay(w: number, h: number): Sprite {
  const rx = w / 2 - 0.5;
  const ry = h / 2 - 0.5;
  const cx = w / 2 - 0.5;
  const cy = h / 2 - 0.5;
  return bake(w, h, (x, y) => {
    const dx = (x - cx) / (rx + 0.6);
    const dy = (y - cy) / (ry + 0.6);
    const d2 = dx * dx + dy * dy * 1.1;
    if (d2 > 1.08) return null;
    if (d2 > 0.95) return "#6b4a1e";
    const n = hash2(x, y, 41);
    const base = n > 0.82 ? "#c99a3a" : n < 0.18 ? "#8a6424" : "#e0b84a";
    // twine bands + top highlight
    if (x === Math.round(w * 0.3) || x === Math.round(w * 0.7)) return "#6b4a1e";
    if (dy < -0.45) return "#f6d978";
    return base;
  });
}
/** soft sun disc: bright core, warm ring, dithered into nothing (no flat glow dome) */
function bakeSun(size: number, core: string, halo: string): Sprite {
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const r = size / 2;
  return bake(size, size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) / r;
    if (d > 1) return null;
    if (d < 0.55) return core;
    if (d < 0.8) return halo;
    // dithered falloff ring instead of a hard edge
    return 1 - d > bayer(x, y) * 0.5 ? halo : null;
  });
}
/** a jagged mountain-range silhouette, lit along its ridge by the low sun */
function bakeMountains(w: number, h: number, base: string, seed: number): Sprite {
  const peak = (x: number) => {
    const a = Math.sin(x * 0.045 + seed) * 0.5 + Math.sin(x * 0.11 + seed * 2) * 0.3 + Math.sin(x * 0.021 + seed * 3) * 0.4;
    return h * 0.3 + a * h * 0.4;
  };
  const tops = Array.from({ length: w }, (_, x) => Math.round(h - Math.max(2, peak(x))));
  const rim = shade(base, 0.3);
  return bake(w, h, (x, y) => {
    const top = tops[x];
    if (y < top) return null;
    if (y - top < 2 && hash2(x, 0, seed) > 0.2) return rim;
    const n = hash2(x, y, seed + 7);
    return n > 0.93 ? shade(base, -0.15) : base;
  });
}
/** a closer pine-tree treeline silhouette, denser and darker than the mountains behind it */
function bakeTrees(w: number, h: number, color: string, seed: number): Sprite {
  const spacing = 10;
  const heightAt = (cx: number) => h * 0.55 + hash2(Math.round(cx / spacing), 0, seed) * h * 0.4;
  return bake(w, h, (x, y) => {
    let hit = false;
    for (const cx of [Math.floor(x / spacing) * spacing + spacing / 2, Math.floor((x - spacing / 2) / spacing) * spacing + spacing]) {
      const th = heightAt(cx);
      const top = h - th;
      const half = spacing * 0.42 * ((y - top) / th + 0.25);
      if (y >= top && Math.abs(x - cx) <= half) hit = true;
    }
    if (!hit) return null;
    return hash2(x, y, seed + 3) > 0.9 ? shade(color, 0.2) : color;
  });
}
/** a wooden rail fence tile (two solid rails on routed posts) — wraps with drawStrip; the gaps
 *  above/below/between the rails show the treeline behind, like a real split-rail fence */
function bakeFence(): Sprite {
  const w = 24;
  const h = 13;
  const postL = 2;
  const postR = w - 4;
  return bake(w, h, (x, y) => {
    if ((x === postL || x === postR) && y >= 1) return shade(FENCE_WOOD, 0.18);
    if ((x === postL + 1 || x === postR + 1) && y >= 1) return shade(FENCE_WOOD, -0.22);
    if (y === 3) return shade(FENCE_WOOD, 0.22);
    if (y === 4) return FENCE_WOOD;
    if (y === 5) return shade(FENCE_WOOD, -0.22);
    if (y === 8) return shade(FENCE_WOOD, 0.22);
    if (y === 9) return FENCE_WOOD;
    if (y === 10) return shade(FENCE_WOOD, -0.22);
    return null;
  });
}
/** a tileable dirt-track surface: two-tone rutted dirt with a worn, darker groove under each lane */
function bakeDirtTile(w: number, h: number, base: string): Sprite {
  const laneYs = LANE_Y.map((y) => y - 122);
  return bake(w, h, (x, y) => {
    let v = base;
    const n = hash2(x, y, 5);
    if (n > 0.9) v = shade(base, -0.22);
    else if (n < 0.1) v = shade(base, 0.14);
    for (const ly of laneYs) {
      if (Math.abs(y - (ly + 3)) <= 1) return shade(base, -0.28);
    }
    return v;
  });
}
/** a tileable DARK DIRT foreground strip — grass tufts and small stones poking out of dark earth,
 *  like the painting's near edge (not a flat bright-green band) */
function bakeForeground(w: number, h: number): Sprite {
  const base = "#2a1a10";
  return bake(w, h, (x, y) => {
    if (y === 0) {
      const n = hash2(x, 0, 13);
      if (n > 0.76) return "#5a9a3c"; // a grass tuft catching the last light
      if (n > 0.68) return "#2fae46";
      return shade(base, 0.22);
    }
    if (y === 1) return shade(base, 0.08);
    const n = hash2(x, y, 15);
    if (n > 0.95) return "#8a8478"; // a small stone
    if (n > 0.88) return shade(base, -0.2);
    if (n < 0.08) return shade(base, 0.12);
    return base;
  });
}
/** soft, dithered sunset cloud streaks — never a hard-edged cloud shape */
function bakeClouds(w: number, h: number, color: string, seed: number): Sprite {
  const bands = [
    { cx: w * 0.18, cy: h * 0.3, rx: w * 0.26, ry: h * 0.16 },
    { cx: w * 0.56, cy: h * 0.48, rx: w * 0.2, ry: h * 0.11 },
    { cx: w * 0.85, cy: h * 0.22, rx: w * 0.22, ry: h * 0.13 },
  ];
  return bake(w, h, (x, y) => {
    for (const b of bands) {
      const dxw = Math.min(Math.abs(x - b.cx), w - Math.abs(x - b.cx));
      const dx = dxw / b.rx;
      const dy = (y - b.cy) / b.ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (1 - d > bayer(x, y) * 0.8 + hash2(Math.floor(x / 3), Math.floor(y / 2), seed) * 0.12) return color;
    }
    return null;
  });
}
/** a chunky knobbly motocross tyre, baked once and shared by every bike (colour-independent);
 *  frame 0/1 rotate the tread knobs and the hub highlight to fake a spinning wheel */
function bakeWheel(r: number, frame: number): Sprite {
  const size = r * 2 + 2;
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const knobs = 10;
  const spin = frame * (Math.PI / knobs);
  return bake(size, size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) return null;
    const ang = Math.atan2(dy, dx) + spin;
    if (d > r - 1.6) return Math.cos(ang * knobs) > 0.55 ? "#05040a" : "#1c1830"; // knobbly tread
    if (d > r - 3) return "#140c28";
    if (d > r * 0.42) return "#2a2440";
    if (d > r * 0.26) return "#c9ced8"; // rim
    return Math.cos(ang * 3) > 0.8 ? "#eef1f6" : "#3a3450"; // hub + a mark that visibly spins
  });
}
function makeArt(t: Track) {
  return {
    sky: bakeGradient(W, 122, t.sky),
    clouds: bakeClouds(170, 48, shade(t.halo, 0.12), t.seed),
    sun: bakeSun(26, t.sun, t.halo),
    mountains: bakeMountains(160, 42, t.mountain, t.seed),
    trees: bakeTrees(120, 24, t.tree, t.seed + 1),
    fence: bakeFence(),
    dirt: bakeDirtTile(48, 68, t.dirt),
    ground: bakeForeground(40, 34),
    hay: bakeHay(22, 17),
    wheelA: bakeWheel(9, 0),
    wheelB: bakeWheel(9, 1),
  };
}
let ART: (ReturnType<typeof makeArt> & { forTi: number }) | null = null;
/** art is per-track (dirt/mountain/tree colours differ), so rebake only when the track changes */
function art(ti: number, t: Track) {
  if (!ART || ART.forTi !== ti) ART = { ...makeArt(t), forTi: ti };
  return ART;
}

function buildTrack(t: Track, level: number) {
  const r = rng(t.seed);
  const ramps: Ramp[] = [];
  const hay: Spot[] = [];
  const mud: Spot[] = [];
  let x = 520;
  while (x < t.len - 500) {
    const k = r.int(0, 5 + level);
    if (k <= 1) {
      const h = r.int(14, 20 + level * 3);
      ramps.push({ x, up: 50, top: r.int(10, 30), down: 50, h });
      x += 130 + r.int(120, 220);
    } else if (k <= 3) {
      const h = r.int(20, 26 + level * 5);
      ramps.push({ x, up: 56 + level * 4, top: 0, down: 0, h });
      x += 60 + r.int(230, 300); // room to land
    } else if (k === 4) {
      ramps.push({ x, up: 50, top: r.int(70, 110), down: 50, h: r.int(18, 24) });
      x += 230 + r.int(120, 200);
    } else if (k === 5) {
      // hay bales in 1–3 lanes, never all 4
      const lanes = [0, 1, 2, 3].sort(() => r.next() - 0.5).slice(0, r.int(1, Math.min(3, 1 + level)));
      for (const lane of lanes) hay.push({ x: x + r.int(0, 30), lane, w: 14, gone: false });
      x += r.int(160, 240);
    } else {
      const lanes = [0, 1, 2, 3].sort(() => r.next() - 0.5).slice(0, r.int(1, 2));
      const w = r.int(60, 120);
      for (const lane of lanes) mud.push({ x, lane, w, gone: false });
      x += w + r.int(120, 200);
    }
  }
  return { ramps, hay, mud };
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let ti = 0;
  let track = TRACKS[0];
  let course = buildTrack(track, 0);
  const bike = { x: 0, lane: 1, y: LANE_Y[1], alt: 0, vy: 0, v: 0, pitch: 0, air: false, tumble: 0, heat: 0, stall: 0, wheel: 0, laneCool: 0, airT: 0, squash: 0 };
  let rivals: Rider[] = [];
  const bits: Bit[] = [];
  let time = 0;
  let state: "count" | "race" | "done" | "fail" | "won" = "count";
  let stateT = 0;
  let frame = 0;
  let msg = "";
  let msgT = 0;
  let rivalT = 0;
  let wasInMud = false;
  const A = () => art(ti, track);

  const groundH = (x: number) => {
    for (const p of course.ramps) {
      if (x < p.x) return 0;
      const rel = x - p.x;
      if (rel < p.up) return (p.h * rel) / p.up;
      if (rel < p.up + p.top) return p.h;
      if (p.down > 0 && rel < p.up + p.top + p.down) return p.h * (1 - (rel - p.up - p.top) / p.down);
    }
    return 0;
  };
  const slope = (x: number) => (groundH(x + 1) - groundH(x - 1)) / 2;
  const say = (s: string, t = 60) => {
    msg = s;
    msgT = t;
  };
  const dust = (x: number, y: number, c: string, n: number, up = 1) => {
    for (let i = 0; i < n; i++) bits.push({ x, y, vx: r.range(-1.6, 0.4), vy: -r.range(0.2, 1.4) * up, life: r.int(12, 24), c });
  };

  const startTrack = () => {
    track = TRACKS[ti];
    course = buildTrack(track, ti);
    Object.assign(bike, { x: 0, lane: 1, y: LANE_Y[1], alt: 0, vy: 0, v: 0, pitch: 0, air: false, tumble: 0, heat: 0, stall: 0, laneCool: 0 });
    time = track.time;
    state = "count";
    stateT = 180;
    rivals = [];
    const colors = [PAL.blue, PAL.green, PAL.purple, PAL.teal, PAL.pink];
    for (let i = 0; i < 4; i++) {
      const lane = (i + 2) % 4;
      rivals.push({ x: 40 + i * 50, lane, y: LANE_Y[lane], alt: 0, vy: 0, air: false, pitch: 0, v: r.range(track.rivalV[0], track.rivalV[1]), color: colors[i], passed: false, t: 0, squash: 0 });
    }
  };
  startTrack();

  /** shared ground-following / jumping physics for every bike */
  const ride = (b: { x: number; alt: number; vy: number; air: boolean; pitch: number }, v: number) => {
    const rise = slope(b.x) * v;
    b.x += v;
    const g1 = groundH(b.x);
    if (!b.air) {
      if (b.alt + Math.max(0, rise) > g1 + 1.5) {
        b.air = true;
        b.vy = Math.max(0, rise);
      } else {
        b.alt = g1;
        b.pitch = Math.atan(slope(b.x));
        return "ground";
      }
    }
    b.vy -= GRAV;
    b.alt += b.vy;
    if (b.alt <= g1 && b.vy < 0) {
      b.alt = g1;
      b.air = false;
      return "land";
    }
    return "air";
  };

  const tumble = (io: IO, why: string) => {
    bike.tumble = 70;
    bike.air = false;
    bike.squash = 0;
    bike.v = Math.min(bike.v, 0.8);
    io.sfx.play("die");
    io.sfx.noise?.(0.25, 0.06, 500, 100);
    say(why, 50);
    dust(BIKE_SX, bike.y - bike.alt, PAL.tan, 10, 1.5);
  };

  return {
    update(io) {
      frame++;
      if (msgT > 0) msgT--;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx - bike.v; // bits live in screen space; the world scrolls under them
        b.y += b.vy;
        b.vy += 0.06;
        if (--b.life <= 0) bits.splice(i, 1);
      }
      if (state === "won") return;
      if (state === "count") {
        stateT--;
        if (stateT % 60 === 0 && stateT > 0) io.sfx.tone(440, 0.15, "square", 0.08);
        if (stateT <= 0) {
          state = "race";
          io.sfx.tone(880, 0.3, "square", 0.1);
          say("GO!", 40);
        }
        return;
      }
      if (state === "done") {
        bike.v = Math.max(0, bike.v - 0.05);
        bike.x += bike.v;
        if (--stateT <= 0) {
          if (ti >= TRACKS.length - 1) {
            state = "won";
            io.win();
          } else {
            ti++;
            startTrack();
          }
        }
        return;
      }
      if (state === "fail") {
        bike.v = Math.max(0, bike.v - 0.05);
        if (--stateT === 0) io.gameOver();
        return;
      }

      // ── race ──
      time -= 1 / 60;
      if (time <= 0) {
        time = 0;
        state = "fail";
        stateT = 90;
        say("DID NOT QUALIFY", 999);
        io.sfx.play("die");
        return;
      }
      const inp = io.input;
      if (bike.laneCool > 0) bike.laneCool--;
      bike.squash = Math.max(0, bike.squash - 1);
      for (const rv of rivals) rv.squash = Math.max(0, rv.squash - 1);
      if (bike.tumble > 0) {
        bike.tumble--;
        bike.v *= 0.92;
        bike.x += bike.v;
        bike.alt = groundH(bike.x);
        if (bike.tumble === 0) {
          bike.pitch = Math.atan(slope(bike.x));
          say("GO GO!", 30);
        }
      } else {
        // engine + turbo heat
        let top = 0;
        if (bike.stall > 0) {
          bike.stall--;
          bike.heat = Math.max(0, bike.heat - 0.6);
          if (bike.stall % 20 === 0) io.sfx.tone(90, 0.1, "sawtooth", 0.05);
        } else if (inp.held.b) {
          if (inp.pressed.b) io.sfx.slide?.(240, 520, 0.14, "sawtooth", 0.08);
          top = 4.1;
          bike.heat += 0.8;
          if (bike.heat >= 100) {
            bike.heat = 100;
            bike.stall = 100;
            io.sfx.play("explode");
            io.sfx.noise?.(0.35, 0.07, 900, 120);
            say("OVERHEAT!", 70);
          }
        } else if (inp.held.a) top = 3;
        if (!inp.held.b && bike.stall === 0) bike.heat = Math.max(0, bike.heat - 0.45);
        // a low engine hum that rises with speed, throttled so it never plays every frame
        if (!bike.air && bike.stall === 0 && bike.v > 0.2 && frame % 8 === 0) io.sfx.tone(70 + bike.v * 26, 0.09, "sawtooth", 0.04 + (inp.held.b ? 0.02 : 0));
        const inMud = !bike.air && course.mud.some((m) => m.lane === bike.lane && bike.x + 6 > m.x && bike.x - 6 < m.x + m.w);
        if (inMud && !wasInMud) io.sfx.play("splash");
        wasInMud = inMud;
        if (inMud) {
          top = Math.min(top, 1.3);
          if (frame % 3 === 0 && bike.v > 0.5) bits.push({ x: BIKE_SX - 8, y: bike.y - 2, vx: -1, vy: -1.2, life: 16, c: "#5a3a1e" });
        }
        if (!bike.air) {
          if (bike.v < top) bike.v += top > 3.5 ? 0.07 : 0.05;
          else bike.v -= inMud ? 0.12 : 0.04;
          bike.v -= slope(bike.x) * 0.03;
          bike.v = clamp(bike.v, 0, 4.3);
          if (top > 0 && frame % 4 === 0) dust(BIKE_SX - 10, bike.y - bike.alt, "#e8c89a", 1);
        }
        // lanes (only with wheels down)
        if (!bike.air && bike.laneCool === 0) {
          if (inp.held.up && bike.lane > 0) {
            bike.lane--;
            bike.laneCool = 14;
            io.sfx.play("step");
          } else if (inp.held.down && bike.lane < 3) {
            bike.lane++;
            bike.laneCool = 14;
            io.sfx.play("step");
          }
        }
        // lean in the air (and the bike slowly noses up by itself)
        if (bike.air) {
          bike.airT++;
          if (inp.held.left) bike.pitch += 0.055;
          if (inp.held.right) bike.pitch -= 0.055;
          bike.pitch = clamp(bike.pitch + 0.006, -1.3, 1.3);
        }
        const wasAir = bike.air;
        const res = ride(bike, bike.v);
        if (!wasAir && res === "air") {
          bike.airT = 0;
          io.sfx.play("jump");
        }
        if (res === "land") {
          const diff = Math.abs(bike.pitch - Math.atan(slope(bike.x)));
          if (diff > LAND_OK) tumble(io, "TUMBLE!");
          else {
            bike.squash = 8;
            dust(BIKE_SX, bike.y - bike.alt, "#e8c89a", 6, 1.2);
            io.sfx.play("bounce");
            if (bike.airT > 16) {
              if (diff < 0.18) {
                io.score(300);
                bike.v = Math.min(4.3, bike.v + 0.4);
                bike.heat = Math.max(0, bike.heat - 30);
                say("PERFECT LANDING!", 45);
                io.sfx.play("coin");
              } else io.score(80);
            }
            bike.pitch = Math.atan(slope(bike.x));
          }
        }
        // hay bales
        for (const hb of course.hay) {
          if (hb.gone || hb.lane !== bike.lane || Math.abs(bike.y - LANE_Y[hb.lane]) > 6) continue;
          if (bike.x + 7 > hb.x && bike.x - 7 < hb.x + hb.w && bike.alt < 10) {
            hb.gone = true;
            for (let i = 0; i < 12; i++) bits.push({ x: hb.x - bike.x + BIKE_SX + 7, y: LANE_Y[hb.lane] - 6, vx: r.range(-1.5, 2), vy: -r.range(0.5, 2.5), life: r.int(20, 34), c: r.chance(0.5) ? PAL.yellow : PAL.orange });
            tumble(io, "HAY BALE!");
          }
        }
      }
      bike.wheel += bike.v * 0.3;
      bike.y += clamp(LANE_Y[bike.lane] - bike.y, -2, 2);

      // ── rivals ──
      rivalT--;
      if (rivalT <= 0 && rivals.length < 5 && bike.x < track.len - 700) {
        rivalT = r.int(200, 360);
        const lane = r.int(0, 3);
        rivals.push({ x: bike.x + W, lane, y: LANE_Y[lane], alt: groundH(bike.x + W), vy: 0, air: false, pitch: 0, v: r.range(track.rivalV[0] - 0.4, track.rivalV[1] - 0.3), color: r.pick([PAL.blue, PAL.green, PAL.purple, PAL.teal]), passed: false, t: 0, squash: 0 });
      }
      for (const rv of rivals) {
        rv.t++;
        // steer round hay bales ahead
        if (!rv.air && rv.y === LANE_Y[rv.lane] && course.hay.some((hb) => !hb.gone && hb.lane === rv.lane && hb.x > rv.x && hb.x - rv.x < 70)) {
          const alt = rv.lane === 0 ? 1 : rv.lane === 3 ? 2 : rv.t % 2 ? rv.lane - 1 : rv.lane + 1;
          rv.lane = alt;
        }
        rv.y += clamp(LANE_Y[rv.lane] - rv.y, -1.5, 1.5);
        const res = ride(rv, rv.v);
        if (res === "land") {
          rv.pitch = Math.atan(slope(rv.x));
          rv.squash = 8;
        }
        if (rv.air) rv.pitch = clamp(rv.pitch - 0.02, -0.5, 0.8);
        // bumping a rival from behind slows you down
        if (bike.tumble === 0 && rv.lane === bike.lane && Math.abs(rv.y - bike.y) < 6 && bike.x < rv.x && rv.x - bike.x < 16 && Math.abs(rv.alt - bike.alt) < 10) {
          bike.v = Math.min(bike.v, rv.v * 0.7);
          rv.x += 2;
          if (frame % 10 === 0) io.sfx.play("hit");
        }
        if (!rv.passed && bike.x > rv.x + 16) {
          rv.passed = true;
          io.score(100);
          io.sfx.play("blip");
        }
      }
      rivals = rivals.filter((rv) => rv.x > bike.x - 160 && rv.x < bike.x + 700);

      // ── finish ──
      if (bike.x >= track.len) {
        state = "done";
        stateT = 170;
        const left = Math.ceil(time);
        io.score(1000 + left * 100 + ti * 500);
        io.sfx.play("win");
        io.sfx.play("cheer");
        say(ti >= TRACKS.length - 1 ? "CHAMPION!" : `QUALIFIED! +${left} SEC`, 170);
      }
    },

    draw(g: Gfx) {
      const camX = bike.x - BIKE_SX;
      const gfx = A();
      // dusk sky with a low sun behind the mountains, like the cabinet painting
      g.clear(track.sky[0]);
      g.sprite(gfx.sky, 0, 0);
      drawStrip(g, gfx.clouds, camX * 0.07, 14);
      const sunX = 190 - camX * 0.04;
      g.alpha(0.16);
      g.circle(sunX, 46, 32, track.halo);
      g.alpha(0.28);
      g.circle(sunX, 46, 19, track.halo);
      g.alpha(1);
      g.sprite(gfx.sun, sunX - 13, 33);
      // two parallax silhouette layers: far mountains, then a closer, darker pine treeline
      drawStrip(g, gfx.mountains, camX * 0.12, 58);
      drawStrip(g, gfx.trees, camX * 0.3, 78);
      // a warm glow where the sun meets the land, so the horizon reads hot, not just dark
      for (let y = 92; y < 122; y += 2) {
        g.alpha(0.2 * (1 - (y - 92) / 30));
        g.rect(0, y, W, 2, track.halo);
      }
      g.alpha(1);
      // a wooden rail fence right at the track's edge (gaps show the treeline behind it)
      drawStrip(g, gfx.fence, camX, 109);
      // the dirt track surface: a tiled, textured tile with a worn groove under each lane
      drawStrip(g, gfx.dirt, camX, 122);
      // foreground: dark dirt with grass tufts and stones (not a flat bright-green band)
      drawStrip(g, gfx.ground, camX * 1.2, 190);

      const bikeLane = LANE_Y.reduce((best, y, i) => (Math.abs(y - bike.y) < Math.abs(LANE_Y[best] - bike.y) ? i : best), 0);
      for (let l = 0; l < 4; l++) {
        const base = LANE_Y[l];
        const laneScale = RAMP_LANE_SCALE[l];
        const front = l === 3; // the nearest lane carries the big, dominant mound (like the painting)
        // ramps: a rounded dirt mound, lit at the crest and shaded down to a dark base, scaled
        // smaller for the farther lanes so 4 lanes read as ONE hill in depth, not a solid wall
        for (const p of course.ramps) {
          const x0 = p.x - camX;
          const x1 = x0 + p.up + p.top + p.down;
          if (x1 < -2 || x0 > W + 2) continue;
          for (let sx = Math.max(-1, Math.floor(x0)); sx < Math.min(W + 1, x1 + 1); sx += 2) {
            const gh = groundH(sx + camX);
            if (gh <= 0.5) continue;
            const vh = gh * laneScale;
            const top = base - vh;
            for (let yy = 0; yy < vh + 1; yy += 3) {
              const depthFrac = yy / Math.max(1, vh); // 0 at the lit crest, 1 at the shaded foot
              const n = hash2(Math.floor((sx + camX) / 4), Math.floor((top + yy) / 3), 3 + l);
              const grain = n > 0.82 ? -0.07 : n < 0.18 ? 0.05 : 0;
              g.rect(sx, top + yy, 2, 3, shade(track.dirt, 0.1 - depthFrac * 0.42 + grain + l * 0.02));
            }
            if (front) {
              g.rect(sx, top, 2, 1, "#f2dcae"); // the sunlit crest line
              if (vh > 7 && hash2(Math.floor((sx + camX) / 2), 1, 4) > 0.8) g.rect(sx, top - 2, 2, 2, PAL.green);
            }
          }
        }
        // mud: a dark, glassy puddle with a wet rim and a sunset reflection streak
        for (const m of course.mud) {
          if (m.lane !== l) continue;
          const x = m.x - camX;
          if (x > W || x + m.w < 0) continue;
          for (let sx = Math.max(0, Math.floor(x)); sx < Math.min(W, x + m.w); sx += 2) {
            const rel = (sx - x) / m.w;
            const hh = 2 + Math.sin(rel * Math.PI) * 3.2;
            const n = hash2(Math.floor(sx / 2), Math.floor(m.x), 6);
            g.rect(sx, base - 1 - hh, 2, hh + 2, n > 0.82 ? "#4a3018" : "#20130a");
          }
          for (let k = 0; k < 3; k++) {
            const rx = x + m.w * (0.2 + k * 0.3);
            if (rx > -4 && rx < W + 4) {
              g.rect(rx, base - 4, 5, 1, "#fff3d6");
              g.rect(rx + 1, base - 3, 3, 1, track.halo);
            }
          }
        }
        // finish line
        const fx = track.len - camX;
        if (fx > -10 && fx < W + 10) {
          for (let k = 0; k < 4; k++) g.rect(fx + (k % 2) * 4, base - 10 + k * 3, 4, 3, PAL.black);
          for (let k = 0; k < 4; k++) g.rect(fx + ((k + 1) % 2) * 4, base - 10 + k * 3, 4, 3, PAL.white);
        }
        for (const hb of course.hay)
          if (!hb.gone && hb.lane === l) {
            g.alpha(0.35);
            g.circle(hb.x - camX + 7, base, 8, "#140c28");
            g.alpha(1);
            g.sprite(gfx.hay, hb.x - camX - 4, base - 17);
          }
        for (const rv of rivals)
          if (Math.round((rv.y - LANE_Y[0]) / 16) === l)
            drawBike(g, rv.x - camX, rv.y - rv.alt * laneScale, rv.pitch, rv.color, rv.t * 0.4, 0, rv.squash, gfx.wheelA, gfx.wheelB);
        if (l === bikeLane) {
          const tum = bike.tumble;
          drawBike(g, BIKE_SX, bike.y - bike.alt * laneScale, tum > 0 ? tum * 0.35 : bike.pitch, PAL.red, bike.wheel, tum, bike.squash, gfx.wheelA, gfx.wheelB);
        }
      }
      for (const b of bits) g.rect(b.x, b.y, 2, 2, b.c);
      if (fxInView(track.len - camX)) g.text("FINISH", track.len - camX + 4, 124, PAL.white, { align: "center" });

      // HUD — a framed panel, not just a flat bar
      g.rect(0, 0, W, 22, "rgba(13,11,26,0.68)");
      g.rect(0, 21, W, 1, "rgba(232,200,154,0.4)");
      g.text(`TRACK ${ti + 1}/3 ${track.name}`, 4, 3, PAL.white);
      g.text(`TIME ${time.toFixed(1)}`, W - 4, 3, time < 10 && frame % 20 < 10 ? PAL.red : PAL.yellow, { align: "right" });
      g.text("HEAT", 4, 13, PAL.white);
      g.box(29, 12, 64, 8, "#140c28");
      g.rect(30, 13, 62, 6, PAL.dark);
      const hot = bike.stall > 0 ? (frame % 10 < 5 ? PAL.red : PAL.white) : bike.heat > 75 ? PAL.red : bike.heat > 45 ? PAL.orange : PAL.lime;
      g.rect(31, 14, 60 * (bike.heat / 100), 4, hot);
      // mini course map
      g.box(103, 11, 150, 8, "#140c28");
      g.rect(104, 15, 148, 2, PAL.grey);
      for (const rv of rivals) g.rect(104 + 146 * clamp(rv.x / track.len, 0, 1), 13, 2, 6, rv.color);
      g.rect(104 + 144 * clamp(bike.x / track.len, 0, 1), 12, 4, 8, PAL.red);
      g.rect(250, 12, 2, 8, PAL.white);
      if (state === "count") {
        const n = Math.ceil(stateT / 60);
        g.text(`QUALIFY IN ${track.time} SEC`, W / 2, 44, PAL.white, { align: "center" });
        g.text(`${n}`, W / 2, 58, PAL.yellow, { align: "center", size: 3 });
      }
      if (msgT > 0) g.text(msg, W / 2, 50, state === "fail" ? PAL.red : PAL.yellow, { align: "center", size: msg.length > 12 ? 1 : 2 });
      if (bike.air && bike.tumble === 0 && Math.abs(bike.pitch) > 0.35 && frame % 16 < 10) g.text(bike.pitch > 0 ? "LEAN > !" : "< LEAN !", W / 2, 32, PAL.white, { align: "center" });
    },
  };
}

const fxInView = (x: number) => x > -20 && x < W + 20;

/** a chunky dirt bike + rider, ~2x the size of a plain sketch, rotated by pitch (nose-up positive).
 *  Tyres are baked sprites (knobbly tread, 2 frames fake a spinning wheel); everything else is
 *  procedural so it can still lean continuously in the air. Fenders, a tank/seat, a number plate,
 *  a full-helmet-and-jersey rider with boots, and a squash on landing (0..8, most squashed at 8). */
function drawBike(g: Gfx, cx: number, baseY: number, pitch: number, color: string, wheel: number, tumble: number, squash: number, wheelA: Sprite, wheelB: Sprite) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const fx = c;
  const fy = -s; // forward
  const ux = -s;
  const uy = -c; // up
  const upK = 1 - Math.min(1, squash / 8) * 0.3; // squashed stance right after landing
  const ox = cx;
  const oy = baseY - 7;
  const WB = 17; // wheelbase half-length
  const rear = { x: ox - fx * WB, y: oy - fy * WB };
  const front = { x: ox + fx * WB, y: oy + fy * WB };
  const wsprite = Math.floor(wheel / 0.7) % 2 === 0 ? wheelA : wheelB;
  for (const wh of [rear, front]) g.sprite(wsprite, wh.x - 9.5, wh.y - 9.5);
  // chunky fenders hugging each tyre
  g.circle(rear.x - fx * 1.5, rear.y - 6.5 * upK - fy * 1.5, 4.5, shade(color, -0.2));
  g.circle(rear.x - fx * 1.5, rear.y - 6.5 * upK - fy * 1.5, 3, "#140c28");
  g.circle(front.x + fx * 1.5, front.y - 6.5 * upK + fy * 1.5, 4.5, PAL.white);
  g.circle(front.x + fx * 1.5, front.y - 6.5 * upK + fy * 1.5, 3, "#140c28");
  const seat = { x: ox + ux * 12 * upK - fx * 4, y: oy + uy * 12 * upK - fy * 4 };
  const bars = { x: ox + ux * 17 * upK + fx * 12, y: oy + uy * 17 * upK + fy * 12 };
  // frame: a dark lower rail, a bright coloured top line, chrome forks up front
  g.line(rear.x, rear.y, seat.x, seat.y, shade(color, -0.3));
  g.line(seat.x, seat.y, bars.x, bars.y, color);
  g.line(bars.x, bars.y, front.x, front.y, PAL.grey);
  g.line(bars.x + ux, bars.y + uy, front.x + ux, front.y + uy, "#eef1f6");
  // tank/seat panel with a highlight stripe, and a dark exhaust pipe trailing the rear wheel
  const tx = ox - 4 + ux * 5 * upK;
  const ty = oy - 3 + uy * 5 * upK;
  g.rect(tx, ty, 11, 7, shade(color, -0.1));
  g.rect(tx, ty, 11, 2, shade(color, 0.32));
  g.rect(tx + 1, ty + 2, 9, 1, "#140c28");
  g.rect(rear.x - fx * 3 - 1.5, rear.y - fy * 3 - 1, 5, 3, PAL.dark);
  g.rect(rear.x - fx * 5 - 1.5, rear.y - fy * 5 - 1, 3, 2, "#2a2440");
  // a bright number plate up front
  g.rect(ox + fx * 5 - 1.5, oy + fy * 5 - 3, 6, 5, PAL.white);
  if (tumble > 0) {
    // rider tumbles off in a cartoon roll
    const t = 70 - tumble;
    const rx = cx - 18 - Math.min(t, 30) * 0.5;
    const ry = baseY - 10 - Math.abs(Math.sin(t * 0.25)) * 14;
    g.circle(rx, ry, 8, "#140c28");
    g.circle(rx, ry, 6.6, PAL.white);
    g.circle(rx, ry, 5.3, color);
    g.rect(rx - 2, ry - 2, 4, 4, PAL.cyan);
    if (t % 12 < 6) g.text("*", rx + 8, ry - 17, PAL.yellow);
    return;
  }
  const hip = seat;
  const head = { x: hip.x + ux * 16 * upK + fx * 5, y: hip.y + uy * 16 * upK + fy * 5 };
  // boots on the foot pegs
  g.rect(ox + fx * 2 - 1.5, oy + fy * 2 - 1.5 + uy * 1, 4, 3, "#2a2440");
  // torso: a filled chunky jersey (3 side-by-side strokes) plus a racing stripe down the middle
  for (const k of [-1.4, 0, 1.4]) {
    g.line(hip.x + fx * k, hip.y + fy * k, head.x + fx * k, head.y + fy * k, k === 0 ? shade(color, 0.15) : PAL.white);
  }
  g.line(hip.x + ux * 9 * upK + fx * 3, hip.y + uy * 9 * upK + fy * 3, bars.x, bars.y, PAL.white);
  g.line(hip.x + ux * 9 * upK + fx * 3, hip.y + uy * 9 * upK + fy * 3, bars.x, bars.y, color);
  g.line(hip.x, hip.y, ox + fx * 4, oy, PAL.navy);
  g.line(hip.x + fx * 1.4, hip.y + fy * 1.4, ox + fx * 5.5, oy + fy * 1.4, PAL.navy);
  // a full helmet (dark outline, bright visor, a small shine)
  g.circle(head.x, head.y, 7, "#140c28");
  g.circle(head.x, head.y, 5.8, color);
  g.rect(head.x + fx * 3.4 - 2, head.y + fy * 3.4 - 1.7, 4.2, 3.4, PAL.cyan);
  g.rect(head.x - ux * 3.2 - 1, head.y - uy * 3.2 - 1, 2, 2, PAL.white);
}

export const dirtDash: RetroGameDef = {
  id: "dirt-dash",
  title: "Dirt Dash",
  blurb: "Race dirt bikes over jumps on 3 tracks. Land it level!",
  genre: "Racing",
  emoji: "🏍️",
  color: "#f2c48d",
  controls: "A throttle · B turbo (watch HEAT) · ▲ ▼ change lane · ◀ ▶ lean in the air",
  pad: { dpad: "4", a: "Gas", b: "Turbo" },
  create,
};
