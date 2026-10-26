// PUNCH CHAMP — an original cartoon boxing game in the spirit of the classic ring fighters,
// but kid-friendly: big puffy gloves, silly animal opponents, "BOINK!" and stars instead of
// injuries. Behind-the-player view: your boxer (back view) at the bottom, the opponent big
// in the middle of the ring. Watch for the "tell" (a wind-up, a flash, an eyebrow wiggle)
// before every attack, then dodge (◀ ▶) or block (▼) it and counter-punch (A/B) while the
// opponent is open. Fill the star meter by dodging well, then ▲+A unleashes a Star Punch.
// Win 3 rounds by knockdown or on points to move on; beat the big-hearted champ to win it all.
// (Original game in the spirit of 8-bit boxing classics — no real people or trademarks.)
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type Input, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeShadow, bayer, drawStrip, hash2, mixHex, ramp, shade } from "../art";

const PLAYER_MAX = 100;
const ROUND_FRAMES = 60 * 40; // 40s rounds — plenty of time, clock stops during a knockdown
const ROUNDS = 3;
const STAR_MAX = 100;
const DIZZY_FRAMES = 70;
const DOWN_TICK = 22; // frames per referee count (1..10)
const PUNCH_COOL = 16;
const UPPER_COOL = 26;
const PUNCH_ANIM = 14;
const UPPER_ANIM = 20;
const PUNCH_DMG = 9;
const UPPER_DMG = 13;
const STAR_DMG = 34;
const OPEN_MULT = 1.8;
const DIZZY_MULT = 2.2;
const BASE_OPP_DMG = 13;
const DODGE_STAR = 15;
const COUNTER_STAR = 20;
const RING_CX = W / 2;
const OPP_Y = 92;
const PLAYER_Y = 182;

// ── baked backdrop (built once, cached, never baked inside the draw loop) ──
interface PunchArt {
  sky: Sprite;
  crowdBack: Sprite;
  crowdMid: Sprite;
  crowdFront: Sprite;
  banner: Sprite;
  spotL: Sprite;
  spotR: Sprite;
  floor: Sprite;
  post: Sprite;
  pad: Sprite;
  gloveShadow: Sprite;
  burstStar: Sprite;
  sweat: Sprite;
  oppHeads: Anchored[];
  oppTorsos: Anchored[];
  glove: Anchored;
  playerHead: Anchored;
  playerTorso: Anchored;
}

/** a baked sprite plus the (cx, cy) point inside it that should land on the world position it's
 *  drawn at — so a pose can say "head centre goes here" without caring about the sprite's padding. */
interface Anchored {
  sprite: Sprite;
  cx: number;
  cy: number;
}
/** draw an Anchored sprite so its anchor point lands at (wx, wy) */
function drawAnchored(g: Gfx, a: Anchored, wx: number, wy: number, opts?: { flipX?: boolean; scale?: number }) {
  const scale = opts?.scale ?? 1;
  const flipX = !!opts?.flipX;
  const cx = flipX ? (a.sprite.rows[0]?.length ?? 0) - a.cx : a.cx;
  g.sprite(a.sprite, wx - cx * scale, wy - a.cy * scale, opts);
}

const OPP_HEAD_R = 28;
const OPP_BODY_W = 58;
const OPP_BODY_H = 58;

/** the player's hair-and-ears head, seen from the back, with a neck tucked under it. */
function bakePlayerHead(r: number): Anchored {
  const w = Math.ceil(r * 3);
  const h = Math.ceil(r * 2.7);
  const cx = w / 2;
  const cy = r * 1.05;
  const hairTones = ramp("#4a2f1d", 4, 0.5);
  const earTones = ramp(PAL.tan, 3, 0.4);
  const tufts = [-0.55, 0, 0.55].map((o) => ({ x: cx + o * r * 0.85, y: cy - r * 0.92 - Math.abs(o) * r * 0.15, rx: r * 0.24, ry: r * 0.36 }));
  const sprite = bake(w, h, (x, y) => {
    for (const s of [-1, 1]) {
      const edx = (x - (cx + s * r * 0.92)) / (r * 0.24);
      const edy = (y - cy) / (r * 0.3);
      const re = Math.hypot(edx, edy);
      if (re <= 1) {
        const b = bright2(edx, edy);
        return earTones[toneIdx(b, 3)];
      }
    }
    for (const t of tufts) {
      const tdx = (x - t.x) / t.rx;
      const tdy = (y - t.y) / t.ry;
      if (Math.hypot(tdx, tdy) <= 1) return hairTones[toneIdx(bright2(tdx, tdy), 4)];
    }
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    const rr = Math.hypot(dx, dy);
    if (rr <= 1) {
      let t = hairTones[toneIdx(bright2(dx, dy), 4)];
      if (rr > 0.78 && bright2(dx, dy) > 0.5) t = shade(t, 0.22);
      return t;
    }
    if (y > cy + r * 0.72 && y < cy + r * 1.35 && Math.abs(x - cx) < r * 0.55) return earTones[1]; // neck
    if (rr > 1 && rr < 1 + 1.3 / r) return "#140c28";
    return null;
  });
  return { sprite, cx, cy };
}

/** the player's back: trapezius shoulders tapering to the waist, a singlet with a collar stripe. */
function bakePlayerTorso(bodyW: number, bodyH: number, tint: string): Anchored {
  const w = Math.ceil(bodyW + 6);
  const PAD = 5;
  const h = Math.ceil(bodyH + 4) + PAD;
  const cx = w / 2;
  const topHW = bodyW / 2; // trapezius / shoulder width — clearly wider than the hem
  const waistHW = topHW * 0.56;
  const capRY = bodyH * 0.34; // a pronounced trapezius slope from the neck down to the shoulders
  const tones = ramp(tint, 4, 0.5);
  const strapColor = shade(tint, -0.4);
  const stripeColor = shade(mixHex(tint, PAL.navy, 0.6), 0.05);
  const sprite = bake(w, h, (x, rawY) => {
    const y = rawY - PAD;
    const dx = x - cx;
    const cdx = dx / topHW;
    const cdy = (y - capRY * 0.45) / (capRY * 1.1);
    const rCap = Math.hypot(cdx, cdy);
    const t = Math.min(1, Math.max(0, (y - capRY * 0.35) / Math.max(1, h - capRY * 0.35)));
    const hw = topHW + (waistHW - topHW) * Math.pow(t, 1.1); // shoulders -> noticeably narrower hem
    const rBody = Math.abs(dx) / hw;
    const inCap = y < capRY * 1.5 && rCap <= 1;
    const inBody = y >= capRY * 0.1 && rBody <= 1;
    if (!inCap && !inBody) {
      if (y < capRY * 1.5 && rCap > 1 && rCap < 1 + 1.4 / capRY) return "#140c28";
      if (rBody > 1 && rBody < 1 + 1.4 / Math.max(4, hw)) return "#140c28";
      return null;
    }
    const nx = inCap && rCap >= rBody ? cdx : dx / hw;
    const ny = inCap && rCap >= rBody ? cdy : t * 0.6 - 0.3;
    const b = bright2(nx, ny);
    const onEdge = (inCap ? rCap : rBody) > 0.84;
    let tcol = tones[toneIdx(b, 4)];
    // shoulder-blade shading: two soft darker patches either side of the spine, upper back
    const bladeL = Math.hypot((x - (cx - topHW * 0.4)) / (topHW * 0.34), (y - h * 0.32) / (h * 0.26));
    const bladeR = Math.hypot((x - (cx + topHW * 0.4)) / (topHW * 0.34), (y - h * 0.32) / (h * 0.26));
    if (Math.min(bladeL, bladeR) <= 1) tcol = shade(tcol, -0.14);
    // singlet straps running from each shoulder down the back
    const strapHW = topHW * 0.1;
    const inStrapL = Math.abs(x - (cx - topHW * 0.46)) < strapHW && y < h * 0.42;
    const inStrapR = Math.abs(x - (cx + topHW * 0.46)) < strapHW && y < h * 0.42;
    if ((inStrapL || inStrapR) && !onEdge) tcol = shade(strapColor, b * 0.15);
    // a bold back stripe lower down, where the singlet design shows clearly
    if (y >= h * 0.5 && y <= h * 0.64 && !onEdge) tcol = shade(stripeColor, b * 0.1);
    if (onEdge && b > 0.4) tcol = shade(tcol, 0.2);
    if (onEdge) tcol = "#140c28";
    return tcol;
  });
  return { sprite, cx, cy: PAD };
}

