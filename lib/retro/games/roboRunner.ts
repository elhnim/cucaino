// ROBO RUNNER — an original action-platformer in the spirit of the classic 8-bit robot-blaster
// games. A little blue robot kid with an arm cannon picks a boss from the Stage Select screen,
// runs a themed stage full of platforms, gaps, ladders and robot enemies to a shutter door, then
// fights the boss behind it. Beating a boss grants its weapon (own ammo bar) — each weapon is the
// secret weakness of exactly one other boss, classic rock-paper-scissors. Beat all four and the
// Fortress unlocks: a tougher run, a rematch with all four bosses, then a final boss that cycles
// through their attacks (and their weaknesses) as it fights. Enemies "fizz" into bolts and sparks
// — no real-world violence. (Original game, original art, original characters.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type SfxName, type Sprite } from "../engine";
import { bake, bakeGradient, bakeRidge, drawStrip, hash2, outlined, shade, tinted } from "../art";

const T = 16;
const ROWS = 14; // chunks are 9 rows tall (7 content + 2 ground); top 5 rows are sky
const GRAV = 0.3;
const MAXFALL = 5.5;
const COYOTE = 6;
const BUFFER = 6;
const SOLID = new Set(["#", "=", "D"]);
const MAXHP = 28;
const HERO_W = 12;
const HERO_H = 22; // a head taller than the old build — proper NES-hero proportions

/** pad every row to a fixed width so pixel art can be authored loosely — never breaks on a short row */
const padRows = (rows: string[], w: number) => rows.map((r) => r.padEnd(w, ".").slice(0, w));
const spr = (rows: string[], w: number, pal: Record<string, string>) => sprite(padRows(rows, w), pal);

// ── weapons: the buster is free & infinite, the rest are boss rewards with their own ammo bar ──
type WeaponId = "buster" | "bubble" | "leaf" | "spark" | "ice";
interface WeaponDef { id: WeaponId; name: string; color: string; dmg: number; cost: number; speed: number; angles: number[]; arc?: boolean }
const WEAPONS: WeaponDef[] = [
  { id: "buster", name: "BUSTER", color: PAL.yellow, dmg: 1, cost: 0, speed: 3.4, angles: [0] },
  { id: "bubble", name: "BUBBLE", color: PAL.cyan, dmg: 2, cost: 5, speed: 2.1, angles: [0], arc: true },
  { id: "leaf", name: "LEAF", color: PAL.lime, dmg: 2, cost: 5, speed: 2.6, angles: [-0.26, 0.26] },
  { id: "spark", name: "SPARK", color: PAL.purple, dmg: 2, cost: 6, speed: 3.6, angles: [-0.22, 0, 0.22] },
  { id: "ice", name: "ICE", color: PAL.white, dmg: 2, cost: 7, speed: 3, angles: [0] },
];
const WEAPON_BY_STAGE: WeaponId[] = ["bubble", "leaf", "spark", "ice"]; // beating boss i grants this
const AMMO_MAX = 100;
const weaponSfx = (id: WeaponId): SfxName => (id === "bubble" ? "splash" : id === "leaf" ? "whoosh" : id === "spark" ? "zap" : id === "ice" ? "pop" : "shoot");

// ── bosses: each weak to exactly one weapon, forming a 4-way rock-paper-scissors ring ──
// one shared face template (two eyes + a mouth), recoloured per boss with its own "fin" on top
const FACE_BASE = [".kaaaaaaaak.", "kaawwaawwaak", "kaawwaawwaak", "kaaaaaaaaaak", ".kaakkkkaak.", "..kaaaaaak..", "...kkkkkk..."];
const BOSS_FINS = ["..kk.kk.kk..", "...kkkkkk...", ".kk.kkkk.kk.", "..k.kkkkkk.."];
interface BossShot { vx: number; vy: number; arc?: boolean }
interface BossDef {
  id: number;
  name: string;
  body: string;
  accent: string;
  weak: WeaponId;
  cooldown: number;
  icon: string[];
  fire: (b: { x: number; y: number }, h: { x: number; y: number }, t: number) => BossShot[];
}
const aimed = (b: { x: number; y: number }, h: { x: number; y: number }, spd: number): BossShot => {
  const a = Math.atan2(h.y - b.y, h.x - b.x);
  return { vx: Math.cos(a) * spd, vy: Math.sin(a) * spd };
};
const BOSS_DEFS: BossDef[] = [
  {
    id: 0,
    name: "BUBBLE BOT",
    body: PAL.cyan,
    accent: PAL.navy,
    weak: "spark",
    cooldown: 85,
    icon: [BOSS_FINS[0], ...FACE_BASE],
    fire: (b, h) => {
      const dx = Math.sign(h.x - b.x) || 1;
      return [{ vx: dx * 1.6, vy: -2.6, arc: true }];
    },
  },
  {
    id: 1,
    name: "LEAF BOT",
    body: PAL.green,
    accent: PAL.lime,
    weak: "ice",
    cooldown: 130,
    icon: [BOSS_FINS[1], ...FACE_BASE],
    fire: () => {
      const n = 6;
      const out: BossShot[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push({ vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 });
      }
      return out;
    },
  },
  {
    id: 2,
    name: "SPARK BOT",
    body: PAL.purple,
    accent: PAL.yellow,
    weak: "leaf",
    cooldown: 60,
    icon: [BOSS_FINS[2], ...FACE_BASE],
    fire: (b, h, t) => {
      if (t % (60 * 3) === 0) {
        const a = Math.atan2(h.y - b.y, h.x - b.x);
        return [-0.25, 0, 0.25].map((o) => ({ vx: Math.cos(a + o) * 3.2, vy: Math.sin(a + o) * 3.2 }));
      }
      return [aimed(b, h, 3.4)];
    },
  },
  {
    id: 3,
    name: "ICE BOT",
    body: PAL.sky,
    accent: PAL.white,
    weak: "bubble",
    cooldown: 95,
    icon: [BOSS_FINS[3], ...FACE_BASE],
    fire: (b, h) => {
      const a = Math.atan2(h.y - b.y, h.x - b.x);
      return [-0.3, 0, 0.3].map((o) => ({ vx: Math.cos(a + o) * 2.6, vy: Math.sin(a + o) * 2.6 }));
    },
  },
];
const bossPal = (d: BossDef) => ({ k: PAL.black, a: d.body, w: PAL.white });
// memoized once per boss (never rebuild the Sprite object inside draw — the host caches it as a canvas)
const BOSS_ICON_SPRITES = BOSS_DEFS.map((d) => spr(d.icon, 12, bossPal(d)));
const BOSS_ICON_FLASH = BOSS_ICON_SPRITES.map((s) => tinted(s, PAL.white));
const bossIcon = (d: BossDef) => BOSS_ICON_SPRITES[d.id];

