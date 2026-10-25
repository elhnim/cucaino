// PADDLE DUEL — a retro table-tennis showdown. Move your paddle (left) with ▲ ▼ or by
// dragging on the screen, and press A (or tap) to serve. Where the ball meets the paddle
// sets its angle, and a moving paddle adds a curve. Every rally hit speeds the ball up.
// First to 7 wins the match; beat all 3 CPU players (the last is quick!) to take the cup.
// Look: a glowing neon court on a deep night-blue void, cyan frame on all four sides, a
// comet-tailed ball and shaded paddles that pop and flash on contact — the cabinet's look.
// (Original game in the spirit of the very first video games.)
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, hash2, mixHex, outlined, shade, tinted } from "../art";

const TOP = 20; // court walls (gameplay bounds — unchanged)
const BOT = H - 6;
const PW = 6;
const PH = 38;
const PLAYER_X = 14;
const CPU_X = W - 14 - PW;
const BALL = 6;
const WIN_AT = 7;

interface Cpu {
  name: string;
  color: string;
  speed: number; // max paddle speed at 0-0
  ramp: number; // extra speed per point played
  error: number; // how far off (px) its aim can be
  react: number; // how close the ball must be before it tracks it
  cap: number; // top ball speed in this match
}
const CPUS: Cpu[] = [
  { name: "PIPPO", color: PAL.lime, speed: 1.5, ramp: 0.05, error: 14, react: 150, cap: 5.2 },
  { name: "MARLA", color: PAL.orange, speed: 2.1, ramp: 0.07, error: 10, react: 175, cap: 5.8 },
  { name: "ZIPPY", color: PAL.pink, speed: 2.8, ramp: 0.08, error: 7, react: 205, cap: 6.4 },
];

// ── baked art (lazy — never bake inside the draw loop) ──
interface Art {
  bg: Sprite;
  paddle: Record<string, Sprite>;
  flash: Record<string, Sprite>;
  ball: Sprite;
}
let A: Art | null = null;
const art = (): Art => (A ??= makeArt());

/** a shaded, rounded, outlined paddle in one colour — a soft cylinder of light */
function bakePaddle(color: string): Sprite {
  const body = bake(PW, PH, (x, y) => {
    if ((x === 0 || x === PW - 1) && (y === 0 || y === PH - 1)) return null; // clipped corners
    const edge = x / (PW - 1);
    let c = edge < 0.4 ? shade(color, 0.32) : edge > 0.7 ? shade(color, -0.28) : color;
    if (y === 0 || y === PH - 1) c = shade(c, -0.2);
    if (y === 1 || y === PH - 2) c = shade(c, -0.08);
    return c;
  });
  return outlined(body);
}

/** a glowing white ball — lit from the upper-left, cool blue falloff at the rim */
function bakeBall(): Sprite {
  const d = BALL + 2;
  const r = d / 2;
  const body = bake(d, d, (x, y) => {
    const dx = x + 0.5 - r;
    const dy = y + 0.5 - r;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > r) return null;
    if (dx < -r * 0.1 && dy < -r * 0.1 && dist < r * 0.55) return "#ffffff";
    const t = clamp(dist / r, 0, 1);
    return mixHex("#ffffff", "#aab8f5", t * 0.75);
  });
  return outlined(body);
}

/** the court: a deep night-blue void with a soft vignette, faint scanlines and a scatter of
 *  distant light motes — the backdrop layer behind the frame, net and players */
function bakeBg(): Sprite {
  const top = "#090c22";
  const bot = "#141d4a";
  return bake(W, H, (x, y) => {
    const t = y / (H - 1);
    let c = mixHex(top, bot, t);
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.5) c = shade(c, -0.14 * clamp((d - 0.5) / 0.6, 0, 1));
    if ((y & 1) === 1) c = shade(c, -0.035);
    if (hash2(x, y, 11) > 0.999) c = shade(c, 0.35);
    return c;
  });
}

