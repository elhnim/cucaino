// STAR BLASTER — a vertical space shooter. Fly your little star fighter through a parallax
// starfield, blast formations of wobbly aliens as they swoop in and dive at you, dodge
// tumbling asteroids, grab power-ups (double shot, shield, speed) and beat a big mothership
// every fourth wave. B fires a smart bomb that clears the screen. (Original game in the
// spirit of 8-bit arcade shooters.)
import { H, PAL, W, clamp, dist, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const SP = { w: PAL.white, c: PAL.cyan, b: PAL.blue, r: PAL.red, g: PAL.grey, k: PAL.black };
const SHIP = sprite(
  ["......w......", ".....wcw.....", ".....wcw.....", "....wcccw....", "....wbbbw....", "...wwbbbww...", "..rwwwbwwwr..", ".rrwwwwwwwrr.", "rrgwwwwwwwgrr", "rr.gwwwwwg.rr", "r...g...g...r"],
  SP,
);
const SHIP_BANK = sprite(
  [".....w......", "....wcw.....", "....wcw.....", "...wcccw....", "...wbbbw....", "..wwbbbww...", ".rwwwbwwwr..", ".rwwwwwwwrr.", "rgwwwwwwwgr.", "r.gwwwwwg.r.", "r..g...g..r."],
  SP,
);

function alienFrames(body: string, eye: string) {
  const pal = { g: body, w: PAL.white, k: PAL.black, e: eye };
  return [
    sprite(["..e....e..", "...k..k...", "..gggggg..", ".ggwggwgg.", "gggkggkggg", "gggggggggg", "g.g.gg.g.g", ".g......g."], pal),
    sprite(["..e....e..", "...k..k...", "..gggggg..", ".ggwggwgg.", "gggkggkggg", "gggggggggg", ".g.g..g.g.", "g........g"], pal),
  ];
}
const ALIENS = [alienFrames(PAL.green, PAL.yellow), alienFrames(PAL.pink, PAL.cyan), alienFrames(PAL.purple, PAL.orange)];
const MOTHER = sprite(
  [
    "..........kkkkkkkkkkkk..........",
    "........kkppppppppppppkk........",
    "......kkppwwppppppppwwppkk......",
    ".....kppppwkppppppppwkppppk.....",
    "....kpppppppppppppppppppppk.....",
    "..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..",
    ".kddddddddddddddddddddddddddddk.",
    "kddyydddyydddyydddyydddyydddyydk",
    "kdddddddddddddddddddddddddddddk.",
    ".kkkddddddddddddddddddddddddkkk.",
    "....kkkkddddddddddddddddkkkk....",
    "........kkrrkkrrkkrrkkrrkk......",
    "..........kk..kk..kk..kk........",
  ],
  { k: PAL.black, p: PAL.purple, w: PAL.white, d: PAL.grey, y: PAL.yellow, r: PAL.red },
);

type Kind = 0 | 1 | 2;
type PowKind = "D" | "S" | "F";
interface Foe {
  kind: Kind;
  x: number;
  y: number;
  hp: number;
  state: "wait" | "enter" | "hold" | "dive";
  t: number;
  delay: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  slotX: number;
  slotY: number;
  vx: number;
  flash: number;
  drop: boolean;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  spin: number;
}
interface Pow {
  x: number;
  y: number;
  kind: PowKind;
  t: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const MAX_PARTS = 160;
const POW_COLOR: Record<PowKind, string> = { D: PAL.orange, S: PAL.cyan, F: PAL.lime };

function create(seed: number): GameInstance {
  const r = rng(seed);
  const ship = { x: W / 2 - 6, y: H - 30, lives: 3, inv: 120, dead: -1, cool: 0, gun: 1, speed: 1.6, shield: 0, bombs: 3, bank: 0 };
  const shots: Shot[] = [];
  const eshots: Shot[] = [];
  const foes: Foe[] = [];
  const rocks: Rock[] = [];
  const pows: Pow[] = [];
  const parts: Part[] = [];
  // starfield: 3 layers, preallocated
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: r.range(0, W), y: r.range(0, H), layer: i % 3 }));
  let wave = 0;
  let waveT = 90; // countdown to the next wave
  let frame = 0;
  let diveT = 200;
  let rockT = 300;
  let flash = 0;
  let shake = 0;
  let over = false;
  const boss = { active: false, x: W / 2 - 32, y: -40, hp: 0, max: 0, t: 0 };

  const burst = (x: number, y: number, n: number, colors: string[]) => {
    for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.4, 2.4);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(14, 32), color: r.pick(colors) });
    }
  };

  const startWave = () => {
    wave++;
    diveT = 180;
    if (wave % 4 === 0) {
      boss.active = true;
      boss.x = W / 2 - 32;
      boss.y = -40;
      boss.max = 50 + wave * 8;
      boss.hp = boss.max;
      boss.t = 0;
      return;
    }
    const count = Math.min(24, 8 + wave * 2);
    const cols = 8;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fromLeft = Math.floor(i / 4) % 2 === 0;
      const kind = (row === 0 && wave > 1 ? 2 : row === 1 ? 1 : 0) as Kind;
      foes.push({
        kind,
        x: -20,
        y: -20,
        hp: kind === 2 ? 2 : 1,
        state: "wait",
        t: 0,
        delay: Math.floor(i / 4) * 40 + (i % 4) * 9,
        sx: fromLeft ? -16 : W + 6,
        sy: r.range(10, 60),
        cx: fromLeft ? W - 40 : 40,
        cy: 170,
        slotX: 36 + col * 24,
        slotY: 26 + row * 18,
        vx: 0,
        flash: 0,
        drop: r.chance(0.12),
      });
    }
  };

  const formX = () => Math.sin(frame * 0.015) * 18;

  const killFoe = (f: Foe, io: IO) => {
    f.hp = 0;
    burst(f.x + 5, f.y + 4, 12, [PAL.yellow, PAL.orange, PAL.white, f.kind === 0 ? PAL.green : f.kind === 1 ? PAL.pink : PAL.purple]);
    io.score(f.state === "dive" ? 150 : f.kind === 2 ? 120 : 80);
    io.sfx.play("explode");
    if (f.drop || r.chance(0.05)) pows.push({ x: f.x, y: f.y, kind: r.pick(["D", "S", "F", "D"] as const), t: 0 });
  };

  const hurtShip = (io: IO) => {
    if (ship.inv > 0 || ship.dead >= 0) return;
    if (ship.shield > 0) {
      ship.shield = 0;
      ship.inv = 60;
      burst(ship.x + 6, ship.y + 5, 14, [PAL.cyan, PAL.white]);
      io.sfx.play("hit");
      return;
    }
    ship.dead = 0;
    shake = 14;
    burst(ship.x + 6, ship.y + 5, 30, [PAL.white, PAL.yellow, PAL.orange, PAL.red]);
    io.sfx.play("die");
  };

  const bomb = (io: IO) => {
    ship.bombs--;
    flash = 20;
    shake = 10;
    eshots.length = 0;
    io.sfx.play("explode");
    for (const f of foes) if (f.hp > 0 && f.state !== "wait" && f.y > -10 && f.y < H) killFoe(f, io);
    for (const k of rocks) {
      k.hp = 0;
      burst(k.x, k.y, 8, [PAL.grey, PAL.tan]);
      io.score(50);
    }
    if (boss.active && boss.y > -20) boss.hp = Math.max(1, boss.hp - 12);
  };

  const aimAt = (x: number, y: number, sp: number) => {
    const a = Math.atan2(ship.y + 5 - y, ship.x + 6 - x);
    eshots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      const inp = io.input;
      shake = Math.max(0, shake - 1);
      flash = Math.max(0, flash - 1);
      for (const s of stars) {
        s.y += 0.3 + s.layer * 0.6;
        if (s.y > H) {
          s.y -= H;
          s.x = r.range(0, W);
        }
      }

      // ── ship ──
      if (ship.dead >= 0) {
        ship.dead++;
        if (ship.dead > 80) {
          ship.lives--;
          if (ship.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          ship.dead = -1;
          ship.x = W / 2 - 6;
          ship.y = H - 30;
          ship.inv = 150;
          ship.gun = Math.max(1, ship.gun - 1);
          ship.speed = 1.6;
        }
      } else {
        ship.inv = Math.max(0, ship.inv - 1);
        ship.shield = Math.max(0, ship.shield - 1);
        const dx = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
        const dy = (inp.held.down ? 1 : 0) - (inp.held.up ? 1 : 0);
        const k = dx && dy ? 0.72 : 1;
        ship.x = clamp(ship.x + dx * ship.speed * k, 0, W - 13);
        ship.y = clamp(ship.y + dy * ship.speed * k, 40, H - 13);
        ship.bank = dx;
        ship.cool = Math.max(0, ship.cool - 1);
        if (inp.held.a && ship.cool === 0 && shots.length < 30) {
          const cx = ship.x + 6;
          if (ship.gun === 1) shots.push({ x: cx, y: ship.y, vx: 0, vy: -5 });
          else {
            shots.push({ x: cx - 4, y: ship.y + 2, vx: 0, vy: -5 }, { x: cx + 4, y: ship.y + 2, vx: 0, vy: -5 });
            if (ship.gun >= 3) shots.push({ x: cx - 5, y: ship.y + 3, vx: -1.2, vy: -4.6 }, { x: cx + 5, y: ship.y + 3, vx: 1.2, vy: -4.6 });
          }
          ship.cool = 8;
          io.sfx.play("shoot");
        }
        if (inp.pressed.b && ship.bombs > 0) bomb(io);
      }

      // ── waves ──
      const waveDone = !boss.active && foes.length === 0;
      if (waveDone) {
        waveT--;
        if (waveT <= 0) {
          startWave();
          waveT = 110;
        }
      }

      // ── foes ──
      const fx = formX();
      const holders: Foe[] = [];
      const fireChance = Math.min(0.004, 0.0002 + wave * 0.0003);
      for (const f of foes) {
        f.flash = Math.max(0, f.flash - 1);
        if (f.state === "wait") {
          if (--f.delay <= 0) {
            f.state = "enter";
            f.t = 0;
          }
          continue;
        }
        if (f.state === "enter") {
          f.t = Math.min(1, f.t + 1 / 90);
          const u = f.t;
          const ex = f.slotX + fx;
          f.x = (1 - u) * (1 - u) * f.sx + 2 * (1 - u) * u * f.cx + u * u * ex;
          f.y = (1 - u) * (1 - u) * f.sy + 2 * (1 - u) * u * f.cy + u * u * f.slotY;
          if (u >= 1) f.state = "hold";
        } else if (f.state === "hold") {
          f.x = f.slotX + fx;
          f.y = f.slotY + Math.sin(frame * 0.05 + f.slotX) * 1.5;
          holders.push(f);
          if (ship.dead < 0 && r.chance(fireChance)) aimAt(f.x + 5, f.y + 8, 1.3 + wave * 0.05);
        } else {
          // dive: swoop down toward the ship, then loop back in from the top
          f.t++;
          const target = ship.x + 1;
          const turn = Math.min(1.6, 0.9 + wave * 0.1);
          f.vx = clamp(f.vx + Math.sign(target - f.x) * 0.04, -turn, turn);
          f.x += f.vx;
          f.y += Math.min(2.4, 1.2 + wave * 0.08);
          if (f.t === 30 && wave > 1 && ship.dead < 0) aimAt(f.x + 5, f.y + 8, 1.6);
          if (f.y > H + 12) {
            f.state = "enter";
            f.t = 0;
            f.sx = f.x;
            f.sy = -12;
            f.cx = f.slotX;
            f.cy = 40;
          }
        }
        if (ship.dead < 0 && ship.inv === 0 && overlap({ x: ship.x + 3, y: ship.y + 2, w: 7, h: 7 }, { x: f.x + 1, y: f.y + 1, w: 8, h: 6 })) {
          hurtShip(io);
          killFoe(f, io);
        }
      }
      diveT--;
      if (diveT <= 0 && holders.length) {
        diveT = Math.max(50, 230 - wave * 15);
        const n = wave > 3 && r.chance(0.4) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const f = r.pick(holders);
          if (f.state !== "hold") continue;
          f.state = "dive";
          f.t = 0;
          f.vx = 0;
          io.sfx.play("blip");
        }
      }

      // ── mothership ──
      if (boss.active) {
        boss.t++;
        if (boss.y < 24) boss.y += 0.5;
        else {
          boss.x = W / 2 - 32 + Math.sin(boss.t * 0.012) * 80;
          const rage = boss.hp < boss.max / 2;
          if (boss.t % (rage ? 60 : 85) === 0) {
            for (let i = -2; i <= 2; i++) eshots.push({ x: boss.x + 32, y: boss.y + 24, vx: i * 0.5, vy: 1.4 });
            io.sfx.play("laser");
          }
          if (boss.t % 50 === 25 && ship.dead < 0) aimAt(boss.x + 8, boss.y + 22, 1.7);
          if (boss.t % 50 === 0 && rage && ship.dead < 0) aimAt(boss.x + 56, boss.y + 22, 1.7);
        }
        if (ship.dead < 0 && overlap({ x: ship.x + 3, y: ship.y + 2, w: 7, h: 7 }, { x: boss.x, y: boss.y + 4, w: 64, h: 20 })) hurtShip(io);
      }

      // ── asteroids ──
      rockT--;
      if (rockT <= 0 && wave > 0) {
        rockT = r.int(Math.max(120, 360 - wave * 20), 480);
        const rad = r.pick([6, 8, 10]);
        rocks.push({ x: r.range(20, W - 20), y: -12, vx: r.range(-0.4, 0.4), vy: r.range(0.6, 1.1), r: rad, hp: rad > 8 ? 4 : 2, spin: r.range(0, 6) });
      }
      for (const k of rocks) {
        k.x += k.vx;
        k.y += k.vy;
        k.spin += 0.03;
        if (k.y > H + 20) k.hp = 0;
        if (ship.dead < 0 && k.hp > 0 && dist(k.x, k.y, ship.x + 6, ship.y + 6) < k.r + 3) hurtShip(io);
      }

      // ── player shots ──
      for (const s of shots) {
        s.x += s.vx;
        s.y += s.vy;
        let hit = false;
        for (const f of foes) {
          if (f.hp > 0 && f.state !== "wait" && overlap({ x: s.x - 1, y: s.y, w: 3, h: 6 }, { x: f.x, y: f.y, w: 10, h: 8 })) {
            hit = true;
            f.hp--;
            f.flash = 6;
            if (f.hp <= 0) killFoe(f, io);
            else io.sfx.play("hit");
            break;
          }
        }
        if (!hit)
          for (const k of rocks) {
            if (k.hp > 0 && dist(s.x, s.y, k.x, k.y) < k.r + 1) {
              hit = true;
              k.hp--;
              burst(s.x, s.y, 3, [PAL.grey, PAL.tan]);
              io.sfx.play("hit");
              if (k.hp <= 0) {
                burst(k.x, k.y, 12, [PAL.grey, PAL.tan, PAL.brown]);
                io.score(50);
                io.sfx.play("explode");
              }
              break;
            }
          }
        if (!hit && boss.active && overlap({ x: s.x - 1, y: s.y, w: 3, h: 6 }, { x: boss.x + 2, y: boss.y, w: 60, h: 22 })) {
          hit = true;
          boss.hp--;
          burst(s.x, s.y, 2, [PAL.yellow, PAL.white]);
          io.sfx.play("hit");
          if (boss.hp <= 0) {
            boss.active = false;
            shake = 24;
            flash = 12;
            for (let i = 0; i < 6; i++) burst(boss.x + r.range(0, 64), boss.y + r.range(0, 24), 14, [PAL.yellow, PAL.orange, PAL.white, PAL.purple]);
            io.score(3000 + wave * 250);
            io.sfx.play("win");
            ship.bombs = Math.min(5, ship.bombs + 1);
            pows.push({ x: boss.x + 28, y: boss.y + 10, kind: "D", t: 0 }, { x: boss.x + 12, y: boss.y + 10, kind: "S", t: 0 });
            eshots.length = 0;
          }
        }
        if (hit || s.y < -8 || s.x < -8 || s.x > W + 8) s.y = -100;
      }

      // ── enemy shots ──
      for (const s of eshots) {
        s.x += s.vx;
        s.y += s.vy;
        if (ship.dead < 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, { x: ship.x + 4, y: ship.y + 3, w: 5, h: 6 })) {
          s.y = H + 100;
          hurtShip(io);
        }
      }

      // ── power-ups ──
      for (const p of pows) {
        p.t++;
        p.y += 0.7;
        p.x += Math.sin(p.t * 0.08) * 0.5;
        if (ship.dead < 0 && overlap({ x: ship.x, y: ship.y, w: 13, h: 11 }, { x: p.x, y: p.y, w: 10, h: 10 })) {
          if (p.kind === "D") ship.gun = Math.min(3, ship.gun + 1);
          else if (p.kind === "S") ship.shield = 900;
          else ship.speed = Math.min(2.6, ship.speed + 0.4);
          io.score(300);
          io.sfx.play("powerup");
          burst(p.x + 5, p.y + 5, 10, [POW_COLOR[p.kind], PAL.white]);
          p.t = -1;
        }
      }

      // ── particles ──
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life--;
      }

      // cleanup
      const keep = <X>(arr: X[], ok: (x: X) => boolean) => {
        for (let i = arr.length - 1; i >= 0; i--) if (!ok(arr[i])) arr.splice(i, 1);
      };
      keep(shots, (s) => s.y > -50);
      keep(eshots, (s) => s.y < H + 10 && s.y > -20 && s.x > -10 && s.x < W + 10);
      keep(foes, (f) => f.hp > 0);
      keep(rocks, (k) => k.hp > 0);
      keep(pows, (p) => p.t >= 0 && p.y < H + 10);
      keep(parts, (p) => p.life > 0);
    },

    draw(g: Gfx) {
      g.clear(PAL.black);
      // nebula blobs + parallax stars
      g.alpha(0.25);
      g.circle(60, ((frame * 0.15) % (H + 120)) - 60, 40, PAL.purple);
      g.circle(200, ((frame * 0.15 + 150) % (H + 120)) - 60, 30, PAL.navy);
      g.alpha(1);
      for (const s of stars) {
        const c = s.layer === 0 ? PAL.dark : s.layer === 1 ? PAL.grey : PAL.white;
        g.rect(s.x, s.y, 1, s.layer === 2 ? 2 : 1, c);
      }
      const sx = shake ? r.range(-2, 2) : 0;
      const sy = shake ? r.range(-2, 2) : 0;
      g.camera(sx, sy);

      for (const k of rocks) {
        g.circle(k.x, k.y, k.r, PAL.dark);
        g.circle(k.x - 1, k.y - 1, k.r - 1, PAL.brown);
        g.circle(k.x + Math.cos(k.spin) * k.r * 0.4, k.y + Math.sin(k.spin) * k.r * 0.4, k.r * 0.3, "#7a4424");
        g.circle(k.x + Math.cos(k.spin + 2.5) * k.r * 0.5, k.y + Math.sin(k.spin + 2.5) * k.r * 0.5, k.r * 0.2, "#7a4424");
      }
      if (boss.active) {
        g.sprite(MOTHER, boss.x, boss.y, { scale: 2 });
        g.circle(boss.x + 32, boss.y + 26, 3 + (boss.t % 20 < 10 ? 1 : 0), PAL.orange);
      }
      for (const f of foes) {
        if (f.state === "wait") continue;
        const frames = ALIENS[f.kind];
        if (f.flash % 2) g.rect(f.x, f.y + 2, 10, 5, PAL.white);
        else g.sprite(frames[Math.floor(frame / 12) % 2], f.x, f.y);
      }
      for (const p of pows) {
        g.rect(p.x, p.y, 10, 10, PAL.black);
        g.rect(p.x + 1, p.y + 1, 8, 8, POW_COLOR[p.kind]);
        g.text(p.kind, p.x + 3, p.y + 2, PAL.black);
      }
      for (const s of shots) {
        g.rect(s.x - 1, s.y, 2, 6, PAL.yellow);
        g.rect(s.x - 1, s.y, 2, 2, PAL.white);
      }
      for (const s of eshots) g.circle(s.x, s.y, 2, Math.floor(frame / 4) % 2 ? PAL.pink : PAL.red);
      // ship
      if (ship.dead < 0 && !(ship.inv > 0 && Math.floor(ship.inv / 4) % 2)) {
        const flame = frame % 6 < 3 ? PAL.orange : PAL.yellow;
        g.rect(ship.x + 5, ship.y + 11, 3, 2 + (frame % 4 < 2 ? 2 : 0), flame);
        g.sprite(ship.bank ? SHIP_BANK : SHIP, ship.x + (ship.bank < 0 ? 1 : 0), ship.y, { flipX: ship.bank < 0 });
        if (ship.shield > 0 && (ship.shield > 120 || frame % 8 < 4)) {
          g.alpha(0.45);
          g.circle(ship.x + 6, ship.y + 6, 10, PAL.cyan);
          g.alpha(1);
        }
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      g.camera(0, 0);
      if (flash) {
        g.alpha(flash / 30);
        g.rect(0, 0, W, H, PAL.white);
        g.alpha(1);
      }
      // HUD
      g.rect(0, 0, W, 11, "rgba(13,11,26,0.6)");
      for (let i = 0; i < ship.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`BOMB ${ship.bombs}`, 50, 2, PAL.orange);
      g.text(`WAVE ${wave}`, W - 4, 2, PAL.cyan, { align: "right" });
      if (boss.active) {
        g.rect(96, 4, 64, 3, PAL.dark);
        g.rect(96, 4, (64 * boss.hp) / boss.max, 3, PAL.pink);
      }
      if (!boss.active && foes.length === 0 && waveT < 100) {
        const next = wave + 1;
        g.text(next % 4 === 0 ? "MOTHERSHIP!" : `WAVE ${next}`, W / 2, H / 2 - 10, next % 4 === 0 ? PAL.pink : PAL.yellow, { align: "center", size: 2 });
        if (wave === 0) g.text("HOLD A TO FIRE  B = BOMB", W / 2, H / 2 + 12, PAL.white, { align: "center" });
      }
    },
  };
}

export const starBlaster: RetroGameDef = {
  id: "star-blaster",
  title: "Star Blaster",
  blurb: "Blast alien waves, dodge rocks and beat the mothership!",
  genre: "Shooter",
  emoji: "🚀",
  color: "#5ef2ff",
  controls: "D-pad fly · A fire (hold) · B smart bomb",
  pad: { dpad: "4", a: "Fire", b: "Bomb" },
  create,
};
