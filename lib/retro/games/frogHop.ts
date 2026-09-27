// FROG HOP — help a little frog get home. Hop across the busy road, then over the river on
// floating logs and turtles (careful: some turtles dive!). Land in all 5 lily-pad homes to
// clear the level; the next one is faster. Each life has a timer bar, and a bonus bug
// sometimes sits in an empty home. 3 lives. (Original game in the spirit of 8-bit
// road-crossing classics.)
import { PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

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

const FROG_TOP = ["..gg......gg..", ".gwkg....gwkg.", ".gwwg....gwwg.", "..gggggggggg..", "...gllllllg...", "g..gllllllg..g", "gg.gllllllg.gg", ".gggllllllggg.", "...gllllllg...", "...gggggggg..."];
const FROG_PAL = { g: PAL.green, l: PAL.lime, w: PAL.white, k: PAL.black };
const SIT_ROWS = [...FROG_TOP, "..gg......gg..", ".gg........gg.", "gg..........gg", ".............."];
const HOP_ROWS = [...FROG_TOP, "...g......g...", "..gg......gg..", "..g........g..", "..g........g.."];
/** rotate pixel rows 90° clockwise (an up-facing frog ends up facing right) */
const rot = (rows: string[]) => rows[0].split("").map((_, x) => rows.map((row) => row[x]).reverse().join(""));
const FROG_SIT = sprite(SIT_ROWS, FROG_PAL);
const FROG_HOP = sprite(HOP_ROWS, FROG_PAL);
const FROG_SIT_R = sprite(rot(SIT_ROWS), FROG_PAL);
const FROG_HOP_R = sprite(rot(HOP_ROWS), FROG_PAL);
const BUG = sprite(["k.....k", ".k...k.", "..yyy..", ".ywwwy.", "yyyyyyy", ".ykyky.", "..yyy.."], { k: PAL.black, y: PAL.yellow, w: PAL.cyan });

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

function makeLanes(level: number, seed: number): Lane[] {
  const r = rng(seed + level * 17);
  const sp = 1 + (level - 1) * 0.2;
  const logShrink = Math.min(2, Math.floor((level - 1) / 2));
  const lane = (row: number, kind: Lane["kind"], dir: number, speed: number, n: number, w: number, dive = false): Lane => {
    const objs: LaneObj[] = [];
    for (let i = 0; i < n; i++)
      objs.push({ x0: (i * LOOP) / n + r.range(0, 10), w, dive: dive && i % 2 === 0, phase: r.int(0, 299), color: r.pick([PAL.red, PAL.blue, PAL.pink, PAL.purple, PAL.orange, PAL.teal]) });
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
    io.sfx.play(kind === "splash" ? "bounce" : "hit");
    const c = kind === "splash" ? [PAL.white, PAL.cyan, PAL.sky] : [PAL.white, PAL.grey, PAL.yellow];
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
          if (open.length) bug = r.pick(open);
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
      g.clear(PAL.night);
      // river + banks
      g.rect(0, 2 * T, W, 5 * T, "#2b62d9");
      for (let i = 0; i < 24; i++) {
        const y = 2 * T + ((i * 13) % (5 * T));
        const x = mod(i * 47 + frame * (i % 2 ? 0.3 : -0.3), W + 20) - 10;
        g.rect(x, y, 8, 1, "#5d8ff0");
      }
      // hedge row with lily-pad bays
      g.rect(0, T, W, T, "#1f7a3c");
      for (let x = 0; x < W; x += 8) g.circle(x + 4, T + 3, 5, "#2f9a44");
      for (let i = 0; i < 5; i++) {
        const hx = HOMES[i];
        g.rect(hx - 12, T + 2, 24, T - 2, "#2b62d9");
        g.circle(hx, T + 9, 7, PAL.green);
        g.rect(hx, T + 5, 3, 4, "#2b62d9");
        if (filled[i]) g.sprite(FROG_SIT, hx - 7, T + 1);
        else if (bug === i) g.sprite(BUG, hx - 3, T + 6 + (frame % 20 < 10 ? 0 : -1));
      }
      // candy sidewalks
      for (const row of [7, START_ROW]) {
        g.rect(0, row * T, W, T, PAL.purple);
        for (let x = 0; x < W; x += 16) g.rect(x + (row === 7 ? 0 : 8), row * T + 2, 8, T - 4, "#b37bff");
      }
      // road
      g.rect(0, 8 * T, W, 5 * T, "#3a3d52");
      for (let row = 9; row <= 12; row++) for (let x = 0; x < W; x += 24) g.rect(x + 4, row * T - 1, 12, 2, PAL.yellow);

      // lane objects
      for (const ln of lanes) {
        const y = ln.row * T;
        for (const o of ln.objs) {
          const x = objX(ln, o);
          if (x > W || x + o.w < 0) continue;
          if (ln.kind === "log") {
            g.rect(x, y + 3, o.w, 10, PAL.brown);
            g.rect(x, y + 3, o.w, 2, "#b87444");
            for (let k = 8; k < o.w - 4; k += 12) g.rect(x + k, y + 8, 6, 1, "#6a3c1e");
            g.circle(x + o.w - 3, y + 8, 4, PAL.tan);
            g.circle(x + o.w - 3, y + 8, 2, "#c08850");
          } else if (ln.kind === "turtle") {
            const ds = diveState(o);
            if (ds === 2) {
              for (let k = 0; k < o.w; k += 16) g.circle(x + k + 8, y + 8, 3 + (frame % 20 < 10 ? 1 : 0), "#5d8ff0");
              continue;
            }
            for (let k = 0; k < o.w; k += 16) {
              const tx = x + k + 8;
              g.circle(tx + ln.dir * 6, y + 8, 2, PAL.lime);
              g.circle(tx, y + 8, ds === 1 ? 5 : 6, ds === 1 ? "#2a8a78" : PAL.teal);
              g.rect(tx - 2, y + 6, 4, 4, ds === 1 ? PAL.teal : PAL.green);
              if (frame % 16 < 8) g.rect(tx - 6, y + 3, 2, 2, PAL.lime);
              else g.rect(tx - 6, y + 11, 2, 2, PAL.lime);
            }
          } else {
            const long = ln.kind === "truck";
            const front = ln.dir > 0 ? x + o.w - 4 : x;
            g.rect(x + 2, y + 13, 4, 3, PAL.black);
            g.rect(x + o.w - 6, y + 13, 4, 3, PAL.black);
            g.rect(x + 2, y + 1, 4, 2, PAL.black);
            g.rect(x + o.w - 6, y + 1, 4, 2, PAL.black);
            if (long) {
              g.rect(x, y + 3, o.w, 10, PAL.grey);
              g.rect(ln.dir > 0 ? x + o.w - 10 : x, y + 2, 10, 12, PAL.orange);
              g.rect(ln.dir > 0 ? x + o.w - 5 : x + 2, y + 4, 3, 8, PAL.cyan);
            } else {
              const col = ln.kind === "racer" ? PAL.yellow : o.color;
              g.rect(x, y + 3, o.w, 10, col);
              g.rect(x + 5, y + 4, 6, 8, "#bfefff");
              if (ln.kind === "racer") g.rect(x, y + 7, o.w, 2, PAL.red);
            }
            g.rect(front, y + 4, 4, 2, PAL.white);
            g.rect(front, y + 10, 4, 2, PAL.white);
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
          hopUp = Math.sin(k * Math.PI) * 3;
        }
        const spr = frog.hop > 0 ? FROG_HOP : FROG_SIT;
        const x = frog.x + 1;
        g.rect(x + 2, y + 12, 10, 2, "rgba(13,11,26,0.35)");
        if (frog.face === "up") g.sprite(spr, x, y + 1 - hopUp);
        else if (frog.face === "down") g.sprite(spr, x, y + 1 - hopUp, { flipY: true });
        else g.sprite(frog.hop > 0 ? FROG_HOP_R : FROG_SIT_R, x, y + 1 - hopUp, { flipX: frog.face === "left" });
      }
      if (dead > 0) {
        const t = 50 - dead;
        if (deadKind === "splash") {
          g.box(deadX - t * 0.5 - 2, deadY - t * 0.25 - 1, t + 4, t * 0.5 + 2, PAL.white);
          if (t < 25) g.circle(deadX, deadY, 4, PAL.cyan);
        } else {
          g.circle(deadX, deadY, Math.min(9, 3 + t * 0.4), "#d8dae8");
          g.circle(deadX - 4, deadY - 3, Math.min(6, 2 + t * 0.3), PAL.white);
          if (t % 10 < 5) g.text("*", deadX - 2, deadY - 12, PAL.yellow);
        }
      }
      for (const b of bits) g.rect(b.x, b.y, 2, 2, b.c);
      for (const p of pops) g.text(p.s, p.x, p.y + p.t * 0.2, PAL.yellow, { align: "center" });

      // HUD (row 0)
      g.rect(0, 0, W, T, PAL.black);
      for (let i = 0; i < lives; i++) g.text("♥", 4 + i * 9, 5, PAL.red);
      g.text(`LV ${level}`, 40, 5, PAL.white);
      g.text("TIME", 110, 5, PAL.white);
      const k = timer / LIFE_FRAMES;
      g.rect(138, 5, 112, 7, PAL.dark);
      g.rect(139, 6, 110 * k, 5, k < 0.2 ? (frame % 12 < 6 ? PAL.red : PAL.orange) : k < 0.5 ? PAL.yellow : PAL.lime);
      if (banner > 0) {
        g.rect(0, 7 * T, W, T, "rgba(13,11,26,0.7)");
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