// ── themed tile/background art: one shared renderer per stage "look" ──
type ThemeId = "coral" | "jungle" | "factory" | "ice" | "fortress";
interface Theme { id: ThemeId; sky: [string, string]; ground: string; groundDark: string; block: string; blockLight: string; detail: string }
const THEMES: Record<ThemeId, Theme> = {
  coral: { id: "coral", sky: ["#0d2a4a", "#1f5a8a"], ground: "#2a5a6a", groundDark: "#163a4a", block: "#3a8a9a", blockLight: "#7ad4e4", detail: PAL.pink },
  jungle: { id: "jungle", sky: ["#0d3a1a", "#1f7a3c"], ground: "#4a3a1e", groundDark: "#2a2410", block: "#5a7a2c", blockLight: "#8fe07a", detail: PAL.lime },
  factory: { id: "factory", sky: ["#19182a", "#3a2a4a"], ground: "#4a4a5a", groundDark: "#262636", block: "#6a6a7e", blockLight: "#a0a0b8", detail: PAL.yellow },
  ice: { id: "ice", sky: ["#3a6a9a", "#bfe8ff"], ground: "#7a9ac0", groundDark: "#4a6a9a", block: "#aee4ff", blockLight: "#ffffff", detail: PAL.cyan },
  fortress: { id: "fortress", sky: ["#0d0b1a", "#2a1b3a"], ground: "#3a3a4e", groundDark: "#1a1a2a", block: "#5a4a6a", blockLight: "#9a5cff", detail: PAL.red },
};
function drawTile(g: Gfx, th: Theme, ch: string, x: number, y: number) {
  const night = th.id === "factory" || th.id === "fortress";
  if (ch === "#") {
    g.rect(x, y, T, T, th.ground);
    g.rect(x, y, T, 3, th.groundDark === th.ground ? "#ffffff22" : th.groundDark);
    if (th.id === "coral") {
      // sand-and-rock reef floor: a rippled sandy top layer over rock plate with an irregular
      // seam; most tiles are left PLAIN — only here and there (roughly every 4-6 tiles) a shell
      // or a starfish, never a mark on every tile
      const col = Math.round(x / T), row = Math.round(y / T);
      const v = hash2(col, row, 41);
      g.rect(x, y, T, 5, shade(th.ground, 0.14));
      g.rect(x, y, T, 2, shade(th.ground, 0.24));
      const rip = Math.sin(col * 1.7 + row) * 1.2;
      g.line(x, y + 4 + rip, x + T, y + 4 - rip, shade(th.ground, 0.34));
      const sj = Math.round(hash2(col, row, 45) * 3) - 1;
      g.line(x, y + 9 + sj, x + T / 2, y + 7 + sj, th.groundDark);
      g.line(x + T / 2, y + 7 + sj, x + T, y + 10 + sj, th.groundDark);
      if (v > 0.86) {
        // a shell: fanned ridges from one point
        for (let i = -2; i <= 2; i++) g.line(x + 8, y + 13, x + 8 + i * 2, y + 9, i % 2 ? th.detail : shade(th.detail, 0.3));
        g.rect(x + 7, y + 12, 3, 2, shade(th.detail, -0.15));
      } else if (v > 0.74) {
        // a small starfish
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g.line(x + 8, y + 10, x + 8 + Math.cos(a) * 4, y + 10 + Math.sin(a) * 4, shade(th.detail, 0.05));
        }
        g.rect(x + 7, y + 9, 2, 2, shade(th.detail, 0.25));
      }
    } else if (th.id === "jungle") {
      // packed dirt: bark-root grain, OR a surfaced root, OR a tiny mushroom — varied per tile
      const col = Math.round(x / T), row = Math.round(y / T);
      const v = hash2(col, row, 42);
      if (v < 0.4) {
        g.rect(x + 2, y + 4, 2, 11, th.groundDark);
        g.rect(x + 9, y + 2, 2, 13, th.groundDark);
      } else if (v < 0.7) {
        g.line(x + 2, y + 3, x + 8, y + 13, th.groundDark);
        g.line(x + 14, y + 4, x + 8, y + 13, th.groundDark);
      } else {
        g.rect(x + 7, y + 8, 2, 5, shade(th.groundDark, 0.1));
        g.circle(x + 8, y + 7, 3, th.detail);
        g.rect(x + 7, y + 6, 1, 1, shade(th.detail, 0.3));
      }
    } else if (night) {
      // mostly a PLAIN riveted plate — a seam, small corner bolts, a crisp lit top edge so the
      // hero's footing always reads — with a hazard strip or a vent only every few tiles, and a
      // runway light only here and there (never every single tile, or it reads as a busy band)
      const col = Math.round(x / T), row = Math.round(y / T);
      g.rect(x, y, T, 1, shade(th.ground, 0.3));
      g.rect(x + T / 2, y + 2, 1, T - 4, th.groundDark);
      g.rect(x + 2, y + 2, 1, 1, th.groundDark);
      g.rect(x + T - 3, y + 2, 1, 1, th.groundDark);
      g.rect(x + 2, y + T - 3, 1, 1, th.groundDark);
      g.rect(x + T - 3, y + T - 3, 1, 1, th.groundDark);
      if (hash2(col, row, 70) > 0.55) {
        g.alpha(0.16);
        g.rect(x + 3, y + 6, T - 6, 3, th.groundDark);
        g.alpha(1);
      }
      if (col % 4 === 1) {
        g.alpha(0.3);
        g.rect(x + 6, y + 6, 4, 4, th.detail);
        g.alpha(1);
        g.rect(x + 7, y + 7, 2, 2, th.detail);
      } else if (col % 8 === 3) {
        for (let i = -4; i < T + 4; i += 4) g.line(x + i, y + T - 1, x + i + 4, y + T - 6, PAL.yellow);
        g.alpha(0.5);
        g.rect(x, y + T - 6, T, 1, PAL.black);
        g.alpha(1);
      } else if (col % 8 === 6) {
        g.rect(x + 3, y + 7, T - 6, 2, th.groundDark);
        g.rect(x + 3, y + 11, T - 6, 2, th.groundDark);
        g.alpha(0.4);
        g.rect(x + 3, y + 7, T - 6, 1, PAL.black);
        g.alpha(1);
      }
    } else if (th.id === "ice") {
      // packed snow/ice: a crack pattern (two variants) or a drift of fresh snow, per tile
      const col = Math.round(x / T), row = Math.round(y / T);
      const v = hash2(col, row, 43);
      if (v < 0.4) {
        g.line(x + 2, y + 2, x + 7, y + 9, "#ffffffaa");
        g.line(x + 10, y + 3, x + 14, y + 10, "#ffffffaa");
      } else if (v < 0.7) {
        g.line(x + 3, y + 11, x + 9, y + 3, "#ffffffaa");
        g.line(x + 9, y + 3, x + 13, y + 7, "#ffffffaa");
      } else {
        g.alpha(0.55);
        g.circle(x + 8, y + 4, 4, PAL.white);
        g.alpha(1);
        g.rect(x + 6, y + 2, 1, 1, PAL.white);
      }
    } else {
      g.rect(x + 6, y + 2, 4, 2, th.detail);
      g.rect(x + 2, y + 9, 3, 3, th.groundDark);
    }
  } else if (ch === "=") {
    // a heavy armoured crate: a stepped tonal gradient (not a flat fill), bevelled face, corner
    // bolts, a hazard-painted corner, a dark diagonal reflection streak
    g.rect(x, y, T, T, th.block);
    g.rect(x, y, T, 4, shade(th.block, 0.24));
    g.rect(x, y + 4, T, 4, shade(th.block, 0.08));
    g.rect(x, y + T - 6, T, 4, shade(th.block, -0.14));
    g.rect(x, y + T - 2, T, 2, th.groundDark);
    g.rect(x + 1, y + T / 2, T - 2, 1, th.groundDark);
    g.rect(x + 2, y + 2, 2, 2, th.groundDark);
    g.rect(x + T - 4, y + 2, 2, 2, th.groundDark);
    g.rect(x + 2, y + T - 6, 2, 2, th.groundDark);
    g.rect(x + T - 4, y + T - 6, 2, 2, th.groundDark);
    g.alpha(0.5);
    g.line(x + 3, y + T - 3, x + T - 3, y + 3, shade(th.block, -0.22));
    g.alpha(1);
    g.rect(x + 1, y + 1, 4, 2, PAL.yellow);
    g.rect(x + 1, y + 1, 1, 4, PAL.yellow);
  }
}
// ── baked backdrop art: a dithered sky gradient + a far parallax skyline/canopy strip, built
// once per theme (lazily, first time that theme is drawn) and reused every frame as a cheap
// sprite blit — never rebuilt inside the per-frame draw loop ──
interface ThemeArt { sky: Sprite; skyline: Sprite; skylineW: number; skylineH: number }
const THEME_ART: Partial<Record<ThemeId, ThemeArt>> = {};
const SKY_H = 170;
const STRIP_W = 220;
function cityHeights(w: number, seed: number) {
  const hs = new Array(w).fill(16);
  let x = 0;
  while (x < w) {
    const bw = 9 + Math.floor(hash2(x, seed) * 15);
    const bh = 26 + Math.floor(hash2(x, seed + 101) * 78);
    for (let i = 0; i < bw && x + i < w; i++) hs[x + i] = bh;
    x += bw;
  }
  return hs;
}
// a few smooth gaussian-ish bumps summed together (wrap-aware, so the baked strip tiles
// seamlessly) — reef towers, canopy, mountain peaks: NEVER raw fbm noise, which reads as jittery
// pixel static at this scale
function bumpHeights(w: number, seed: number, bumps: number, base: number, ampLo: number, ampHi: number, wLo: number, wHi: number) {
  const R = rng(seed);
  const specs = Array.from({ length: bumps }, () => ({ cx: R.range(0, w), half: R.range(wLo, wHi), amp: R.range(ampLo, ampHi) }));
  const hs = new Array(w).fill(base);
  for (let x = 0; x < w; x++) {
    let h = base;
    for (const s of specs) {
      const dx = Math.min(Math.abs(x - s.cx), w - Math.abs(x - s.cx));
      const t = clamp(1 - dx / s.half, 0, 1);
      h += t * t * (3 - 2 * t) * s.amp;
    }
    hs[x] = h;
  }
  return hs;
}
// round, overlapping half-ellipse mounds (reef boulders, not pointy bumps) — mounds combine with
// MAX, not sum, so overlapping ones merge into one continuous rounded skyline
function domeHeights(w: number, seed: number, domes: number, base: number, ampLo: number, ampHi: number, wLo: number, wHi: number) {
  const R = rng(seed);
  const specs = Array.from({ length: domes }, () => ({ cx: R.range(0, w), half: R.range(wLo, wHi), amp: R.range(ampLo, ampHi) }));
  const hs = new Array(w).fill(base);
  for (let x = 0; x < w; x++) {
    let h = base;
    for (const s of specs) {
      const dx = Math.min(Math.abs(x - s.cx), w - Math.abs(x - s.cx));
      if (dx < s.half) h = Math.max(h, base + s.amp * Math.sqrt(Math.max(0, 1 - (dx / s.half) ** 2)));
    }
    hs[x] = h;
  }
  return hs;
}
function buildThemeArt(th: Theme): ThemeArt {
  const night = th.id === "factory" || th.id === "fortress";
  const sky = bakeGradient(
    W,
    SKY_H,
    night ? [shade(th.sky[0], -0.12), th.sky[0], th.sky[1], shade(th.sky[1], 0.1)] : [th.sky[0], th.sky[0], th.sky[1], shade(th.sky[1], 0.12)]
  );
  let skyline: Sprite;
  let skylineH: number;
  if (night) {
    const seed = th.id === "factory" ? 11 : 29;
    const hs = cityHeights(STRIP_W, seed);
    skylineH = 104;
    const base = shade(th.block, -0.32);
    skyline = bakeRidge(STRIP_W, skylineH, (x) => hs[x], base, {
      rim: shade(base, 0.16),
      tex: (x, y, depth) => {
        if (depth < 4 || x % 5 !== 2) return null;
        const wy = (skylineH - y) % 8;
        if (wy < 2 || wy > 4) return null;
        return hash2(Math.floor(x / 5), Math.floor(y / 8), seed) > 0.42 ? th.detail : shade(base, -0.22);
      },
    });
  } else if (th.id === "coral") {
    // ROUND overlapping reef mounds/boulders (half-ellipse domes, not spiky peaks): dark teal
    // with a lit rim on top. No tex — bakeRidge's own slope shading already rounds them off.
    const hs = domeHeights(STRIP_W, 103, 7, 14, 20, 42, 15, 35);
    skylineH = 70;
    const base = shade(th.block, -0.3);
    skyline = bakeRidge(STRIP_W, skylineH, (x) => hs[x], base, { rim: th.blockLight });
  } else if (th.id === "jungle") {
    // a dense tree-top canopy: lots of small overlapping bumps, a regular leaf-cluster texture
    // (a fixed grid, never scattered noise)
    const hs = bumpHeights(STRIP_W, 205, 14, 44, 14, 34, 7, 15);
    skylineH = 92;
    const base = shade(th.ground, 0.04);
    skyline = bakeRidge(STRIP_W, skylineH, (x) => hs[x], base, { rim: th.detail, tex: (x, y, d) => (d > 2 && x % 6 < 2 && y % 6 < 2 ? shade(base, 0.18) : null) });
  } else {
    // a few big, dramatic, smooth mountain peaks with a clean diagonal facet-line texture
    const hs = bumpHeights(STRIP_W, 307, 5, 16, 40, 72, 20, 46);
    skylineH = 112;
    skyline = bakeRidge(STRIP_W, skylineH, (x) => hs[x], th.block, { rim: PAL.white, tex: (x, y, d) => (d > 1 && (x - y) % 10 === 0 ? PAL.white : null) });
  }
  return { sky, skyline, skylineW: STRIP_W, skylineH };
}
const themeArt = (th: Theme): ThemeArt => (THEME_ART[th.id] ??= buildThemeArt(th));

// moon (night) / sunlight (day themes) — a small bright disc plus soft dithered-looking halo
// rings, never one flat glow dome; shared by the run backdrop and the boss arena
function drawSkyDecor(g: Gfx, th: Theme, night: boolean, t: number) {
  if (night) {
    const mx = 208, my = 24, mr = 11;
    g.alpha(0.08);
    g.circle(mx, my, mr * 2.3, "#dfe6ff");
    g.alpha(0.16);
    g.circle(mx, my, mr * 1.5, "#dfe6ff");
    g.alpha(1);
    g.circle(mx, my, mr, "#eef1ff");
    g.circle(mx - 3, my - 2, 2.2, shade("#eef1ff", -0.14));
    g.circle(mx + 4, my + 3, 1.6, shade("#eef1ff", -0.14));
  } else if (th.id === "coral") {
    // sunlight glows down from the surface: a bright wavy band plus a couple of soft, dithered
    // light shafts fading down into the water — never a hard sun disc underwater
    for (let b = 0; b < 4; b++) {
      const wy = Math.sin(t * 0.02 + b * 1.6) * 2;
      g.alpha(0.22 - b * 0.04);
      g.rect(0, b * 3 + wy, W, 3, shade(th.sky[1], 0.35));
    }
    g.alpha(1);
    // diagonal shafts: a few stacked, widening bands stepping sideways as they go down, so the
    // whole shaft reads as a slanted cone of light rather than a vertical stripe
    for (let i = 0; i < 2; i++) {
      const sx = 50 + i * 130 + Math.sin(t * 0.012 + i) * 12;
      const slant = 0.55;
      for (let s = 0; s < 4; s++) {
        const sy = s * 28;
        g.alpha(0.1 - s * 0.018);
        g.rect(sx + sy * slant - 9 - s, sy, 16 + s * 3, 29, shade(th.sky[1], 0.3));
      }
    }
    g.alpha(1);
  } else {
    const sx = 208, sy = 28;
    g.alpha(0.12);
    g.circle(sx, sy, 24, th.detail);
    g.alpha(1);
    g.circle(sx, sy, 11, shade(th.detail, 0.18));
  }
}

