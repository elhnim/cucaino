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
import { H, PAL, W, clamp, dist, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Rng } from "../engine";

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
const KART_ROWS = [
  "..cccc...",
  "..cxxc...",
  "ccccccccc",
  "kccccccck",
  "kccccccck",
  ".cc...cc.",
  "..cwwc...",
  ".cc...cc.",
  "kccccccck",
  "kccccccck",
  ".ccccccc.",
  "..cdddc..",
  "...crc...",
];
const mkPal = (c: string, d: string) => ({ c, d, x: "#bfefff", w: PAL.white, k: PAL.black, r: PAL.red });
const CAR_PALS = [mkPal(PAL.red, "#b8262e"), mkPal(PAL.blue, PAL.navy), mkPal(PAL.green, "#1f8a3a"), mkPal(PAL.purple, "#5a2ea0")];
const KART_SCALE = 2; // draws the 9x13 grid at ~18x26 so a kid can read which way the car's pointing

/** rotate every pixel of a small sprite about its centre and stamp it, so a car can face any angle */
function drawKart(g: Gfx, cx: number, cy: number, heading: number, scale: number) {
  return (pal: Record<string, string>) => {
    const w = KART_ROWS[0].length;
    const h = KART_ROWS.length;
    const phi = heading + Math.PI / 2; // row 0 is the nose, which points "up" in the grid
    const cf = Math.cos(phi);
    const sf = Math.sin(phi);
    const dot = scale * 1.3; // a touch oversized so rotated dots overlap with no gaps
    for (let j = 0; j < h; j++) {
      const row = KART_ROWS[j];
      for (let i = 0; i < w; i++) {
        const ch = row[i];
        if (ch === "." ) continue;
        const col = pal[ch];
        if (!col) continue;
        const lx = (i - (w - 1) / 2) * scale;
        const ly = (j - (h - 1) / 2) * scale;
        const rx = lx * cf - ly * sf;
        const ry = lx * sf + ly * cf;
        g.rect(cx + rx - dot / 2, cy + ry - dot / 2, dot, dot, col);
      }
    }
  };
}

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
}
const THEMES: Theme[] = [
  { name: "MEADOW CUP", bg: "#3ecf55", trackCol: "#6b6f86", kerbA: PAL.red, kerbB: PAL.white, wallCol: "#8a5a2c", decor: "tree", grip: 1, rivalV: [0.72, 0.82], boosts: 2, puddles: 2, jumps: 1 },
  { name: "SANDY SHORES", bg: "#f2c48d", trackCol: "#7a7a82", kerbA: PAL.orange, kerbB: PAL.white, wallCol: "#9a5a32", decor: "palm", grip: 0.95, rivalV: [0.8, 0.9], boosts: 2, puddles: 4, jumps: 1 },
  { name: "FROSTY PEAK", bg: "#eaf6ff", trackCol: "#9fb7c9", kerbA: PAL.red, kerbB: PAL.white, wallCol: "#4a4e6a", decor: "pine", grip: 0.74, rivalV: [0.85, 0.95], boosts: 2, puddles: 1, jumps: 1 },
  { name: "CANDY CITY", bg: "#9aa0b8", trackCol: "#3a3d52", kerbA: PAL.yellow, kerbB: PAL.black, wallCol: "#26306b", decor: "building", grip: 0.97, rivalV: [0.9, 1.0], boosts: 3, puddles: 1, jumps: 1 },
  { name: "DUNE DRIFT", bg: "#e0b060", trackCol: "#8a7050", kerbA: PAL.red, kerbB: PAL.white, wallCol: "#5a3a1e", decor: "cactus", grip: 1, rivalV: [0.95, 1.05], boosts: 4, puddles: 1, jumps: 2 },
  { name: "RAINBOW RUSH", bg: "#1b1535", trackCol: "#3a2d6b", kerbA: PAL.pink, kerbB: PAL.cyan, wallCol: PAL.purple, decor: "star", grip: 1, rivalV: [1.0, 1.12], boosts: 6, puddles: 2, jumps: 2, rainbow: true },
];
const RAINBOW_BAND = [PAL.red, PAL.orange, PAL.yellow, PAL.green, PAL.cyan, PAL.purple];

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
  decor: { x: number; y: number }[];
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

  const pts: TrackPt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    let rad = R0;
    for (let k = 0; k < 3; k++) rad += amp[k] * Math.sin(freq[k] * t + ph[k]);
    const x = Math.cos(t) * rad;
    const y = Math.sin(t) * rad * scaleY;
    const hw = clamp(w0 + wAmp * Math.sin(3 * t + wPh), 32, 96);
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
  const decor = [];
  for (let i = 0; i < N; i += 2) {
    if (!r.chance(0.55)) continue;
    const p = pts[i];
    const side = r.chance(0.5) ? 1 : -1;
    const off = p.hw + GRASS_BAND + r.range(10, 70);
    decor.push({ x: p.x + p.ox * side * off, y: p.y + p.oy * side * off });
  }
  let maxR = 0;
  for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x, p.y));

  const checkpoints: number[] = [];
  for (let k = 1; k < 8; k++) checkpoints.push(Math.round((k / 8) * N) % N);
  const cpRequired = Math.ceil(checkpoints.length * 0.6);

  return { theme, pts, cum, totalLen, N, maxR: maxR + 40, itemBoxes, boosts, puddles, jumps, decor, checkpoints, cpRequired };
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
  const bits: Bit[] = [];
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
    camInit = false;
    nextScoreDist = 300;
    prevPlayerPos = 1;
    state = "count";
    stateT = 160;
    startBoost = false;
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
      say("TURBO!", 40);
    } else if (it === "shield") {
      player.shield = true;
      io.sfx.play("powerup");
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
    state = "result";
    stateT = 150;
  };

  return {
    update(io) {
      if (state === "over" || state === "won") return;
      frame++;
      if (msgT > 0) msgT--;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx;
        b.y += b.vy;
        if (--b.life <= 0) bits.splice(i, 1);
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
      const evs = stepCar(player, steer, gas, brake, track, oils, r);
      for (const e of evs) {
        if (e === "wall") {
          io.sfx.play("hit");
          say("BONK!", 30);
          puff(player.x, player.y, PAL.white, 5);
        } else if (e === "oil") {
          io.sfx.play("bounce");
          say("OIL SLICK!", 40);
        } else if (e === "boost") {
          io.sfx.play("powerup");
        } else if (e === "jump") {
          io.sfx.play("jump");
        } else if (e === "shieldpop") {
          io.sfx.play("blip");
          say("SHIELD BLOCKED IT!", 40);
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
      g.camera(camX - W / 2, camY - H / 2);
      const nearCam = (x: number, y: number, r2: number) => (x - camX) * (x - camX) + (y - camY) * (y - camY) < r2 * r2;

      for (const d of track.decor) if (nearCam(d.x, d.y, 190)) drawDecor(g, d.x, d.y, theme.decor);

      // the road: every point along the centreline stamps a slightly-oversized rim disc, then a
      // true-width surface disc on top — stamping every point (not every other) with that much
      // overlap turns the chain of circles into one smooth ribbon with a crisp, constant-width
      // edge, instead of the scalloped "row of dots" look a sparser pass gives
      // (two passes: every rim disc first, then every surface disc — stamping rim + surface per
      // point let each point's rim paint over the previous point's road, leaving brown ring arcs
      // across the track)
      for (let i = 0; i < track.N; i++) {
        const p = track.pts[i];
        if (nearCam(p.x, p.y, 190)) g.circle(p.x, p.y, p.hw + 4, theme.wallCol);
      }
      for (let i = 0; i < track.N; i++) {
        const p = track.pts[i];
        if (!nearCam(p.x, p.y, 190)) continue;
        const col = theme.rainbow ? RAINBOW_BAND[Math.floor(i / 6) % RAINBOW_BAND.length] : theme.trackCol;
        g.circle(p.x, p.y, p.hw, col);
      }
      // kerbs: small alternating blocks right at the true edge, only through the tight corners
      for (let i = 0; i < track.N; i++) {
        const p = track.pts[i];
        if (!p.kerb || !nearCam(p.x, p.y, 190)) continue;
        const a = i % 2 === 0 ? theme.kerbA : theme.kerbB;
        g.rect(p.x + p.ox * p.hw - 2, p.y + p.oy * p.hw - 2, 4, 4, a);
        g.rect(p.x - p.ox * p.hw - 2, p.y - p.oy * p.hw - 2, 4, 4, a);
      }
      // finish line banner, chequered the full width of the track
      const fp = track.pts[0];
      for (let k = -5; k <= 5; k++) {
        const off = (k / 5) * fp.hw;
        g.rect(fp.x + fp.ox * off - 2, fp.y + fp.oy * off - 2, 4, 4, (k + 5) % 2 ? PAL.black : PAL.white);
      }
      for (const pu of track.puddles) if (nearCam(pu.x, pu.y, 190)) {
        g.alpha(0.6);
        g.circle(pu.x, pu.y, pu.r, "#5ea8d8");
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
      for (const ib of track.itemBoxes)
        if (ib.cd <= 0 && nearCam(ib.x, ib.y, 190)) {
          const bob = Math.sin(frame * 0.12) * 2;
          g.rect(ib.x - 5, ib.y - 5 + bob, 10, 10, PAL.orange);
          g.box(ib.x - 5, ib.y - 5 + bob, 10, 10, PAL.black);
          g.text("?", ib.x, ib.y - 3 + bob, PAL.white, { align: "center" });
        }
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
          g.rect(90, 97 + i * 10, 7, 7, c.pal.c);
          g.text(c.isPlayer ? "YOU" : "RIVAL", 104, 96 + i * 10, c.isPlayer ? PAL.yellow : PAL.grey);
        }
        g.text(resultPos <= 3 ? (ti >= THEMES.length - 1 ? "CUP CHAMPION!" : "NEXT TRACK...") : retries > 0 ? `${retries} RETRY LEFT` : "OUT OF RETRIES", W / 2, 122, PAL.white, { align: "center" });
      }
    },
  };
}

