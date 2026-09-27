// ALIEN WAVE — a fixed-screen shooter. Rows of wiggly pixel aliens march side to side and
// step down toward the planet. Slide your cannon left and right, fire one zap at a time,
// hide behind crumbly pixel shields and pop the bonus saucer when it zooms across the top.
// The fewer aliens are left, the faster they march! (Original game in the spirit of
// classic fixed shooters.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const COLS = 9;
const ROWS = 5;
const GAP_X = 20;
const GAP_Y = 15;
const AW = 12;
const AH = 8;
const PLAYER_Y = 200;
const SHIELD_Y = 164;
const SHIELD_W = 24;
const SHIELD_H = 14;
const SHIELD_XS = [24, 88, 152, 216].map((x) => x - SHIELD_W / 2);

const k = PAL.black;
function pair(rowsA: string[], rowsB: string[], body: string) {
  const pal = { g: body, w: PAL.white, k };
  return [sprite(rowsA, pal), sprite(rowsB, pal)];
}
// three original alien designs: antenna blob, crab-bot, jelly
const BLOB = pair(
  ["....g..g....", ".....gg.....", "...gggggg...", "..ggwggwgg..", "..ggkggkgg..", "...gggggg...", "..g.g..g.g..", ".g..g..g..g."],
  ["....g..g....", ".....gg.....", "...gggggg...", "..ggwggwgg..", "..ggkggkgg..", "...gggggg...", "...g.gg.g...", "..g..gg..g.."],
  PAL.pink,
);
const CRAB = pair(
  ["..g......g..", "...g....g...", "..gggggggg..", ".gggwggwggg.", "gg.gkggkg.gg", "gggggggggggg", "g.g......g.g", "...gg..gg..."],
  ["..g......g..", "g..g....g..g", "g.gggggggg.g", "ggggwggwgggg", "gggkggggkggg", ".gggggggggg.", "..g......g..", ".g........g."],
  PAL.cyan,
);
const JELLY = pair(
  ["...gggggg...", "..gggggggg..", ".ggwwggwwgg.", ".ggkwggkwgg.", ".gggggggggg.", ".gg.gggg.gg.", ".g..g..g..g.", "g..g....g..g"],
  ["...gggggg...", "..gggggggg..", ".ggwwggwwgg.", ".ggwkggwkgg.", ".gggggggggg.", ".gg.gggg.gg.", "..g.g..g.g..", "..g..gg..g.."],
  PAL.lime,
);
const ROW_ART = [BLOB, CRAB, CRAB, JELLY, JELLY];
const ROW_PTS = [30, 20, 20, 10, 10];
const CANNON = sprite(["......w......", ".....www.....", ".....wcw.....", "..bbbbbbbbb..", ".bbbbbbbbbbb.", "bbbyybbbyybbb", "bbbbbbbbbbbbb", ".kk.......kk."], { w: PAL.white, c: PAL.cyan, b: PAL.blue, y: PAL.yellow, k });
const SAUCER = sprite(["....kkkkkk....", "...kccwwcck...", ".kkkkkkkkkkkk.", "kppyppyppyppyk", ".kkkkkkkkkkkk.", "...k..k..k...."], { k, c: PAL.cyan, w: PAL.white, p: PAL.red, y: PAL.yellow });

