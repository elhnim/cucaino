// BRICK BREAKER — paddle and ball. Bounce the ball off your paddle to smash every candy
// brick on the board. Silver bricks take two hits, gold take three and metal ones never
// break. Where the ball hits the paddle sets its angle. Catch falling capsules for
// power-ups: W wide paddle, M multi-ball, S slow ball, L laser (fire with B) and a heart
// for an extra life. Eight hand-made boards, then endless surprise boards. Three lives.
import { H, PAL, W, clamp, overlap, rng, type GameInstance, type IO, type RetroGameDef } from "../engine";

const L = 16;
const R = 240;
const TOP = 18;
const BW = 16;
const BH = 8;
const BCOLS = 14;
const BY0 = 30;
const PADDLE_Y = 204;
const BALL = 4;

const COLORS: Record<string, string> = { r: PAL.red, o: PAL.orange, y: PAL.yellow, g: PAL.green, c: PAL.cyan, b: PAL.blue, p: PAL.purple, k: PAL.pink, w: PAL.white, l: PAL.lime };
// ".": empty · letter: 1-hit colour · "2": silver (2 hits) · "3": gold (3 hits) · "#": metal (unbreakable)
const LEVELS: string[][] = [
  ["..............", "rrrrrrrrrrrrrr", "oooooooooooooo", "yyyyyyyyyyyyyy", "llllllllllllll", "cccccccccccccc", "bbbbbbbbbbbbbb"],
  ["..............", "...kkk..kkk...", "..kkkkkkkkkk..", "..kkkk22kkkk..", "..kkkkkkkkkk..", "...kkkkkkkk...", "....kkkkkk....", ".....kkkk.....", "......kk......"],
  ["....yyyyyy....", "..yyyyyyyyyy..", ".yyy2yyyy2yyy.", ".yyyyyyyyyyyy.", ".yy2yyyyyy2yy.", "..yy222222yy..", "....yyyyyy...."],
  ["b.b.b....b.b.b", "bbbbb....bbbbb", "b2b2b....b2b2b", "bbbbbppppbbbbb", "bbbbbp22pbbbbb", "bbbbbp..pbbbbb", "##..........##"],
  ["......rr......", ".....rwwr.....", "....rrrrrr....", "....r2cc2r....", "....rccccr....", "....rrrrrr....", "...orrrrrro...", "..oo.yyyy.oo..", "......yy......"],
  ["..p........p..", "..pp......pp..", "..pppppppppp..", ".pp3pppppp3pp.", ".pppppppppppp.", ".pppppkkppppp.", "..pppppppppp..", "...pppppppp..."],
  ["......gg......", ".....gggg.....", "....gg2ggg....", "...gggggg2gg..", "..gg2ggggggg..", ".gggggg2ggggg.", "......##......", "......##......", "yyyyyyyyyyyyyy"],
  ["33333333333333", "#.....##.....#", "cccccccccccccc", "..#........#..", "bbbbbbbbbbbbbb", "pppppppppppppp", "kkkkkkkkkkkkkk"],
];

interface Brick {
  x: number;
  y: number;
  hp: number; // -1 = metal
  max: number;
  color: string;
  flash: number;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
}
type Cap = "W" | "M" | "S" | "L" | "H";
const CAP_COLORS: Record<Cap, string> = { W: PAL.blue, M: PAL.pink, S: PAL.green, L: PAL.red, H: PAL.purple };

