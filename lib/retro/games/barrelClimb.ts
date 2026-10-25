// BARREL CLIMB — a single-screen climbing game. A grumpy robot at the top of the tower
// hurls rolling barrels (and later bouncy springs) down the sloped girders. Climb the
// ladders, jump the barrels for points, grab a hammer to smash them for a few seconds, and
// reach the top to rescue the kitten. Every rescue makes the robot throw faster.
// (Original game in the spirit of 8-bit climbing games.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";
import { bake, bakeGradient, hash2, tinted } from "../art";

const LEVELS = 5;
const PW = 12; // hero hitbox
const PH = 16;
const BR = 12; // barrel/spring footprint
const BH = BR / 2;

// ── painted palette, sampled from the cabinet art: a deep navy night, hot-pink truss girders,
// a violet thrower bot up top and a cyan hero bot climbing through it ──
const BG_HI = "#241f55";
const BG_LO = "#100d26";
const GIRDER = "#e23a5c";
const GIRDER_HI = "#ff9fb4";
const GIRDER_DK = "#7a1430";
const GIRDER_RIVET = "#ffd3df";
const PINK_FLOOR = "#ff7fc0";
const PINK_HI = "#ffd0ea";
const PINK_DK = "#b23f8c";
const TOWER = "#4a5280";
const TOWER_DK = "#272d4c";
const RAIL = "#5ef2ff";
const RAIL_DK = "#167d9e";
const RAIL_HI = "#d6fdff";

/** pad every row of a hand-drawn sprite out to the widest row, so a miscounted column never
 *  shifts or corrupts the art — it just pads with transparent instead. */
const fit = (rows: string[]): string[] => {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => (r.length === w ? r : r.padEnd(w, ".")));
};

interface Floor {
  x1: number;
  x2: number;
  yL: number; // surface height at x = 0
  yR: number; // surface height at x = 256
}
// Even floors slope down to the left, odd floors slope down to the right, so barrels
// zig-zag down the tower. Index 6 is the kitten's perch.
const FLOORS: Floor[] = [
  { x1: 0, x2: 256, yL: 216, yR: 212 },
  { x1: 0, x2: 232, yL: 177, yR: 183 },
  { x1: 24, x2: 256, yL: 147, yR: 141 },
  { x1: 0, x2: 232, yL: 105, yR: 111 },
  { x1: 24, x2: 256, yL: 75, yR: 69 },
  { x1: 0, x2: 232, yL: 35, yR: 41 },
  { x1: 88, x2: 144, yL: 16, yR: 16 },
];
const surf = (f: number, x: number) => {
  const fl = FLOORS[f];
  return fl.yL + ((fl.yR - fl.yL) * x) / 256;
};
/** barrels roll downhill: right on odd floors, left on even floors */
const rollDir = (f: number) => (f % 2 === 1 ? 1 : -1);

interface Ladder {
  x: number; // centre
  lo: number; // floor at the bottom
}
const LADDERS: Ladder[] = [
  { x: 200, lo: 0 },
  { x: 80, lo: 0 },
  { x: 48, lo: 1 },
  { x: 150, lo: 1 },
  { x: 210, lo: 2 },
  { x: 110, lo: 2 },
  { x: 40, lo: 3 },
  { x: 170, lo: 3 },
  { x: 204, lo: 4 },
  { x: 96, lo: 4 },
  { x: 124, lo: 5 },
];
const HAMMER_SPOTS = [
  { x: 176, f: 1 },
  { x: 60, f: 3 },
];

