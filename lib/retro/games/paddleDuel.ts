// PADDLE DUEL — a retro table-tennis showdown. Move your paddle (left) with ▲ ▼ or by
// dragging on the screen, and press A (or tap) to serve. Where the ball meets the paddle
// sets its angle, and a moving paddle adds a curve. Every rally hit speeds the ball up.
// First to 7 wins the match; beat all 3 CPU players (the last is quick!) to take the cup.
// (Original game in the spirit of the very first video games.)
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const TOP = 20; // court walls
const BOT = H - 6;
const PW = 5;
const PH = 30;
const PLAYER_X = 14;
const CPU_X = W - 14 - PW;
const BALL = 4;
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
  let flash = 0;
  let shake = 0;
  let msg = "";
  const trail: { x: number; y: number }[] = [];
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];

  const burst = (x: number, y: number, c: string, n = 8) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: r.range(-2, 2), vy: r.range(-2, 2), life: r.int(10, 22), c });
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
    io.sfx.tone(dir > 0 ? 520 : 390, 0.06, "square", 0.1);
    burst(ball.x + BALL / 2, ball.y + BALL / 2, PAL.white, 6);
    flash = 4;
    if (dir > 0) io.score(10);
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
      msg = "POINT!";
    } else {
      op.score++;
      io.sfx.play("hit");
      msg = `${cpu.name} SCORES`;
    }
    shake = 10;
    burst(ball.x, ball.y, winner === "me" ? PAL.yellow : PAL.red, 16);
    server = winner === "me" ? "cpu" : "me"; // whoever lost the point serves
    state = "point";
    stateT = 70;
    if (me.score >= WIN_AT || op.score >= WIN_AT) {
      state = "match";
      stateT = 170;
      if (me.score >= WIN_AT) {
        io.score(1000 * (ci + 1));
        io.sfx.play("win");
        msg = ci === CPUS.length - 1 ? "CHAMPION!" : `YOU BEAT ${cpu.name}!`;
      } else {
        io.sfx.play("die");
        msg = `${cpu.name} WINS`;
      }
    }
  };

  newMatch();

  return {
    update(io) {
      frame++;
      if (flash > 0) flash--;
      if (shake > 0) shake--;
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
          io.sfx.tone(260, 0.04, "square", 0.07);
        } else if (ball.y > BOT - BALL) {
          ball.y = BOT - BALL;
          ball.vy = -Math.abs(ball.vy);
          ball.curve = 0;
          io.sfx.tone(260, 0.04, "square", 0.07);
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
      const sx = shake > 0 ? (frame % 2 ? 2 : -2) : 0;
      g.clear(PAL.night);
      g.rect(0, TOP, W, BOT - TOP, flash > 0 ? "#22306b" : PAL.navy);
      // walls + net
      g.rect(0, TOP - 4, W, 4, PAL.white);
      g.rect(0, BOT, W, 4, PAL.white);
      for (let y = TOP + 2; y < BOT; y += 12) g.rect(W / 2 - 1 + sx, y, 3, 7, PAL.grey);
      // big retro score digits
      g.text(`${me.score}`, W / 2 - 22 + sx, TOP + 8, PAL.cyan, { align: "right", size: 4 });
      g.text(`${op.score}`, W / 2 + 22 + sx, TOP + 8, cpu.color, { align: "left", size: 4 });
      // paddles
      g.rect(PLAYER_X + sx, me.y, PW, PH, PAL.cyan);
      g.rect(PLAYER_X + 1 + sx, me.y + 2, 2, PH - 4, PAL.white);
      g.rect(CPU_X + sx, op.y, PW, PH, cpu.color);
      g.rect(CPU_X + 2 + sx, op.y + 2, 2, PH - 4, PAL.white);
      // ball + trail
      if (state === "play" || state === "serve") {
        trail.forEach((t, i) => g.rect(t.x + 1 + sx, t.y + 1, 2, 2, i < 3 ? PAL.dark : PAL.grey));
        g.rect(ball.x + sx, ball.y, BALL, BALL, PAL.yellow);
        g.rect(ball.x + sx, ball.y, 2, 2, PAL.white);
      }
      for (const s of sparks) g.rect(s.x, s.y, 2, 2, s.c);

      // HUD
      g.text("YOU", 4, 5, PAL.cyan);
      g.text(`VS ${cpu.name}`, W - 4, 5, cpu.color, { align: "right" });
      g.text(`MATCH ${ci + 1}/3`, W / 2, 5, PAL.white, { align: "center" });
      if (state === "intro") {
        g.rect(40, 90, W - 80, 44, "rgba(13,11,26,0.8)");
        g.text(`MATCH ${ci + 1}`, W / 2, 98, PAL.yellow, { align: "center", size: 2 });
        g.text(`VS ${cpu.name}  FIRST TO ${WIN_AT}`, W / 2, 118, PAL.white, { align: "center" });
      } else if (state === "serve" && server === "me") {
        if (frame % 40 < 28) g.text("PRESS A OR TAP TO SERVE", W / 2, BOT - 16, PAL.white, { align: "center" });
      } else if (state === "point" || state === "match") {
        g.text(msg, W / 2, 100, state === "match" && op.score >= WIN_AT ? PAL.red : PAL.yellow, { align: "center", size: 2 });
        if (state === "match") g.text(`${me.score} - ${op.score}`, W / 2, 124, PAL.white, { align: "center" });
      } else if (state === "play" && rally >= 4) g.text(`RALLY ${rally}`, W / 2, BOT - 14, PAL.grey, { align: "center" });
    },
  };
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
