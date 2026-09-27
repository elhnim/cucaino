// BALLOON FLAP — a one-button flyer. Puff your little balloon upward with A (or a tap on the
// screen) while gravity tugs it down, and float through the gaps between candy-cane pillars.
// Grab coins on the way. Later the pillars start sliding up and down and silly birds flap
// across. One bump pops the balloon, so it's all about "one more go!". (Original game in the
// spirit of one-touch flyers.)
import { H, PAL, W, dist, rng, sprite, type GameInstance, type Gfx, type RetroGameDef } from "../engine";

const GRAV = 0.14;
const FLAP = -2.9;
const BX = 64; // balloon x (screen stays put, the world scrolls)
const BR = 6; // balloon hit radius
const PIL_W = 24;
const SPACING = 124;
const GROUND = H - 16;

const BALLOON = sprite(
  ["....kkkk....", "..kkppppkk..", ".kppwwppppk.", ".kpwwppppppk", "kppwppppppk.", "kppkppkpppk.", "kppppppppppk", "kpppkkkppppk", ".kppppppppk.", ".kppppppppk.", "..kppppppk..", "...kkppkk...", ".....kk.....", "............"],
  { k: PAL.black, p: PAL.pink, w: PAL.white },
);
const BIRD = [
  sprite(["..kk........", ".kwwk..kkk..", "kwwwwkkyyyk.", ".kwwwwwwwwkk", "..kwwwwwwk..", "...kkkkkk..."], { k: PAL.black, w: PAL.white, y: PAL.orange }),
  sprite(["............", ".......kkk..", "..kkkkkyyyk.", ".kwwwwwwwwkk", "kwwwwwwwwk..", ".kk.kkkkk..."], { k: PAL.black, w: PAL.white, y: PAL.orange }),
];
const COIN = [
  sprite(["..kkk..", ".kyyyk.", "kyywyyk", "kyywyyk", "kyywyyk", ".kyyyk.", "..kkk.."], { k: PAL.black, y: PAL.yellow, w: PAL.white }),
  sprite(["..kk...", ".kyyk..", ".kywk..", ".kywk..", ".kywk..", ".kyyk..", "..kk..."], { k: PAL.black, y: PAL.yellow, w: PAL.white }),
];