// a thick (>1px) outlined stroke: two dark edge lines plus a few filled interior lines, so a
// branch or strut reads as a solid lit shape, never a 1px wireframe
function thickLine(g: Gfx, x1: number, y1: number, x2: number, y2: number, w: number, color: string, lit: string, dark: string) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const h = (w - 1) / 2;
  g.line(x1 + nx * (-h - 1), y1 + ny * (-h - 1), x2 + nx * (-h - 1), y2 + ny * (-h - 1), dark);
  g.line(x1 + nx * (h + 1), y1 + ny * (h + 1), x2 + nx * (h + 1), y2 + ny * (h + 1), dark);
  for (let o = -h; o <= h + 0.01; o++) g.line(x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o, o < 0 ? lit : color);
}
// ── mid-ground props: SOLID filled coral, not wireframe lines — picked per slot by a small
// variant index so neighbouring props never repeat the exact same shape. Warm pink/orange/purple
// against the cool teal reef, each outlined, sitting right on the sand line (gy). ──
function drawCoralProp(g: Gfx, x: number, gy: number, variant: number, th: Theme) {
  if (variant === 0) {
    // brain coral: a solid round dome with a dark outline ring and a few carved grooves
    const r = 9;
    const c = "#e0714a"; // warm orange
    g.circle(x, gy - r + 1, r + 1, shade(c, -0.4));
    g.circle(x, gy - r, r, c);
    g.circle(x, gy - r - 2, r - 3, shade(c, 0.22));
    for (let i = -1; i <= 1; i++) {
      const gx = x + i * 5;
      g.line(gx - 3, gy - r + 3, gx, gy - r - 3, shade(c, -0.3));
      g.line(gx, gy - r - 3, gx + 3, gy - r + 3, shade(c, -0.3));
    }
  } else if (variant === 1) {
    // tube/staghorn coral: thick filled branches with rounded, lit tips
    const c = "#ff6fa8"; // warm pink
    const branches: [number, number, number, number][] = [
      [0, 0, -3, -14], [-3, -14, -12, -24], [-3, -14, -2, -30], [-12, -24, -16, -32],
      [0, 0, 6, -12], [6, -12, 14, -22], [6, -12, 5, -26], [14, -22, 13, -34], [14, -22, 20, -28],
    ];
    for (const [x1, y1, x2, y2] of branches) {
      thickLine(g, x + x1, gy + y1, x + x2, gy + y2, 3, c, shade(c, 0.22), shade(c, -0.35));
      g.circle(x + x2, gy + y2, 2.2, shade(c, 0.18));
    }
    g.circle(x, gy - 2, 3, shade(c, -0.15));
  } else {
    // a sea fan: a solid filled wedge with a darker lattice on top
    const c = "#b37bff"; // warm purple
    for (let i = -2; i <= 2; i++) thickLine(g, x, gy, x + i * 9, gy - 32, 3, c, shade(c, 0.2), shade(c, -0.3));
    g.line(x - 18, gy - 16, x + 18, gy - 16, shade(c, -0.3));
    g.rect(x - 2, gy - 4, 4, 5, shade(th.block, -0.2));
  }
}
function drawJungleTree(g: Gfx, x: number, gy: number, variant: number, th: Theme) {
  const h = 66 + variant * 22;
  g.rect(x - 4, gy - h, 8, h, th.groundDark);
  g.rect(x - 4, gy - h, 3, h, shade(th.groundDark, 0.14));
  for (let i = 0; i < 2; i++) g.rect(x - 2, gy - h + 12 + i * (h / 3), 1, 8, shade(th.groundDark, -0.18));
  const cy = gy - h - 4;
  g.circle(x - 11, cy + 6, 16, shade(th.ground, -0.08));
  g.circle(x + 13, cy + 4, 18, shade(th.ground, -0.03));
  g.circle(x, cy - 10, 20, th.ground);
  g.alpha(0.55);
  g.circle(x - 7, cy - 17, 7, th.detail);
  g.alpha(1);
  if (variant === 1) for (let i = 0; i < 4; i++) g.circle(x + 17 + Math.sin(i) * 2, gy - h + 16 + i * 11, 1.3, shade(th.ground, 0.12));
}
function drawIceProp(g: Gfx, x: number, gy: number, variant: number, th: Theme) {
  if (variant === 0) {
    // a faceted ice spire: angular lit-left / shadowed-right panels
    const h = 62;
    g.line(x, gy, x - 11, gy - h, shade(th.block, 0.22));
    g.line(x - 11, gy - h, x - 2, gy - h - 15, PAL.white);
    g.line(x, gy, x + 9, gy - h + 10, shade(th.block, -0.22));
    g.line(x + 9, gy - h + 10, x - 2, gy - h - 15, shade(th.block, -0.1));
    g.circle(x - 3, gy - 10, 10, shade(th.block, 0.1));
    g.circle(x - 3, gy - 10, 5, th.blockLight);
  } else {
    // a frosted pine: snow-capped tiers
    for (let i = 0; i < 3; i++) {
      const w2 = 26 - i * 7, ty = gy - 12 - i * 16;
      g.line(x - w2 / 2, ty + 11, x, ty, shade(th.ground, -0.08 * i));
      g.line(x + w2 / 2, ty + 11, x, ty, shade(th.ground, -0.14 - 0.06 * i));
      g.rect(x - w2 / 2, ty + 9, w2, 2, PAL.white);
    }
    g.rect(x - 2, gy - 4, 4, 10, th.groundDark);
  }
}
// a tall kelp strand swaying from the reef floor, in short connected segments that sway more
// toward the tip — animated, so it's drawn live each frame rather than baked into the ridge
function drawKelp(g: Gfx, x: number, baseY: number, t: number, seed: number) {
  const segs = 4, h = 40;
  const col = "#1f8f6a";
  let px = x, py = baseY;
  for (let i = 1; i <= segs; i++) {
    const amp = (i / segs) * 9;
    const nx = x + Math.sin(t * 0.03 + seed + i * 0.6) * amp;
    const ny = baseY - (h * i) / segs;
    g.line(px, py, nx, ny, col);
    g.line(px + 1, py, nx + 1, ny, shade(col, 0.2));
    px = nx;
    py = ny;
  }
}

function drawBG(g: Gfx, th: Theme, cam: number, t: number) {
  const night = th.id === "factory" || th.id === "fortress";
  const art = themeArt(th);
  g.clear(th.sky[0]);
  g.sprite(art.sky, 0, 0);
  drawSkyDecor(g, th, night, t);
  // far parallax skyline / canopy ridge (one baked strip, tiled)
  const horizon = 150;
  drawStrip(g, art.skyline, cam * 0.16, horizon - art.skylineH, W);
  // tall kelp strands swaying up from the reef mounds
  if (th.id === "coral") {
    const kw = 240;
    for (let i = 0; i < 2; i++) {
      const x = (((i * (kw / 2) + 50 - cam * 0.16) % kw) + kw) % kw - 20;
      drawKelp(g, x, horizon - 6, t, i * 3);
    }
  }
  // blinking antenna lights on the tallest towers (night only)
  if (night) {
    const sw = art.skylineW;
    for (let i = 0; i < 4; i++) {
      const x = (((i * (sw / 4) + 24 - cam * 0.16) % sw) + sw) % sw - 16;
      const topY = horizon - art.skylineH + 16 + (i % 3) * 9;
      g.rect(x, topY - 7, 1, 7, PAL.black);
      if (Math.floor(t * 0.1 + i * 6) % 24 < 3) {
        g.alpha(0.6);
        g.circle(x, topY - 8, 2, PAL.red);
        g.alpha(1);
        g.circle(x, topY - 8, 1, PAL.red);
      }
    }
  }
  // mid-ground: factory smokestacks + pipe gantry (night), reef coral/sea-fans/anemones,
  // multi-lobe jungle trees, or faceted ice spires/frosted pines — real shaded, outlined props,
  // never a flat glow disc
  const midCount = th.id === "coral" ? 3 : 5;
  const midSpacing = th.id === "coral" ? 160 : 100;
  for (let i = 0; i < midCount; i++) {
    const x = (((i * midSpacing - cam * 0.3) % (midSpacing * midCount)) + midSpacing * midCount) % (midSpacing * midCount) - 60;
    if (th.id === "coral") {
      drawCoralProp(g, x + 24, 182, i % 3, th);
    } else if (th.id === "jungle") {
      drawJungleTree(g, x + 24, 172, i % 2, th);
    } else if (night) {
      // a smokestack: riveted shaft, dark cap, a slow puff of smoke drifting up
      const sxp = x + 16;
      g.rect(sxp - 4, 70, 8, 90, shade(th.block, -0.16));
      g.rect(sxp - 4, 70, 3, 90, shade(th.block, 0.05));
      g.rect(sxp - 5, 64, 10, 7, th.groundDark);
      for (let py = 0; py < 3; py++) {
        const pt = (t * 0.4 + i * 40 + py * 30) % 120;
        const pr = 3 + pt * 0.06;
        g.alpha(Math.max(0, 0.3 - pt * 0.0025));
        g.circle(sxp + Math.sin(pt * 0.05 + i) * 4, 62 - pt * 0.7, pr, th.groundDark === th.ground ? PAL.grey : shade(th.sky[1], 0.15));
      }
      g.alpha(1);
      // a pipe truss linking two stacks, with a slow-sweeping searchlight beam
      g.rect(sxp + 4, 96, 46, 3, th.groundDark);
      g.rect(sxp + 4, 96, 46, 1, shade(th.block, 0.1));
      const beamA = Math.sin(t * 0.02 + i) * 0.5;
      g.alpha(0.1);
      g.line(sxp + 20, 100, sxp + 20 + beamA * 60, 150, th.detail);
      g.alpha(1);
    } else if (th.id === "ice") {
      drawIceProp(g, x + 24, 172, i % 2, th);
    } else {
      g.rect(x + 14, 44, 8, 116, th.groundDark);
      g.circle(x + 18, 40, 4, th.detail);
    }
  }
  // drifting life: rising bubbles + fish (coral), fireflies (jungle), falling snow (ice)
  if (th.id === "coral") {
    for (let i = 0; i < 6; i++) {
      const bx = (((i * 53 - cam * 0.15) % 280) + 280) % 280 - 10;
      const by = 190 - ((t * 0.6 + i * 23) % 170);
      g.alpha(0.35 + 0.25 * Math.sin(t * 0.1 + i));
      g.circle(bx, by, 1.4 + (i % 3) * 0.5, shade(th.blockLight, 0.2));
      g.alpha(1);
    }
    for (let i = 0; i < 2; i++) {
      const dir = i % 2 ? 1 : -1;
      const fx = ((((i * 150 + t * 0.4 * dir) - cam * 0.2) % 400) + 400) % 400 - 60;
      const fy = 66 + i * 24 + Math.sin(t * 0.05 + i) * 4;
      g.alpha(0.55);
      g.circle(fx, fy, 3.4, shade(th.block, -0.3));
      g.line(fx - dir * 5, fy, fx - dir * 9, fy - 3, shade(th.block, -0.3));
      g.line(fx - dir * 5, fy, fx - dir * 9, fy + 3, shade(th.block, -0.3));
      g.alpha(1);
    }
  } else if (th.id === "jungle") {
    for (let i = 0; i < 6; i++) {
      const fx = (((i * 61 - cam * 0.12) % 260) + 260) % 260 - 10;
      const fy = 90 + ((i * 31) % 70) + Math.sin(t * 0.07 + i) * 6;
      g.alpha(0.35 + 0.5 * Math.max(0, Math.sin(t * 0.15 + i * 2)));
      g.circle(fx, fy, 1.2, th.detail);
      g.alpha(1);
    }
  } else if (th.id === "ice") {
    for (let i = 0; i < 10; i++) {
      const fx = (((i * 41 - cam * 0.1) % 280) + 280) % 280 - 10;
      const fy = ((t * 0.8 + i * 17) % 170) + 10;
      g.alpha(0.6);
      g.circle(fx, fy, 1, PAL.white);
      g.alpha(1);
    }
  }
  if (night) {
    // a riveted watchtower with a tiny sentry peeking round its base — hazier & muted so it never
    // reads as a walkable foreground block, just distant scenery
    g.alpha(0.6);
    for (let i = 0; i < 2; i++) {
      const tx = (((i * 300 + 170 - cam * 0.3) % 1200) + 1200) % 1200 - 140;
      g.rect(tx, 86, 16, 76, shade(th.sky[1], -0.08));
      g.rect(tx, 86, 16, 3, th.groundDark);
      for (let ry = 96; ry < 158; ry += 15) {
        g.rect(tx + 2, ry, 12, 2, th.groundDark);
        g.rect(tx + 3, ry + 4, 2, 2, th.blockLight);
        g.rect(tx + 11, ry + 4, 2, 2, th.blockLight);
      }
      g.circle(tx + 18, 150, 3, th.groundDark);
      g.circle(tx + 19, 149, 1, th.detail);
    }
    g.alpha(1);
  }
  // foreground floodlight pylons: a riveted steel lattice tower (diagonal cross-braces, bolts)
  // topped with a small glowing lamp and a soft downward searchlight beam
  for (let i = 0; i < 4; i++) {
    const x = (((i * 130 - cam * 0.22) % 520) + 520) % 520 - 60;
    if (th.id === "coral" || th.id === "jungle") continue; // these themes keep their own scenery clean
    const px = x + 14;
    g.rect(px - 5, 18, 10, 150, shade(th.block, -0.1));
    g.rect(px - 5, 18, 4, 150, shade(th.block, 0.12));
    g.rect(px - 1, 18, 1, 150, th.groundDark);
    for (let ly = 30; ly < 160; ly += 18) {
      g.line(px - 5, ly, px + 5, ly + 16, th.groundDark);
      g.line(px + 5, ly, px - 5, ly + 16, th.groundDark);
      g.rect(px - 5, ly, 1, 1, th.blockLight);
      g.rect(px + 4, ly, 1, 1, th.blockLight);
    }
    g.rect(px - 2, 11, 4, 7, th.groundDark);
    g.alpha(0.22);
    g.circle(px, 15, 10, th.detail);
    g.alpha(1);
    g.circle(px, 15, 4, th.detail);
    g.circle(px - 1, 14, 1.3, PAL.white);
    g.alpha(0.07);
    for (let b = 0; b < 4; b++) g.rect(px - 10 + b * 2, 24 + b * 10, 20 - b * 4, 9, th.detail);
    g.alpha(1);
  }
  for (let i = 0; i < 12; i++) {
    const x = (((i * 47 - cam * 0.08) % 564) + 564) % 564 - 20;
    const y = ((i * 37) % 110) + 10;
    const c = th.id === "coral" ? PAL.cyan : th.id === "jungle" ? PAL.lime : th.id === "factory" ? PAL.yellow : th.id === "ice" ? PAL.white : th.detail;
    const tw = 0.55 + 0.45 * Math.sin(t * 0.08 + i * 1.7);
    g.alpha(tw);
    g.circle(x, y, th.id === "ice" ? 1 : i % 4 === 0 ? 2 : 1.3, c);
    g.alpha(1);
  }
}

