// BUBBLE POP — a bubble shooter. Aim the bubble cannon, bounce shots off the side walls and
// stick them to the bubble cluster above. Three or more of the same colour pop, and any
// bubbles left hanging with nothing holding them up fall away for bonus points. Every few
// shots the candy ceiling presses down one row — clear the board before the bubbles reach
// the line at the bottom! Tap anywhere above the cannon to aim and fire in one go.
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const FL = 48;
const FR = 208;
const FT = 14;
const RAD = 8;
const ROW_H = 14;
const MAXR = 16;
const DEADLINE = 184;
const CX = 128;
const CY = 204;
const COLORS = [PAL.red, PAL.yellow, PAL.green, PAL.blue, PAL.purple, PAL.orange];
const DARKS = ["#a82a3a", "#b89a20", "#23853a", "#2242a0", "#5f36a8", "#b8601e"];

const colsIn = (r: number) => (r % 2 ? 9 : 10);

function neighbours(r: number, c: number): [number, number][] {
  const odd = r % 2 === 1;
  const out: [number, number][] = [[r, c - 1], [r, c + 1]];
  const dc = odd ? [0, 1] : [-1, 0];
  for (const dr of [-1, 1]) for (const d of dc) out.push([r + dr, c + d]);
  return out.filter(([rr, cc]) => rr >= 0 && rr < MAXR && cc >= 0 && cc < colsIn(rr));
}

function drawBubble(g: Gfx, x: number, y: number, ci: number, face = true) {
  g.circle(x, y, RAD - 1, DARKS[ci] ?? PAL.dark);
  g.circle(x - 0.5, y - 0.5, RAD - 2, COLORS[ci] ?? PAL.grey);
  g.rect(x - 4, y - 4, 2, 2, PAL.white);
  if (face) {
    g.rect(x - 3, y, 1, 2, PAL.black);
    g.rect(x + 2, y, 1, 2, PAL.black);
  }
}