/** a tileable row of chunky, readable heads-and-shoulders silhouettes (5-7px heads on wider
 *  shoulder blocks), a lit rim on every head catching the spotlights, a few raised cheering arms,
 *  and — for the row nearest the ring — a handful of heads lit in colour by the spotlights. */
function bakeCrowdRow(w: number, h: number, period: number, base: string, rim: string, colorful: boolean): Sprite {
  const n = Math.max(4, Math.round(w / period));
  const P = w / n;
  const headR = Math.max(2.6, period * 0.26);
  const hues = [PAL.orange, PAL.pink, PAL.cyan, PAL.lime, PAL.yellow];
  const people = Array.from({ length: n }, (_, i) => ({
    jitter: (hash2(i, 0, 41) - 0.5) * 2.4,
    armUp: hash2(i, 1, 42) > 0.8,
    armSide: hash2(i, 2, 43) > 0.5 ? 1 : -1,
    lit: colorful && hash2(i, 3, 44) > 0.68,
    hue: hues[Math.floor(hash2(i, 4, 45) * hues.length)],
  }));
  return bake(w, h, (x, y) => {
    for (const k of [0, -1, 1]) {
      const col = Math.floor(x / P) + k;
      const idx = ((col % n) + n) % n;
      const person = people[idx];
      const px = col * P + P / 2;
      const headCy = h - headR * 1.5 + person.jitter;
      const hdx = (x - px) / headR;
      const hdy = (y - headCy) / headR;
      const rh = Math.hypot(hdx, hdy);
      if (rh <= 1) return rh > 0.8 ? rim : person.lit ? person.hue : base;
      if (person.armUp) {
        const ax = px + person.armSide * P * 0.4;
        const armTop = headCy - headR * 1.5;
        if (y >= armTop && y <= headCy + headR * 0.2 && Math.abs(x - ax) <= 1) return y < armTop + 1.3 ? rim : base;
        if (Math.hypot((x - ax) / 1.5, (y - armTop) / 1.5) <= 1) return base; // a small raised fist
      }
      const shTop = headCy + headR * 0.6;
      if (y >= shTop) {
        const t = (y - shTop) / Math.max(1, h - shTop);
        const halfW = P * 0.3 + P * 0.26 * t;
        if (Math.abs(x - px) <= halfW) return y < shTop + 1 ? rim : base;
      }
    }
    return null;
  });
}

/** a hanging ring banner: striped pennant with a small star emblem, flat colour blocks only. */
function bakeBanner(w: number, h: number, stripeA: string, stripeB: string): Sprite {
  return bake(w, h, (x, y) => {
    if (y === 0) return shade(stripeA, -0.4); // hanging rod
    const stripe = Math.floor(x / 3) % 2 === 0 ? stripeA : stripeB;
    const emblemY = h * 0.42;
    if (Math.abs(x - w / 2) + Math.abs(y - emblemY) < 3) return y < 1 ? stripe : "#fff6df";
    if (y > h - 3 && Math.abs(x - w / 2) > (h - y) * 1.4) return null; // pennant V-cut bottom
    return stripe;
  });
}

/** a soft dithered spotlight cone, narrow near the ceiling and widening as it falls, using the
 *  ordered-dither threshold so it reads as a classic 16-bit light beam, not a flat glow blob. */
function bakeSpot(w: number, h: number, color: string): Sprite {
  return bake(w, h, (x, y) => {
    const t = y / (h - 1);
    const halfW = (0.12 + 0.88 * t) * (w / 2);
    const dx = Math.abs(x - w / 2);
    if (dx > halfW) return null;
    const edge = 1 - dx / halfW;
    const density = edge * (1.05 - t * 0.55);
    return density > bayer(x, y) ? color : null;
  });
}

// ── real shaded pixel-art bodies: light comes from the upper-left, 3-4 tone ramps, a 1px dark
// outline and a rim highlight crescent on the lit edge — baked once per opponent so the result
// is a proper illustrated sprite, not a flat circle-on-rectangle. ──
const LX = -0.6;
const LY = -0.8; // unit "towards the light" direction (upper-left)
const bright2 = (nx: number, ny: number) => -(nx * LX + ny * LY) * -1; // dot(normal, light) via -(n·-L)
const toneIdx = (b: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(((b + 1) / 2) * n)));

type EarKind = OppDef["ear"];

/** an opponent's head as one illustrated sprite: a fur-shaded ball, round/point/big ears baked
 *  on (feathers stay procedural — they move), a muzzle patch, nose and a neutral mouth line. */
function bakeOppHead(headR: number, base: string, accent: string, ear: EarKind): Anchored {
  const R = headR;
  const padTop = ear === "point" ? R * 1.9 : ear === "big" ? R * 1.05 : R * 1.5;
  const padSide = ear === "big" ? R * 1.95 : R * 0.7;
  const w = Math.ceil(R * 2 + padSide * 2);
  const h = Math.ceil(R * 2 + padTop * 0.65 + R * 0.75);
  const cx = w / 2;
  const cy = padTop + R * 0.4;
  const tones = ramp(base, 4, 0.52);
  const muzzleTones = ramp(accent, 3, 0.42);
  const ears: { x: number; y: number; rx: number; ry: number }[] =
    ear === "round"
      ? [-1, 1].map((s) => ({ x: cx + s * R * 0.78, y: cy - R * 0.92, rx: R * 0.44, ry: R * 0.44 }))
      : ear === "big"
        ? [-1, 1].map((s) => ({ x: cx + s * R * 1.18, y: cy - R * 0.22, rx: R * 0.6, ry: R * 0.64 }))
        : ear === "point"
          ? [-1, 1].map((s) => ({ x: cx + s * R * 0.72, y: cy - R * 1.18, rx: R * 0.3, ry: R * 0.62 }))
          : [];
  const sprite = bake(w, h, (x, y) => {
    const hdx = (x - cx) / R;
    const hdy = (y - cy) / R;
    const rHead = Math.hypot(hdx, hdy);
    if (rHead <= 1) {
      const b = bright2(hdx, hdy);
      // muzzle patch (lower-centre) and nose
      const mdx = (x - cx) / (R * 0.36);
      const mdy = (y - (cy + R * 0.42)) / (R * 0.32);
      const rm = Math.hypot(mdx, mdy);
      if (rm <= 1) {
        const nose = Math.hypot((x - cx) / (R * 0.1), (y - (cy + R * 0.3)) / (R * 0.1));
        if (nose <= 1) return shade(accent, -0.45);
        // mouth: a short neutral line under the nose
        if (Math.abs(y - (cy + R * 0.58)) < 1.1 && Math.abs(x - cx) < R * 0.18) return shade(accent, -0.4);
        let t = muzzleTones[toneIdx(b, 3)];
        if (rm > 0.8) t = shade(t, -0.5); // outline the muzzle patch itself so it reads as separate
        return t;
      }
      let t = tones[toneIdx(b, 4)];
      if (rHead > 0.82 && b > 0.5) t = shade(t, 0.24); // rim highlight crescent on the lit side
      const speck = hash2(x, y, 61);
      if (speck > 0.965) t = shade(t, -0.16); // fur fleck texture
      return t;
    }
    // ears
    for (const e of ears) {
      const edx = (x - e.x) / e.rx;
      const edy = (y - e.y) / e.ry;
      const re = Math.hypot(edx, edy);
      if (re <= 1) {
        const b = bright2(edx, edy);
        const inner = Math.hypot(edx / 0.6, edy / 0.6) <= 1;
        let t = inner ? muzzleTones[toneIdx(b, 3)] : tones[toneIdx(b, 4)];
        if (re > 0.84 && b > 0.5) t = shade(t, 0.22);
        return t;
      }
      if (re > 1 && re < 1 + 1.3 / Math.min(e.rx, e.ry)) return "#140c28"; // ear outline
    }
    if (rHead > 1 && rHead < 1 + 1.3 / R) return "#140c28"; // head outline
    return null;
  });
  return { sprite, cx, cy };
}

/** an opponent's torso as one illustrated sprite: rounded shoulders tapering to the waist,
 *  3-4 tone fur shading, a belly patch, boxing shorts with a waistband + shine, an outline and
 *  (for the big-hearted champ) a baked championship belt — a real body, not a flat rectangle. */