// ── sprites ── a cyan hero-bot, a violet thrower-bot and a tabby kitten, all outlined and
// shaded in 3-4 tones like the cabinet painting, bigger so a kid can read them while climbing.
const HP = { k: PAL.black, c: "#5ef2ff", b: "#167d9e", v: "#12203c", e: "#eafcff", y: PAL.yellow, f: "#0c1f33" };
const H_TOP = fit(["....kkkk....", "...kccccck..", "..kcvvvvck..", "..kcveevck..", ".kcccccccck.", "kkcccccccckk", "kbbbbbbbbbbk", "kbccyyyyccbk", "kbccccccccbk", "kbbbbbbbbbbk"]);
const HERO_WALK = [
  sprite(fit([...H_TOP, "..kbbbbbbk..", "..kbbbbbbk..", "..kb....bk..", "..kb....bk..", "..kf....fk..", "..kk....kk.."]), HP),
  sprite(fit([...H_TOP, "..kbbbbbbk..", ".kbb....bbk.", "kbb......bbk", "kbb......bbk", "kff......ffk", "kk........kk"]), HP),
];
const HERO_JUMP = sprite(fit([...H_TOP, "..kbbbbbbk..", ".kb......bk.", "kb........bk", "kb........bk", "b..........b", "k..........k"]), HP);
const HERO_CLIMB = sprite(fit([...H_TOP, "..kbbbbbbk..", "..kbb..bbk..", "..kb....bk..", ".kbb....bk..", "kbb......bk.", "kff......fk."]), HP);

const RP = { k: PAL.black, p: "#9a6cff", d: "#3a2170", g: PAL.grey, y: PAL.yellow, m: "#6a3fd9", w: PAL.white };
const ROBOT_HEAD = fit(["..kppppppppk.", "kppeeppeeppk", "kppppppppppk", "kpmwmwmwmwpk", "kkppppppppkk", "kgkddddddkgk", "kgkddyyddkgk", "kgkddddddkgk", "kgkddddddkgk"]);
const ROBOT = sprite(
  fit(["..kk....kk..", "..kk....kk..", ...ROBOT_HEAD, "..kgg....ggk", "..kgg....ggk", "..kg......gk", "kk........kk"]),
  RP,
);
const ROBOT_ARMS = sprite(
  fit(["kp........pk", "kp........pk", ...ROBOT_HEAD, "..kgg....ggk", "..kgg....ggk", "..kg......gk", "kk........kk"]),
  RP,
);

const KP = { k: PAL.black, o: PAL.orange, w: PAL.white, p: PAL.pink, d: "#c85a1e" };
const KITTEN = [
  sprite(fit(["k.....k.....", "kodkkkkdok..", "koooooooook.", "kwdookwkoodk", "kooopooooko.", ".kooooooookk", ".koooooooook", ".kdo.o.odk..", "..kk...kk..."]), KP),
  sprite(fit(["k.....k.....", "kodkkkkdok..", "koooooooook.", "kwdookwkoodk", "kooopooooko.", ".koooooooook", ".koooooooookk", ".kdo.o.odk..", "..kk...kk..."]), KP),
];

const BRP = { k: PAL.black, n: PAL.brown, d: "#5a3318", h: PAL.tan, s: "#7a4526" };
const BARREL = [
  // a round wooden keg: dark hoops top/middle/bottom, a highlight column down the left for the
  // curve and a shadow column on the right — not a crate of flat horizontal slats.
  sprite(
    fit([".kkkkkkkkkk.", "khhhhhhhhhhk", "kddddddddddk", "khnnnnnnnnsk", "khnnnnnnnnsk", "khnnnnnnnnsk", "kddddddddddk", "khnnnnnnnnsk", "khnnnnnnnnsk", "khnnnnnnnnsk", "kddddddddddk", ".kkkkkkkkkk."]),
    BRP,
  ),
  sprite(
    fit([".kkkkkkkkkk.", "khhhhhhhhhhk", "kddddddddddk", "ksnnnnnnnnhk", "ksnnnnnnnnhk", "ksnnnnnnnnhk", "kddddddddddk", "ksnnnnnnnnhk", "ksnnnnnnnnhk", "ksnnnnnnnnhk", "kddddddddddk", ".kkkkkkkkkk."]),
    BRP,
  ),
];
const SPRING = sprite(
  fit(["..rrrrrr....", ".rrwwrrrr...", "..kkkkkkkk..", ".cccccccccc.", "..cccccccc..", ".cccccccccc.", "..cccccccc..", ".cccccccccc.", "..cccccccc..", ".cccccccccc.", "..kkkkkkkk..", ".kkkkkkkkkk."]),
  { r: PAL.pink, w: PAL.white, k: PAL.black, c: PAL.cyan },
);
const HAMMER = sprite(["kkkkkkkk", "khhhhhhk", "khggggdk", "kkkkkkkk", "...kk...", "...nn...", "...nh...", "...nn...", "...nh...", "...kk..."], { k: PAL.black, h: PAL.grey, g: "#dfe4f2", d: "#7a8099", n: "#c97a32" });