interface Alien {
  x: number;
  y: number;
  row: number;
  alive: boolean;
}
interface Shot {
  x: number;
  y: number;
  vy: number;
  zig: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface Popup {
  x: number;
  y: number;
  text: string;
  t: number;
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  const aliens: Alien[] = [];
  const shields = SHIELD_XS.map(() => new Uint8Array(SHIELD_W * SHIELD_H));
  const player = { x: W / 2 - 6, lives: 3, dead: -1, inv: 60 };
  let shot: { x: number; y: number } | null = null;
  const bombs: Shot[] = [];
  const parts: Part[] = [];
  const popups: Popup[] = [];
  const stars = Array.from({ length: 50 }, () => ({ x: r.range(0, W), y: r.range(0, 150), tw: r.range(0, 6) }));
  let wave = 0;
  let dir = 1;
  let stepT = 30;
  let animFrame = 0;
  let dropNext = false;
  let ufo: { x: number; vx: number; pts: number } | null = null;
  let ufoT = 900;
  let frame = 0;
  let pause = 0; // short freeze between waves / after a hit
  let over = false;
  let shake = 0;
  let stepNote = 0;

  const resetShields = () => {
    for (const s of shields) {
      for (let y = 0; y < SHIELD_H; y++)
        for (let x = 0; x < SHIELD_W; x++) {
          // a rounded bunker with an arch cut out underneath
          const corner = (y < 3 && (x < 3 - y || x > SHIELD_W - 4 + y)) || (y > 7 && x > 7 && x < SHIELD_W - 8);
          s[y * SHIELD_W + x] = corner ? 0 : 1;
        }
    }
  };

  const startWave = () => {
    wave++;
    aliens.length = 0;
    const top = 30 + Math.min(40, (wave - 1) * 8);
    for (let row = 0; row < ROWS; row++)
      for (let c = 0; c < COLS; c++) aliens.push({ x: 30 + c * GAP_X, y: top + row * GAP_Y, row, alive: true });
    dir = 1;
    dropNext = false;
    shot = null;
    bombs.length = 0;
    resetShields();
    pause = 90;
  };

  const burst = (x: number, y: number, n: number, color: string) => {
    for (let i = 0; i < n && parts.length < 120; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.3, 1.8);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(12, 26), color });
    }
  };

  /** does a point hit a shield pixel? if so blow a small hole and return true */
  const hitShield = (px: number, py: number, down: boolean) => {
    for (let i = 0; i < shields.length; i++) {
      const lx = Math.floor(px - SHIELD_XS[i]);
      const ly = Math.floor(py - SHIELD_Y);
      if (lx < 0 || lx >= SHIELD_W || ly < 0 || ly >= SHIELD_H) continue;
      const s = shields[i];
      if (!s[ly * SHIELD_W + lx]) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = lx + dx;
          const y = ly + dy + (down ? 1 : -1);
          if (x < 0 || x >= SHIELD_W || y < 0 || y >= SHIELD_H) continue;
          if (Math.abs(dx) + Math.abs(dy) <= 2 || r.chance(0.35)) s[y * SHIELD_W + x] = 0;
        }
      burst(px, py, 4, PAL.green);
      return true;
    }
    return false;
  };

  const alive = () => {
    let n = 0;
    for (const a of aliens) if (a.alive) n++;
    return n;
  };

  const hurtPlayer = (io: IO) => {
    if (player.dead >= 0 || player.inv > 0) return;
    player.dead = 0;
    shake = 16;
    burst(player.x + 6, PLAYER_Y + 4, 26, PAL.orange);
    burst(player.x + 6, PLAYER_Y + 4, 12, PAL.cyan);
    io.sfx.play("die");
  };

  startWave();

  return {
    update(io) {
      if (over) return;
      frame++;
      shake = Math.max(0, shake - 1);
      const inp = io.input;

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
      }
      for (const p of popups) {
        p.t++;
        p.y -= 0.3;
      }

      if (pause > 0) {
        pause--;
        return;
      }

      // ── player ──
      if (player.dead >= 0) {
        player.dead++;
        if (player.dead > 90) {
          player.lives--;
          if (player.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          player.dead = -1;
          player.inv = 90;
          player.x = W / 2 - 6;
          bombs.length = 0;
        }
      } else {
        player.inv = Math.max(0, player.inv - 1);
        if (inp.held.left) player.x -= 1.5;
        if (inp.held.right) player.x += 1.5;
        player.x = clamp(player.x, 4, W - 17);
        if (inp.pressed.a && !shot) {
          shot = { x: player.x + 6, y: PLAYER_Y - 4 };
          io.sfx.play("laser");
        }
      }

      // ── player zap (one at a time) ──
      if (shot) {
        shot.y -= 5;
        let gone = shot.y < 12 || hitShield(shot.x, shot.y, false);
        if (!gone)
          for (const a of aliens) {
            if (a.alive && overlap({ x: shot.x - 1, y: shot.y, w: 2, h: 6 }, { x: a.x, y: a.y, w: AW, h: AH })) {
              a.alive = false;
              gone = true;
              burst(a.x + 6, a.y + 4, 12, ROW_ART[a.row][0].pal.g);
              io.score(ROW_PTS[a.row] * (1 + Math.floor((wave - 1) / 2)));
              io.sfx.play("explode");
              break;
            }
          }
        if (!gone && ufo && overlap({ x: shot.x - 1, y: shot.y, w: 2, h: 6 }, { x: ufo.x, y: 16, w: 14, h: 6 })) {
          gone = true;
          io.score(ufo.pts);
          popups.push({ x: ufo.x + 7, y: 16, text: String(ufo.pts), t: 0 });
          burst(ufo.x + 7, 19, 20, PAL.red);
          io.sfx.play("coin");
          ufo = null;
        }
        if (gone) shot = null;
      }

      // ── the march ──
      const n = alive();
      if (n === 0) {
        io.score(500 * wave);
        io.sfx.play("win");
        startWave();
        return;
      }
      stepT--;
      if (stepT <= 0) {
        stepT = Math.max(2, Math.round(3 + n * 0.55 - Math.min(6, wave)));
        animFrame ^= 1;
        stepNote = (stepNote + 1) % 4;
        io.sfx.tone([98, 87, 78, 73][stepNote], 0.06, "square", 0.15);
        if (dropNext) {
          for (const a of aliens) a.y += 6;
          dropNext = false;
          dir = -dir;
        } else {
          const dx = dir * 3;
          for (const a of aliens) a.x += dx;
          let lo = W;
          let hi = 0;
          for (const a of aliens)
            if (a.alive) {
              lo = Math.min(lo, a.x);
              hi = Math.max(hi, a.x + AW);
            }
          if ((dir > 0 && hi >= W - 6) || (dir < 0 && lo <= 6)) dropNext = true;
        }
        // aliens chew through shields they touch; reaching the ground costs a life
        let lowest = 0;
        for (const a of aliens) {
          if (!a.alive) continue;
          lowest = Math.max(lowest, a.y + AH);
          if (a.y + AH >= SHIELD_Y)
            for (let i = 0; i < shields.length; i++) {
              const s = shields[i];
              for (let y = 0; y < SHIELD_H; y++)
                for (let x = 0; x < SHIELD_W; x++) {
                  const px = SHIELD_XS[i] + x;
                  const py = SHIELD_Y + y;
                  if (px >= a.x && px < a.x + AW && py >= a.y && py < a.y + AH) s[y * SHIELD_W + x] = 0;
                }
            }
        }
        if (lowest >= PLAYER_Y - 2 && player.dead < 0) {
          player.inv = 0;
          hurtPlayer(io);
          // push the invaders back up so the kid gets another go
          for (const a of aliens) a.y -= 60;
        }
      }

      // ── alien bombs: only the bottom alien in a column drops them ──
      const maxBombs = Math.min(6, 2 + Math.floor(wave / 2));
      if (player.dead < 0 && bombs.length < maxBombs && r.chance(0.02 + wave * 0.004)) {
        const c = r.int(0, COLS - 1);
        let shooter: Alien | null = null;
        for (let row = ROWS - 1; row >= 0; row--) {
          const a = aliens[row * COLS + c];
          if (a.alive) {
            shooter = a;
            break;
          }
        }
        if (shooter) bombs.push({ x: shooter.x + 6, y: shooter.y + AH, vy: Math.min(2.4, 1.2 + wave * 0.1), zig: r.int(0, 3) });
      }
      for (const b of bombs) {
        b.y += b.vy;
        if (hitShield(b.x, b.y + 4, true)) b.y = H + 50;
        else if (player.dead < 0 && overlap({ x: b.x - 1, y: b.y, w: 3, h: 5 }, { x: player.x + 1, y: PLAYER_Y + 2, w: 11, h: 6 })) {
          b.y = H + 50;
          hurtPlayer(io);
        } else if (shot && Math.abs(shot.x - b.x) < 3 && Math.abs(shot.y - b.y) < 5) {
          // zaps can cancel bombs
          burst(b.x, b.y, 5, PAL.white);
          b.y = H + 50;
          shot = null;
          io.score(5);
        }
      }
      for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i].y > H) bombs.splice(i, 1);

      // ── bonus saucer ──
      ufoT--;
      if (ufoT <= 0 && !ufo) {
        ufoT = r.int(900, 1500);
        const fromLeft = r.chance(0.5);
        ufo = { x: fromLeft ? -16 : W + 2, vx: fromLeft ? 0.9 : -0.9, pts: r.pick([100, 150, 200, 300]) };
      }
      if (ufo) {
        ufo.x += ufo.vx;
        if (frame % 16 === 0) io.sfx.tone(ufo.vx > 0 ? 660 : 620, 0.05, "sine", 0.1);
        if (ufo.x < -20 || ufo.x > W + 6) ufo = null;
      }

      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t > 50) popups.splice(i, 1);
    },

    draw(g: Gfx) {
      g.clear(PAL.black);
      for (const s of stars) if ((frame + s.tw * 20) % 120 < 100) g.rect(s.x, s.y, 1, 1, s.tw > 4 ? PAL.white : PAL.dark);
      // distant planet + ground
      g.circle(220, 60, 16, PAL.navy);
      g.circle(215, 55, 12, PAL.purple);
      g.rect(0, PLAYER_Y + 10, W, H - PLAYER_Y - 10, PAL.navy);
      g.rect(0, PLAYER_Y + 10, W, 2, PAL.teal);
      if (shake) g.camera(r.range(-2, 2), r.range(-1, 1));

      for (const a of aliens) if (a.alive) g.sprite(ROW_ART[a.row][animFrame], a.x, a.y);
      if (ufo) g.sprite(SAUCER, ufo.x, 16);
      // shields drawn as horizontal runs
      for (let i = 0; i < shields.length; i++) {
        const s = shields[i];
        for (let y = 0; y < SHIELD_H; y++) {
          let x = 0;
          while (x < SHIELD_W) {
            if (!s[y * SHIELD_W + x]) {
              x++;
              continue;
            }
            const x0 = x;
            while (x < SHIELD_W && s[y * SHIELD_W + x]) x++;
            g.rect(SHIELD_XS[i] + x0, SHIELD_Y + y, x - x0, 1, y < 2 ? PAL.lime : PAL.green);
          }
        }
      }
      if (shot) g.rect(shot.x - 1, shot.y, 2, 6, PAL.white);
      for (const b of bombs) {
        const z = (Math.floor(b.y / 3) + b.zig) % 2 ? 1 : -1;
        g.rect(b.x - 1 + z, b.y, 2, 2, PAL.yellow);
        g.rect(b.x - 1 - z, b.y + 2, 2, 2, PAL.orange);
      }
      if (player.dead < 0 && !(player.inv > 0 && Math.floor(player.inv / 4) % 2)) g.sprite(CANNON, player.x, PLAYER_Y);
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      for (const p of popups) g.text(p.text, p.x, p.y, PAL.yellow, { align: "center" });
      g.camera(0, 0);

      // HUD
      for (let i = 0; i < player.lives; i++) g.text("♥", 4 + i * 8, 2, PAL.red);
      g.text(`WAVE ${wave}`, W - 4, 2, PAL.lime, { align: "right" });
      if (pause > 0) {
        g.text(`WAVE ${wave}`, W / 2, 110, PAL.yellow, { align: "center", size: 2 });
        g.text("GET READY!", W / 2, 130, PAL.white, { align: "center" });
      }
    },
  };
}

export const alienWave: RetroGameDef = {
  id: "alien-wave",
  title: "Alien Wave",
  blurb: "Stop the marching alien rows before they land!",
  genre: "Shooter",
  emoji: "👾",
  color: "#b6f24a",
  controls: "◀ ▶ move · A fire (one zap at a time)",
  pad: { dpad: "lr", a: "Fire" },
  create,
};