function bakeOppTorso(bodyW: number, bodyH: number, base: string, accent: string, belt: boolean): Anchored {
  const w = Math.ceil(bodyW + 6);
  const PAD = 4;
  const h = Math.ceil(bodyH + 4) + PAD;
  const cx = w / 2;
  const topHW = bodyW / 2;
  const waistHW = bodyW * 0.36;
  const capRY = bodyH * 0.22;
  const bodyTones = ramp(base, 4, 0.5);
  const shortsBase = mixHex(base, "#16102c", 0.4);
  const shortsTones = ramp(shortsBase, 3, 0.4);
  const bellyTones = ramp(accent, 3, 0.4);
  const shortsTopY = h - bodyH * 0.32;
  const sprite = bake(w, h, (x, rawY) => {
    const y = rawY - PAD;
    const dx = x - cx;
    // rounded shoulder cap union'd with a tapering body
    const cdx = dx / topHW;
    const cdy = (y - capRY * 0.5) / (capRY * 1.05);
    const rCap = Math.hypot(cdx, cdy);
    const t = Math.min(1, Math.max(0, (y - capRY * 0.35) / Math.max(1, h - capRY * 0.35)));
    const hw = topHW + (waistHW - topHW) * Math.pow(t, 1.25);
    const rBody = Math.abs(dx) / hw;
    const inCap = y < capRY * 1.5 && rCap <= 1;
    const inBody = y >= capRY * 0.15 && rBody <= 1;
    if (!inCap && !inBody) {
      // a thin outline just outside the silhouette
      if (y < capRY * 1.5 && rCap > 1 && rCap < 1 + 1.4 / capRY) return "#140c28";
      if (y >= 0 && rBody > 1 && rBody < 1 + 1.4 / Math.max(4, hw)) return "#140c28";
      return null;
    }
    const nx = inCap && rCap >= rBody ? cdx : dx / hw;
    const ny = inCap && rCap >= rBody ? cdy : t * 0.7 - 0.35;
    const b = bright2(nx, ny);
    const onEdge = (inCap ? rCap : rBody) > 0.86;
    // shorts band near the bottom
    if (y >= shortsTopY) {
      let st = shortsTones[toneIdx(b, 3)];
      if (y < shortsTopY + 1.4) st = belt ? PAL.yellow : shade(st, 0.3); // waistband (or a belt stripe)
      if (y < shortsTopY + 1.4 && belt && Math.abs(dx) < bodyW * 0.1) st = shade("#9a742a", -0.1); // buckle
      if (onEdge) st = "#140c28";
      return st;
    }
    // belly / chest patch
    const be = Math.hypot(dx / (topHW * 0.52), (y - h * 0.4) / (h * 0.24));
    if (be <= 1 && y < shortsTopY - 2) {
      let bt = bellyTones[toneIdx(b, 3)];
      if (be > 0.85) bt = shade(bt, -0.3);
      return bt;
    }
    let bt2 = bodyTones[toneIdx(b, 4)];
    if (onEdge && b > 0.4) bt2 = shade(bt2, 0.2); // rim highlight along the lit shoulder
    const speck = hash2(x, y, 62);
    if (speck > 0.965 && !onEdge) bt2 = shade(bt2, -0.16);
    if (onEdge) bt2 = "#140c28";
    return bt2;
  });
  return { sprite, cx, cy: PAD };
}

/** one shared boxing glove — a padded ball with a cuff, a thumb bump on its inner edge and a
 *  bright highlight crescent — reused at any size/side via the sprite's scale + flipX. */
function bakeGlove(r: number): Anchored {
  const pad = r * 0.5;
  const w = Math.ceil(r * 2.3 + pad);
  const h = Math.ceil(r * 2.6);
  const cx = w / 2 + pad * 0.3;
  const cy = r * 1.05;
  const tones = ramp("#ff4a4a", 4, 0.5);
  const cuffY = cy + r * 0.62;
  const sprite = bake(w, h, (x, y) => {
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    const rMain = Math.hypot(dx, dy);
    const tdx = (x - (cx - r * 1.05)) / (r * 0.46);
    const tdy = (y - (cy + r * 0.1)) / (r * 0.4);
    const rThumb = Math.hypot(tdx, tdy);
    const inCuff = y >= cuffY - 1 && y <= cuffY + r * 0.5 && Math.abs(x - cx) <= r * 0.95;
    if (rMain <= 1 || rThumb <= 1 || inCuff) {
      const nx = rThumb <= 1 && rThumb < rMain ? tdx : dx;
      const ny = rThumb <= 1 && rThumb < rMain ? tdy : dy;
      const b = bright2(nx, ny);
      if (inCuff && rMain > 1 && rThumb > 1) {
        const cuffT = ramp(shade("#ff4a4a", -0.3), 3, 0.35);
        const edge = Math.abs(x - cx) > r * 0.88 || y > cuffY + r * 0.4;
        return edge ? "#140c28" : cuffT[toneIdx(b, 3)];
      }
      let t = tones[toneIdx(b, 4)];
      // a bright highlight crescent on the upper-left shine
      if (rMain <= 1 && rMain > 0.45 && b > 0.6 && dx < -0.1 && dy < 0) t = shade(t, 0.3 + 0.2 * (1 - rMain));
      const edge = (rMain > 1 ? false : rMain > 0.9) || (rThumb <= 1 && rThumb > 0.88);
      if (edge) t = "#140c28";
      return t;
    }
    if ((rMain > 1 && rMain < 1 + 1.3 / r) || (rThumb > 1 && rThumb < 1 + 1.3 / (r * 0.4))) return "#140c28";
    return null;
  });
  return { sprite, cx, cy };
}

function makeArt(): PunchArt {
  const SKY_H = 20;
  const sky = bake(W, SKY_H, (x, y) => {
    const t = y / (SKY_H - 1);
    const base = mixHex("#0c0920", "#171033", t);
    if (hash2(x, y, 7) > 0.994) return shade(base, 0.3); // the odd faint ceiling light glint
    return base;
  });
  const crowdBack = bakeCrowdRow(96, 13, 14, "#271f4c", "#4e4086", false);
  const crowdMid = bakeCrowdRow(104, 18, 16, "#352a62", "#6d5aad", true);
  const crowdFront = bakeCrowdRow(112, 24, 18, "#453674", "#a68ee6", true);
  const banner = bakeBanner(12, 15, PAL.pink, PAL.purple);
  const spotL = bakeSpot(96, 120, "#ffe9b0");
  const spotR = bakeSpot(96, 120, "#bdeaff");
  const FLOOR_H = 26;
  const matBase = "#e9ddc3";
  const floor = bake(W, FLOOR_H, (x, y) => {
    if (y < 3) return Math.floor(x / 4) % 2 === 0 ? shade(PAL.navy, -0.1) : shade(PAL.red, -0.1); // skirt trim
    const ty = y - 3;
    const th = FLOOR_H - 3;
    let base = mixHex("#c9b78e", matBase, ty / th);
    const n = hash2(Math.floor(x / 2), Math.floor(ty / 2), 9);
    if (n > 0.92) base = shade(base, -0.12); // woven canvas texture
    else if (n < 0.06) base = shade(base, 0.1);
    // centre emblem: a printed diamond star logo
    const dx = Math.abs(x - W / 2);
    const dy = Math.abs(ty - 13) * 1.7;
    const d = dx + dy;
    if (d < 2) return "#fff6df";
    if (d < 5) return shade(PAL.red, 0.05);
    if (d < 8 && (dx < 2.2 || dy < 2.2)) return shade(PAL.navy, 0.1);
    return base;
  });
  const POST_W = 10;
  const POST_H = 150;
  const postBase = "#aab0c8";
  const post = bake(POST_W, POST_H, (x, y) => {
    const edge = Math.abs(x - (POST_W - 1) / 2) / ((POST_W - 1) / 2);
    if (y < 6) return shade(postBase, 0.32 - edge * 0.3); // cap
    if (y === 6) return "#5a5e78";
    return shade(postBase, 0.22 - edge * 0.6);
  });
  const PAD_W = 16;
  const PAD_H = 22;
  const pad = bake(PAD_W, PAD_H, (x, y) => {
    const edgeK = x === 0 || x === PAD_W - 1 || y === 0 || y === PAD_H - 1 ? -0.4 : 0;
    const stitch = x === 4 || x === 11 ? -0.28 : 0;
    const topLight = y < 3 ? 0.18 : 0;
    return shade(PAL.red, edgeK + stitch + topLight);
  });
  const gloveShadow = bakeShadow(24, 7, "#120a1e");
  const burstStar = bake(7, 7, (x, y) => {
    const cx = 3;
    const cy = 3;
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (x === cx && y === cy) return "#fffde8";
    if (d <= 1) return PAL.yellow;
    if (d <= 3 && (x === cx || y === cy)) return shade(PAL.yellow, -0.1);
    return null;
  });
  const sweat = bake(4, 6, (x, y) => {
    const cx = 1.5;
    const d = Math.hypot(x - cx, y - 3.2);
    if (y < 2 && Math.abs(x - cx) < 2 - y) return "#bdeaff";
    if (d < 1.6) return y < 3 ? "#eaf9ff" : "#7fd4ff";
    return null;
  });
  const oppHeads = OPPONENTS.map((d) => bakeOppHead(OPP_HEAD_R, d.color, d.accent, d.ear));
  const oppTorsos = OPPONENTS.map((d) => bakeOppTorso(OPP_BODY_W, OPP_BODY_H, d.color, d.accent, d.ear === "big"));
  const glove = bakeGlove(15);
  const playerHead = bakePlayerHead(13);
  const playerTorso = bakePlayerTorso(40, 34, PAL.cyan);
  return { sky, crowdBack, crowdMid, crowdFront, banner, spotL, spotR, floor, post, pad, gloveShadow, burstStar, sweat, oppHeads, oppTorsos, glove, playerHead, playerTorso };
}
let PA: PunchArt | null = null;
const art = () => (PA ??= makeArt());

