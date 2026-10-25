// JUNGLE COMMANDO — a side-scrolling run-and-gun. Run right through the jungle, jump the
// pits, blast robot soldiers, turrets and drones, grab weapon capsules and take down the
// giant Robo Fortress at the end. (Original game in the spirit of 8-bit run-and-guns.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const T = 16; // tile size
const COLS = 210;
const GROUND = 11; // default ground row
const GRAV = 0.26;

const P = { k: PAL.black, s: PAL.tan, r: PAL.red, g: PAL.green, b: PAL.blue, w: PAL.white, y: PAL.yellow, d: PAL.dark, n: PAL.brown };
const HERO_RUN = [
  sprite(
    ["....rrrr....", "...rsssss...", "...ssksks...", "...sssss....", "....ggg.....", "..gggggggkkk", "..sggggg....", "...ggggg....", "...bbbbb....", "...bb.bb....", "..bb...bb...", "..kk...kk..."],
    P,
  ),
  sprite(
    ["....rrrr....", "...rsssss...", "...ssksks...", "...sssss....", "....ggg.....", "..gggggggkkk", "..sggggg....", "...ggggg....", "...bbbbb....", "....bbb.....", "....bbb.....", "....kkk....."],
    P,
  ),
];
const HERO_UP = sprite(["........k...", "....rrrrk...", "...rssssk...", "...ssksks...", "...sssss....", "....gggg....", "..gggggg....", "..sggggg....", "...ggggg....", "...bbbbb....", "..bb...bb...", "..kk...kk..."], P);
const HERO_DUCK = sprite(["............", "............", "............", "............", "....rrrr....", "...rsssss...", "...ssksks...", "..gggggggkkk", "..gggggg....", "..bbbbbbb...", ".bb.....bb..", ".kk.....kk.."], P);
const BOT = [
  sprite(["...dddd...", "..dyydyd..", "..dddddd..", "...dddd...", ".rrrrrrrr.", "r.rrrrrr.r", "..rrrrrr..", "..dd..dd..", ".dd....dd.", ".kk....kk."], { d: PAL.grey, y: PAL.yellow, r: PAL.purple, k: PAL.black }),
  sprite(["...dddd...", "..dyydyd..", "..dddddd..", "...dddd...", ".rrrrrrrr.", "r.rrrrrr.r", "..rrrrrr..", "...dddd...", "...dddd...", "...kkkk..."], { d: PAL.grey, y: PAL.yellow, r: PAL.purple, k: PAL.black }),
];
const TURRET = sprite(["....kkkk....", "...kggggk...", "..kgyyyygk..", "..kgyrrygk..", "..kgyyyygk..", ".kkggggggkk.", ".kdddddddddk", "kddddddddddk", "kdkdkdkdkddk", "kkkkkkkkkkkk"], { k: PAL.black, g: PAL.grey, y: PAL.orange, r: PAL.red, d: PAL.dark });
const DRONE = [
  sprite(["kkkk....kkkk", "..k......k..", "..kkkkkkkk..", ".kbbbbbbbbk.", "kbbwwbbwwbbk", ".kbbbbbbbbk.", "..kkkkkkkk.."], { k: PAL.black, b: PAL.pink, w: PAL.white }),
  sprite([".kkk....kkk.", "..k......k..", "..kkkkkkkk..", ".kbbbbbbbbk.", "kbbwwbbwwbbk", ".kbbbbbbbbk.", "..kkkkkkkk.."], { k: PAL.black, b: PAL.pink, w: PAL.white }),
];
const CAPSULE = sprite(["..kkkkkk..", ".kyyyyyyk.", "kyywwwwyyk", "kyyyyyyyyk", ".kyyyyyyk.", "..kkkkkk.."], { k: PAL.black, y: PAL.orange, w: PAL.white });
const PALM = sprite(
  ["..gg...gg...", ".gggg.gggg..", "gg..ggg..gg.", "g...gng...g.", ".....n......", ".....n......", "....nn......", "....n.......", "....n.......", "...nn.......", "...n........", "..nnn......."],
  { g: "#1f7a3c", n: "#5a3a1e" },
);