// ── baked backdrop art ── big, static pictures baked once (lazily, on first use) rather than
// drawn with per-frame rects: a dithered night-sky gradient, grey cross-braced scaffold towers
// and the hot-pink truss girders, alternating two tile directions so they zig-zag like the art.
function buildArt() {
  const BG = bakeGradient(W, H, [BG_HI, BG_LO]);
  const TOWER_TILE = bake(10, 18, (x, y) => {
    if (x <= 1 || x >= 8) return (y >> 1) % 2 === 0 ? TOWER : TOWER_DK;
    const u = x - 2;
    const span = 5;
    const ph = y % 18;
    const up = Math.abs(u - (ph / 18) * span) < 1.1;
    const down = Math.abs(u - (1 - ph / 18) * span) < 1.1;
    return up || down ? TOWER : null;
  });
  const girderTile = (base: string, hi: string, dk: string, dir: 1 | -1, rivet: boolean) =>
    bake(8, 7, (x, y) => {
      if (y === 0) return hi;
      if (y === 6) return dk;
      const mid = dir > 0 ? x : 7 - x;
      if (Math.abs(y - 1 - mid * (4 / 7)) < 1.15) return dk;
      if (rivet && x === 3 && y === 3) return GIRDER_RIVET;
      return base;
    });
  const girderA = girderTile(GIRDER, GIRDER_HI, GIRDER_DK, 1, false);
  const girderB = girderTile(GIRDER, GIRDER_HI, GIRDER_DK, -1, false);
  const girderAR = girderTile(GIRDER, GIRDER_HI, GIRDER_DK, 1, true);
  const girderBR = girderTile(GIRDER, GIRDER_HI, GIRDER_DK, -1, true);
  const pinkA = girderTile(PINK_FLOOR, PINK_HI, PINK_DK, 1, false);
  const pinkB = girderTile(PINK_FLOOR, PINK_HI, PINK_DK, -1, false);
  const heroFlash = {
    walk: HERO_WALK.map((s) => tinted(s, "#ffffff")) as typeof HERO_WALK,
    jump: tinted(HERO_JUMP, "#ffffff"),
    climb: tinted(HERO_CLIMB, "#ffffff"),
  };
  return { BG, TOWER_TILE, girderA, girderB, girderAR, girderBR, pinkA, pinkB, heroFlash };
}
let ART: ReturnType<typeof buildArt> | null = null;
const art = () => (ART ??= buildArt());

interface Barrel {
  x: number;
  y: number;
  f: number;
  dir: number;
  st: "roll" | "fall" | "ladder";
  vy: number;
  lo: number;
  t: number;
  jumped: boolean;
  spring: boolean;
  lastLadder: number;
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
  let level = 1;
  let lives = 3;
  let over = false;
  let won = false;
  let tick = 0;
  let bonus = 5000;
  let state: "ready" | "play" | "dead" | "rescue" = "ready";
  let stateT = 0;
  const hero = { x: 40, y: 0, f: 0, vy: 0, facing: 1, mode: "walk" as "walk" | "climb" | "jump", ladder: -1, jvx: 0, anim: 0, buffer: 0, hammer: 0 };
  let barrels: Barrel[] = [];
  let parts: Part[] = [];
  let pops: { x: number; y: number; t: number; text: string }[] = [];
  let hammers = HAMMER_SPOTS.map((h) => ({ ...h, taken: false }));
  let robotT = 90;
  let throwT = 0;