// ── level chunks: # ground  = metal block  H ladder  e energy pellet  C checkpoint  D shutter ──
// h hopper  f flyer  u turret  s shielded walker  S start — every chunk carries at least one hazard
const CH: Record<string, string[]> = {
  start: ["................", "................", "................", "................", "................", "................", ".S....h......e.", "################", "################"],
  gapJump: ["................", "......f.........", "................", "................", "................", "................", "................", "######...#######", "######...#######"],
  twoLevel: ["..h.....e......", "..========......", "..H.............", "..H.......s.....", "..H.............", "..H.......e.....", "................", "################", "################"],
  turretTower: ["................", "................", "....====........", "....=u=.........", "....=.=.........", "....=.=.........", "...............u", "################", "################"],
  flyerCanyon: ["................", "......f.....f..", "................", "...==...==...==", "................", "................", "................", "###..........###", "###..........###"],
  shieldBridge: ["................", "................", "................", "................", "................", "................", "........s.......", "####========####", "####........####"],
  checkpt: ["................", "................", "................", "................", "....e...e...e..", "................", "..C.........h..", "################", "################"],
  stairsGap: ["..............e", "............===", "...........====", "..........=====", ".........======", "h....=..........", "................", "####....========", "####....========"],
  doorway: ["................", "................", "................", "................", ".............DD.", ".............DD.", ".............DD.", "################", "################"],
};

interface StageDef { name: string; boss: BossDef; theme: ThemeId; chunks: string[]; hpMul: number; spdMul: number }
const STAGES: StageDef[] = [
  { name: "CORAL CAVERNS", boss: BOSS_DEFS[0], theme: "coral", chunks: ["start", "gapJump", "checkpt", "twoLevel", "doorway"], hpMul: 0.75, spdMul: 0.8 },
  { name: "JUNGLE RUINS", boss: BOSS_DEFS[1], theme: "jungle", chunks: ["start", "twoLevel", "stairsGap", "checkpt", "flyerCanyon", "doorway"], hpMul: 1, spdMul: 1 },
  { name: "CIRCUIT CITY", boss: BOSS_DEFS[2], theme: "factory", chunks: ["start", "turretTower", "gapJump", "checkpt", "stairsGap", "doorway"], hpMul: 1.1, spdMul: 1.1 },
  { name: "FROST PEAK", boss: BOSS_DEFS[3], theme: "ice", chunks: ["start", "twoLevel", "shieldBridge", "stairsGap", "checkpt", "turretTower", "doorway"], hpMul: 1.25, spdMul: 1.2 },
];
const FORTRESS: StageDef = { name: "ROBO FORTRESS", boss: BOSS_DEFS[0], theme: "fortress", chunks: ["start", "turretTower", "shieldBridge", "stairsGap", "twoLevel", "checkpt", "flyerCanyon", "doorway"], hpMul: 1.4, spdMul: 1.3 };

// ── hero sprite: a proper 27px-tall armoured robot boy (crest light, visor shine, a 3-tone
// shaded chest plate with a lit left edge and a shadowed right edge, chunky booted legs). Drawn
// a few px higher than the (unchanged) hitbox — see HERO_DRAW_DY — so the extra height never
// moves the feet off their footing.
const HERO_TOP = [
  "........kk.......", // crest light nub
  "........yy.......",
  "......kkkkk......", // helmet dome
  ".....kwwwwwk.....",
  "....kwwwwwwwk....",
  "....kw.hv.vwk....", // visor band + shine
  "....kwwwwwwwk....",
  ".....kkkkkkk.....", // chin
  "......klbnk......", // neck/collar, shaded
  "..klllbbbbbnnnk..", // broad shoulders — not a stick
  "..klllbbbbbnnnk..", // shoulder band reinforced
  "...kllbbbbbnnk...", // chest
  "..kllbbcbbnnkg...", // chest plate core (weapon colour) + chunky cannon root
  "..kllbbbbbnnkgg..", // cannon
  "..kllbbbbbnnkgh..", // cannon + muzzle shine
  "..kllbbbbbnnkg...", // cannon tapers back in
  "....klbbbbbnk....",
  ".....klbbbnk.....",
  "......klbnk......", // hip taper into legs
];
const LEGS_STAND = ["....kgg...ggk....", "...kgg.....ggk...", "...kgg.....ggk...", "...kgg.....ggk...", "...kyy.....yyk...", "...kyy.....yyk...", "....kk.....kk....", "....kkk...kkk...."];
const LEGS_RUN_A = ["....kgg..........", "...kgg....k......", "...kgg....gk.....", "...kg....ggk.....", "...ky...yyk......", "...k...yyk.......", "......kk.........", ".....kkkk........"];
const LEGS_RUN_B = [".....kgg.gk......", "....kgg...gk.....", "....kgg...gk.....", "....kyy...yk.....", "....kyy...yk.....", ".....kk...kk.....", ".................", "................."];
const LEGS_RUN_C = ["..........ggk....", "......k....ggk...", ".....kg....ggk...", ".....kgg....k....", "......kyy...ky...", ".......kyy...k...", ".........kk......", "........kkkk....."];
const LEGS_JUMP = [".....kgggggk.....", "....kgg...ggk....", "....kgg...ggk....", "....kgg...ggk....", "....kyy...yyk....", "....kyy...yyk....", ".....kk...kk.....", "....kkkk.kkkk...."];
const LEGS_HURT = ["....kg.......gk..", "...kgg.......gg..", "...kg.........k..", "...ky.........y..", "...ky.........y..", "....k.........k..", ".................", "................."];
const RUN_CYCLE = [LEGS_RUN_A, LEGS_RUN_B, LEGS_RUN_C, LEGS_RUN_B];
const heroPal = (c: string) => ({ k: PAL.black, w: PAL.white, v: PAL.cyan, b: PAL.blue, g: PAL.grey, y: PAL.yellow, c, h: PAL.white, r: shade(PAL.blue, 0.22), l: shade(PAL.blue, 0.26), n: shade(PAL.blue, -0.26) });
const heroSprite = (legs: string[], color: string) => spr([...HERO_TOP, ...legs], 17, heroPal(color));
// the sprite is drawn taller than the hitbox (HERO_H); this is how far above hero.y it starts so
// the boots stay planted on the same footing — never change HERO_W/HERO_H (the hitbox) for this
const HERO_DRAW_DY = HERO_TOP.length + LEGS_STAND.length - HERO_H;

