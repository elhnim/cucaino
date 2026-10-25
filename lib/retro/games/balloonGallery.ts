// BALLOON GALLERY — a fairground pop-the-target booth. Tap balloons, flying clay discs and
// tin cans on the shelf to pop them (or aim the crosshair with the D-pad and press A).
// Each wave gives you a bag of darts; pop the STAR balloon for more. Quick pops build a
// combo, golden balloons are worth lots, and never pop the grey BOMB balloons! Let too
// many targets get away in one wave and the booth closes. (Original game in the spirit of
// 8-bit shooting galleries — only balloons and targets get popped here.)
import { H, PAL, W, clamp, dist, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, drawStrip, fbm, hash2, outlined, ramp, shade, tinted } from "../art";

const SHELF_Y = 160; // tin cans slide along this shelf
const COUNTER_Y = 196;
const MAX_MISS = 5;
const COMBO_FR = 80;
const CANOPY_H = 22; // striped valance at the very top
const POST_W = 9; // red/white barber-pole posts framing the booth

type Kind = "balloon" | "gold" | "star" | "bomb" | "disc" | "can";
interface Tgt {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  color: string;
  popped: number; // frames since popped (0 = still up)
  entered: boolean;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}
interface Pop {
  x: number;
  y: number;
  t: number;
  s: string;
  c: string;
}

const BALLOON_COLS = [PAL.red, PAL.blue, PAL.green, PAL.pink, PAL.purple, PAL.orange, PAL.cyan];
const POINTS: Record<Kind, number> = { balloon: 50, gold: 300, star: 100, bomb: 0, disc: 80, can: 60 };
// drawn radius per kind — big and readable like the cabinet painting (hitboxes follow these)
const SIZE: Record<Kind, number> = { balloon: 12, gold: 10, star: 11, bomb: 11, disc: 9, can: 10 };

// ── baked art (built once, lazily, the first time a round needs it — keeps module load tiny) ──
const BALLOON_W = SIZE.balloon * 2;
const BALLOON_H = SIZE.balloon * 2 + 6;
const GOLD_W = SIZE.gold * 2;
const GOLD_H = SIZE.gold * 2 + 5;
const STAR_W = SIZE.star * 2;
const STAR_H = SIZE.star * 2 + 5;
const CAN_W = Math.round(SIZE.can * 1.6);
const CAN_H = Math.round(SIZE.can * 2.2);
const DISC_W = SIZE.disc * 2;
const DISC_H = SIZE.disc;

/** a simple 5-point star silhouette test, dx/dy relative to the star's centre */
function inStar(dx: number, dy: number, outerR: number, innerR: number): boolean {
  const ang = Math.atan2(dy, dx) + Math.PI / 2;
  const step = Math.PI / 5;
  let a = ((ang % (step * 2)) + step * 2) % (step * 2);
  if (a > step) a = step * 2 - a;
  const rad = outerR + (innerR - outerR) * (a / step);
  return Math.hypot(dx, dy) <= rad;
}

/** a round balloon, shaded dark->light with a highlight and a knot at the bottom */
function makeBalloon(base: string, w: number, h: number): Sprite {
  const [dk, c1, c2, hl] = ramp(base, 4, 0.55);
  const cx = w / 2;
  const cy = h * 0.42;
  const rx = w * 0.47;
  const ry = h * 0.46;
  const core = bake(w, h, (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    if (py > h * 0.84) {
      const kx = Math.abs(px - cx);
      const ky = py - h * 0.84;
      return kx < (h * 0.13 - ky) * 0.55 ? dk : null;
    }
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return null;
    const hdx = (px - (cx - rx * 0.32)) / rx;
    const hdy = (py - (cy - ry * 0.38)) / ry;
    const hd = hdx * hdx + hdy * hdy;
    if (hd < 0.14) return hl;
    if (hd < 0.36) return c2;
    if (d2 > 0.72) return dk;
    return c1;
  });
  return outlined(core);
}