function makeArt(): Art {
  const paddle: Record<string, Sprite> = {};
  const flash: Record<string, Sprite> = {};
  for (const c of [PAL.cyan, ...CPUS.map((p) => p.color)]) {
    const s = bakePaddle(c);
    paddle[c] = s;
    flash[c] = tinted(s, "#ffffff");
  }
  return { bg: bakeBg(), paddle, flash, ball: bakeBall() };
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let ci = 0;
  let cpu = CPUS[0];
  let me = { y: H / 2 - PH / 2, vy: 0, score: 0 };
  let op = { y: H / 2 - PH / 2, vy: 0, score: 0, aim: 0 };
  const ball = { x: 0, y: 0, vx: 0, vy: 0, curve: 0, speed: 2.2 };
  let server: "me" | "cpu" = "me";
  let state: "intro" | "serve" | "play" | "point" | "match" | "won" | "lost" = "intro";
  let stateT = 120;
  let rally = 0;
  let frame = 0;
  let flashT = 0;
  let shake = 0;
  let meHit = 0;
  let opHit = 0;
  let msg = "";
  const trail: { x: number; y: number }[] = [];
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; c: string }[] = [];

  const burst = (x: number, y: number, c: string, n = 8) => {
    for (let i = 0; i < n; i++) {
      const life = r.int(10, 22);
      sparks.push({ x, y, vx: r.range(-2, 2), vy: r.range(-2, 2), life, maxLife: life, c });
    }
  };
  const newMatch = () => {
    cpu = CPUS[ci];
    me = { y: H / 2 - PH / 2, vy: 0, score: 0 };
    op = { y: H / 2 - PH / 2, vy: 0, score: 0, aim: 0 };
    server = "me";
    state = "intro";
    stateT = 130;
  };
  const holdBall = () => {
    ball.speed = 2.2 + ci * 0.3;
    ball.curve = 0;
    rally = 0;
    trail.length = 0;
    if (server === "me") {
      ball.x = PLAYER_X + PW + 1;
      ball.y = me.y + PH / 2 - BALL / 2;
    } else {
      ball.x = CPU_X - BALL - 1;
      ball.y = op.y + PH / 2 - BALL / 2;
    }
  };
  const serve = (io: IO) => {
    const dir = server === "me" ? 1 : -1;
    const a = r.range(-0.45, 0.45);
    ball.vx = Math.cos(a) * ball.speed * dir;
    ball.vy = Math.sin(a) * ball.speed;
    state = "play";
    io.sfx.play("blip");
    io.sfx.noise?.(0.1, 0.05, 300, 900);
  };
  /** the ball meets a paddle: angle from the contact point, curve from the paddle's motion */
  const hitPaddle = (io: IO, py: number, pvy: number, dir: number) => {
    const rel = clamp((ball.y + BALL / 2 - (py + PH / 2)) / (PH / 2), -1, 1);
    rally++;
    ball.speed = Math.min(cpu.cap, ball.speed + 0.14);
    const a = rel * 1.0;
    ball.vx = Math.cos(a) * ball.speed * dir;
    ball.vy = Math.sin(a) * ball.speed;
    ball.curve = clamp(pvy * 0.012, -0.05, 0.05);
    const pitch = (dir > 0 ? 520 : 390) + ball.speed * 18;
    io.sfx.tone(pitch, 0.06, "square", 0.1);
    if (dir > 0) {
      meHit = 10;
      io.score(10);
    } else opHit = 10;
    if (rally > 0 && rally % 4 === 0) io.sfx.slide?.(pitch, pitch + 220, 0.09, "square", 0.08);
    burst(ball.x + BALL / 2, ball.y + BALL / 2, PAL.white, 7);
    flashT = 4;
    // the CPU picks a fresh aiming error for the next return: bigger when the ball is fast,
    // and long rallies make it more likely to misjudge completely (so rallies always end)
    const whiff = clamp(0.05 + rally * 0.02 - ci * 0.01, 0.03, 0.35);
    op.aim = r.chance(whiff) ? (r.chance(0.5) ? -1 : 1) * (PH / 2 + 8) : r.range(-cpu.error, cpu.error) * Math.max(1, ball.speed / 3);
  };
  const point = (io: IO, winner: "me" | "cpu") => {
    if (winner === "me") {
      me.score++;
      io.score(100 + rally * 5);
      io.sfx.play("coin");
      io.sfx.slide?.(500, 920, 0.22, "sine", 0.12);
      msg = "POINT!";
    } else {
      op.score++;
      io.sfx.play("thud");
      io.sfx.slide?.(480, 220, 0.22, "sawtooth", 0.1);
      msg = `${cpu.name} SCORES`;
    }
    shake = 10;
    burst(ball.x, ball.y, winner === "me" ? PAL.yellow : PAL.red, 18);
    server = winner === "me" ? "cpu" : "me"; // whoever lost the point serves
    state = "point";
    stateT = 70;
    if (me.score >= WIN_AT || op.score >= WIN_AT) {
      state = "match";
      stateT = 170;
      if (me.score >= WIN_AT) {
        io.score(1000 * (ci + 1));
        io.sfx.play("win");
        io.sfx.play("cheer");
        msg = ci === CPUS.length - 1 ? "CHAMPION!" : `YOU BEAT ${cpu.name}!`;
      } else {
        io.sfx.play("die");
        io.sfx.noise?.(0.3, 0.1, 500, 90);
        msg = `${cpu.name} WINS`;
      }
    }
  };

  newMatch();

  return {
    update(io) {
      frame++;
      if (flashT > 0) flashT--;
      if (shake > 0) shake--;
      if (meHit > 0) meHit--;
      if (opHit > 0) opHit--;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        if (--s.life <= 0) sparks.splice(i, 1);
      }
      if (state === "won" || state === "lost") return;

      // ── player paddle: buttons or finger ──
      const inp = io.input;
      const oldY = me.y;
      if (inp.pointer?.down) me.y += clamp(inp.pointer.y - PH / 2 - me.y, -6, 6);
      else {
        if (inp.held.up) me.y -= 3.4;
        if (inp.held.down) me.y += 3.4;
      }
      me.y = clamp(me.y, TOP, BOT - PH);
      me.vy = me.y - oldY;

      // ── CPU paddle ──
      const pts = me.score + op.score;
      const cpuSpeed = cpu.speed + cpu.ramp * pts;
      let target = H / 2 - PH / 2;
      if (state === "play" && ball.vx > 0 && CPU_X - ball.x < cpu.react) {
        // predict where the ball will arrive (bouncing off the walls)
        let py = ball.y;
        let vy = ball.vy;
        const steps = (CPU_X - ball.x) / Math.max(0.5, ball.vx);
        for (let i = 0; i < steps && i < 200; i++) {
          py += vy;
          if (py < TOP || py > BOT - BALL) vy = -vy;
        }
        target = py + BALL / 2 - PH / 2 + op.aim;
      } else if (state === "serve" && server === "cpu") target = op.y;
      const oy = op.y;
      op.y += clamp(target - op.y, -cpuSpeed, cpuSpeed);
      op.y = clamp(op.y, TOP, BOT - PH);
      op.vy = op.y - oy;

      if (state === "intro" || state === "point" || state === "match") {
        stateT--;
        if (state !== "match" && stateT <= 0) {
          state = "serve";
          stateT = 60;
        } else if (state === "match" && stateT <= 0) {
          if (me.score >= WIN_AT) {
            if (ci >= CPUS.length - 1) {
              state = "won";
              io.win();
            } else {
              ci++;
              newMatch();
            }
          } else {
            state = "lost";
            io.gameOver();
          }
        }
        if (state === "intro" || state === "point" || state === "match") return;
      }

      if (state === "serve") {
        holdBall();
        if (server === "me") {
          if (inp.pressed.a || inp.tap) serve(io);
        } else if (--stateT <= 0) serve(io);
        return;
      }

      // ── ball (sub-stepped so it never skips through a paddle) ──
      ball.vy += ball.curve;
      ball.curve *= 0.985;
      const steps = Math.ceil(Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) / 2);
      for (let s = 0; s < steps && state === "play"; s++) {
        ball.x += ball.vx / steps;
        ball.y += ball.vy / steps;
        if (ball.y < TOP) {
          ball.y = TOP;
          ball.vy = Math.abs(ball.vy);
          ball.curve = 0;
          io.sfx.tone(300, 0.04, "square", 0.07);
        } else if (ball.y > BOT - BALL) {
          ball.y = BOT - BALL;
          ball.vy = -Math.abs(ball.vy);
          ball.curve = 0;
          io.sfx.tone(220, 0.04, "square", 0.07);
        }
        if (ball.vx < 0 && ball.x <= PLAYER_X + PW && ball.x + BALL >= PLAYER_X && ball.y + BALL >= me.y - 1 && ball.y <= me.y + PH + 1) {
          ball.x = PLAYER_X + PW;
          hitPaddle(io, me.y, me.vy, 1);
        } else if (ball.vx > 0 && ball.x + BALL >= CPU_X && ball.x <= CPU_X + PW && ball.y + BALL >= op.y - 1 && ball.y <= op.y + PH + 1) {
          ball.x = CPU_X - BALL;
          hitPaddle(io, op.y, op.vy, -1);
        }
        if (ball.x < -BALL) point(io, "cpu");
        else if (ball.x > W) point(io, "me");
      }
      if (frame % 2 === 0) {
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 6) trail.shift();
      }
    },

    draw(g: Gfx) {
      const a = art();
      const shakeX = shake > 0 ? (frame % 2 ? 2 : -2) : 0;
      const pulse = (Math.sin(frame * 0.07) + 1) / 2;

      g.clear("#05061a");
      g.camera(shakeX, 0);
      g.sprite(a.bg, 0, 0);
      drawFrame(g, pulse);
      drawNet(g);

      // big retro score digits (shifted with the court on impact)
      g.text(`${me.score}`, W / 2 - 22, TOP + 8, PAL.cyan, { align: "right", size: 4 });
      g.text(`${op.score}`, W / 2 + 22, TOP + 8, cpu.color, { align: "left", size: 4 });

      // paddles
      drawPaddle(g, PLAYER_X, me.y, PAL.cyan, meHit);
      drawPaddle(g, CPU_X, op.y, cpu.color, opHit);

      // ball + comet trail
      if (state === "play" || state === "serve") drawBall(g, a, trail, ball, cpu.cap);

      // sparks (fade out as they die)
      for (const s of sparks) {
        g.alpha(clamp(s.life / s.maxLife, 0, 1));
        g.rect(s.x - 1, s.y - 1, 2, 2, s.c);
      }
      g.alpha(1);

      if (flashT > 0) {
        g.alpha(0.2 * (flashT / 4));
        g.rect(0, TOP, W, BOT - TOP, "#ffffff");
        g.alpha(1);
      }
      g.camera(0, 0);

      // HUD
      g.text("YOU", 4, 5, PAL.cyan);
      g.text(`VS ${cpu.name}`, W - 4, 5, cpu.color, { align: "right" });
      g.text(`MATCH ${ci + 1}/3`, W / 2, 5, PAL.white, { align: "center" });

      if (state === "intro") {
        g.rect(40, 86, W - 80, 52, "rgba(9,10,28,0.85)");
        g.box(40, 86, W - 80, 52, PAL.cyan);
        g.text(`MATCH ${ci + 1}`, W / 2, 94, PAL.yellow, { align: "center", size: 2 });
        g.text(`VS ${cpu.name}  FIRST TO ${WIN_AT}`, W / 2, 114, PAL.white, { align: "center" });
        drawStars(g, W / 2, 128, CPUS.length, ci);
      } else if (state === "serve" && server === "me") {
        if (frame % 40 < 28) g.text("PRESS A OR TAP TO SERVE", W / 2, BOT - 16, PAL.white, { align: "center" });
      } else if (state === "point" || state === "match") {
        const winColor = msg === "POINT!" || (state === "match" && me.score >= WIN_AT) ? PAL.yellow : PAL.red;
        g.alpha(0.22);
        g.circle(W / 2, 100, 50, winColor);
        g.alpha(1);
        g.text(msg, W / 2, 100, winColor, { align: "center", size: 2 });
        if (state === "match") g.text(`${me.score} - ${op.score}`, W / 2, 124, PAL.white, { align: "center" });
      } else if (state === "play" && rally >= 4) g.text(`RALLY ${rally}`, W / 2, BOT - 14, PAL.grey, { align: "center" });
    },
  };
}

