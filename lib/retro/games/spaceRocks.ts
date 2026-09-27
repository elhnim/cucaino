// SPACE ROCKS — drift through a field of tumbling space rocks in a tiny rocket. Turn with
// left/right, thrust with up (you keep sliding, space has no brakes!) and zap the rocks:
// big ones crack into medium ones, then into little pebbles. A grumpy saucer pops by now
// and then, and B warps you somewhere random when things get tight. Clear the field to
// level up. (Original game in the spirit of vector-style arcade shooters.)
import { H, PAL, W, dist, rng, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const M = 16; // wrap margin, so rocks slide fully off-screen before reappearing
const SIZES = [0, 5, 10, 18]; // radius by size 1..3
const PTS = [0, 100, 50, 20];
const VERTS = 11;
const ROCK_COLORS = [PAL.tan, PAL.grey, PAL.orange, PAL.sky, PAL.pink];

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  a: number;
  spin: number;
  shape: number[];
  color: string;
  alive: boolean;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const wrap = (v: number, max: number) => (v < -M ? v + max + 2 * M : v > max + M ? v - max - 2 * M : v);

function create(seed: number): GameInstance {
  const r = rng(seed);
  const ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, lives: 3, inv: 120, dead: -1, cool: 0, warp: 0, thrust: false };
  const rocks: Rock[] = [];
  const shots: Shot[] = [];
  const ufoShots: Shot[] = [];
  const parts: Part[] = [];
  const stars = Array.from({ length: 60 }, () => ({ x: r.range(0, W), y: r.range(0, H), b: r.chance(0.2) }));
  let level = 0;
  let levelT = 0;
  let frame = 0;
  let ufo: { x: number; y: number; vx: number; t: number; hp: number } | null = null;
  let ufoT = 1200;
  let beat = 0;
  let nextLife = 10000;
  let scoreSum = 0;
  let over = false;

  const addScore = (io: IO, p: number) => {
    io.score(p);
    scoreSum += p;
    if (scoreSum >= nextLife) {
      nextLife += 10000;
      ship.lives = Math.min(6, ship.lives + 1);
      io.sfx.play("powerup");
    }
  };

  const makeRock = (x: number, y: number, size: number, speed: number): Rock => {
    const a = r.range(0, Math.PI * 2);
    const sp = speed * r.range(0.6, 1.2) * (size === 1 ? 1.6 : size === 2 ? 1.25 : 1);
    const shape: number[] = [];
    for (let i = 0; i < VERTS; i++) shape.push(r.range(0.7, 1.12));
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size, a: r.range(0, 6), spin: r.range(-0.03, 0.03), shape, color: r.pick(ROCK_COLORS), alive: true };
  };

  const startLevel = () => {
    level++;
    const n = Math.min(8, 2 + level);
    const speed = Math.min(1.1, 0.4 + level * 0.08);
    for (let i = 0; i < n; i++) {
      // spawn along the edges, well away from the ship
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 10; tries++) {
        x = r.chance(0.5) ? r.range(0, W) : r.chance(0.5) ? 0 : W;
        y = x === 0 || x === W ? r.range(0, H) : r.chance(0.5) ? 0 : H;
        if (dist(x, y, ship.x, ship.y) > 80) break;
      }
      rocks.push(makeRock(x, y, 3, speed));
    }
    levelT = 100;
  };

  const burst = (x: number, y: number, n: number, color: string, sp = 1.6) => {
    for (let i = 0; i < n && parts.length < 140; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.2, sp);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(14, 34), color });
    }
  };

  const breakRock = (k: Rock, io: IO) => {
    k.alive = false;
    burst(k.x, k.y, 6 + k.size * 4, k.color);
    addScore(io, PTS[k.size]);
    io.sfx.play(k.size === 3 ? "explode" : "hit");
    if (k.size > 1) {
      const speed = Math.min(1.1, 0.4 + level * 0.08);
      for (let i = 0; i < 2; i++) {
        const c = makeRock(k.x, k.y, k.size - 1, speed);
        c.color = k.color;
        rocks.push(c);
      }
    }
  };

  const hurtShip = (io: IO) => {
    if (ship.dead >= 0 || ship.inv > 0) return;
    ship.dead = 0;
    burst(ship.x, ship.y, 30, PAL.cyan, 2.4);
    burst(ship.x, ship.y, 16, PAL.white, 1.2);
    io.sfx.play("die");
  };

  const safeSpot = () => {
    for (const k of rocks) if (k.alive && dist(k.x, k.y, W / 2, H / 2) < SIZES[k.size] + 30) return false;
    return true;
  };

  startLevel();

  return {
    update(io) {
      if (over) return;
      frame++;
      const inp = io.input;

      // ── ship ──
      if (ship.dead >= 0) {
        ship.dead++;
        if (ship.dead > 90 && (safeSpot() || ship.dead > 300)) {
          ship.lives--;
          if (ship.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          Object.assign(ship, { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, dead: -1, inv: 150 });
        }
      } else {
        ship.inv = Math.max(0, ship.inv - 1);
        ship.cool = Math.max(0, ship.cool - 1);
        ship.warp = Math.max(0, ship.warp - 1);
        if (inp.held.left) ship.a -= 0.075;
        if (inp.held.right) ship.a += 0.075;
        ship.thrust = inp.held.up;
        if (ship.thrust) {
          ship.vx += Math.cos(ship.a) * 0.08;
          ship.vy += Math.sin(ship.a) * 0.08;
          if (frame % 3 === 0 && parts.length < 140)
            parts.push({ x: ship.x - Math.cos(ship.a) * 6, y: ship.y - Math.sin(ship.a) * 6, vx: -Math.cos(ship.a + r.range(-0.4, 0.4)) * 1.2, vy: -Math.sin(ship.a + r.range(-0.4, 0.4)) * 1.2, life: 12, color: r.pick([PAL.orange, PAL.yellow]) });
          if (frame % 8 === 0) io.sfx.play("step");
        }
        const sp = Math.hypot(ship.vx, ship.vy);
        if (sp > 3.2) {
          ship.vx *= 3.2 / sp;
          ship.vy *= 3.2 / sp;
        }
        ship.vx *= 0.992;
        ship.vy *= 0.992;
        ship.x += ship.vx;
        ship.y += ship.vy;
        if (ship.x < 0) ship.x += W;
        if (ship.x > W) ship.x -= W;
        if (ship.y < 0) ship.y += H;
        if (ship.y > H) ship.y -= H;
        if (inp.pressed.a && ship.cool === 0 && shots.length < 6) {
          shots.push({ x: ship.x + Math.cos(ship.a) * 7, y: ship.y + Math.sin(ship.a) * 7, vx: Math.cos(ship.a) * 4 + ship.vx, vy: Math.sin(ship.a) * 4 + ship.vy, life: 52 });
          ship.cool = 5;
          io.sfx.play("shoot");
        }
        if (inp.pressed.b && ship.warp === 0) {
          burst(ship.x, ship.y, 12, PAL.purple);
          ship.x = r.range(20, W - 20);
          ship.y = r.range(20, H - 20);
          ship.vx = ship.vy = 0;
          ship.inv = Math.max(ship.inv, 40); // a moment to get your bearings
          ship.warp = 90;
          burst(ship.x, ship.y, 12, PAL.pink);
          io.sfx.play("powerup");
        }
      }

      // ── rocks ──
      let count = 0;
      for (const k of rocks) {
        if (!k.alive) continue;
        count++;
        k.x = wrap(k.x + k.vx, W);
        k.y = wrap(k.y + k.vy, H);
        k.a += k.spin;
        if (ship.dead < 0 && dist(k.x, k.y, ship.x, ship.y) < SIZES[k.size] * 0.85 + 4) {
          if (ship.inv === 0) {
            hurtShip(io);
            breakRock(k, io);
          }
        }
      }
      // heartbeat that speeds up as the field thins
      if (count > 0 && frame % Math.max(18, 20 + count * 2) === 0) {
        beat ^= 1;
        io.sfx.tone(beat ? 70 : 62, 0.08, "triangle", 0.2);
      }

      // ── shots ──
      for (const s of shots) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0) s.x += W;
        if (s.x > W) s.x -= W;
        if (s.y < 0) s.y += H;
        if (s.y > H) s.y -= H;
        s.life--;
        for (const k of rocks) {
          if (k.alive && s.life > 0 && dist(s.x, s.y, k.x, k.y) < SIZES[k.size] + 1) {
            s.life = 0;
            breakRock(k, io);
            break;
          }
        }
        if (ufo && s.life > 0 && Math.abs(s.x - ufo.x) < 9 && Math.abs(s.y - ufo.y) < 5) {
          s.life = 0;
          addScore(io, 500);
          burst(ufo.x, ufo.y, 24, PAL.lime, 2);
          io.sfx.play("explode");
          ufo = null;
        }
      }

      // ── saucer ──
      ufoT--;
      if (!ufo && ufoT <= 0 && level > 1) {
        ufoT = r.int(1200, 1800);
        const fromLeft = r.chance(0.5);
        ufo = { x: fromLeft ? -10 : W + 10, y: r.range(30, H - 30), vx: fromLeft ? 0.8 : -0.8, t: 0, hp: 1 };
      }
      if (ufo) {
        ufo.t++;
        ufo.x += ufo.vx;
        ufo.y += Math.sin(ufo.t * 0.03) * 0.7;
        if (ufo.t % 20 === 0) io.sfx.tone(ufo.t % 40 ? 520 : 440, 0.05, "square", 0.08);
        if (ufo.t % 100 === 50 && ship.dead < 0) {
          const a = Math.atan2(ship.y - ufo.y, ship.x - ufo.x) + r.range(-0.4, 0.4);
          ufoShots.push({ x: ufo.x, y: ufo.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, life: 120 });
          io.sfx.play("laser");
        }
        if (ship.dead < 0 && ship.inv === 0 && Math.abs(ship.x - ufo.x) < 11 && Math.abs(ship.y - ufo.y) < 7) {
          hurtShip(io);
          ufo = null;
        } else if (ufo.x < -20 || ufo.x > W + 20) ufo = null;
      }
      for (const s of ufoShots) {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (ship.dead < 0 && dist(s.x, s.y, ship.x, ship.y) < 5) {
          s.life = 0;
          hurtShip(io);
        }
      }

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
      }
      for (let i = rocks.length - 1; i >= 0; i--) if (!rocks[i].alive) rocks.splice(i, 1);
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].life <= 0) shots.splice(i, 1);
      for (let i = ufoShots.length - 1; i >= 0; i--) if (ufoShots[i].life <= 0) ufoShots.splice(i, 1);
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);

      // ── level clear ──
      if (levelT > 0) levelT--;
      if (rocks.length === 0 && levelT === 0) {
        addScore(io, 250 * level);
        io.sfx.play("win");
        levelT = -90; // short break, then the next field
      } else if (levelT < 0 && ++levelT === 0) startLevel();
    },

    draw(g: Gfx) {
      g.clear(PAL.black);
      for (const s of stars) g.rect(s.x, s.y, 1, 1, s.b ? PAL.white : PAL.dark);
      g.alpha(0.2);
      g.circle(40, 180, 30, PAL.purple);
      g.alpha(1);

      for (const k of rocks) {
        const R = SIZES[k.size];
        let px = 0;
        let py = 0;
        for (let i = 0; i <= VERTS; i++) {
          const j = i % VERTS;
          const ang = k.a + (j / VERTS) * Math.PI * 2;
          const x = k.x + Math.cos(ang) * R * k.shape[j];
          const y = k.y + Math.sin(ang) * R * k.shape[j];
          if (i > 0) g.line(px, py, x, y, k.color);
          px = x;
          py = y;
        }
        if (k.size > 1) g.rect(k.x + Math.cos(k.a) * R * 0.3, k.y + Math.sin(k.a) * R * 0.3, 2, 2, PAL.dark);
      }

      if (ufo) {
        g.line(ufo.x - 9, ufo.y, ufo.x + 9, ufo.y, PAL.lime);
        g.line(ufo.x - 9, ufo.y, ufo.x - 5, ufo.y + 3, PAL.lime);
        g.line(ufo.x + 9, ufo.y, ufo.x + 5, ufo.y + 3, PAL.lime);
        g.line(ufo.x - 5, ufo.y + 3, ufo.x + 5, ufo.y + 3, PAL.lime);
        g.line(ufo.x - 5, ufo.y, ufo.x - 3, ufo.y - 4, PAL.lime);
        g.line(ufo.x + 5, ufo.y, ufo.x + 3, ufo.y - 4, PAL.lime);
        g.line(ufo.x - 3, ufo.y - 4, ufo.x + 3, ufo.y - 4, PAL.lime);
        g.rect(ufo.x - 1, ufo.y - 2, 2, 1, ufo.t % 20 < 10 ? PAL.yellow : PAL.red);
      }

      for (const s of shots) g.rect(s.x - 1, s.y - 1, 2, 2, PAL.yellow);
      for (const s of ufoShots) g.rect(s.x - 1, s.y - 1, 3, 3, frame % 6 < 3 ? PAL.lime : PAL.white);

      if (ship.dead < 0 && !(ship.inv > 0 && Math.floor(ship.inv / 4) % 2)) {
        const c = Math.cos(ship.a);
        const s = Math.sin(ship.a);
        const pt = (fx: number, fy: number) => [ship.x + c * fx - s * fy, ship.y + s * fx + c * fy];
        const [nx, ny] = pt(8, 0);
        const [lx, ly] = pt(-6, -5);
        const [rx, ry] = pt(-6, 5);
        const [bx, by] = pt(-3, 0);
        g.line(nx, ny, lx, ly, PAL.cyan);
        g.line(nx, ny, rx, ry, PAL.cyan);
        g.line(lx, ly, bx, by, PAL.cyan);
        g.line(rx, ry, bx, by, PAL.cyan);
        const [wx, wy] = pt(2, 0);
        g.rect(wx - 1, wy - 1, 2, 2, PAL.white);
        if (ship.thrust && frame % 4 < 2) {
          const [fx, fy] = pt(-9, 0);
          g.line(bx, by, fx, fy, PAL.orange);
        }
      }
      for (const p of parts) g.rect(p.x, p.y, 1, 1, p.color);

      // HUD
      for (let i = 0; i < ship.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`LEVEL ${level}`, W - 4, 2, PAL.grey, { align: "right" });
      if (ship.warp === 0 && ship.dead < 0) g.text("B:WARP", W / 2, 2, PAL.purple, { align: "center" });
      if (levelT > 0) g.text(`LEVEL ${level}`, W / 2, H / 2 - 24, PAL.yellow, { align: "center", size: 2 });
      if (levelT < 0) g.text("FIELD CLEAR!", W / 2, H / 2 - 8, PAL.lime, { align: "center", size: 2 });
    },
  };
}

export const spaceRocks: RetroGameDef = {
  id: "space-rocks",
  title: "Space Rocks",
  blurb: "Spin, thrust and zap tumbling space rocks to pebbles!",
  genre: "Shooter",
  emoji: "☄️",
  color: "#9aa0b8",
  controls: "◀ ▶ turn · ▲ thrust · A shoot · B warp",
  pad: { dpad: "4", a: "Shoot", b: "Warp" },
  create,
};
