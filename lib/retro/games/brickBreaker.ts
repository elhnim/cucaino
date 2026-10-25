// BRICK BREAKER — paddle and ball. Bounce the ball off your paddle to smash every candy
// brick on the board. Silver bricks take two hits, gold take three and metal ones never
// break. Where the ball hits the paddle sets its angle. Catch falling capsules for
// power-ups: W wide paddle, M multi-ball, S slow ball, L laser (fire with B) and a heart
// for an extra life. Eight hand-made boards, then endless surprise boards. Three lives.
import { bake, bayer, gradientColor, hash2, mixHex, noise2, outlined, shade, tinted } from "../art";
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";

const L = 16;
const R = 240;
const TOP = 18;
const BW = 16;
const BH = 8;
const BCOLS = 14;
const BY0 = 30;
const PADDLE_Y = 204;
const PADDLE_H = 7;
const BALL = 6;
const GOLD = mixHex(PAL.yellow, PAL.orange, 0.4);

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

// ── pixel art, built lazily (never at module load) ──

/** a 1px corner-nip mask shared by brick tiles — just enough to read as "very slightly rounded",
 *  not a pill: the brick fills its whole cell, only the four corner pixels are cut. */
function brickMask(x: number, y: number, w: number, h: number, rad = 1): boolean {
  const inCornerX = x < rad || x > w - 1 - rad;
  const inCornerY = y < rad || y > h - 1 - rad;
  if (!inCornerX || !inCornerY) return true;
  const cx = x < rad ? rad : w - 1 - rad;
  const cy = y < rad ? rad : h - 1 - rad;
  return Math.hypot(x - cx, y - cy) <= rad + 0.2;
}
/** is (x, y) on the brick's outer 1-px ring (its own edges, or next to a nipped corner)? */
const onBrickEdge = (x: number, y: number) =>
  x === 0 || y === 0 || x === BW - 1 || y === BH - 1 || !brickMask(x - 1, y, BW, BH) || !brickMask(x + 1, y, BW, BH) || !brickMask(x, y - 1, BW, BH) || !brickMask(x, y + 1, BW, BH);
/** a solid, glossy candy brick that fills its whole BW x BH cell: a lit top edge, a shaded
 *  underside, and 2-3 bold diagonal glossy stripes crossing it (the hard-candy shine). Optional
 *  sparkle flecks for the gold variant. */
function brickTile(color: string, opts: { sparkle?: boolean } = {}): Sprite {
  const outline = shade(color, -0.55);
  const bright = mixHex(color, "#ffffff", 0.55);
  return bake(BW, BH, (x, y) => {
    if (!brickMask(x, y, BW, BH)) return null;
    // a dark 1px outline (its own colour, shaded down) on all four sides so bricks read apart
    if (onBrickEdge(x, y)) return outline;
    // 2-3 bold diagonal glossy stripes (45 degree bands, wide and high-contrast)
    const diag = (((x - y) % 8) + 8) % 8;
    let base = diag < 3 ? bright : color;
    if (opts.sparkle && hash2(x, y, (x * 13 + y * 7 + 31) | 0) > 0.82) base = PAL.white;
    return base;
  });
}
/** the unbreakable metal plate: a solid riveted steel panel, hatched + diagonal brushed sheen */
function metalTile(): Sprite {
  const base = PAL.dark;
  const outline = shade(base, -0.55);
  const bright = shade(base, 0.4);
  return bake(BW, BH, (x, y) => {
    if (!brickMask(x, y, BW, BH)) return null;
    if ((x === 3 || x === BW - 4) && (y === 2 || y === BH - 3)) return shade(PAL.grey, 0.25);
    if (onBrickEdge(x, y)) return outline;
    const diag = (((x - y) % 8) + 8) % 8;
    return diag < 3 ? bright : base;
  });
}
/** the cue-ball: a bright white pearl with a crisp highlight and a faint pink-shaded rim */
function ballSprite(): Sprite {
  const cx = (BALL - 1) / 2;
  const cy = (BALL - 1) / 2;
  const radius = BALL / 2;
  const s = bake(BALL, BALL, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > radius) return null;
    if (dx < -0.2 && dy < -0.2 && d < radius - 0.8) return PAL.white;
    if (d > radius - 1) return shade(PAL.pink, dx + dy > 0.5 ? -0.15 : 0.3);
    return PAL.white;
  });
  return outlined(s, "#4a2550");
}
const CAP_W = 7;
const CAP_H = 11;
/** an upright two-tone medicine capsule, like the painting's: the kind's colour on top, white on
 *  the bottom, a bright gloss streak down the left edge and a seam ring round the middle */