type Weapon = "N" | "S" | "R";
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Enemy {
  kind: "bot" | "turret" | "drone";
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  t: number;
  w: number;
  h: number;
  baseY?: number;
}
interface Pickup {
  x: number;
  y: number;
  vy: number;
  kind: Weapon | "L";
  flying: boolean;
  t: number;
}
interface Boom {
  x: number;
  y: number;
  t: number;
  big: boolean;
}

function buildLevel(seed: number) {
  const r = rng(seed);
  const ground: number[] = new Array(COLS).fill(GROUND);
  const platforms: { x: number; y: number; w: number }[] = [];
  const turrets: { col: number; row: number }[] = [];
  let col = 18;
  let h = GROUND;
  while (col < COLS - 30) {
    const feature = r.int(0, 5);
    if (feature === 0 && col > 24) {
      // a pit with a platform over it sometimes
      const w = r.int(2, 3);
      for (let i = 0; i < w; i++) ground[col + i] = 99;
      if (r.chance(0.5)) platforms.push({ x: (col - 1) * T, y: (h - 3) * T, w: (w + 2) * T });
      col += w;
    } else if (feature === 1) {
      h = clamp(h + r.pick([-1, 1]), 9, 12);
    } else if (feature === 2) {
      platforms.push({ x: col * T, y: (h - r.int(3, 4)) * T, w: r.int(3, 5) * T });
      if (r.chance(0.45)) turrets.push({ col: col + 1, row: h - 4 });
    } else if (feature === 3) {
      turrets.push({ col, row: h });
    }
    const run = r.int(3, 7);
    for (let i = 0; i < run && col < COLS; i++, col++) if (ground[col] !== 99) ground[col] = h;
  }
  for (; col < COLS; col++) ground[col] = GROUND; // flat arena for the boss
  for (let c = 0; c < 18; c++) ground[c] = GROUND;
  return { ground, platforms, turrets };
}

