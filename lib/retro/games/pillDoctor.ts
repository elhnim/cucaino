// PILL DOCTOR — an original falling-capsule puzzle (in the spirit of the classic virus-busting
// bottle games, no borrowed names or characters). Dr. Cotton the bunny drops two-colour
// capsules into an 8x16 glass bottle seeded with wiggling germs. Slide and spin the capsule to
// line up 4 or more of one colour in a row or column (germs count too) — they pop, loose
// capsule halves tumble down, and bigger cascades score more. Clear every germ to cure the
// stage; let the bottle fill to the neck and it's game over. Ten stages cured wins the cup.
import { H, PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, hash2, shade } from "../art";

const COLS = 8;
const ROWS = 16;
const CELL = 12; // big, thumb-friendly cells so germ faces and capsule marks read on a phone
const WX = (W - COLS * CELL) / 2; // 80
const WY = 28; // leaves room above for the top status bar + bottle neck, no overlap
const NECK_TOP = WY - 14;
const NECK_W = CELL * 3;
const GERM_TOP = ROWS - 10; // germs only seed in the bottom 10 rows — the neck stays clear
const MAX_STAGE = 10;
const FLASH_FRAMES = 22;
const GRAVITY_TICK = 4; // frames between gravity drop steps while pieces settle
const GERM_SCALE = CELL / 10; // germ sprites are 10px wide, drawn 1:1 with the (bigger) cell
const DANCER_SCALE = 1.8; // the magnified germ "dancers" beside the bottle

type Color = 0 | 1 | 2; // 0 red, 1 yellow, 2 blue
type Conn = "L" | "R" | "U" | "D" | null;
const COLOR_HEX: Record<Color, string> = { 0: PAL.red, 1: PAL.yellow, 2: PAL.blue };
const COLOR_NAMES = ["RED", "YELLOW", "BLUE"];

interface Cell {
  kind: "germ" | "pill";
  color: Color;
  conn: Conn;
}
interface Piece {
  px: number;
  py: number;
  ori: 0 | 1 | 2 | 3; // 0: other at +x, 1: other at -y, 2: other at -x, 3: other at +y
  colorA: Color; // at the pivot (px,py)
  colorB: Color; // at the other cell
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
// offset of the "other" half relative to the pivot, per orientation
const OFFS: [number, number][] = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];
// which end owns the connection (gravity only moves a pair from its owner, see applyGravityPass)
const PIVOT_CONN: Conn[] = ["R", "U", "L", "D"];
const OTHER_CONN: Conn[] = ["L", "D", "R", "U"];
const NEIGHBOR: Record<Exclude<Conn, null>, [number, number]> = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };

// ── germ pixel art: one round (red), one blocky (yellow) and one spiky (blue) silhouette so
// colours read even if you can't tell them apart — each has a 2-frame wiggle/blink loop ──
const RED_A = ["..kkkkkk..", ".kcccccck.", "kcc.kk.cck", "kcccccccck", "kck....kck", "kcccccccck", ".kcccccck.", "..kkkkkk.."];
const RED_B = ["..kkkkkk..", ".kcccccck.", "kcccccccck", "kcccccccck", "kck....kck", "kcccccccck", ".kcccccck.", "..kkkkkk.."];
const YEL_A = ["kkkkkkkkkk", "kcccccccck", "kc.kkkk.ck", "kcccccccck", "kcc.cc.cck", "kccc..ccck", "kcccccccck", "kkkkkkkkkk"];
const YEL_B = ["kkkkkkkkkk", "kcccccccck", "kc.kkkk.ck", "kcccccccck", "kcc.cc.cck", "kcc....cck", "kcccccccck", "kkkkkkkkkk"];
const BLU_A = ["k.kk..kk.k", ".kcccccck.", "kcwk..kwck", "kcccccccck", "kcc.kk.cck", "kcccccccck", ".kcccccck.", "..kkkkkk.."];
const BLU_B = ["kk..kk..kk", ".kcccccck.", "kcwk..kwck", "kcccccccck", "kcccccccck", "kcccccccck", ".kcccccck.", "..kkkkkk.."];
const GERM_A = [RED_A, YEL_A, BLU_A];
const GERM_B = [RED_B, YEL_B, BLU_B];
const germPal = (c: string) => ({ k: PAL.black, c, w: PAL.white });
const GERM_FRAMES: Sprite[][] = [0, 1, 2].map((c) => [sprite(GERM_A[c], germPal(COLOR_HEX[c as Color])), sprite(GERM_B[c], germPal(COLOR_HEX[c as Color]))]);

