// BOOM BLOCKS — a maze bomber. Drop bombs that blast in a cross, break crates to find
// power-ups (more bombs, bigger blasts, faster feet), set off chain reactions and pop every
// cartoon critter to open the exit door. Eight stages; stay out of your own blast!
// (Original game in the spirit of 8-bit maze bombers.)
import { PAL, W, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Rng } from "../engine";

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

// ── sprites ──
const PP = { k: PAL.black, w: PAL.white, c: PAL.cyan, b: PAL.blue, r: PAL.red };
const P_HEAD = ["......rr......", ".......k......", "...kkkkkkkk...", "..kwwwwwwwwk.."];
const P_BODY = ["..kwwwwwwwwk..", "...kkkkkkkk...", "..kbbbbbbbbk..", ".kwkbbbbbbkwk.", ".kk.kbbbbk.kk."];
const P_FEET = [
  ["....kbkkbk....", "...kkk..kkk..."],
  ["...kb....bk...", "..kkk....kkk.."],
];
const FACES: Record<string, string[]> = {
  down: ["..kwkkkkkkwk..", "..kwkckkckwk..", "..kwkkkkkkwk.."],
  up: ["..kwwwwwwwwk..", "..kwwwwwwwwk..", "..kwwwwwwwwk.."],
  side: ["..kwwwkkkkwk..", "..kwwwkkckwk..", "..kwwwkkkkwk.."],
};
const PLAYER: Record<string, ReturnType<typeof sprite>[]> = {};
for (const [k, face] of Object.entries(FACES)) PLAYER[k] = P_FEET.map((f) => sprite([...P_HEAD, ...face, ...P_BODY, ...f], PP));

