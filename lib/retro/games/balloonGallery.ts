// BALLOON GALLERY — a fairground pop-the-target booth. Tap balloons, flying clay discs and
// tin cans on the shelf to pop them (or aim the crosshair with the D-pad and press A).
// Each wave gives you a bag of darts; pop the STAR balloon for more. Quick pops build a
// combo, golden balloons are worth lots, and never pop the grey BOMB balloons! Let too
// many targets get away in one wave and the booth closes. (Original game in the spirit of
// 8-bit shooting galleries — only balloons and targets get popped here.)
import { H, PAL, W, clamp, dist, rng, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const SHELF_Y = 160; // tin cans slide along this shelf
const COUNTER_Y = 196;
const MAX_MISS = 5;
const COMBO_FR = 80;

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
      t.r = 6;
    } else if (kind === "can") {
      const left = r.chance(0.5);
      t.x = left ? -8 : W + 8;
      t.y = SHELF_Y - 7;
      t.vx = (left ? 1 : -1) * r.range(0.6, 0.95) * m;
      t.r = 7;
    } else {
      t.x = r.range(24, W - 24);
      t.y = H + 12;
      t.vy = -r.range(0.45, 0.8) * m * (kind === "gold" ? 1.6 : 1);
      t.r = kind === "gold" ? 7 : 8;
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
      shake = 20;
      combo = 0;
      comboT = 0;
      darts = Math.max(0, darts - 3);
      misses++;
      burst(hit.x, hit.y, PAL.orange, 16, 3);
      burst(hit.x, hit.y, PAL.grey, 10, 2);
      pops.push({ x: hit.x, y: hit.y, t: 50, s: "BOOM! -3 DARTS", c: PAL.red });
      return;
    }
    combo = comboT > 0 ? Math.min(5, combo + 1) : 1;
    comboT = COMBO_FR;
    const pts = POINTS[hit.kind] * combo;
    io.score(pts);
    if (hit.kind === "star") {
      darts += 5;
      io.sfx.play("powerup");
      pops.push({ x: hit.x, y: hit.y, t: 45, s: "+5 DARTS", c: PAL.yellow });
    } else {
      io.sfx.play(hit.kind === "gold" ? "coin" : hit.kind === "can" ? "hit" : "bounce");
      pops.push({ x: hit.x, y: hit.y, t: 35, s: combo > 1 ? `${pts} X${combo}` : `${pts}`, c: hit.kind === "gold" ? PAL.yellow : PAL.white });
    }
    const c = hit.kind === "gold" ? PAL.yellow : hit.kind === "disc" ? PAL.orange : hit.kind === "can" ? PAL.grey : hit.kind === "star" ? PAL.yellow : hit.color;
    burst(hit.x, hit.y, c, 10);
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
      if (state === "over") return;
      if (wave === 0) startWave();

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
          if (state === "clear") startWave();
          else state = "play";
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
            io.sfx.play("step");
            pops.push({ x: clamp(t.x, 20, W - 20), y: clamp(t.y, 24, 180), t: 30, s: "MISS", c: PAL.red });
          }
        }
      }
      for (let i = tgts.length - 1; i >= 0; i--) {
        const t = tgts[i];
        if (t.popped > (t.kind === "can" ? 60 : 1)) tgts.splice(i, 1); // popped cans tumble off first
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
        pops.push({ x: W / 2, y: 120, t: 120, s: `BONUS +${bonus + wave * 100}`, c: PAL.lime });
      }
    },

    draw(g: Gfx) {
      const sx = shake > 0 ? (frame % 2 ? 2 : -2) : 0;
      // sky, ferris wheel and bunting
      g.clear("#7cc4ff");
      g.rect(0, 100, W, 96, "#9ad4ff");
      const wx = 196 + sx;
      for (let i = 0; i < 8; i++) {
        const a = frame * 0.004 + (i * Math.PI) / 4;
        g.line(wx, 98, wx + Math.cos(a) * 40, 98 + Math.sin(a) * 40, "#c9e6ff");
        g.circle(wx + Math.cos(a) * 40, 98 + Math.sin(a) * 40, 4, i % 2 ? "#ffd1f0" : "#fff3b0");
      }
      g.line(wx, 98, wx - 18, 196, "#c9e6ff");
      g.line(wx, 98, wx + 18, 196, "#c9e6ff");
      g.circle(40 + sx, 150, 34, "#8fd07a");
      g.circle(100 + sx, 170, 40, "#7cc46a");
      // striped tent canopy with blinking bulbs
      for (let i = 0; i < 16; i++) {
        g.rect(i * 16 + sx, 0, 16, 16, i % 2 ? PAL.white : PAL.red);
        g.circle(i * 16 + 8 + sx, 16, 8, i % 2 ? PAL.white : PAL.red);
        g.circle(i * 16 + 8 + sx, 25, 1, (i + Math.floor(frame / 15)) % 2 ? PAL.yellow : PAL.orange);
      }
      // side posts
      g.rect(0, 0, 8, COUNTER_Y, "#b8262e");
      g.rect(W - 8, 0, 8, COUNTER_Y, "#b8262e");
      // can shelf
      g.rect(8, SHELF_Y, W - 16, 5, "#8a5a2c");
      g.rect(8, SHELF_Y, W - 16, 1, PAL.tan);

      // targets
      for (const t of tgts) {
        if (t.popped && t.kind !== "can") continue;
        const x = t.x + sx;
        const y = t.y;
        if (t.kind === "disc") {
          g.rect(x - 6, y - 2, 12, 4, PAL.orange);
          g.rect(x - 4, y - 3, 8, 6, PAL.orange);
          g.rect(x - 3, y - 1, 6, 2, "#ffd08a");
        } else if (t.kind === "can") {
          g.rect(x - 5, y - 7, 10, 14, PAL.grey);
          g.rect(x - 5, y - 3, 10, 6, t.color);
          g.rect(x - 3, y - 7, 2, 14, PAL.white);
          g.rect(x - 5, y - 8, 10, 1, PAL.dark);
        } else {
          const c = t.kind === "gold" ? (frame % 20 < 10 ? PAL.yellow : PAL.orange) : t.kind === "bomb" ? PAL.dark : t.kind === "star" ? PAL.yellow : t.color;
          g.line(x, y + t.r, x + Math.sin(t.t * 0.1) * 2, y + t.r + 12, PAL.white);
          g.circle(x, y, t.r, c);
          g.rect(x - 1, y + t.r - 1, 3, 2, c);
          g.circle(x - t.r * 0.35, y - t.r * 0.35, 2, t.kind === "bomb" ? PAL.grey : PAL.white);
          if (t.kind === "star") g.text("★", x - 2, y - 3, PAL.red);
          if (t.kind === "bomb") {
            g.text("!", x - 2, y - 3, PAL.red);
            g.rect(x - 1, y - t.r - 3, 2, 3, PAL.black);
            if (frame % 8 < 4) g.rect(x - 1, y - t.r - 5, 2, 2, PAL.orange);
          }
        }
      }
      for (const b of bits) g.rect(b.x + sx, b.y, 2, 2, b.c);
      // darts in flight: they whoosh from the counter to the crosshair
      for (const th of throws) {
        const k = 1 - th.t / 6;
        const x = W / 2 + (th.x - W / 2) * k;
        const y = H + (th.y - H) * k;
        g.line(x, y, x + (W / 2 - th.x) * 0.06, y + 6, PAL.white);
        if (th.t <= 2) g.circle(th.x, th.y, 5 - th.t, PAL.yellow);
      }
      for (const p of pops) g.text(p.s, p.x, p.y, p.c, { align: "center" });

      // crosshair
      const cc = frame % 30 < 15 ? PAL.red : PAL.white;
      g.box(cross.x - 6, cross.y - 6, 13, 13, cc);
      g.rect(cross.x - 10, cross.y, 6, 1, cc);
      g.rect(cross.x + 5, cross.y, 6, 1, cc);
      g.rect(cross.x, cross.y - 10, 1, 6, cc);
      g.rect(cross.x, cross.y + 5, 1, 6, cc);
      g.rect(cross.x, cross.y, 1, 1, cc);

      // wooden counter with the HUD
      g.rect(0, COUNTER_Y, W, H - COUNTER_Y, PAL.brown);
      g.rect(0, COUNTER_Y, W, 3, PAL.tan);
      for (let x = 0; x < W; x += 32) g.rect(x, COUNTER_Y + 3, 1, H - COUNTER_Y, "#7a4424");
      g.text(`WAVE ${wave}`, 6, COUNTER_Y + 8, PAL.white);
      g.text("DARTS", 64, COUNTER_Y + 8, PAL.white);
      const shown = Math.min(darts, 14);
      for (let i = 0; i < shown; i++) {
        g.rect(100 + i * 5, COUNTER_Y + 7, 1, 8, PAL.white);
        g.rect(99 + i * 5, COUNTER_Y + 6, 3, 2, PAL.red);
      }
      if (darts > 14) g.text(`+${darts - 14}`, 172, COUNTER_Y + 8, PAL.white);
      if (darts === 0) g.text("0", 100, COUNTER_Y + 8, PAL.red);
      for (let i = 0; i < MAX_MISS; i++) g.text(i < misses ? "X" : "-", 196 + i * 11, COUNTER_Y + 8, i < misses ? PAL.red : PAL.tan);
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
