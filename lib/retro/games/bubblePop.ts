// BUBBLE POP — a bubble shooter. Aim the bubble cannon, bounce shots off the side walls and
// stick them to the bubble cluster above. Three or more of the same colour pop, and any
// bubbles left hanging with nothing holding them up fall away for bonus points. Every few
// shots the candy ceiling presses down one row — clear the board before the bubbles reach
// the line at the bottom! Tap anywhere above the cannon to aim and fire in one go.
import { clamp, H, PAL, W, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeGradient, hash2, outlined, ramp, shade } from "../art";

const FL = 48;
const FR = 208;
const FT = 14;
const RAD = 8;
const ROW_H = 14;
const MAXR = 16;
const DEADLINE = 184;
const CX = 128;
const CY = 204;
const COLORS = [PAL.red, PAL.yellow, PAL.green, PAL.blue, PAL.purple, PAL.orange] as const;
const GOLD = "#d9a23c";
const AIM_MIN = -1.3;
const AIM_MAX = 1.3;
const BARREL_FRAMES = 21;
const BUBBLE_D = 15;
const BARREL_L = 20;
const MUZZLE_DIST = 17;

const colsIn = (r: number) => (r % 2 ? 9 : 10);

function neighbours(r: number, c: number): [number, number][] {
  const odd = r % 2 === 1;
  const out: [number, number][] = [[r, c - 1], [r, c + 1]];
  const dc = odd ? [0, 1] : [-1, 0];
  for (const dr of [-1, 1]) for (const d of dc) out.push([r + dr, c + d]);
  return out.filter(([rr, cc]) => rr >= 0 && rr < MAXR && cc >= 0 && cc < colsIn(rr));
}

// ── baked art (built once, lazily, at the start of a round — never at module load) ──

/** a glossy pixel-art sphere: lit from the top-left, rim-darkened at the edge, with a bright
 *  specular highlight and a small secondary glint, like a hard-candy marble */
function bubbleGlossPixel(dx: number, dy: number, R: number, tone: string[]): string | null {
  const d = Math.hypot(dx, dy);
  if (d > R) return null;
  const nx = dx / R;
  const ny = dy / R;
  let t = (1 - (nx * 0.58 + ny * 0.78)) / 2; // 0 = lit, 1 = shadowed
  if (d / R > 0.86) t = Math.min(1, t + 0.32); // dark rim
  const idx = Math.min(3, Math.max(0, Math.floor((1 - t) * 4)));
  let col = tone[idx];
  const hd = Math.hypot(dx - R * -0.4, dy - R * -0.5);
  if (hd < R * 0.34) col = shade(col, 0.55 * (1 - hd / (R * 0.34)));
  if (hd < R * 0.13) col = "#ffffff";
  if (Math.hypot(dx - R * 0.32, dy - R * 0.12) < R * 0.16) col = shade(col, 0.2);
  return col;
}
function bakeBubble(color: string): Sprite {
  const R = BUBBLE_D / 2;
  const c = R;
  const tone = ramp(color, 4, 0.5);
  return outlined(
    bake(BUBBLE_D, BUBBLE_D, (x, y) => bubbleGlossPixel(x + 0.5 - c, y + 0.5 - c, R, tone)),
    "#140c28"
  );
}

/** the gold cannon barrel + its red swivel-gem joint, baked once per aim angle so firing never
 *  rotates anything at draw time: local space has lx across the barrel, ly running from the
 *  pivot (0) up to the muzzle (negative) */