type Dir = "left" | "right" | "body" | "special" | "feint";
type OppState = "idle" | "tell" | "attack" | "open" | "recover" | "dizzy" | "down";

interface OppDef {
  name: string;
  line: string;
  color: string;
  accent: string;
  ear: "round" | "point" | "feather" | "big";
  hp: number;
  power: number;
  tellMin: number;
  tellMax: number;
  active: number;
  recover: number;
  openWin: number;
  idleMin: number;
  idleMax: number;
  moves: Dir[];
  combo: number;
  scale: number;
  bob: number;
}

const OPPONENTS: OppDef[] = [
  {
    name: "BOOMER THE BEAR",
    line: "Zzz... huh? A fight? Okaaay... *yawn*... let's go, slowly.",
    color: PAL.brown,
    accent: PAL.tan,
    ear: "round",
    hp: 55,
    power: 0.7,
    tellMin: 70,
    tellMax: 100,
    active: 16,
    recover: 55,
    openWin: 44,
    idleMin: 100,
    idleMax: 150,
    moves: ["left", "right", "body"],
    combo: 0,
    scale: 1.0,
    bob: 2,
  },
  {
    name: "RICOCHET ROO",
    line: "Boing boing boing! Betcha can't catch me, champ!",
    color: PAL.orange,
    accent: PAL.tan,
    ear: "point",
    hp: 75,
    power: 0.9,
    tellMin: 48,
    tellMax: 68,
    active: 13,
    recover: 38,
    openWin: 34,
    idleMin: 55,
    idleMax: 95,
    moves: ["left", "right", "body", "special"],
    combo: 0.18,
    scale: 1.05,
    bob: 10,
  },
  {
    name: "DAZZLE THE PEACOCK",
    line: "Ta-da! Admire my feathers... right before I admire your fall!",
    color: PAL.teal,
    accent: PAL.cyan,
    ear: "feather",
    hp: 88,
    power: 1.0,
    tellMin: 36,
    tellMax: 54,
    active: 11,
    recover: 30,
    openWin: 28,
    idleMin: 42,
    idleMax: 72,
    moves: ["left", "right", "feint", "special"],
    combo: 0.28,
    scale: 1.05,
    bob: 3,
  },
  {
    name: "BIG-HEART HUGO",
    line: "I may look soft, but my hooks are not! Good luck, friend!",
    color: PAL.purple,
    accent: PAL.pink,
    ear: "big",
    hp: 130,
    power: 1.25,
    tellMin: 40,
    tellMax: 58,
    active: 13,
    recover: 32,
    openWin: 26,
    idleMin: 36,
    idleMax: 62,
    moves: ["left", "right", "body", "special"],
    combo: 0.32,
    scale: 1.25,
    bob: 4,
  },
];

interface OppRuntime {
  def: OppDef;
  hp: number;
  state: OppState;
  timer: number;
  dir: Dir | null;
  fakeDir: Dir | null;
  comboCount: number;
  anim: number;
  hitT: number;
}

interface Pop {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

function checkDefense(dir: Dir, inp: Input): boolean {
  if (dir === "left") return inp.held.left;
  if (dir === "right") return inp.held.right;
  if (dir === "body") return inp.held.down;
  if (dir === "special") return inp.held.left || inp.held.right;
  return false; // feints are never actually resolved against
}

function tellLabel(dir: Dir): string {
  if (dir === "left") return "< DODGE!";
  if (dir === "right") return "DODGE! >";
  if (dir === "body") return "DOWN = BLOCK!";
  return "< DODGE!! >";
}

/** fixed relative fur/texture flecks on a body block (fractions of body width/height) so the
 *  fill reads as fur, not a flat slab — fixed offsets keep them deterministic, no flicker */
const FUR_SPECKS = [
  { dx: 0.18, dy: 0.15 },
  { dx: 0.62, dy: 0.3 },
  { dx: 0.32, dy: 0.42 },
  { dx: 0.78, dy: 0.12 },
  { dx: 0.08, dy: 0.38 },
];

/** a shiny pixel-art ball: dark rim, base fill, small top-left highlight — three cheap draws
 *  instead of one flat circle, used for heads, ears, gloves and bellies. */
function shadedBall(g: Gfx, cx: number, cy: number, r: number, base: string) {
  g.circle(cx + r * 0.12, cy + r * 0.16, r, shade(base, -0.4));
  g.circle(cx, cy, r * 0.96, base);
  g.circle(cx - r * 0.32, cy - r * 0.34, r * 0.3, shade(base, 0.35));
}
/** a small outlined, 3-tone ball for moving parts that can't be baked (feather tips) — a dark
 *  rim ring, base fill, and an upper-left highlight, so it reads as solid rather than flat. */
function furBall(g: Gfx, cx: number, cy: number, r: number, base: string) {
  g.circle(cx, cy, r + 1, "#140c28");
  g.circle(cx, cy, r * 0.92, shade(base, -0.15));
  g.circle(cx - r * 0.25, cy - r * 0.25, r * 0.6, base);
  g.circle(cx - r * 0.32, cy - r * 0.34, r * 0.28, shade(base, 0.35));
}
/** a long teardrop peacock tail feather — narrow at its base, rounding out near the tip, with a
 *  classic eye-spot (a gold ring round a dark-blue centre) a bit before the very end. Built as a
 *  chain of circles along its length (outline pass, then a shaded fill pass) so it reads as one
 *  solid barbed plume, not a string of beads. */
function drawFeather(g: Gfx, baseX: number, baseY: number, ang: number, length: number, width: number) {
  const N = 8;
  const dx = Math.sin(ang);
  const dy = -Math.cos(ang);
  const radiusAt = (t: number) => width * Math.sin(Math.min(1, t * 1.08) * (Math.PI / 2));
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = baseX + dx * length * t;
    const y = baseY + dy * length * t;
    g.circle(x, y, radiusAt(t) + 1, "#0b2a20");
  }
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = baseX + dx * length * t;
    const y = baseY + dy * length * t;
    const c = mixHex("#1f8f5e", "#2fcf9a", Math.min(1, t * 1.15));
    g.circle(x, y, Math.max(0.7, radiusAt(t) * 0.86), shade(c, 0.12 - t * 0.1));
  }
  // the eye-spot: a gold ring round a dark blue-black centre, set a little before the tip
  const et = 0.8;
  const ex = baseX + dx * length * et;
  const ey = baseY + dy * length * et;
  const er = width * 0.68;
  g.circle(ex, ey, er, "#8a6a1a");
  g.circle(ex, ey, er * 0.78, "#ffd34d");
  g.circle(ex, ey, er * 0.4, "#15224a");
  g.circle(ex - er * 0.12, ey - er * 0.12, er * 0.14, "#5d7dff"); // a tiny glint
}
/** a short shaded, outlined limb connecting a shoulder to a glove (a chain of circles tapering
 *  slightly from shoulder to wrist) so the arm reads as going somewhere, not just a floating fist. */