// ── draw helpers (kept out of the per-frame hot path as plain functions, cheap primitive calls) ──

function drawFrame(g: Gfx, pulse: number) {
  const bright = PAL.cyan;
  const dim = shade(PAL.cyan, -0.45);
  const fx0 = 6;
  const fx1 = W - 6;
  const fy0 = TOP - 4;
  const fy1 = BOT + 4;
  g.alpha(0.85 + pulse * 0.15);
  g.rect(0, fy0, W, 2, dim);
  g.rect(0, fy0 + 2, W, 2, bright);
  g.rect(0, BOT, W, 2, bright);
  g.rect(0, BOT + 2, W, 2, dim);
  g.rect(fx0, fy0, 2, fy1 - fy0, dim);
  g.rect(fx0 + 2, fy0, 2, fy1 - fy0, bright);
  g.rect(fx1 - 4, fy0, 2, fy1 - fy0, bright);
  g.rect(fx1 - 2, fy0, 2, fy1 - fy0, dim);
  g.alpha(1);
  g.rect(fx0, fy0, 6, 2, PAL.white);
  g.rect(fx1 - 6, fy0, 6, 2, PAL.white);
  g.rect(fx0, BOT + 2, 6, 2, PAL.white);
  g.rect(fx1 - 6, BOT + 2, 6, 2, PAL.white);
}

