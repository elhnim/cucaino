// MAZE MUNCHER — a maze chase. Munch every candy dot in the maze while four jelly blobs
// wander after you, each with its own idea of where to go: Cherry chases, Bubblegum
// heads you off, Mango roams at random and Minty gets shy when you come close. Grab a
// power berry and the blobs turn blue and run — munch them for big points! The side tunnel
// wraps around, bonus fruit pops up mid-level and each new maze runs a little quicker.
// A pressed direction is remembered and used at the next turn, so touch play feels easy.
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

const blobSprites = (color: string) => {
  const top = ["...bbbb...", ".bbbbbbbb.", "bbbbbbbbbb", "bbbbbbbbbb", "bbbbbbbbbb", "bbbbbbbbbb", "bbbbbbbbbb", "bbbbbbbbbb"];
  return [
    sprite([...top, "bbbbbbbbbb", "bb.bbb.bbb", "b...b...b."], { b: color }),
    sprite([...top, "bbbbbbbbbb", "bbb.bbb.bb", ".b...b...b"], { b: color }),
  ];
};
const BLOB_COLORS = [PAL.red, PAL.pink, PAL.orange, PAL.cyan];
const BLOBS = BLOB_COLORS.map(blobSprites);
const SCARED = blobSprites(PAL.blue);
const SCARED_FLASH = blobSprites(PAL.white);
const SCATTER: [number, number][] = [[27, -2], [0, -2], [0, 26], [27, 26]];

const FRUITS: { spr: Sprite; pts: number }[] = [
  { spr: sprite(["....gg..", "...g.g..", "..g...g.", ".rr..rr.", "rrwr.rwr", "rrrr.rrr", ".rr...r."], { g: PAL.green, r: PAL.red, w: PAL.white }), pts: 100 },
  { spr: sprite(["..gggg..", "...gg...", ".rrrrrr.", "rryrryrr", "rrrrrrrr", ".ryrryr.", "..rrrr..", "...rr..."], { g: PAL.green, r: PAL.red, y: PAL.yellow }), pts: 300 },
  { spr: sprite(["...gg...", "..oooo..", ".oowoooo", ".ooooooo", ".ooooooo", "..oooo.."], { g: PAL.green, o: PAL.orange, w: PAL.white }), pts: 500 },
  { spr: sprite(["....n...", "..gn....", ".pppppp.", "pwpppppp", "pppppppp", "pppppppp", ".pp..pp."], { n: PAL.brown, g: PAL.green, p: PAL.lime, w: PAL.white }), pts: 700 },
  { spr: sprite(["...gg...", "..pppp..", ".pppppp.", ".pwppppp", "..pppp..", "...pp..."], { g: PAL.green, p: PAL.purple, w: PAL.white }), pts: 1000 },
];

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