// Dr. Cotton the bunny, in a little lab coat — a 2-frame ear-twitch idle
const BUNNY_A = ["k......k", "kf....fk", ".kf..fk.", "..kffk..", ".kfppfk.", ".kffffk.", "k.wwww.k", "kwwkwwwk", "kwwwwwwk", ".kkkkkk."];
const BUNNY_B = ["........", "k......k", "kf....fk", ".kffffk.", ".kfppfk.", ".kffffk.", "k.wwww.k", "kwwkwwwk", "kwwwwwwk", ".kkkkkk."];
const BUNNY_PAL = { k: PAL.black, f: PAL.tan, p: PAL.pink, w: PAL.white };
const BUNNY: Sprite[] = [sprite(BUNNY_A, BUNNY_PAL), sprite(BUNNY_B, BUNNY_PAL)];

// ── lazily-baked art: a scalloped "flower pill" per colour (matches the cabinet painting's
// notched capsule rim) and a mottled dark-navy backdrop texture, built once and reused every
// frame (one drawImage each) instead of live circle math ──
function bakePillHalf(color: Color): Sprite {
  const hex = COLOR_HEX[color];
  const light = shade(hex, 0.22);
  const c0 = (CELL - 1) / 2;
  const R = CELL * 0.36; // a small round pixel-art pill, outlined and shaded like the painting's
  return bake(CELL, CELL, (x, y) => {
    const dx = x - c0;
    const dy = y - c0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) return null;
    if (d > R - 1.1) return PAL.black; // outline
    if (color === 0 && d < 1.5) return PAL.white; // dot
    else if (color === 1 && Math.abs(dy) < 1.1 && Math.abs(dx) < CELL * 0.3) return PAL.white; // stripe
    else if (color === 2 && d < 2.3) return d < 1.1 ? hex : PAL.white; // donut ring
    const hdx = x - c0 + 1.3;
    const hdy = y - c0 + 1.3;
    return Math.sqrt(hdx * hdx + hdy * hdy) < R * 0.55 ? light : hex;
  });
}
function bakeBackdrop(): Sprite {
  const cell = 7;
  return bake(W, H, (x, y) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const n = hash2(cx, cy, 91);
    const diag = ((cx + cy) & 1) * 0.035;
    return shade(PAL.black, -0.06 + n * 0.09 + diag);
  });
}
function makeArt() {
  return { pill: [0, 1, 2].map((c) => bakePillHalf(c as Color)) as [Sprite, Sprite, Sprite], backdrop: bakeBackdrop() };
}
let ART: ReturnType<typeof makeArt> | null = null;
const art = () => (ART ??= makeArt());

/** one half of a capsule: a baked, scalloped circle with a colour-blind-friendly mark (dot/stripe/ring) */
function drawPillHalf(g: Gfx, cx: number, cy: number, color: Color, alpha = 1) {
  g.alpha(alpha);
  g.sprite(art().pill[color], cx - CELL / 2, cy - CELL / 2);
  g.alpha(1);
}
function drawConnector(g: Gfx, cx: number, cy: number, conn: Conn, color: Color) {
  const hex = COLOR_HEX[color];
  if (conn === "R") {
    g.rect(cx, cy - 3, CELL, 6, hex);
    g.rect(cx, cy - 3, CELL, 1.4, shade(hex, 0.3));
  } else if (conn === "D") {
    g.rect(cx - 3, cy, 6, CELL, hex);
    g.rect(cx - 3, cy, 1.4, CELL, shade(hex, 0.3));
  }
}