/** the white-and-rainbow "more darts" balloon */
function makeStarBalloon(w: number, h: number): Sprite {
  const base = makeBalloon("#f2edfb", w, h);
  const cx = w / 2 + 1;
  const cy = h * 0.4 + 1;
  const rows = base.rows.map((row, y) =>
    row
      .split("")
      .map((ch, x) => {
        if (ch === "." || ch === "§") return ch;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (inStar(dx, dy, w * 0.26, w * 0.1)) return "Y";
        if (Math.hypot(dx - w * 0.17, dy + h * 0.11) < 1.6) return "Z";
        return ch;
      })
      .join("")
  );
  return { rows, pal: { ...base.pal, Y: PAL.red, Z: PAL.cyan } };
}

/** a shiny tin can with a coloured, starred label band */
function makeCan(label: string, w: number, h: number): Sprite {
  const [dk, c1, , hl] = ramp(PAL.grey, 4, 0.6);
  const core = bake(w, h, (x, y) => {
    const px = x + 0.5;
    if (y < 2) return y === 0 ? dk : hl;
    if (y > h - 3) return y === h - 1 ? dk : shade(dk, -0.1);
    if (y > h * 0.36 && y < h * 0.74) {
      if (Math.floor(y) === Math.floor(h * 0.36) || Math.ceil(y) === Math.ceil(h * 0.74)) return shade(label, -0.3);
      const dx = px - w / 2;
      const dy = y + 0.5 - h * 0.55;
      if (inStar(dx, dy, w * 0.22, w * 0.09)) return PAL.white;
      return label;
    }
    if (px < w * 0.3) return hl;
    if (px > w * 0.82) return dk;
    return c1;
  });
  return outlined(core);
}

/** a flat clay disc, flung from the wings */
function makeDisc(w: number, h: number, flip: boolean): Sprite {
  const [dk, c1, c2, hl] = ramp(PAL.orange, 4, 0.5);
  const core = bake(w, h, (x, y) => {
    const dx = (x + 0.5 - w / 2) / (w / 2);
    const dy = (y + 0.5 - h / 2) / (h / 2);
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return null;
    const hx = flip ? 0.3 : -0.3;
    if ((dx - hx) * (dx - hx) + dy * dy < 0.12) return hl;
    if (d2 > 0.78) return dk;
    if (d2 > 0.5) return c2;
    return c1;
  });
  return outlined(core);
}

/** the scalloped red/white valance across the very top (posts show through at the edges) */
function bakeCanopy(): Sprite {
  const seg = 16;
  return bake(W, CANOPY_H, (x, y) => {
    if (x < POST_W || x >= W - POST_W) return null;
    const s = Math.floor(x / seg);
    const lx = x - s * seg;
    const col = s % 2 === 0 ? "#e2394c" : "#fdf3f6";
    const bulge = Math.sqrt(Math.max(0, (seg / 2) * (seg / 2) - (lx - seg / 2) * (lx - seg / 2)));
    const edge = CANOPY_H - 7 + bulge * 0.55;
    if (y > edge) return y < edge + 3 ? "#ffb6dd" : null;
    if (y === 0) return shade(col, -0.2);
    return col;
  });
}

/** the deep purple starry curtain, with red/white barber-pole posts down both sides */
function bakeCurtain(): Sprite {
  const h = COUNTER_Y;
  const base = "#3a2063";
  return bake(W, h, (x, y) => {
    if (x < POST_W || x >= W - POST_W) {
      const diag = ((x + y) >> 2) % 2;
      return diag ? "#e2394c" : "#fdf3f6";
    }
    const fold = Math.sin((x - POST_W) * 0.22) * 0.5 + (fbm(x * 0.08, y * 0.05, 2, 11) - 0.5) * 0.4;
    let c = fold > 0.18 ? shade(base, 0.14) : fold < -0.18 ? shade(base, -0.12) : base;
    if (hash2(x, y, 5) > 0.994) c = shade(c, 0.65);
    return c;
  });
}