function drawRacer(g: Gfx, c: CarT, frame: number) {
  g.rect(c.x - 7, c.y - 4, 14, 14, "rgba(13,11,26,0.25)");
  // spinning fades the car instead of hiding it outright, so it's never just gone off-screen
  const fading = c.spin > 0 && Math.floor(c.spin / 4) % 2 === 0;
  if (fading) g.alpha(0.4);
  drawKart(g, c.x, c.y, c.heading, KART_SCALE)(c.pal);
  if (fading) g.alpha(1);
  if (c.isPlayer) {
    // a bright pin above the kid's own kart so it's always easy to pick out from the rivals
    const bob = Math.sin(frame * 0.15) * 1.5;
    g.rect(c.x - 1, c.y - 24 + bob, 2, 3, PAL.yellow);
    g.rect(c.x - 2, c.y - 21 + bob, 4, 2, PAL.yellow);
    g.rect(c.x - 3, c.y - 19 + bob, 6, 2, PAL.yellow);
  }
  if (c.shield) {
    g.alpha(0.5);
    g.circle(c.x, c.y, 13 + Math.sin(frame * 0.2) * 1.2, PAL.cyan);
    g.alpha(1);
  }
  if (c.boostT > 0) {
    const fx = Math.cos(c.heading);
    const fy = Math.sin(c.heading);
    g.circle(c.x - fx * 10, c.y - fy * 10, 4, PAL.orange);
  }
}