function drawLimb(g: Gfx, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, tint: string) {
  const N = 4;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    g.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t + 1, "#140c28");
  }
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    g.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (r0 + (r1 - r0) * t) * 0.88, shade(tint, 0.1 - t * 0.2));
  }
}
/** a block with a dark outline, a darker shadowed bottom and a lighter top edge */
function shadedBlock(g: Gfx, x: number, y: number, w: number, h: number, base: string) {
  g.box(x - 1, y - 1, w + 2, h + 2, shade(base, -0.5));
  g.rect(x, y, w, h, base);
  g.rect(x, y, w, Math.max(1, h * 0.22), shade(base, 0.22));
  g.rect(x, y + h * 0.78, w, h * 0.22, shade(base, -0.22));
}

/** fixed camera-flash positions scattered over the crowd tiers (fractions of W/band height) */
const FLASH_SPOTS = [
  { fx: 0.08, fy: 0.3, cycle: 131, off: 11 },
  { fx: 0.21, fy: 0.62, cycle: 157, off: 54 },
  { fx: 0.34, fy: 0.18, cycle: 113, off: 83 },
  { fx: 0.66, fy: 0.42, cycle: 149, off: 29 },
  { fx: 0.8, fy: 0.22, cycle: 121, off: 71 },
  { fx: 0.92, fy: 0.58, cycle: 167, off: 6 },
  { fx: 0.46, fy: 0.75, cycle: 139, off: 97 },
];

/** a sagging rope across the ring, drawn as a shallow polyline so it reads as taut cloth-covered
 *  cable rather than a perfectly straight bar — top highlight, base, bottom shadow per segment */
