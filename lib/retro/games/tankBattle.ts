// TANK BATTLE — a top-down maze shoot-'em-up. Drive your tank through a brick-and-steel
// battlefield, blast waves of enemy tanks before they blast you, and above all protect your
// base — a little star emblem boxed in by bricks at the bottom of the map. Shoot bricks to
// rubble (one quarter-block at a time), hide under bushes, and grab power-ups dropped by
// flashing enemies. 3 lives, several handcrafted battlefields that cycle and get tougher.
// (Original game in the spirit of 8-bit tank-maze classics — no borrowed names or art.)
import { H, PAL, W, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

// ── layout ──
const T = 16; // tile size
const COLS = 13;
const ROWS = 13;
const ARENA = COLS * T; // 208 x 208 battlefield
const OX = 4; // arena sits left, HUD strip on the right
const OY = 8;
const BLOCK = T / 2; // 8px chip blocks (also the half-tile movement grid)
const BCOLS = COLS * 2;
const BROWS = ROWS * 2;
const TANK = 14; // tank hitbox, a hair smaller than a tile
const PLAYER_SPAWN_COL = 3;
const BASE_COL = 6;
const BASE_ROW = ROWS - 1;
const TOTAL_STAGES = 8;

// terrain codes, one per 8x8 chip block
const EMPTY = 0,
  BRICK = 1,
  STEEL = 2,
  WATER = 3,
  BUSH = 4,
  BASE = 5;

// ── handcrafted battlefields (13x13 chars; '.' empty '#' brick '%' steel '~' water '*' bush) ──
const STAGE_LAYOUTS: string[][] = [
  [
    ".............",
    ".#.#.#.#.#.#.",
    ".............",
    "..###...###..",
    ".............",
    "#.....#.....#",
    ".............",
    "...*****.....",
    ".............",
    "#.....#.....#",
    ".............",
    "..###...###..",
    ".............",
  ],
  [
    ".............",
    "..%.......%..",
    "..#.......#..",
    ".............",
    "####.....####",
    ".............",
    "...%%%.%%%...",
    ".............",
    "####.....####",
    ".............",
    "..#.......#..",
    "..%.......%..",
    ".............",
  ],
  [
    ".............",
    "..###...###..",
    ".............",
    "#.....#.....#",
    ".............",
    "..~~~~~~~~~..",
    "..~~~~~~~~~..",
    ".............",
    "#.....#.....#",
    ".............",
    "..###...###..",
    ".............",
    ".............",
  ],
  [
    ".%.........%.",
    ".#.#.#.#.#.#.",
    ".............",
    "..###.#.###..",
    ".............",
    "#.%.......%.#",
    "...~~~.~~~...",
    "#.%.......%.#",
    ".............",
    "..###.#.###..",
    ".............",
    ".#.#.#.#.#.#.",
    ".............",
  ],
];
for (const layout of STAGE_LAYOUTS) {
  if (layout.length !== ROWS || layout.some((row) => row.length !== COLS)) throw new Error("tankBattle: bad stage layout size");
}

// ── sprites: one hand-drawn hull (barrel pointing up), transposed for the sideways facing,
// then mirrored with flipX/flipY at draw time to cover all 4 directions ──
function buildVerticalTank(): string[] {
  const n = 14;
  const g: string[][] = Array.from({ length: n }, () => Array(n).fill("."));
  const put = (x: number, y: number, c: string) => {
    g[y][x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
  };
  rect(0, 3, 1, 13, "d");
  rect(12, 3, 13, 13, "d"); // tread tracks
  for (let y = 4; y < 14; y += 3) {
    put(0, y, "k");
    put(1, y, "k");
    put(12, y, "k");
    put(13, y, "k");
  }
  rect(2, 3, 11, 13, "b"); // hull
  rect(2, 3, 11, 3, "k");
  rect(2, 13, 11, 13, "k");
  rect(4, 2, 9, 6, "h"); // turret hub
  rect(4, 2, 9, 2, "k");
  rect(6, 0, 7, 3, "g"); // barrel, pointing up
  put(5, 4, "w");
  put(5, 5, "w"); // highlight
  return g.map((row) => row.join(""));
}
function transposeRows(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0].length;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = "";
    for (let y = 0; y < h; y++) row += rows[y][x];
    out.push(row);
  }
  return out;
}
const TANK_UP_ROWS = buildVerticalTank();
const TANK_SIDE_ROWS = transposeRows(TANK_UP_ROWS); // barrel points left

