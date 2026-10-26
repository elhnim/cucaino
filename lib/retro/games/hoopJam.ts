// HOOP JAM — an over-the-top 2-on-2 arcade basketball game. Move with the D-pad (▲▼ step
// across the court's width, with a touch of perspective — far players look smaller), hold A
// to jump then let go at the TOP of the timing ring for the best shot (get in close and a
// press of A is an automatic flying DUNK!), and press B to dish to your teammate on offence
// or to swipe for a steal/block on defence. Sink 3 in a row and the ball catches fire —
// "SUPER HOT!" — and shots get easier to drain. Win 4 quick quarters to topple a team and
// move up the ladder; beat all 3 to take the trophy. (Original game — made-up animal teams,
// in the spirit of 90s arcade basketball, no real leagues, players or logos.)
import { H, PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type Input, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeShadow, bayer, drawStrip, fbm, hash2, outlined, rgb, shade } from "../art";

// ── court geometry ──
const COURT_L = 40; // left baseline (x)
const COURT_R = 440; // right baseline (x)
const WORLD_W = 480;
const D_TOP = 58; // screen y of the far sideline (depth 0)
const D_BOT = 190; // screen y of the near sideline (depth 1)
const RIM_Z = 56; // rim height above the floor
const DUNK_RANGE = 52;
const THREE_PT_R = 118;
const STEAL_RANGE = 24;
const BLOCK_RANGE = 22;
const DEPTH_UNIT = 150; // how "wide" the court reads in x-equivalent units, for distance math

const GRAVITY = 0.2;
const JUMP_V = 3.5;
const RING_PERIOD = 56; // frames for one up-down sweep of the timing ring
const MAX_CHARGE = 72;
const PASS_DUR = 14;
const REBOUND_DUR = 34;

const QUARTER_FRAMES = 60 * 60; // ~60s quarters
const SHOT_CLOCK_MAX = 17 * 60;

const PLAYER_SPD_X = 1.85;
const PLAYER_SPD_D = 0.023;
const PLAYER_ROWS = 12; // every body sprite is 12 rows tall, feet on the bottom row
const PLAYER_SCALE_FAR = 2.05; // ~25px tall at the far sideline
const PLAYER_SCALE_NEAR = 2.55; // ~31px tall at the near sideline — big and readable on a phone
const BALL_SIZE = 12; // the ball sprite is baked at this size (seams readable, never as big as a player)

