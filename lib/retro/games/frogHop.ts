// FROG HOP — help a little frog get home. Hop across the busy night road, then over the river on
// floating logs and turtles (careful: some turtles dive!). Land in all 5 lily-pad homes to
// clear the level; the next one is faster. Each life has a timer bar, and a bonus bug
// sometimes sits in an empty home. 3 lives. A night-time cabinet look: a moonlit river with
// lily pads, a dark asphalt road full of glossy cars and a lamp-lit sidewalk. (Original game in
// the spirit of 8-bit road-crossing classics.)
import { PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bayer, drawStrip, fbm, hash2, mixHex, outlined, shade } from "../art";

const T = 16;
const START_ROW = 13;
const HOME_ROW = 1;
const RIVER = [2, 3, 4, 5, 6];
const ROAD = [8, 9, 10, 11, 12];
const HOMES = [24, 72, 120, 168, 216]; // lily pad centre x
const LIFE_FRAMES = 30 * 60;
const HOP_FR = 8;
const LOOP = W + 112; // lane objects wrap around this loop (room for the longest log)
const REPEAT = 16; // frames between hops while a direction is held

// ── palette sampled straight off the cabinet painting (deep night road + river) ──
const RIVER_DEEP = "#071a63";
const RIVER_MID = "#1c49c4";
const RIVER_GLOW = "#5fb6ff";
const ROAD_DARK = "#14172a";
const ROAD_DARK2 = "#1d2140";
const HEDGE_DARK = "#102f1c";
const HEDGE_LEAF = "#1f7a3c";
const LILY_GREEN = "#1f9a3f";
const LILY_DARK = "#0f5c27";
const GRASS_DARK = "#0d2a1b";
const GRASS_LIGHT = "#1f6f34";
const MEDIAN_BASE = "#262a40";
const CAR_COLORS = [PAL.red, PAL.blue, PAL.pink, PAL.purple, PAL.orange, PAL.teal];

const FROG_TOP = ["..gg......gg..", ".gwkg....gwkg.", ".gwwg....gwwg.", "..hhhhhhhhhh..", "...gllllllg...", "d..gllllllg..d", "dd.gllllllg.dd", ".gggllllllggg.", "...gllllllg...", "...dddddddd.."];
const FROG_PAL = { g: PAL.green, l: PAL.lime, w: PAL.white, k: PAL.black, h: shade(PAL.green, 0.3), d: shade(PAL.green, -0.32) };
const SIT_ROWS = [...FROG_TOP, "..gg......gg..", ".gg........gg.", "gg..........gg", ".............."];
const HOP_ROWS = [...FROG_TOP, "...g......g...", "..gg......gg..", "..g........g..", "..g........g.."];
/** rotate pixel rows 90° clockwise (an up-facing frog ends up facing right) */
const rot = (rows: string[]) => rows[0].split("").map((_, x) => rows.map((row) => row[x]).reverse().join(""));
const FROG_SIT = outlined(sprite(SIT_ROWS, FROG_PAL));
const FROG_HOP = outlined(sprite(HOP_ROWS, FROG_PAL));
const FROG_SIT_R = outlined(sprite(rot(SIT_ROWS), FROG_PAL));
const FROG_HOP_R = outlined(sprite(rot(HOP_ROWS), FROG_PAL));
const BUG = outlined(sprite(["k.....k", ".k...k.", "..yyy..", ".ywwwy.", "yyyyyyy", ".ykyky.", "..yyy.."], { k: PAL.black, y: PAL.yellow, w: PAL.cyan }));