function create(seed: number): GameInstance {
  const level = buildLevel(7); // the same jungle every time, so kids can learn it
  const r = rng(seed);
  const hero = { x: 40, y: 100, vx: 0, vy: 0, onGround: false, facing: 1, duck: false, aimUp: false, lives: 3, inv: 90, cool: 0, dead: -1, anim: 0 };
  let weapon: Weapon = "N";
  let camX = 0;
  const shots: Bullet[] = [];
  const enemyShots: Bullet[] = [];
  const enemies: Enemy[] = [];
  const pickups: Pickup[] = [];
  const booms: Boom[] = [];
  const spawnedTurrets = new Set<number>();
  let spawnT = 60;
  let droneT = 240;
  let capsuleT = 420;
  const boss = { x: (COLS - 12) * T, hp: 40, cannons: [6, 6], t: 0, active: false, dead: false };
  let won = false;
  let over = false;

  const groundAt = (px: number) => {
    const c = Math.floor(px / T);
    if (c < 0) return GROUND * T;
    if (c >= COLS) return GROUND * T;
    const g = level.ground[c];
    return g === 99 ? 9999 : g * T;
  };
  const surfaceBelow = (x: number, y0: number, y1: number, w: number) => {
    // highest surface the feet cross between y0 -> y1 (ground or one-way platform)
    let best = Infinity;
    for (const fx of [x + 2, x + w - 2]) {
      const g = groundAt(fx);
      if (y0 <= g + 4 && y1 >= g) best = Math.min(best, g);
    }
    for (const p of level.platforms) {
      if (x + w - 2 > p.x && x + 2 < p.x + p.w && y0 <= p.y + 1 && y1 >= p.y) best = Math.min(best, p.y);
    }
    return best;
  };

  const boom = (x: number, y: number, big = false) => booms.push({ x, y, t: 0, big });

  const hurtHero = (io: IO) => {
    if (hero.inv > 0 || hero.dead >= 0) return;
    hero.dead = 0;
    boom(hero.x + 6, hero.y + 6);
    io.sfx.play("die");
  };

  const fire = (io: IO) => {
    let dx = hero.facing;
    let dy = 0;
    const h = io.input.held;
    if (h.up) {
      dy = -1;
      dx = h.left || h.right ? hero.facing : 0;
    } else if (h.down && !hero.onGround) {
      dy = 1;
      dx = h.left || h.right ? hero.facing : 0;
    }
    const len = Math.hypot(dx, dy) || 1;
    const sp = 4.2;
    const mx = hero.x + (dx > 0 ? 12 : dx < 0 ? -2 : 5);
    const my = hero.y + (hero.duck ? 8 : dy < 0 ? -2 : 5);
    const add = (ang: number) => {
      const a = Math.atan2(dy / len, dx / len) + ang;
      shots.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 70 });
    };
    if (weapon === "S") [-0.28, -0.14, 0, 0.14, 0.28].forEach(add);
    else add(0);
    hero.cool = weapon === "R" ? 6 : weapon === "S" ? 16 : 11;
    io.sfx.play("shoot");
  };

  return {
    update(io) {
      if (won || over) return;
      const inp = io.input;
      // ── hero ──
      if (hero.dead >= 0) {
        hero.dead++;
        if (hero.dead > 70) {
          hero.lives--;
          if (hero.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          hero.dead = -1;
          hero.x = camX + 32;
          hero.y = 20;
          hero.vy = 0;
          hero.inv = 150;
          weapon = "N";
        }
      } else {
        hero.inv = Math.max(0, hero.inv - 1);
        hero.duck = inp.held.down && hero.onGround;
        hero.aimUp = inp.held.up;
        const run = hero.duck ? 0 : 1.45;
        hero.vx = inp.held.left ? -run : inp.held.right ? run : 0;
        if (hero.vx) hero.facing = Math.sign(hero.vx);
        if (inp.pressed.a && hero.onGround) {
          hero.vy = -5.4;
          hero.onGround = false;
          io.sfx.play("jump");
        }
        hero.cool = Math.max(0, hero.cool - 1);
        if (inp.held.b && hero.cool === 0) fire(io);

        // horizontal: blocked by steps taller than a small lip
        const nx = clamp(hero.x + hero.vx, camX, (COLS - 1) * T);
        const lead = hero.vx > 0 ? nx + 11 : nx + 1;
        if (groundAt(lead) >= hero.y + 12 - 5 || groundAt(lead) > 9000) hero.x = nx;
        hero.anim += Math.abs(hero.vx) * 0.12;

        const oldY = hero.y;
        hero.vy = Math.min(6, hero.vy + GRAV);
        hero.y += hero.vy;
        hero.onGround = false;
        if (hero.vy >= 0) {
          const s = surfaceBelow(hero.x, oldY + 12, hero.y + 12, 12);
          if (s !== Infinity && !(inp.held.down && inp.pressed.a)) {
            hero.y = s - 12;
            hero.vy = 0;
            hero.onGround = true;
          }
        }
        if (hero.y > H + 20) hurtHero(io);
      }

      // camera: follows, never scrolls back (like the classics)
      const target = clamp(hero.x - 100, 0, COLS * T - W);
      if (!boss.active) camX = Math.max(camX, target);
      if (hero.x > boss.x - 180) {
        boss.active = true;
        camX = Math.max(camX, Math.min(boss.x + 10 * T - W, target));
      }

      // ── spawns ──
      spawnT--;
      if (spawnT <= 0 && !boss.active) {
        spawnT = r.int(50, 110);
        const x = camX + W + 8;
        if (groundAt(x) < 9000) enemies.push({ kind: "bot", x, y: groundAt(x) - 10, vx: -0.8 - r.next() * 0.5, vy: 0, hp: 1, t: 0, w: 10, h: 10 });
      }
      droneT--;
      if (droneT <= 0 && !boss.active) {
        droneT = r.int(160, 300);
        const y = r.range(30, 90);
        enemies.push({ kind: "drone", x: camX + W + 8, y, baseY: y, vx: -1.1, vy: 0, hp: 1, t: r.range(0, 6), w: 12, h: 7 });
      }
      capsuleT--;
      if (capsuleT <= 0 && !boss.active) {
        capsuleT = r.int(500, 800);
        pickups.push({ x: camX + W + 8, y: 50, vy: 0, kind: r.pick(["S", "R", "S", "L"] as const), flying: true, t: 0 });
      }
      level.turrets.forEach((tu, i) => {
        const x = tu.col * T + 2;
        if (!spawnedTurrets.has(i) && x < camX + W + 16 && x > camX) {
          spawnedTurrets.add(i);
          enemies.push({ kind: "turret", x, y: tu.row * T - 10, vx: 0, vy: 0, hp: 3, t: r.int(0, 60), w: 12, h: 10 });
        }
      });

      // ── enemies ──
      for (const e of enemies) {
        e.t++;
        if (e.kind === "bot") {
          e.x += e.vx;
          e.vy = Math.min(5, e.vy + GRAV);
          e.y += e.vy;
          const g = groundAt(e.x + 5);
          if (e.y + 10 >= g && e.y + 10 - e.vy <= g + 4) {
            e.y = g - 10;
            e.vy = 0;
          }
          if (e.y > H + 10) e.hp = 0;
        } else if (e.kind === "drone") {
          e.x += e.vx;
          e.y = (e.baseY ?? 60) + Math.sin(e.t * 0.06) * 18;
          if (e.t % 110 === 60 && hero.dead < 0) {
            const a = Math.atan2(hero.y - e.y, hero.x - e.x);
            enemyShots.push({ x: e.x + 6, y: e.y + 6, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 200 });
          }
        } else if (e.kind === "turret") {
          if (e.t % 100 === 0 && e.x < camX + W && e.x > camX && hero.dead < 0) {
            const a = Math.atan2(hero.y + 4 - e.y, hero.x - e.x);
            enemyShots.push({ x: e.x + 6, y: e.y + 2, vx: Math.cos(a) * 1.7, vy: Math.sin(a) * 1.7, life: 220 });
            io.sfx.play("laser");
          }
        }
        if (hero.dead < 0 && overlap({ x: hero.x + 2, y: hero.y + (hero.duck ? 6 : 1), w: 8, h: hero.duck ? 6 : 11 }, { x: e.x, y: e.y, w: e.w, h: e.h })) hurtHero(io);
      }

      // ── boss: Robo Fortress (two cannons, then the core) ──
      if (boss.active && !boss.dead) {
        boss.t++;
        boss.cannons.forEach((hp, i) => {
          if (hp > 0 && boss.t % (70 + i * 25) === 0) {
            const cy = 60 + i * 60;
            const a = Math.atan2(hero.y - cy, hero.x - boss.x);
            enemyShots.push({ x: boss.x, y: cy, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 240 });
            io.sfx.play("laser");
          }
        });
        if (boss.cannons.every((c) => c <= 0) && boss.t % 45 === 0) {
          for (const a of [-0.5, 0, 0.5]) enemyShots.push({ x: boss.x + 20, y: 120, vx: -2 * Math.cos(a), vy: 2 * Math.sin(a), life: 200 });
        }
      }

      // ── bullets ──
      for (const s of shots) {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (s.x < camX - 8 || s.x > camX + W + 8 || s.y < -8 || s.y > H + 8) s.life = 0;
        for (const e of enemies) {
          if (e.hp > 0 && s.life > 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
            e.hp--;
            s.life = 0;
            io.sfx.play("hit");
            if (e.hp <= 0) {
              boom(e.x + 5, e.y + 5);
              io.score(e.kind === "turret" ? 300 : e.kind === "drone" ? 200 : 100);
              io.sfx.play("explode");
            }
          }
        }
        for (const p of pickups) {
          if (p.flying && s.life > 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: p.x, y: p.y, w: 10, h: 6 })) {
            p.flying = false;
            s.life = 0;
            io.sfx.play("blip");
          }
        }
        if (boss.active && !boss.dead && s.life > 0) {
          boss.cannons.forEach((hp, i) => {
            if (hp > 0 && s.life > 0 && overlap({ x: s.x, y: s.y, w: 2, h: 2 }, { x: boss.x - 6, y: 52 + i * 60, w: 14, h: 16 })) {
              boss.cannons[i]--;
              s.life = 0;
              io.sfx.play("hit");
              if (boss.cannons[i] <= 0) {
                boom(boss.x, 60 + i * 60, true);
                io.score(1000);
              }
            }
          });
          if (s.life > 0 && boss.cannons.every((c) => c <= 0) && overlap({ x: s.x, y: s.y, w: 2, h: 2 }, { x: boss.x + 14, y: 104, w: 18, h: 32 })) {
            boss.hp--;
            s.life = 0;
            io.sfx.play("hit");
            if (boss.hp <= 0) {
              boss.dead = true;
              for (let i = 0; i < 8; i++) boom(boss.x + r.range(0, 60), r.range(30, 170), true);
              io.score(5000 + hero.lives * 1000);
              io.sfx.play("explode");
              won = true;
              io.win();
            }
          }
        }
      }
      for (const s of enemyShots) {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (hero.dead < 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: hero.x + 3, y: hero.y + (hero.duck ? 7 : 2), w: 6, h: hero.duck ? 5 : 9 })) {
          s.life = 0;
          hurtHero(io);
        }
      }

      // ── pickups ──
      for (const p of pickups) {
        p.t++;
        if (p.flying) {
          p.x -= 0.9;
          p.y = 50 + Math.sin(p.t * 0.05) * 20;
        } else {
          p.vy = Math.min(4, p.vy + 0.15);
          p.y += p.vy;
          const g = surfaceBelow(p.x, p.y + 8 - p.vy, p.y + 8, 10);
          if (g !== Infinity) {
            p.y = g - 8;
            p.vy = 0;
          }
        }
        if (!p.flying && hero.dead < 0 && overlap({ x: hero.x, y: hero.y, w: 12, h: 12 }, { x: p.x, y: p.y, w: 10, h: 8 })) {
          if (p.kind === "L") hero.lives = Math.min(5, hero.lives + 1);
          else weapon = p.kind;
          p.t = -1;
          io.score(500);
          io.sfx.play("powerup");
        }
      }

      // cleanup
      const alive = <X extends { life?: number; hp?: number }>(arr: X[], ok: (x: X) => boolean) => {
        for (let i = arr.length - 1; i >= 0; i--) if (!ok(arr[i])) arr.splice(i, 1);
      };
      alive(shots, (s) => s.life > 0);
      alive(enemyShots, (s) => s.life > 0 && s.x > camX - 20 && s.x < camX + W + 20 && s.y > -20 && s.y < H + 20);
      alive(enemies, (e) => e.hp > 0 && e.x > camX - 40);
      alive(pickups as (Pickup & { life?: number })[], (p) => p.t >= 0 && p.x > camX - 20 && p.y < H + 20);
      alive(booms as (Boom & { life?: number })[], (b) => b.t++ < (b.big ? 40 : 24));
    },

    draw(g: Gfx) {
      // sky + parallax jungle
      g.clear("#5cc8ff");
      g.rect(0, 0, W, 50, "#3aa6f0");
      g.circle(210, 36, 16, "#fff6a8");
      for (let i = 0; i < 6; i++) {
        const x = ((i * 90 - camX * 0.2) % (6 * 90) + 6 * 90) % (6 * 90) - 60;
        g.circle(x + 40, 150, 60, "#2f9a5a");
      }
      for (let i = 0; i < 9; i++) {
        const x = ((i * 64 - camX * 0.5) % (9 * 64) + 9 * 64) % (9 * 64) - 40;
        g.sprite(PALM, x, 104, { scale: 2 });
      }
      g.camera(camX, 0);
      // ground
      const c0 = Math.floor(camX / T);
      for (let c = c0; c <= c0 + W / T + 1 && c < COLS; c++) {
        const h = level.ground[c];
        if (h === 99) continue;
        g.rect(c * T, h * T, T, H - h * T, PAL.brown);
        g.rect(c * T, h * T, T, 5, PAL.green);
        g.rect(c * T + 3, h * T + 9, 3, 3, "#7a4424");
        g.rect(c * T + 10, h * T + 17, 3, 3, "#7a4424");
      }
      for (const p of level.platforms) {
        if (p.x > camX + W || p.x + p.w < camX) continue;
        g.rect(p.x, p.y, p.w, 6, "#8a5a2c");
        g.rect(p.x, p.y, p.w, 2, PAL.lime);
      }
      // boss
      if (!boss.dead && boss.x < camX + W + 40) {
        g.rect(boss.x, 30, 60, 160, "#4a4e6a");
        g.rect(boss.x + 4, 34, 52, 152, "#6a6e8a");
        boss.cannons.forEach((hp, i) => {
          if (hp > 0) {
            g.rect(boss.x - 8, 54 + i * 60, 16, 12, PAL.dark);
            g.rect(boss.x - 12, 58 + i * 60, 6, 4, PAL.black);
          }
        });
        const open = boss.cannons.every((c) => c <= 0);
        g.rect(boss.x + 14, 104, 18, 32, open ? (Math.floor(boss.t / 6) % 2 ? PAL.red : PAL.orange) : PAL.dark);
        if (open) g.rect(boss.x + 16, 106 + (40 - boss.hp) * 0.7, 14, Math.max(0, 28 - (40 - boss.hp) * 0.7), PAL.yellow);
      }
      for (const e of enemies) {
        if (e.kind === "bot") g.sprite(BOT[Math.floor(e.t / 8) % 2], e.x, e.y, { flipX: e.vx > 0 });
        else if (e.kind === "drone") g.sprite(DRONE[Math.floor(e.t / 4) % 2], e.x, e.y);
        else g.sprite(TURRET, e.x, e.y);
      }
      for (const p of pickups) {
        if (p.flying) g.sprite(CAPSULE, p.x, p.y);
        else {
          g.rect(p.x, p.y, 10, 8, p.kind === "L" ? PAL.pink : PAL.orange);
          g.text(p.kind === "L" ? "♥" : p.kind, p.x + 3 - camX, p.y + 1, PAL.white); // text ignores the camera
        }
      }
      for (const s of shots) g.rect(s.x - 1, s.y - 1, weapon === "S" ? 3 : 2, weapon === "S" ? 3 : 2, weapon === "R" ? PAL.cyan : PAL.yellow);
      for (const s of enemyShots) g.rect(s.x - 1, s.y - 1, 3, 3, Math.floor(s.life / 4) % 2 ? PAL.red : PAL.white);
      // hero
      if (hero.dead < 0 && !(hero.inv > 0 && Math.floor(hero.inv / 3) % 2)) {
        const spr = hero.duck ? HERO_DUCK : hero.aimUp && !hero.vx ? HERO_UP : HERO_RUN[hero.onGround && hero.vx ? Math.floor(hero.anim) % 2 : 0];
        g.sprite(spr, hero.x, hero.y, { flipX: hero.facing < 0 });
      }
      for (const b of booms) {
        const rr = (b.big ? 14 : 7) * Math.min(1, b.t / 8);
        g.circle(b.x, b.y, rr, b.t % 6 < 3 ? PAL.orange : PAL.yellow);
        if (b.t > 6) g.circle(b.x, b.y, rr * 0.5, PAL.white);
      }
      g.camera(0, 0);
      // HUD
      g.rect(0, 0, W, 11, "rgba(13,11,26,0.55)");
      for (let i = 0; i < hero.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`GUN ${weapon === "N" ? "-" : weapon}`, 64, 2, PAL.yellow);
      const prog = clamp(hero.x / ((COLS - 12) * T), 0, 1);
      g.rect(150, 4, 100, 3, PAL.dark);
      g.rect(150, 4, 100 * prog, 3, PAL.lime);
      if (boss.active && !boss.dead) g.text("ROBO FORTRESS!", W / 2, 16, PAL.red, { align: "center" });
    },
  };
}

export const jungleCommando: RetroGameDef = {
  id: "jungle-commando",
  title: "Jungle Commando",
  blurb: "Run, jump and blast through the robot jungle!",
  genre: "Action",
  emoji: "🪖",
  color: "#3ecf55",
  controls: "◀ ▶ run · ▲ aim up · ▼ duck · A jump · B shoot (hold)",
  pad: { dpad: "4", a: "Jump", b: "Shoot" },
  create,
};