/** Pure matching rule, exported so it can be unit-tested directly: any run of 4+ cells of the
 * same colour in a row or column (germs and capsule halves both count) pops. `null` is empty. */
export function findColorRuns(colors: (Color | null)[][]): Set<string> {
  const rows = colors.length;
  const cols = colors[0]?.length ?? 0;
  const matched = new Set<string>();
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      const c = colors[y][x];
      if (c === null) {
        x++;
        continue;
      }
      let x2 = x + 1;
      while (x2 < cols && colors[y][x2] === c) x2++;
      if (x2 - x >= 4) for (let k = x; k < x2; k++) matched.add(`${k},${y}`);
      x = x2;
    }
  }
  for (let x = 0; x < cols; x++) {
    let y = 0;
    while (y < rows) {
      const c = colors[y][x];
      if (c === null) {
        y++;
        continue;
      }
      let y2 = y + 1;
      while (y2 < rows && colors[y2][x] === c) y2++;
      if (y2 - y >= 4) for (let k = y; k < y2; k++) matched.add(`${x},${k}`);
      y = y2;
    }
  }
  return matched;
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let grid: (Cell | null)[][] = Array.from({ length: ROWS }, () => new Array<Cell | null>(COLS).fill(null));
  let stage = 1;
  let germsLeft = 0;
  let germsByColor: [number, number, number] = [0, 0, 0];
  let piece: Piece | null = null;
  let nextColors: [Color, Color] = [r.pick([0, 1, 2]) as Color, r.pick([0, 1, 2]) as Color];
  let fallT = 0;
  let lockT = 0;
  let lockMoves = 0;
  let dasDir = 0;
  let dasT = 0;
  let softT = 0;
  let combo = 0;
  let flashCells: Set<string> | null = null;
  let flashT = 0;
  let gravActive = false;
  let gravTickT = 0;
  let over = false;
  let overT = 0;
  let sentOver = false;
  let greyFromRow = ROWS;
  let stageClearT = 0;
  let sentWin = false;
  let started = false;
  let frame = 0;
  let banner = "";
  let bannerT = 0;
  let cheerT = 0; // Dr. Cotton bounces and sparkles for a moment after a pop
  let shakeT = 0; // brief screen shake on a germ zap / combo
  let shakeMag = 0;
  let warned = false; // one "!" chime per close call, not every frame
  const sparks: Spark[] = [];

  function topFilledRow(): number {
    for (let y = 0; y < ROWS; y++) if (grid[y].some((c) => c)) return y;
    return ROWS;
  }

  const gravityFrames = () => Math.max(8, 34 - (stage - 1) * 3);
  const germCountFor = (s: number) => Math.min(4 + (s - 1) * 4, 60);

  function fits(px: number, py: number, ori: 0 | 1 | 2 | 3) {
    const [dx, dy] = OFFS[ori];
    const pts: [number, number][] = [
      [px, py],
      [px + dx, py + dy],
    ];
    for (const [x, y] of pts) {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
      if (grid[y][x]) return false;
    }
    return true;
  }
  function onFloor() {
    return !!piece && !fits(piece.px, piece.py + 1, piece.ori);
  }
  function touched() {
    if (piece && onFloor() && lockMoves < 15) {
      lockT = 0;
      lockMoves++;
    }
  }
  function tryMove(dx: number, dy: number) {
    if (!piece || !fits(piece.px + dx, piece.py + dy, piece.ori)) return false;
    piece.px += dx;
    piece.py += dy;
    return true;
  }
  function tryRotate(dir: 1 | -1, io: IO) {
    if (!piece) return;
    const newOri = (((piece.ori + dir) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
    const kicks: [number, number][] = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, 1],
      [-2, 0],
      [2, 0],
    ];
    for (const [kx, ky] of kicks) {
      if (fits(piece.px + kx, piece.py + ky, newOri)) {
        piece.px += kx;
        piece.py += ky;
        piece.ori = newOri;
        io.sfx.tone(520, 0.04, "square", 0.08);
        touched();
        return;
      }
    }
  }
  function ghostY() {
    if (!piece) return 0;
    let y = piece.py;
    while (fits(piece.px, y + 1, piece.ori)) y++;
    return y;
  }

  function wouldMakeRun(x: number, y: number, color: Color): boolean {
    let run = 1;
    let i = x - 1;
    while (i >= 0 && grid[y][i]?.color === color) {
      run++;
      i--;
    }
    i = x + 1;
    while (i < COLS && grid[y][i]?.color === color) {
      run++;
      i++;
    }
    if (run >= 3) return true;
    run = 1;
    i = y - 1;
    while (i >= 0 && grid[i][x]?.color === color) {
      run++;
      i--;
    }
    i = y + 1;
    while (i < ROWS && grid[i][x]?.color === color) {
      run++;
      i++;
    }
    return run >= 3;
  }
  function placeGerms(count: number) {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < 6000) {
      guard++;
      const y = r.int(GERM_TOP, ROWS - 1);
      const x = r.int(0, COLS - 1);
      if (grid[y][x]) continue;
      const order = ([0, 1, 2] as Color[]).sort(() => r.next() - 0.5);
      let chosen: Color = order[0];
      for (const c of order) {
        if (!wouldMakeRun(x, y, c)) {
          chosen = c;
          break;
        }
      }
      grid[y][x] = { kind: "germ", color: chosen, conn: null };
      germsByColor[chosen]++;
      placed++;
    }
    germsLeft = placed;
  }

  function findMatches(): Set<string> {
    return findColorRuns(grid.map((row) => row.map((c) => (c ? c.color : null))));
  }
  function removeCells(keys: Set<string>) {
    for (const key of keys) {
      const [xs, ys] = key.split(",");
      const x = +xs;
      const y = +ys;
      const cell = grid[y][x];
      if (!cell) continue;
      if (cell.kind === "germ") {
        germsLeft--;
        germsByColor[cell.color]--;
      }
      if (cell.conn) {
        const [dx, dy] = NEIGHBOR[cell.conn];
        const nx = x + dx;
        const ny = y + dy;
        const nb = grid[ny]?.[nx];
        if (nb && !keys.has(`${nx},${ny}`)) nb.conn = null;
      }
      for (let k = 0; k < 3; k++)
        sparks.push({ x: WX + x * CELL + CELL / 2, y: WY + y * CELL + CELL / 2, vx: r.range(-1.8, 1.8), vy: r.range(-2.4, 0.3), life: r.int(18, 34), color: COLOR_HEX[cell.color] });
      grid[y][x] = null;
    }
  }
  function applyGravityPass(): boolean {
    let moved = false;
    for (let y = ROWS - 2; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const cell = grid[y][x];
        if (!cell || cell.kind === "germ") continue;
        if (cell.conn === "L" || cell.conn === "U") continue; // the owner half handles the pair
        const unit: [number, number][] = [[x, y]];
        if (cell.conn === "R") unit.push([x + 1, y]);
        else if (cell.conn === "D") unit.push([x, y + 1]);
        let canFall = true;
        for (const [ux, uy] of unit) {
          const ny = uy + 1;
          if (ny >= ROWS) {
            canFall = false;
            break;
          }
          if (unit.some(([ix, iy]) => ix === ux && iy === ny)) continue; // internal to this unit
          if (grid[ny][ux]) {
            canFall = false;
            break;
          }
        }
        if (!canFall) continue;
        const data = unit.map(([ux, uy]) => ({ x: ux, y: uy, cell: grid[uy][ux]! }));
        for (const d of data) grid[d.y][d.x] = null;
        for (const d of data) grid[d.y + 1][d.x] = d.cell;
        moved = true;
      }
    }
    return moved;
  }

  function checkMatches(io: IO) {
    if (germsLeft <= 0) {
      stageClearT = 110;
      banner = "STAGE CLEAR!";
      bannerT = 110;
      cheerT = 110;
      io.sfx.play("win");
      io.sfx.slide?.(520, 1180, 0.45, "triangle", 0.2); // a rising "cured!" sweep
      return;
    }
    const m = findMatches();
    if (m.size) {
      let germN = 0;
      for (const key of m) {
        const [xs, ys] = key.split(",");
        if (grid[+ys][+xs]?.kind === "germ") germN++;
      }
      const mult = combo + 1;
      io.score(Math.round((m.size * 50 + germN * 80) * mult));
      banner = mult >= 4 ? "MEGA COMBO!" : mult >= 2 ? `COMBO x${mult}!` : m.size >= 7 ? "SUPER CLEAR!" : germN > 0 ? "GERM ZAPPED!" : "NICE!";
      bannerT = 50;
      if (mult >= 2) {
        io.sfx.play("win");
        io.sfx.slide?.(360 + combo * 40, 680 + combo * 70, 0.2, "square", 0.14); // combo chime rises with the streak
      } else if (germN > 0) {
        io.sfx.play("zap");
      } else {
        io.sfx.play("pop");
      }
      if (mult >= 4) io.sfx.play("cheer");
      flashCells = m;
      flashT = FLASH_FRAMES;
      combo++;
      cheerT = germN > 0 || mult >= 2 ? 60 : 36;
      shakeT = germN > 0 || mult >= 2 ? 10 : 0;
      shakeMag = mult >= 4 ? 3 : mult >= 2 ? 2 : 1.4;
    } else {
      spawnNext(io);
    }
  }
  function spawnNext(io: IO) {
    const colorA = nextColors[0];
    const colorB = nextColors[1];
    nextColors = [r.pick([0, 1, 2]) as Color, r.pick([0, 1, 2]) as Color];
    const px = Math.floor(COLS / 2) - 1;
    const py = 0;
    if (grid[py][px] || grid[py][px + 1]) {
      piece = null;
      over = true;
      overT = 0;
      sentOver = false;
      banner = "GAME OVER";
      bannerT = 9999;
      io.sfx.play("die");
      return;
    }
    piece = { px, py, ori: 0, colorA, colorB };
    fallT = 0;
    lockT = 0;
    lockMoves = 0;
    dasDir = 0;
    dasT = 0;
    softT = 0;
  }
  function lockPiece(io: IO) {
    const p = piece!;
    const [dx, dy] = OFFS[p.ori];
    const ox = p.px + dx;
    const oy = p.py + dy;
    grid[p.py][p.px] = { kind: "pill", color: p.colorA, conn: PIVOT_CONN[p.ori] };
    grid[oy][ox] = { kind: "pill", color: p.colorB, conn: OTHER_CONN[p.ori] };
    for (const [lx, ly] of [[p.px, p.py], [ox, oy]] as [number, number][])
      for (let k = 0; k < 2; k++)
        sparks.push({ x: WX + lx * CELL + CELL / 2 + r.range(-3, 3), y: WY + ly * CELL + CELL - 1, vx: r.range(-0.6, 0.6), vy: r.range(-0.7, -0.1), life: r.int(8, 14), color: PAL.grey });
    piece = null;
    combo = 0;
    io.sfx.play("thud");
    checkMatches(io);
  }
  function startStage(io: IO) {
    grid = Array.from({ length: ROWS }, () => new Array<Cell | null>(COLS).fill(null));
    germsByColor = [0, 0, 0];
    placeGerms(germCountFor(stage));
    banner = `STAGE ${stage}`;
    bannerT = 80;
    combo = 0;
    flashCells = null;
    flashT = 0;
    gravActive = false;
    gravTickT = 0;
    warned = false;
    io.sfx.tone(660, 0.05, "square", 0.1); // a little chime as a fresh bottle arrives
    spawnNext(io);
  }

  return {
    update(io) {
      frame++;
      if (!started) {
        started = true;
        startStage(io);
      }
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        s.life--;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      if (bannerT > 0) bannerT--;
      if (cheerT > 0) cheerT--;
      if (shakeT > 0) shakeT--;

      if (over) {
        overT++;
        if (overT % 3 === 0 && greyFromRow > 0) greyFromRow--;
        if (overT > 90 && !sentOver) {
          sentOver = true;
          io.gameOver();
        }
        return;
      }
      if (stageClearT > 0) {
        stageClearT--;
        if (stageClearT <= 0) {
          if (stage >= MAX_STAGE) {
            if (!sentWin) {
              sentWin = true;
              banner = "ALL CLEAR! YOU WIN!";
              bannerT = 9999;
              io.win();
            }
          } else {
            stage++;
            startStage(io);
          }
        }
        return;
      }
      if (sentWin) return;

      if (flashT > 0) {
        flashT--;
        if (flashT <= 0) {
          removeCells(flashCells!);
          flashCells = null;
          gravActive = true;
          gravTickT = 0;
        }
        return;
      }
      if (gravActive) {
        gravTickT++;
        if (gravTickT >= GRAVITY_TICK) {
          gravTickT = 0;
          if (!applyGravityPass()) {
            gravActive = false;
            checkMatches(io);
          }
        }
        return;
      }
      if (!piece) {
        spawnNext(io);
        if (!piece) return;
      }

      const tr = topFilledRow();
      if (tr <= 3 && !warned) {
        warned = true;
        io.sfx.play("hurt"); // one warning chime when the bottle gets dangerously full
      } else if (tr > 6) warned = false;

      const inp = io.input;
      if (inp.pressed.a) tryRotate(1, io);
      if (inp.pressed.b) tryRotate(-1, io);

      const dir = inp.held.left ? -1 : inp.held.right ? 1 : 0;
      if (dir !== dasDir) {
        dasDir = dir;
        dasT = 0;
        if (dir && tryMove(dir, 0)) {
          io.sfx.tone(300, 0.02, "square", 0.05);
          touched();
        }
      } else if (dir) {
        dasT++;
        if (dasT >= 10 && (dasT - 10) % 4 === 0 && tryMove(dir, 0)) {
          io.sfx.tone(300, 0.02, "square", 0.05);
          touched();
        }
      }

      if (inp.held.down) {
        softT++;
        if (softT % 2 === 0 && tryMove(0, 1)) {
          io.score(1);
          fallT = 0;
        }
      } else softT = 0;
      fallT++;
      if (fallT >= gravityFrames()) {
        fallT = 0;
        tryMove(0, 1);
      }
      if (onFloor()) {
        lockT++;
        if (lockT >= (inp.held.down ? 10 : 26)) lockPiece(io);
      } else lockT = 0;
    },

    draw(g: Gfx) {
      g.clear(PAL.black);
      g.sprite(art().backdrop, 0, 0);
      // a short screen shake on a germ zap / big combo (camera resets once shakeT runs out)
      if (shakeT > 0) {
        const m = shakeMag * (shakeT / 10);
        g.camera(Math.sin(frame * 7.3) * m, Math.cos(frame * 5.1) * m);
      } else g.camera(0, 0);

      // bottle frame + neck (kept well clear of the top status bar — see NECK_TOP)
      g.rect(WX + (COLS * CELL - NECK_W) / 2, NECK_TOP, NECK_W, WY - NECK_TOP, PAL.sky);
      g.rect(WX - 5, WY - 3, COLS * CELL + 10, ROWS * CELL + 10, PAL.cyan);
      g.rect(WX - 3, WY - 1, COLS * CELL + 6, ROWS * CELL + 6, "#11244a");
      g.rect(WX, WY, COLS * CELL, ROWS * CELL, PAL.black);

      // grid contents
      const wiggle = Math.floor(frame / 18) % 2;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (y >= greyFromRow) {
            if (grid[y][x]) g.rect(WX + x * CELL + 1, WY + y * CELL + 1, CELL - 2, CELL - 2, PAL.grey);
            continue;
          }
          const cell = grid[y][x];
          if (!cell) continue;
          const flashing = flashCells?.has(`${x},${y}`);
          if (flashing) {
            g.rect(WX + x * CELL, WY + y * CELL, CELL, CELL, Math.floor(flashT / 3) % 2 ? PAL.white : COLOR_HEX[cell.color]);
            continue;
          }
          const cx = WX + x * CELL + CELL / 2;
          const cy = WY + y * CELL + CELL / 2;
          if (cell.kind === "germ") {
            const bob = Math.sin(frame * 0.12 + x * 0.9 + y * 0.6) * 0.8;
            const baseX = WX + x * CELL;
            const baseY = WY + y * CELL + (CELL - 8 * GERM_SCALE) / 2 + bob;
            // a spiky colour halo peeking from behind the face sprite, closer to the painting's
            // sunburst germs, cheap (4 small rects) and drawn before the face covers the centre
            const nub = 1.6;
            const rad = 5.4;
            for (let i = 0; i < 4; i++) {
              const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + (wiggle ? 0.2 : 0);
              g.rect(cx + Math.cos(a) * rad - nub / 2, cy + bob + Math.sin(a) * rad - nub / 2, nub, nub, COLOR_HEX[cell.color]);
            }
            g.sprite(GERM_FRAMES[cell.color][wiggle], baseX, baseY, { scale: GERM_SCALE });
          } else {
            if (cell.conn === "R" || cell.conn === "D") drawConnector(g, cx, cy, cell.conn, cell.color);
            drawPillHalf(g, cx, cy, cell.color);
          }
        }
      }

      // active + ghost capsule
      if (piece && !over) {
        const p = piece;
        const [dx, dy] = OFFS[p.ori];
        const gy = ghostY();
        const gdy = gy - p.py;
        if (gdy > 0) {
          const gcx = WX + p.px * CELL + CELL / 2;
          const gcy = WY + gy * CELL + CELL / 2;
          const ocx = WX + (p.px + dx) * CELL + CELL / 2;
          const ocy = WY + (gy + dy) * CELL + CELL / 2;
          if (dy === 0) drawConnector(g, Math.min(gcx, ocx), gcy, "R", p.colorA);
          else drawConnector(g, gcx, Math.min(gcy, ocy), "D", p.colorA);
          drawPillHalf(g, gcx, gcy, p.colorA, 0.3);
          drawPillHalf(g, ocx, ocy, p.colorB, 0.3);
        }
        const pcx = WX + p.px * CELL + CELL / 2;
        const pcy = WY + p.py * CELL + CELL / 2;
        const ocx = WX + (p.px + dx) * CELL + CELL / 2;
        const ocy = WY + (p.py + dy) * CELL + CELL / 2;
        if (dy === 0) drawConnector(g, Math.min(pcx, ocx), pcy, "R", p.colorA);
        else drawConnector(g, pcx, Math.min(pcy, ocy), "D", p.colorA);
        drawPillHalf(g, pcx, pcy, p.colorA);
        drawPillHalf(g, ocx, ocy, p.colorB);
      }
      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);

      // ── HUD ──
      g.text(`STAGE ${stage}`, 8, 4, PAL.yellow, { align: "left" });
      g.text(`GERMS ${germsLeft}`, W / 2, 4, PAL.cyan, { align: "center" });
      if (combo > 1) g.text(`COMBO x${combo}`, W - 8, 4, PAL.pink, { align: "right" });

      const panel = (x: number, y: number, w: number, h: number, title: string) => {
        g.rect(x, y, w, h, PAL.navy);
        g.box(x, y, w, h, PAL.sky);
        if (title) g.text(title, x + w / 2, y + 3, PAL.yellow, { align: "center" });
      };

      const bottom = WY + ROWS * CELL;

      // left: next capsule + controls (words, not font glyphs the pixel font can't draw)
      const LX = 6;
      const LW = WX - LX - 6;
      panel(LX, WY, LW, 56, "NEXT");
      {
        const ncx = LX + LW / 2;
        const ncy = WY + 32;
        drawConnector(g, ncx - CELL / 2, ncy, "R", nextColors[0]);
        drawPillHalf(g, ncx - CELL / 2, ncy, nextColors[0]);
        drawPillHalf(g, ncx + CELL / 2, ncy, nextColors[1]);
      }
      panel(LX, WY + 60, LW, bottom - (WY + 60), "");
      const lcx = LX + LW / 2;
      g.text("L R MOVE", lcx, WY + 78, PAL.white, { align: "center" });
      g.text("DOWN DROP", lcx, WY + 96, PAL.white, { align: "center" });
      g.text("A SPIN >", lcx, WY + 118, PAL.grey, { align: "center" });
      g.text("B SPIN <", lcx, WY + 136, PAL.grey, { align: "center" });
      g.text("4+ TO POP", lcx, WY + 160, PAL.lime, { align: "center" });

      // right: Dr. Cotton (bounces + sparkles after a pop, droops when the bottle is nearly full)
      const RX = W - 6 - LW;
      const RW = LW;
      const worried = topFilledRow() <= 3 && !over;
      const cheering = cheerT > 0;
      panel(RX, WY, RW, 88, "DR. COTTON");
      {
        const bounce = cheering ? Math.abs(Math.sin(frame * 0.5)) * 5 : 0;
        const mx = RX + RW / 2 - 12;
        const my = WY + 20 - bounce;
        g.sprite(BUNNY[cheering ? Math.floor(frame / 6) % 2 : worried ? 1 : Math.floor(frame / 24) % 2], mx, my, { scale: 3 });
        if (cheering) {
          g.rect(mx - 4, my - 2, 2, 2, PAL.yellow);
          g.rect(mx + 26, my - 2, 2, 2, PAL.yellow);
          g.rect(mx + 11, my - 8, 2, 2, PAL.yellow);
        } else if (worried) {
          g.rect(mx + 25, my + 8, 2, 5, PAL.sky);
          g.text("!", mx + 10, my - 6, PAL.red, { align: "center" });
        }
      }
      panel(RX, WY + 92, RW, bottom - (WY + 92), "GERMS LEFT");
      for (let c = 0; c < 3; c++) {
        const ry = WY + 92 + 20 + c * 28;
        if (germsByColor[c] > 0) {
          g.sprite(GERM_FRAMES[c][wiggle], RX + 6, ry - 10, { scale: DANCER_SCALE });
          g.text(`x${germsByColor[c]}`, RX + RW - 6, ry, COLOR_HEX[c as Color], { align: "right" });
        } else {
          g.sprite(GERM_FRAMES[c][0], RX + 6, ry - 10, { scale: DANCER_SCALE });
          g.text("CLEAR", RX + RW - 6, ry, PAL.lime, { align: "right" });
        }
      }

      if (bannerT > 0 && banner) {
        const by = WY + ROWS * CELL - 80;
        g.rect(WX - 8, by - 5, COLS * CELL + 16, 16, "#0d0b1acc");
        g.text(banner, W / 2, by, Math.floor(frame / 4) % 2 ? PAL.yellow : PAL.pink, { align: "center" });
      }
    },
  };
}

export const pillDoctor: RetroGameDef = {
  id: "pill-doctor",
  title: "Pill Doctor",
  blurb: "Drop candy capsules to zap wiggling germs — match 4 to cure the bottle!",
  genre: "Puzzle",
  emoji: "💊",
  color: "#5ef2ff",
  controls: "◀ ▶ move · ▼ drop · A/B spin · match 4 colours to beat the germs",
  pad: { dpad: "4", a: "Spin", b: "Spin back" },
  create,
};