interface LaneObj {
  x0: number;
  w: number;
  dive: boolean;
  phase: number;
  color: string;
}
interface Lane {
  row: number;
  kind: "car" | "truck" | "racer" | "log" | "turtle";
  dir: number;
  speed: number;
  off: number;
  objs: LaneObj[];
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

const mod = (v: number, m: number) => ((v % m) + m) % m;

// ── backdrop + tile art, baked once and reused every frame (see "BAKE LAZILY" below) ──
function hedgeStrip(): Sprite {
  return bake(W, T, (x, y) => {
    if (HOMES.some((hx) => Math.abs(x - hx) < 13)) return null; // the lily-pad home bays
    const n = fbm(x * 0.22, y * 0.42, 2, 11);
    const base = mixHex(HEDGE_DARK, HEDGE_LEAF, 0.3 + n * 0.5);
    if (y === 0) return shade(base, n > 0.55 ? 0.3 : 0.05);
    if (y >= T - 2) return shade(base, n < 0.4 ? -0.22 : 0);
    return base;
  });
}
function lilyPadSprite(): Sprite {
  const w = 22;
  const h = 14;
  return bake(w, h, (x, y) => {
    const dx = (x + 0.5 - w / 2) / (w / 2);
    const dy = (y + 0.5 - h / 2) / (h / 2);
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (Math.abs(Math.atan2(dy, dx)) < 0.4 && d > 0.3) return null; // classic lily-pad notch
    if (d > 0.78) return LILY_DARK;
    const vein = Math.abs(Math.sin(dx * 7) + Math.cos(dy * 6)) < 0.22;
    if (vein) return shade(LILY_GREEN, -0.14);
    return d < 0.3 ? shade(LILY_GREEN, 0.2) : LILY_GREEN;
  });
}
function medianStrip(): Sprite {
  return bake(W, T, (x, y) => {
    if (y === 0 || y === T - 1) return shade(MEDIAN_BASE, 0.22);
    if (y === 7 && x % 18 < 2) return PAL.yellow; // reflector studs
    const n = hash2(Math.floor(x / 4), Math.floor(y / 3), 5);
    return shade(MEDIAN_BASE, (n - 0.5) * 0.14);
  });
}
function roadTile(): Sprite {
  return bake(32, T, (x, y) => {
    const streak = fbm(x * 0.15, y * 0.5, 2, 9);
    const base = mixHex(ROAD_DARK, ROAD_DARK2, streak);
    return hash2(x, y, 3) > 0.985 ? shade(base, 0.3) : base;
  });
}
function riverTile(): Sprite {
  return bake(48, T, (x, y) => {
    const n = fbm(x * 0.12, y * 0.3, 2, 21);
    const base = mixHex(RIVER_DEEP, RIVER_MID, n);
    const streak = Math.sin((x - y * 1.6) * 0.25) * 0.5 + 0.5;
    return streak > 0.84 && bayer(x, y) < streak - 0.78 ? shade(base, 0.32) : base;
  });
}
/** a lamp's small bright core plus a soft dithered glow falloff — never a flat glow dome */
function lampPixel(x: number, y: number, cx: number): string | null {
  const dx = x - cx;
  const dy = y - 4;
  const d = Math.hypot(dx, dy);
  if (d < 1.6) return "#fff6c2";
  if (d < 5 && 1 - d / 5 > bayer(x, y)) return "#ffe14d";
  if (Math.abs(dx) <= 1 && y >= 6 && y <= 14) return y === 6 ? "#3a4050" : "#262b3c";
  return null;
}
function sidewalkStartStrip(): Sprite {
  const lampXs = [14, W - 14];
  return bake(W, T, (x, y) => {
    for (const cx of lampXs) {
      const c = lampPixel(x, y, cx);
      if (c) return c;
    }
    const n = fbm(x * 0.3, y * 0.6, 2, 77);
    const base = mixHex(GRASS_DARK, GRASS_LIGHT, n * 0.55);
    return y < 2 ? shade(base, 0.12) : base;
  });
}
function logTile(): Sprite {
  return bake(16, 12, (x, y) => {
    if (y === 0) return "#c98a52";
    if (y === 11) return shade(PAL.brown, -0.3);
    return Math.sin((x + y * 0.4) * 0.8) > 0.55 ? shade(PAL.brown, -0.16) : PAL.brown;
  });
}
function carSprite(color: string): Sprite {
  const roof = shade(color, 0.35);
  const under = shade(color, -0.3);
  return outlined(
    bake(16, 16, (x, y) => {
      const wheelCols = (x >= 2 && x <= 3) || (x >= 11 && x <= 12);
      if (y <= 2 || y >= 13) return (y === 1 || y === 2 || y === 13 || y === 14) && wheelCols ? "#0d0b1a" : null;
      if (x < 1 || x > 14) return null;
      if (x === 14 && (y === 6 || y === 9)) return "#fff4b0"; // headlight
      if (x === 1 && (y === 6 || y === 9)) return "#ff3b3b"; // taillight
      if (x >= 6 && x <= 10 && y >= 6 && y <= 9) return "#b9c4e6"; // windshield
      if (y === 3) return roof;
      if (y === 12) return under;
      return color;
    })
  );
}
function racerSprite(): Sprite {
  const color = PAL.yellow;
  const roof = shade(color, 0.3);
  const under = shade(color, -0.3);
  return outlined(
    bake(16, 16, (x, y) => {
      const wheelCols = (x >= 2 && x <= 3) || (x >= 11 && x <= 12);
      if (y <= 2 || y >= 13) return (y === 1 || y === 2 || y === 13 || y === 14) && wheelCols ? "#0d0b1a" : null;
      if (x < 1 || x > 14) return null;
      if (x === 14 && (y === 6 || y === 9)) return "#fff4b0"; // headlight
      if (x === 1 && (y === 6 || y === 9)) return "#ff3b3b"; // taillight
      if ((y === 7 || y === 8) && (x < 6 || x > 10)) return PAL.red; // racing stripe either side of the cab
      if (x >= 6 && x <= 10 && y >= 6 && y <= 9) return "#fff0c2";
      if (y === 3) return roof;
      if (y === 12) return under;
      return color;
    })
  );
}
function truckSprite(): Sprite {
  const cab = "#d9433a";
  const cabRoof = shade(cab, 0.3);
  const cabUnder = shade(cab, -0.3);
  const trailer = "#c9ccd8";
  const trailerRoof = shade(trailer, 0.2);
  const trailerUnder = shade(trailer, -0.22);
  return outlined(
    bake(32, 16, (x, y) => {
      const wheelCols = (x >= 3 && x <= 4) || (x >= 14 && x <= 15) || (x >= 26 && x <= 27);
      if (y <= 2 || y >= 13) return (y === 1 || y === 2 || y === 13 || y === 14) && wheelCols ? "#0d0b1a" : null;
      if (x < 1 || x > 30) return null;
      if (x >= 24) {
        if (x === 30 && (y === 6 || y === 9)) return "#fff4b0";
        if (x >= 26 && x <= 29 && y >= 6 && y <= 9) return "#bfefff";
        if (y === 3) return cabRoof;
        if (y === 12) return cabUnder;
        return cab;
      }
      if (x === 1 && (y === 6 || y === 9)) return "#ff3b3b";
      if (y === 3) return trailerRoof;
      if (y === 12) return trailerUnder;
      return x % 6 === 0 ? shade(trailer, -0.1) : trailer;
    })
  );
}
function turtleSprite(legsOut: boolean): Sprite {
  const shellHi = "#5fd27e";
  const shellMid = "#2c8a4e";
  const shellDark = "#175c34";
  return outlined(
    bake(16, 14, (x, y) => {
      const dx = x - 8;
      const dy = y - 7;
      const d = Math.hypot(dx / 6, dy / 5);
      if (d < 1) {
        if (d < 0.38) return shellHi;
        return Math.floor(d * 4) % 2 === 0 ? shellMid : shellDark;
      }
      if (dx > 5 && Math.abs(dy) < 2.1 && d < 1.5) return PAL.lime;
      if (legsOut && Math.abs(dx) < 2.4 && Math.abs(dy) > 5 && d < 1.7) return PAL.lime;
      return null;
    })
  );
}
function makeArt() {
  return {
    hedge: hedgeStrip(),
    lily: lilyPadSprite(),
    median: medianStrip(),
    road: roadTile(),
    river: riverTile(),
    sidewalkStart: sidewalkStartStrip(),
    log: logTile(),
    cars: Object.fromEntries(CAR_COLORS.map((c) => [c, carSprite(c)])) as Record<string, Sprite>,
    racer: racerSprite(),
    truck: truckSprite(),
    turtle: [turtleSprite(true), turtleSprite(false)] as [Sprite, Sprite],
  };
}
let A: ReturnType<typeof makeArt> | null = null;
const art = () => (A ??= makeArt());

function makeLanes(level: number, seed: number): Lane[] {
  const r = rng(seed + level * 17);
  const sp = 1 + (level - 1) * 0.2;
  const logShrink = Math.min(2, Math.floor((level - 1) / 2));
  const lane = (row: number, kind: Lane["kind"], dir: number, speed: number, n: number, w: number, dive = false): Lane => {
    const objs: LaneObj[] = [];
    for (let i = 0; i < n; i++)
      objs.push({ x0: (i * LOOP) / n + r.range(0, 10), w, dive: dive && i % 2 === 0, phase: r.int(0, 299), color: r.pick(CAR_COLORS) });
    return { row, kind, dir, speed: speed * sp, off: r.range(0, LOOP), objs };
  };
  return [
    lane(12, "car", -1, 0.5, 3, 16),
    lane(11, "car", 1, 0.65, 3, 16),
    lane(10, "racer", -1, 1.2, 2, 16),
    lane(9, "car", 1, 0.45, 4, 16),
    lane(8, "truck", -1, 0.7, 2, 32),
    lane(6, "turtle", -1, 0.55, 4, 48, true),
    lane(5, "log", 1, 0.45, 3, (4 - Math.min(1, logShrink)) * T),
    lane(4, "log", 1, 0.85, 2, (6 - logShrink) * T),
    lane(3, "turtle", -1, 0.65, 4, 32, level > 1),
    lane(2, "log", 1, 0.6, 3, (4 - logShrink) * T),
  ];
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let level = 1;
  let lanes = makeLanes(level, seed);
  let lives = 3;
  const filled = [false, false, false, false, false];
  const frog = { x: 7 * T, row: START_ROW, fromX: 0, fromRow: 0, toX: 0, toRow: 0, hop: 0, face: "up" as "up" | "down" | "left" | "right", since: 99, best: START_ROW };
  let timer = LIFE_FRAMES;
  let dead = 0;
  let deadKind: "squash" | "splash" | "" = "";
  let deadX = 0;
  let deadY = 0;
  let over = false;
  let banner = 90;
  let bannerText = "LEVEL 1";
  let bug = -1;
  let bugT = 400;
  let frame = 0;
  const bits: Bit[] = [];
  const pops: { x: number; y: number; t: number; s: string }[] = [];

  const objX = (ln: Lane, o: LaneObj) => mod(o.x0 + ln.off, LOOP) - 104;
  /** turtles that dive: 0 = up, 1 = sinking, 2 = under */
  const diveState = (o: LaneObj) => {
    if (!o.dive) return 0;
    const p = mod(frame + o.phase, 300);
    return p < 200 ? 0 : p < 230 || p >= 270 ? 1 : 2;
  };
  const resetFrog = () => {
    Object.assign(frog, { x: 7 * T, row: START_ROW, hop: 0, face: "up", since: 99, best: START_ROW });
    timer = LIFE_FRAMES;
  };
  const die = (io: IO, kind: "squash" | "splash") => {
    if (dead > 0) return;
    dead = 50;
    deadKind = kind;
    deadX = frog.x + 8;
    deadY = frog.row * T + 8;
    frog.hop = 0;
    if (kind === "splash") io.sfx.play("splash");
    else {
      io.sfx.play("hit");
      io.sfx.noise?.(140, 0.5, 700, 140);
    }
    const c = kind === "splash" ? [RIVER_GLOW, "#eaffff", RIVER_MID] : [PAL.white, PAL.grey, PAL.yellow];
    for (let i = 0; i < 14; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.5, 2);
      bits.push({ x: deadX, y: deadY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(16, 30), c: r.pick(c) });
    }
  };