function drawRope(g: Gfx, y: number, color: string, sx: number, sag: number) {
  const N = 6;
  let px = 0;
  let py = y;
  const hi = shade(color, 0.35);
  for (let i = 1; i <= N; i++) {
    const x = (W * i) / N;
    const yy = y + Math.sin((x / W) * Math.PI) * sag;
    g.line(px + sx, py - 1, x + sx, yy - 1, hi);
    g.line(px + sx, py, x + sx, yy, color);
    px = x;
    py = yy;
  }
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let oi = 0;
  let round = 1;
  let roundTimer = ROUND_FRAMES;
  let fightState: "intro" | "roundcard" | "fight" | "won" | "lost" = "intro";
  let stateT = 160;
  let msg = "";
  let msg2 = "";
  let frame = 0;
  let shake = 0;
  let flash = 0;
  const pops: Pop[] = [];
  const sparks: Spark[] = [];
  const downCount = { n: 0, t: DOWN_TICK };

  const player = { hp: PLAYER_MAX, star: 0, dodge: 0, guard: false, punch: null as null | "l" | "r" | "u", punchT: 0, cool: 0, hitFlash: 0 };

  const makeOpp = (i: number): OppRuntime => ({
    def: OPPONENTS[i],
    hp: OPPONENTS[i].hp,
    state: "idle",
    timer: r.int(OPPONENTS[i].idleMin, OPPONENTS[i].idleMax),
    dir: null,
    fakeDir: null,
    comboCount: 0,
    anim: 0,
    hitT: 0,
  });
  let opp = makeOpp(0);

  const burst = (x: number, y: number, c: string, n = 8) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: r.range(-2.2, 2.2), vy: r.range(-2.6, 1), life: r.int(10, 22), c });
  };
  const pop = (x: number, y: number, text: string, color: string) => pops.push({ x, y, vy: -0.6, life: 42, text, color });
  const addStar = (n: number) => (player.star = clamp(player.star + n, 0, STAR_MAX));

  const hurtPlayer = (io: IO, dmg: number) => {
    player.hp = clamp(player.hp - dmg, 0, PLAYER_MAX);
    player.hitFlash = 12;
    shake = 9;
    flash = 5;
    io.sfx.play("hurt");
    io.sfx.noise?.(10, 0.2, 500, 180);
    pop(RING_CX, PLAYER_Y - 36, "OOF!", PAL.red);
    burst(RING_CX, PLAYER_Y - 30, "#bdeaff", 5); // sweat flecks on a big hit
    if (player.hp <= 0) loseBout(io);
  };

  function loseBout(io: IO) {
    fightState = "lost";
    msg = "KNOCKED OUT!";
    io.sfx.play("die");
    io.sfx.slide?.(220, 70, 24, "sawtooth", 0.3);
    io.gameOver();
  }

  function advanceOrWin(io: IO) {
    if (oi >= OPPONENTS.length - 1) {
      fightState = "won";
      msg = "YOU'RE THE CHAMP!";
      io.sfx.play("win");
      io.sfx.play("cheer");
      io.sfx.noise?.(40, 0.18, 1200, 2200);
      for (let i = 0; i < 24; i++) {
        const c = r.pick([PAL.pink, PAL.sky, PAL.yellow, PAL.lime, PAL.cyan]);
        sparks.push({ x: r.range(20, W - 20), y: r.range(-10, 0), vx: r.range(-0.6, 0.6), vy: r.range(0.6, 1.6), life: r.int(60, 110), c });
      }
      io.win();
    } else {
      oi++;
      opp = makeOpp(oi);
      round = 1;
      roundTimer = ROUND_FRAMES;
      player.hp = PLAYER_MAX;
      player.star = 0;
      fightState = "intro";
      stateT = 170;
    }
  }

  function koOpponent(io: IO) {
    io.score(300 * (oi + 1));
    io.sfx.play("win");
    advanceOrWin(io);
  }

  function endRound(io: IO) {
    if (round < ROUNDS) {
      round++;
      roundTimer = ROUND_FRAMES;
      player.hp = PLAYER_MAX;
      fightState = "roundcard";
      stateT = 90;
    } else {
      const oppFrac = opp.hp / opp.def.hp;
      const plFrac = player.hp / PLAYER_MAX;
      if (plFrac >= oppFrac) {
        io.score(150 * (oi + 1));
        msg2 = "WINS ON POINTS!";
        advanceOrWin(io);
      } else {
        msg2 = "LOSES ON POINTS";
        loseBout(io);
      }
    }
  }

  function landPunch(io: IO, kind: "l" | "r" | "u") {
    let dmg = kind === "u" ? UPPER_DMG : PUNCH_DMG;
    let starHit = false;
    if (kind === "u" && player.star >= STAR_MAX) {
      dmg = STAR_DMG;
      player.star = 0;
      starHit = true;
      io.sfx.play("powerup");
      io.sfx.play("zap");
    }
    if (opp.state === "idle") dmg *= 1.0;
    else if (opp.state === "open") {
      dmg *= OPEN_MULT;
      addStar(COUNTER_STAR);
      pop(RING_CX, OPP_Y - 20, "NICE COUNTER!", PAL.cyan);
      opp.state = "recover";
      opp.timer = Math.max(10, Math.round(opp.def.recover * 0.6));
    } else if (opp.state === "dizzy") dmg *= DIZZY_MULT;
    else dmg = 0; // whiffs on a guarded/mid-move opponent
    if (dmg <= 0) {
      io.sfx.play("blip");
      return;
    }
    opp.hp = clamp(opp.hp - dmg, 0, opp.def.hp);
    opp.hitT = starHit ? 16 : 10;
    io.score(Math.round(dmg));
    io.sfx.play("hit");
    shake = Math.max(shake, starHit ? 12 : 5);
    flash = Math.max(flash, starHit ? 8 : 3);
    burst(RING_CX, OPP_Y + 10, PAL.white, starHit ? 16 : 7);
    burst(RING_CX, OPP_Y, "#bdeaff", 3); // sweat flecks
    pop(RING_CX, OPP_Y - 36, starHit ? "STAR PUNCH!" : "BOINK!", starHit ? PAL.yellow : PAL.white);
    if (opp.hp <= 0 && opp.state !== "dizzy" && opp.state !== "down") {
      opp.state = "dizzy";
      opp.timer = DIZZY_FRAMES;
      opp.dir = null;
      io.sfx.play("explode");
      pop(RING_CX, OPP_Y - 10, "DIZZY!", PAL.lime);
    }
  }

  function startPunch(io: IO, kind: "l" | "r" | "u") {
    player.punch = kind;
    player.punchT = kind === "u" ? UPPER_ANIM : PUNCH_ANIM;
    player.cool = kind === "u" ? UPPER_COOL : PUNCH_COOL;
    io.sfx.play("whoosh");
    landPunch(io, kind);
  }

  function updatePlayerInput(io: IO, inp: Input) {
    if (player.cool > 0) player.cool--;
    if (player.hitFlash > 0) player.hitFlash--;
    if (player.punchT > 0) player.punchT--;
    player.guard = !!inp.held.down;
    player.dodge = inp.held.left ? -1 : inp.held.right ? 1 : 0;
    if (player.cool <= 0) {
      if (inp.held.up && inp.pressed.a) startPunch(io, "u");
      else if (inp.pressed.a) startPunch(io, "r");
      else if (inp.pressed.b) startPunch(io, "l");
    }
  }

  function startMove(isCombo: boolean) {
    const d = opp.def;
    const picked = r.pick(d.moves);
    if (picked === "feint") {
      opp.dir = "feint";
      opp.fakeDir = r.pick(d.moves.filter((m) => m !== "feint" && m !== "special") as Dir[]) ?? "left";
    } else {
      opp.dir = picked;
      opp.fakeDir = null;
    }
    opp.state = "tell";
    opp.timer = isCombo ? Math.max(16, Math.round(d.tellMin * 0.5)) : r.int(d.tellMin, d.tellMax);
  }

  function endMoveCycle() {
    const d = opp.def;
    if (r.chance(d.combo) && opp.comboCount < 2) {
      opp.comboCount++;
      startMove(true);
    } else {
      opp.comboCount = 0;
      opp.state = "idle";
      opp.timer = r.int(d.idleMin, d.idleMax);
    }
  }

  function updateOpponent(io: IO, inp: Input) {
    opp.anim++;
    if (opp.hitT > 0) opp.hitT--;
    const d = opp.def;
    switch (opp.state) {
      case "idle":
        opp.timer--;
        if (opp.timer <= 0) startMove(false);
        break;
      case "tell":
        opp.timer--;
        if (opp.timer <= 0) {
          if (opp.dir === "feint") {
            opp.state = "idle";
            opp.timer = Math.round(r.int(d.idleMin, d.idleMax) * 0.6);
            pop(RING_CX, OPP_Y - 30, "...JUST KIDDING!", PAL.grey);
          } else {
            opp.state = "attack";
            opp.timer = d.active;
          }
        }
        break;
      case "attack": {
        const defended = opp.dir ? checkDefense(opp.dir, inp) : false;
        if (defended) {
          opp.state = "open";
          opp.timer = d.openWin;
          addStar(DODGE_STAR);
          io.score(5);
          io.sfx.play(opp.dir === "body" ? "thud" : "whoosh");
          pop(RING_CX - 40, PLAYER_Y - 10, "DODGED!", PAL.cyan);
        } else {
          opp.timer--;
          if (opp.timer <= 0) {
            const mult = opp.dir === "special" ? 1.5 : 1;
            hurtPlayer(io, BASE_OPP_DMG * d.power * mult);
            opp.state = "recover";
            opp.timer = d.recover;
          }
        }
        break;
      }
      case "open":
        opp.timer--;
        if (opp.timer <= 0) endMoveCycle();
        break;
      case "recover":
        opp.timer--;
        if (opp.timer <= 0) endMoveCycle();
        break;
      case "dizzy":
        opp.timer--;
        if (opp.timer <= 0) {
          opp.state = "down";
          downCount.n = 0;
          downCount.t = DOWN_TICK;
          io.sfx.play("cheer");
          io.sfx.noise?.(30, 0.14, 900, 1800);
        }
        break;
      case "down":
        downCount.t--;
        if (downCount.t <= 0) {
          downCount.n++;
          downCount.t = DOWN_TICK;
          io.sfx.play(downCount.n >= 10 ? "win" : downCount.n % 2 ? "blip" : "hit");
          if (downCount.n >= 10) koOpponent(io);
        }
        break;
    }
  }

  return {
    update(io: IO) {
      frame++;
      if (shake > 0) shake--;
      if (flash > 0) flash--;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        if (--s.life <= 0) sparks.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.y += p.vy;
        if (--p.life <= 0) pops.splice(i, 1);
      }
      if (fightState === "won" || fightState === "lost") return;
      if (fightState === "intro") {
        stateT--;
        if (stateT <= 0) {
          fightState = "roundcard";
          stateT = 80;
        }
        return;
      }
      if (fightState === "roundcard") {
        stateT--;
        if (stateT === 8 || stateT === 1) io.sfx.tone(880, 0.09, "square", 0.25); // bell ding-ding to start the round
        if (stateT <= 0) fightState = "fight";
        return;
      }
      const inp = io.input;
      updatePlayerInput(io, inp);
      updateOpponent(io, inp);
      if (fightState === "fight" && opp.state !== "dizzy" && opp.state !== "down") {
        roundTimer--;
        if (roundTimer <= 0) endRound(io);
      }
    },

    draw(g: Gfx) {
      const a = art();
      const sx = shake > 0 ? (frame % 2 ? 3 : -3) : 0;
      const BAND_TOP = 20;
      const BAND_H = H - BAND_TOP - 26;
      // ── arena: dark ceiling, tiered crowd silhouettes lit at the edges, dithered spotlight
      // cones, hanging banners, canvas ring with a printed logo, roped posts ──
      g.clear("#0c0920");
      g.sprite(a.sky, 0, 0);
      g.rect(0, BAND_TOP, W, BAND_H, flash > 0 ? "#473a6e" : "#120c28");
      drawStrip(g, a.crowdBack, Math.round(frame * 0.02), BAND_TOP + 4, W);
      drawStrip(g, a.crowdMid, Math.round(frame * 0.035), BAND_TOP + 14, W);
      // dithered spotlight beams falling from the ceiling, crossing over the ring
      g.alpha(0.7);
      g.sprite(a.spotL, RING_CX - 104, -4);
      g.sprite(a.spotR, RING_CX + 8, -4, { flipX: true });
      g.alpha(1);
      drawStrip(g, a.crowdFront, Math.round(frame * 0.05), BAND_TOP + 26, W);
      // camera flashes popping in the crowd — small 4-point sparkle stars, not solid blocks
      for (const f of FLASH_SPOTS) {
        const on = (frame + f.off) % f.cycle < 3;
        if (!on) continue;
        const fx = f.fx * W;
        const fy = BAND_TOP + f.fy * BAND_H;
        g.rect(fx, fy - 3, 1, 7, "rgba(255,255,240,0.55)"); // long vertical point
        g.rect(fx - 3, fy, 7, 1, "rgba(255,255,240,0.55)"); // long horizontal point
        g.rect(fx - 1, fy - 1, 3, 3, "#fffef2"); // bright core
      }
      // pennant banners hanging either side of the ring, tucked above the turnbuckles
      g.sprite(a.banner, 26, BAND_TOP);
      g.sprite(a.banner, W - 38, BAND_TOP);
      g.sprite(a.floor, 0, H - 26);
      // ropes: shaded, sagging across the ring like taut cloth-covered cable
      drawRope(g, 48, PAL.red, sx, 5);
      drawRope(g, 66, PAL.white, sx, 4);
      drawRope(g, 84, PAL.red, sx, 3);
      g.sprite(a.post, 4 + sx, 36);
      g.sprite(a.post, W - 14 + sx, 36);
      g.sprite(a.pad, 2 + sx, 40);
      g.sprite(a.pad, W - 18 + sx, 40);

      drawOpponent(g, sx);
      drawPlayer(g, sx);

      for (const s of sparks) {
        g.alpha(clamp(s.life / 18, 0.25, 1));
        g.rect(s.x + sx - 1, s.y - 1, 3, 3, s.c);
        g.alpha(1);
      }
      for (const p of pops) g.text(p.text, RING_CX, p.y, p.color, { align: "center", size: p.text.length > 10 ? 1 : 2 });

      drawHud(g);

      // a bright white hit-flash overlay on big impacts, not just a tint
      if (flash > 4) {
        g.alpha(((flash - 4) / 4) * 0.45);
        g.rect(0, 0, W, H, PAL.white);
        g.alpha(1);
      }

      if (fightState === "intro") {
        g.rect(14, 60, W - 28, 100, "rgba(13,11,26,0.85)");
        g.box(14, 60, W - 28, 100, opp.def.color);
        g.text(`BOUT ${oi + 1}/${OPPONENTS.length}`, RING_CX, 68, PAL.yellow, { align: "center" });
        g.text(opp.def.name, RING_CX, 86, opp.def.color, { align: "center", size: 2 });
        g.text(wrapLine(opp.def.line, 30)[0] ?? "", RING_CX, 112, PAL.white, { align: "center" });
        g.text(wrapLine(opp.def.line, 30)[1] ?? "", RING_CX, 126, PAL.white, { align: "center" });
        if (frame % 40 < 28) g.text("GET READY!", RING_CX, 146, PAL.lime, { align: "center" });
      } else if (fightState === "roundcard") {
        g.rect(40, 90, W - 80, 44, "rgba(13,11,26,0.85)");
        g.text(`ROUND ${round}`, RING_CX, 102, PAL.yellow, { align: "center", size: 2 });
        g.text(`OF ${ROUNDS}`, RING_CX, 122, PAL.white, { align: "center" });
      } else if (opp.state === "down") {
        g.text(`${Math.min(10, downCount.n + 1)}...`, RING_CX, 150, PAL.red, { align: "center", size: 3 });
      } else if (fightState === "fight" && opp.state === "tell" && opp.dir) {
        const shown = opp.dir === "feint" ? opp.fakeDir ?? "left" : opp.dir;
        if (frame % 10 < 7) g.text(tellLabel(shown), RING_CX, OPP_Y + 48, PAL.yellow, { align: "center" });
      }

      if (fightState === "won") {
        g.rect(20, 70, W - 40, 90, "rgba(13,11,26,0.9)");
        g.text("CHAMPION!", RING_CX, 90, PAL.yellow, { align: "center", size: 3 });
        g.text(msg, RING_CX, 120, PAL.white, { align: "center" });
      } else if (fightState === "lost") {
        g.rect(20, 70, W - 40, 90, "rgba(13,11,26,0.9)");
        g.text(msg, RING_CX, 95, PAL.red, { align: "center", size: 2 });
        if (msg2) g.text(msg2, RING_CX, 118, PAL.white, { align: "center" });
      }
    },
  };

  // ── opponent drawing: every animal is a few circles/rects, posed by state ──
  function drawOpponent(g: Gfx, sx: number) {
    const a = art();
    const d = opp.def;
    const cx = RING_CX + sx;
    const bob = opp.state === "down" ? 0 : Math.sin(frame * 0.08) * d.bob;
    let cy = OPP_Y + bob;
    let tilt = 0;
    let armL = 0;
    let armR = 0;
    let bodyY = 0;
    const dirNow: Dir | null = opp.dir === "feint" ? opp.fakeDir : opp.dir;
    if (opp.state === "down") {
      cy = OPP_Y + 40; // a touch less than before: the bigger sprite already reaches low enough
      bodyY = 18;
    } else if (opp.state === "dizzy") {
      tilt = Math.sin(frame * 0.3) * 7;
      bodyY = 6;
    } else if (opp.state === "tell") {
      if (dirNow === "left") armL = -9;
      else if (dirNow === "right") armR = -9;
      else if (dirNow === "body") {
        armL = -6;
        armR = -6;
        bodyY = 6;
      } else if (dirNow === "special") {
        armL = -11;
        armR = -11;
      }
    } else if (opp.state === "attack") {
      if (opp.dir === "left") armL = 16;
      else if (opp.dir === "right") armR = 16;
      else if (opp.dir === "body") {
        armL = 11;
        armR = 11;
        bodyY = 8;
      } else if (opp.dir === "special") {
        armL = 18;
        armR = 18;
      }
    } else if (opp.state === "open") {
      tilt = 6;
      bodyY = 4;
    }
    const hitSquash = opp.hitT / 16; // a quick squash-and-stun flinch, layered over any state pose
    if (hitSquash > 0) {
      bodyY += hitSquash * 5;
      tilt += (opp.anim % 2 ? 1 : -1) * hitSquash * 3;
    }
    const s = d.scale * (opp.state === "down" ? 0.86 : 1); // a squashed scale while knocked down
    const headR = OPP_HEAD_R * d.scale;
    const bodyW = OPP_BODY_W * d.scale;
    const bodyH = OPP_BODY_H * d.scale;
    const bx = cx + tilt;
    const by = cy + bodyY;
    const head = a.oppHeads[oi];
    const torso = a.oppTorsos[oi];

    // telegraph glow ring behind the body while winding up or vulnerable
    if (opp.state === "tell" && frame % 8 < 4) g.circle(bx, by + 6, headR + bodyW * 0.42, "rgba(255,225,77,0.22)");
    if (opp.state === "open") g.circle(bx, by + 6, headR + bodyW * 0.4, "rgba(92,242,255,0.2)");

    // body: one illustrated sprite — rounded shoulders tapering to the waist, shaded fur, a
    // belly patch, boxing shorts (+ a baked belt for the big-hearted champ)
    const bodyTop = by + headR * 0.6;
    drawAnchored(g, torso, bx, bodyTop, { scale: s });

    // ears / crest per animal — round/point/big are baked onto the head; a peacock's tail fans
    // out BEHIND the head (drawn first, so the head sprite overlaps and hides the feather bases)
    if (d.ear === "feather") {
      const spread = opp.state === "tell" || opp.state === "attack" ? 1.12 : 1;
      const baseX = bx;
      const baseY = cy - headR * 0.2;
      const count = 6;
      for (let i = 0; i < count; i++) {
        const ang = (-1.05 + (i * 2.1) / (count - 1)) * spread;
        drawFeather(g, baseX, baseY, ang, headR * 2.1, headR * 0.42);
      }
    }

    // head: one illustrated sprite — fur-shaded ball with the ears, muzzle, nose and mouth baked in
    drawAnchored(g, head, bx, cy, { scale: s });
    if (d.ear === "feather") {
      // a small 3-quill crest on TOP of the head, same teardrop feathers, much shorter
      for (let i = 0; i < 3; i++) {
        const ang = -0.3 + i * 0.3;
        drawFeather(g, bx, cy - headR * 0.88, ang, headR * 0.55, headR * 0.16);
      }
    }
    const sleepy = d.name.startsWith("BOOMER") && opp.state === "idle";
    const stunned = hitSquash > 0.2;
    const eyeOpen = !stunned && (!sleepy || frame % 90 < 10);
    for (const side of [-1, 1]) {
      const ex = bx + side * headR * 0.42;
      const ey = cy - headR * 0.05;
      if (eyeOpen) {
        g.circle(ex, ey, headR * 0.17, PAL.white);
        g.circle(ex + side * 1, ey + 1, headR * 0.08, PAL.black);
        g.circle(ex - 1, ey - 1, headR * 0.05, PAL.white); // eye glint
      } else if (stunned) {
        // a squashed "X_X" flinch instead of a flat closed lid
        g.line(ex - headR * 0.16, ey - headR * 0.12, ex + headR * 0.16, ey + headR * 0.12, PAL.black);
        g.line(ex - headR * 0.16, ey + headR * 0.12, ex + headR * 0.16, ey - headR * 0.12, PAL.black);
      } else {
        g.rect(ex - headR * 0.14, ey, headR * 0.28, 2, PAL.black);
      }
    }
    if (stunned || opp.state === "down") {
      // an open "o" mouth over the baked neutral line, while dazed
      g.circle(bx, cy + headR * 0.56, headR * 0.1, shade(d.accent, -0.5));
    }
    if (stunned) {
      for (let i = 0; i < 2; i++) {
        const a2 = frame * 0.2 + i * Math.PI;
        g.text("★", bx + Math.cos(a2) * headR * 1.3, cy - headR * 1.5 + Math.sin(a2) * headR * 0.3, PAL.yellow, { align: "center" });
      }
    }
    // eyebrow wiggle — the readable "tell" cue
    if (opp.state === "tell" && frame % 10 < 6) {
      const wig = Math.sin(frame * 0.6) * 3;
      g.rect(bx - headR * 0.55, cy - headR * 0.55 + wig, headR * 0.9, 3, PAL.yellow);
    }

    // arms/gloves — the shared baked glove, scaled to this opponent, thumbs facing inward
    const gloveY = cy + headR * 0.3;
    const glR = headR * 0.6;
    const glSc = (glR / 15) * s;
    const glLx = bx - headR * 1.3 + armL * -0.3;
    const glLy = gloveY + Math.abs(armL) * 0.1;
    const glRx = bx + headR * 1.3 + armR * 0.3;
    const glRy = gloveY + Math.abs(armR) * 0.1;
    drawAnchored(g, a.glove, glLx, glLy, { scale: glSc, flipX: true });
    drawAnchored(g, a.glove, glRx, glRy, { scale: glSc });

    if (opp.state === "dizzy") {
      for (let i = 0; i < 3; i++) {
        const a = frame * 0.12 + (i * Math.PI * 2) / 3;
        g.text("★", bx + Math.cos(a) * headR * 1.6, cy - headR * 1.6 + Math.sin(a) * headR * 0.6, PAL.yellow, { align: "center" });
      }
    }
    if (opp.state === "down") {
      g.text("X", bx - headR * 0.4, cy - headR * 0.15, PAL.black, { align: "center" });
      g.text("X", bx + headR * 0.4, cy - headR * 0.15, PAL.black, { align: "center" });
    }
    // a worried sweat drop once the opponent is hurting, dripping down the temple on a loop
    const hpFrac0 = opp.hp / d.hp;
    if (hpFrac0 < 0.4 && opp.state !== "down") {
      const dripT = (frame + Math.round(headR)) % 50;
      g.sprite(a.sweat, bx + headR * 0.95, cy - headR * 0.3 + dripT * 0.6);
    }
    // opponent health bar just above the ring action — a thick framed strip like the cabinet art
    const hpFrac = clamp(opp.hp / d.hp, 0, 1);
    g.box(RING_CX - 61, 35, 122, 9, PAL.black);
    g.rect(RING_CX - 60, 36, 120, 7, "#1a1530");
    g.rect(RING_CX - 59, 37, 118 * hpFrac, 5, hpFrac > 0.3 ? d.color : PAL.red);
    g.rect(RING_CX - 59, 37, 118 * hpFrac, 2, shade(hpFrac > 0.3 ? d.color : PAL.red, 0.3));
    g.box(RING_CX - 60, 36, 120, 7, PAL.white);
  }

  // ── player: back view, big gloves, shifts with dodge and swings to punch ──
  function drawPlayer(g: Gfx, sx: number) {
    const a = art();
    const cx = RING_CX + sx + player.dodge * 18;
    const duck = player.guard;
    const cy = PLAYER_Y + (duck ? 10 : 0);
    const flashOn = player.hitFlash > 0 && player.hitFlash % 4 < 2;
    g.alpha(0.5);
    g.sprite(a.gloveShadow, cx - 12, cy + 23); // soft contact shadow on the canvas
    g.alpha(1);
    // body (back view): one illustrated sprite — trapezius shoulders tapering to the waist, a
    // singlet with a collar stripe — squashed a touch while blocking, flashed red when hurt
    drawAnchored(g, a.playerTorso, cx, cy - 10, { scale: duck ? 0.86 : 1 });
    if (flashOn) {
      g.alpha(0.45);
      g.rect(cx - 21, cy - 12, 42, duck ? 32 : 37, PAL.red);
      g.alpha(1);
    }
    // head: hair, ears and neck baked in, from the back
    drawAnchored(g, a.playerHead, cx, cy - 19);
    shadedBlock(g, cx - 11, cy - 34, 22, 8, PAL.navy); // headband
    g.rect(cx - 11, cy - 31, 22, 2, PAL.red); // headband stripe
    // gloves: idle resting near shoulders, punch extends one up/forward, thumbs facing inward
    const extend = player.punchT > 0 ? Math.min(1, player.punchT / (player.punch === "u" ? UPPER_ANIM : PUNCH_ANIM)) : 0;
    const activePunch = player.punch;
    const lOff = activePunch === "l" ? extend * 30 : 0;
    const rOff = activePunch === "r" ? extend * 30 : 0;
    const uOff = activePunch === "u" ? extend * 24 : 0;
    const glLy = cy - 6 - lOff * 0.6 - (activePunch === "u" ? uOff * 0.2 : 0);
    const glRy = cy - 6 - rOff * 0.6 - (activePunch === "u" ? uOff * 0.2 : 0);
    const glSc = 12 / 15;
    // arms: a short shaded limb from each shoulder out to its glove, so they read as connected
    drawLimb(g, cx - 15, cy - 6, cx - 23, glLy + 4, 8, 6, PAL.cyan);
    drawLimb(g, cx + 15, cy - 6, cx + 23, glRy + 4, 8, 6, PAL.cyan);
    drawAnchored(g, a.glove, cx - 23, glLy, { scale: glSc, flipX: true });
    drawAnchored(g, a.glove, cx + 23, glRy, { scale: glSc });
    if (activePunch === "l" && extend > 0) g.line(cx - 23, cy - 6, cx - 23, cy - 6 - 12, "rgba(255,255,255,0.5)");
    if (activePunch === "r" && extend > 0) g.line(cx + 23, cy - 6, cx + 23, cy - 6 - 12, "rgba(255,255,255,0.5)");
    if (activePunch === "u" && extend > 0) {
      furBall(g, cx, cy - 20 - uOff, 13, PAL.yellow);
      g.line(cx, cy - 10, cx, cy - 20 - uOff, "rgba(255,255,255,0.6)");
    }
    if (duck) g.text("BLOCK", cx, cy - 58, PAL.cyan, { align: "center" });
    // player health bar
    const hpFrac = clamp(player.hp / PLAYER_MAX, 0, 1);
    g.box(7, 179, 62, 9, PAL.black);
    g.rect(8, 180, 60, 7, "#1a1530");
    g.rect(9, 181, 58 * hpFrac, 5, hpFrac > 0.3 ? PAL.cyan : PAL.red);
    g.box(8, 180, 60, 7, PAL.white);
  }

  function drawHud(g: Gfx) {
    const a = art();
    g.rect(0, 0, W, 11, "rgba(13,11,26,0.6)");
    shadedBall(g, 9, 5, 3, PAL.red); // little glove icon by the kid's name
    g.text("YOU", 15, 2, PAL.cyan);
    g.text(opp.def.name.split(" ")[0], W - 10, 2, opp.def.color, { align: "right" }); // first word: full name has no room beside ROUND x/y
    shadedBall(g, W - 6, 5, 3, opp.def.color); // the opponent's colour chip
    g.text(`ROUND ${round}/${ROUNDS}`, RING_CX, 2, PAL.white, { align: "center" });
    const secs = Math.max(0, Math.ceil(roundTimer / 60));
    g.text(`${secs}s`, RING_CX, 22, PAL.grey, { align: "center" });
    // star meter — a little framed gauge with a spark icon, glowing panel when ready
    const full = player.star >= STAR_MAX;
    if (full) {
      g.alpha(0.25 + 0.2 * Math.sin(frame * 0.3));
      g.rect(W - 76, H - 20, 72, 18, PAL.yellow);
      g.alpha(1);
    }
    g.box(W - 71, H - 15, 64, 10, PAL.black);
    g.rect(W - 70, H - 14, 62, 8, "#1a1530");
    g.rect(W - 69, H - 13, 60 * (player.star / STAR_MAX), 6, full ? PAL.yellow : PAL.purple);
    g.rect(W - 69, H - 13, 60 * (player.star / STAR_MAX), 2, shade(full ? PAL.yellow : PAL.purple, 0.3));
    g.box(W - 70, H - 14, 62, 8, PAL.white);
    if (full && frame % 10 < 5) g.sprite(a.burstStar, W - 76, H - 18);
    g.text(full && frame % 20 < 12 ? "★ READY!" : "STAR", W - 39, H - 23, PAL.yellow, { align: "center" });
  }
}

/** split a line roughly in half on a word boundary so it fits the intro card */
function wrapLine(s: string, max: number): [string, string] {
  if (s.length <= max) return [s, ""];
  let cut = s.lastIndexOf(" ", max);
  if (cut < 0) cut = max;
  return [s.slice(0, cut), s.slice(cut + 1)];
}

export const punchChamp: RetroGameDef = {
  id: "punch-champ",
  title: "Punch Champ",
  blurb: "An original cartoon boxing bout! Dodge, block and counter 4 silly animal champs.",
  genre: "Sports",
  emoji: "🥊",
  color: "#ff4a4a",
  controls: "◀ ▶ dodge · ▼ block · A/B punch · ▲+A star punch",
  pad: { dpad: "4", a: "Right", b: "Left" },
  create,
};