  const resetLevel = () => {
    hero.x = 40;
    hero.f = 0;
    hero.y = surf(0, hero.x + PW / 2) - PH;
    hero.vy = 0;
    hero.mode = "walk";
    hero.ladder = -1;
    hero.hammer = 0;
    hero.facing = 1;
    barrels = [];
    parts = [];
    hammers = HAMMER_SPOTS.map((h) => ({ ...h, taken: false }));
    robotT = 100;
    throwT = 0;
    bonus = 5000;
    state = "ready";
    stateT = 0;
  };
  resetLevel();

  const speed = () => 0.9 + level * 0.14;
  const throwGap = () => Math.max(70, 190 - level * 24);
  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 0.8, life: 26, color });
    }
  };
  const popText = (io: IO, pts: number, x: number, y: number) => {
    io.score(pts);
    pops.push({ x, y, t: 0, text: String(pts) });
  };

  const heroBox = () => ({ x: hero.x + 3, y: hero.y + 4, w: PW - 6, h: PH - 7 }); // kid-friendly, forgiving
  const barrelBox = (b: Barrel) => ({ x: b.x + 2, y: b.y + 2 - hopOf(b), w: BR - 4, h: BR - 3 }); // a little forgiving
  const hopOf = (b: Barrel) => (b.spring && b.st === "roll" ? Math.abs(Math.sin(b.t * 0.085)) * 20 : 0);
  const hammerBox = () =>
    hero.facing > 0 ? { x: hero.x + 4, y: hero.y - 12, w: 20, h: PH + 10 } : { x: hero.x - 14, y: hero.y - 12, w: 20, h: PH + 10 };

  let shake = 0;
  const die = (io: IO) => {
    if (state !== "play") return;
    state = "dead";
    stateT = 0;
    shake = 10;
    io.sfx.play("die");
    io.sfx.play("hurt");
    burst(hero.x + PW / 2, hero.y + PH / 2, PAL.yellow, 12);
  };

  const ladderAt = (lo: number, cx: number) => LADDERS.findIndex((l) => l.lo === lo && Math.abs(l.x - cx) < 6);

  const updateHero = (io: IO) => {
    const inp = io.input;
    const cx = hero.x + PW / 2;
    hero.buffer = inp.pressed.a ? 6 : Math.max(0, hero.buffer - 1);
    if (hero.hammer > 0) {
      hero.hammer--;
      if (hero.hammer === 0) io.sfx.play("blip");
      if (hero.hammer % 16 === 0) io.sfx.play("step");
    }
    if (hero.mode === "walk") {
      const sp = hero.hammer > 0 ? 0.8 : 1.05;
      let vx = 0;
      if (inp.held.left) vx = -sp;
      else if (inp.held.right) vx = sp;
      if (vx) hero.facing = Math.sign(vx);
      const fl = FLOORS[hero.f];
      hero.x = clamp(hero.x + vx, hero.f === 5 ? 50 : fl.x1, fl.x2 - PW);
      hero.anim += Math.abs(vx) * 0.12;
      if (vx && Math.floor(hero.anim) !== Math.floor(hero.anim - Math.abs(vx) * 0.12) && Math.floor(hero.anim) % 2 === 0) {
        io.sfx.play("step");
        parts.push({ x: hero.x + (vx > 0 ? 1 : PW - 2), y: hero.y + PH - 1, vx: -vx * 0.5, vy: -0.3, life: 10, color: TOWER });
      }
      hero.y = surf(hero.f, hero.x + PW / 2) - PH;
      if (hero.hammer <= 0) {
        if (inp.held.up) {
          const li = ladderAt(hero.f, cx);
          if (li >= 0) {
            hero.mode = "climb";
            hero.ladder = li;
            hero.x = LADDERS[li].x - PW / 2;
          }
        } else if (inp.held.down && hero.f > 0) {
          const li = ladderAt(hero.f - 1, cx);
          if (li >= 0) {
            hero.mode = "climb";
            hero.ladder = li;
            hero.x = LADDERS[li].x - PW / 2;
            hero.y += 3;
          }
        }
        if (hero.mode === "walk" && hero.buffer > 0) {
          hero.mode = "jump";
          hero.vy = -3.1;
          hero.jvx = vx;
          hero.buffer = 0;
          io.sfx.play("jump");
        }
      }
    } else if (hero.mode === "climb") {
      const l = LADDERS[hero.ladder];
      const top = surf(l.lo + 1, l.x);
      const bottom = surf(l.lo, l.x);
      if (inp.held.up) hero.y -= 0.85;
      else if (inp.held.down) hero.y += 0.85;
      if (inp.held.up || inp.held.down) {
        hero.anim += 0.08;
        if (tick % 14 === 0) io.sfx.play("step");
      }
      // step off near either end with left/right, so the hero never feels stuck
      const side = inp.held.left || inp.held.right;
      if (side && hero.y + PH - top < 6) hero.y = top - PH;
      else if (side && bottom - (hero.y + PH) < 6) hero.y = bottom - PH;
      if (hero.y + PH <= top) {
        hero.mode = "walk";
        hero.f = l.lo + 1;
        hero.y = top - PH;
        if (hero.f === 6) {
          state = "rescue";
          stateT = 0;
          shake = 8;
          io.sfx.play("win");
          io.sfx.play("cheer");
          popText(io, 1000 * level, hero.x, hero.y - 12);
          if (bonus > 0) io.score(bonus);
        }
      } else if (hero.y + PH >= bottom) {
        hero.mode = "walk";
        hero.f = l.lo;
        hero.y = bottom - PH;
      }
    } else if (hero.mode === "jump") {
      if (!inp.held.a && hero.vy < -1.2) hero.vy = -1.2;
      hero.vy += 0.15; // floaty, so barrels are easy to clear
      const fl = FLOORS[hero.f];
      hero.x = clamp(hero.x + hero.jvx, hero.f === 5 ? 50 : fl.x1, fl.x2 - PW);
      hero.y += hero.vy;
      const g = surf(hero.f, hero.x + PW / 2) - PH;
      if (hero.vy > 0 && hero.y >= g) {
        hero.y = g;
        hero.mode = "walk";
        hero.vy = 0;
        burst(hero.x + PW / 2, hero.y + PH, TOWER, 4);
      }
      // points for every barrel we sail over
      for (const b of barrels) {
        if (!b.jumped && b.f === hero.f && b.st === "roll" && Math.abs(b.x + BH - (hero.x + PW / 2)) < 8 && hero.y + PH < b.y - hopOf(b) + 2) {
          b.jumped = true;
          io.sfx.play("coin");
          popText(io, b.spring ? 200 : 100, b.x, b.y - BR - 2);
        }
      }
    }
    // pick up a hammer
    for (const h of hammers) {
      if (!h.taken && hero.mode !== "climb" && overlap({ x: hero.x, y: hero.y, w: PW, h: PH }, { x: h.x, y: surf(h.f, h.x + 4) - 16, w: 8, h: 12 })) {
        h.taken = true;
        hero.hammer = 540;
        io.sfx.play("powerup");
        io.sfx.tone(1320, 90, "square", 0.22);
        burst(h.x + 4, surf(h.f, h.x + 4) - 10, PAL.yellow, 8);
        io.score(100);
      }
    }
  };

  const updateBarrels = (io: IO) => {
    const sp = speed();
    for (const b of barrels) {
      b.t++;
      if (b.st === "roll") {
        b.x += b.dir * (b.spring ? sp * 1.15 : sp);
        b.y = surf(b.f, b.x + BH) - BR;
        const fl = FLOORS[b.f];
        if (b.f === 0 && b.x < BH) {
          b.t = -1; // into the recycler
          io.sfx.play("whoosh");
          burst(10, b.y + 4, PAL.cyan, 6);
          continue;
        }
        if (b.x + BH > fl.x2 || b.x + BH < fl.x1) {
          b.st = "fall";
          b.vy = 0.4;
          continue;
        }
        // sometimes a barrel drops down a ladder (more often if the hero is below)
        if (!b.spring && b.f > 0) {
          const li = LADDERS.findIndex((l, i) => i !== b.lastLadder && l.lo === b.f - 1 && Math.abs(l.x - (b.x + BH)) < sp / 2 + 0.3);
          if (li >= 0) {
            b.lastLadder = li;
            const below = hero.f < b.f && Math.abs(hero.x - LADDERS[li].x) < 60;
            if (r.chance(0.1 + level * 0.03 + (below ? 0.15 : 0))) {
              b.st = "ladder";
              b.lo = LADDERS[li].lo;
              b.x = LADDERS[li].x - BH;
            }
          }
        }
      } else if (b.st === "fall") {
        b.vy = Math.min(4, b.vy + 0.2);
        b.y += b.vy;
        b.x += b.dir * 0.5;
        if (b.f > 0 && b.y + BR >= surf(b.f - 1, b.x + BH)) {
          b.f--;
          b.dir = rollDir(b.f);
          b.st = "roll";
          b.y = surf(b.f, b.x + BH) - BR;
          io.sfx.play("thud");
          burst(b.x + BH, b.y + BR - 1, PAL.dark, 5);
        }
        if (b.y > H + 20) b.t = -1;
      } else {
        b.y += 1.1;
        if (b.y + BR >= surf(b.lo, b.x + BH)) {
          b.f = b.lo;
          b.dir = rollDir(b.f);
          b.st = "roll";
        }
      }
      if (state !== "play") continue;
      if (hero.hammer > 0 && overlap(hammerBox(), barrelBox(b))) {
        b.t = -1;
        shake = Math.max(shake, 5);
        io.sfx.play("explode");
        io.sfx.noise?.(140, 0.35, 900, 180);
        burst(b.x + BH, b.y + BH - hopOf(b), b.spring ? PAL.cyan : PAL.orange, 12);
        popText(io, b.spring ? 500 : 300, b.x, b.y - BR);
        continue;
      }
      if (overlap(heroBox(), barrelBox(b))) die(io);
    }
    barrels = barrels.filter((b) => b.t >= 0);
  };

  return {
    update(io) {
      if (over || won) return;
      tick++;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life--;
      }
      parts = parts.filter((p) => p.life > 0);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 40);

      if (state === "ready") {
        stateT++;
        if (stateT > 70) {
          state = "play";
          stateT = 0;
        }
        return;
      }
      if (state === "dead") {
        stateT++;
        if (stateT > 100) {
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          resetLevel();
        }
        return;
      }
      if (state === "rescue") {
        stateT++;
        if (stateT % 20 === 0) parts.push({ x: 112 + r.range(-8, 8), y: 6, vx: r.range(-0.3, 0.3), vy: -0.6, life: 40, color: "heart" });
        if (stateT > 170) {
          if (level >= LEVELS) {
            won = true;
            io.score(lives * 2000);
            io.win();
            return;
          }
          level++;
          resetLevel();
        }
        return;
      }

      if (tick % 120 === 0) bonus = Math.max(0, bonus - 100);
      if (shake > 0) shake--;
      // robot throws barrels
      robotT--;
      if (robotT <= 0 && throwT === 0) {
        throwT = 36;
        io.sfx.slide?.(220, 480, 260, "square", 0.22); // mechanical wind-up
      }
      if (throwT > 0) {
        throwT--;
        if (throwT === 10) {
          const spring = level >= 2 && r.chance(0.12 + level * 0.04);
          barrels.push({ x: 48, y: surf(5, 48 + BH) - BR, f: 5, dir: 1, st: "roll", vy: 0, lo: 0, t: 0, jumped: false, spring, lastLadder: -1 });
          io.sfx.play(spring ? "bounce" : "shoot");
        }
        if (throwT === 0) robotT = throwGap() + r.int(0, 60);
      }
      updateHero(io);
      updateBarrels(io);
    },

    draw(g: Gfx) {
      const A = art();
      const sx = shake > 0 ? (hash2(tick, 11) - 0.5) * shake : 0;
      const sy = shake > 0 ? (hash2(tick, 29) - 0.5) * shake * 0.6 : 0;
      g.clear(BG_LO);
      g.camera(sx, sy);
      g.sprite(A.BG, 0, 0);
      // background scaffold towers (grey lattice holding the whole structure up)
      for (const tx of [14, 86, 168, 240]) for (let y = -10; y < H; y += 18) g.sprite(A.TOWER_TILE, tx - 5, y);
      // girders — a painted steel truss, lit top-left, zig-zagging like the cabinet art
      for (let f = 0; f < FLOORS.length; f++) {
        const fl = FLOORS[f];
        const pink = f === 6;
        let i = 0;
        for (let x = fl.x1; x < fl.x2; x += 8, i++) {
          const y = Math.round(surf(f, x + 4)) - 1;
          const dir = i % 2 === 0 ? 1 : -1;
          const rivet = i % 3 === 0;
          const tile = pink ? (dir > 0 ? A.pinkA : A.pinkB) : rivet ? (dir > 0 ? A.girderAR : A.girderBR) : dir > 0 ? A.girderA : A.girderB;
          g.sprite(tile, x, y);
        }
      }
      // ladders — blue rails bolted to the towers
      for (const l of LADDERS) {
        const top = surf(l.lo + 1, l.x);
        const bottom = surf(l.lo, l.x);
        g.rect(l.x - 6, top, 2, bottom - top, RAIL_DK);
        g.rect(l.x - 6, top, 1, bottom - top, RAIL);
        g.rect(l.x + 4, top, 2, bottom - top, RAIL_DK);
        g.rect(l.x + 4, top, 1, bottom - top, RAIL);
        for (let y = top + 3; y < bottom; y += 5) {
          g.rect(l.x - 4, y, 8, 2, RAIL_DK);
          g.rect(l.x - 4, y, 8, 1, RAIL_HI);
        }
      }
      // recycler bin at the bottom left
      const by = surf(0, 8);
      g.rect(0, by - 16, 16, 16, PAL.teal);
      g.rect(0, by - 18, 18, 3, PAL.green);
      g.rect(5, by - 11, 6, 6, PAL.lime);
      if (Math.floor(tick / 8) % 2) g.rect(6, by - 21, 3, 2, PAL.yellow);
      // barrel pile by the robot
      g.sprite(BARREL[1], 36, surf(5, 40) - BR);
      g.sprite(BARREL[1], 36, surf(5, 40) - BR * 2);
      // robot — a glowing wind-up before every throw so a kid can see it coming
      const robotSprite = throwT > 10 ? ROBOT_ARMS : ROBOT;
      const rx = 4;
      const ry = surf(5, 18) - robotSprite.rows.length * 2;
      if (throwT > 18) {
        g.alpha(0.3 + 0.25 * Math.sin(tick * 0.5));
        g.circle(rx + 14, ry + 16, 16, PINK_HI);
        g.alpha(1);
      }
      g.sprite(robotSprite, rx, ry, { scale: 2, flipX: throwT > 0 && throwT <= 10 });
      if (throwT > 10) g.sprite(BARREL[0], rx + 12, ry - 6);
      // kitten
      const kx = 106;
      const ky = 16 - KITTEN[0].rows.length;
      g.sprite(KITTEN[Math.floor(tick / 20) % 2], kx, ky, { flipX: hero.x < kx });
      if (state !== "rescue" && Math.floor(tick / 60) % 3 === 0) g.text("HELP!", kx - 48, 4, PAL.pink);
      // hammers, with a little sparkle so kids spot them against the busy girders
      for (const h of hammers) {
        if (h.taken) continue;
        const hy = surf(h.f, h.x + 4) - 16 + (Math.floor(tick / 15) % 2);
        g.sprite(HAMMER, h.x, hy);
        if (Math.floor(tick / 10) % 3 === 0) g.text("★", h.x - 7, hy - 2, PAL.yellow);
        if (Math.floor(tick / 15) % 3 === 1) g.text("★", h.x + 9, hy + 3, PAL.white);
      }
      // barrels, with a short motion trail while they roll fast
      for (const b of barrels) {
        const y = b.y - hopOf(b);
        if (b.st === "roll" && !b.spring) {
          g.rect(b.x - b.dir * 5, y + 4, 3, 1, GIRDER_DK);
          g.rect(b.x - b.dir * 9, y + 4, 2, 1, TOWER_DK);
        }
        if (b.spring) g.sprite(SPRING, b.x, y);
        else g.sprite(BARREL[b.st === "ladder" ? 1 : Math.floor(b.t / 6) % 2], b.x, y, { flipX: b.dir < 0 });
      }
      // hero
      if (state === "dead") {
        const spin = Math.floor(stateT / 6) % 4;
        if (stateT < 70) g.sprite(HERO_JUMP, hero.x, hero.y, { flipX: spin % 2 === 1, flipY: spin >= 2 });
      } else {
        const flash = hero.hammer > 0 && hero.hammer < 120 && Math.floor(hero.hammer / 4) % 2 === 0;
        if (hero.mode === "climb") {
          g.sprite(flash ? A.heroFlash.climb : HERO_CLIMB, hero.x, hero.y, { flipX: Math.floor(hero.anim * 2) % 2 === 1 });
        } else if (hero.mode === "jump") {
          g.sprite(flash ? A.heroFlash.jump : HERO_JUMP, hero.x, hero.y, { flipX: hero.facing < 0 });
        } else {
          const frame = Math.floor(hero.anim) % 2;
          g.sprite(flash ? A.heroFlash.walk[frame] : HERO_WALK[frame], hero.x, hero.y, { flipX: hero.facing < 0 });
        }
        if (hero.hammer > 0 && !flash) {
          const up = Math.floor(hero.hammer / 8) % 2 === 0;
          if (up) g.sprite(HAMMER, hero.x + 2, hero.y - 11);
          else g.sprite(HAMMER, hero.facing > 0 ? hero.x + 11 : hero.x - 11, hero.y + 2, { flipX: hero.facing < 0 });
        }
      }
      for (const p of parts) {
        if (p.color === "heart") g.text("♥", p.x, p.y, PAL.pink);
        else g.rect(p.x, p.y, 2, 2, p.color);
      }
      for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.5, PAL.white);
      g.camera(0, 0);
      // HUD
      g.text(`♥X${lives}`, 160, 2, PAL.red);
      g.text(`L${level}`, 196, 2, PAL.yellow);
      g.text(`${bonus}`, W - 3, 2, PAL.cyan, { align: "right" });
      if (state === "ready") {
        g.rect(40, 94, W - 80, 30, "rgba(13,11,26,0.75)");
        g.text(`LEVEL ${level}`, W / 2, 100, PAL.yellow, { align: "center" });
        g.text("CLIMB TO THE KITTEN!", W / 2, 112, PAL.white, { align: "center" });
      }
      if (state === "rescue") {
        g.rect(40, 94, W - 80, 30, "rgba(13,11,26,0.75)");
        g.text("KITTEN SAVED!", W / 2, 100, PAL.pink, { align: "center" });
        g.text(level >= LEVELS ? "YOU WIN!" : "NEXT: FASTER!", W / 2, 112, PAL.white, { align: "center" });
      }
    },
  };
}

export const barrelClimb: RetroGameDef = {
  id: "barrel-climb",
  title: "Barrel Climb",
  blurb: "Climb the tower, leap the rolling barrels and rescue the kitten!",
  genre: "Platformer",
  emoji: "🛢️",
  color: "#9a5a32",
  controls: "◀ ▶ walk · ▲ ▼ climb ladders · A jump barrels · grab a hammer to smash them",
  pad: { dpad: "4", a: "Jump" },
  create,
};