  const startHop = (dir: "up" | "down" | "left" | "right", io: IO) => {
    frog.face = dir;
    let tx = frog.x;
    let tr = frog.row;
    if (dir === "up") tr--;
    else if (dir === "down") tr++;
    else if (dir === "left") tx -= T;
    else tx += T;
    tx = clamp(tx, 0, W - T);
    tr = clamp(tr, HOME_ROW, START_ROW);
    if (tr === frog.row && tx === frog.x) return;
    if (tr === HOME_ROW) {
      // only an open lily pad lets the frog in; the hedge just bonks
      const i = HOMES.findIndex((hx) => Math.abs(frog.x + 8 - hx) < 12);
      if (i < 0 || filled[i]) {
        io.sfx.play("blip");
        frog.since = 0;
        return;
      }
      tx = HOMES[i] - 8;
    }
    frog.fromX = frog.x;
    frog.fromRow = frog.row;
    frog.toX = tx;
    frog.toRow = tr;
    frog.hop = HOP_FR;
    frog.since = 0;
    io.sfx.play("jump");
  };

  const land = (io: IO) => {
    frog.x = frog.toX;
    frog.row = frog.toRow;
    if (frog.row < frog.best) {
      frog.best = frog.row;
      io.score(10);
    }
    if (frog.row === HOME_ROW) {
      const i = HOMES.findIndex((hx) => Math.abs(frog.x + 8 - hx) < 2);
      if (i < 0) return;
      filled[i] = true;
      let pts = 50 + Math.floor(timer / 60) * 10;
      if (bug === i) {
        pts += 200;
        bug = -1;
        pops.push({ x: HOMES[i], y: 10, t: 50, s: "BUG +200" });
        io.sfx.slide?.(500, 1300, 0.28, "square", 0.5);
      } else pops.push({ x: HOMES[i], y: 10, t: 40, s: `+${pts}` });
      io.score(pts);
      io.sfx.play("powerup");
      if (filled.every(Boolean)) {
        io.score(1000);
        io.sfx.play("win");
        level++;
        lanes = makeLanes(level, seed);
        filled.fill(false);
        banner = 110;
        bannerText = `LEVEL ${level}`;
        bug = -1;
      }
      resetFrog();
    }
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      for (const ln of lanes) ln.off += ln.dir * ln.speed;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= 0.94;
        b.vy *= 0.94;
        if (--b.life <= 0) bits.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) if (--pops[i].t <= 0) pops.splice(i, 1);
      if (banner > 0) {
        banner--;
        return;
      }
      // bonus bug
      bugT--;
      if (bugT <= 0) {
        if (bug >= 0) {
          bug = -1;
          bugT = r.int(400, 700);
        } else {
          const open = filled.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0);
          if (open.length) {
            bug = r.pick(open);
            io.sfx.play("pickup");
          }
          bugT = 300;
        }
      }

      if (dead > 0) {
        if (--dead === 0) {
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          resetFrog();
        }
        return;
      }

      // a distant engine whoosh now and then, so the road feels alive without ever looping
      if (frame % 97 === 11) io.sfx.play("whoosh");

      // ── hopping ──
      const inp = io.input;
      frog.since++;
      if (frog.hop > 0) {
        frog.hop--;
        const k = 1 - frog.hop / HOP_FR;
        frog.x = frog.fromX + (frog.toX - frog.fromX) * k;
        if (frog.hop === 0) land(io);
      } else {
        const dirs = ["up", "down", "left", "right"] as const;
        const pressed = dirs.find((d) => inp.pressed[d]);
        const held = dirs.find((d) => inp.held[d]);
        if (pressed) startHop(pressed, io);
        else if (held && frog.since >= REPEAT) startHop(held, io);
      }
      const row = frog.hop > 0 ? (frog.hop > HOP_FR / 2 ? frog.fromRow : frog.toRow) : frog.row;

      // ── timer ──
      timer--;
      if (timer <= 0) {
        die(io, "squash");
        return;
      }
      if (timer === 300) io.sfx.play("blip");
      else if (timer < 150 && timer % 30 === 0) io.sfx.play("blip");

      // ── the river carries you (only once you've landed) ──
      if (frog.hop === 0 && RIVER.includes(frog.row)) {
        const ln = lanes.find((l) => l.row === frog.row);
        let safe = false;
        if (ln) {
          const cx = frog.x + 8;
          for (const o of ln.objs) {
            const x = objX(ln, o);
            if (cx > x + 2 && cx < x + o.w - 2 && diveState(o) < 2) safe = true;
          }
          if (safe) frog.x += ln.dir * ln.speed;
        }
        if (!safe || frog.x < -6 || frog.x > W - 10) {
          die(io, "splash");
          return;
        }
      }
      // ── traffic ──
      if (ROAD.includes(row)) {
        const ln = lanes.find((l) => l.row === row);
        if (ln) {
          for (const o of ln.objs) {
            const x = objX(ln, o);
            if (frog.x + 12 > x + 1 && frog.x + 3 < x + o.w - 1) {
              die(io, "squash");
              return;
            }
          }
        }
      }
    },

    draw(g: Gfx) {
      const a = art();
      g.clear(ROAD_DARK);

      // river, each row drifting at its own pace for a touch of depth
      for (let i = 0; i < RIVER.length; i++) {
        const row = RIVER[i];
        const dir = i % 2 === 0 ? 1 : -1;
        drawStrip(g, a.river, dir * (frame * (0.35 + i * 0.05)) + row * 29, row * T, W);
      }
      for (let i = 0; i < 16; i++) {
        const y = RIVER[0] * T + ((i * 13) % (RIVER.length * T));
        const x = mod(i * 47 + frame * (i % 2 ? 0.3 : -0.3), W + 20) - 10;
        g.rect(x, y, 6, 1, RIVER_GLOW);
      }

      // hedge + lily-pad homes
      g.sprite(a.hedge, 0, T);
      for (let i = 0; i < 5; i++) {
        const hx = HOMES[i];
        g.sprite(a.lily, hx - 11, T + 1);
        if (filled[i]) g.sprite(FROG_SIT, hx - 8, T);
        else if (bug === i) g.sprite(BUG, hx - 4, T + 4 + (frame % 20 < 10 ? 0 : -1));
      }

      // safe median strip + the lamp-lit home sidewalk
      g.sprite(a.median, 0, 7 * T);
      g.sprite(a.sidewalkStart, 0, START_ROW * T);

      // road
      for (const row of ROAD) drawStrip(g, a.road, row * 7, row * T, W);
      for (let row = 9; row <= 12; row++) for (let x = 0; x < W; x += 24) g.rect(x + 4, row * T - 1, 12, 2, PAL.yellow);

      // lane objects
      for (const ln of lanes) {
        const y = ln.row * T;
        for (const o of ln.objs) {
          const x = objX(ln, o);
          if (x > W || x + o.w < 0) continue;
          if (ln.kind === "log") {
            for (let k = 0; k < o.w; k += 16) g.sprite(a.log, x + k, y + 2);
            g.circle(x + o.w - 5, y + 8, 5, PAL.tan);
            g.circle(x + o.w - 5, y + 8, 3, shade(PAL.tan, -0.22));
          } else if (ln.kind === "turtle") {
            const ds = diveState(o);
            if (ds === 2) {
              for (let k = 0; k < o.w; k += 16) g.circle(x + k + 8, y + 9, 3 + (frame % 20 < 10 ? 1 : 0), RIVER_MID);
              continue;
            }
            const spr = a.turtle[frame % 24 < 12 ? 0 : 1];
            if (ds === 1) g.alpha(0.55);
            for (let k = 0; k < o.w; k += 16) g.sprite(spr, x + k - 1, y, { flipX: ln.dir < 0 });
            if (ds === 1) g.alpha(1);
          } else {
            const spr = ln.kind === "truck" ? a.truck : ln.kind === "racer" ? a.racer : a.cars[o.color];
            g.sprite(spr, x - 1, y - 1, { flipX: ln.dir < 0 });
          }
        }
      }

      // frog
      if (dead === 0 && !over) {
        let y = frog.row * T;
        let hopUp = 0;
        if (frog.hop > 0) {
          const k = 1 - frog.hop / HOP_FR;
          y = (frog.fromRow + (frog.toRow - frog.fromRow) * k) * T;
          hopUp = Math.sin(k * Math.PI) * 4;
        }
        const spr = frog.hop > 0 ? FROG_HOP : FROG_SIT;
        const x = frog.x;
        g.rect(x + 3, y + 13, 10, 2, "rgba(13,11,26,0.35)");
        if (frog.face === "up") g.sprite(spr, x, y - hopUp);
        else if (frog.face === "down") g.sprite(spr, x, y - hopUp, { flipY: true });
        else g.sprite(frog.hop > 0 ? FROG_HOP_R : FROG_SIT_R, x, y - hopUp, { flipX: frog.face === "left" });
      }
      if (dead > 0) {
        const t = 50 - dead;
        if (deadKind === "splash") {
          g.box(deadX - t * 0.5 - 2, deadY - t * 0.25 - 1, t + 4, t * 0.5 + 2, RIVER_GLOW);
          if (t < 25) g.circle(deadX, deadY, 4, RIVER_MID);
        } else {
          g.circle(deadX, deadY, Math.min(9, 3 + t * 0.4), "#d8dae8");
          g.circle(deadX - 4, deadY - 3, Math.min(6, 2 + t * 0.3), PAL.white);
          if (t % 10 < 5) g.text("*", deadX - 2, deadY - 12, PAL.yellow);
        }
      }
      for (const b of bits) g.rect(b.x, b.y, 2, 2, b.c);
      for (const p of pops) g.text(p.s, p.x, p.y + p.t * 0.2, PAL.yellow, { align: "center" });

      // HUD (row 0) — a small framed instrument panel
      g.rect(0, 0, W, T, "#0a0818");
      g.rect(0, T - 1, W, 1, "#030210");
      for (let i = 0; i < lives; i++) g.text("♥", 4 + i * 9, 5, PAL.red);
      g.text(`LV ${level}`, 40, 5, PAL.white);
      g.text("TIME", 110, 5, PAL.white);
      const k = timer / LIFE_FRAMES;
      g.box(137, 4, 114, 9, "#030210");
      g.rect(138, 5, 112, 7, PAL.dark);
      g.rect(139, 6, 110 * k, 5, k < 0.2 ? (frame % 12 < 6 ? PAL.red : PAL.orange) : k < 0.5 ? PAL.yellow : PAL.lime);
      if (banner > 0) {
        g.rect(0, 7 * T, W, T, "rgba(13,11,26,0.72)");
        g.box(W / 2 - 54, 7 * T + 2, 108, T - 4, PAL.yellow);
        g.text(bannerText, W / 2, 7 * T + 4, PAL.yellow, { align: "center" });
      }
    },
  };
}

export const frogHop: RetroGameDef = {
  id: "frog-hop",
  title: "Frog Hop",
  blurb: "Hop over the busy road and the river to fill all 5 lily pads!",
  genre: "Classic",
  emoji: "🐸",
  color: "#3ecf55",
  controls: "▲ ▼ ◀ ▶ hop (one hop per tap) · ride logs and turtles · fill 5 homes",
  pad: { dpad: "4" },
  create,
};