interface Pillar {
  x: number;
  gapY: number; // centre of the gap
  baseY: number;
  gap: number;
  amp: number;
  phase: number;
  passed: boolean;
}
interface Coin {
  x: number;
  y: number;
  got: boolean;
}
interface Bird {
  x: number;
  y: number;
  baseY: number;
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

function create(seed: number): GameInstance {
  const r = rng(seed);
  const b = { y: H / 2 - 20, vy: 0, t: 0, puff: 0 };
  const pillars: Pillar[] = [];
  const coins: Coin[] = [];
  const birds: Bird[] = [];
  const parts: Part[] = [];
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 50 + r.range(0, 30), y: r.range(14, 90), s: r.range(0.7, 1.3) }));
  let started = false;
  let popped = -1;
  let over = false;
  let passed = 0;
  let scroll = 0;
  let frame = 0;
  let nextX = W + 40;

  const speed = () => Math.min(2, 1.2 + passed * 0.025);

  const addPillar = (x: number) => {
    const gap = Math.max(58, 84 - passed * 1.1);
    const gapY = r.range(30 + gap / 2, GROUND - 16 - gap / 2);
    const moving = passed >= 8 && r.chance(Math.min(0.6, 0.25 + (passed - 8) * 0.03));
    const amp = moving ? Math.min(26, 10 + (passed - 8)) : 0;
    const clampedY = Math.max(30 + gap / 2 + amp, Math.min(GROUND - 16 - gap / 2 - amp, gapY));
    pillars.push({ x, gapY: clampedY, baseY: clampedY, gap, amp, phase: r.range(0, 6), passed: false });
    coins.push({ x: x + PIL_W / 2, y: clampedY, got: false });
    // a bonus coin floating between pillars
    if (r.chance(0.6)) coins.push({ x: x + PIL_W + SPACING / 2 - 6, y: r.range(40, GROUND - 40), got: false });
    if (passed >= 12 && r.chance(Math.min(0.5, 0.15 + (passed - 12) * 0.02))) {
      const y = r.range(40, GROUND - 40);
      birds.push({ x: x + PIL_W + SPACING / 2 + 30, y, baseY: y, t: r.range(0, 6) });
    }
  };

  const burst = (x: number, y: number, n: number, colors: string[], sp = 2) => {
    for (let i = 0; i < n && parts.length < 90; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.3, sp);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, life: r.int(16, 36), color: r.pick(colors) });
    }
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      const inp = io.input;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.life--;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);

      if (popped >= 0) {
        if (++popped > 50) {
          over = true;
          io.gameOver();
        }
        return;
      }

      const flap = inp.pressed.a || inp.tap !== null;
      if (!started) {
        b.t++;
        b.y = H / 2 - 20 + Math.sin(b.t * 0.08) * 4;
        if (!flap) return;
        started = true;
      }
      if (flap) {
        b.vy = FLAP;
        b.puff = 8;
        io.sfx.play("jump");
        burst(BX, b.y + 14, 3, [PAL.white, PAL.sky], 0.8);
      }
      b.puff = Math.max(0, b.puff - 1);
      b.vy = Math.min(3.6, b.vy + GRAV);
      b.y += b.vy;
      if (b.y < 8) {
        b.y = 8;
        b.vy = Math.max(0, b.vy);
      }

      const sp = speed();
      scroll += sp;
      nextX -= sp;
      if (nextX < W + 40) {
        addPillar(nextX + 30);
        nextX += SPACING;
      }

      const pop = () => {
        popped = 0;
        burst(BX, b.y, 30, [PAL.pink, PAL.white, PAL.yellow, PAL.purple], 2.6);
        io.sfx.play("die");
      };

      if (b.y + BR >= GROUND) return pop();

      for (const p of pillars) {
        p.x -= sp;
        if (p.amp) p.gapY = p.baseY + Math.sin(frame * 0.03 + p.phase) * p.amp;
        // circle vs the two pillar rectangles
        const top = p.gapY - p.gap / 2;
        const bot = p.gapY + p.gap / 2;
        const cx = Math.max(p.x - 3, Math.min(BX, p.x + PIL_W + 3));
        if (dist(cx, Math.min(b.y, top), BX, b.y) < BR - 1 || dist(cx, Math.max(b.y, bot), BX, b.y) < BR - 1) return pop();
        if (!p.passed && p.x + PIL_W < BX - BR) {
          p.passed = true;
          passed++;
          io.score(100);
          io.sfx.play("blip");
        }
      }
      for (const c of coins) {
        c.x -= sp;
        if (!c.got && dist(c.x, c.y, BX, b.y) < BR + 4) {
          c.got = true;
          io.score(50);
          io.sfx.play("coin");
          burst(c.x, c.y, 8, [PAL.yellow, PAL.white]);
        }
      }
      for (const bd of birds) {
        bd.t++;
        bd.x -= sp + 0.7;
        bd.y = bd.baseY + Math.sin(bd.t * 0.06) * 14;
        if (dist(bd.x + 6, bd.y + 3, BX, b.y) < BR + 4) return pop();
      }
      for (let i = pillars.length - 1; i >= 0; i--) if (pillars[i].x < -PIL_W - 10) pillars.splice(i, 1);
      for (let i = coins.length - 1; i >= 0; i--) if (coins[i].got || coins[i].x < -10) coins.splice(i, 1);
      for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x < -16) birds.splice(i, 1);
    },

    draw(g: Gfx) {
      g.clear("#8fd3ff");
      g.rect(0, 0, W, 40, "#6cb6ff");
      g.rect(0, 40, W, 20, "#7cc4ff");
      g.circle(206, 38, 16, "#fff6a8");
      for (const c of clouds) {
        const x = ((((c.x - scroll * 0.2 * c.s) % (W + 60)) + W + 60) % (W + 60)) - 30;
        g.circle(x, c.y, 9 * c.s, PAL.white);
        g.circle(x + 10 * c.s, c.y + 3, 7 * c.s, PAL.white);
        g.circle(x - 9 * c.s, c.y + 4, 6 * c.s, PAL.white);
      }
      // candy hills
      for (let i = 0; i < 6; i++) {
        const x = ((((i * 70 - scroll * 0.4) % 420) + 420) % 420) - 60;
        g.circle(x, GROUND + 10, 38, i % 2 ? "#ffb3e6" : "#c9a3ff");
      }
      // pillars
      for (const p of pillars) {
        const top = p.gapY - p.gap / 2;
        const bot = p.gapY + p.gap / 2;
        const seg = (y0: number, y1: number) => {
          if (y1 <= y0) return;
          g.rect(p.x, y0, PIL_W, y1 - y0, PAL.white);
          const off = Math.floor(y0) % 10;
          for (let y = y0 - off; y < y1; y += 10) {
            const a = Math.max(y0, y);
            const bb = Math.min(y1, y + 5);
            if (bb > a) g.rect(p.x, a, PIL_W, bb - a, PAL.red);
          }
          g.rect(p.x + PIL_W - 4, y0, 4, y1 - y0, "rgba(13,11,26,0.18)");
          g.rect(p.x + 3, y0, 2, y1 - y0, "rgba(255,255,255,0.5)");
        };
        seg(0, top - 8);
        seg(bot + 8, GROUND);
        // caps
        g.rect(p.x - 3, top - 8, PIL_W + 6, 8, PAL.black);
        g.rect(p.x - 2, top - 7, PIL_W + 4, 6, PAL.pink);
        g.rect(p.x - 3, bot, PIL_W + 6, 8, PAL.black);
        g.rect(p.x - 2, bot + 1, PIL_W + 4, 6, PAL.pink);
        g.rect(p.x, bot + 2, PIL_W, 1, PAL.white);
        g.rect(p.x, top - 6, PIL_W, 1, PAL.white);
      }
      for (const c of coins) g.sprite(COIN[Math.floor((frame + c.x) / 10) % 2], c.x - 3, c.y - 3);
      for (const bd of birds) g.sprite(BIRD[Math.floor(bd.t / 8) % 2], bd.x, bd.y);
      // ground
      g.rect(0, GROUND, W, H - GROUND, "#3ecf55");
      g.rect(0, GROUND, W, 3, PAL.lime);
      for (let x = -(scroll % 16); x < W; x += 16) g.rect(x, GROUND + 7, 8, 3, "#2fa846");
      // balloon + string
      if (popped < 0) {
        const sway = Math.sin(frame * 0.15) * 2;
        g.line(BX, b.y + 7, BX + sway, b.y + 14, PAL.dark);
        g.line(BX + sway, b.y + 14, BX - sway * 0.5, b.y + 19, PAL.dark);
        g.rect(BX - 3 - sway * 0.5, b.y + 19, 6, 4, PAL.brown);
        g.rect(BX - 3 - sway * 0.5, b.y + 19, 6, 1, PAL.tan);
        g.sprite(BALLOON, BX - 6, b.y - 7 + (b.puff > 4 ? 1 : 0));
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      // HUD
      g.text(String(passed), W / 2, 12, PAL.white, { align: "center", size: 2 });
      if (!started) {
        g.text("BALLOON FLAP", W / 2, 60, PAL.pink, { align: "center", size: 2 });
        g.text("TAP OR PRESS A TO PUFF UP!", W / 2, 150, PAL.navy, { align: "center" });
      }
      if (popped >= 0) g.text("POP!", BX + 14, b.y - 10, PAL.red, { size: 2 });
    },
  };
}

export const balloonFlap: RetroGameDef = {
  id: "balloon-flap",
  title: "Balloon Flap",
  blurb: "Puff your balloon through the candy-cane pillars!",
  genre: "Action",
  emoji: "🎈",
  color: "#ff6fcf",
  controls: "A or tap the screen to puff up · don't bump anything!",
  pad: { dpad: "none", a: "Flap", tap: true },
  create,
};