// ── palette sampled straight off the cabinet painting (night arena, orange-wood court) ──
const COURT_BG = "#0f0b21";
const COURT_WOOD = "#b4773a";
const ROOF_DARK = "#0a0817";
const ROOF_TRUSS = "#201c3a";
const LIGHT_CORE = "#fffde0";
const LIGHT_GLOW = "#ffe9a0";
const BENCH_WOOD = "#5a3d22";
const PAD_WALL = "#201839"; // the padded wall beyond the baseline — never black, whatever the camera
const AD_COLORS = [PAL.blue, PAL.red, PAL.lime, PAL.purple] as const;
const HUD_H = 22; // a compact jumbotron bar — leaves the rest of the stands fully visible
const BALL_MID = (BALL_SIZE - 1) / 2;
// a few fan colourways so the stands read as a real packed crowd, not a flat band
const HAIR_TONES = ["#2a1c12", "#120d0a", "#caa06a", "#6b4a2a", "#e8e2d8", "#5c3a22"];
const SKIN_TONES = ["#e8b48a", "#caa06a", "#8a5a3a", "#5c3a22", "#f2c48d", "#d99a6c"];
const FAN_SHIRTS = [PAL.blue, PAL.red, PAL.lime, PAL.purple, PAL.yellow, PAL.cyan, PAL.orange, PAL.pink, PAL.teal];
/** hex -> "rgba(r,g,b,a)" so baked/decorative colours can be laid over the court translucently */
function rgba(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

// ── baked backdrop + prop art (built once lazily, never inside draw/update) ──
interface CourtArt {
  floor: Sprite;
  crowdFar: Sprite;
  roof: Sprite;
  bench: Sprite;
  ball: Sprite;
  shadow: Sprite;
}
/** one packed-stands fan: a round head (hair + skin) with dark background showing all round it —
 *  so it reads as a head, not a stripe — sitting above a solid team-coloured shirt, separated by
 *  a dark collar gap. `headR` is the head's radius in px; bigger fans (`headR` ~3) read better
 *  than many thin ones. Built once per cell so the tile reads as a crowd of people. */
function fanCell(cx: number, cy: number, lx: number, ly: number, cellW: number, cellH: number, headR: number, shirts: readonly string[]): string | null {
  const hair = HAIR_TONES[Math.floor(hash2(cx, cy, 31) * HAIR_TONES.length)];
  const skin = SKIN_TONES[Math.floor(hash2(cx, cy, 47) * SKIN_TONES.length)];
  const shirt = shirts[Math.floor(hash2(cx, cy, 61) * shirts.length)];
  const raised = hash2(cx, cy, 83) < 0.28;
  const midX = (cellW - 2) / 2; // centre of the visible columns (the last column is the gap)
  const headCy = headR + 0.5;
  const headBand = Math.ceil(headR * 2) + 1;
  if (ly < headBand) {
    // a genuinely ROUND head: background shows on every side of it, so it never blends into a stripe
    const dx = lx - midX,
      dy = ly - headCy;
    const d = Math.hypot(dx, dy);
    if (d > headR) {
      if (raised && ly === 0 && Math.abs(dx) < 1.2) return shade(shirt, 0.45); // an arm/sign over the row
      return null;
    }
    if (dy < -headR * 0.25) return hair; // hair on top
    return d > headR - 1.1 ? shade(hair, -0.1) : skin; // a skin disc, rimmed by hair at the sides
  }
  const collarRow = headBand;
  if (ly === collarRow) return null; // a dark gap always separates the head from the shoulders
  if (ly === collarRow + 1) return shade(shirt, 0.18); // bright shoulders catch the arena lights
  const bodyRow = ly - (collarRow + 2);
  const last = cellH - (collarRow + 3);
  if (bodyRow === last && Math.abs(lx - midX) < 1) return shade(shirt, -0.28); // a fold down the middle
  return bodyRow % 3 === 0 ? shade(shirt, 0.06) : shirt;
}
function bakeCourtArt(): CourtArt {
  const floorW = COURT_R - COURT_L + 20;
  const floorH = D_BOT - D_TOP;
  const floor = bake(floorW, floorH, (x, y) => {
    const seam = ((x % 40) + 40) % 40;
    const grain = fbm(x * 0.12, y * 0.5, 2, 5);
    let c = shade(COURT_WOOD, (grain - 0.5) * 0.1);
    if (seam === 0) c = shade(c, -0.22);
    else if (seam === 1) c = shade(c, 0.1);
    if (y < 2 || y > floorH - 3) c = shade(c, -0.1); // baseline boards read a touch darker
    // a long glossy shine band, as if catching the arena lights — soft dithered edges, not a slab
    const band = (x * 0.4 + y) % 90;
    if (band < 14) c = shade(c, (1 - Math.abs(band - 7) / 7) * 0.16 * (bayer(x, y) > 0.3 ? 1 : 0.7));
    return c;
  });
  // back tier: small, dim, distant silhouettes — reads as "far away" under the lights, hidden
  // mostly behind the jumbotron so no budget is spent making it individually readable. A wide
  // tile (8 fans) before it repeats, so it never reads as a regular stripe pattern.
  const crowdFar = bake(48, 12, (x, y) => {
    const cellW = 6,
      cellH = 12;
    if (x % cellW === cellW - 1) return null;
    const cx = Math.floor(x / cellW);
    const lx = x % cellW;
    const c = fanCell(cx, 0, lx, y, cellW, cellH, 1.8, FAN_SHIRTS);
    return c ? shade(c, -0.32) : null;
  });
  // arena roof: dark trusses + a couple of bright floodlights with a soft dithered falloff
  const roof = bake(32, 13, (x, y) => {
    const lampX = x % 32 < 16 ? 8 : 24;
    const d = Math.hypot(x - lampX, y - 3);
    if (d < 1.6) return LIGHT_CORE;
    if (d < 6 && 1 - d / 6 > bayer(x, y) * 0.75) return shade(LIGHT_GLOW, (1 - d / 6) * 0.3 - 0.1);
    const truss = (x % 8 === 0 || (x + y) % 11 === 0) && y > 2;
    return truss ? ROOF_TRUSS : ROOF_DARK;
  });
  // courtside team benches + ad boards along the baseline, players' legs implied by the gap below seats
  const bench = bake(48, 18, (x, y) => {
    if (y < 3) {
      // low ad boards behind the bench
      const panel = Math.floor(x / 12) % AD_COLORS.length;
      return y === 0 ? shade(AD_COLORS[panel], -0.35) : AD_COLORS[panel];
    }
    if (y < 5) return shade(BENCH_WOOD, 0.25); // bench seat top
    if (y < 12) {
      // seated figures, spaced out along the bench
      const seatX = x % 8;
      if (seatX >= 2 && seatX <= 5 && y < 10) {
        const cx = Math.floor(x / 8);
        const skin = SKIN_TONES[Math.floor(hash2(cx, 1, 71) * SKIN_TONES.length)];
        const shirt = FAN_SHIRTS[Math.floor(hash2(cx, 1, 73) * FAN_SHIRTS.length)];
        return y < 7 ? skin : shirt;
      }
      return shade(BENCH_WOOD, -0.1);
    }
    return shade(BENCH_WOOD, -0.3); // bench legs / shadow under the seats
  });
  // a bigger ball with real seams: a dark cross plus two curved stitch arcs, lit from upper-left
  const ball = bake(BALL_SIZE, BALL_SIZE, (x, y) => {
    const dx = x - BALL_MID,
      dy = y - BALL_MID;
    const d = Math.hypot(dx, dy);
    const r = BALL_MID + 0.3;
    if (d > r) return null;
    const lit = (-dx - dy) / (r * 1.6); // simple top-left light term, in roughly [-1,1]
    const base = shade(PAL.orange, clamp(lit * 0.35, -0.3, 0.3));
    const onSeam = Math.abs(dx) < 0.55 || Math.abs(dy) < 0.55;
    const arc1 = Math.abs(Math.hypot(dx - r * 0.55, dy) - r * 0.78) < 0.5;
    const arc2 = Math.abs(Math.hypot(dx + r * 0.55, dy) - r * 0.78) < 0.5;
    if (onSeam || arc1 || arc2) return "#3a1c08";
    return d > r - 1 ? shade(base, -0.15) : base; // a dark rim where the ball turns away from us
  });
  const shadow = bakeShadow(18, 8, "rgba(0,0,0,0.38)");
  return { floor, crowdFar, roof, bench, ball, shadow };
}
let COURT_ART: CourtArt | null = null;
const art = () => (COURT_ART ??= bakeCourtArt());
/** the front row of the crowd, right behind the baseline — rebuilt only when the match-up
 *  changes (never per-frame) so the fans can wear THIS match's two team colours. */
function bakeCrowdNear(teamA: string, teamB: string): Sprite {
  // an even mix of both teams' colours plus a neutral fan here and there — and enough unique fans
  // per tile (9, each a full 8px wide) that the repeat never reads as a strict stripe pattern
  const shirts = [teamA, teamB, teamA, teamB, teamA, teamB, PAL.white] as const;
  const cellW = 9,
    cellH = 25;
  return bake(cellW * 9, cellH, (x, y) => {
    if (x % cellW === cellW - 1) return null;
    const cx = Math.floor(x / cellW);
    const lx = x % cellW;
    return fanCell(cx, 1, lx, y, cellW, cellH, 3, shirts);
  });
}

const screenY = (d: number) => D_TOP + d * (D_BOT - D_TOP);
/** small-prop perspective scale (ball, shadows, the net) */
const depthScale = (d: number) => 0.82 + d * 0.36;
/** players are drawn noticeably bigger than everything else so they read clearly on a phone */
const playerScale = (d: number) => PLAYER_SCALE_FAR + d * (PLAYER_SCALE_NEAR - PLAYER_SCALE_FAR);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const worldDist = (ax: number, ad: number, bx: number, bd: number) => Math.hypot(ax - bx, (ad - bd) * DEPTH_UNIT);
/** distance from point (px,pd) to the segment (ax,ad)-(bx,bd), in the same mixed units */
const segDist = (px: number, pd: number, ax: number, ad: number, bx: number, bd: number) => {
  const ay = ad * DEPTH_UNIT,
    by = bd * DEPTH_UNIT,
    py = pd * DEPTH_UNIT;
  const vx = bx - ax,
    vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};

// ── teams: made-up animal squads, no real leagues or logos ──
interface Team {
  name: string;
  jersey: string;
  trim: string;
  speed: number;
  shoot: number;
  defend: number;
}
const KID_TEAM: Team = { name: "BLAZE BADGERS", jersey: PAL.orange, trim: PAL.white, speed: 1.0, shoot: 0.74, defend: 0.6 };
const CPU_TEAMS: Team[] = [
  { name: "THUNDER WOLVES", jersey: PAL.blue, trim: PAL.cyan, speed: 0.92, shoot: 0.54, defend: 0.42 },
  { name: "JUNGLE GORILLAS", jersey: PAL.green, trim: PAL.lime, speed: 1.02, shoot: 0.64, defend: 0.56 },
  { name: "COSMIC YETIS", jersey: PAL.purple, trim: PAL.pink, speed: 1.12, shoot: 0.74, defend: 0.67 },
];

// ── pixel art: one body, recoloured per team; the ball is drawn separately so it can fly ──
const SKIN = PAL.tan;
/** recolour the first/last char of any run of 3+ `target` chars to `hi`/`lo` — gives every flat
 *  patch of skin/jersey/trim a highlight + shadow edge (3-tone shading) without ever changing a
 *  row's length, so the body's silhouette (and hitbox) can never drift. */
function shadeRuns(row: string, target: string, hi: string, lo: string): string {
  const chars = row.split("");
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== target) {
      i++;
      continue;
    }
    let j = i;
    while (j < chars.length && chars[j] === target) j++;
    if (j - i >= 3) {
      chars[i] = hi;
      chars[j - 1] = lo;
    }
    i = j;
  }
  return chars.join("");
}
function teamSprite(rows: string[], jersey: string, trim: string): Sprite {
  const shaded = rows.map((row) => shadeRuns(shadeRuns(shadeRuns(row, "s", "H", "G"), "j", "L", "D"), "t", "T", "U"));
  const pal = {
    k: PAL.black,
    s: SKIN,
    j: jersey,
    t: trim,
    w: PAL.white,
    H: shade(SKIN, 0.22),
    G: shade(SKIN, -0.22),
    L: shade(jersey, 0.22),
    D: shade(jersey, -0.22),
    T: shade(trim, 0.25),
    U: shade(trim, -0.25),
  };
  return outlined(sprite(shaded, pal));
}
const RUN_A = [
  "....tttt.....",
  "...sssssss...",
  "...sksksks...",
  "...sssssss...",
  "....jjj......",
  "..jjjjjjjkkk.",
  "..sjjjjj.....",
  "...jjjjj.....",
  "...ttttt.....",
  "...ss.ss.....",
  "..ss...ss....",
  "..kk...kk....",
];
const RUN_B = [...RUN_A.slice(0, 8), "...jjjjj.....", "....jjj......", "....jjj......", "....kkk......"];
const JUMP_ROWS = [
  "......k......",
  "...tttt......",
  "..ssssssk....",
  "...sksksk....",
  "...sssss.....",
  "....jjjj.....",
  "..jjjjjj.....",
  "..sjjjjj.....",
  "...jjjjj.....",
  "...ttttt.....",
  "..ss...ss....",
  "..kk...kk....",
];
const DUNK_ROWS = [
  "..k......k...",
  "...tttt......",
  "..ssssssss...",
  "...sksksks...",
  "...sssssss...",
  "..jjjjjjjjj..",
  "..jjjjjjjjj..",
  "..sjjjjjjjs..",
  "...jjjjjjj...",
  "...ttttttt...",
  "..sss...sss..",
  "..kkk...kkk..",
];
const DEFEND_ROWS = [
  "...tttt......",
  "..sssssss....",
  "...sksksks...",
  "..jjjjjjjjj..",
  ".jjjjjjjjjjj.",
  "..sjjjjjjjs..",
  "...jjjjjjj...",
  "...ttttttt...",
  "..ss.....ss..",
  "..kk.....kk..",
];
interface SpriteSet {
  run: [Sprite, Sprite];
  jump: Sprite;
  dunk: Sprite;
  defend: Sprite;
}
function buildSprites(team: Team): SpriteSet {
  return {
    run: [teamSprite(RUN_A, team.jersey, team.trim), teamSprite(RUN_B, team.jersey, team.trim)],
    jump: teamSprite(JUMP_ROWS, team.jersey, team.trim),
    dunk: teamSprite(DUNK_ROWS, team.jersey, team.trim),
    defend: teamSprite(DEFEND_ROWS, team.jersey, team.trim),
  };
}
const KID_SPRITES = buildSprites(KID_TEAM);