/** a tileable wood-plank panel for the front counter */
function bakeWoodTile(): Sprite {
  const w = 32;
  const h = H - COUNTER_Y - 7;
  return bake(w, h, (x, y) => {
    if (y === 0) return "#c98a4c";
    if (x % 32 === 0) return "#6e3e1f";
    const grain = fbm(x * 0.3, y * 0.6, 2, 3) > 0.55 ? -0.08 : 0;
    return shade("#9a5a32", grain - y * 0.012);
  });
}

/** a tileable strip of blue bunting pennants, strung along the bottom edge */
function bakeBunting(): Sprite {
  const w = 32;
  const h = 7;
  return bake(w, h, (x, y) => {
    if (y < 2) return (x >> 2) % 2 ? "#bfe6ff" : "#ffffff";
    const cx = w / 2;
    const half = (h - 2 - (y - 2)) * 0.9;
    if (Math.abs(x + 0.5 - cx) > half) return null;
    const dx = x + 0.5 - cx;
    const dy = y - 4.2;
    if (inStar(dx, dy, 2.3, 0.9)) return "#ffe14d";
    return (x >> 1) % 2 ? "#3c6cf0" : "#2d52c4";
  });
}

interface Art {
  canopy: Sprite;
  curtain: Sprite;
  wood: Sprite;
  bunting: Sprite;
  balloon: Record<string, Sprite>;
  gold: [Sprite, Sprite];
  star: Sprite;
  bomb: Sprite;
  can: Record<string, Sprite>;
  disc: [Sprite, Sprite];
}
let A: Art | null = null;
function makeArt(): Art {
  const balloon: Record<string, Sprite> = {};
  const can: Record<string, Sprite> = {};
  for (const c of BALLOON_COLS) {
    balloon[c] = makeBalloon(c, BALLOON_W, BALLOON_H);
    can[c] = makeCan(c, CAN_W, CAN_H);
  }
  return {
    canopy: bakeCanopy(),
    curtain: bakeCurtain(),
    wood: bakeWoodTile(),
    bunting: bakeBunting(),
    balloon,
    gold: [makeBalloon("#ffe14d", GOLD_W, GOLD_H), makeBalloon("#ff9a3c", GOLD_W, GOLD_H)],
    star: makeStarBalloon(STAR_W, STAR_H),
    bomb: makeBalloon("#34303f", STAR_W, STAR_H),
    can,
    disc: [makeDisc(DISC_W, DISC_H, false), makeDisc(DISC_W, DISC_H, true)],
  };
}
const art = (): Art => (A ??= makeArt());
// a lazily-built, cached white hit-flash for any sprite (never rebuilt per frame)
const flashCache = new WeakMap<Sprite, Sprite>();
function flashOf(s: Sprite): Sprite {
  let f = flashCache.get(s);
  if (!f) {
    f = tinted(s, "#fffdf0");
    flashCache.set(s, f);
  }
  return f;
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let wave = 0;
  let queue: Kind[] = [];
  let spawnT = 0;
  let darts = 0;
  let misses = 0;
  let combo = 0;
  let comboT = 0;
  let state: "intro" | "play" | "clear" | "over" = "intro";
  let stateT = 0;
  let frame = 0;
  let shake = 0;
  let noDarts = 0;
  const cross = { x: W / 2, y: 100, hold: 0 };
  const tgts: Tgt[] = [];
  const bits: Bit[] = [];
  const pops: Pop[] = [];
  const throws: { x: number; y: number; t: number }[] = [];
  const booms: { x: number; y: number; t: number }[] = [];

  const speedMul = () => 1 + (wave - 1) * 0.13;
  const startWave = () => {
    wave++;
    const n = 9 + wave * 3;
    const kinds: Kind[] = [];
    for (let i = 0; i < n; i++) {
      const roll = r.next();
      kinds.push(roll < 0.5 ? "balloon" : roll < 0.7 ? "disc" : roll < 0.9 ? "can" : "gold");
    }
    for (let i = 0; i < Math.min(6, wave - 1 + (wave > 1 ? 1 : 0)); i++) kinds.push("bomb");
    kinds.push("star");
    if (wave > 2) kinds.push("star");
    // shuffle (the first target is always a friendly balloon)
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = r.int(0, i);
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    queue = ["balloon", ...kinds];
    darts = n + 7;
    misses = 0;
    combo = 0;
    spawnT = 50;
    state = "intro";
    stateT = 100;
  };

  const spawn = (kind: Kind) => {
    const m = speedMul();
    const t: Tgt = { kind, x: 0, y: 0, vx: 0, vy: 0, r: 8, t: r.int(0, 100), color: r.pick(BALLOON_COLS), popped: 0, entered: false };
    if (kind === "disc") {
      const left = r.chance(0.5);
      t.x = left ? -6 : W + 6;
      t.y = r.range(150, 180);
      t.vx = (left ? 1 : -1) * r.range(1.3, 1.9) * m;
      t.vy = -r.range(2.2, 2.5); // arcs up to about y 40-90, then falls away
      t.r = SIZE.disc;
    } else if (kind === "can") {
      const left = r.chance(0.5);
      t.x = left ? -8 : W + 8;
      t.y = SHELF_Y - 7;
      t.vx = (left ? 1 : -1) * r.range(0.6, 0.95) * m;
      t.r = SIZE.can;
    } else {
      t.x = r.range(24, W - 24);
      t.y = H + 12;
      t.vy = -r.range(0.45, 0.8) * m * (kind === "gold" ? 1.6 : 1);
      t.r = kind === "gold" ? SIZE.gold : kind === "star" ? SIZE.star : kind === "bomb" ? SIZE.bomb : SIZE.balloon;
    }
    tgts.push(t);
  };

  const burst = (x: number, y: number, c: string, n: number, sp = 2) => {
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.5, sp);
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(12, 26), c });
    }
  };

  const fire = (io: IO) => {
    if (darts <= 0) {
      io.sfx.play("blip");
      noDarts = 50;
      return;
    }
    darts--;
    throws.push({ x: cross.x, y: cross.y, t: 6 });
    io.sfx.slide?.(1500, 800, 0.06, "square", 0.2);
    io.sfx.play("shoot");
    // find the front-most target under the crosshair (generous hit zone for small fingers)
    let hit: Tgt | null = null;
    for (const t of tgts) if (!t.popped && dist(cross.x, cross.y, t.x, t.y) < t.r + 5) hit = t;
    if (!hit) {
      combo = 0;
      comboT = 0;
      return;
    }
    hit.popped = 1;
    if (hit.kind === "bomb") {
      io.sfx.play("explode");
      io.sfx.noise?.(0.35, 0.5, 900, 60);
      shake = 20;
      combo = 0;
      comboT = 0;
      darts = Math.max(0, darts - 3);
      misses++;
      burst(hit.x, hit.y, PAL.orange, 18, 3);
      burst(hit.x, hit.y, PAL.grey, 12, 2.4);
      booms.push({ x: hit.x, y: hit.y, t: 18 });
      pops.push({ x: hit.x, y: hit.y, t: 50, s: "BOOM! -3 DARTS", c: PAL.red });
      return;
    }
    combo = comboT > 0 ? Math.min(5, combo + 1) : 1;
    comboT = COMBO_FR;
    io.sfx.tone(380 + combo * 90, 0.07, "square", 0.3);
    const pts = POINTS[hit.kind] * combo;
    io.score(pts);
    if (hit.kind === "star") {
      darts += 5;
      io.sfx.play("powerup");
      io.sfx.slide?.(600, 1500, 0.14, "sine", 0.3);
      pops.push({ x: hit.x, y: hit.y, t: 45, s: "+5 DARTS", c: PAL.yellow });
    } else {
      io.sfx.play(hit.kind === "gold" ? "coin" : hit.kind === "can" ? "hit" : hit.kind === "disc" ? "thud" : "pop");
      pops.push({ x: hit.x, y: hit.y, t: 35, s: combo > 1 ? `${pts} X${combo}` : `${pts}`, c: hit.kind === "gold" ? PAL.yellow : PAL.white });
    }
    const c = hit.kind === "gold" ? PAL.yellow : hit.kind === "disc" ? PAL.orange : hit.kind === "can" ? PAL.grey : hit.kind === "star" ? PAL.yellow : hit.color;
    burst(hit.x, hit.y, c, 14);
    burst(hit.x, hit.y, PAL.white, 4, 1.4);
    if (hit.kind === "can") {
      hit.vy = -3;
      hit.vx = r.range(-1, 1);
    }
  };

  return {
    update(io) {
      frame++;
      if (shake > 0) shake--;
      if (noDarts > 0) noDarts--;
      if (comboT > 0 && --comboT === 0) combo = 0;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.05;
        if (--b.life <= 0) bits.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].y -= 0.4;
        if (--pops[i].t <= 0) pops.splice(i, 1);
      }
      for (let i = throws.length - 1; i >= 0; i--) if (--throws[i].t <= 0) throws.splice(i, 1);
      for (let i = booms.length - 1; i >= 0; i--) if (--booms[i].t <= 0) booms.splice(i, 1);
      if (state === "over") return;
      if (wave === 0) {
        startWave();
        io.sfx.play("select");
      }
      // a little fairground crowd murmur while the booth is open
      if (state === "play" && frame % 260 === 0) io.sfx.noise?.(0.6, 0.1, 500, 900);

      // ── aiming: D-pad (speeds up while held) or a finger ──
      const inp = io.input;
      const dx = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
      const dy = (inp.held.down ? 1 : 0) - (inp.held.up ? 1 : 0);
      cross.hold = dx || dy ? cross.hold + 1 : 0;
      const sp = Math.min(4, 2 + cross.hold * 0.04);
      cross.x = clamp(cross.x + dx * sp, 4, W - 4);
      cross.y = clamp(cross.y + dy * sp, 16, COUNTER_Y - 2);
      if (inp.pointer?.down) {
        cross.x = clamp(inp.pointer.x, 4, W - 4);
        cross.y = clamp(inp.pointer.y, 16, COUNTER_Y - 2);
      }

      if (state === "intro" || state === "clear") {
        stateT--;
        if (stateT <= 0) {
          if (state === "clear") {
            startWave();
            io.sfx.play("select");
          } else state = "play";
        }
        return;
      }

      if (inp.tap) {
        cross.x = clamp(inp.tap.x, 4, W - 4);
        cross.y = clamp(inp.tap.y, 16, COUNTER_Y - 2);
        fire(io);
      } else if (inp.pressed.a) fire(io);

      // ── spawning ──
      // out of darts: no new targets come out, the wave ends once the sky is empty
      if (darts <= 0 && queue.length) queue = [];
      spawnT--;
      if (spawnT <= 0 && queue.length) {
        spawn(queue.shift()!);
        spawnT = Math.max(20, 62 - wave * 5) + r.int(0, 20);
      }

      // ── targets ──
      for (const t of tgts) {
        t.t++;
        if (t.popped) {
          t.popped++;
          if (t.kind === "can") {
            t.x += t.vx;
            t.y += t.vy;
            t.vy += 0.2;
          }
          continue;
        }
        if (t.kind === "disc") {
          t.x += t.vx;
          t.y += t.vy;
          t.vy += 0.028;
        } else if (t.kind === "can") t.x += t.vx;
        else {
          t.y += t.vy;
          t.x += Math.sin(t.t * 0.05) * 0.35;
        }
        if (t.x > -4 && t.x < W + 4 && t.y < H) t.entered = true;
        const gone = t.kind === "disc" ? t.entered && (t.x < -12 || t.x > W + 12 || t.y > H + 12) : t.kind === "can" ? t.entered && (t.x < -12 || t.x > W + 12) : t.y < -24;
        if (gone) {
          t.popped = 999; // just remove it
          if (t.kind !== "bomb" && t.kind !== "star") {
            misses++;
            combo = 0;
            comboT = 0;
            io.sfx.play("hurt");
            pops.push({ x: clamp(t.x, 20, W - 20), y: clamp(t.y, 24, 180), t: 30, s: "MISS", c: PAL.red });
          }
        }
      }
      for (let i = tgts.length - 1; i >= 0; i--) {
        const t = tgts[i];
        // a popped balloon/disc gets a few extra frames to flash before it's gone; cans tumble off
        if (t.popped > (t.kind === "can" ? 60 : 3)) tgts.splice(i, 1);
      }

      if (misses >= MAX_MISS) {
        state = "over";
        io.sfx.play("die");
        io.gameOver();
        return;
      }
      if (!queue.length && !tgts.length) {
        state = "clear";
        stateT = 150;
        const bonus = darts * 10 + (misses === 0 ? 500 : 0);
        io.score(bonus + wave * 100);
        io.sfx.play("win");
        io.sfx.play("cheer");
        pops.push({ x: W / 2, y: 120, t: 120, s: `BONUS +${bonus + wave * 100}`, c: PAL.lime });
      }
    },

    draw(g: Gfx) {
      const AR = art();
      const sx = shake > 0 ? (frame % 2 ? 2 : -2) : 0;

      // the purple starry curtain + barber-pole posts, then the scalloped canopy on top
      g.sprite(AR.curtain, sx, 0);
      g.sprite(AR.canopy, sx, 0);
      // a couple of gold studs twinkling along the canopy's pink trim
      for (let i = 0; i < 8; i++) {
        const on = (i + Math.floor(frame / 15)) % 3 === 0;
        g.text("★", 16 + i * 30 + sx, CANOPY_H - 6, on ? PAL.yellow : "#f6c9e0");
      }
      // can shelf, with a soft shadow underneath for the cans to sit in
      g.rect(POST_W - 1, SHELF_Y + 7, W - (POST_W - 1) * 2, 3, "rgba(13,11,26,0.3)");
      g.rect(POST_W - 1, SHELF_Y, W - (POST_W - 1) * 2, 6, "#8a5a2c");
      g.rect(POST_W - 1, SHELF_Y, W - (POST_W - 1) * 2, 1, "#c98a4c");
      g.rect(POST_W - 1, SHELF_Y + 5, W - (POST_W - 1) * 2, 1, "#5e3a1c");

      // targets
      for (const t of tgts) {
        const x = t.x + sx;
        const y = t.y;
        const flashing = t.popped >= 1 && t.popped <= 3 && t.kind !== "can";
        if (t.popped && t.kind !== "can" && !flashing) continue;
        if (t.kind === "disc") {
          const s = AR.disc[Math.floor(frame / 4) % 2];
          const sp = flashing ? flashOf(s) : s;
          g.sprite(sp, x - DISC_W / 2 - 1, y - DISC_H / 2 - 1, { flipX: t.vx < 0 });
        } else if (t.kind === "can") {
          const s = AR.can[t.color];
          g.sprite(s, x - CAN_W / 2 - 1, y - CAN_H / 2 - 1, { flipX: t.popped > 0 && t.popped % 10 < 5 });
        } else {
          const s = t.kind === "gold" ? AR.gold[frame % 20 < 10 ? 0 : 1] : t.kind === "star" ? AR.star : t.kind === "bomb" ? AR.bomb : AR.balloon[t.color];
          const w = t.kind === "gold" ? GOLD_W : t.kind === "star" || t.kind === "bomb" ? STAR_W : BALLOON_W;
          const h = t.kind === "gold" ? GOLD_H : t.kind === "star" || t.kind === "bomb" ? STAR_H : BALLOON_H;
          g.line(x, y + t.r, x + Math.sin(t.t * 0.1) * 2, y + t.r + 12, "#d8d4f2");
          g.sprite(flashing ? flashOf(s) : s, x - w / 2 - 1, y - h * 0.42 - 1);
          if (t.kind === "bomb" && !flashing) {
            g.rect(x - 1, y - t.r - 3, 2, 3, PAL.black);
            if (frame % 8 < 4) g.rect(x - 1, y - t.r - 5, 2, 2, PAL.orange);
            g.text("!", x - 2, y - t.r - 14, PAL.red);
          }
        }
      }
      for (const bm of booms) {
        g.alpha(Math.max(0, 1 - bm.t / 18) * 0.7);
        g.circle(bm.x + sx, bm.y, (18 - bm.t) * 1.6, PAL.orange);
        g.alpha(1);
      }
      for (const b of bits) g.rect(b.x + sx, b.y, b.life > 18 ? 3 : 2, b.life > 18 ? 3 : 2, b.c);
      // darts in flight: they whoosh from the counter to the crosshair, with a little glow
      for (const th of throws) {
        const k = 1 - th.t / 6;
        const x = W / 2 + (th.x - W / 2) * k;
        const y = H + (th.y - H) * k;
        g.line(x, y, x + (W / 2 - th.x) * 0.06, y + 8, "#fff6c8");
        g.circle(x, y, 2, PAL.yellow);
        if (th.t <= 2) {
          g.alpha(0.55);
          g.circle(th.x, th.y, 7 - th.t, PAL.yellow);
          g.alpha(1);
        }
      }
      for (const p of pops) g.text(p.s, p.x, p.y, p.c, { align: "center" });

      // crosshair
      const cc = frame % 30 < 15 ? PAL.red : PAL.white;
      g.box(cross.x - 7, cross.y - 7, 15, 15, cc);
      g.box(cross.x - 4, cross.y - 4, 9, 9, cc);
      g.rect(cross.x - 11, cross.y, 6, 1, cc);
      g.rect(cross.x + 6, cross.y, 6, 1, cc);
      g.rect(cross.x, cross.y - 11, 1, 6, cc);
      g.rect(cross.x, cross.y + 6, 1, 6, cc);
      g.rect(cross.x - 1, cross.y - 1, 2, 2, PAL.yellow);

      // wooden counter with the HUD, then the bunting border along the very bottom
      drawStrip(g, AR.wood, 0, COUNTER_Y, W);
      g.rect(0, COUNTER_Y, W, 2, "#d9a164");
      drawStrip(g, AR.bunting, 0, H - 7, W);
      g.text(`WAVE ${wave}`, 6, COUNTER_Y + 7, PAL.white);
      g.text("DARTS", 64, COUNTER_Y + 7, PAL.white);
      const shown = Math.min(darts, 14);
      for (let i = 0; i < shown; i++) {
        g.rect(100 + i * 5, COUNTER_Y + 6, 1, 8, PAL.white);
        g.rect(99 + i * 5, COUNTER_Y + 5, 3, 2, PAL.red);
      }
      if (darts > 14) g.text(`+${darts - 14}`, 172, COUNTER_Y + 7, PAL.white);
      if (darts === 0) g.text("0", 100, COUNTER_Y + 7, PAL.red);
      for (let i = 0; i < MAX_MISS; i++) g.text(i < misses ? "X" : "-", 196 + i * 11, COUNTER_Y + 7, i < misses ? PAL.red : PAL.tan);
      if (combo > 1) g.text(`COMBO X${combo}`, W / 2, 36, PAL.yellow, { align: "center" });
      if (noDarts > 0 || (darts === 0 && state === "play")) g.text("OUT OF DARTS!", W / 2, 48, PAL.red, { align: "center" });
      if (state === "intro") {
        g.rect(40, 84, W - 80, 36, "rgba(13,11,26,0.75)");
        g.text(`WAVE ${wave}`, W / 2, 90, PAL.yellow, { align: "center", size: 2 });
        g.text("POP THEM ALL! NO BOMBS!", W / 2, 108, PAL.white, { align: "center" });
      } else if (state === "clear") g.text("WAVE CLEAR!", W / 2, 90, PAL.lime, { align: "center", size: 2 });
    },
  };
}

export const balloonGallery: RetroGameDef = {
  id: "balloon-gallery",
  title: "Balloon Gallery",
  blurb: "Tap to pop balloons, discs and cans at the fair. Avoid the bombs!",
  genre: "Action",
  emoji: "🎯",
  color: "#ff6fcf",
  controls: "Tap a target to pop it · or aim with the D-pad and press A · ★ balloon = more darts",
  pad: { dpad: "4", a: "Pop", tap: true },
  create,
};