function barrelPixel(lx: number, ly: number, gold: string[], gem: string[]): string | null {
  const gR = 5.2;
  const gy = ly - 1.6;
  const gd = Math.hypot(lx, gy);
  if (ly > -2 && gd < gR) {
    const nx = lx / gR;
    const ny = gy / gR;
    let t = (1 - (nx * 0.5 + ny * 0.75)) / 2;
    if (gd / gR > 0.85) t = Math.min(1, t + 0.3);
    let col = gem[Math.min(3, Math.max(0, Math.floor((1 - t) * 4)))];
    if (Math.hypot(lx - gR * -0.35, gy - gR * -0.5) < gR * 0.32) col = "#ffffff";
    return col;
  }
  if (ly > 2 || ly < -BARREL_L) return null;
  const t = clamp(-ly / BARREL_L, 0, 1);
  const flare = t > 0.86 ? (t - 0.86) * 9 : 0;
  const halfW = 3.6 + flare;
  if (Math.abs(lx) > halfW) return null;
  if (t > 0.93 && Math.abs(lx) < halfW * 0.5) return "#140c28"; // bore
  const edge = lx / halfW;
  let idx = edge < -0.5 ? 0 : edge < 0 ? 1 : edge < 0.55 ? 2 : 3;
  for (const bt of [0.3, 0.6]) if (Math.abs(t - bt) < 0.045) idx = Math.max(0, idx - 1);
  return gold[idx];
}
function bakeBarrelFrame(aim: number, gold: string[], gem: string[]): Sprite {
  const d = 48;
  const c = d / 2;
  const cosA = Math.cos(aim);
  const sinA = Math.sin(aim);
  return outlined(
    bake(d, d, (x, y) => {
      const X = x + 0.5 - c;
      const Y = y + 0.5 - c;
      const lx = X * cosA + Y * sinA;
      const ly = -X * sinA + Y * cosA;
      return barrelPixel(lx, ly, gold, gem);
    }),
    "#140c28"
  );
}

/** the static mount the barrel swivels on: a flared trapezoid with a gold rim and two feet */
function basePixel(x: number, y: number, w: number, h: number, gold: string[]): string | null {
  const cx = w / 2;
  const topW = w * 0.3;
  const botW = w * 0.94;
  const t = clamp(y / (h - 3), 0, 1);
  const halfW = (topW + (botW - topW) * t) / 2;
  if (y < h - 2 && Math.abs(x - cx) <= halfW) {
    if (y < 2) return gold[2];
    const edge = (x - cx) / halfW;
    return edge < -0.45 ? "#262b50" : edge < 0.25 ? "#363c68" : "#474d86";
  }
  for (const fx of [cx - botW * 0.3, cx + botW * 0.3]) {
    if (Math.hypot(x - fx, y - (h - 2)) < 2.6) return y < h - 1 ? "#20223e" : "#14162a";
  }
  return null;
}
const bakeBase = (gold: string[]) => outlined(bake(30, 13, (x, y) => basePixel(x, y, 30, 13, gold)), "#140c28");

/** a small radiating sparkle used for the pop-burst, scaled up and faded as it plays */
function starPixel(x: number, y: number, c: number): string | null {
  const dx = x + 0.5 - c;
  const dy = y + 0.5 - c;
  const d = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const arm = Math.abs(Math.sin(ang * 4));
  const R = c * (0.22 + arm * 0.78);
  if (d > R) return null;
  return d < c * 0.22 ? "#ffffff" : d < c * 0.5 ? "#fff6c8" : "#ffe14d";
}
const bakeStar = () => bake(18, 18, (x, y) => starPixel(x, y, 9));

/** a quiet diagonal-stripe tile for the cabinet side panels */
const bakeSidePanel = () => bake(16, 16, (x, y) => (Math.floor((x - y) / 5) % 2 === 0 ? "#232d60" : "#2a3670"));

/** the playfield's deep-navy backdrop, a soft vertical gradient so it isn't a flat slab */
const bakeFieldBg = () => bakeGradient(FR - FL, H, ["#140c38", "#1c1552", "#241a5e"]);

interface BubbleArt {
  bubbles: Sprite[];
  ghost: Sprite;
  barrel: Sprite[];
  base: Sprite;
  side: Sprite;
  fieldBg: Sprite;
  star: Sprite;
}
let A: BubbleArt | null = null;
function makeArt(): BubbleArt {
  const gold = ramp(GOLD, 4, 0.55);
  const gem = ramp(PAL.red, 4, 0.55);
  return {
    bubbles: COLORS.map((c) => bakeBubble(c)),
    ghost: bakeBubble(PAL.grey),
    barrel: Array.from({ length: BARREL_FRAMES }, (_, i) => bakeBarrelFrame(AIM_MIN + ((AIM_MAX - AIM_MIN) * i) / (BARREL_FRAMES - 1), gold, gem)),
    base: bakeBase(gold),
    side: bakeSidePanel(),
    fieldBg: bakeFieldBg(),
    star: bakeStar(),
  };
}
const art = () => (A ??= makeArt());
const barrelIdx = (aim: number) => Math.round(((clamp(aim, AIM_MIN, AIM_MAX) - AIM_MIN) / (AIM_MAX - AIM_MIN)) * (BARREL_FRAMES - 1));