// ── enemy sprites ── built procedurally (bake + a lit-from-upper-left shade + outlined) so a
// round shaded body is easy to get right and scale up, rather than hand-counted ASCII art. Each
// is drawn much bigger than its (unchanged) hitbox — see MOB_ANCHOR below for the offset that
// keeps the hitbox centred/grounded under the bigger picture.
const shadeAt = (nx: number, ny: number, mid: string, light: string, dark: string) => {
  const l = -nx * 0.6 - ny * 0.8;
  return l > 0.3 ? light : l < -0.3 ? dark : mid;
};
// a "Met"-style hard-hat walker: a riveted dome + flared brim over a red eye-slit, round body,
// two stubby feet that tuck together mid-hop
function bakeHopper(legsOut: boolean): Sprite {
  const w = 16, h = 16, cx = 8;
  return outlined(
    bake(w, h, (x, y) => {
      const dx = x + 0.5 - cx;
      if (y >= 1 && y <= 5) {
        const r = 3 + (y - 1) * 0.65;
        if (Math.abs(dx) <= r) return shadeAt(dx / 5, (y - 3) / 4, PAL.grey, shade(PAL.grey, 0.32), shade(PAL.grey, -0.22));
        return null;
      }
      if (y === 6) return Math.abs(dx) <= 7 ? (Math.abs(dx) > 5.3 ? shade(PAL.grey, -0.3) : shade(PAL.grey, 0.16)) : null;
      if (y === 7) return Math.abs(dx) <= 6.4 ? shade(PAL.grey, -0.36) : null;
      if (y >= 8 && y <= 9) {
        if (Math.abs(dx) > 5) return null;
        if (y === 8 && Math.abs(dx) <= 2.4) return PAL.red;
        return shade(PAL.grey, -0.12);
      }
      if (y >= 10 && y <= 13) {
        if (Math.abs(dx) <= 5.4) return shadeAt(dx / 5.4, (y - 11.5) / 2, PAL.grey, shade(PAL.grey, 0.26), shade(PAL.grey, -0.24));
        return null;
      }
      if (y >= 14 && y <= 15) {
        const off = legsOut ? 3.2 : 1.6;
        return Math.abs(dx - off) <= 1.5 || Math.abs(dx + off) <= 1.5 ? shade(PAL.grey, -0.3) : null;
      }
      return null;
    })
  );
}
const HOPPER = [bakeHopper(true), bakeHopper(false)];
// a hovering drone: a glassy dome sensor, a wide saucer body, and a propeller blade that visibly
// sweeps between the two animation frames
function bakeFlyer(spin: number): Sprite {
  const w = 20, h = 14, cx = 10, cy = 8;
  return outlined(
    bake(w, h, (x, y) => {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      // blurred propeller blade, rotating
      if (y <= 2) {
        const bx = cx + Math.cos(spin) * 7;
        const by = cy - 6 + Math.sin(spin) * 2.2;
        if (Math.hypot(x + 0.5 - bx, (y - 1) * 2 - by + cy - 6) < 1.6) return shade(PAL.dark, 0.1);
      }
      if (y >= 2 && y <= 3) {
        if (Math.abs(dx) <= 2.6) return null;
      }
      if (y >= 3 && y <= 8) {
        // saucer body: a wide flattened ellipse
        const ny = (y - 5.5) / 3.2;
        const r = 9 * Math.sqrt(Math.max(0, 1 - ny * ny));
        if (Math.abs(dx) <= r) {
          if (y <= 5 && Math.abs(dx) <= 4) return shade(PAL.cyan, 0.1); // sensor dome glass
          return shadeAt(dx / 9, ny, PAL.grey, shade(PAL.grey, 0.3), shade(PAL.grey, -0.24));
        }
      }
      if (y === 9 && Math.abs(dx) <= 6) return dx > -4 && dx < 4 ? PAL.red : null;
      if (y >= 10 && y <= 11) return Math.abs(dx) <= 2 ? shade(PAL.yellow, dy > 0 ? -0.1 : 0.2) : null;
      return null;
    })
  );
}
const FLYER = [bakeFlyer(0), bakeFlyer(Math.PI)];
// a stationary cannon turret: a bolted base, a hazard collar, a domed sensor eye
function bakeTurret(): Sprite {
  const w = 16, h = 18, cx = 8;
  return outlined(
    bake(w, h, (x, y) => {
      const dx = x + 0.5 - cx;
      if (y >= 0 && y <= 3) {
        const r = 2.5 + y * 0.6;
        if (Math.abs(dx) <= r) return shadeAt(dx / 4, (y - 2) / 3, PAL.dark, shade(PAL.dark, 0.3), shade(PAL.dark, -0.2));
        return null;
      }
      if (y >= 4 && y <= 5) return Math.abs(dx) <= 5 ? (Math.abs(dx) <= 2.4 ? PAL.red : shade(PAL.dark, -0.15)) : null;
      if (y >= 6 && y <= 11) {
        if (Math.abs(dx) <= 6) return shadeAt(dx / 6, (y - 8.5) / 3, PAL.dark, shade(PAL.dark, 0.26), shade(PAL.dark, -0.22));
        return null;
      }
      if (y >= 12 && y <= 13) return Math.abs(dx) <= 7 ? (y === 12 ? PAL.yellow : shade(PAL.yellow, -0.3)) : null;
      if (y >= 14 && y <= 16) return Math.abs(dx) <= 7.5 ? shadeAt(dx / 7.5, 0, PAL.grey, shade(PAL.grey, 0.2), shade(PAL.grey, -0.2)) : null;
      if (y === 17) return Math.abs(dx - 4) <= 1.5 || Math.abs(dx + 4) <= 1.5 ? PAL.black : null;
      return null;
    })
  );
}
const TURRET = bakeTurret();
// a spiked roller ball; a directional energy shield bubble is still drawn separately beside it
function bakeShield(roll: number): Sprite {
  const w = 18, h = 16, cx = 9, cy = 8;
  return outlined(
    bake(w, h, (x, y) => {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const spikeR = 7 + (Math.cos(a * 6 + roll) > 0.6 ? 1.6 : 0);
      if (d <= spikeR) {
        if (d > 6.2) return shade(PAL.dark, -0.1);
        if (Math.abs(dx) <= 4 && dy > -1 && dy < 3) return PAL.red;
        return shadeAt(dx / 6, dy / 6, PAL.grey, shade(PAL.grey, 0.3), shade(PAL.grey, -0.24));
      }
      return null;
    })
  );
}
const SHIELD = [bakeShield(0), bakeShield(Math.PI / 6)];
// a bright hit-flash twin of each frame — precomputed once, never rebuilt in draw
const HOPPER_FLASH = HOPPER.map((s) => tinted(s, PAL.white));
const FLYER_FLASH = FLYER.map((s) => tinted(s, PAL.white));
const TURRET_FLASH = tinted(TURRET, PAL.white);
const SHIELD_FLASH = SHIELD.map((s) => tinted(s, PAL.white));
// visual size is bigger than the (unchanged) hitbox; anchor = where to draw relative to m.x/m.y
// so the picture stays centred over / grounded on the real collision box
const MOB_ANCHOR: Record<MobKind, { dx: number; dy: number }> = {
  hopper: { dx: -4, dy: -8 },
  flyer: { dx: -4.5, dy: -4 },
  turret: { dx: -4, dy: -10 },
  shield: { dx: -4, dy: -7 },
};

type MobKind = "hopper" | "flyer" | "turret" | "shield";
interface Mob {
  kind: MobKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  hp: number;
  t: number;
  baseY: number;
  active: boolean;
  shieldUp: boolean;
  dead: number;
  flash: number;
}
interface Bullet { x: number; y: number; vx: number; vy: number; life: number; dmg: number; color: string; size: number; arc?: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
interface Pop { x: number; y: number; t: number; text: string }

function buildRun(def: StageDef, r: ReturnType<typeof rng>) {
  const rowsAll: string[] = new Array(ROWS).fill("");
  for (const name of def.chunks) {
    const ch = CH[name];
    const w = Math.max(...ch.map((row) => row.length));
    for (let row = 0; row < ROWS; row++) {
      const src = row < ROWS - ch.length ? "" : ch[row - (ROWS - ch.length)];
      rowsAll[row] += src.padEnd(w, ".").slice(0, w);
    }
  }
  const cols = rowsAll[0].length;
  const grid = rowsAll.map((row) => row.split(""));
  const mobs: Mob[] = [];
  let start = { x: 24, y: 150 };
  let checkpoint: { x: number; y: number } | null = null;
  let doorX = (cols - 2) * T;
  const mk = (kind: MobKind, hp: number, w: number, h: number, bx: number, by: number): Mob => ({ kind, x: bx, y: by, vx: 0, vy: 0, w, h, hp: Math.ceil(hp * def.hpMul), t: r.range(0, 40), baseY: by, active: false, shieldUp: false, dead: -1, flash: 0 });
  for (let row = 0; row < ROWS; row++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[row][c];
      const bx = c * T;
      const by = (row + 1) * T;
      if (ch === "S") start = { x: bx + 2, y: by - HERO_H };
      else if (ch === "h") mobs.push(mk("hopper", 2, 8, 8, bx + 2, by - 8));
      else if (ch === "f") mobs.push(mk("flyer", 2, 11, 6, bx, row * T + 8));
      else if (ch === "u") mobs.push(mk("turret", 3, 8, 8, bx + 2, by - 8));
      else if (ch === "s") mobs.push(mk("shield", 4, 10, 9, bx + 2, by - 9));
      else if (ch === "C") checkpoint = { x: bx, y: by - HERO_H };
      else if (ch === "D") doorX = Math.min(doorX, bx);
      else continue;
      if (ch !== "D") grid[row][c] = ".";
    }
  }
  return { def, grid, cols, mobs, start, checkpoint, doorX };
}
type RunState = ReturnType<typeof buildRun>;