type TankPal = Record<string, string>;
const tankSprites = (pal: TankPal) => ({ up: sprite(TANK_UP_ROWS, pal), side: sprite(TANK_SIDE_ROWS, pal) });
const PLAYER_PAL: TankPal = { b: PAL.yellow, d: PAL.dark, h: PAL.orange, g: PAL.black, w: PAL.white, k: PAL.black };
const BASIC_PAL: TankPal = { b: PAL.grey, d: PAL.dark, h: "#5a6080", g: PAL.black, w: PAL.white, k: PAL.black };
const FAST_PAL: TankPal = { b: PAL.sky, d: PAL.navy, h: PAL.blue, g: PAL.black, w: PAL.white, k: PAL.black };
const ARMORED_PALS: TankPal[] = [
  { b: PAL.purple, d: PAL.dark, h: "#5a3a8a", g: PAL.black, w: PAL.white, k: PAL.black },
  { b: PAL.pink, d: PAL.dark, h: "#a84a8a", g: PAL.black, w: PAL.white, k: PAL.black },
  { b: PAL.red, d: PAL.dark, h: "#a82020", g: PAL.black, w: PAL.white, k: PAL.black },
];
const PLAYER_SPR = tankSprites(PLAYER_PAL);
const BASIC_SPR = tankSprites(BASIC_PAL);
const FAST_SPR = tankSprites(FAST_PAL);
const ARMORED_SPR = ARMORED_PALS.map(tankSprites);

// ── types ──
type Dir = "up" | "down" | "left" | "right";
type EnemyKind = "basic" | "fast" | "armored";
type PowKind = "star" | "shield" | "shovel" | "life" | "freeze";
const DIR_VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

interface Tank {
  x: number;
  y: number;
  dir: Dir;
  alive: boolean;
  kind: "player" | EnemyKind;
  hp: number;
  maxHp: number;
  speed: number;
  cool: number;
  turnT: number;
  spawnT: number; // >0 while flickering in (intangible)
  power?: boolean; // flashing enemy: drops a power-up when destroyed
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  from: "player" | "enemy";
  pierce: boolean;
  dead?: boolean;
}
interface PowerUp {
  x: number;
  y: number;
  kind: PowKind;
  t: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface Boom {
  x: number;
  y: number;
  t: number;
  big: boolean;
}
interface Pop {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

const ENEMY_STATS: Record<EnemyKind, { hp: number; baseSpeed: number; pts: number }> = {
  basic: { hp: 1, baseSpeed: 0.55, pts: 100 },
  fast: { hp: 1, baseSpeed: 1.05, pts: 150 },
  armored: { hp: 3, baseSpeed: 0.5, pts: 300 },
};
const SPAWN_POINTS: { c: number; r: number }[] = [
  { c: 0, r: 0 },
  { c: 6, r: 0 },
  { c: 12, r: 0 },
];

function buildBlocks(stageIdx: number) {
  const layout = STAGE_LAYOUTS[stageIdx % STAGE_LAYOUTS.length];
  const blocks: number[][] = Array.from({ length: BROWS }, () => Array(BCOLS).fill(EMPTY));
  const codeFor = (ch: string) => (ch === "#" ? BRICK : ch === "%" ? STEEL : ch === "~" ? WATER : ch === "*" ? BUSH : EMPTY);
  const setTile = (tx: number, ty: number, code: number) => {
    blocks[ty * 2][tx * 2] = code;
    blocks[ty * 2][tx * 2 + 1] = code;
    blocks[ty * 2 + 1][tx * 2] = code;
    blocks[ty * 2 + 1][tx * 2 + 1] = code;
  };
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) setTile(tx, ty, codeFor(layout[ty][tx]));
  for (const c of [0, 6, 12]) setTile(c, 0, EMPTY); // keep enemy spawn lanes clear
  setTile(PLAYER_SPAWN_COL, ROWS - 1, EMPTY);
  // the base nest: bricks boxing in the star on 4 sides
  const nestTiles: [number, number][] = [
    [BASE_COL - 1, BASE_ROW - 1],
    [BASE_COL, BASE_ROW - 1],
    [BASE_COL + 1, BASE_ROW - 1],
    [BASE_COL - 1, BASE_ROW],
    [BASE_COL + 1, BASE_ROW],
  ];
  for (const [c, rr] of nestTiles) setTile(c, rr, BRICK);
  setTile(BASE_COL, BASE_ROW, BASE);
  return { blocks, nestTiles, baseX: BASE_COL * T, baseY: BASE_ROW * T };
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let stageIdx = 0;
  let { blocks, nestTiles, baseX, baseY } = buildBlocks(stageIdx);
  let baseAlive = true;
  let shovelT = 0;
  let freezeT = 0;
  let lives = 3;
  let tankLevel = 1;
  let shieldT = 0;
  let score = 0;
  let over = false;
  let won = false;
  let state: "ready" | "play" | "stageclear" = "ready";
  let stateT = 0;
  let frame = 0;
  let shake = 0;