function drawNet(g: Gfx) {
  for (let y = TOP + 4; y < BOT - 4; y += 14) {
    g.rect(W / 2 - 2, y, 4, 8, shade(PAL.cyan, -0.35));
    g.rect(W / 2 - 1, y, 2, 8, PAL.cyan);
  }
}

function drawPaddle(g: Gfx, x: number, y: number, color: string, hit: number) {
  const a = art();
  const s = a.paddle[color] ?? a.paddle[PAL.cyan];
  const fl = a.flash[color] ?? a.flash[PAL.cyan];
  const w = PW + 2;
  const h = PH + 2;
  const pop = hit > 0 ? 1 + Math.min(hit, 8) * 0.012 : 1;
  const sw = w * pop;
  const sh = h * pop;
  const ox = x - 1 - (sw - w) / 2;
  const oy = y - 1 - (sh - h) / 2;
  g.alpha(0.2);
  g.rect(x - 3, y - 4, PW + 6, PH + 8, color);
  g.alpha(1);
  g.sprite(s, ox, oy, { scale: pop });
  if (hit > 0) {
    g.alpha(Math.min(1, hit / 10) * 0.5);
    g.sprite(fl, ox, oy, { scale: pop });
    g.alpha(1);
  }
}

function drawBall(
  g: Gfx,
  a: Art,
  trail: { x: number; y: number }[],
  ball: { x: number; y: number; speed: number },
  cap: number,
) {
  trail.forEach((t, i) => {
    const k = (i + 1) / trail.length;
    g.alpha(0.1 + k * 0.4);
    const sz = 2 + k * 3;
    g.rect(t.x + BALL / 2 - sz / 2, t.y + BALL / 2 - sz / 2, sz, sz, mixHex(PAL.dark, PAL.white, k * 0.7));
  });
  g.alpha(1);
  const cx = ball.x + BALL / 2;
  const cy = ball.y + BALL / 2;
  const heat = clamp((ball.speed - 2.2) / Math.max(0.5, cap - 2.2), 0, 1);
  g.alpha(0.15 + heat * 0.25);
  g.circle(cx, cy, BALL / 2 + 3 + heat * 2, mixHex(PAL.white, PAL.cyan, 0.3));
  g.alpha(1);
  const size = BALL + 4;
  g.sprite(a.ball, cx - size / 2, cy - size / 2);
}

function drawStars(g: Gfx, cx: number, y: number, count: number, lit: number) {
  const span = (count - 1) * 12;
  for (let i = 0; i < count; i++) g.text("★", cx - span / 2 + i * 12, y, i < lit ? PAL.yellow : PAL.dark, { align: "center" });
}

export const paddleDuel: RetroGameDef = {
  id: "paddle-duel",
  title: "Paddle Duel",
  blurb: "Retro table tennis! Beat 3 CPU players to win the cup.",
  genre: "Sports",
  emoji: "🎾",
  color: "#ffffff",
  controls: "▲ ▼ or drag on the screen to move · A or tap to serve · first to 7 wins",
  pad: { dpad: "ud", a: "Serve", tap: true },
  create,
};