function create(seed: number): GameInstance {
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
    for (let i = 0; i < 6; i++) sparks.push({ x, y, vx: r.range(-2, 2), vy: r.range(-2.4, 0.6), life: r.int(12, 24), c: COLORS[ci] });
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
      io.sfx.play("coin");
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
        io.sfx.play("powerup");
      } else texts.push({ x: cx(rr, c), y: cy(rr), s: `+${group.length * 10}`, t: 0 });
    } else io.sfx.play("step");

    if (present().length === 0) {
      clearT = 0;
      io.score(1000 * level);
      io.sfx.play("win");
      return;
    }
    shotsLeft--;
    if (shotsLeft <= 0) {
      ceil++;
      shotsLeft = perDrop();
      shake = 12;
      io.sfx.play("explode");
    }
    // keep the next bubbles to colours still on the board
    const p = present();
    if (!p.includes(cur)) cur = pickColor();
    if (!p.includes(next)) next = pickColor();
    for (let a = 0; a < MAXR; a++) for (let b = 0; b < colsIn(a); b++) if (grid[a][b] >= 0 && cy(a) + RAD - 1 >= DEADLINE) lose = 0;
    if (lose === 0) io.sfx.play("die");
  };

  const fire = (io: IO) => {
    if (shot) return;
    shot = { x: CX, y: CY, vx: Math.sin(aim) * 6, vy: -Math.cos(aim) * 6, c: cur };
    cur = next;
    next = pickColor();
    io.sfx.play("shoot");
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
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 12) pops.splice(i, 1);
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
      for (const t of texts) t.t++;
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].t > 40) texts.splice(i, 1);
      if (over) return;

      if (lose >= 0) {
        lose++;
        if (lose > 70) {
          over = true;
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
      aim = clamp(aim, -1.3, 1.3);
      if (inp.pressed.b && !shot) {
        [cur, next] = [next, cur];
        io.sfx.play("blip");
      }
      if (inp.tap && inp.tap.y < CY - 8) {
        aim = clamp(Math.atan2(inp.tap.x - CX, CY - inp.tap.y), -1.3, 1.3);
        fire(io);
      } else if (inp.pressed.a) fire(io);
      stepShot(io);
    },

    draw(g) {
      g.clear(PAL.navy);
      // side panels
      for (let y = 0; y < H; y += 12)
        for (let x = 0; x < W; x += 12) if ((x < FL || x >= FR) && ((x + y) / 12) % 2 === 0) g.rect(x, y, 12, 12, "#2c3a7a");
      const sx = shake > 0 ? (shake % 2 ? 1 : -1) : 0;
      g.camera(sx, 0);
      g.rect(FL, 0, FR - FL, H, PAL.night);
      g.rect(FL - 3, 0, 3, H, PAL.pink);
      g.rect(FR, 0, 3, H, PAL.pink);
      // the pressing ceiling
      const cyl = ceilingY();
      g.rect(FL, 0, FR - FL, cyl, PAL.purple);
      for (let x = FL; x < FR; x += 10) g.rect(x, cyl - 4, 5, 4, PAL.pink);
      g.rect(FL, cyl - 1, FR - FL, 1, PAL.white);
      // danger line
      const danger = grid.some((row, rr) => row.some((v) => v >= 0 && cy(rr) + RAD >= DEADLINE - ROW_H * 2));
      for (let x = FL; x < FR; x += 8) g.rect(x, DEADLINE, 4, 1, danger && frame % 20 < 10 ? PAL.red : PAL.grey);

      for (let rr = 0; rr < MAXR; rr++)
        for (let c = 0; c < colsIn(rr); c++) {
          const v = grid[rr][c];
          if (v < 0) continue;
          if (lose >= 0 && lose > (MAXR - rr) * 4) drawBubble(g, cx(rr, c), cy(rr), -1, false);
          else drawBubble(g, cx(rr, c), cy(rr), v);
        }
      for (const p of pops) {
        g.circle(p.x, p.y, RAD - 1 + p.t * 0.6, p.t % 4 < 2 ? PAL.white : COLORS[p.c]);
        g.circle(p.x, p.y, Math.max(0, RAD - 2 + p.t * 0.6 - 2), PAL.night);
      }
      for (const f of falls) drawBubble(g, f.x, f.y, f.c);
      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.c);

      // aim guide: follow the path with wall bounces until it would stick
      if (!shot && lose < 0 && clearT < 0) {
        let x = CX;
        let y = CY;
        let vx = Math.sin(aim) * 4;
        const vy = -Math.cos(aim) * 4;
        for (let i = 0; i < 70; i++) {
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
          if ((i + Math.floor(frame / 4)) % 3 === 0 && i > 3) g.rect(x - 1, y - 1, 2, 2, COLORS[cur]);
        }
      }
      if (shot) drawBubble(g, shot.x, shot.y, shot.c);

      // cannon
      const bx = CX + Math.sin(aim) * 16;
      const by = CY - Math.cos(aim) * 16;
      for (let o = -3; o <= 3; o++) g.line(CX + Math.cos(aim) * o, CY + Math.sin(aim) * o, bx + Math.cos(aim) * o, by + Math.sin(aim) * o, o === -3 || o === 3 ? PAL.dark : PAL.grey);
      g.circle(CX, CY + 4, 12, PAL.dark);
      g.circle(CX, CY + 4, 10, PAL.pink);
      if (!shot) drawBubble(g, CX, CY, cur);
      drawBubble(g, CX - 32, CY + 8, next);
      g.camera(0, 0);
      g.text("NEXT", CX - 32, CY - 6, PAL.white, { align: "center" });

      // HUD panels
      g.text("LEVEL", 24, 8, PAL.cyan, { align: "center" });
      g.text(String(level), 24, 20, PAL.white, { align: "center" });
      g.text("DROP", 232, 8, PAL.cyan, { align: "center" });
      const per = perDrop();
      for (let i = 0; i < per; i++) {
        const on = i < shotsLeft;
        g.circle(232, 26 + i * 10, 3, on ? (shotsLeft <= 2 && frame % 20 < 10 ? PAL.red : PAL.yellow) : PAL.dark);
      }
      g.text("B", 24, 190, PAL.yellow, { align: "center" });
      g.text("SWAP", 24, 200, PAL.grey, { align: "center" });
      for (const t of texts) g.text(t.s, t.x, t.y - t.t * 0.5, PAL.white, { align: "center" });
      if (clearT >= 0) {
        g.rect(FL + 10, 100, FR - FL - 20, 14, "rgba(13,11,26,0.75)");
        g.text("ALL POPPED!", W / 2, 104, frame % 10 < 5 ? PAL.yellow : PAL.pink, { align: "center" });
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