function create(seed: number): GameInstance {
  const r = rng(seed);
  let level = 1;
  let lives = 3;
  let bricks: Brick[] = [];
  let balls: Ball[] = [];
  const caps: { x: number; y: number; kind: Cap; t: number }[] = [];
  const lasers: { x: number; y: number }[] = [];
  const parts: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  const paddle = { x: 112, w: 32 };
  let wideT = 0;
  let slowT = 0;
  let laserT = 0;
  let laserCool = 0;
  let hits = 0;
  let stuckT = 0;
  let clearT = -1;
  let lostT = -1;
  let over = false;
  let frame = 0;

  const buildBoard = () => {
    bricks = [];
    let rows: string[];
    if (level <= LEVELS.length) rows = LEVELS[level - 1];
    else {
      // endless surprise boards: mirrored random patterns
      const n = r.int(6, 9);
      const palette = "royglcbpk";
      rows = [];
      for (let y = 0; y < n; y++) {
        const col = palette[r.int(0, palette.length - 1)];
        let half = "";
        for (let x = 0; x < BCOLS / 2; x++) {
          const roll = r.next();
          half += roll < 0.25 ? "." : roll < 0.33 ? "2" : roll < 0.37 ? "3" : roll < 0.39 && y > 1 ? "#" : col;
        }
        rows.push(half + [...half].reverse().join(""));
      }
    }
    rows.forEach((row, y) => {
      const line = row.padEnd(BCOLS, ".").slice(0, BCOLS);
      for (let x = 0; x < BCOLS; x++) {
        const ch = line[x];
        if (ch === ".") continue;
        const b: Brick = { x: L + x * BW, y: BY0 + y * BH, hp: 1, max: 1, color: COLORS[ch] ?? PAL.white, flash: 0 };
        if (ch === "2") Object.assign(b, { hp: 2, max: 2, color: PAL.grey });
        if (ch === "3") Object.assign(b, { hp: 3, max: 3, color: PAL.yellow });
        if (ch === "#") Object.assign(b, { hp: -1, max: -1, color: PAL.dark });
        bricks.push(b);
      }
    });
    if (!bricks.some((b) => b.hp > 0)) bricks.push({ x: L + 6 * BW, y: BY0, hp: 1, max: 1, color: PAL.pink, flash: 0 });
  };
  const serve = () => {
    balls = [{ x: paddle.x + paddle.w / 2 - BALL / 2, y: PADDLE_Y - BALL, vx: 0, vy: 0, stuck: true }];
    stuckT = 0;
  };
  buildBoard();
  serve();

  const speed = () => (Math.min(3.4, 2.1 + (level - 1) * 0.06) + Math.min(0.8, hits * 0.008)) * (slowT > 0 ? 0.7 : 1);
  const setAngle = (b: Ball, a: number) => {
    const s = speed();
    b.vx = Math.sin(a) * s;
    b.vy = -Math.cos(a) * s;
  };
  const normalise = (b: Ball) => {
    const s = speed();
    const len = Math.hypot(b.vx, b.vy) || 1;
    b.vx = (b.vx / len) * s;
    b.vy = (b.vy / len) * s;
    // never let the ball go nearly flat (it would take forever to come back)
    if (Math.abs(b.vy) < s * 0.3) {
      b.vy = Math.sign(b.vy || 1) * s * 0.3;
      b.vx = Math.sign(b.vx || 1) * Math.sqrt(s * s - b.vy * b.vy);
    }
  };
  const burst = (x: number, y: number, color: string, n = 8) => {
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: r.range(-1.5, 1.5), vy: r.range(-1.5, 1), life: r.int(14, 28), color });
  };

  const damage = (br: Brick, io: IO) => {
    if (br.hp < 0) {
      br.flash = 6;
      io.sfx.play("bounce");
      return;
    }
    br.hp--;
    br.flash = 6;
    hits++;
    if (br.hp > 0) {
      io.score(5);
      io.sfx.play("hit");
      return;
    }
    io.score(br.max === 3 ? 50 : br.max === 2 ? 30 : 10);
    io.sfx.tone(440 + (hits % 8) * 60, 0.05, "square", 0.08);
    burst(br.x + BW / 2, br.y + BH / 2, br.color);
    if (r.chance(0.13)) {
      const roll = r.int(0, 10);
      const kind: Cap = roll < 3 ? "W" : roll < 6 ? "M" : roll < 8 ? "S" : roll < 10 ? "L" : "H";
      caps.push({ x: br.x + 2, y: br.y, kind, t: 0 });
    }
  };

  const hitBrickAt = (b: Ball, io: IO) => {
    const box = { x: b.x, y: b.y, w: BALL, h: BALL };
    for (const br of bricks) {
      if (br.hp === 0) continue;
      if (overlap(box, { x: br.x, y: br.y, w: BW, h: BH })) {
        damage(br, io);
        if (br.hp < 0) {
          // tiny nudge off metal so the ball can't loop forever
          b.vx += r.range(-0.15, 0.15);
        }
        return true;
      }
    }
    return false;
  };

  const moveBall = (b: Ball, io: IO) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / 1.5));
    for (let i = 0; i < n; i++) {
      b.x += b.vx / n;
      if (b.x < L) {
        b.x = L;
        b.vx = Math.abs(b.vx);
        io.sfx.tone(220, 0.03, "square", 0.05);
      } else if (b.x + BALL > R) {
        b.x = R - BALL;
        b.vx = -Math.abs(b.vx);
        io.sfx.tone(220, 0.03, "square", 0.05);
      }
      if (hitBrickAt(b, io)) {
        b.x -= b.vx / n;
        b.vx = -b.vx;
      }
      b.y += b.vy / n;
      if (b.y < TOP) {
        b.y = TOP;
        b.vy = Math.abs(b.vy);
        io.sfx.tone(220, 0.03, "square", 0.05);
      }
      if (hitBrickAt(b, io)) {
        b.y -= b.vy / n;
        b.vy = -b.vy;
      }
      // paddle
      if (b.vy > 0 && b.y + BALL >= PADDLE_Y && b.y + BALL <= PADDLE_Y + 5 && b.x + BALL > paddle.x - 1 && b.x < paddle.x + paddle.w + 1) {
        const off = clamp((b.x + BALL / 2 - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
        setAngle(b, off * 1.05);
        b.y = PADDLE_Y - BALL;
        io.sfx.play("bounce");
      }
    }
    normalise(b);
  };

  const applyCap = (kind: Cap, io: IO) => {
    io.score(50);
    io.sfx.play("powerup");
    if (kind === "W") wideT = 20 * 60;
    else if (kind === "S") slowT = 10 * 60;
    else if (kind === "L") laserT = 15 * 60;
    else if (kind === "H") lives = Math.min(6, lives + 1);
    else if (kind === "M") {
      const add: Ball[] = [];
      for (const b of balls) {
        if (b.stuck) continue;
        const a = Math.atan2(b.vx, -b.vy);
        for (const d of [-0.45, 0.45]) {
          if (balls.length + add.length >= 8) break;
          const nb = { ...b };
          setAngle(nb, clamp(a + d, -1.2, 1.2));
          add.push(nb);
        }
      }
      balls.push(...add);
    }
  };

  return {
    update(io) {
      frame++;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life--;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (const br of bricks) if (br.flash > 0) br.flash--;
      if (over) return;

      if (clearT >= 0) {
        clearT++;
        if (clearT > 100) {
          clearT = -1;
          level++;
          buildBoard();
          caps.length = 0;
          lasers.length = 0;
          serve();
        }
        return;
      }
      if (lostT >= 0) {
        lostT++;
        if (lostT > 60) {
          lostT = -1;
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          wideT = slowT = laserT = 0;
          caps.length = 0;
          serve();
        }
        return;
      }

      // paddle: buttons or finger
      const inp = io.input;
      const targetW = wideT > 0 ? 48 : 32;
      if (paddle.w !== targetW) {
        const c = paddle.x + paddle.w / 2;
        paddle.w += Math.sign(targetW - paddle.w) * 2;
        paddle.x = c - paddle.w / 2;
      }
      if (inp.held.left) paddle.x -= 3.6;
      if (inp.held.right) paddle.x += 3.6;
      if (inp.pointer?.down) {
        const d = inp.pointer.x - (paddle.x + paddle.w / 2);
        paddle.x += clamp(d, -8, 8);
      }
      paddle.x = clamp(paddle.x, L, R - paddle.w);
      wideT = Math.max(0, wideT - 1);
      slowT = Math.max(0, slowT - 1);
      laserT = Math.max(0, laserT - 1);

      // launch
      const launch = inp.pressed.a || !!inp.tap || stuckT > 360;
      for (const b of balls) {
        if (!b.stuck) continue;
        b.x = paddle.x + paddle.w / 2 - BALL / 2;
        b.y = PADDLE_Y - BALL;
        if (launch) {
          b.stuck = false;
          setAngle(b, r.range(-0.4, 0.4));
          io.sfx.play("jump");
        }
      }
      if (balls.some((b) => b.stuck)) stuckT++;

      // laser
      laserCool = Math.max(0, laserCool - 1);
      if (laserT > 0 && inp.held.b && laserCool === 0) {
        lasers.push({ x: paddle.x + 2, y: PADDLE_Y - 4 }, { x: paddle.x + paddle.w - 4, y: PADDLE_Y - 4 });
        laserCool = 14;
        io.sfx.play("laser");
      }
      for (const s of lasers) {
        s.y -= 5;
        for (const br of bricks) {
          if (br.hp !== 0 && s.y > -50 && overlap({ x: s.x, y: s.y, w: 2, h: 6 }, { x: br.x, y: br.y, w: BW, h: BH })) {
            damage(br, io);
            s.y = -99;
            break;
          }
        }
      }
      for (let i = lasers.length - 1; i >= 0; i--) if (lasers[i].y < TOP) lasers.splice(i, 1);

      for (const b of balls) if (!b.stuck) moveBall(b, io);
      balls = balls.filter((b) => b.y < H + 4);
      bricks = bricks.filter((b) => b.hp !== 0);

      for (const c of caps) {
        c.y += 1.1;
        c.t++;
        if (overlap({ x: c.x, y: c.y, w: 12, h: 6 }, { x: paddle.x, y: PADDLE_Y, w: paddle.w, h: 6 })) {
          applyCap(c.kind, io);
          c.y = H + 50;
        }
      }
      for (let i = caps.length - 1; i >= 0; i--) if (caps[i].y > H) caps.splice(i, 1);

      if (!bricks.some((b) => b.hp > 0)) {
        clearT = 0;
        io.score(500 + level * 100);
        io.sfx.play("win");
      } else if (!balls.length) {
        lostT = 0;
        io.sfx.play("die");
        burst(paddle.x + paddle.w / 2, PADDLE_Y, PAL.cyan, 16);
      }
    },

    draw(g) {
      g.clear(PAL.black);
      g.rect(L, TOP, R - L, H - TOP, PAL.night);
      for (let y = TOP; y < H; y += 16) for (let x = L + ((y / 16) % 2) * 8; x < R; x += 16) g.rect(x, y, 8, 8, "#201a40");
      // candy-cane walls
      for (let y = TOP - 4; y < H; y += 8) {
        g.rect(L - 6, y, 6, 4, PAL.pink);
        g.rect(L - 6, y + 4, 6, 4, PAL.white);
        g.rect(R, y, 6, 4, PAL.pink);
        g.rect(R, y + 4, 6, 4, PAL.white);
      }
      for (let x = L - 6; x < R + 6; x += 8) {
        g.rect(x, TOP - 4, 4, 4, PAL.pink);
        g.rect(x + 4, TOP - 4, 4, 4, PAL.white);
      }

      for (const br of bricks) {
        const c = br.flash > 0 && br.flash % 2 ? PAL.white : br.color;
        g.rect(br.x, br.y, BW, BH, PAL.black);
        g.rect(br.x, br.y, BW - 1, BH - 1, c);
        g.rect(br.x, br.y, BW - 1, 1, "rgba(255,255,255,0.55)");
        g.rect(br.x, br.y + BH - 2, BW - 1, 1, "rgba(0,0,0,0.3)");
        if (br.hp < 0) {
          g.rect(br.x + 2, br.y + 3, 1, 1, PAL.grey);
          g.rect(br.x + 12, br.y + 3, 1, 1, PAL.grey);
        } else if (br.max > 1 && br.hp < br.max) {
          g.line(br.x + 4, br.y + 1, br.x + 7, br.y + 5, PAL.dark);
          if (br.hp === 1 && br.max === 3) g.line(br.x + 11, br.y + 1, br.x + 9, br.y + 5, PAL.dark);
        } else if (br.max === 3 && (frame + br.x) % 90 < 6) g.rect(br.x + ((frame + br.x) % 90) * 2, br.y + 1, 2, 5, PAL.white);
      }

      for (const c of caps) {
        const col = CAP_COLORS[c.kind];
        g.rect(c.x + 1, c.y, 10, 6, col);
        g.rect(c.x, c.y + 1, 12, 4, col);
        g.rect(c.x + 1, c.y + 1, 10, 1, "rgba(255,255,255,0.5)");
        g.text(c.kind === "H" ? "♥" : c.kind, c.x + 4, c.y - 1, Math.floor(c.t / 8) % 2 ? PAL.white : PAL.yellow);
      }
      for (const s of lasers) g.rect(s.x, s.y, 2, 6, frame % 4 < 2 ? PAL.red : PAL.yellow);

      // paddle
      if (lostT < 0) {
        const px = paddle.x;
        g.rect(px, PADDLE_Y, paddle.w, 6, PAL.grey);
        g.rect(px + 4, PADDLE_Y + 1, paddle.w - 8, 1, PAL.white);
        g.rect(px, PADDLE_Y, 5, 6, laserT > 0 ? PAL.red : PAL.cyan);
        g.rect(px + paddle.w - 5, PADDLE_Y, 5, 6, laserT > 0 ? PAL.red : PAL.cyan);
        if (laserT > 0) {
          g.rect(px + 2, PADDLE_Y - 2, 2, 2, PAL.yellow);
          g.rect(px + paddle.w - 4, PADDLE_Y - 2, 2, 2, PAL.yellow);
        }
      }
      for (const b of balls) {
        g.rect(b.x - b.vx, b.y - b.vy + 1, 3, 3, "rgba(94,242,255,0.35)");
        g.rect(b.x, b.y, BALL, BALL, PAL.white);
        g.rect(b.x + 1, b.y + 1, 1, 1, PAL.cyan);
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.life % 6 < 3 ? PAL.white : p.color);

      // HUD
      g.text(`LEVEL ${level}`, 4, 4, PAL.yellow);
      let hx = 84;
      const active: [number, Cap][] = [[wideT, "W"], [slowT, "S"], [laserT, "L"]];
      for (const [t, k] of active) {
        if (t <= 0) continue;
        // blink when the power-up is about to run out
        if (t > 120 || Math.floor(t / 8) % 2) g.text(k, hx, 4, CAP_COLORS[k]);
        hx += 10;
      }
      for (let i = 0; i < lives; i++) g.text("♥", 244 - i * 9, 4, PAL.pink);
      if (balls.some((b) => b.stuck) && lostT < 0 && clearT < 0 && Math.floor(frame / 20) % 2)
        g.text("PRESS A TO LAUNCH", W / 2, 150, PAL.white, { align: "center" });
      if (clearT >= 0) {
        g.rect(W / 2 - 60, 120, 120, 14, "rgba(13,11,26,0.75)");
        g.text("BOARD CLEAR!", W / 2, 124, Math.floor(frame / 5) % 2 ? PAL.yellow : PAL.pink, { align: "center" });
      }
    },
  };
}

export const brickBreaker: RetroGameDef = {
  id: "brick-breaker",
  title: "Brick Breaker",
  blurb: "Bounce the ball, smash the candy bricks and catch the power-ups!",
  genre: "Classic",
  emoji: "🏓",
  color: "#ff9a3c",
  controls: "◀ ▶ or slide your finger to move · A launch · B laser (with L power-up)",
  pad: { dpad: "lr", a: "Launch", b: "Laser", tap: true },
  create,
};