function capsuleTile(color: string): Sprite {
  const w = CAP_W;
  const h = CAP_H;
  const rad = w / 2;
  const cx = (w - 1) / 2;
  return bake(w, h, (x, y) => {
    let inside: boolean;
    if (y < rad) inside = Math.hypot(x - cx, y - (rad - 0.5)) <= rad - 0.3;
    else if (y > h - 1 - rad) inside = Math.hypot(x - cx, y - (h - 1 - (rad - 0.5))) <= rad - 0.3;
    else inside = true;
    if (!inside) return null;
    const base = y < h / 2 ? color : PAL.white;
    const mid = Math.round(h / 2);
    if (y === mid - 1 || y === mid) return shade(PAL.grey, -0.2);
    if (x === 1) return shade(base, 0.45);
    if (x >= w - 2) return shade(base, -0.3);
    return base;
  });
}
/** the board's backdrop: a deep indigo gradient with a soft vignette and candy dust */
function backdropTile(): Sprite {
  const w = R - L;
  const h = H - TOP;
  const stops = [shade(PAL.navy, -0.4), PAL.navy, shade(PAL.navy, -0.2)];
  return bake(w, h, (x, y) => {
    let c = gradientColor(stops, y / Math.max(1, h - 1), x, y);
    const vx = Math.abs(x - w / 2) / (w / 2);
    const vy = Math.abs(y - h / 2) / (h / 2);
    const v = Math.max(0, vx * 0.3 + vy * 0.18 - 0.45);
    if (v > 0) c = shade(c, -v * 0.6);
    if (hash2(x, y, 51) > 0.9985) c = shade(c, 0.4);
    return c;
  });
}
/** a diagonal candy-cane stripe strip (vertical or horizontal), for the playfield border */
function candyStripV(len: number): Sprite {
  return bake(6, len, (x, y) => {
    const t = (((x + y) % 8) + 8) % 8;
    const base = t < 4 ? PAL.pink : PAL.white;
    return y % 4 === 0 ? shade(base, 0.3) : base;
  });
}
function candyStripH(len: number): Sprite {
  return bake(len, 4, (x, y) => {
    const t = (((x + y) % 8) + 8) % 8;
    const base = t < 4 ? PAL.pink : PAL.white;
    return x % 4 === 0 ? shade(base, 0.3) : base;
  });
}

interface Art {
  backdrop: Sprite;
  borderV: Sprite;
  borderH: Sprite;
  ball: Sprite;
  metal: Sprite;
  metalFlash: Sprite;
  brick: Map<string, Sprite>;
  brickFlash: Map<string, Sprite>;
  caps: Record<Cap, Sprite>;
}
let A: Art | null = null;
const art = (): Art =>
  (A ??= (() => {
    const colors = Array.from(new Set<string>([...Object.values(COLORS), PAL.grey, GOLD]));
    const brick = new Map<string, Sprite>();
    const brickFlash = new Map<string, Sprite>();
    for (const c of colors) {
      const s = brickTile(c, { sparkle: c === GOLD });
      brick.set(c, s);
      brickFlash.set(c, tinted(s, PAL.white));
    }
    const metal = metalTile();
    const caps = Object.fromEntries((Object.keys(CAP_COLORS) as Cap[]).map((k) => [k, outlined(capsuleTile(CAP_COLORS[k]))])) as Record<Cap, Sprite>;
    return {
      backdrop: backdropTile(),
      borderV: candyStripV(H - TOP + 8),
      borderH: candyStripH(R - L + 12),
      ball: ballSprite(),
      metal,
      metalFlash: tinted(metal, PAL.white),
      brick,
      brickFlash,
      caps,
    };
  })());