function drawBubbleAt(g: Gfx, a: BubbleArt, x: number, y: number, ci: number) {
  const s = ci >= 0 ? a.bubbles[ci] ?? a.bubbles[0] : a.ghost;
  g.sprite(s, x - s.rows[0].length / 2, y - s.rows.length / 2);
}

function create(seed: number): GameInstance {
  art(); // warm the sprite cache once, at round start, never mid-draw
  const r = rng(seed);
  let grid: number[][] = [];
  let level = 1;
  let ceil = 0;
  let shotsLeft = 0;
  let aim = 0;
  let aimHold = 0;
  let cur = 0;
  let next = 0;
  let shot: { x: number; y: number; vx: number; vy: number; c: number } | null = null;
  const pops: { x: number; y: number; c: number; t: number }[] = [];
  const falls: { x: number; y: number; vy: number; vx: number; c: number }[] = [];
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
  const flashes: { x: number; y: number; life: number; max: number; color: string }[] = [];
  const texts: { x: number; y: number; s: string; t: number }[] = [];
  let clearT = -1;
  let lose = -1;
  let over = false;
  let frame = 0;
  let shake = 0;

  const numColors = () => Math.min(6, 3 + level);
  const perDrop = () => Math.max(5, 9 - Math.floor(level / 2));
  const cx = (rr: number, c: number) => FL + RAD + c * 16 + (rr % 2 ? 8 : 0);
  const cy = (rr: number) => FT + RAD + (ceil + rr) * ROW_H;
  const ceilingY = () => FT + ceil * ROW_H;

  const present = () => {
    const s = new Set<number>();
    for (const row of grid) for (const v of row) if (v >= 0) s.add(v);
    return [...s];
  };
  const pickColor = () => {
    const p = present();
    return p.length ? r.pick(p) : r.int(0, numColors() - 1);
  };

  const buildBoard = () => {
    grid = Array.from({ length: MAXR }, (_, rr) => new Array<number>(colsIn(rr)).fill(-1));
    const rows = Math.min(9, 4 + level);
    const n = numColors();
    for (let rr = 0; rr < rows; rr++)
      for (let c = 0; c < colsIn(rr); c++) {
        // clumps of colour are friendlier than pure noise: often copy a neighbour above/left
        const up = rr > 0 ? grid[rr - 1][Math.min(c, colsIn(rr - 1) - 1)] : -1;
        const left = c > 0 ? grid[rr][c - 1] : -1;
        const roll = r.next();
        grid[rr][c] = roll < 0.3 && left >= 0 ? left : roll < 0.5 && up >= 0 ? up : r.int(0, n - 1);
      }
    ceil = 0;
    shotsLeft = perDrop();
    cur = pickColor();
    next = pickColor();
  };
  buildBoard();

  const occupied = (rr: number, c: number) => rr >= 0 && rr < MAXR && c >= 0 && c < colsIn(rr) && grid[rr][c] >= 0;

  /** does a ball at (x, y) touch the ceiling or any bubble? */
  const touching = (x: number, y: number) => {
    if (y - RAD <= ceilingY()) return true;
    for (let rr = 0; rr < MAXR; rr++) {
      const by = cy(rr);
      if (Math.abs(by - y) > 16) continue;
      for (let c = 0; c < colsIn(rr); c++) if (grid[rr][c] >= 0 && (cx(rr, c) - x) ** 2 + (by - y) ** 2 < 14 * 14) return true;
    }
    return false;
  };

  const snap = (x: number, y: number) => {
    const r0 = Math.round((y - FT - RAD) / ROW_H - ceil);
    let best: [number, number] | null = null;
    let bestD = Infinity;
    let loose: [number, number] | null = null;
    let looseD = Infinity;
    for (let rr = Math.max(0, r0 - 1); rr <= Math.min(MAXR - 1, r0 + 1); rr++)
      for (let c = 0; c < colsIn(rr); c++) {
        if (grid[rr][c] >= 0) continue;
        const d = (cx(rr, c) - x) ** 2 + (cy(rr) - y) ** 2;
        const attached = rr === 0 || neighbours(rr, c).some(([a, b]) => occupied(a, b));
        if (attached && d < bestD) {
          bestD = d;
          best = [rr, c];
        }
        if (d < looseD) {
          looseD = d;
          loose = [rr, c];
        }
      }
    return best ?? loose;
  };

  const burst = (x: number, y: number, ci: number) => {
    for (let i = 0; i < 7; i++) sparks.push({ x, y, vx: r.range(-2.2, 2.2), vy: r.range(-2.6, 0.6), life: r.int(12, 26), c: COLORS[ci] });
  };

  const settle = (rr: number, c: number, color: number, io: IO) => {
    grid[rr][c] = color;
    // match
    const group: [number, number][] = [[rr, c]];
    const seen = new Set([rr * 32 + c]);
    for (let i = 0; i < group.length; i++)
      for (const [a, b] of neighbours(group[i][0], group[i][1])) {
        if (seen.has(a * 32 + b) || grid[a][b] !== color) continue;
        seen.add(a * 32 + b);
        group.push([a, b]);
      }
    if (group.length >= 3) {
      for (const [a, b] of group) {
        pops.push({ x: cx(a, b), y: cy(a), c: grid[a][b], t: 0 });
        burst(cx(a, b), cy(a), grid[a][b]);
        grid[a][b] = -1;
      }
      io.score(group.length * 10);
      io.sfx.play("pop");
      io.sfx.tone(440 + Math.min(10, group.length) * 36, 0.09, "square", 0.18);
      // anything no longer hanging from the ceiling falls
      const held = new Set<number>();
      const q: [number, number][] = [];
      for (let b = 0; b < colsIn(0); b++)
        if (grid[0][b] >= 0) {
          held.add(b);
          q.push([0, b]);
        }
      for (let i = 0; i < q.length; i++)
        for (const [a, b] of neighbours(q[i][0], q[i][1]))
          if (grid[a][b] >= 0 && !held.has(a * 32 + b)) {
            held.add(a * 32 + b);
            q.push([a, b]);
          }
      let dropped = 0;
      for (let a = 0; a < MAXR; a++)
        for (let b = 0; b < colsIn(a); b++)
          if (grid[a][b] >= 0 && !held.has(a * 32 + b)) {
            falls.push({ x: cx(a, b), y: cy(a), vy: r.range(-1.5, 0), vx: r.range(-0.8, 0.8), c: grid[a][b] });
            grid[a][b] = -1;
            dropped++;
          }
      if (dropped) {
        const pts = dropped * 20 * Math.min(8, dropped);
        io.score(pts);
        texts.push({ x: cx(rr, c), y: cy(rr), s: `+${pts}`, t: 0 });
        io.sfx.play("whoosh");
        io.sfx.noise?.(0.3, 0.22, 700, 180);
      } else texts.push({ x: cx(rr, c), y: cy(rr), s: `+${group.length * 10}`, t: 0 });
    } else io.sfx.play("step");

    if (present().length === 0) {
      clearT = 0;
      io.score(1000 * level);
      io.sfx.play("win");
      io.sfx.play("cheer");
      io.sfx.slide?.(500, 1000, 0.4, "square", 0.2);
      return;
    }
    shotsLeft--;
    if (shotsLeft <= 0) {
      ceil++;
      shotsLeft = perDrop();
      shake = 14;
      flashes.push({ x: (FL + FR) / 2, y: ceilingY(), life: 14, max: 14, color: "#e85a9a" });
      io.sfx.play("thud");
      io.sfx.noise?.(0.3, 0.3, 220, 70);
    }
    // keep the next bubbles to colours still on the board
    const p = present();
    if (!p.includes(cur)) cur = pickColor();
    if (!p.includes(next)) next = pickColor();
    for (let a = 0; a < MAXR; a++) for (let b = 0; b < colsIn(a); b++) if (grid[a][b] >= 0 && cy(a) + RAD - 1 >= DEADLINE) lose = 0;
    if (lose === 0) io.sfx.play("hurt");
  };

  const fire = (io: IO) => {
    if (shot) return;
    const mx = CX + Math.sin(aim) * MUZZLE_DIST;
    const my = CY + 4 - Math.cos(aim) * MUZZLE_DIST;
    shot = { x: mx, y: my, vx: Math.sin(aim) * 6, vy: -Math.cos(aim) * 6, c: cur };
    flashes.push({ x: mx, y: my, life: 8, max: 8, color: "#fff6c8" });
    for (let i = 0; i < 4; i++) sparks.push({ x: mx, y: my, vx: Math.sin(aim) + r.range(-0.6, 0.6), vy: -Math.cos(aim) + r.range(-0.6, 0.6), life: r.int(6, 12), c: PAL.white });
    cur = next;
    next = pickColor();
    io.sfx.play("shoot");
    io.sfx.slide?.(520, 880, 0.08, "square", 0.16);
  };

  const stepShot = (io: IO) => {
    if (!shot) return;
    for (let i = 0; i < 6; i++) {
      shot.x += shot.vx / 6;
      shot.y += shot.vy / 6;
      if (shot.x < FL + RAD) {
        shot.x = FL + RAD;
        shot.vx = Math.abs(shot.vx);
        io.sfx.play("bounce");
      } else if (shot.x > FR - RAD) {
        shot.x = FR - RAD;
        shot.vx = -Math.abs(shot.vx);
        io.sfx.play("bounce");
      }
      if (touching(shot.x, shot.y)) {
        const cell = snap(shot.x, shot.y);
        const s = shot;
        shot = null;
        if (cell) settle(cell[0], cell[1], s.c, io);
        return;
      }
    }
  };

  return {
    update(io) {
      frame++;
      if (shake > 0) shake--;
      for (const p of pops) p.t++;
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 16) pops.splice(i, 1);
      for (const f of falls) {
        f.vy += 0.25;
        f.y += f.vy;
        f.x += f.vx;
      }
      for (let i = falls.length - 1; i >= 0; i--) if (falls[i].y > H + 10) falls.splice(i, 1);
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        s.life--;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life--;
        if (flashes[i].life <= 0) flashes.splice(i, 1);
      }
      for (const t of texts) t.t++;
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].t > 40) texts.splice(i, 1);
      if (over) return;

      if (lose >= 0) {
        lose++;
        if (lose > 70) {
          over = true;
          io.sfx.slide?.(260, 60, 0.5, "sawtooth", 0.24);
          io.gameOver();
        }
        return;
      }
      if (clearT >= 0) {
        clearT++;
        if (clearT > 110) {
          clearT = -1;
          level++;
          buildBoard();
          aim = 0;
        }
        return;
      }

      const inp = io.input;
      const dir = inp.held.left ? -1 : inp.held.right ? 1 : 0;
      if (dir) {
        aimHold++;
        aim += dir * (aimHold > 20 ? 0.04 : 0.02);
        if (aimHold % 6 === 1) io.sfx.tone(700, 0.015, "square", 0.03);
      } else aimHold = 0;
      aim = clamp(aim, AIM_MIN, AIM_MAX);
      if (inp.pressed.b && !shot) {
        [cur, next] = [next, cur];
        io.sfx.play("select");
      }
      if (inp.tap && inp.tap.y < CY - 8) {
        aim = clamp(Math.atan2(inp.tap.x - CX, CY - inp.tap.y), AIM_MIN, AIM_MAX);
        fire(io);
      } else if (inp.pressed.a) fire(io);
      stepShot(io);
    },

    draw(g) {
      const a = art();
      g.clear(PAL.navy);
      // cabinet side panels
      const sw = a.side.rows[0].length;
      const sh = a.side.rows.length;
      for (let y = 0; y < H; y += sh) {
        for (let x = 0; x < FL; x += sw) g.sprite(a.side, x, y);
        for (let x = FR; x < W; x += sw) g.sprite(a.side, x, y);
      }
      g.rect(FL - 2, 0, 2, H, "#120c2c");
      g.rect(FR, 0, 2, H, "#120c2c");

      let ox = 0;
      let oy = 0;
      if (shake > 0) {
        const k = shake / 14;
        ox = (hash2(frame, 11, 7) - 0.5) * 6 * k;
        oy = (hash2(frame, 29, 13) - 0.5) * 3 * k;
      }
      g.camera(ox, oy);
      g.sprite(a.fieldBg, FL, 0);
      g.rect(FL - 3, 0, 3, H, PAL.pink);
      g.rect(FR, 0, 3, H, PAL.pink);

      // the pressing candy-metal ceiling
      const cyl = ceilingY();
      g.rect(FL, 0, FR - FL, cyl, "#241a52");
      for (let x = FL + 5; x < FR; x += 13)
        for (let y = 4; y < cyl - 5; y += 13) g.rect(x, y, 2, 2, hash2(x, y, 3) > 0.5 ? "#4a3a8a" : "#140e30");
      for (let x = FL; x < FR; x += 10) {
        g.circle(x + 5, cyl - 2, 5, "#c23a7a");
        g.circle(x + 5, cyl - 4, 3, "#e85a9a");
      }
      g.rect(FL, cyl - 1, FR - FL, 1, PAL.white);

      // danger line: a hazard stripe that flashes red when bubbles are close
      const danger = grid.some((row, rr) => row.some((v) => v >= 0 && cy(rr) + RAD >= DEADLINE - ROW_H * 2));
      for (let x = FL; x < FR; x += 6) g.rect(x, DEADLINE, 4, 2, danger && frame % 20 < 10 ? PAL.red : Math.floor(x / 6) % 2 === 0 ? PAL.yellow : PAL.black);

      for (let rr = 0; rr < MAXR; rr++)
        for (let c = 0; c < colsIn(rr); c++) {
          const v = grid[rr][c];
          if (v < 0) continue;
          if (lose >= 0 && lose > (MAXR - rr) * 4) drawBubbleAt(g, a, cx(rr, c), cy(rr), -1);
          else drawBubbleAt(g, a, cx(rr, c), cy(rr), v);
        }

      for (const p of pops) {
        const t = p.t / 16;
        g.alpha(Math.max(0, 1 - t));
        const scale = 0.5 + t * 1.6;
        const s = a.star;
        g.sprite(s, p.x - (s.rows[0].length * scale) / 2, p.y - (s.rows.length * scale) / 2, { scale });
        g.alpha(1);
      }
      for (const f of falls) drawBubbleAt(g, a, f.x, f.y, f.c);
      for (const s of sparks) {
        if (Math.abs(s.vx) + Math.abs(s.vy) > 1.6 && s.life > 4) g.line(s.x, s.y, s.x - s.vx * 1.6, s.y - s.vy * 1.6, s.c);
        else g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.c);
      }
      for (const f of flashes) {
        const t = f.life / f.max;
        g.alpha(t * 0.85);
        g.circle(f.x, f.y, (1 - t) * 14 + 3, f.color);
        g.alpha(1);
      }

      // aim guide: a travelling dashed red line, following the path with wall bounces
      if (!shot && lose < 0 && clearT < 0) {
        let x = CX + Math.sin(aim) * MUZZLE_DIST;
        let y = CY + 4 - Math.cos(aim) * MUZZLE_DIST;
        let vx = Math.sin(aim) * 4;
        const vy = -Math.cos(aim) * 4;
        for (let i = 0; i < 70; i++) {
          const px = x;
          const py = y;
          x += vx;
          y += vy;
          if (x < FL + RAD) {
            x = FL + RAD;
            vx = -vx;
          } else if (x > FR - RAD) {
            x = FR - RAD;
            vx = -vx;
          }
          if (touching(x, y)) break;
          if (i > 3 && (Math.floor(i / 2) + Math.floor(frame / 3)) % 2 === 0) g.line(px, py, x, y, PAL.red);
        }
      }
      if (shot) drawBubbleAt(g, a, shot.x, shot.y, shot.c);

      // cannon: a static gold-trimmed mount, a rotating gold barrel with a red swivel gem,
      // and the loaded bubble seated in the muzzle
      const pivotY = CY + 4;
      g.sprite(a.base, CX - a.base.rows[0].length / 2, pivotY - 3);
      const barrel = a.barrel[barrelIdx(aim)];
      g.sprite(barrel, CX - barrel.rows[0].length / 2, pivotY - barrel.rows.length / 2);
      const mx = CX + Math.sin(aim) * MUZZLE_DIST;
      const my = pivotY - Math.cos(aim) * MUZZLE_DIST;
      if (!shot) drawBubbleAt(g, a, mx, my, cur);

      // next-up holder
      g.box(CX - 40, CY, 16, 16, "#120c2c");
      g.rect(CX - 39, CY + 1, 14, 14, "rgba(20,12,40,0.55)");
      drawBubbleAt(g, a, CX - 32, CY + 8, next);
      g.camera(0, 0);
      g.text("NEXT", CX - 32, CY - 6, PAL.white, { align: "center" });

      // HUD panels
      g.box(3, 1, 42, 21, "#120c2c");
      g.rect(4, 2, 40, 19, "rgba(20,12,40,0.55)");
      g.text("LEVEL", 24, 4, PAL.cyan, { align: "center" });
      g.text(String(level), 24, 14, PAL.white, { align: "center" });

      g.box(220, 1, 24, 100, "#120c2c");
      g.rect(221, 2, 22, 98, "rgba(20,12,40,0.4)");
      g.text("DROP", 232, 4, PAL.cyan, { align: "center" });
      const per = perDrop();
      for (let i = 0; i < per; i++) {
        const on = i < shotsLeft;
        const py = 24 + i * 10;
        g.circle(232, py, 4, on ? "#140e30" : "#241c44");
        g.circle(232, py, 3, on ? (shotsLeft <= 2 && frame % 20 < 10 ? PAL.red : PAL.yellow) : PAL.dark);
        if (on) g.rect(231, py - 2, 1, 1, PAL.white);
      }

      g.box(3, 185, 42, 18, "#120c2c");
      g.rect(4, 186, 40, 16, "rgba(20,12,40,0.5)");
      g.text("B", 24, 188, PAL.yellow, { align: "center" });
      g.text("SWAP", 24, 196, PAL.grey, { align: "center" });

      for (const t of texts) g.text(t.s, t.x, t.y - t.t * 0.5, PAL.white, { align: "center" });
      if (clearT >= 0) {
        g.alpha(0.75);
        g.rect(FL + 10, 96, FR - FL - 20, 22, "#140c28");
        g.alpha(1);
        g.box(FL + 10, 96, FR - FL - 20, 22, "#e85a9a");
        g.text("ALL POPPED!", W / 2, 104, frame % 10 < 5 ? PAL.yellow : PAL.pink, { align: "center" });
        const sBounce = 1 + Math.sin(frame * 0.2) * 0.15;
        const s = a.star;
        g.sprite(s, FL + 16 - (s.rows[0].length * sBounce) / 2 + 9, 100 - (s.rows.length * sBounce) / 2 + 9, { scale: sBounce * 0.6 });
        g.sprite(s, FR - 24 - (s.rows[0].length * sBounce) / 2 + 9, 100 - (s.rows.length * sBounce) / 2 + 9, { scale: sBounce * 0.6 });
      }
    },
  };
}

export const bubblePop: RetroGameDef = {
  id: "bubble-pop",
  title: "Bubble Pop",
  blurb: "Aim, bounce and match three bubbles to pop them all!",
  genre: "Puzzle",
  emoji: "🫧",
  color: "#5ef2ff",
  controls: "◀ ▶ aim · A shoot · B swap bubble · or tap where you want it to go",
  pad: { dpad: "lr", a: "Shoot", b: "Swap", tap: true },
  create,
};