function create(seed: number): GameInstance {
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
  let wakaFlip = false;

  const scatterMode = () => modeIdx % 2 === 0;
  const add = (io: IO, pts: number) => {
    io.score(pts);
    totalScore += pts;
    if (!extraGiven && totalScore >= 10000) {
      extraGiven = true;
      lives++;
      io.sfx.play("powerup");
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
    } else if (berries[rr][c]) {
      berries[rr][c] = false;
      dotsLeft--;
      eatenThisLevel++;
      add(io, 50);
      io.sfx.play("powerup");
      scaredT = Math.max(150, 420 - (level - 1) * 45);
      combo = 0;
      for (const b of blobs) {
        if (b.state === "eyes") continue;
        b.scared = true;
        if (b.state === "active") b.dir = opp(b.dir);
      }
    }
    if (eatenThisLevel === 70 || eatenThisLevel === 170) {
      if (!fruit) fruit = { t: 9 * 60, kind: Math.min(FRUITS.length - 1, level - 1) };
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
      for (const p of pops) p.t++;
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 50) pops.splice(i, 1);
      if (over) return;

      if (clearT >= 0) {
        clearT++;
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
            const pts = 200 * 2 ** Math.min(3, combo++);
            add(io, pts);
            pops.push({ x: b.x, y: b.y, text: String(pts), t: 0 });
            io.sfx.play("coin");
            freeze = 30;
          } else {
            dying = 0;
            io.sfx.play("die");
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
          io.sfx.play("coin");
          fruit = null;
        } else if (fruit.t <= 0) fruit = null;
      }
    },

    draw(g) {
      g.clear(PAL.black);
      g.camera(-OX, -OY);
      const flash = clearT >= 0 && Math.floor(clearT / 10) % 2 === 1;
      const wallFill = flash ? PAL.purple : PAL.night;
      const wallEdge = flash ? PAL.white : PAL.pink;
      for (let rr = 0; rr < ROWS; rr++)
        for (let c = 0; c < COLS; c++) {
          const ch = MAZE[rr][c];
          const x = c * TILE;
          const y = rr * TILE;
          if (ch === "#") {
            g.rect(x, y, TILE, TILE, wallFill);
            if (!isWall(c, rr - 1) && rr > 0) g.rect(x, y, TILE, 1, wallEdge);
            if (!isWall(c, rr + 1) && rr < ROWS - 1) g.rect(x, y + TILE - 1, TILE, 1, wallEdge);
            if (c > 0 && !isWall(c - 1, rr)) g.rect(x, y, 1, TILE, wallEdge);
            if (c < COLS - 1 && !isWall(c + 1, rr)) g.rect(x + TILE - 1, y, 1, TILE, wallEdge);
          } else if (ch === "-") g.rect(x, y + 3, TILE, 2, PAL.tan);
          if (dots[rr][c]) g.rect(x + 3, y + 3, 2, 2, PAL.tan);
          if (berries[rr][c] && Math.floor(frame / 12) % 2 === 0) {
            g.circle(x + 4, y + 4, 3, PAL.pink);
            g.rect(x + 3, y, 2, 2, PAL.green);
          }
        }

      if (fruit && (fruit.t > 120 || Math.floor(fruit.t / 6) % 2)) g.sprite(FRUITS[fruit.kind].spr, 108, 112);

      // blobs
      for (const b of blobs) {
        if (dying > 40) break;
        if (clearT >= 0) break;
        const x = Math.round(b.x) - 5;
        const y = Math.round(b.y) - 6;
        const f = Math.floor(frame / 8) % 2;
        if (b.state !== "eyes") {
          const sc = b.scared && b.state !== "enter";
          const blink = sc && scaredT < 120 && Math.floor(scaredT / 10) % 2 === 0;
          g.sprite(sc ? (blink ? SCARED_FLASH : SCARED)[f] : BLOBS[b.id][f], x, y);
          if (sc) {
            const fc = blink ? PAL.red : PAL.white;
            g.rect(x + 3, y + 3, 1, 2, fc);
            g.rect(x + 6, y + 3, 1, 2, fc);
            g.rect(x + 2, y + 7, 1, 1, fc);
            g.rect(x + 3, y + 6, 1, 1, fc);
            g.rect(x + 4, y + 7, 2, 1, fc);
            g.rect(x + 6, y + 6, 1, 1, fc);
            g.rect(x + 7, y + 7, 1, 1, fc);
            continue;
          }
        }
        const ex = DX[b.dir];
        const ey = DY[b.dir];
        g.rect(x + 1, y + 2, 3, 4, PAL.white);
        g.rect(x + 6, y + 2, 3, 4, PAL.white);
        g.rect(x + 2 + ex, y + 3 + ey, 2, 2, PAL.navy);
        g.rect(x + 7 + ex, y + 3 + ey, 2, 2, PAL.navy);
      }

      // the muncher
      {
        const hx = Math.round(hero.x);
        const hy = Math.round(hero.y);
        if (dying >= 0) {
          const rad = Math.max(0, 5 - Math.max(0, dying - 30) / 12);
          if (rad > 0) g.circle(hx, hy, rad, PAL.yellow);
          if (dying > 30 && dying < 90)
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              const d = (dying - 30) * 0.4;
              g.rect(hx + Math.cos(a) * d, hy + Math.sin(a) * d, 2, 2, i % 2 ? PAL.pink : PAL.yellow);
            }
        } else {
          g.circle(hx, hy, 5, PAL.yellow);
          const open = hero.moving ? Math.abs(Math.sin(hero.anim * 0.25)) : 0.6;
          const d = hero.dir;
          for (let i = 1; i <= 5; i++) {
            const hw = Math.round(i * open * 0.9);
            if (d === 3) g.rect(hx + i, hy - hw, 1, hw * 2 + 1, PAL.black);
            else if (d === 1) g.rect(hx - i, hy - hw, 1, hw * 2 + 1, PAL.black);
            else if (d === 0) g.rect(hx - hw, hy - i, hw * 2 + 1, 1, PAL.black);
            else g.rect(hx - hw, hy + i, hw * 2 + 1, 1, PAL.black);
          }
          // eye + bow
          const exo = d === 1 ? 1 : d === 3 ? -1 : 2;
          g.rect(hx + exo - (d === 1 ? 0 : 1), hy - 3, 1, 1, PAL.black);
          g.rect(hx - 2, hy - 7, 2, 2, PAL.pink);
          g.rect(hx + 1, hy - 7, 2, 2, PAL.pink);
          g.rect(hx, hy - 6, 1, 1, PAL.red);
        }
      }

      for (const p of pops) g.text(p.text, p.x + OX, p.y + OY - 8 - p.t * 0.3, PAL.cyan, { align: "center" });
      if (ready > 0) g.text("READY!", 14 * TILE + OX, 14 * TILE + OY, Math.floor(ready / 8) % 2 ? PAL.yellow : PAL.white, { align: "center" });
      g.camera(0, 0);

      // HUD
      g.text(`LEVEL ${level}`, 16, 4, PAL.yellow);
      for (let i = 0; i < Math.min(6, lives); i++) {
        const lx = 244 - i * 12;
        g.circle(lx, 7, 4, PAL.yellow);
        g.rect(lx + 1, 6, 4, 3, PAL.black);
      }
      if (scaredT > 0) g.text("BERRY POWER!", 128, 4, Math.floor(frame / 6) % 2 ? PAL.cyan : PAL.blue, { align: "center" });
      // fruit collection strip
      for (let i = 0; i <= Math.min(FRUITS.length - 1, level - 1); i++) g.sprite(FRUITS[i].spr, 232 - i * 10, H - 8);
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