function create(seed: number): GameInstance {
  const gfx = art();
  const r = rng(seed);
  let level = 1;
  let lives = 3;
  let bricks: Brick[] = [];
  let balls: Ball[] = [];
  const caps: { x: number; y: number; kind: Cap; t: number }[] = [];
  const lasers: { x: number; y: number }[] = [];
  const parts: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];
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
  let shake = 0;

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
        if (ch === "3") Object.assign(b, { hp: 3, max: 3, color: GOLD });
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
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: r.range(-1.8, 1.8), vy: r.range(-2, 1), life: r.int(14, 28), color, size: r.chance(0.4) ? 1 : 2 });
  };
  // the painting's candy-shell chips: a shattered brick bursts into pink/white shards
  const burstConfetti = (x: number, y: number, n = 10) => {
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: r.range(-2, 2), vy: r.range(-2.3, 0.6), life: r.int(16, 30), color: r.chance(0.5) ? PAL.white : PAL.pink, size: r.chance(0.4) ? 1 : 2 });
  };

  const damage = (br: Brick, io: IO) => {
    if (br.hp < 0) {
      br.flash = 6;
      io.sfx.play("bounce");
      burst(br.x + BW / 2, br.y + BH / 2, PAL.grey, 3);
      return;
    }
    br.hp--;
    br.flash = 6;
    hits++;
    if (br.hp > 0) {
      io.score(5);
      io.sfx.play("hit");
      burst(br.x + BW / 2, br.y + BH / 2, shade(br.color, -0.2), 4);
      return;
    }
    io.score(br.max === 3 ? 50 : br.max === 2 ? 30 : 10);
    io.sfx.tone(440 + (hits % 8) * 60, 0.05, "square", 0.08);
    if (br.max === 3) {
      io.sfx.play("coin");
      shake = Math.max(shake, 4);
    } else if (br.max === 2) io.sfx.play("pop");
    burstConfetti(br.x + BW / 2, br.y + BH / 2, br.max > 1 ? 16 : 10);
    if (r.chance(0.13)) {
      const roll = r.int(0, 10);
      const kind: Cap = roll < 3 ? "W" : roll < 6 ? "M" : roll < 8 ? "S" : roll < 10 ? "L" : "H";
      caps.push({ x: br.x + (BW - CAP_W) / 2, y: br.y, kind, t: 0 });
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
        io.sfx.slide?.(220, 300, 0.05, "square", 0.05);
      } else if (b.x + BALL > R) {
        b.x = R - BALL;
        b.vx = -Math.abs(b.vx);
        io.sfx.slide?.(220, 300, 0.05, "square", 0.05);
      }
      if (hitBrickAt(b, io)) {
        b.x -= b.vx / n;
        b.vx = -b.vx;
      }
      b.y += b.vy / n;
      if (b.y < TOP) {
        b.y = TOP;
        b.vy = Math.abs(b.vy);
        io.sfx.slide?.(220, 300, 0.05, "square", 0.05);
      }
      if (hitBrickAt(b, io)) {
        b.y -= b.vy / n;
        b.vy = -b.vy;
      }
      // paddle
      if (b.vy > 0 && b.y + BALL >= PADDLE_Y && b.y + BALL <= PADDLE_Y + PADDLE_H - 1 && b.x + BALL > paddle.x - 1 && b.x < paddle.x + paddle.w + 1) {
        const off = clamp((b.x + BALL / 2 - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
        setAngle(b, off * 1.05);
        b.y = PADDLE_Y - BALL;
        io.sfx.play("bounce");
        io.sfx.slide?.(260 + Math.abs(off) * 180, 440, 0.07, "triangle", 0.07);
        burst(b.x + BALL / 2, PADDLE_Y, PAL.cyan, 4);
      }
    }
    normalise(b);
  };

  const applyCap = (kind: Cap, io: IO) => {
    io.score(50);
    io.sfx.play("powerup");
    io.sfx.slide?.(500, 900, 0.12, "sine", 0.08);
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
      shake = Math.max(0, shake - 1);
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
            io.sfx.noise?.(0.5, 0.22, 420, 60);
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
        if (overlap({ x: c.x, y: c.y, w: CAP_W, h: CAP_H }, { x: paddle.x, y: PADDLE_Y, w: paddle.w, h: 6 })) {
          applyCap(c.kind, io);
          c.y = H + 50;
        }
      }
      for (let i = caps.length - 1; i >= 0; i--) if (caps[i].y > H) caps.splice(i, 1);

      if (!bricks.some((b) => b.hp > 0)) {
        clearT = 0;
        io.score(500 + level * 100);
        io.sfx.play("win");
        io.sfx.play("cheer");
        shake = 7;
      } else if (!balls.length) {
        lostT = 0;
        io.sfx.play("die");
        io.sfx.noise?.(0.3, 0.18, 300, 70);
        shake = 10;
        burst(paddle.x + paddle.w / 2, PADDLE_Y, PAL.cyan, 16);
      }
    },

    draw(g) {
      g.clear(PAL.black);
      g.sprite(gfx.backdrop, L, TOP);
      g.sprite(gfx.borderV, L - 6, TOP - 4);
      g.sprite(gfx.borderV, R, TOP - 4);
      g.sprite(gfx.borderH, L - 6, TOP - 4);

      if (shake > 0) g.camera(r.range(-shake * 0.3, shake * 0.3), r.range(-shake * 0.3, shake * 0.3));

      for (const br of bricks) {
        const flashOn = br.flash > 0 && br.flash % 2 === 1;
        const spr = br.hp < 0 ? (flashOn ? gfx.metalFlash : gfx.metal) : flashOn ? gfx.brickFlash.get(br.color) ?? gfx.metal : gfx.brick.get(br.color) ?? gfx.metal;
        g.sprite(spr, br.x, br.y);
        if (br.hp < 0) {
          g.rect(br.x + 2, br.y + 3, 1, 1, PAL.grey);
          g.rect(br.x + 12, br.y + 3, 1, 1, PAL.grey);
        } else if (br.max > 1 && br.hp < br.max) {
          g.line(br.x + 4, br.y + 1, br.x + 7, br.y + 6, PAL.dark);
          if (br.hp === 1 && br.max === 3) g.line(br.x + 11, br.y + 1, br.x + 9, br.y + 6, PAL.dark);
        } else if (br.hp > 0 && br.max === 3 && (frame + br.x) % 90 < 6) g.rect(br.x + ((frame + br.x) % 90) * 2, br.y + 1, 2, 5, "rgba(255,255,255,0.6)");
      }

      for (const c of caps) {
        g.sprite(gfx.caps[c.kind], c.x - 1, c.y - 1);
        g.text(c.kind === "H" ? "♥" : c.kind, c.x + 1, c.y - 8, Math.floor(c.t / 8) % 2 ? PAL.white : PAL.yellow);
      }
      for (const s of lasers) {
        g.rect(s.x - 1, s.y, 4, 7, "rgba(255,255,255,0.3)");
        g.rect(s.x, s.y, 2, 7, frame % 4 < 2 ? PAL.red : PAL.yellow);
      }

      // paddle: a glowing cyan capsule (red while the laser is loaded), with a soft glow halo
      if (lostT < 0) {
        const px = paddle.x;
        const pw = paddle.w;
        const rad = PADDLE_H / 2;
        const base = laserT > 0 ? PAL.red : PAL.cyan;
        g.alpha(0.3);
        g.rect(px - 2, PADDLE_Y - 2, pw + 4, PADDLE_H + 7, base);
        g.alpha(0.5);
        g.rect(px, PADDLE_Y - 1, pw, PADDLE_H + 4, base);
        g.alpha(1);
        g.rect(px + rad, PADDLE_Y, Math.max(0, pw - rad * 2), PADDLE_H, base);
        g.circle(px + rad, PADDLE_Y + rad, rad, base);
        g.circle(px + pw - rad, PADDLE_Y + rad, rad, base);
        g.rect(px + rad, PADDLE_Y, Math.max(0, pw - rad * 2), 1, shade(base, 0.5));
        g.rect(px + rad, PADDLE_Y + 1, Math.max(0, pw - rad * 2), 1, PAL.white);
        g.rect(px + rad, PADDLE_Y + PADDLE_H - 1, Math.max(0, pw - rad * 2), 1, shade(base, -0.4));
        g.circle(Math.round(px + rad * 0.8), Math.round(PADDLE_Y + rad * 0.7), 1, PAL.white);
        g.circle(Math.round(px + pw - rad * 0.8), Math.round(PADDLE_Y + rad * 0.7), 1, PAL.white);
        if (laserT > 0 && frame % 10 < 6) {
          g.rect(px + 1, PADDLE_Y - 2, 2, 2, PAL.yellow);
          g.rect(px + pw - 3, PADDLE_Y - 2, 2, 2, PAL.yellow);
        }
      }
      for (const b of balls) {
        g.rect(b.x - b.vx * 2.2 + 1.5, b.y - b.vy * 2.2 + 1.5, BALL - 3, BALL - 3, "rgba(255,255,255,0.18)");
        g.rect(b.x - b.vx * 1.2 + 1, b.y - b.vy * 1.2 + 1, BALL - 2, BALL - 2, frame % 2 ? "rgba(255,255,255,0.4)" : "rgba(255,111,207,0.35)");
        g.sprite(gfx.ball, b.x - 1, b.y - 1);
      }
      for (const p of parts) g.rect(p.x, p.y, p.size, p.size, p.life % 6 < 3 ? PAL.white : p.color);

      g.camera(0, 0);

      // HUD: a thin framed panel so the readout stands apart from the playfield
      g.alpha(0.55);
      g.rect(0, 0, W, 12, PAL.night);
      g.alpha(1);
      g.rect(0, 11, W, 1, PAL.navy);
      g.text(`LEVEL ${level}`, 4, 3, PAL.yellow);
      let hx = 94;
      const active: [number, Cap][] = [[wideT, "W"], [slowT, "S"], [laserT, "L"]];
      for (const [t, k] of active) {
        if (t <= 0) continue;
        // blink when the power-up is about to run out
        if (t > 120 || Math.floor(t / 8) % 2) g.text(k, hx, 3, CAP_COLORS[k]);
        hx += 10;
      }
      for (let i = 0; i < lives; i++) g.text("♥", 244 - i * 9, 3, PAL.pink);
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