function drawOil(g: Gfx, x: number, y: number) {
  g.circle(x, y, 7, "#2a2240");
  g.circle(x - 2, y - 1, 2, PAL.purple);
  g.circle(x + 2, y + 2, 1.5, PAL.purple);
}

function drawDecor(g: Gfx, x: number, y: number, kind: Theme["decor"]) {
  if (kind === "tree") {
    g.circle(x + 1, y + 2, 7, "#1f6a2c");
    g.circle(x, y, 7, "#2f9a44");
    g.rect(x - 1, y + 4, 2, 4, "#6b4a2a");
  } else if (kind === "palm") {
    g.rect(x - 1, y - 2, 2, 10, "#9a5a32");
    g.circle(x, y - 6, 6, "#2f9a44");
  } else if (kind === "pine") {
    g.rect(x - 1, y + 2, 2, 5, "#6b4a2a");
    g.circle(x, y - 4, 7, "#1fb3a3");
    g.circle(x, y + 1, 5, "#1fb3a3");
  } else if (kind === "building") {
    g.rect(x - 7, y - 16, 14, 20, "#4a4e6a");
    for (let r0 = 0; r0 < 4; r0++) for (let c0 = 0; c0 < 2; c0++) g.rect(x - 4 + c0 * 6, y - 13 + r0 * 4, 3, 2, PAL.yellow);
  } else if (kind === "cactus") {
    g.rect(x - 1, y - 8, 3, 12, "#3ecf55");
    g.rect(x - 5, y - 4, 4, 3, "#3ecf55");
    g.rect(x + 2, y - 6, 4, 3, "#3ecf55");
  } else {
    // a little 4-point candy star
    g.rect(x - 1, y - 5, 2, 10, PAL.yellow);
    g.rect(x - 5, y - 1, 10, 2, PAL.yellow);
    g.rect(x - 1, y - 1, 2, 2, PAL.white);
  }
}

function drawHud(g: Gfx, track: TrackData, player: CarT, frame: number, retries: number) {
  // two rows so short labels never run into each other (position+lap+retries on row 1, the
  // track name alone on row 2 — a single crowded row used to read as "LAP 1/3MEADOW CUP")
  g.rect(0, 0, W, 20, "rgba(13,11,26,0.65)");
  const ord = player.pos === 1 ? "1ST" : player.pos === 2 ? "2ND" : player.pos === 3 ? "3RD" : "4TH";
  g.text(ord, 4, 3, player.pos === 1 ? PAL.yellow : PAL.white);
  g.text(`LAP ${Math.min(player.lap + 1, LAPS)}/${LAPS}`, 32, 3, PAL.white);
  g.text(`RETRY ${retries}`, W - 4, 3, PAL.grey, { align: "right" });
  g.text(track.theme.name, W / 2, 12, PAL.grey, { align: "center" });
  // item slot, bottom-left
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
  g.rect(cx - 30, cy - 30, 60, 60, "rgba(13,11,26,0.55)");
  g.box(cx - 30, cy - 30, 60, 60, PAL.white);
  for (let i = 0; i < track.N; i += 5) {
    const p = track.pts[i];
    g.rect(cx + p.x * scale - 1, cy + p.y * scale - 1, 2, 2, PAL.grey);
  }
  for (const rv of rivals) g.rect(cx + rv.x * scale - 1, cy + rv.y * scale - 1, 2, 2, rv.pal.c);
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