  const player: Tank = { x: PLAYER_SPAWN_COL * T, y: BASE_ROW * T, dir: "up", alive: true, kind: "player", hp: 1, maxHp: 1, speed: 1, cool: 0, turnT: 0, spawnT: 30 };
  let respawnT = -1;

  let enemies: Tank[] = [];
  let bullets: Bullet[] = [];
  let powerups: PowerUp[] = [];
  const sparks: Spark[] = [];
  const booms: Boom[] = [];
  let pops: Pop[] = [];
  let toSpawn = 0;
  let spawnedCount = 0;
  let killedCount = 0;
  let spawnTimer = 60;
  let spawnIdx = 0;
  let maxOnField = 3;

  const waveSize = (st: number) => Math.min(18, 13 + st);

  const newStage = () => {
    const built = buildBlocks(stageIdx);
    blocks = built.blocks;
    nestTiles = built.nestTiles;
    baseX = built.baseX;
    baseY = built.baseY;
    baseAlive = true;
    shovelT = 0;
    freezeT = 0;
    enemies = [];
    bullets = [];
    powerups = [];
    pops = [];
    toSpawn = waveSize(stageIdx);
    spawnedCount = 0;
    killedCount = 0;
    spawnTimer = 50;
    spawnIdx = 0;
    maxOnField = Math.min(5, 3 + Math.floor(stageIdx / 2));
    player.x = PLAYER_SPAWN_COL * T;
    player.y = BASE_ROW * T;
    player.dir = "up";
    player.alive = true;
    player.spawnT = 40;
    respawnT = -1;
    state = "ready";
    stateT = 0;
  };
  newStage();

  // ── terrain helpers ──
  const terrainAt = (bx: number, by: number) => (bx < 0 || by < 0 || bx >= BCOLS || by >= BROWS ? STEEL : blocks[by][bx]);
  const solidForTank = (code: number) => code === BRICK || code === STEEL || code === WATER || code === BASE;
  const blockingForBullet = (code: number) => code === BRICK || code === STEEL || code === BASE;