function create(seed: number): GameInstance {
  const r = rng(seed);
  // ── persistent progress across the whole playthrough ──
  const defeated = [false, false, false, false];
  const unlocked = (): WeaponId[] => ["buster", ...WEAPON_BY_STAGE.filter((_, i) => defeated[i])];
  const ammo: Record<WeaponId, number> = { buster: 0, bubble: 0, leaf: 0, spark: 0, ice: 0 };
  let lives = 3;
  let over = false;
  let won = false;
  let tick = 0;
  let shakeT = 0;
  const shakeOffset = () => {
    if (shakeT <= 0) return { x: 0, y: 0 };
    return { x: (hash2(tick, 1) - 0.5) * shakeT, y: (hash2(tick, 2) - 0.5) * shakeT * 0.6 };
  };

  // ── scene machine ──
  type Scene = "select" | "run" | "boss";
  let scene: Scene = "select";
  let runCtx: "stage" | "fortress" = "stage";
  let stageIdx = 0;
  let rushIdx = 0;
  let finalBoss = false;
  let cursor = 0;

  // ── hero (shared across run & boss rooms) ──
  const hero = { x: 24, y: 150, vx: 0, vy: 0, w: HERO_W, h: HERO_H, hp: MAXHP, onGround: false, coyote: 0, buffer: 0, jumping: false, facing: 1, climbing: false, inv: 0, anim: 0, weaponIdx: 0, chargeT: 0, shootCd: 0, shootFlash: 0, dying: -1 };
  let run: RunState | null = null;
  let camX = 0;
  let doorTimer = 0;

  interface BossRoom { def: BossDef; baseDef: BossDef; hp: number; maxHp: number; x: number; y: number; baseX: number; baseY: number; t: number; dead: boolean; hitFlash: number }
  let boss: BossRoom | null = null;

  let shots: Bullet[] = [];
  let enemyShots: Bullet[] = [];
  let parts: Particle[] = [];
  let pops: Pop[] = [];

  const curWeapon = () => WEAPONS.find((w) => w.id === unlocked()[hero.weaponIdx])!;

  const burst = (x: number, y: number, n: number, color: string) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + tick * 0.3;
      parts.push({ x, y, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8 - 0.6, life: 22, color });
    }
  };
  const addScore = (io: IO, pts: number, x: number, y: number) => {
    io.score(pts);
    pops.push({ x, y, t: 0, text: String(pts) });
  };

  const resetRunLevel = (def: StageDef) => {
    run = buildRun(def, r);
    hero.x = run.start.x;
    hero.y = run.start.y;
    hero.vx = hero.vy = 0;
    hero.hp = MAXHP;
    hero.inv = 90;
    hero.climbing = false;
    hero.facing = 1;
    doorTimer = 0;
    shots = [];
    enemyShots = [];
    camX = 0;
  };

  const spawnBoss = (def: BossDef, hpMul: number) => {
    const maxHp = Math.ceil(26 * hpMul);
    boss = { def, baseDef: def, hp: maxHp, maxHp, x: W - 74, y: 100, baseX: W - 74, baseY: 100, t: 0, dead: false, hitFlash: 0 };
    hero.x = 30;
    hero.y = H - 32 - hero.h;
    hero.vx = hero.vy = 0;
    hero.hp = MAXHP;
    hero.inv = 90;
    shots = [];
    enemyShots = [];
  };

  const enterScene = (io: IO, s: Scene) => {
    scene = s;
    if (s === "run") resetRunLevel(runCtx === "stage" ? STAGES[stageIdx] : FORTRESS);
    else if (s === "boss") {
      if (runCtx === "stage") spawnBoss(STAGES[stageIdx].boss, 1);
      else if (finalBoss) spawnBoss(BOSS_DEFS[0], 1.8);
      else spawnBoss(BOSS_DEFS[rushIdx], 0.55);
    }
  };

  const hurtHero = (io: IO, dmg: number) => {
    if (hero.inv > 0 || hero.dying >= 0 || scene === "select") return;
    hero.hp -= dmg;
    hero.inv = 80;
    io.sfx.play("hurt");
    burst(hero.x + hero.w / 2, hero.y + hero.h / 2, 6, PAL.yellow);
    shakeT = Math.max(shakeT, 6);
    if (hero.hp <= 0) {
      hero.dying = 0;
      io.sfx.play("die");
    }
  };

  const respawn = () => {
    hero.dying = -1;
    hero.inv = 100;
    hero.vx = hero.vy = 0;
    hero.hp = MAXHP;
    if (scene === "run" && run) {
      const p = run.checkpoint ?? run.start;
      hero.x = p.x;
      hero.y = p.y;
    } else if (scene === "boss" && boss) {
      boss.hp = boss.maxHp;
      boss.t = 0;
      boss.def = boss.baseDef;
      hero.x = 30;
      hero.y = H - 32 - hero.h;
      enemyShots = [];
    }
  };

  const fireHero = (io: IO) => {
    const inp = io.input;
    const w = curWeapon();
    if (w.id === "buster") {
      if (inp.held.b) {
        const wasBig = hero.chargeT >= 42;
        const wasCharging = hero.chargeT > 18;
        hero.chargeT = Math.min(70, hero.chargeT + 1);
        if (!wasCharging && hero.chargeT > 18) io.sfx.tone(560, 7, "square", 0.08);
        if (!wasBig && hero.chargeT >= 42) io.sfx.tone(980, 9, "square", 0.1);
        if (hero.chargeT > 18 && tick % 4 === 0) {
          const a = hash2(tick, 3) * Math.PI * 2;
          const gx = hero.x + (hero.facing > 0 ? hero.w : 0);
          const big = hero.chargeT >= 42;
          parts.push({ x: gx + Math.cos(a) * (big ? 9 : 6), y: hero.y + 11 + Math.sin(a) * (big ? 9 : 6), vx: -Math.cos(a) * (big ? 0.8 : 0.5), vy: -Math.sin(a) * (big ? 0.8 : 0.5), life: 10, color: big ? PAL.white : PAL.cyan });
        }
      } else if (hero.chargeT > 0) {
        const big = hero.chargeT >= 42;
        const ox = hero.x + (hero.facing > 0 ? hero.w : -4);
        shots.push({ x: ox, y: hero.y + 11, vx: hero.facing * (big ? 4.2 : 3.4), vy: 0, life: 70, dmg: big ? 3 : 1, color: big ? PAL.cyan : PAL.yellow, size: big ? 6 : 4 });
        // a short muzzle streak trailing the new shot — juice, not a hitbox
        for (let i = 1; i <= 3; i++) parts.push({ x: ox - hero.facing * i * 2, y: hero.y + 11, vx: 0, vy: 0, life: 5, color: big ? PAL.cyan : PAL.yellow });
        io.sfx.play("shoot");
        if (big) io.sfx.tone(1400, 10, "square", 0.12);
        hero.chargeT = 0;
        hero.shootFlash = 6;
      }
      return;
    }
    hero.shootCd = Math.max(0, hero.shootCd - 1);
    if (inp.held.b && hero.shootCd === 0 && ammo[w.id] >= w.cost) {
      ammo[w.id] -= w.cost;
      hero.shootCd = 13;
      const ox = hero.x + (hero.facing > 0 ? hero.w : -4);
      for (const a of w.angles) shots.push({ x: ox, y: hero.y + 11, vx: hero.facing * w.speed * Math.cos(a), vy: w.speed * Math.sin(a), life: 70, dmg: w.dmg, color: w.color, size: 5, arc: w.arc });
      io.sfx.play(weaponSfx(w.id));
      hero.shootFlash = 6;
    }
  };
  const regenAmmo = () => {
    for (const w of WEAPONS) if (w.id !== "buster") ammo[w.id] = Math.min(AMMO_MAX, ammo[w.id] + 0.12);
  };
  const cycleWeapon = (io: IO, onLadder: boolean) => {
    if (io.input.pressed.up && !onLadder) {
      const list = unlocked();
      hero.weaponIdx = (hero.weaponIdx + 1) % list.length;
      io.sfx.play("blip");
    }
  };

  // ── run-mode tile collision (same shape as a classic platformer) ──
  const tileAt = (px: number, py: number) => {
    if (!run) return ".";
    const c = Math.floor(px / T);
    const row = Math.floor(py / T);
    if (c < 0 || c >= run.cols) return "#";
    if (row < 0 || row >= ROWS) return ".";
    return run.grid[row][c];
  };
  const solidAt = (px: number, py: number) => SOLID.has(tileAt(px, py));
  const moveX = (e: { x: number; y: number; w: number; h: number }, dx: number) => {
    e.x += dx;
    if (dx > 0) {
      const right = e.x + e.w - 0.01;
      if (solidAt(right, e.y + 2) || solidAt(right, e.y + e.h - 2)) {
        e.x = Math.floor(right / T) * T - e.w;
        return true;
      }
    } else if (dx < 0) {
      if (solidAt(e.x, e.y + 2) || solidAt(e.x, e.y + e.h - 2)) {
        e.x = (Math.floor(e.x / T) + 1) * T;
        return true;
      }
    }
    return false;
  };
  const moveY = (e: { x: number; y: number; w: number; h: number }, dy: number) => {
    e.y += dy;
    if (dy >= 0) {
      const bottom = e.y + e.h;
      if (solidAt(e.x + 1, bottom) || solidAt(e.x + e.w - 1, bottom)) {
        e.y = Math.floor(bottom / T) * T - e.h;
        return 1;
      }
    } else if (solidAt(e.x + 1, e.y) || solidAt(e.x + e.w - 1, e.y)) {
      e.y = (Math.floor(e.y / T) + 1) * T;
      return -1;
    }
    return 0;
  };

  const STAGE_SPD = () => (run ? run.def.spdMul : 1);

  const updateRun = (io: IO) => {
    if (!run) return;
    const lvl = run;
    const inp = io.input;
    if (hero.dying >= 0) {
      hero.dying++;
      hero.vy += GRAV;
      hero.y += hero.vy;
      if (hero.dying > 70) {
        lives--;
        if (lives <= 0) {
          over = true;
          io.gameOver();
          return;
        }
        respawn();
      }
      return;
    }
    const onLadder = tileAt(hero.x + hero.w / 2, hero.y + hero.h / 2) === "H";
    cycleWeapon(io, onLadder);
    if (onLadder && (inp.held.up || inp.held.down)) {
      hero.climbing = true;
      hero.vy = 0;
      hero.vx = 0;
      hero.y += (inp.held.up ? -1 : 1) * 1.3;
      hero.x += (Math.floor((hero.x + hero.w / 2) / T) * T + T / 2 - hero.w / 2 - hero.x) * 0.4;
      hero.onGround = false;
      if (inp.pressed.a) {
        hero.climbing = false;
        hero.vy = -3.6;
      }
    } else {
      hero.climbing = onLadder && hero.climbing && !inp.pressed.a;
      const maxV = 1.8;
      if (inp.held.left && !inp.held.right) {
        hero.vx = Math.max(-maxV, hero.vx - 0.22);
        hero.facing = -1;
      } else if (inp.held.right && !inp.held.left) {
        hero.vx = Math.min(maxV, hero.vx + 0.22);
        hero.facing = 1;
      } else hero.vx *= 0.8;
      if (Math.abs(hero.vx) < 0.05) hero.vx = 0;
      hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
      hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
      if (hero.buffer > 0 && hero.coyote > 0 && !hero.climbing) {
        hero.vy = -6.1;
        hero.buffer = 0;
        hero.coyote = 0;
        hero.jumping = true;
        io.sfx.play("jump");
      }
      if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
      if (!hero.climbing) hero.vy = Math.min(MAXFALL, hero.vy + GRAV);
      if (moveX(hero, hero.vx)) hero.vx = 0;
      hero.anim += Math.abs(hero.vx) * 0.1;
      const wasGround = hero.onGround;
      const fallSpeed = hero.vy;
      hero.onGround = false;
      const res = moveY(hero, hero.vy);
      if (res === 1) {
        hero.vy = 0;
        hero.onGround = true;
        hero.jumping = false;
        if (!wasGround && fallSpeed > 3.2) {
          io.sfx.play("thud");
          burst(hero.x + hero.w / 2, hero.y + hero.h, 5, PAL.grey);
        }
      } else if (res === -1) hero.vy = 0.5;
      if (hero.onGround && Math.abs(hero.vx) > 0.4 && tick % 7 === 0) {
        const gth = THEMES[lvl.def.theme];
        parts.push({ x: hero.x + (hero.facing > 0 ? 2 : hero.w - 3), y: hero.y + hero.h - 1, vx: -hero.facing * 0.4, vy: -0.3, life: 12, color: gth.groundDark });
        if (tick % 14 === 0) io.sfx.play("step");
      }
    }
    fireHero(io);
    regenAmmo();
    hero.inv = Math.max(0, hero.inv - 1);
    hero.shootFlash = Math.max(0, hero.shootFlash - 1);
    // pellets + checkpoint
    for (const [px, py] of [
      [hero.x + 2, hero.y + 2],
      [hero.x + hero.w - 2, hero.y + hero.h - 2],
    ]) {
      const c = Math.floor(px / T);
      const row = Math.floor(py / T);
      if (lvl.grid[row]?.[c] === "e") {
        lvl.grid[row][c] = ".";
        hero.hp = Math.min(MAXHP, hero.hp + 6);
        io.sfx.play("coin");
        burst(c * T + 8, row * T + 8, 5, PAL.lime);
      } else if (lvl.grid[row]?.[c] === "C") {
        lvl.checkpoint = { x: c * T, y: (row + 1) * T - HERO_H };
        lvl.grid[row][c] = ".";
        io.sfx.play("pickup");
      }
    }
    if (hero.y > H + 20) hurtHero(io, MAXHP);
    // a sparse factory-floor rumble so night stages feel alive without ever looping every frame
    if ((lvl.def.theme === "factory" || lvl.def.theme === "fortress") && tick % 220 === 0) io.sfx.noise?.(45, 0.045, 70, 110);
    // door
    const nearDoor = Math.abs(hero.x + hero.w - lvl.doorX) < 12 && hero.onGround;
    doorTimer = nearDoor ? doorTimer + 1 : Math.max(0, doorTimer - 2);
    if (doorTimer > 35) {
      io.sfx.play("powerup");
      enterScene(io, "boss");
      return;
    }
    // camera
    const target = clamp(hero.x - W / 2 + 20 * hero.facing, 0, lvl.cols * T - W);
    camX += (target - camX) * 0.12;
    camX = clamp(camX, 0, lvl.cols * T - W);

    // mobs
    const hb = { x: hero.x, y: hero.y, w: hero.w, h: hero.h };
    for (const m of lvl.mobs) {
      if (!m.active) {
        if (m.x < camX + W + 20) m.active = true;
        else continue;
      }
      m.t++;
      if (m.flash > 0) m.flash--;
      if (m.dead >= 0) {
        m.dead--;
        continue;
      }
      if (m.x < camX - 60) continue;
      const spd = 0.5 * STAGE_SPD();
      if (m.kind === "hopper") {
        m.vy = Math.min(MAXFALL, m.vy + GRAV);
        if (moveY(m, m.vy) !== 0) {
          m.vy = 0;
          if (m.t % 55 === 0) {
            m.vy = -3.4;
            m.vx = (hero.x < m.x ? -1 : 1) * spd * 2;
          }
        }
        moveX(m, m.vx);
      } else if (m.kind === "flyer") {
        m.y = m.baseY + Math.sin((m.t + m.x) * 0.05) * 14;
        m.x -= spd * 1.2;
        if (m.t % 140 === 0) enemyShots.push({ x: m.x, y: m.y + 4, vx: 0, vy: 2, life: 160, dmg: 3, color: PAL.red, size: 5 });
      } else if (m.kind === "turret") {
        if (m.t % 110 === 0 && Math.abs(m.x - hero.x) < 140) {
          const a = Math.atan2(hero.y - m.y, hero.x - m.x);
          enemyShots.push({ x: m.x, y: m.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 180, dmg: 3, color: PAL.red, size: 5 });
          io.sfx.play("laser");
        }
      } else if (m.kind === "shield") {
        m.shieldUp = Math.floor(m.t / 90) % 2 === 0;
        m.vx = m.t % 220 < 110 ? -spd : spd;
        if (moveX(m, m.vx)) m.vx = -m.vx;
      }
      if (overlap(hb, { x: m.x, y: m.y, w: m.w, h: m.h })) hurtHero(io, m.kind === "turret" ? 2 : 3);
    }
    // hero shots vs mobs
    for (const s of shots) {
      for (const m of lvl.mobs) {
        if (m.active && m.dead < 0 && overlap({ x: s.x, y: s.y, w: s.size, h: s.size }, { x: m.x, y: m.y, w: m.w, h: m.h })) {
          if (m.kind === "shield" && m.shieldUp && Math.sign(s.vx) === (hero.facing >= 0 ? 1 : -1)) {
            io.sfx.play("blip");
            s.life = 0;
            continue;
          }
          m.hp -= s.dmg;
          s.life = 0;
          m.flash = 6;
          io.sfx.play("hit");
          if (m.hp <= 0) {
            m.dead = 20;
            burst(m.x + m.w / 2, m.y + m.h / 2, 8, PAL.white);
            addScore(io, 150, m.x, m.y - 6);
            io.sfx.play("explode");
          }
        }
      }
    }
    lvl.mobs = lvl.mobs.filter((m) => m.dead !== 0);
  };

  const updateBossPhase = (io: IO) => {
    if (!boss) return;
    const bs = boss;
    const inp = io.input;
    if (hero.dying >= 0) {
      hero.dying++;
      hero.vy += GRAV;
      hero.y += hero.vy;
      if (hero.dying > 70) {
        lives--;
        if (lives <= 0) {
          over = true;
          io.gameOver();
          return;
        }
        respawn();
      }
      return;
    }
    cycleWeapon(io, false);
    const maxV = 1.6;
    if (inp.held.left && !inp.held.right) {
      hero.vx = Math.max(-maxV, hero.vx - 0.25);
      hero.facing = -1;
    } else if (inp.held.right && !inp.held.left) {
      hero.vx = Math.min(maxV, hero.vx + 0.25);
      hero.facing = 1;
    } else hero.vx *= 0.8;
    hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
    hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
    if (hero.buffer > 0 && hero.coyote > 0) {
      hero.vy = -5.8;
      hero.buffer = 0;
      hero.coyote = 0;
      hero.jumping = true;
      io.sfx.play("jump");
    }
    if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
    hero.vy = Math.min(MAXFALL, hero.vy + GRAV);
    hero.x = clamp(hero.x + hero.vx, 16, W - 16 - hero.w);
    hero.anim += Math.abs(hero.vx) * 0.1;
    hero.y += hero.vy;
    const groundY = H - 32 - hero.h;
    hero.onGround = false;
    if (hero.y >= groundY) {
      hero.y = groundY;
      hero.vy = 0;
      hero.onGround = true;
      hero.jumping = false;
    }
    const introT = 55;
    if (bs.t >= introT) fireHero(io);
    regenAmmo();
    hero.inv = Math.max(0, hero.inv - 1);
    hero.shootFlash = Math.max(0, hero.shootFlash - 1);

    // boss move + fire (final boss swaps its attack pattern every 220 frames through the ring)
    bs.t++;
    if (bs.t === 1) io.sfx.slide?.(240, 760, 45, "sawtooth", 0.07);
    bs.hitFlash = Math.max(0, bs.hitFlash - 1);
    if (finalBoss) bs.def = BOSS_DEFS[Math.floor(bs.t / 220) % 4];
    if (bs.t >= introT) {
      bs.x = bs.baseX + Math.sin(bs.t * 0.014) * 22;
      bs.y = bs.baseY + Math.sin(bs.t * 0.03) * 10;
      if (!bs.dead && bs.t % bs.def.cooldown === 0) {
        for (const s of bs.def.fire(bs, hero, bs.t)) enemyShots.push({ x: bs.x, y: bs.y, vx: s.vx, vy: s.vy, life: 220, dmg: 4, color: bs.def.accent, size: 5, arc: s.arc });
        io.sfx.play("laser");
      }
      if (!bs.dead && overlap({ x: hero.x, y: hero.y, w: hero.w, h: hero.h }, { x: bs.x - 18, y: bs.y - 18, w: 36, h: 36 })) hurtHero(io, 4);
    }

    // bullets
    for (const s of shots) {
      if (s.arc) s.vy += 0.05;
      s.x += s.vx;
      s.y += s.vy;
      s.life--;
      if (!bs.dead && bs.t >= introT && overlap({ x: s.x, y: s.y, w: s.size, h: s.size }, { x: bs.x - 18, y: bs.y - 18, w: 36, h: 36 })) {
        const mult = curWeapon().id === bs.def.weak ? 2.5 : 1;
        bs.hp -= s.dmg * mult;
        s.life = 0;
        bs.hitFlash = 5;
        shakeT = Math.max(shakeT, mult > 1 ? 5 : 2);
        io.sfx.play("hit");
        if (bs.hp <= 0) bossDefeated(io);
      }
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) s.life = 0;
    }
    for (const s of enemyShots) {
      if (s.arc) s.vy += 0.05;
      s.x += s.vx;
      s.y += s.vy;
      s.life--;
      if (overlap({ x: s.x, y: s.y, w: s.size, h: s.size }, { x: hero.x, y: hero.y, w: hero.w, h: hero.h })) {
        s.life = 0;
        hurtHero(io, s.dmg);
      }
      if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) s.life = 0;
    }
  };

  const bossDefeated = (io: IO) => {
    if (!boss || boss.dead) return;
    const bs = boss;
    bs.dead = true;
    for (let i = 0; i < 4; i++) burst(bs.x + r.range(-10, 10), bs.y + r.range(-10, 10), 10, PAL.white);
    io.sfx.play("explode");
    shakeT = Math.max(shakeT, 16);
    if (runCtx === "stage") {
      defeated[stageIdx] = true;
      addScore(io, 2000, bs.x, bs.y);
      hero.weaponIdx = 0;
      scene = "select";
    } else if (finalBoss) {
      addScore(io, 8000 + lives * 1000, bs.x, bs.y);
      won = true;
      io.sfx.play("cheer");
      io.win();
    } else {
      addScore(io, 1200, bs.x, bs.y);
      rushIdx++;
      if (rushIdx < 4) spawnBoss(BOSS_DEFS[rushIdx], 0.55);
      else {
        finalBoss = true;
        spawnBoss(BOSS_DEFS[0], 1.8);
      }
    }
  };

  const NEIGH: Record<number, Partial<Record<"left" | "right" | "up" | "down", number>>> = {
    0: { right: 1, down: 2 },
    1: { left: 0, down: 3 },
    2: { up: 0, right: 3, down: 4 },
    3: { up: 1, left: 2, down: 4 },
    4: { up: 2 },
  };
  const updateSelect = (io: IO) => {
    const inp = io.input;
    for (const dir of ["left", "right", "up", "down"] as const) {
      if (inp.pressed[dir] && NEIGH[cursor][dir] !== undefined) {
        cursor = NEIGH[cursor][dir]!;
        io.sfx.play("blip");
      }
    }
    if (inp.pressed.a) {
      if (cursor < 4) {
        stageIdx = cursor;
        runCtx = "stage";
        finalBoss = false;
        io.sfx.play("select");
        enterScene(io, "run");
      } else if (defeated.every(Boolean)) {
        runCtx = "fortress";
        rushIdx = 0;
        finalBoss = false;
        io.sfx.play("select");
        enterScene(io, "run");
      } else io.sfx.play("blip");
    }
  };

  const updateFx = () => {
    shakeT = Math.max(0, shakeT - 1);
    shots = shots.filter((s) => s.life > 0);
    enemyShots = enemyShots.filter((s) => s.life > 0);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life--;
    }
    parts = parts.filter((p) => p.life > 0);
    for (const p of pops) p.t++;
    pops = pops.filter((p) => p.t < 40);
  };

  return {
    update(io: IO) {
      if (over || won) return;
      tick++;
      if (scene === "select") updateSelect(io);
      else if (scene === "run") updateRun(io);
      else if (scene === "boss") updateBossPhase(io);
      updateFx();
    },

    draw(g: Gfx) {
      if (scene === "select") drawSelect(g);
      else if (scene === "run") drawRun(g);
      else if (scene === "boss") drawBossRoom(g);
      if (scene !== "select") drawHUD(g);
      if (over) {
        g.rect(0, 90, W, 30, "rgba(13,11,26,0.75)");
        g.text("GAME OVER", W / 2, 100, PAL.red, { align: "center", size: 2 });
      }
    },
  };

  function drawSelect(g: Gfx) {
    g.clear(PAL.night);
    for (let i = 0; i < 16; i++) g.rect((i * 37 + Math.floor(tick * 0.1)) % (W + 10) - 5, (i * 53) % 190 + 4, 1, 1, "#ffffff44");
    g.text("ROBO RUNNER", W / 2, 4, PAL.white, { align: "center", size: 2 });
    g.text("PICK YOUR BOSS", W / 2, 20, PAL.grey, { align: "center" });
    const pos = [
      { x: 16, y: 32 },
      { x: 136, y: 32 },
      { x: 16, y: 110 },
      { x: 136, y: 110 },
    ];
    STAGES.forEach((s, i) => {
      const p = pos[i];
      const sel = cursor === i;
      const th = THEMES[s.theme];
      g.rect(p.x, p.y, 104, 74, th.ground);
      g.rect(p.x + 3, p.y + 3, 98, 68, th.sky[0]);
      g.rect(p.x + 3, p.y + 46, 98, 25, th.sky[1]);
      g.box(p.x, p.y, 104, 74, sel && Math.floor(tick / 8) % 2 ? PAL.yellow : th.blockLight);
      for (const [cx, cy] of [
        [p.x, p.y],
        [p.x + 98, p.y],
        [p.x, p.y + 68],
        [p.x + 98, p.y + 68],
      ])
        g.rect(cx, cy, 6, 6, th.blockLight);
      g.sprite(bossIcon(s.boss), p.x + 40, p.y + 6, { scale: 3 });
      g.rect(p.x + 3, p.y + 46, 98, 1, PAL.black);
      g.text(`STAGE ${i + 1}`, p.x + 52, p.y + 49, PAL.grey, { align: "center" });
      g.text(s.boss.name, p.x + 52, p.y + 59, defeated[i] ? PAL.lime : PAL.white, { align: "center" });
      if (defeated[i]) g.text("★ CLEARED ★", p.x + 52, p.y + 68, PAL.yellow, { align: "center" });
    });
    const fp = { x: 16, y: 192 };
    const ready = defeated.every(Boolean);
    g.rect(fp.x, fp.y, 224, 28, ready ? "#3a1b6a" : "#201830");
    g.box(fp.x, fp.y, 224, 28, cursor === 4 && ready && Math.floor(tick / 8) % 2 ? PAL.yellow : ready ? PAL.purple : PAL.dark);
    g.text(ready ? "★ ROBO FORTRESS — FINAL CHALLENGE ★" : "ROBO FORTRESS — LOCKED", W / 2, 206, ready ? PAL.white : PAL.grey, { align: "center" });
  }

  function drawRun(g: Gfx) {
    if (!run) return;
    const d = run.def;
    const th = THEMES[d.theme];
    const cam = Math.round(camX);
    drawBG(g, th, cam, tick);
    const shk = shakeOffset();
    g.camera(cam + shk.x, shk.y);
    const c0 = Math.floor(cam / T);
    for (let row = 0; row < ROWS; row++) {
      for (let c = c0; c <= c0 + W / T + 1 && c < run.cols; c++) {
        const ch = run.grid[row][c];
        if (ch === ".") continue;
        const x = c * T;
        const y = row * T;
        if (ch === "#" || ch === "=") drawTile(g, th, ch, x, y);
        else if (ch === "H") {
          g.rect(x + 5, y, 2, T, PAL.grey);
          g.rect(x + 9, y, 2, T, PAL.grey);
          g.rect(x + 3, y + 7, 10, 2, PAL.grey);
        } else if (ch === "e") {
          // an energy orb, not a flat square: a soft glow halo, a shaded shell and a bright shine
          const bob = Math.sin((tick + c * 9) * 0.1) * 2;
          const ex = x + 8, ey = y + 8 + bob;
          g.alpha(0.22);
          g.circle(ex, ey, 6.5, PAL.lime);
          g.alpha(1);
          g.circle(ex, ey, 4.4, shade(PAL.lime, -0.22));
          g.circle(ex, ey, 3.5, PAL.lime);
          g.circle(ex - 1.2, ey - 1.3, 1.5, PAL.white);
          g.circle(ex + 1.4, ey + 1.2, 0.9, shade(PAL.lime, 0.3));
        } else if (ch === "C") {
          g.rect(x + 7, y - 20, 2, 20, PAL.grey);
          g.circle(x + 8, y - 24, 6, run.checkpoint ? PAL.lime : PAL.dark);
        } else if (ch === "D") {
          const above = row > 0 ? run.grid[row - 1][c] : ".";
          if (above !== "D") g.rect(x - 1, y - 2, T + 2, 4, PAL.yellow);
          g.rect(x, y, T, T, "#8a3a3a");
          g.rect(x + 2, y + 2, T - 4, T - 4, "#c45a5a");
        }
      }
    }
    for (const m of run.mobs) {
      if (!m.active || m.dead === 0) continue;
      const f = Math.floor(m.t / 8) % 2;
      if (m.dead > 0) {
        g.circle(m.x + m.w / 2, m.y + m.h / 2, (20 - m.dead) * 0.6, PAL.white);
        continue;
      }
      const flashOn = m.flash > 0 && Math.floor(m.flash / 2) % 2 === 1;
      const an = MOB_ANCHOR[m.kind];
      if (m.kind === "hopper") g.sprite(flashOn ? HOPPER_FLASH[f] : HOPPER[f], m.x + an.dx, m.y + an.dy, { flipX: m.vx > 0 });
      else if (m.kind === "flyer") g.sprite(flashOn ? FLYER_FLASH[f] : FLYER[f], m.x + an.dx, m.y + an.dy);
      else if (m.kind === "turret") g.sprite(flashOn ? TURRET_FLASH : TURRET, m.x + an.dx, m.y + an.dy);
      else {
        g.sprite(flashOn ? SHIELD_FLASH[f] : SHIELD[f], m.x + an.dx, m.y + an.dy, { flipX: m.vx > 0 });
        g.circle(m.x + (m.vx >= 0 ? m.w + 3 : -3), m.y + m.h / 2, 5, m.shieldUp ? PAL.cyan : "#3a3f5a");
      }
    }
    for (const s of shots) g.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size, s.color);
    for (const s of enemyShots) g.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size, s.color);
    drawHero(g);
    for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
    for (const p of pops) g.text(p.text, p.x - cam, p.y - p.t * 0.6, PAL.white);
    g.camera(0, 0);
    if (tick < 90) {
      g.rect(0, 60, W, 20, "rgba(13,11,26,0.6)");
      g.text(d.name, W / 2, 65, PAL.white, { align: "center" });
    }
  }

  function drawBossRoom(g: Gfx) {
    if (!boss) return;
    const bs = boss;
    const th = THEMES[runCtx === "stage" ? STAGES[stageIdx].theme : "fortress"];
    const night = th.id === "factory" || th.id === "fortress";
    const art = themeArt(th);
    const introT = 55;
    // arena: a baked sky + a slow-drifting skyline behind riveted side walls, a hazard-striped
    // floor and the shutter door the hero came in through (never a flat colour box)
    g.clear(th.sky[0]);
    g.sprite(art.sky, 0, 0);
    drawSkyDecor(g, th, night, tick);
    drawStrip(g, art.skyline, tick * 0.03, 150 - art.skylineH, W);
    g.alpha(0.5);
    g.rect(0, 20, W, H - 52, th.sky[1]);
    g.alpha(1);
    for (let x = 0; x < W; x += T) drawTile(g, th, "#", x, H - 32);
    g.rect(0, 20, 10, H - 52, th.groundDark);
    g.rect(W - 10, 20, 10, H - 52, th.groundDark);
    for (let ry = 24; ry < H - 36; ry += 14) {
      g.rect(2, ry, 2, 2, th.blockLight);
      g.rect(W - 8, ry, 2, 2, th.blockLight);
    }
    g.rect(2, H - 62, 14, 30, "#8a3a3a");
    g.rect(4, H - 60, 10, 26, "#c45a5a");
    // vertical health bar, classic style
    const hbX = W - 22;
    const hbY0 = 26;
    const hbH = H - 66;
    g.rect(hbX, hbY0 - 2, 10, hbH + 4, PAL.black);
    const fillH = hbH * clamp(bs.hp / bs.maxHp, 0, 1);
    g.rect(hbX + 1, hbY0 + (hbH - fillH), 8, fillH, bs.def.accent);
    for (let i = 1; i < 10; i++) g.rect(hbX, hbY0 + (i * hbH) / 10, 10, 1, PAL.black);
    const shk = shakeOffset();
    g.camera(shk.x, shk.y);
    const bossSprite = bs.hitFlash > 0 && Math.floor(bs.hitFlash / 2) % 2 ? BOSS_ICON_FLASH[bs.def.id] : bossIcon(bs.def);
    if (bs.t < introT) {
      const s = 3 + Math.sin(bs.t * 0.3) * 0.5;
      g.sprite(bossSprite, bs.x - 18, bs.y - 18, { scale: s, flipX: true });
      g.rect(0, 96, W, 24, "rgba(13,11,26,0.75)");
      g.text(bs.def.name, W / 2, 100, PAL.white, { align: "center", size: 2 });
      g.text(finalBoss ? "FINAL BOSS" : runCtx === "fortress" ? `BOSS RUSH ${rushIdx + 1}/4` : "STAGE BOSS", W / 2, 113, PAL.yellow, { align: "center" });
    } else if (!bs.dead) {
      const flash = bs.t % bs.def.cooldown >= bs.def.cooldown - 14;
      g.sprite(bossSprite, bs.x - 18, bs.y - 18, { scale: 3, flipX: bs.x < hero.x });
      if (flash && Math.floor(tick / 4) % 2) g.circle(bs.x, bs.y, 22, "#ffffff55");
    }
    for (const s of shots) g.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size, s.color);
    for (const s of enemyShots) g.circle(s.x, s.y, s.size, s.color);
    drawHero(g);
    for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
    for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.6, PAL.white);
    g.camera(0, 0);
    if (bs.t >= introT) {
      if (finalBoss) g.text("FINAL BOSS!", W / 2, 10, PAL.red, { align: "center" });
      else if (runCtx === "fortress") g.text(`BOSS RUSH ${rushIdx + 1}/4`, W / 2, 10, PAL.orange, { align: "center" });
      else g.text(bs.def.name, W / 2, 10, PAL.white, { align: "center" });
    }
  }

  function drawHero(g: Gfx) {
    if (hero.dying >= 0 && Math.floor(hero.dying / 3) % 2) return;
    if (hero.inv > 0 && Math.floor(hero.inv / 3) % 2) return;
    let legs: string[];
    if (hero.dying >= 0) legs = LEGS_HURT;
    else if (hero.climbing) legs = Math.floor(hero.anim * 4) % 2 ? LEGS_RUN_A : LEGS_RUN_B;
    else if (!hero.onGround) legs = LEGS_JUMP;
    else if (Math.abs(hero.vx) > 0.1) legs = RUN_CYCLE[Math.floor(hero.anim) % RUN_CYCLE.length];
    else legs = LEGS_STAND;
    const color = curWeapon().color;
    g.sprite(heroSprite(legs, color), hero.x - 2, hero.y - HERO_DRAW_DY, { flipX: hero.facing < 0 });
    // muzzle flash + charge glow track the cannon tip on the taller sprite, not the hitbox
    const cannonY = hero.y - HERO_DRAW_DY + 14;
    if (hero.shootFlash > 0) {
      const fx = hero.x + (hero.facing > 0 ? hero.w + 1 : -6);
      g.rect(fx, cannonY - 2, 5, 5, PAL.yellow);
      g.rect(fx + 1, cannonY - 1, 3, 3, PAL.white);
    }
    if (hero.chargeT >= 42) g.circle(hero.x + (hero.facing > 0 ? hero.w + 2 : -2), cannonY, 4, PAL.cyan);
  }

  function drawHUD(g: Gfx) {
    // a framed metal console panel, not a flat bar: a seamed plate with corner bolts and a
    // bright accent edge
    g.rect(0, 0, W, 13, "rgba(13,11,26,0.82)");
    g.rect(0, 11, W, 1, PAL.cyan);
    g.alpha(0.5);
    g.rect(0, 11, W, 1, "rgba(0,0,0,0.5)");
    g.alpha(1);
    g.rect(0, 12, W, 1, PAL.black);
    for (let bx = 4; bx < W; bx += 40) g.rect(bx, 1, 1, 1, "#ffffff33");
    g.rect(2, 2, 9, 9, PAL.navy);
    g.box(2, 2, 9, 9, PAL.black);
    g.circle(6, 6, 2, PAL.cyan);
    g.text(`x${lives}`, 13, 2, PAL.white);
    g.box(27, 1, 34, 10, PAL.black);
    g.rect(28, 3, 32, 6, PAL.dark);
    g.rect(28, 3, 32 * clamp(hero.hp / MAXHP, 0, 1), 6, hero.hp > MAXHP * 0.3 ? PAL.lime : PAL.red);
    const w = curWeapon();
    g.rect(66, 3, 6, 6, w.color);
    g.box(66, 3, 6, 6, PAL.black);
    g.text(w.name, 75, 2, w.color);
    if (w.id !== "buster") {
      g.box(113, 1, 30, 10, PAL.black);
      g.rect(114, 3, 28, 6, PAL.dark);
      g.rect(114, 3, 28 * clamp(ammo[w.id] / AMMO_MAX, 0, 1), 6, w.color);
    }
    g.text(`${defeated.filter(Boolean).length}/4`, W - 4, 2, PAL.yellow, { align: "right" });
  }
}

export const roboRunner: RetroGameDef = {
  id: "robo-runner",
  title: "Robo Runner",
  blurb: "Pick a boss, blast through its themed stage, and steal its weapon!",
  genre: "Action",
  emoji: "🤖",
  color: "#3c6cf0",
  controls: "◀ ▶ run · A jump (tap = short hop) · hold B shoot (buster charges!) · ▲/▼ climb ladders · ▲ off a ladder cycles weapon",
  pad: { dpad: "4", a: "Jump", b: "Shoot" },
  create,
};
