// MAZE MUNCHER — a maze chase. Munch every candy dot in the maze while four jelly blobs
// wander after you, each with its own idea of where to go: Cherry chases, Bubblegum
// heads you off, Mango roams at random and Minty gets shy when you come close. Grab a
// power berry and the blobs turn blue and run — munch them for big points! The side tunnel
// wraps around, bonus fruit pops up mid-level and each new maze runs a little quicker.
// A pressed direction is remembered and used at the next turn, so touch play feels easy.
import { bake, hash2, outlined, ramp, shade } from "../art";
import { H, PAL, W, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";

const TILE = 8;
const OX = 16;
const OY = 16;
// the left half of the maze; the right half is its mirror image
const HALF = [
  "##############",
  "#............#",
  "#.####.#####.#",
  "#o####.#####.#",
  "#.............",
  "#.####.##.####",
  "#......##....#",
  "######.#####.#",
  "######.#......",
  "######.#.####-",
  "######.#.#    ",
  "      ...#    ",
  "######.#.#    ",
  "######.#.#####",
  "######.#......",
  "######.#.#####",
  "#............#",
  "#.####.#####.#",
  "#o..##........",
  "###.##.##.####",
  "#......##....#",
  "#.####.##.##.#",
  "#.####.##.##.#",
  "#.............",
  "##############",
];
const MAZE = HALF.map((h) => h + [...h].reverse().join(""));
const COLS = 28;
const ROWS = MAZE.length;
const TUNNEL_ROW = 11;

type Dir = 0 | 1 | 2 | 3; // up, left, down, right
const DX = [0, -1, 0, 1];
const DY = [-1, 0, 1, 0];
const BTN = ["up", "left", "down", "right"] as const;
const opp = (d: Dir) => ((d + 2) % 4) as Dir;
const wrapC = (c: number) => ((c % COLS) + COLS) % COLS;
const inHouse = (c: number, r: number) => r >= 10 && r <= 12 && c >= 10 && c <= 17;
const isWall = (c: number, r: number) => r < 0 || r >= ROWS || MAZE[r][wrapC(c)] === "#";
const walkable = (c: number, r: number) => {
  if (r < 0 || r >= ROWS) return false;
  const ch = MAZE[r][wrapC(c)];
  return ch !== "#" && ch !== "-" && !inHouse(wrapC(c), r);
};
const atCentre = (x: number, y: number) => (((x - 4) % 8) + 8) % 8 === 0 && (((y - 4) % 8) + 8) % 8 === 0;
const tileOf = (v: number) => Math.floor(v / TILE);

const BLOB_COLORS = [PAL.red, PAL.pink, PAL.orange, PAL.cyan];
const SCATTER: [number, number][] = [[27, -2], [0, -2], [0, 26], [27, 26]];

const FRUITS: { spr: Sprite; pts: number }[] = [
  { spr: sprite(["....gg..", "...g.g..", "..g...g.", ".rr..rr.", "rrwr.rwr", "rrrr.rrr", ".rr...r."], { g: PAL.green, r: PAL.red, w: PAL.white }), pts: 100 },
  { spr: sprite(["..gggg..", "...gg...", ".rrrrrr.", "rryrryrr", "rrrrrrrr", ".ryrryr.", "..rrrr..", "...rr..."], { g: PAL.green, r: PAL.red, y: PAL.yellow }), pts: 300 },
  { spr: sprite(["...gg...", "..oooo..", ".oowoooo", ".ooooooo", ".ooooooo", "..oooo.."], { g: PAL.green, o: PAL.orange, w: PAL.white }), pts: 500 },
  { spr: sprite(["....n...", "..gn....", ".pppppp.", "pwpppppp", "pppppppp", "pppppppp", ".pp..pp."], { n: PAL.brown, g: PAL.green, p: PAL.lime, w: PAL.white }), pts: 700 },
  { spr: sprite(["...gg...", "..pppp..", ".pppppp.", ".pwppppp", "..pppp..", "...pp..."], { g: PAL.green, p: PAL.purple, w: PAL.white }), pts: 1000 },
];

// ── pixel art, built lazily (never at module load) ──

/** faint speckled floor colour shared by every open pixel (corridors AND deep wall interiors,
 *  which are never shown as "wall" — only the tube along the boundary is) */
const floorPx = (x: number, y: number) => (hash2(x, y, 909) < 0.1 ? shade(PAL.black, 0.2) : null);

/** the whole static maze baked once as rounded teal TUBES tracing the boundary between wall and
 *  corridor (classic Pac-Man line-maze look) — everything else, including deep wall interiors,
 *  is the same dark floor as the corridors. The tube's thickness is a short distance field built
 *  from each wall cell's 8 neighbours (orthogonal edges + diagonal corners for rounding), so
 *  corners and dead-ends come out naturally rounded without any lookup tables. One sprite blit a
 *  frame instead of ~700 small ones. */
function mazeBackgroundRows(wallBase: string): Sprite {
  const w = COLS * TILE;
  const h = ROWS * TILE;
  const T = 3; // tube thickness in px
  // "open" for the purposes of drawing the tube: not a wall, OR past the top/bottom edge of the
  // map (so the outer border reads as a closed pipe too) — columns always wrap, never go "outside"
  const open = (c: number, r: number) => r < 0 || r >= ROWS || MAZE[r][wrapC(c)] !== "#";
  return bake(w, h, (x, y) => {
    const c = Math.floor(x / TILE);
    const rr = Math.floor(y / TILE);
    const ch = MAZE[rr][wrapC(c)];
    if (ch !== "#") return ch === " " ? null : floorPx(x, y);
    const lx = x - c * TILE;
    const ly = y - rr * TILE;
    const openT = open(c, rr - 1);
    const openB = open(c, rr + 1);
    const openL = open(c - 1, rr);
    const openR = open(c + 1, rr);
    const topD = openT ? ly : Infinity;
    const botD = openB ? TILE - 1 - ly : Infinity;
    const leftD = openL ? lx : Infinity;
    const rightD = openR ? TILE - 1 - lx : Infinity;
    // concave corners: the diagonal neighbour is open but both of its orthogonal neighbours
    // (already tested above) are walls, so the opening only grazes this cell's very corner
    const cornerTL = !openT && !openL && open(c - 1, rr - 1) ? Math.hypot(lx, ly) : Infinity;
    const cornerTR = !openT && !openR && open(c + 1, rr - 1) ? Math.hypot(TILE - 1 - lx, ly) : Infinity;
    const cornerBL = !openB && !openL && open(c - 1, rr + 1) ? Math.hypot(lx, TILE - 1 - ly) : Infinity;
    const cornerBR = !openB && !openR && open(c + 1, rr + 1) ? Math.hypot(TILE - 1 - lx, TILE - 1 - ly) : Infinity;
    const dmin = Math.min(topD, botD, leftD, rightD, cornerTL, cornerTR, cornerBL, cornerBR);
    if (dmin > T) return floorPx(x, y); // deep inside a wall block — same as corridor floor
    const rim = 1 - dmin / T; // 1 at the boundary (bright), 0 at the inner edge of the tube
    const bias = dmin === topD || dmin === leftD || dmin === cornerTL ? 0.12 : dmin === botD || dmin === rightD || dmin === cornerBR ? -0.1 : 0;
    const k = Math.max(-0.5, Math.min(0.45, -0.35 + rim * 0.7 + bias));
    return shade(wallBase, k);
  });
}
/** one jelly-blob body, 12x12: a rounded dome shaded light (top-left) to dark (bottom-right),
 *  with two wavy-feet frames for the walk wobble */
function blobBodyRows(color: string, footFrame: number): Sprite {
  const w = 12;
  const domeBottom = 8;
  const [c0, c1, c2, c3] = ramp(color, 4, 0.55);
  const rx = w / 2 - 0.5;
  return outlined(
    bake(w, 12, (x, y) => {
      const dx = x + 0.5 - w / 2;
      if (y < domeBottom) {
        const dy = domeBottom - y;
        const e = (dx * dx) / (rx * rx) + (dy * dy) / (domeBottom * domeBottom);
        if (e > 1) return null;
        const light = (-dx / rx) * 0.45 + (dy / domeBottom) * 0.4;
        return light > 0.4 ? c3 : light > 0.05 ? c2 : light > -0.35 ? c1 : c0;
      }
      const wave = Math.sin((x / w) * Math.PI * 3 + footFrame * Math.PI) * 1.1;
      if (Math.abs(dx) > rx || y > domeBottom + 2 + wave) return null;
      return c1;
    })
  );
}

interface Art {
  mazeBG: Sprite;
  mazeBGFlash: Sprite;
  blobs: Sprite[][];
  scared: Sprite[];
  scaredFlash: Sprite[];
  berry: Sprite;
  fruits: Sprite[];
}
let A: Art | null = null;
const art = (): Art =>
  (A ??= {
    mazeBG: mazeBackgroundRows(PAL.teal),
    mazeBGFlash: mazeBackgroundRows(PAL.purple),
    blobs: BLOB_COLORS.map((c) => [0, 1].map((f) => blobBodyRows(c, f))),
    scared: [0, 1].map((f) => blobBodyRows(PAL.blue, f)),
    scaredFlash: [0, 1].map((f) => blobBodyRows(PAL.white, f)),
    berry: bake(8, 8, (x, y) => {
      const dx = x + 0.5 - 4;
      const dy = y + 1.2 - 4;
      if (y < 1) return Math.abs(x - 4) <= 1 ? shade(PAL.green, -0.1) : null;
      const d = Math.hypot(dx, dy);
      if (d > 3.3) return null;
      if (dx < -0.3 && dy < -0.3 && d < 1.6) return PAL.white;
      return d > 2.5 ? shade(PAL.pink, -0.3) : PAL.pink;
    }),
    fruits: FRUITS.map((f) => outlined(f.spr)),
  });

interface Blob {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  acc: number;
  state: "house" | "leave" | "active" | "eyes" | "enter";
  scared: boolean;
  release: number;
  bob: number;
}
interface Pop {
  x: number;
  y: number;
  text: string;
  t: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  color: string;
}

function create(seed: number): GameInstance {
  const gfx = art();
  const r = rng(seed);
  let dots: boolean[][] = [];
  let berries: boolean[][] = [];
  let dotsLeft = 0;
  let eatenThisLevel = 0;
  const fillDots = () => {
    dots = MAZE.map((row) => [...row].map((ch) => ch === "."));
    berries = MAZE.map((row) => [...row].map((ch) => ch === "o"));
    dots[18][13] = dots[18][14] = false; // start spot
    dotsLeft = dots.flat().filter(Boolean).length + berries.flat().filter(Boolean).length;
    eatenThisLevel = 0;
  };
  fillDots();

  let level = 1;
  let lives = 3;
  let extraGiven = false;
  let totalScore = 0;
  const hero = { x: 13 * TILE + 4, y: 18 * TILE + 4, dir: 1 as Dir, want: 1 as Dir, acc: 0, moving: true, anim: 0 };
  const blobs: Blob[] = [0, 1, 2, 3].map((id) => ({ id, x: 0, y: 0, dir: 1 as Dir, acc: 0, state: "house", scared: false, release: 0, bob: 0 }));
  let modeIdx = 0;
  let modeT = 0;
  const MODES = [7, 20, 7, 20, 5, 20, 5, 99999].map((s) => s * 60);
  let scaredT = 0;
  let combo = 0;
  let frame = 0;
  let levelT = 0;
  let ready = 120;
  let dying = -1;
  let clearT = -1;
  let freeze = 0;
  let over = false;
  let fruit: { t: number; kind: number } | null = null;
  const pops: Pop[] = [];
  const sparks: Spark[] = [];
  let wakaFlip = false;
  let shake = 0;

  const scatterMode = () => modeIdx % 2 === 0;
  const add = (io: IO, pts: number) => {
    io.score(pts);
    totalScore += pts;
    if (!extraGiven && totalScore >= 10000) {
      extraGiven = true;
      lives++;
      io.sfx.play("cheer");
    }
  };
  const spawnSparks = (x: number, y: number, dir: Dir, color: string) => {
    if (sparks.length >= 24) return;
    for (let i = 0; i < 2; i++) {
      const a = Math.atan2(-DY[dir], -DX[dir]) + (i === 0 ? -0.6 : 0.6);
      sparks.push({ x, y, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6, t: 0, color });
    }
  };

  const resetActors = () => {
    hero.x = 13 * TILE + 4;
    hero.y = 18 * TILE + 4;
    hero.dir = hero.want = 1;
    hero.acc = 0;
    hero.moving = true;
    const homes = [
      [13 * TILE + 4, 8 * TILE + 4],
      [112, 92],
      [96, 92],
      [128, 92],
    ];
    blobs.forEach((b, i) => {
      b.x = homes[i][0];
      b.y = homes[i][1];
      b.dir = i === 0 ? 1 : 0;
      b.acc = 0;
      b.state = i === 0 ? "active" : "house";
      b.scared = false;
      b.release = [0, 60, 240, 420][i];
      b.bob = i * 7;
    });
    modeIdx = 0;
    modeT = 0;
    scaredT = 0;
    levelT = 0;
    fruit = null;
  };
  resetActors();

  const heroSpeed = () => Math.min(1.25, 0.95 + (level - 1) * 0.04);
  const blobSpeed = (b: Blob) => {
    if (b.state === "eyes") return 2;
    if (b.state !== "active") return 0.6;
    if (b.y === TUNNEL_ROW * TILE + 4 && (tileOf(b.x) <= 5 || tileOf(b.x) >= 22 || b.x < 0)) return 0.45;
    if (b.scared) return 0.5;
    return Math.min(1.2, 0.78 + (level - 1) * 0.06);
  };

  const wrapX = (e: { x: number }) => {
    if (e.x < -4) e.x += COLS * TILE;
    else if (e.x > COLS * TILE + 3) e.x -= COLS * TILE;
  };

  const targetFor = (b: Blob): [number, number] => {
    if (b.state === "eyes") return [13, 8];
    const hc = tileOf(hero.x);
    const hr = tileOf(hero.y);
    if (scatterMode()) return SCATTER[b.id];
    if (b.id === 0) return [hc, hr];
    if (b.id === 1) return [hc + DX[hero.dir] * 4, hr + DY[hero.dir] * 4];
    if (b.id === 3) {
      const d = Math.hypot(tileOf(b.x) - hc, tileOf(b.y) - hr);
      return d > 8 ? [hc, hr] : SCATTER[3];
    }
    return [hc, hr];
  };

  const chooseDir = (b: Blob) => {
    const c = tileOf(b.x);
    const rr = tileOf(b.y);
    const opts = ([0, 1, 2, 3] as Dir[]).filter((d) => d !== opp(b.dir) && walkable(c + DX[d], rr + DY[d]));
    if (!opts.length) return opp(b.dir);
    if (opts.length === 1) return opts[0];
    const randomish = b.state === "active" && (b.scared || (b.id === 2 && !scatterMode()));
    if (randomish) return r.pick(opts);
    const [tx, ty] = targetFor(b);
    let best = opts[0];
    let bestD = Infinity;
    for (const d of opts) {
      const dd = (c + DX[d] - tx) ** 2 + (rr + DY[d] - ty) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  };

  const moveBlob = (b: Blob) => {
    b.acc += blobSpeed(b);
    while (b.acc >= 1) {
      b.acc -= 1;
      if (b.state === "house") {
        b.bob++;
        b.y = 92 + (Math.floor(b.bob / 8) % 2 ? 2 : -1);
      } else if (b.state === "leave") {
        if (b.x !== 112) b.x += b.x < 112 ? 1 : -1;
        else if (b.y > 68) b.y -= 1;
        else {
          b.x = 108;
          b.state = "active";
          b.dir = 1;
        }
      } else if (b.state === "enter") {
        if (b.y < 92) b.y += 1;
        else b.state = "leave";
      } else {
        if (atCentre(b.x, b.y)) {
          if (b.state === "eyes" && tileOf(b.x) === 13 && tileOf(b.y) === 8) {
            b.state = "enter";
            b.x = 112;
            continue;
          }
          b.dir = chooseDir(b);
        }
        b.x += DX[b.dir];
        b.y += DY[b.dir];
        wrapX(b);
      }
    }
  };

  const eatAt = (io: IO) => {
    const c = wrapC(tileOf(hero.x));
    const rr = tileOf(hero.y);
    if (rr < 0 || rr >= ROWS) return;
    if (dots[rr][c]) {
      dots[rr][c] = false;
      dotsLeft--;
      eatenThisLevel++;
      add(io, 10);
      wakaFlip = !wakaFlip;
      io.sfx.tone(wakaFlip ? 520 : 390, 0.05, "triangle", 0.07);
      spawnSparks(hero.x, hero.y, hero.dir, PAL.tan);
    } else if (berries[rr][c]) {
      berries[rr][c] = false;
      dotsLeft--;
      eatenThisLevel++;
      add(io, 50);
      io.sfx.play("powerup");
      io.sfx.slide?.(220, 440, 0.25, "sawtooth", 0.1);
      scaredT = Math.max(150, 420 - (level - 1) * 45);
      combo = 0;
      for (const b of blobs) {
        if (b.state === "eyes") continue;
        b.scared = true;
        if (b.state === "active") b.dir = opp(b.dir);
      }
    }
    if (eatenThisLevel === 70 || eatenThisLevel === 170) {
      if (!fruit) {
        fruit = { t: 9 * 60, kind: Math.min(FRUITS.length - 1, level - 1) };
        io.sfx.play("pop");
      }
    }
  };

  const moveHero = (io: IO) => {
    const inp = io.input;
    let pressed = false;
    for (let d = 0; d < 4; d++)
      if (inp.pressed[BTN[d]]) {
        hero.want = d as Dir;
        pressed = true;
      }
    if (!pressed && !inp.held[BTN[hero.want]]) {
      for (let d = 0; d < 4; d++)
        if (inp.held[BTN[d]]) {
          hero.want = d as Dir;
          break;
        }
    }
    hero.acc += heroSpeed();
    while (hero.acc >= 1) {
      hero.acc -= 1;
      if (hero.want === opp(hero.dir)) {
        hero.dir = hero.want;
        hero.moving = true;
      }
      if (atCentre(hero.x, hero.y)) {
        const c = tileOf(hero.x);
        const rr = tileOf(hero.y);
        if (walkable(c + DX[hero.want], rr + DY[hero.want])) hero.dir = hero.want;
        if (!walkable(c + DX[hero.dir], rr + DY[hero.dir])) {
          hero.moving = false;
          hero.acc = 0;
          break;
        }
      }
      hero.moving = true;
      hero.x += DX[hero.dir];
      hero.y += DY[hero.dir];
      wrapX(hero);
      hero.anim++;
      eatAt(io);
    }
  };

  return {
    update(io) {
      frame++;
      shake = Math.max(0, shake - 1);
      for (const p of pops) p.t++;
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 50) pops.splice(i, 1);
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.t++;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t > 16) sparks.splice(i, 1);
      if (over) return;

      if (clearT >= 0) {
        clearT++;
        if (clearT % 20 === 0 && clearT < 80) io.sfx.tone(440 + (clearT / 20) * 160, 0.15, "square", 0.18);
        if (clearT > 130) {
          clearT = -1;
          level++;
          fillDots();
          resetActors();
          ready = 90;
        }
        return;
      }
      if (dying >= 0) {
        dying++;
        if (dying > 100) {
          dying = -1;
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          resetActors();
          ready = 90;
        }
        return;
      }
      if (ready > 0) {
        ready--;
        if (ready === 1) io.sfx.play("select");
        // let the kid pick a first direction during READY
        for (let d = 0; d < 4; d++) if (io.input.pressed[BTN[d]]) hero.want = d as Dir;
        return;
      }
      if (freeze > 0) {
        freeze--;
        return;
      }

      levelT++;
      if (scaredT > 0) {
        scaredT--;
        if (scaredT === 0) for (const b of blobs) b.scared = false;
      } else {
        modeT++;
        if (modeT >= MODES[Math.min(modeIdx, MODES.length - 1)]) {
          modeT = 0;
          modeIdx++;
          for (const b of blobs) if (b.state === "active") b.dir = opp(b.dir);
          io.sfx.play("blip");
        }
      }

      moveHero(io);
      if (dotsLeft <= 0) {
        clearT = 0;
        io.sfx.play("win");
        add(io, 500 * level);
        return;
      }

      for (const b of blobs) {
        if (b.state === "house" && levelT >= b.release) b.state = "leave";
        moveBlob(b);
        if (b.state === "house" || b.state === "leave" || b.state === "enter" || b.state === "eyes") continue;
        if (Math.abs(b.x - hero.x) < 6 && Math.abs(b.y - hero.y) < 6) {
          if (b.scared) {
            b.scared = false;
            b.state = "eyes";
            const comboN = combo++;
            const pts = 200 * 2 ** Math.min(3, comboN);
            add(io, pts);
            pops.push({ x: b.x, y: b.y, text: String(pts), t: 0 });
            io.sfx.play("coin");
            io.sfx.tone(500 + comboN * 150, 0.12, "square", 0.18);
            spawnSparks(b.x, b.y, b.dir, PAL.cyan);
            freeze = 30;
          } else {
            dying = 0;
            shake = 14;
            io.sfx.play("die");
            io.sfx.noise?.(0.35, 0.2, 500, 80);
            return;
          }
        }
      }

      if (fruit) {
        fruit.t--;
        if (Math.abs(hero.x - 112) < 6 && Math.abs(hero.y - 116) < 6) {
          const pts = FRUITS[fruit.kind].pts;
          add(io, pts);
          pops.push({ x: 112, y: 116, text: String(pts), t: 0 });
          io.sfx.play("pickup");
          spawnSparks(112, 116, hero.dir, PAL.lime);
          fruit = null;
        } else if (fruit.t <= 0) fruit = null;
      }
    },

    draw(g) {
      g.clear(PAL.black);
      const jx = shake > 0 ? (hash2(frame, 1, 7) - 0.5) * Math.min(shake, 8) : 0;
      const jy = shake > 0 ? (hash2(frame, 2, 7) - 0.5) * Math.min(shake, 8) : 0;
      g.camera(-OX + jx, -OY + jy);
      const flash = clearT >= 0 && Math.floor(clearT / 10) % 2 === 1;
      g.sprite(flash ? gfx.mazeBGFlash : gfx.mazeBG, 0, 0);
      for (let rr = 0; rr < ROWS; rr++)
        for (let c = 0; c < COLS; c++) {
          const ch = MAZE[rr][c];
          if (ch === "#" || ch === " ") continue;
          const x = c * TILE;
          const y = rr * TILE;
          if (ch === "-") g.rect(x, y + 3, TILE, 2, Math.floor(frame / 8) % 2 ? PAL.white : PAL.tan);
          if (dots[rr][c]) {
            g.rect(x + 3, y + 2, 2, 4, PAL.yellow);
            g.rect(x + 2, y + 3, 4, 2, PAL.yellow);
            g.rect(x + 3, y + 3, 1, 1, PAL.white);
          }
          if (berries[rr][c] && Math.floor(frame / 12) % 2 === 0) {
            g.alpha(0.3);
            g.circle(x + 4, y + 4, 4, PAL.pink);
            g.alpha(1);
            g.sprite(gfx.berry, x, y);
          }
        }

      if (fruit && (fruit.t > 120 || Math.floor(fruit.t / 6) % 2)) g.sprite(gfx.fruits[fruit.kind], 107, 111);

      for (const s of sparks) g.rect(Math.round(s.x), Math.round(s.y), 1, 1, s.color);

      // blobs
      for (const b of blobs) {
        if (dying > 40) break;
        if (clearT >= 0) break;
        const x = Math.round(b.x) - 7;
        const y = Math.round(b.y) - 7;
        const f = Math.floor(frame / 8) % 2;
        if (b.state !== "eyes") {
          const sc = b.scared && b.state !== "enter";
          const blink = sc && scaredT < 120 && Math.floor(scaredT / 10) % 2 === 0;
          g.sprite(sc ? (blink ? gfx.scaredFlash : gfx.scared)[f] : gfx.blobs[b.id][f], x, y);
          if (sc) {
            const fc = blink ? PAL.red : PAL.white;
            g.rect(x + 3, y + 4, 2, 1, fc);
            g.rect(x + 8, y + 4, 2, 1, fc);
            g.rect(x + 3, y + 7, 1, 1, fc);
            g.rect(x + 4, y + 6, 1, 1, fc);
            g.rect(x + 5, y + 7, 2, 1, fc);
            g.rect(x + 8, y + 6, 1, 1, fc);
            g.rect(x + 9, y + 7, 1, 1, fc);
            continue;
          }
        }
        const ex = DX[b.dir];
        const ey = DY[b.dir];
        g.circle(x + 4, y + 5, 2, PAL.white);
        g.circle(x + 9, y + 5, 2, PAL.white);
        g.circle(x + 4 + ex, y + 5 + ey, 1, PAL.navy);
        g.circle(x + 9 + ex, y + 5 + ey, 1, PAL.navy);
      }

      // the muncher
      {
        const hx = Math.round(hero.x);
        const hy = Math.round(hero.y);
        const RAD = 6;
        if (dying >= 0) {
          const rad = Math.max(0, RAD - Math.max(0, dying - 30) / 12);
          if (rad > 0) g.circle(hx, hy, rad, PAL.yellow);
          if (dying > 30 && dying < 90)
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              const d = (dying - 30) * 0.4;
              g.rect(hx + Math.cos(a) * d, hy + Math.sin(a) * d, 2, 2, i % 3 === 0 ? PAL.white : i % 2 ? PAL.pink : PAL.yellow);
            }
        } else {
          if (scaredT > 0) {
            g.alpha(0.3 + 0.15 * Math.sin(frame * 0.3));
            g.circle(hx, hy, RAD + 2, PAL.cyan);
            g.alpha(1);
          }
          g.circle(hx + 1, hy + 1, RAD, shade(PAL.orange, -0.35));
          g.circle(hx, hy, RAD, PAL.orange);
          g.circle(hx - 2, hy - 2, RAD - 3, shade(PAL.orange, 0.3));
          const open = hero.moving ? Math.abs(Math.sin(hero.anim * 0.25)) : 0.6;
          const d = hero.dir;
          for (let i = 1; i <= RAD; i++) {
            const hw = Math.round(i * open * 0.9);
            if (d === 3) g.rect(hx + i, hy - hw, 1, hw * 2 + 1, PAL.black);
            else if (d === 1) g.rect(hx - i, hy - hw, 1, hw * 2 + 1, PAL.black);
            else if (d === 0) g.rect(hx - hw, hy - i, hw * 2 + 1, 1, PAL.black);
            else g.rect(hx - hw, hy + i, hw * 2 + 1, 1, PAL.black);
          }
          // eye — tucked into whichever half the mouth wedge isn't eating into
          const exo = d === 1 ? 2 : d === 3 ? -2 : 2;
          const eyeY = d === 0 ? hy + 3 : hy - 3;
          g.circle(hx + exo, eyeY, 2, PAL.white);
          g.circle(hx + exo, eyeY, 1, PAL.black);
        }
      }

      for (const p of pops) g.text(p.text, p.x + OX, p.y + OY - 8 - p.t * 0.3, PAL.cyan, { align: "center" });
      if (ready > 0) g.text("READY!", 14 * TILE + OX, 14 * TILE + OY, Math.floor(ready / 8) % 2 ? PAL.yellow : PAL.white, { align: "center" });
      g.camera(0, 0);

      // HUD: a thin framed panel so the readout doesn't fight the maze
      g.alpha(0.55);
      g.rect(0, 0, W, 12, PAL.night);
      g.alpha(1);
      g.rect(0, 11, W, 1, PAL.teal);
      g.text(`LEVEL ${level}`, 16, 4, PAL.yellow);
      for (let i = 0; i < Math.min(6, lives); i++) {
        const lx = 244 - i * 12;
        g.circle(lx, 7, 4, PAL.yellow);
        g.rect(lx + 1, 6, 4, 3, PAL.black);
      }
      if (scaredT > 0) g.text("BERRY POWER!", 128, 4, Math.floor(frame / 6) % 2 ? PAL.cyan : PAL.blue, { align: "center" });
      // fruit collection strip
      for (let i = 0; i <= Math.min(FRUITS.length - 1, level - 1); i++) g.sprite(gfx.fruits[i], 231 - i * 10, H - 9);
      if (clearT > 20) g.text("MAZE CLEAR!", W / 2, 14 * TILE + OY, PAL.white, { align: "center" });
    },
  };
}

export const mazeMuncher: RetroGameDef = {
  id: "maze-muncher",
  title: "Maze Muncher",
  blurb: "Munch every dot, dodge the jelly blobs, gobble a berry and chase them back!",
  genre: "Classic",
  emoji: "🟡",
  color: "#ffe14d",
  controls: "◀ ▶ ▲ ▼ steer (tap early — you turn at the next corner) · berries make blobs run away",
  pad: { dpad: "4" },
  create,
};