  const tankBlocked = (x: number, y: number, size: number) => {
    if (x < 0 || y < 0 || x + size > ARENA || y + size > ARENA) return true;
    const bx0 = Math.floor(x / BLOCK);
    const bx1 = Math.floor((x + size - 0.01) / BLOCK);
    const by0 = Math.floor(y / BLOCK);
    const by1 = Math.floor((y + size - 0.01) / BLOCK);
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) if (solidForTank(terrainAt(bx, by))) return true;
    return false;
  };
  const allTanks = (): Tank[] => [player, ...enemies];
  const overlapsOtherTanks = (self: Tank | null, x: number, y: number, size: number) => {
    for (const t of allTanks()) {
      if (t === self || !t.alive || t.spawnT > 0) continue;
      if (overlap({ x, y, w: size, h: size }, { x: t.x, y: t.y, w: TANK, h: TANK })) return true;
    }
    return false;
  };

  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.6, 2.4);
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(12, 24), color });
    }
  };
  const boom = (x: number, y: number, big = false) => booms.push({ x, y, t: 0, big });
  const popText = (x: number, y: number, text: string, color: string) => pops.push({ x, y, t: 0, text, color });

  // ── combat ──
  const fire = (io: IO, t: Tank, from: "player" | "enemy") => {
    const [dx, dy] = DIR_VEC[t.dir];
    const speed = from === "player" ? 3.4 : t.kind === "fast" ? 2.5 : 2.0 + stageIdx * 0.04;
    const ox = t.x + TANK / 2 - 1.5 + dx * 9;
    const oy = t.y + TANK / 2 - 1.5 + dy * 9;
    bullets.push({ x: ox, y: oy, vx: dx * speed, vy: dy * speed, from, pierce: from === "player" && tankLevel >= 3 });
    io.sfx.play(from === "player" ? "shoot" : "laser");
  };
  const maxPlayerShots = () => (tankLevel >= 2 ? 2 : 1);

  const spawnPowerUp = (x: number, y: number) => {
    const kinds: PowKind[] = ["star", "star", "shield", "shovel", "freeze", "life"];
    powerups.push({ x, y, kind: r.pick(kinds), t: 0 });
  };

  const damageEnemy = (io: IO, e: Tank, dmg: number) => {
    e.hp -= dmg;
    burst(e.x + TANK / 2, e.y + TANK / 2, PAL.white, 5);
    io.sfx.play("hit");
    if (e.hp <= 0) {
      e.alive = false;
      killedCount++;
      score += ENEMY_STATS[e.kind as EnemyKind].pts;
      io.score(ENEMY_STATS[e.kind as EnemyKind].pts);
      boom(e.x + TANK / 2, e.y + TANK / 2);
      io.sfx.play("explode");
      if (e.power) spawnPowerUp(e.x + 1, e.y + 1);
    }
  };

  const killPlayer = (io: IO) => {
    if (shieldT > 0 || player.spawnT > 0 || !player.alive) return;
    player.alive = false;
    respawnT = 0;
    lives--;
    boom(player.x + TANK / 2, player.y + TANK / 2, true);
    io.sfx.play("die");
    if (lives <= 0) {
      over = true;
      io.gameOver();
    }
  };

  const destroyBase = (io: IO) => {
    if (!baseAlive) return;
    baseAlive = false;
    boom(baseX + T / 2, baseY + T / 2, true);
    io.sfx.play("explode");
    if (!over) {
      over = true;
      io.gameOver();
    }
  };

  const facingPlayer = (e: Tank) => {
    if (!player.alive) return false;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    if (Math.abs(dx) < 6) return (dy > 0 && e.dir === "down") || (dy < 0 && e.dir === "up");
    if (Math.abs(dy) < 6) return (dx > 0 && e.dir === "right") || (dx < 0 && e.dir === "left");
    return false;
  };

  const pickEnemyKind = (): EnemyKind => {
    const roll = r.next();
    const armoredChance = Math.min(0.35, 0.05 + stageIdx * 0.05);
    const fastChance = Math.min(0.4, 0.15 + stageIdx * 0.05);
    if (roll < armoredChance) return "armored";
    if (roll < armoredChance + fastChance) return "fast";
    return "basic";
  };

  const trySpawnEnemy = () => {
    if (toSpawn <= 0) return;
    if (enemies.filter((e) => e.alive).length >= maxOnField) return;
    spawnTimer--;
    if (spawnTimer > 0) return;
    const sp = SPAWN_POINTS[spawnIdx % SPAWN_POINTS.length];
    spawnIdx++;
    const x = sp.c * T;
    const y = sp.r * T;
    if (tankBlocked(x, y, TANK) || overlapsOtherTanks(null, x, y, TANK)) {
      spawnTimer = 12;
      return;
    }
    const kind = pickEnemyKind();
    const stats = ENEMY_STATS[kind];
    const flashing = spawnedCount % 4 === 3;
    enemies.push({
      x,
      y,
      dir: "down",
      alive: true,
      kind,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: Math.min(1.4, stats.baseSpeed + stageIdx * 0.03),
      cool: r.int(40, 80),
      turnT: 0,
      spawnT: 40,
      power: flashing,
    });
    spawnedCount++;
    toSpawn--;
    spawnTimer = Math.max(26, r.int(70 - stageIdx * 4, 130 - stageIdx * 6));
  };

  const moveTank = (t: Tank, dir: Dir) => {
    if (t.dir !== dir) {
      t.dir = dir;
      // half-tile snap on the axis we're not travelling along, so corners line up cleanly
      // (only if the snapped spot is actually free, so turning never clips you into a wall)
      if (dir === "up" || dir === "down") {
        const snapped = Math.round(t.x / BLOCK) * BLOCK;
        if (!tankBlocked(snapped, t.y, TANK)) t.x = snapped;
      } else {
        const snapped = Math.round(t.y / BLOCK) * BLOCK;
        if (!tankBlocked(t.x, snapped, TANK)) t.y = snapped;
      }
    }
    const [dx, dy] = DIR_VEC[dir];
    const nx = t.x + dx * t.speed;
    const ny = t.y + dy * t.speed;
    if (!tankBlocked(nx, ny, TANK) && !overlapsOtherTanks(t, nx, ny, TANK)) {
      t.x = nx;
      t.y = ny;
      return true;
    }
    return false;
  };

  const updateEnemy = (io: IO, e: Tank) => {
    if (e.spawnT > 0) {
      e.spawnT--;
      return;
    }
    if (freezeT > 0) return;
    e.cool = Math.max(0, e.cool - 1);
    e.turnT--;
    if (e.turnT > 0) {
      if (!moveTank(e, e.dir)) e.turnT = 0;
    }
    if (e.turnT <= 0) {
      const dirs: Dir[] = ["up", "down", "left", "right"];
      let choice: Dir;
      if (r.chance(0.4) && player.alive) {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        choice = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      } else choice = r.pick(dirs);
      e.turnT = r.int(40, 100);
      moveTank(e, choice);
    }
    if (e.cool <= 0) {
      if (facingPlayer(e) && r.chance(0.6)) {
        fire(io, e, "enemy");
        e.cool = r.int(55, 95);
      } else if (r.chance(0.025)) {
        fire(io, e, "enemy");
        e.cool = r.int(60, 110);
      }
    }
  };

  const applyPower = (io: IO, kind: PowKind) => {
    io.sfx.play("powerup");
    io.score(50);
    score += 50;
    if (kind === "star") {
      tankLevel = Math.min(3, tankLevel + 1);
      popText(player.x - 4, player.y - 10, "POWER UP!", PAL.yellow);
    } else if (kind === "shield") {
      shieldT = 600;
      popText(player.x - 4, player.y - 10, "SHIELD", PAL.cyan);
    } else if (kind === "shovel") {
      shovelT = 900;
      popText(player.x - 4, player.y - 10, "FORTIFY!", PAL.orange);
    } else if (kind === "life") {
      lives = Math.min(9, lives + 1);
      popText(player.x - 4, player.y - 10, "1UP!", PAL.pink);
    } else {
      freezeT = 360;
      popText(player.x - 4, player.y - 10, "FREEZE!", PAL.sky);
    }
  };

  return {
    update(io) {
      frame++;
      if (shake > 0) shake--;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.94;
        s.vy *= 0.94;
        if (--s.life <= 0) sparks.splice(i, 1);
      }
      for (let i = booms.length - 1; i >= 0; i--) if (++booms[i].t > (booms[i].big ? 40 : 24)) booms.splice(i, 1);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 46);
      if (shieldT > 0) shieldT--;
      if (shovelT > 0) {
        shovelT--;
        for (const [c, rr] of nestTiles) {
          const bx = c * 2;
          const by = rr * 2;
          if (blocks[by][bx] !== EMPTY) {
            blocks[by][bx] = STEEL;
            blocks[by][bx + 1] = STEEL;
            blocks[by + 1][bx] = STEEL;
            blocks[by + 1][bx + 1] = STEEL;
          }
        }
        if (shovelT === 0) {
          for (const [c, rr] of nestTiles) {
            const bx = c * 2;
            const by = rr * 2;
            blocks[by][bx] = BRICK;
            blocks[by][bx + 1] = BRICK;
            blocks[by + 1][bx] = BRICK;
            blocks[by + 1][bx + 1] = BRICK;
          }
        }
      }
      if (freezeT > 0) freezeT--;

      if (over || won) return;

      if (state === "ready") {
        stateT++;
        if (stateT > 90) state = "play";
        return;
      }
      if (state === "stageclear") {
        stateT++;
        if (stateT === 1) io.sfx.play("win");
        if (stateT > 120) {
          stageIdx++;
          if (stageIdx >= TOTAL_STAGES) {
            won = true;
            io.score(1000 + lives * 500);
            io.sfx.play("win");
            io.win();
            return;
          }
          newStage();
        }
        return;
      }

      // ── player ──
      if (!player.alive) {
        respawnT++;
        if (respawnT > 70) {
          player.x = PLAYER_SPAWN_COL * T;
          player.y = BASE_ROW * T;
          player.dir = "up";
          player.alive = true;
          player.spawnT = 40;
          tankLevel = 1;
          respawnT = -1;
        }
      } else if (player.spawnT > 0) {
        player.spawnT--;
      } else {
        player.speed = tankLevel >= 2 ? 1.3 : 1;
        const inp = io.input;
        const held = inp.held;
        let dir: Dir | null = null;
        if (held.up) dir = "up";
        else if (held.down) dir = "down";
        else if (held.left) dir = "left";
        else if (held.right) dir = "right";
        if (dir) moveTank(player, dir);
        player.cool = Math.max(0, player.cool - 1);
        const myShots = bullets.filter((b) => b.from === "player" && !b.dead).length;
        if ((inp.pressed.a || inp.held.a) && player.cool === 0 && myShots < maxPlayerShots()) {
          fire(io, player, "player");
          player.cool = tankLevel >= 2 ? 12 : 20;
        }
      }

      // ── enemy spawns + AI ──
      trySpawnEnemy();
      for (const e of enemies) if (e.alive) updateEnemy(io, e);
      enemies = enemies.filter((e) => e.alive);

      // ── bullets ──
      for (const b of bullets) {
        if (b.dead) continue;
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < 0 || b.y < 0 || b.x >= ARENA || b.y >= ARENA) {
          b.dead = true;
          continue;
        }
        const bx = Math.floor(b.x / BLOCK);
        const by = Math.floor(b.y / BLOCK);
        const code = blocks[by]?.[bx] ?? STEEL;
        if (blockingForBullet(code)) {
          if (code === BASE) {
            if (b.from === "enemy") destroyBase(io);
            boom(b.x, b.y);
          } else if (code === BRICK) {
            blocks[by][bx] = EMPTY;
            burst(b.x, b.y, PAL.brown, 6);
            io.sfx.play("hit");
          } else if (code === STEEL) {
            if (b.pierce) {
              blocks[by][bx] = EMPTY;
              io.score(5);
              score += 5;
            }
            burst(b.x, b.y, PAL.grey, 5);
            io.sfx.play("hit");
          }
          b.dead = true;
          continue;
        }
        if (b.from === "player") {
          for (const e of enemies) {
            if (e.alive && e.spawnT <= 0 && overlap({ x: b.x - 1, y: b.y - 1, w: 3, h: 3 }, { x: e.x, y: e.y, w: TANK, h: TANK })) {
              damageEnemy(io, e, tankLevel >= 3 ? 2 : 1);
              b.dead = true;
              break;
            }
          }
        } else if (player.alive && player.spawnT <= 0 && overlap({ x: b.x - 1, y: b.y - 1, w: 3, h: 3 }, { x: player.x, y: player.y, w: TANK, h: TANK })) {
          if (shieldT > 0) {
            burst(b.x, b.y, PAL.cyan, 5);
            io.sfx.play("hit");
          } else killPlayer(io);
          b.dead = true;
        }
      }
      // bullets cancel each other out, nose to nose
      for (let i = 0; i < bullets.length; i++) {
        if (bullets[i].dead) continue;
        for (let j = i + 1; j < bullets.length; j++) {
          if (bullets[j].dead || bullets[i].from === bullets[j].from) continue;
          if (Math.abs(bullets[i].x - bullets[j].x) < 4 && Math.abs(bullets[i].y - bullets[j].y) < 4) {
            bullets[i].dead = true;
            bullets[j].dead = true;
            burst(bullets[i].x, bullets[i].y, PAL.white, 4);
          }
        }
      }
      bullets = bullets.filter((b) => !b.dead);

      // ── power-ups on the ground ──
      for (const p of powerups) {
        p.t++;
        if (player.alive && player.spawnT <= 0 && overlap({ x: p.x, y: p.y, w: 10, h: 10 }, { x: player.x, y: player.y, w: TANK, h: TANK })) {
          applyPower(io, p.kind);
          p.t = 99999;
        }
      }
      powerups = powerups.filter((p) => p.t < 600);

      if (!baseAlive) return;

      // ── stage clear? ──
      if (toSpawn <= 0 && enemies.length === 0 && state === "play") {
        state = "stageclear";
        stateT = 0;
        io.score(500 * (stageIdx + 1));
        score += 500 * (stageIdx + 1);
      }
    },

    draw(g: Gfx) {
      g.clear("#1b1e14");
      const sx = shake > 0 ? ((frame % 2) * 2 - 1) * 2 : 0;
      g.rect(OX - 2 + sx, OY - 2, ARENA + 4, ARENA + 4, "#0d0b1a");
      g.camera(-OX - sx, -OY);
      g.rect(0, 0, ARENA, ARENA, "#3a4a28");

      const bushes: { x: number; y: number }[] = [];
      for (let by = 0; by < BROWS; by++) {
        for (let bx = 0; bx < BCOLS; bx++) {
          const code = blocks[by][bx];
          const px = bx * BLOCK;
          const py = by * BLOCK;
          if (code === BRICK) {
            g.rect(px, py, BLOCK, BLOCK, "#9a5a32");
            g.rect(px, py, BLOCK, 3, "#c07a4a");
            g.rect(px, py + 5, BLOCK, 2, "#6a3a1e");
          } else if (code === STEEL) {
            g.rect(px, py, BLOCK, BLOCK, "#8a90b0");
            g.rect(px, py, 3, 3, "#c0c6e0");
            g.rect(px + 4, py + 4, 3, 3, "#4a4e6a");
          } else if (code === WATER) {
            const k = (frame + bx * 3 + by * 5) % 40;
            g.rect(px, py, BLOCK, BLOCK, k < 20 ? "#2a6ad0" : "#3c7ce0");
          } else if (code === BUSH) {
            bushes.push({ x: px, y: py });
          }
        }
      }

      // base emblem
      if (baseAlive) {
        const cx = baseX + T / 2;
        const cy = baseY + T / 2;
        g.rect(baseX + 1, baseY + 1, T - 2, T - 2, "#2a1a10");
        g.circle(cx, cy, 6, PAL.yellow);
        g.circle(cx, cy, 3, PAL.orange);
        g.rect(cx - 1, cy - 8, 2, 4, PAL.yellow);
        g.rect(cx - 1, cy + 4, 2, 4, PAL.yellow);
        g.rect(cx - 8, cy - 1, 4, 2, PAL.yellow);
        g.rect(cx + 4, cy - 1, 4, 2, PAL.yellow);
      } else {
        g.rect(baseX, baseY, T, T, "#2a2a2a");
        g.line(baseX + 2, baseY + 2, baseX + T - 2, baseY + T - 2, PAL.red);
        g.line(baseX + T - 2, baseY + 2, baseX + 2, baseY + T - 2, PAL.red);
      }

      // power-ups
      for (const p of powerups) {
        const blink = p.t > 450 ? Math.floor(p.t / 6) % 2 : 0;
        if (blink) continue;
        const col = p.kind === "star" ? PAL.yellow : p.kind === "shield" ? PAL.cyan : p.kind === "shovel" ? PAL.orange : p.kind === "life" ? PAL.pink : PAL.sky;
        g.rect(p.x, p.y, 10, 10, PAL.black);
        g.rect(p.x + 1, p.y + 1, 8, 8, col);
        const label = p.kind === "star" ? "S" : p.kind === "shield" ? "O" : p.kind === "shovel" ? "V" : p.kind === "life" ? "+" : "F";
        g.text(label, p.x + 3 + OX, p.y + 1 + OY, PAL.black);
      }

      // bullets
      for (const b of bullets) g.rect(b.x - 1.5, b.y - 1.5, 3, 3, b.from === "player" ? PAL.yellow : Math.floor(frame / 3) % 2 ? PAL.red : PAL.white);

      // tanks
      const drawTank = (t: Tank, spr: { up: ReturnType<typeof sprite>; side: ReturnType<typeof sprite> }) => {
        if (!t.alive) return;
        if (t.spawnT > 0) {
          if (Math.floor(t.spawnT / 4) % 2) g.box(t.x, t.y, TANK, TANK, PAL.white);
          return;
        }
        const opts = t.dir === "up" ? {} : t.dir === "down" ? { flipY: true } : t.dir === "left" ? {} : { flipX: true };
        g.sprite(t.dir === "up" || t.dir === "down" ? spr.up : spr.side, t.x, t.y, opts);
      };
      for (const e of enemies) {
        const spr = e.kind === "basic" ? BASIC_SPR : e.kind === "fast" ? FAST_SPR : ARMORED_SPR[Math.min(2, Math.max(0, e.maxHp - e.hp))];
        if (e.power && Math.floor(frame / 6) % 2) g.box(e.x - 1, e.y - 1, TANK + 2, TANK + 2, PAL.yellow);
        drawTank(e, spr);
      }
      if (player.alive) {
        drawTank(player, PLAYER_SPR);
        if (shieldT > 0) g.circle(player.x + TANK / 2, player.y + TANK / 2, 10, "rgba(94,242,255,0.5)");
      }

      // bushes drawn over tanks, so the kid's tank peeks through its hiding spot
      for (const b of bushes) {
        g.alpha(0.88);
        g.rect(b.x, b.y, BLOCK, BLOCK, "#2e7a3e");
        g.rect(b.x + 1, b.y + 1, 2, 2, "#1f5a2c");
        g.rect(b.x + 5, b.y + 4, 2, 2, "#1f5a2c");
        g.alpha(1);
      }

      for (const s of sparks) g.rect(s.x, s.y, 2, 2, s.color);
      for (const b of booms) {
        const rr = (b.big ? 15 : 8) * Math.min(1, b.t / 8);
        g.circle(b.x, b.y, rr, b.t % 6 < 3 ? PAL.orange : PAL.yellow);
        if (b.t > 6) g.circle(b.x, b.y, rr * 0.5, PAL.white);
      }
      for (const p of pops) g.text(p.text, p.x + OX, p.y + OY - p.t * 0.6, p.color);

      if (freezeT > 0) {
        g.alpha(0.18);
        g.rect(0, 0, ARENA, ARENA, PAL.cyan);
        g.alpha(1);
      }
      g.camera(0, 0);

      // HUD strip
      const hx = OX + ARENA + 6;
      g.rect(hx - 2, 0, W - hx + 2, H, "#0d0b1a");
      g.text(`STAGE`, hx, 4, PAL.white, { size: 1 });
      g.text(`${stageIdx + 1}`, hx, 14, PAL.yellow, { size: 2 });
      g.text("FOES", hx, 34, PAL.white);
      const left = toSpawn + enemies.length;
      for (let i = 0; i < Math.min(left, 20); i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        g.rect(hx + col * 9, 44 + row * 9, 6, 6, PAL.grey);
      }
      g.text("LIVES", hx, 150, PAL.white);
      for (let i = 0; i < lives; i++) g.text("♥", hx + i * 8, 160, PAL.red);
      g.text(`PWR ${tankLevel}`, hx, 176, PAL.cyan);
      g.text(`${score}`, hx, 196, PAL.yellow);
      if (state === "ready") {
        g.rect(OX + 30, OY + 80, ARENA - 60, 44, "rgba(13,11,26,0.82)");
        g.text(`STAGE ${stageIdx + 1}`, OX + ARENA / 2, OY + 88, PAL.yellow, { align: "center", size: 2 });
        g.text("READY!", OX + ARENA / 2, OY + 108, PAL.white, { align: "center" });
      } else if (state === "stageclear") {
        g.rect(OX + 20, OY + 86, ARENA - 40, 32, "rgba(13,11,26,0.82)");
        g.text(stageIdx >= TOTAL_STAGES - 1 ? "LAST STAGE CLEAR!" : "STAGE CLEAR!", OX + ARENA / 2, OY + 98, PAL.lime, { align: "center" });
      }
    },
  };
}

export const tankBattle: RetroGameDef = {
  id: "tank-battle",
  title: "Tank Battle",
  blurb: "Blast through a brick battlefield and protect your base from enemy tanks!",
  genre: "Action",
  emoji: "🛡️",
  color: "#6a9a4a",
  controls: "✚ drive · A fire · protect your base!",
  pad: { dpad: "4", a: "Fire" },
  create,
};