const critter = (color: string, angry: boolean) => {
  const p = { k: PAL.black, p: color, w: PAL.white };
  const body = [
    "...kkkkkk...",
    ".kkppppppkk.",
    ".kpwppppppk.",
    "kpwppppppppk",
    angry ? "kpkkppppkkpk" : "kppkppppkppk",
    "kppkppppkppk",
    "kppppppppppk",
    angry ? "kppkkkkkkppk" : "kpppkkkkpppk",
    ".kppppppppk.",
    "..kkppppkk..",
    "....kkkk....",
  ];
  return [sprite([...body, ".....kk....."], p), sprite([...body, "......kk...."], p)];
};
type EKind = "puff" | "drop" | "chaser" | "ghost";
const CRITTERS: Record<EKind, ReturnType<typeof critter>> = {
  puff: critter(PAL.pink, false),
  drop: critter(PAL.sky, false),
  chaser: critter(PAL.orange, true),
  ghost: critter(PAL.purple, true),
};
const E_INFO: Record<EKind, { speed: number; pts: number }> = {
  puff: { speed: 0.5, pts: 100 },
  drop: { speed: 0.7, pts: 200 },
  chaser: { speed: 0.72, pts: 400 },
  ghost: { speed: 0.45, pts: 800 },
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

  const explode = (io: IO, b: Bomb) => {
    if (b.done) return;
    b.done = true;
    shake = 6;
    io.sfx.play("explode");
    flames.push({ c: b.c, r: b.r, t: FLAME, axis: "c" });
    burst(b.c * T + 8, b.r * T + 8, PAL.orange, 8);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let i = 1; i <= b.range; i++) {
        const c = b.c + dx * i;
        const rr = b.r + dy * i;
        const g = lv.grid[rr]?.[c];
        if (g === undefined || g === WALL) break;
        flames.push({ c, r: rr, t: FLAME, axis: dx ? "h" : "v" });
        if (g === CRATE) {
          lv.grid[rr][c] = 0;
          burst(c * T + 8, rr * T + 8, PAL.brown, 7);
          io.score(10);
          const pw = lv.pows.find((p) => p.c === c && p.r === rr);
          if (pw) pw.hidden = false;
          if (lv.door.c === c && lv.door.r === rr) doorShown = true;
          break;
        }
        const other = bombAt(c, rr);
        if (other) {
          explode(io, other); // chain reaction!
          break;
        }
      }
    }
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
        burst(e.x + 8, e.y + 8, PAL.pink, 10);
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
        pops.push({ x: lv.door.c * T - 16, y: lv.door.r * T - 6, t: -30, text: "EXIT OPEN!" });
      }
      if (state === "play" && doorOpen && lv.grid[lv.door.r][lv.door.c] === 0 && Math.abs(hero.x - lv.door.c * T) < 6 && Math.abs(hero.y - lv.door.r * T) < 6) {
        state = "clear";
        stateT = 0;
        io.score(1000 * (stage + 1));
      }
    },

    draw(g: Gfx) {
      g.clear(PAL.night);
      const sx = shake ? ((tick % 2) * 2 - 1) * 2 : 0;
      g.camera(-OX - sx, -OY);
      // arena
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const px = x * T;
          const py = y * T;
          const cell = lv.grid[y][x];
          if (cell === WALL) {
            const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
            g.rect(px, py, T, T, border ? "#4a4e6a" : "#8a90b0");
            g.rect(px, py, T, 3, border ? "#6a6e8a" : "#c0c6e0");
            g.rect(px, py + 13, T, 3, border ? "#34374e" : "#5a6080");
            if (!border) g.rect(px + 5, py + 6, 6, 4, "#a8aec8");
            continue;
          }
          g.rect(px, py, T, T, (x + y) % 2 ? "#3a9a4e" : "#44a858");
          g.rect(px, py, T, 2, "#2e7a3e");
          if (x === lv.door.c && y === lv.door.r && doorShown) {
            g.rect(px + 2, py + 1, 12, 15, PAL.black);
            g.rect(px + 3, py + 2, 10, 14, doorOpen ? (Math.floor(tick / 8) % 2 ? PAL.yellow : PAL.orange) : PAL.brown);
            g.rect(px + 5, py + 4, 6, 12, doorOpen ? PAL.white : "#6a3a1a");
          }
          const pw = lv.pows.find((p) => !p.hidden && p.c === x && p.r === y);
          if (pw && cell === 0) {
            g.rect(px + 1, py + 1, 14, 14, PAL.black);
            g.rect(px + 2, py + 2, 12, 12, Math.floor(tick / 10) % 2 ? PAL.yellow : PAL.orange);
            if (pw.kind === "bomb") {
              g.circle(px + 8, py + 9, 4, PAL.black);
              g.rect(px + 9, py + 3, 2, 3, PAL.red);
            } else if (pw.kind === "fire") {
              g.circle(px + 8, py + 10, 4, PAL.red);
              g.circle(px + 8, py + 8, 2, PAL.yellow);
              g.rect(px + 7, py + 3, 2, 4, PAL.red);
            } else if (pw.kind === "speed") g.text(">>", px + 2 + OX, py + 4 + OY, PAL.blue); // text ignores the camera
            else g.text("♥", px + 5 + OX, py + 4 + OY, PAL.red);
          }
          if (cell === CRATE) {
            g.rect(px, py, T, T, "#6a3a1a");
            g.rect(px + 1, py + 1, 14, 14, "#b87a3e");
            g.rect(px + 1, py + 1, 14, 2, "#e0a060");
            g.rect(px + 1, py + 7, 14, 2, "#8a5a2a");
            g.line(px + 2, py + 3, px + 13, py + 13, "#8a5a2a");
          }
        }
      }
      // bombs
      for (const b of bombs) {
        const pulse = b.t < 40 ? Math.floor(b.t / 4) % 2 : Math.floor(b.t / 12) % 2;
        const cx = b.c * T + 8;
        const cy = b.r * T + 9;
        g.circle(cx, cy, 6 + pulse, b.t < 40 && pulse ? PAL.red : PAL.black);
        g.circle(cx - 2, cy - 2, 2, PAL.grey);
        g.rect(cx + 2, cy - 9, 2, 4, PAL.brown);
        g.rect(cx + 2 + (tick % 3) - 1, cy - 11, 2, 2, tick % 4 < 2 ? PAL.yellow : PAL.orange);
      }
      // flames
      for (const f of flames) {
        const k = f.t / FLAME;
        const th = Math.max(2, Math.round(12 * Math.min(1, k * 1.6)));
        const px = f.c * T;
        const py = f.r * T;
        const outer = f.t % 4 < 2 ? PAL.orange : PAL.red;
        if (f.axis === "h" || f.axis === "c") g.rect(px, py + 8 - th / 2, T, th, outer);
        if (f.axis === "v" || f.axis === "c") g.rect(px + 8 - th / 2, py, th, T, outer);
        if (f.axis === "h" || f.axis === "c") g.rect(px, py + 8 - th / 4, T, th / 2, PAL.yellow);
        if (f.axis === "v" || f.axis === "c") g.rect(px + 8 - th / 4, py, th / 2, T, PAL.yellow);
        if (f.axis === "c") g.circle(px + 8, py + 8, th / 2, PAL.white);
      }
      // critters
      for (const e of lv.enemies) {
        const fr = CRITTERS[e.kind][Math.floor(e.t / 10) % 2];
        const bob = Math.floor(e.t / 15) % 2;
        if (e.dead >= 0) {
          if (Math.floor(e.dead / 3) % 2) g.sprite(fr, e.x + 2, e.y + 2, { flipY: true });
          continue;
        }
        if (e.kind === "ghost") g.alpha(0.7);
        g.sprite(fr, e.x + 2, e.y + 1 - bob, { flipX: e.dx < 0 });
        g.alpha(1);
      }
      // hero
      if (state === "dead") {
        if (stateT < 50 && Math.floor(stateT / 4) % 2 === 0) g.sprite(PLAYER.down[0], hero.x + 1, hero.y, { flipY: stateT > 20 });
      } else if (!(hero.inv > 0 && Math.floor(hero.inv / 3) % 2)) {
        g.sprite(PLAYER[hero.facing][Math.floor(hero.anim) % 2], hero.x + 1, hero.y + 1, { flipX: hero.flip && hero.facing === "side" });
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      for (const p of pops) if (p.t >= 0) g.text(p.text, p.x + OX, p.y + OY - p.t * 0.5, PAL.white);
      g.camera(0, 0);
      // HUD
      g.rect(0, 0, W, OY, PAL.black);
      g.text(`STAGE ${stage + 1}`, 4, 4, PAL.yellow);
      g.text(`♥X${lives}`, 66, 4, PAL.red);
      g.circle(106, 8, 4, PAL.grey);
      g.text(`${maxBombs}`, 113, 4, PAL.white);
      g.circle(134, 9, 3, PAL.orange);
      g.text(`${range}`, 140, 4, PAL.white);
      g.text(">>", 158, 4, PAL.sky);
      g.text(`${Math.round((speed - 1.1) / 0.25) + 1}`, 172, 4, PAL.white);
      const left = lv.enemies.filter((e) => e.dead < 0).length;
      g.text(left ? `FOES ${left}` : "EXIT!", W - 4, 4, left ? PAL.pink : PAL.lime, { align: "right" });
      if (state === "intro") {
        g.rect(40, 96, W - 80, 32, "rgba(13,11,26,0.8)");
        g.text(`STAGE ${stage + 1}`, W / 2, 102, PAL.yellow, { align: "center" });
        g.text("POP THEM ALL!", W / 2, 114, PAL.white, { align: "center" });
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