// ── player + ball state ──
type PState = "run" | "jump" | "dunk";
interface Ply {
  team: 0 | 1;
  x: number;
  d: number;
  z: number;
  vz: number;
  facing: 1 | -1;
  animT: number;
  state: PState;
  shotT: number;
  isDunkAttempt: boolean;
  released: boolean;
  ringVal: number;
  coolSteal: number;
  coolAi: number;
  num: number;
}
function makePlayer(team: 0 | 1, x: number, d: number, num: number): Ply {
  return { team, x, d, z: 0, vz: 0, facing: team === 0 ? 1 : -1, animT: 0, state: "run", shotT: 0, isDunkAttempt: false, released: false, ringVal: 0, coolSteal: 0, coolAi: 0, num };
}

type BMode = "held" | "pass" | "shotFlight" | "rebound";
interface Ball {
  x: number;
  d: number;
  z: number;
  mode: BMode;
  holder: Ply | null;
  from: { x: number; d: number };
  to: { x: number; d: number };
  t: number;
  dur: number;
  targetTeam: 0 | 1;
  willMake: boolean;
  points: 2 | 3;
  isDunk: boolean;
  passTo: Ply | null;
  interceptChance: number;
  reboundTeamFavor: 0 | 1;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

function create(seed: number): GameInstance {
  const A = art();
  const r = rng(seed);
  let frame = 0;
  let ti = 0;
  let opp: Team = CPU_TEAMS[0];
  let cpuSprites: SpriteSet = buildSprites(opp);
  // the front crowd row is rebaked (not per-frame — only between matches) so the fans wear
  // THIS match's two team colours instead of a generic rainbow
  let crowdNear: Sprite = bakeCrowdNear(KID_TEAM.jersey, opp.jersey);
  // a couple of frames of wobble on the backboard the shot just hit — [left hoop, right hoop]
  const rimShake: [number, number] = [0, 0];

  const kid: [Ply, Ply] = [makePlayer(0, 240, 0.5, 23), makePlayer(0, 200, 0.3, 11)];
  const cpu: [Ply, Ply] = [makePlayer(1, 240, 0.5, 7), makePlayer(1, 280, 0.7, 9)];
  const players = [kid[0], kid[1], cpu[0], cpu[1]];

  const ball: Ball = {
    x: 240,
    d: 0.5,
    z: 0,
    mode: "held",
    holder: kid[0],
    from: { x: 0, d: 0.5 },
    to: { x: 0, d: 0.5 },
    t: 0,
    dur: 1,
    targetTeam: 0,
    willMake: false,
    points: 2,
    isDunk: false,
    passTo: null,
    interceptChance: 0,
    reboundTeamFavor: 0,
  };

  let state: "intro" | "play" | "qend" | "final" | "won" | "lost" = "intro";
  let stateT = 140;
  let quarter = 1;
  let clock = QUARTER_FRAMES;
  let shotClock = SHOT_CLOCK_MAX;
  let kidScore = 0;
  let oppScore = 0;
  let streak = 0;
  let onFire = false;
  let msg = `VS ${opp.name}`;
  let msgT = 140;
  let shake = 0;
  let prevHeldA = false;
  const sparks: Spark[] = [];
  const stars: { x: number; y: number; life: number; max: number }[] = [];
  // crowd goes wild for a few seconds after any basket: arms/signs wave and the flashbulbs pop
  let hypeT = 0;

  const burst = (x: number, y: number, c: string, n = 10) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: r.range(-2.2, 2.2), vy: r.range(-2.6, 1), life: r.int(14, 26), c });
  };
  // a little low, slow puff of court dust at a sprinting sneaker — never a shower of sparks
  const dustPuff = (x: number, y: number) => {
    sparks.push({ x, y, vx: r.range(-0.5, 0.5), vy: r.range(-0.5, -0.05), life: r.int(10, 16), c: "rgba(210,180,135,0.5)" });
  };
  // a little twinkling sparkle (never a circle) for a clean swish
  const sparkle = (x: number, y: number, n = 5) => {
    for (let i = 0; i < n; i++) stars.push({ x: x + r.range(-10, 10), y: y + r.range(-6, 10), life: r.int(16, 26), max: 26 });
  };

  // ── formation / possession ──
  function formation(offenseTeam: 0 | 1) {
    const midX = (COURT_L + COURT_R) / 2;
    const off = offenseTeam === 0 ? kid : cpu;
    const def = offenseTeam === 0 ? cpu : kid;
    const sign = offenseTeam === 0 ? -1 : 1;
    off[0].x = midX + sign * 20;
    off[0].d = 0.5;
    off[1].x = midX + sign * 70;
    off[1].d = offenseTeam === 0 ? 0.25 : 0.75;
    def[0].x = midX - sign * 50;
    def[0].d = 0.5;
    def[1].x = midX - sign * 90;
    def[1].d = offenseTeam === 0 ? 0.75 : 0.25;
    for (const p of players) {
      p.z = 0;
      p.vz = 0;
      p.state = "run";
      p.shotT = 0;
      p.released = false;
    }
  }
  function setPossession(team: 0 | 1, handler?: Ply) {
    ball.holder = handler ?? (team === 0 ? kid[0] : cpu[0]);
    ball.mode = "held";
    ball.t = 0;
    shotClock = SHOT_CLOCK_MAX;
    formation(team);
  }
  function newMatch() {
    opp = CPU_TEAMS[ti];
    cpuSprites = buildSprites(opp);
    crowdNear = bakeCrowdNear(KID_TEAM.jersey, opp.jersey);
    quarter = 1;
    clock = QUARTER_FRAMES;
    kidScore = 0;
    oppScore = 0;
    streak = 0;
    onFire = false;
    state = "intro";
    stateT = 140;
    msg = `VS ${opp.name}`;
    msgT = 140;
    setPossession(0);
  }
  newMatch();

  // ── shooting ──
  function startShotCharge(p: Ply, isDunk: boolean) {
    p.state = isDunk ? "dunk" : "jump";
    p.shotT = 0;
    p.vz = JUMP_V;
    p.isDunkAttempt = isDunk;
    p.released = false;
    p.ringVal = 0;
  }
  function resolveShot(p: Ply, qualityBase: number, isDunk: boolean, io: IO) {
    if (ball.holder !== p) return;
    const team = p.team;
    const hoopX = team === 0 ? COURT_R : COURT_L;
    const d2hoop = worldDist(p.x, p.d, hoopX, 0.5);
    const isThree = !isDunk && d2hoop > THREE_PT_R;
    const defs = team === 0 ? cpu : kid;
    const nearestDef = Math.min(worldDist(p.x, p.d, defs[0].x, defs[0].d), worldDist(p.x, p.d, defs[1].x, defs[1].d));
    const contest = nearestDef < 28 ? ((28 - nearestDef) / 28) * 0.38 : 0;
    const skill = team === 0 ? KID_TEAM.shoot : opp.shoot;
    let quality = qualityBase * 0.7 + skill * 0.5 - contest - 0.08;
    if (onFire && team === 0) quality += 0.3;
    if (isThree) quality *= 0.86;
    quality = clamp(quality, 0.04, 0.95);
    const made = isDunk ? r.chance(clamp(quality + 0.25, 0.55, 0.97)) : r.chance(quality);
    ball.mode = "shotFlight";
    ball.holder = null;
    ball.t = 0;
    ball.dur = isDunk ? 16 : 30;
    ball.from = { x: p.x, d: p.d };
    const missOff = made ? { x: 0, d: 0 } : { x: r.range(-30, 30), d: r.range(-0.16, 0.16) };
    ball.to = { x: hoopX + missOff.x, d: clamp(0.5 + missOff.d, 0.05, 0.95) };
    ball.points = isDunk ? 2 : isThree ? 3 : 2;
    ball.willMake = made;
    ball.targetTeam = team;
    ball.isDunk = isDunk;
    io.sfx.play(isDunk ? "jump" : "shoot");
    if (isThree) io.sfx.noise?.(16, 0.2, 2600, 900);
  }
  function updateShotAnim(p: Ply, io: IO, isHuman: boolean, humanReleased: boolean) {
    p.shotT++;
    p.z += p.vz;
    p.vz -= GRAVITY;
    if (!p.released) {
      if (p.isDunkAttempt) {
        if (p.shotT >= 12) {
          p.released = true;
          resolveShot(p, 0.92, true, io);
        }
      } else {
        const phase = (p.shotT % RING_PERIOD) / RING_PERIOD;
        p.ringVal = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
        let release = p.shotT >= MAX_CHARGE;
        if (isHuman) {
          if (humanReleased) release = true;
        } else if (p.shotT > 10 && r.chance(0.1)) release = true;
        if (release) {
          p.released = true;
          resolveShot(p, p.ringVal, false, io);
        }
      }
    }
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
      if (p.released) p.state = "run";
    }
  }

  // ── passing / steals / blocks ──
  function startPass(p: Ply, io: IO) {
    const mate = p.team === 0 ? (p === kid[0] ? kid[1] : kid[0]) : p === cpu[0] ? cpu[1] : cpu[0];
    const opps = p.team === 0 ? cpu : kid;
    const nearestOpp = Math.min(segDist(opps[0].x, opps[0].d, p.x, p.d, mate.x, mate.d), segDist(opps[1].x, opps[1].d, p.x, p.d, mate.x, mate.d));
    const oppSkill = p.team === 0 ? opp.defend : KID_TEAM.defend;
    ball.interceptChance = nearestOpp < 42 ? clamp(((42 - nearestOpp) / 42) * oppSkill * 0.7, 0, 0.55) : 0;
    ball.mode = "pass";
    ball.holder = null;
    ball.from = { x: p.x, d: p.d };
    ball.to = { x: mate.x, d: mate.d };
    ball.t = 0;
    ball.dur = PASS_DUR;
    ball.passTo = mate;
    ball.targetTeam = p.team;
    io.sfx.play("blip");
  }
  function blockShot(h: Ply, p: Ply, io: IO) {
    h.state = "run";
    h.released = true;
    h.z = 0;
    h.vz = 0;
    setPossession(p.team, p);
    msg = "BLOCKED!";
    msgT = 50;
    shake = 10;
    io.sfx.play("explode");
    io.score(p.team === 0 ? 75 : 0);
    burst(h.x, screenY(h.d) - 30, PAL.white, 12);
  }
  function attemptSteal(p: Ply, io: IO) {
    if (p.coolSteal > 0) return;
    if (!ball.holder || ball.mode !== "held" || ball.holder.team === p.team) {
      p.coolSteal = 10;
      return;
    }
    const h = ball.holder;
    p.coolSteal = 22;
    const dist = worldDist(p.x, p.d, h.x, h.d);
    const mySkill = p.team === 0 ? KID_TEAM.defend : opp.defend;
    if (h.state === "jump" || h.state === "dunk") {
      if (dist < BLOCK_RANGE) {
        const chance = clamp(0.5 - (dist / BLOCK_RANGE) * 0.25 + mySkill * 0.3, 0.08, 0.8);
        if (r.chance(chance)) blockShot(h, p, io);
      }
      return;
    }
    if (dist < STEAL_RANGE) {
      const chance = clamp(0.4 - (dist / STEAL_RANGE) * 0.2 + mySkill * 0.25, 0.06, 0.6);
      if (r.chance(chance)) {
        ball.holder = p;
        shotClock = SHOT_CLOCK_MAX;
        msg = "STEAL!";
        msgT = 40;
        io.sfx.play("pop");
        io.score(p.team === 0 ? 50 : 0);
        burst(p.x, screenY(p.d) - 20, PAL.yellow, 8);
      } else io.sfx.play("blip");
    }
  }

  // ── basket resolution ──
  function madeBasket(io: IO) {
    const team = ball.targetTeam;
    if (team === 0) {
      kidScore += ball.points;
      streak++;
      const justCaughtFire = streak >= 3 && !onFire;
      if (streak >= 3) onFire = true;
      io.score(ball.points * 100 + (ball.isDunk ? 150 : 0));
      io.sfx.play(ball.isDunk ? "explode" : "win");
      io.sfx.play("cheer");
      io.sfx.noise?.(42, 0.3, 380, 900); // the crowd roars
      if (justCaughtFire) io.sfx.play("powerup");
      hypeT = 70;
    } else {
      oppScore += ball.points;
      io.sfx.play("coin");
      io.sfx.noise?.(18, 0.16, 260, 220); // a smaller, disappointed murmur
      hypeT = Math.max(hypeT, 30);
    }
    shake = ball.isDunk ? 14 : 5;
    msg = ball.isDunk ? "SLAM DUNK!" : ball.points === 3 ? "SPLASH! 3PT!" : "SWISH!";
    msgT = 60;
    const hoopX = team === 0 ? COURT_R : COURT_L;
    burst(hoopX, screenY(0.5) - RIM_Z, team === 0 ? PAL.yellow : PAL.red, ball.isDunk ? 18 : 10);
    if (!ball.isDunk) sparkle(hoopX, screenY(0.5) - RIM_Z - 6, 6);
    setPossession(team === 0 ? 1 : 0);
  }

  // ── AI ──
  function moveToward(p: Ply, tx: number, td: number, spd: number) {
    const dx = clamp(tx - p.x, -spd, spd);
    const dd = clamp(td - p.d, -spd * 0.013, spd * 0.013);
    p.x = clamp(p.x + dx, COURT_L + 6, COURT_R - 6);
    p.d = clamp(p.d + dd, 0, 1);
    if (Math.abs(dx) > 0.05) p.facing = dx > 0 ? 1 : -1;
    if (Math.abs(dx) > 0.05 || Math.abs(dd) > 0.001) p.animT += 0.16;
    else p.animT = 0;
  }
  function defendAI(p: Ply) {
    const opps = p.team === 0 ? cpu : kid;
    const mine = p.team === 0 ? kid : cpu;
    const myIdx = mine[0] === p ? 0 : 1;
    const mark = opps[myIdx];
    const ownHoopX = p.team === 0 ? COURT_L : COURT_R;
    const dir = ownHoopX < mark.x ? -1 : 1;
    const spd = PLAYER_SPD_X * 0.95 * (p.team === 0 ? KID_TEAM.speed : opp.speed);
    moveToward(p, clamp(mark.x + dir * 14, COURT_L + 6, COURT_R - 6), mark.d, spd);
  }
  function offSupportAI(p: Ply) {
    const hoopX = p.team === 0 ? COURT_R : COURT_L;
    const dir = p.team === 0 ? -1 : 1;
    const handler = ball.holder;
    const td = handler ? (handler.d > 0.5 ? 0.18 : 0.82) : 0.5;
    const spd = PLAYER_SPD_X * 0.9 * (p.team === 0 ? KID_TEAM.speed : opp.speed);
    moveToward(p, clamp(hoopX + dir * 85, COURT_L + 16, COURT_R - 16), td, spd);
  }
  function cpuBallHandlerAI(p: Ply, io: IO) {
    const hoopX = COURT_L;
    const dist = worldDist(p.x, p.d, hoopX, 0.5);
    const nearestDef = Math.min(worldDist(p.x, p.d, kid[0].x, kid[0].d), worldDist(p.x, p.d, kid[1].x, kid[1].d));
    p.coolAi = Math.max(0, p.coolAi - 1);
    if (p.coolAi === 0 && dist < DUNK_RANGE && r.chance(0.07 + opp.shoot * 0.04)) {
      p.coolAi = 40;
      startShotCharge(p, true);
      return;
    }
    if (p.coolAi === 0 && dist < THREE_PT_R * 0.85 && nearestDef > 26 && r.chance(0.015 + opp.shoot * 0.03)) {
      p.coolAi = 40;
      startShotCharge(p, false);
      return;
    }
    if (p.coolAi === 0 && nearestDef < 22 && r.chance(0.3)) {
      p.coolAi = 30;
      startPass(p, io);
      return;
    }
    const jukeD = nearestDef < 36 ? (p.d > 0.5 ? -1 : 1) : 0;
    moveToward(p, hoopX + 28, clamp(0.5 + jukeD * 0.3, 0.08, 0.92), PLAYER_SPD_X * opp.speed);
  }
  function humanMove(p: Ply, inp: Input) {
    let dx = 0,
      dd = 0;
    if (inp.held.left) dx -= 1;
    if (inp.held.right) dx += 1;
    if (inp.held.up) dd -= 1;
    if (inp.held.down) dd += 1;
    p.x = clamp(p.x + dx * PLAYER_SPD_X, COURT_L + 6, COURT_R - 6);
    p.d = clamp(p.d + dd * PLAYER_SPD_D, 0, 1);
    if (dx) p.facing = dx > 0 ? 1 : -1;
    if (dx || dd) p.animT += 0.18;
    else p.animT = 0;
  }
  function controlledKid(): Ply {
    if (ball.holder && ball.holder.team === 0 && ball.mode === "held") return ball.holder;
    const bx = ball.holder ? ball.holder.x : ball.x;
    const bd = ball.holder ? ball.holder.d : ball.d;
    return worldDist(kid[0].x, kid[0].d, bx, bd) <= worldDist(kid[1].x, kid[1].d, bx, bd) ? kid[0] : kid[1];
  }

  // ── ball flight ──
  function updatePass(io: IO) {
    ball.t++;
    const u = clamp(ball.t / ball.dur, 0, 1);
    ball.x = lerp(ball.from.x, ball.to.x, u);
    ball.d = lerp(ball.from.d, ball.to.d, u);
    ball.z = Math.sin(Math.PI * u) * 14;
    if (ball.t >= ball.dur) {
      if (r.chance(ball.interceptChance)) {
        const opps = ball.targetTeam === 0 ? cpu : kid;
        const stealer = worldDist(opps[0].x, opps[0].d, ball.x, ball.d) <= worldDist(opps[1].x, opps[1].d, ball.x, ball.d) ? opps[0] : opps[1];
        ball.holder = stealer;
        ball.mode = "held";
        shotClock = SHOT_CLOCK_MAX;
        msg = "INTERCEPTED!";
        msgT = 40;
        io.sfx.play("hit");
      } else {
        ball.holder = ball.passTo;
        ball.mode = "held";
      }
    }
  }
  function updateShotFlight(io: IO) {
    ball.t++;
    const u = clamp(ball.t / ball.dur, 0, 1);
    ball.x = lerp(ball.from.x, ball.to.x, u);
    ball.d = lerp(ball.from.d, ball.to.d, u);
    const peak = ball.isDunk ? 42 : 74;
    ball.z = Math.sin(Math.PI * u) * peak + 8;
    if (ball.t >= ball.dur) {
      if (ball.willMake) madeBasket(io);
      else {
        if (ball.targetTeam === 0) {
          streak = 0;
          onFire = false;
        }
        const defendingTeam: 0 | 1 = ball.targetTeam === 0 ? 1 : 0;
        ball.reboundTeamFavor = r.chance(0.58) ? defendingTeam : ball.targetTeam;
        ball.mode = "rebound";
        ball.t = 0;
        ball.dur = REBOUND_DUR;
        msg = "OFF THE RIM!";
        msgT = 30;
        io.sfx.play("bounce");
        io.sfx.tone(240, 70, "square", 0.22); // a metallic clang off the rim
        shake = Math.max(shake, 5);
        rimShake[ball.targetTeam === 0 ? 1 : 0] = 10;
      }
    }
  }
  function updateRebound(io: IO) {
    ball.t++;
    ball.z = Math.abs(Math.sin(ball.t * 0.5)) * Math.max(0, 16 - ball.t);
    if (ball.t >= ball.dur) {
      setPossession(ball.reboundTeamFavor);
      msg = ball.reboundTeamFavor === 0 ? "KID BALL!" : "REBOUND";
      msgT = 30;
      void io;
    }
  }

  function advanceQuarter() {
    quarter++;
    if (quarter > 4) {
      if (kidScore === oppScore) kidScore++; // a tie goes the kid's way — the home crowd roars
      state = "final";
      stateT = 170;
      return;
    }
    clock = QUARTER_FRAMES;
    setPossession(quarter % 2 === 1 ? 0 : 1);
    state = "play";
  }
  function enterFinal(io: IO) {
    if (kidScore > oppScore) {
      io.sfx.play("win");
      msg = ti >= CPU_TEAMS.length - 1 ? "CHAMPIONS!" : `YOU BEAT ${opp.name}!`;
      io.score(1000 * (ti + 1));
    } else {
      io.sfx.play("die");
      msg = `${opp.name} WIN THE GAME`;
    }
    msgT = 170;
  }
  function afterFinal(io: IO) {
    if (kidScore > oppScore) {
      if (ti >= CPU_TEAMS.length - 1) {
        state = "won";
        io.win();
      } else {
        ti++;
        newMatch();
      }
    } else {
      state = "lost";
      io.gameOver();
    }
  }

  let finalAnnounced = false;

  return {
    update(io: IO) {
      frame++;
      if (shake > 0) shake--;
      if (msgT > 0) msgT--;
      if (hypeT > 0) hypeT--;
      if (rimShake[0] > 0) rimShake[0]--;
      if (rimShake[1] > 0) rimShake[1]--;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        if (--s.life <= 0) sparks.splice(i, 1);
      }
      for (let i = stars.length - 1; i >= 0; i--) if (--stars[i].life <= 0) stars.splice(i, 1);

      if (state === "intro") {
        stateT--;
        if (stateT <= 0) state = "play";
        return;
      }
      if (state === "qend") {
        stateT--;
        if (stateT <= 0) advanceQuarter();
        return;
      }
      if (state === "final") {
        if (!finalAnnounced) {
          finalAnnounced = true;
          enterFinal(io);
        }
        stateT--;
        if (stateT <= 0) {
          finalAnnounced = false;
          afterFinal(io);
        }
        return;
      }
      if (state === "won" || state === "lost") return;

      // ── live quarter ──
      clock--;
      if (ball.mode === "held") shotClock--;
      if (clock <= 0) {
        state = "qend";
        stateT = 80;
        msg = quarter <= 4 ? `END OF Q${quarter}` : "END OF OT";
        msgT = 80;
        io.sfx.noise?.(26, 0.3, 700, 180);
        return;
      }
      if (ball.mode === "held" && shotClock <= 0 && ball.holder) {
        const t = ball.holder.team;
        msg = "SHOT CLOCK!";
        msgT = 40;
        setPossession(t === 0 ? 1 : 0);
      }

      const inp = io.input;
      const human = controlledKid();
      const humanReleased = prevHeldA && !inp.held.a;
      let offenseTeam: 0 | 1 | null = null;
      if (ball.mode === "held" && ball.holder) offenseTeam = ball.holder.team;
      else if (ball.mode === "pass" || ball.mode === "shotFlight") offenseTeam = ball.targetTeam;

      for (const p of players) {
        if (p.state === "jump" || p.state === "dunk") {
          updateShotAnim(p, io, p === human, humanReleased);
          continue;
        }
        const amOffense = offenseTeam !== null && offenseTeam === p.team;
        if (p === human) {
          if (ball.holder === p && ball.mode === "held") {
            if (inp.pressed.a) {
              const hoopX = p.team === 0 ? COURT_R : COURT_L;
              startShotCharge(p, worldDist(p.x, p.d, hoopX, 0.5) < DUNK_RANGE);
            } else if (inp.pressed.b) startPass(p, io);
            else humanMove(p, inp);
          } else {
            humanMove(p, inp);
            if (!amOffense && inp.pressed.b) attemptSteal(p, io);
          }
        } else if (p.team === 0) {
          if (amOffense) offSupportAI(p);
          else {
            defendAI(p);
            if (r.chance(0.01)) attemptSteal(p, io);
          }
        } else {
          if (ball.holder === p && ball.mode === "held") cpuBallHandlerAI(p, io);
          else if (amOffense) offSupportAI(p);
          else {
            defendAI(p);
            if (ball.holder && ball.holder.team === 0 && r.chance(0.015 * opp.defend)) attemptSteal(p, io);
          }
        }
        if (p.coolSteal > 0) p.coolSteal--;
        // sneaker dust while sprinting on the court — small, throttled, never a shower
        if (p.state === "run" && p.animT > 0 && (frame + Math.floor(p.x)) % 11 === 0) dustPuff(p.x, screenY(p.d));
      }
      if (human.state === "run" && human.animT > 0 && frame % 16 === 0) {
        io.sfx.play("step");
        io.sfx.slide?.(1500, 2200, 35, "triangle", 0.1); // a quick sneaker squeak on the hardwood
      }
      if (ball.mode === "held" && ball.holder?.state === "run" && ball.holder.animT > 0 && frame % 14 === 0) io.sfx.tone(140, 30, "sine", 0.1);

      if (ball.mode === "pass") updatePass(io);
      else if (ball.mode === "shotFlight") updateShotFlight(io);
      else if (ball.mode === "rebound") updateRebound(io);
      else if (ball.holder) {
        ball.x = ball.holder.x;
        ball.d = ball.holder.d;
        ball.z = ball.holder.z;
      }

      prevHeldA = inp.held.a;
    },

    draw(g: Gfx) {
      const camX = clamp(ball.x - W / 2, 0, WORLD_W - W);
      const sx = shake > 0 ? (frame % 2 ? 2 : -2) : 0;

      g.clear(ROOF_DARK);
      // arena roof — dark trusses + a couple of bright floodlights, soft dithered falloff
      // (mostly hidden behind the compact jumbotron, which is fine — it's meant to feel distant)
      drawStrip(g, A.roof, camX * 0.1, 0, W);
      drawStrip(g, A.crowdFar, camX * 0.2, HUD_H, W);
      // the near tier sits right behind the baseline, fully visible, heads-and-shoulders readable
      drawStrip(g, crowdNear, camX * 0.4, D_TOP - 25, W);
      // two floodlight beams glowing down onto the stands — a small source + soft falloff
      for (const lx of [W * 0.28, W * 0.72]) {
        g.circle(lx, HUD_H + 4, 3, "rgba(255,253,224,0.45)");
        g.circle(lx, HUD_H + 4, 6, "rgba(255,233,160,0.16)");
      }
      // the crowd goes wild after a basket: arms and signs pump, flashbulbs pop
      if (hypeT > 0) {
        const hp = hypeT / 70;
        const span = W + 20;
        for (let i = 0; i < 9; i++) {
          let fx = (i * 28 + 14 - camX * 0.4) % span;
          if (fx < 0) fx += span;
          fx -= 10;
          const bob = Math.abs(Math.sin(frame * 0.6 + i * 1.7)) * 7 * hp;
          const fy = D_TOP - 10 - (i % 3) * 7 - bob;
          g.line(fx, fy + 7, fx, fy, shade(FAN_SHIRTS[i % FAN_SHIRTS.length], 0.25));
        }
      }
      const flashChance = hypeT > 0 ? 0.1 : 0.012;
      for (let i = 0; i < 4; i++) {
        if (hash2(Math.floor(frame / 3), i, 97) < flashChance) {
          const fx = hash2(i, Math.floor(frame / 3), 5) * W;
          const fy = HUD_H + 2 + hash2(i, Math.floor(frame / 3), 9) * (D_TOP - HUD_H - 4);
          g.circle(fx, fy, 1.4, "rgba(255,255,255,0.9)");
        }
      }
      g.rect(0, D_TOP - 1, W, 1, "rgba(10,8,24,0.8)");
      // courtside benches + ad boards along the baseline — drawn here, in screen space with the
      // SAME scroll as the floor below, so the tiled strip always fills the full width (a sprite
      // tiled by drawStrip must never be drawn again inside an active g.camera() shift)
      drawStrip(g, A.bench, camX + sx, D_BOT + 2, W);

      g.camera(camX + sx, 0);
      // a padded wall behind the baseline, full world width — the court floor never leaves a
      // black void when the camera reaches either end of the arena (cheap flat fill, no per-pixel loop)
      g.rect(-20, D_TOP, WORLD_W + 40, D_BOT - D_TOP, PAD_WALL);
      g.rect(-20, D_TOP, WORLD_W + 40, 4, shade(PAD_WALL, 0.15));
      // court floor — one baked wood sprite (grain, plank seams, darker baseline boards)
      g.sprite(A.floor, COURT_L - 10, D_TOP);
      g.rect(COURT_L - 10, D_TOP, COURT_R - COURT_L + 20, 3, PAL.white);
      g.rect(COURT_L - 10, D_BOT - 3, COURT_R - COURT_L + 20, 3, PAL.white);
      const midX = (COURT_L + COURT_R) / 2;
      g.rect(midX - 1, D_TOP, 2, D_BOT - D_TOP, PAL.white);
      // centre-court logo: painted FLAT into the wood, like a stain under varnish — a thin ring
      // and a simple paw-print emblem, both just a shade off the floor colour, no shading, no ball
      // (never the ball sprite itself: a kid must never mistake this for the live ball)
      {
        const lcy = screenY(0.5);
        const ink = shade(COURT_WOOD, 0.13);
        g.circle(midX, lcy, 19, ink);
        g.circle(midX, lcy, 17, COURT_WOOD); // punches the ring hollow, leaving a thin painted edge
        g.circle(midX, lcy + 3, 4.5, ink); // paw pad
        for (const [ox, oy] of [
          [-4.5, -3],
          [-1.6, -5.5],
          [1.6, -5.5],
          [4.5, -3],
        ])
          g.circle(midX + ox, lcy + oy, 2.1, ink); // four toes
      }
      // key + 3pt arc + restricted-area cross at each hoop — each key painted in its team's colour
      for (const side of [-1, 1] as const) {
        const hoopX = side > 0 ? COURT_R : COURT_L;
        const keyTeam = side > 0 ? KID_TEAM : opp;
        g.rect(side > 0 ? hoopX - 46 : hoopX, screenY(0.22), 46, screenY(0.78) - screenY(0.22), rgba(keyTeam.jersey, 0.22));
        g.box(side > 0 ? hoopX - 46 : hoopX, screenY(0.22), 46, screenY(0.78) - screenY(0.22), rgba(keyTeam.jersey, 0.55));
        const markX = side > 0 ? hoopX - 30 : hoopX + 30;
        const markY = screenY(0.5);
        g.line(markX - 3, markY, markX + 3, markY, PAL.orange);
        g.line(markX, markY - 3, markX, markY + 3, PAL.orange);
        // 3-point arc: a handful of line segments around the hoop
        let prev: { x: number; y: number } | null = null;
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          const a = lerp(-1.15, 1.15, t);
          const px = hoopX - side * Math.cos(a) * THREE_PT_R * 0.72;
          const pd = clamp(0.5 + Math.sin(a) * 0.46, 0.04, 0.96);
          const py = screenY(pd);
          if (prev) g.line(prev.x, prev.y, px, py, "rgba(255,240,220,0.4)");
          prev = { x: px, y: py };
        }
      }
      // hoops — a big backboard, a wide orange rim and a net that swishes on a make
      const justScored = msgT > 30 && (msg === "SWISH!" || msg === "SPLASH! 3PT!" || msg === "SLAM DUNK!");
      const netWiggle = Math.sin(frame * 0.35) * (justScored ? 4 : 0.7);
      for (const side of [-1, 1] as const) {
        const hoopX = side > 0 ? COURT_R : COURT_L;
        const sy = screenY(0.5);
        const bbW = 24,
          bbH = 28,
          bbTop = sy - RIM_Z - bbH + 8;
        const shakeIdx = side > 0 ? 1 : 0;
        const wob = rimShake[shakeIdx] > 0 ? (frame % 2 ? 1.4 : -1.4) * (rimShake[shakeIdx] / 10) : 0;
        // support pole, behind the board
        g.rect(hoopX - 2, bbTop + bbH - 4, 4, 22, shade("#cfcfcf", -0.12));
        // backboard, with a bright top edge and a dark frame
        g.rect(hoopX - bbW / 2 + wob, bbTop, bbW, bbH, "#eef1ff");
        g.rect(hoopX - bbW / 2 + wob, bbTop, bbW, 3, "#ffffff");
        // a diagonal glassy highlight catching the arena lights
        g.line(hoopX - bbW / 2 + wob + 2, bbTop + bbH - 4, hoopX - bbW / 2 + wob + 9, bbTop + 3, "rgba(255,255,255,0.65)");
        g.box(hoopX - bbW / 2 + wob, bbTop, bbW, bbH, "#1c1933");
        g.rect(hoopX - 7 + wob, bbTop + bbH - 12, 14, 9, PAL.red);
        g.box(hoopX - 7 + wob, bbTop + bbH - 12, 14, 9, shade(PAL.red, -0.3));
        // rim
        g.rect(hoopX - 12 + wob, sy - RIM_Z, 24, 4, PAL.orange);
        g.box(hoopX - 12 + wob, sy - RIM_Z, 24, 4, "#7a3c08");
        // net: strands funnelling from the rim to a point, plus a couple of weave rungs
        const netTopY = sy - RIM_Z + 3;
        const netBotY = sy - RIM_Z + (justScored ? 20 : 17);
        const spread = justScored ? 7 : 4;
        for (let i = -3; i <= 3; i++) {
          const topX = hoopX + wob + i * 3.3;
          const botX = hoopX + wob + i * (spread / 3) + netWiggle;
          g.line(topX, netTopY, botX, netBotY, "rgba(255,255,255,0.8)");
        }
        for (let k = 1; k <= 2; k++) {
          const ry = netTopY + k * ((netBotY - netTopY) / 3);
          const rw = 10 - k * 2.5;
          g.line(hoopX + wob - rw, ry, hoopX + wob + rw, ry, "rgba(255,255,255,0.3)");
        }
      }

      const offenseTeam: 0 | 1 | null = ball.mode === "held" && ball.holder ? ball.holder.team : ball.mode === "pass" || ball.mode === "shotFlight" ? ball.targetTeam : null;
      const human = controlledKid();
      const kidBallish = (ball.holder && ball.holder.team === 0) || ((ball.mode === "pass" || ball.mode === "shotFlight") && ball.targetTeam === 0);

      // players, drawn back-to-front by depth
      const order = [...players].sort((a, b) => a.d - b.d);
      for (const p of order) {
        const sets = p.team === 0 ? KID_SPRITES : cpuSprites;
        const defending = offenseTeam !== null && offenseTeam !== p.team;
        let spr: Sprite;
        if (p.state === "dunk") spr = sets.dunk;
        else if (p.state === "jump") spr = sets.jump;
        else if (defending && p.animT < 0.1) spr = sets.defend;
        else spr = sets.run[Math.floor(p.animT) % 2];
        const sy = screenY(p.d);
        const pScale = playerScale(p.d);
        const feetY = sy; // the player's shadow always sits on the floor, however high they've jumped
        const topY = sy - p.z - PLAYER_ROWS * pScale;
        // a soft baked shadow under the feet — shrinks as the player jumps, never a big dark blob
        const shrink = clamp(1 - p.z / 46, 0.35, 1);
        const shScale = pScale * shrink * 0.7;
        g.sprite(A.shadow, p.x - 9 * shScale, feetY - 4 * shScale, { scale: shScale });
        g.sprite(spr, p.x - 7 * pScale, topY, { flipX: p.facing < 0, scale: pScale });
        // a small jersey number on the chest — skip it on far, tiny players so it never blurs into noise.
        // NOTE: unlike g.sprite(), g.text() does NOT subtract the active g.camera() shift, so while
        // the world camera is on we must subtract it ourselves or the number drifts off the player.
        if (pScale > 2.2) g.text(`${p.num}`, p.x - (camX + sx), topY + 4 * pScale, "rgba(255,255,255,0.85)", { align: "center", size: pScale / 2.6 });
        if (p === human) {
          const bob = Math.sin(frame * 0.2) * 2;
          g.circle(p.x, topY - 5 + bob, 3, PAL.yellow);
        }
      }

      // ball — bigger, with visible seams — and its own flat shadow, never as big as a player
      {
        let bx = ball.x,
          bd = ball.d,
          bz = ball.z;
        if (ball.mode === "held" && ball.holder) {
          const holderScale = playerScale(ball.holder.d);
          bx = ball.holder.x + ball.holder.facing * 9 * holderScale * 0.5;
          bd = ball.holder.d;
          bz = ball.holder.z + 13 * holderScale * 0.5 + (ball.holder.state === "run" ? Math.abs(Math.sin(ball.holder.animT * 2)) * 3 : 0);
        }
        const scale = depthScale(bd);
        const sy = screenY(bd) - bz;
        g.sprite(A.shadow, bx - 9 * scale * 0.6, screenY(bd) - 2.8 * scale * 0.6, { scale: scale * 0.6 });
        if (onFire && kidBallish) {
          for (let i = 0; i < 3; i++) {
            const fx = bx + Math.sin(frame * 0.5 + i) * 4;
            const fy = sy - 2 - i * 3 + Math.cos(frame * 0.4 + i) * 2;
            g.circle(fx, fy, (3 - i * 0.6) * scale, i % 2 ? PAL.yellow : PAL.orange);
          }
        }
        g.sprite(A.ball, bx - BALL_MID * scale, sy - BALL_MID * scale, { scale });
      }
      for (const s of sparks) g.circle(s.x, s.y, 2, s.c);
      // swish sparkles — little twinkling crosses, never plain dots
      for (const st of stars) {
        const a = st.life / st.max;
        const r2 = 1 + (1 - Math.abs(a - 0.5) * 2) * 2.5;
        const c = a > 0.5 ? "#ffffff" : PAL.yellow;
        g.line(st.x - r2, st.y, st.x + r2, st.y, c);
        g.line(st.x, st.y - r2, st.x, st.y + r2, c);
      }

      g.camera(0, 0);
      // ── HUD / scoreboard — a COMPACT jumbotron, team colours either side, so the stands behind
      // it stay mostly visible ──
      g.rect(0, 0, W, HUD_H, "rgba(10,8,22,0.72)");
      g.rect(0, 0, 3, HUD_H, KID_TEAM.jersey);
      g.rect(W - 3, 0, 3, HUD_H, opp.jersey);
      g.box(2, 1, W - 4, HUD_H - 3, "rgba(255,255,255,0.14)");
      g.rect(0, HUD_H - 1, W, 1, PAL.dark);
      g.text("BADGERS", 6, 2, KID_TEAM.jersey);
      g.text(`${kidScore}`, 6, 11, PAL.white);
      g.text(opp.name, W - 6, 2, opp.jersey, { align: "right" });
      g.text(`${oppScore}`, W - 6, 11, PAL.white, { align: "right" });
      g.text(quarter <= 4 ? `Q${quarter}` : "OT", W / 2, 2, PAL.grey, { align: "center" });
      const secs = Math.max(0, Math.ceil(clock / 60));
      g.text(`${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`, W / 2, 11, PAL.white, { align: "center" });
      const shotSecs = Math.max(0, Math.ceil(shotClock / 60));
      g.text(`${shotSecs}`, W / 2 + 22, 11, shotSecs <= 5 ? PAL.red : PAL.yellow, { align: "center" });
      if (onFire) {
        g.rect(W / 2 - 34, HUD_H + 2, 68, 8, "rgba(10,8,22,0.75)");
        g.text("SUPER HOT!", W / 2, HUD_H + 4, frame % 20 < 10 ? PAL.orange : PAL.yellow, { align: "center" });
      }

      // timing ring for a human-controlled charging jump shot
      if ((human.state === "jump" || human.state === "dunk") && !human.isDunkAttempt && !human.released) {
        const bx = 10,
          bw = W - 20,
          by = H - 22;
        g.rect(bx, by, bw, 6, "rgba(13,11,26,0.7)");
        g.rect(bx + bw * 0.78, by, bw * 0.2, 6, "rgba(80,220,120,0.5)");
        g.rect(bx + human.ringVal * (bw - 4), by, 4, 6, PAL.white);
        g.text("RELEASE AT THE TOP!", W / 2, by - 10, PAL.white, { align: "center" });
      }

      if (msgT > 0 && state === "play") {
        const hypeMsg = msg === "SWISH!" || msg === "SPLASH! 3PT!" || msg === "SLAM DUNK!" || msg === "BLOCKED!" || msg === "STEAL!";
        if (hypeMsg) {
          const bw = msg.length * 11 + 16;
          const bx = W / 2 - bw / 2;
          const bannerColor = msg === "BLOCKED!" ? opp.jersey : KID_TEAM.jersey;
          g.rect(bx, 40, bw, 14, "rgba(10,8,22,0.8)");
          g.rect(bx, 40, 3, 14, bannerColor);
          g.rect(bx + bw - 3, 40, 3, 14, bannerColor);
          g.box(bx, 40, bw, 14, "rgba(255,255,255,0.5)");
          g.text(msg, W / 2 + 1, 44, "#140c28", { align: "center", size: 2 });
          g.text(msg, W / 2, 43, frame % 10 < 5 ? PAL.yellow : PAL.white, { align: "center", size: 2 });
        } else g.text(msg, W / 2, 48, PAL.white, { align: "center", size: 2 });
      }

      if (state === "intro") {
        g.rect(30, 80, W - 60, 56, "rgba(13,11,26,0.85)");
        g.text(`MATCH ${ti + 1} / ${CPU_TEAMS.length}`, W / 2, 90, PAL.yellow, { align: "center", size: 2 });
        g.text(msg, W / 2, 112, opp.jersey, { align: "center" });
        g.text("A: HOLD TO JUMP, RELEASE AT THE TOP", W / 2, 124, PAL.white, { align: "center" });
      } else if (state === "qend") {
        g.rect(40, 90, W - 80, 40, "rgba(13,11,26,0.85)");
        g.text(msg, W / 2, 104, PAL.yellow, { align: "center", size: 2 });
      } else if (state === "final") {
        g.rect(20, 80, W - 40, 60, "rgba(13,11,26,0.9)");
        g.text(msg, W / 2, 96, kidScore > oppScore ? PAL.lime : PAL.red, { align: "center", size: 2 });
        g.text(`${kidScore} - ${oppScore}`, W / 2, 118, PAL.white, { align: "center", size: 2 });
      } else if (state === "won") {
        g.rect(20, 80, W - 40, 60, "rgba(13,11,26,0.9)");
        g.text("CHAMPIONS!", W / 2, 100, PAL.yellow, { align: "center", size: 3 });
      } else if (state === "lost") {
        g.rect(20, 80, W - 40, 60, "rgba(13,11,26,0.9)");
        g.text("GAME OVER", W / 2, 100, PAL.red, { align: "center", size: 3 });
      } else if (state === "play" && ball.mode === "held" && ball.holder && ball.holder.team === 0 && ball.holder === human) {
        g.text("A JUMP · B PASS", W / 2, H - 10, "rgba(255,255,255,0.6)", { align: "center" });
      }
    },
  };
}

export const hoopJam: RetroGameDef = {
  id: "hoop-jam",
  title: "Hoop Jam",
  blurb: "2-on-2 arcade hoops — get on fire and throw down flying dunks!",
  genre: "Sports",
  emoji: "🏀",
  color: "#ff9a3c",
  controls: "D-PAD move (▲▼ = step across the court) · hold A to jump, let go at the TOP for the best shot (auto DUNK up close!) · B pass on offence, steal/block on defence · win 4 quarters to face a tougher team, beat all 3 to win it all",
  pad: { dpad: "4", a: "Shoot", b: "Pass/Steal" },
  create,
};
