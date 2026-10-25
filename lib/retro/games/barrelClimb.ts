// BARREL CLIMB — a single-screen climbing game. A grumpy robot at the top of the tower
// hurls rolling barrels (and later bouncy springs) down the sloped girders. Climb the
// ladders, jump the barrels for points, grab a hammer to smash them for a few seconds, and
// reach the top to rescue the kitten. Every rescue makes the robot throw faster.
// (Original game in the spirit of 8-bit climbing games.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const LEVELS = 5;
const PW = 10; // hero hitbox
const PH = 14;

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

// ── sprites ──
const HP = { r: PAL.red, s: PAL.tan, k: PAL.black, b: PAL.blue, n: PAL.navy, w: PAL.white };
const H_TOP = ["...rrrr...", "..rrrrrrr.", "..sssss...", "..sksks...", "..sssss...", "...sss....", "..bbbbbb..", ".sbbbbbbs.", ".sbbbbbbs.", "..bbbbbb.."];
const HERO_WALK = [
  sprite([...H_TOP, "..nn..nn..", "..nn..nn..", "..nn..nn..", ".kkk..kkk."], HP),
  sprite([...H_TOP, "...nnnn...", "...nnnn...", "...nn.n...", "...kkkkk.."], HP),
];
const HERO_JUMP = sprite(["...rrrr...", "..rrrrrrr.", "s.sssss..s", "s.sksks..s", "s.sssss..s", ".s.sss..s.", "..bbbbbb..", "..bbbbbb..", "..bbbbbb..", "..bbbbbb..", ".nn....nn.", ".nn....nn.", "kk......kk", ".........."], HP);
const HERO_CLIMB = sprite(["...rrrr...", "..rrrrrr..", "..rrrrrr..", "s.ssssss..", "s..ssss...", "sbbbbbbbs.", "..bbbbbbs.", "..bbbbbb.s", "..bbbbbb..", "..bbbbbb..", "..nn..nn..", "..nn..nn..", "..nn..kk..", "..kk......"], HP);
const RP = { k: PAL.black, g: PAL.grey, r: PAL.red, d: PAL.dark, y: PAL.yellow, w: PAL.white };
const ROBOT = sprite(
  ["..kkkkkkkk..", ".kggggggggk.", ".kgrrggrrgk.", ".kgkrggrkgk.", ".kggggggggk.", ".kgkwkwkwgk.", "kkkggggggkkk", "kgkddddddkgk", "kgkddyyddkgk", "kgkddddddkgk", "..kk....kk..", ".kkk....kkk."],
  RP,
);
const ROBOT_ARMS = sprite(
  ["kk.kkkkkk.kk", "kgkggggggkgk", "kgkrrggrrkgk", "kgkkrggrkkgk", ".kggggggggk.", ".kgkkkkkkgk.", "..kggggggk..", "..kddddddk..", "..kddyyddk..", "..kddddddk..", "..kk....kk..", ".kkk....kkk."],
  RP,
);
const KP = { k: PAL.black, o: PAL.orange, w: PAL.white, p: PAL.pink };
const KITTEN = [
  sprite(["k....k....", "kokkkok...", "kooooook..", "kwkookwk..", "koopooook.", ".kooooookk", ".koooooook", ".kk.k.kk.."], KP),
  sprite(["k....k....", "kokkkok...", "kooooook..", "kwkookwk..", "koopooook.", ".kooooook.", ".kooooookk", ".kk.k.kk.."], KP),
];
const BRP = { k: PAL.black, n: PAL.brown, y: PAL.orange };
const BARREL = [
  sprite(["..kkkkkk..", ".knnnnnnk.", "knyyyyyynk", "knnnnnnnnk", "knnnnnnnnk", "knnnnnnnnk", "knnnnnnnnk", "knyyyyyynk", ".knnnnnnk.", "..kkkkkk.."], BRP),
  sprite(["..kkkkkk..", ".knynnynk.", "knnynnynnk", "knnynnynnk", "knnynnynnk", "knnynnynnk", "knnynnynnk", "knnynnynnk", ".knynnynk.", "..kkkkkk.."], BRP),
];
const SPRING = sprite(["..rrrrrr..", ".rrwwrrrr.", "..kkkkkk..", ".gggggggg.", "..gggggg..", ".gggggggg.", "..gggggg..", ".gggggggg.", "..kkkkkk..", ".kkkkkkkk."], {
  r: PAL.pink,
  w: PAL.white,
  k: PAL.black,
  g: PAL.cyan,
});
const HAMMER = sprite(["kkkkkkkk", "kggggggk", "kggggggk", "kkkkkkkk", "...kk...", "...nn...", "...nn...", "...nn...", "...nn...", "...kk..."], { k: PAL.black, g: PAL.grey, n: PAL.tan });

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

  const heroBox = () => ({ x: hero.x + 2, y: hero.y + 3, w: PW - 4, h: PH - 4 });
  const barrelBox = (b: Barrel) => ({ x: b.x + 2, y: b.y + 2 - hopOf(b), w: 6, h: 7 }); // a little forgiving
  const hopOf = (b: Barrel) => (b.spring && b.st === "roll" ? Math.abs(Math.sin(b.t * 0.085)) * 20 : 0);
  const hammerBox = () =>
    hero.facing > 0 ? { x: hero.x + 4, y: hero.y - 12, w: 18, h: PH + 10 } : { x: hero.x - 12, y: hero.y - 12, w: 18, h: PH + 10 };

  const die = (io: IO) => {
    if (state !== "play") return;
    state = "dead";
    stateT = 0;
    io.sfx.play("die");
    burst(hero.x + 5, hero.y + 7, PAL.yellow, 10);
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
      if (vx && Math.floor(hero.anim) !== Math.floor(hero.anim - Math.abs(vx) * 0.12) && Math.floor(hero.anim) % 2 === 0) io.sfx.play("step");
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
          io.sfx.play("win");
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
      }
      // points for every barrel we sail over
      for (const b of barrels) {
        if (!b.jumped && b.f === hero.f && b.st === "roll" && Math.abs(b.x + 5 - (hero.x + PW / 2)) < 7 && hero.y + PH < b.y - hopOf(b) + 2) {
          b.jumped = true;
          io.sfx.play("coin");
          popText(io, b.spring ? 200 : 100, b.x, b.y - 14);
        }
      }
    }
    // pick up a hammer
    for (const h of hammers) {
      if (!h.taken && hero.mode !== "climb" && overlap({ x: hero.x, y: hero.y, w: PW, h: PH }, { x: h.x, y: surf(h.f, h.x + 4) - 16, w: 8, h: 12 })) {
        h.taken = true;
        hero.hammer = 540;
        io.sfx.play("powerup");
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
        b.y = surf(b.f, b.x + 5) - 10;
        const fl = FLOORS[b.f];
        if (b.f === 0 && b.x < 10) {
          b.t = -1; // into the recycler
          burst(10, b.y + 4, PAL.cyan, 6);
          continue;
        }
        if (b.x + 5 > fl.x2 || b.x + 5 < fl.x1) {
          b.st = "fall";
          b.vy = 0.4;
          continue;
        }
        // sometimes a barrel drops down a ladder (more often if the hero is below)
        if (!b.spring && b.f > 0) {
          const li = LADDERS.findIndex((l, i) => i !== b.lastLadder && l.lo === b.f - 1 && Math.abs(l.x - (b.x + 5)) < sp / 2 + 0.3);
          if (li >= 0) {
            b.lastLadder = li;
            const below = hero.f < b.f && Math.abs(hero.x - LADDERS[li].x) < 60;
            if (r.chance(0.1 + level * 0.03 + (below ? 0.15 : 0))) {
              b.st = "ladder";
              b.lo = LADDERS[li].lo;
              b.x = LADDERS[li].x - 5;
            }
          }
        }
      } else if (b.st === "fall") {
        b.vy = Math.min(4, b.vy + 0.2);
        b.y += b.vy;
        b.x += b.dir * 0.5;
        if (b.f > 0 && b.y + 10 >= surf(b.f - 1, b.x + 5)) {
          b.f--;
          b.dir = rollDir(b.f);
          b.st = "roll";
          b.y = surf(b.f, b.x + 5) - 10;
          if (b.x < 30 || b.x > 200) io.sfx.play("step");
        }
        if (b.y > H + 20) b.t = -1;
      } else {
        b.y += 1.1;
        if (b.y + 10 >= surf(b.lo, b.x + 5)) {
          b.f = b.lo;
          b.dir = rollDir(b.f);
          b.st = "roll";
        }
      }
      if (state !== "play") continue;
      if (hero.hammer > 0 && overlap(hammerBox(), barrelBox(b))) {
        b.t = -1;
        io.sfx.play("explode");
        burst(b.x + 5, b.y + 5 - hopOf(b), b.spring ? PAL.cyan : PAL.orange, 10);
        popText(io, b.spring ? 500 : 300, b.x, b.y - 10);
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
      // robot throws barrels
      robotT--;
      if (robotT <= 0 && throwT === 0) throwT = 36;
      if (throwT > 0) {
        throwT--;
        if (throwT === 10) {
          const spring = level >= 2 && r.chance(0.12 + level * 0.04);
          barrels.push({ x: 48, y: surf(5, 53) - 10, f: 5, dir: 1, st: "roll", vy: 0, lo: 0, t: 0, jumped: false, spring, lastLadder: -1 });
          io.sfx.play(spring ? "bounce" : "shoot");
        }
        if (throwT === 0) robotT = throwGap() + r.int(0, 60);
      }
      updateHero(io);
      updateBarrels(io);
    },

    draw(g: Gfx) {
      g.clear(PAL.night);
      for (let i = 0; i < 40; i++) {
        const tw = (tick + i * 13) % 90 < 6;
        g.rect((i * 73) % W, (i * 41) % H, 1, 1, tw ? PAL.white : PAL.dark);
      }
      g.circle(230, 200, 30, "#231c45");
      // girders
      for (let f = 0; f < FLOORS.length; f++) {
        const fl = FLOORS[f];
        for (let x = fl.x1; x < fl.x2; x += 8) {
          const y = Math.round(surf(f, x + 4));
          g.rect(x, y, 8, 6, f === 6 ? PAL.pink : "#e0405a");
          g.rect(x, y, 8, 1, "#ff9aa8");
          g.rect(x + 3, y + 2, 2, 2, "#7a1a2a");
          g.rect(x, y + 5, 8, 1, "#7a1a2a");
        }
      }
      // ladders
      for (const l of LADDERS) {
        const top = surf(l.lo + 1, l.x);
        const bottom = surf(l.lo, l.x);
        g.rect(l.x - 6, top, 2, bottom - top, PAL.cyan);
        g.rect(l.x + 4, top, 2, bottom - top, PAL.cyan);
        for (let y = top + 3; y < bottom; y += 5) g.rect(l.x - 4, y, 8, 1, PAL.teal);
      }
      // recycler bin at the bottom left
      const by = surf(0, 8);
      g.rect(0, by - 16, 16, 16, PAL.teal);
      g.rect(0, by - 18, 18, 3, PAL.green);
      g.rect(5, by - 11, 6, 6, PAL.lime);
      if (Math.floor(tick / 8) % 2) g.rect(6, by - 21, 3, 2, PAL.yellow);
      // barrel pile by the robot
      g.sprite(BARREL[1], 36, surf(5, 40) - 10);
      g.sprite(BARREL[1], 36, surf(5, 40) - 20);
      // robot
      const rx = 6;
      const ry = surf(5, 18) - 24;
      g.sprite(throwT > 10 ? ROBOT_ARMS : ROBOT, rx, ry, { scale: 2, flipX: throwT > 0 && throwT <= 10 });
      if (throwT > 10) g.sprite(BARREL[0], rx + 7, ry - 10);
      // kitten
      const kx = 108;
      const ky = 16 - 8;
      g.sprite(KITTEN[Math.floor(tick / 20) % 2], kx, ky, { flipX: hero.x < kx });
      if (state !== "rescue" && Math.floor(tick / 60) % 3 === 0) g.text("HELP!", kx - 46, 4, PAL.pink);
      // hammers
      for (const h of hammers) if (!h.taken) g.sprite(HAMMER, h.x, surf(h.f, h.x + 4) - 16 + (Math.floor(tick / 15) % 2));
      // barrels
      for (const b of barrels) {
        const y = b.y - hopOf(b);
        if (b.spring) g.sprite(SPRING, b.x, y);
        else g.sprite(BARREL[b.st === "ladder" ? 1 : Math.floor(b.t / 6) % 2], b.x, y, { flipX: b.dir < 0 });
      }
      // hero
      if (state === "dead") {
        const spin = Math.floor(stateT / 6) % 4;
        if (stateT < 70) g.sprite(HERO_JUMP, hero.x, hero.y, { flipX: spin % 2 === 1, flipY: spin >= 2 });
      } else {
        const flash = hero.hammer > 0 && hero.hammer < 120 && Math.floor(hero.hammer / 4) % 2 === 0;
        if (hero.mode === "climb") g.sprite(HERO_CLIMB, hero.x, hero.y, { flipX: Math.floor(hero.anim * 2) % 2 === 1 });
        else if (hero.mode === "jump") g.sprite(HERO_JUMP, hero.x, hero.y, { flipX: hero.facing < 0 });
        else g.sprite(HERO_WALK[Math.floor(hero.anim) % 2], hero.x, hero.y, { flipX: hero.facing < 0 });
        if (hero.hammer > 0 && !flash) {
          const up = Math.floor(hero.hammer / 8) % 2 === 0;
          if (up) g.sprite(HAMMER, hero.x + 1, hero.y - 11);
          else g.sprite(HAMMER, hero.facing > 0 ? hero.x + 10 : hero.x - 10, hero.y + 2, { flipX: hero.facing < 0 });
        }
      }
      for (const p of parts) {
        if (p.color === "heart") g.text("♥", p.x, p.y, PAL.pink);
        else g.rect(p.x, p.y, 2, 2, p.color);
      }
      for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.5, PAL.white);
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
