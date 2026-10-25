// Stone things: faceted boulders with mossy tops, glowing crystal clusters, and the ancient
// ruins (pillars, arches, standing stones with glowing runes, mossy steps, rune altars).
// All in the kit layout (geo.ts). Ruins are merged in world space into one mesh.
import * as THREE from "three";
import { col, displace, merge, mix, part, transform, type Fx } from "./geo";
import { noise3, rngOf, smoothstep, type Rng } from "./noise";
import type { RuinPart, RuinSite } from "./placement";

const scratch = new THREE.Color();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const STONE_A = col("#a09684");
const STONE_B = col("#948ea3");
const STONE_DARK = col("#4a4552");
const MOSS = col("#557a2c");
const MOSS_LIGHT = col("#86a13a");

/** stone colour for a face: warm/lavender stone, darker below, moss on top faces */
function stoneShade(seed: number, mossy = 1, groundY = 0) {
  return (p: THREE.Vector3, n: THREE.Vector3) => {
    mix(STONE_A, STONE_B, noise3(p.x * 0.35 + seed, p.y * 0.35, p.z * 0.35, 2), scratch);
    scratch.multiplyScalar(0.82 + 0.3 * noise3(p.x * 2.2, p.y * 2.2, p.z * 2.2, seed));
    const ao = smoothstep(groundY + 1.2, groundY - 0.2, p.y);
    scratch.lerp(STONE_DARK, ao * 0.45);
    const moss = smoothstep(0.45, 0.85, n.y) * smoothstep(0.3, 0.6, noise3(p.x * 0.8, p.y * 0.8, p.z * 0.8, seed + 5)) * mossy;
    if (moss > 0) scratch.lerp(noise3(p.x * 3, p.y, p.z * 3, 1) > 0.5 ? MOSS : MOSS_LIGHT, moss * 0.9);
    // moss creeping up from the ground
    const foot = smoothstep(groundY + 0.8, groundY, p.y) * smoothstep(0.35, 0.55, noise3(p.x * 1.5, p.y * 1.5, p.z * 1.5, seed + 9)) * mossy;
    scratch.lerp(MOSS, foot * 0.6);
    return scratch;
  };
}

/** one faceted rock (unit size, sitting on y ~ 0); instanced for pebbles and boulders alike */
export function buildRockGeometry(lowQuality = false): THREE.BufferGeometry {
  const g = displace(new THREE.IcosahedronGeometry(1, lowQuality ? 1 : 1), (p) => {
    const k = 0.78 + noise3(p.x * 1.1 + 3, p.y * 1.1, p.z * 1.1, 4) * 0.45 + (noise3(p.x * 3, p.y * 3, p.z * 3, 8) - 0.5) * 0.12;
    p.multiplyScalar(k);
    // a flatter base, a chunky top: a proper boulder, not an egg
    if (p.y < -0.25) p.y = -0.25 + (p.y + 0.25) * 0.3;
    p.y += 0.25;
    // chisel a few planes for the stylised faceted look
    const q = Math.round(p.y * 3) / 3;
    p.y = p.y * 0.7 + q * 0.3;
  });
  return part(g, stoneShade(0, 1, 0.1), [1, 0, 0], { faceted: true, faceColor: true });
}

/** a cluster of tall hexagonal crystals (unit size); the instance tint gives the hue */
export function buildCrystalGeometry(r: Rng = rngOf(12)): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shards = 7;
  for (let i = 0; i < shards; i++) {
    const h = i === 0 ? 3.4 : 1.1 + r() * 1.9;
    const w = i === 0 ? 0.42 : 0.18 + r() * 0.2;
    const tip = w * 1.8;
    const profile = [new THREE.Vector2(0, -0.4), new THREE.Vector2(w * 0.9, -0.4), new THREE.Vector2(w, h * 0.15), new THREE.Vector2(w * 0.95, h), new THREE.Vector2(0, h + tip)];
    const g = new THREE.LatheGeometry(profile, 6);
    const a = (i / shards) * Math.PI * 2 + r() * 0.4;
    const d = i === 0 ? 0 : 0.35 + r() * 0.4;
    const lean = i === 0 ? 0.05 : 0.25 + r() * 0.35;
    transform(g, Math.cos(a) * d, 0, Math.sin(a) * d, r() * 3, 1, Math.sin(a) * lean, -Math.cos(a) * lean);
    const top = h + tip;
    parts.push(
      part(
        g,
        (p, n) => {
          const t = smoothstep(-0.4, top, p.y);
          mix(col("#40405a"), col("#ffffff"), 0.35 + t * 0.65, scratch);
          // facets catch light differently
          scratch.multiplyScalar(0.85 + 0.3 * Math.abs(n.x * 0.6 + n.z * 0.8));
          return scratch;
        },
        (p): Fx => [1, 0, 0.12 + smoothstep(0, top, p.y) * 0.5],
        { faceted: true, faceColor: true },
      ),
    );
  }
  // a few little shards at the foot
  for (let i = 0; i < 4; i++) {
    const g = new THREE.OctahedronGeometry(0.22 + r() * 0.12, 0);
    const a = r() * Math.PI * 2;
    transform(g, Math.cos(a) * (0.8 + r() * 0.4), 0.05, Math.sin(a) * (0.8 + r() * 0.4), r() * 3, V(1, 1.6, 1), r(), r());
    parts.push(part(g, col("#e6e6ff"), [1, 0, 0.9], { faceted: true }));
  }
  return merge(parts);
}

export const CRYSTAL_HUES = [col("#3fe6ff"), col("#b26bff"), col("#ffc53d")];

// ── ruins ──
function roughBox(w: number, h: number, d: number, seed: number, amt = 0.08): THREE.BufferGeometry {
  return displace(new THREE.BoxGeometry(w, h, d, 2, Math.max(1, Math.round(h)), 2), (p) => {
    p.x += (noise3(p.x * 2 + seed, p.y * 2, p.z * 2, 1) - 0.5) * amt * 2;
    p.y += (noise3(p.x * 2, p.y * 2 + seed, p.z * 2, 2) - 0.5) * amt;
    p.z += (noise3(p.x * 2, p.y * 2, p.z * 2 + seed, 3) - 0.5) * amt * 2;
  });
}

function shaft(h: number, r0: number, seed: number, broken: boolean): THREE.BufferGeometry {
  const radial = 14;
  const g = new THREE.CylinderGeometry(r0 * 0.92, r0, h, radial, Math.max(2, Math.round(h / 1.2)), false);
  return displace(g, (p) => {
    const a = Math.atan2(p.z, p.x);
    // flutes, chips and weathering
    const k = 1 + Math.cos(a * 7) * 0.035 + (noise3(p.x * 2.5 + seed, p.y * 1.5, p.z * 2.5, 4) - 0.5) * 0.14;
    p.x *= k;
    p.z *= k;
    if (broken && p.y > h / 2 - 0.01) p.y += (noise3(p.x * 3 + seed, 0, p.z * 3, 5) - 0.7) * 0.9;
  });
}

/** glowing rune glyphs: little strokes stamped on a face (local +z), `rows` of them up the stone */
function runeStrokes(r: Rng, rows: number, y0: number, dy: number, zAt: (y: number) => number, w: number, glow: THREE.Color): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < rows; k++) {
    const cy = y0 + k * dy;
    const strokes = 2 + Math.floor(r() * 3);
    for (let s = 0; s < strokes; s++) {
      const vertical = r() < 0.5;
      const len = (vertical ? 0.5 : 0.36) * (0.6 + r() * 0.6) * w;
      const b = new THREE.BoxGeometry(vertical ? 0.07 : len, vertical ? len : 0.07, 0.06);
      const ox = (r() - 0.5) * 0.36 * w;
      const oy = (r() - 0.5) * 0.3;
      transform(b, ox, cy + oy, zAt(cy + oy), 0, 1, 0, vertical ? (r() - 0.5) * 0.9 : (r() - 0.5) * 0.5);
      out.push(part(b, glow, [0, 0, 1.1]));
    }
    // a ring glyph now and then
    if (r() < 0.35) {
      const t = new THREE.TorusGeometry(0.13 * w, 0.03, 3, 10);
      transform(t, (r() - 0.5) * 0.2, cy, zAt(cy));
      out.push(part(t, glow, [0, 0, 1.1]));
    }
  }
  return out;
}

export const RUNE_CYAN = col("#5ff4ff");
export const RUNE_GOLD = col("#ffcf5a");

export function ruinPartGeometry(p: RuinPart, runeCol: THREE.Color): THREE.BufferGeometry[] {
  const r = rngOf(p.seed + 1);
  const out: THREE.BufferGeometry[] = [];
  const shade = stoneShade(p.seed % 97, 1, 0);
  const stone = (g: THREE.BufferGeometry) => out.push(part(g, shade, [0, 0, 0], { faceted: true, faceColor: true }));
  const pillar = (x: number, z: number, h: number, broken: boolean, capital: boolean) => {
    const base = roughBox(1.7, 0.5, 1.7, p.seed, 0.06);
    transform(base, x, 0.2, z);
    stone(base);
    const s = shaft(h, 0.58, p.seed + x, broken);
    transform(s, x, 0.45 + h / 2, z);
    stone(s);
    if (capital) {
      const c1 = roughBox(1.5, 0.35, 1.5, p.seed + 3, 0.05);
      transform(c1, x, 0.45 + h + 0.17, z);
      stone(c1);
      const c2 = roughBox(1.8, 0.3, 1.8, p.seed + 4, 0.05);
      transform(c2, x, 0.45 + h + 0.48, z);
      stone(c2);
    }
  };
  switch (p.kind) {
    case "pillar":
      pillar(0, 0, p.h, false, true);
      break;
    case "broken": {
      pillar(0, 0, p.h, true, false);
      const chunk = roughBox(0.9, 0.7, 0.9, p.seed + 7, 0.12);
      transform(chunk, 1.3, 0.25, 0.6, r() * 3, 1, 0.3, 0.4);
      stone(chunk);
      break;
    }
    case "toppled": {
      // three drums fallen along local x, half sunk
      for (let i = 0; i < 3; i++) {
        const d = shaft(2.2, 0.58, p.seed + i, i === 2);
        transform(d, (i - 1) * 2.35 + (r() - 0.5) * 0.2, 0.42, (r() - 0.5) * 0.35, (r() - 0.5) * 0.2, 1, 0, Math.PI / 2 + (r() - 0.5) * 0.12);
        stone(d);
      }
      const cap = roughBox(1.7, 0.4, 1.6, p.seed + 9, 0.06);
      transform(cap, -3.9, 0.3, 0.3, 0.4, 1, 0.1, 0.3);
      stone(cap);
      break;
    }
    case "stone": {
      const h = p.h;
      const g = displace(new THREE.BoxGeometry(1.5, h, 0.78, 2, Math.max(2, Math.round(h)), 1), (q) => {
        const t = (q.y + h / 2) / h;
        const k = 1 - t * 0.22;
        q.x *= k;
        q.z *= k * (1 - t * 0.1);
        if (t > 0.98) q.y += (noise3(q.x * 2 + p.seed, 0, q.z * 2, 2) - 0.5) * 0.5;
        q.x += (noise3(q.x * 1.7 + p.seed, q.y * 1.7, q.z, 3) - 0.5) * 0.18;
        q.z += (noise3(q.x, q.y * 1.7 + p.seed, q.z * 1.7, 4) - 0.5) * 0.14;
      });
      transform(g, 0, h / 2 - 0.3, 0, 0, 1, (r() - 0.5) * 0.12, (r() - 0.5) * 0.1);
      stone(g);
      if (p.runes) {
        // runes on the face that looks into the ring (local -z faces the centre since stones face outwards)
        for (const face of [-1, 1]) {
          // the face's half-depth where each glyph sits (the stone tapers upwards)
          const zAt = (y: number) => {
            const t = Math.min(1, Math.max(0, (y + 0.3) / h));
            return 0.39 * (1 - t * 0.22) * (1 - t * 0.1) + 0.02;
          };
          const rs = runeStrokes(r, Math.max(2, Math.floor(h / 1.4)), 0.6, 0.95, zAt, 1.2 * 0.85, runeCol);
          for (const g2 of rs) {
            transform(g2, 0, 0, 0, face < 0 ? Math.PI : 0);
            out.push(g2);
          }
        }
      }
      break;
    }
    case "arch": {
      pillar(-3.2, 0, 5.2, false, false);
      pillar(3.2, 0, 3.3, true, false);
      // voussoirs on the left side only: the right half of the arch has fallen
      const R = 3.2;
      const cy = 5.65;
      const n = 9;
      for (let i = 0; i < n; i++) {
        if (i >= 6) continue;
        const a = Math.PI - (i + 0.5) * (Math.PI / n);
        const b = roughBox(0.95, 1.1, 1.3, p.seed + i, 0.05);
        transform(b, Math.cos(a) * R, cy + Math.sin(a) * R, 0, 0, 1, 0, a - Math.PI / 2);
        stone(b);
        if (i === 4) {
          const rs = runeStrokes(r, 1, 0, 0, () => 0.66, 0.9, runeCol);
          for (const g2 of rs) {
            transform(g2, Math.cos(a) * R, cy + Math.sin(a) * R, 0, 0, 1, 0, a - Math.PI / 2);
            out.push(g2);
          }
        }
      }
      // fallen voussoirs at the foot of the broken side
      for (let i = 0; i < 3; i++) {
        const b = roughBox(0.95, 1.1, 1.3, p.seed + 20 + i, 0.08);
        transform(b, 2.2 + i * 1.1, 0.4, 1.4 + (r() - 0.5) * 1.6, r() * 3, 1, r() * 0.8, Math.PI / 2 + r() * 0.5);
        stone(b);
      }
      break;
    }
    case "steps": {
      const s = p.h;
      for (let i = 0; i < 3; i++) {
        const b = roughBox((4.4 - i * 0.7) * s, 0.42, (3.1 - i * 0.9) * s, p.seed + i, 0.05);
        transform(b, 0, 0.1 + i * 0.4, -i * 0.35 * s);
        stone(b);
      }
      break;
    }
    case "altar": {
      const s = p.h;
      const base = displace(new THREE.CylinderGeometry(1.5 * s, 1.7 * s, 0.8, 8, 1), (q) => {
        q.x += (noise3(q.x * 2 + p.seed, q.y, q.z * 2, 1) - 0.5) * 0.15;
        q.z += (noise3(q.x * 2, q.y, q.z * 2 + p.seed, 2) - 0.5) * 0.15;
      });
      transform(base, 0, 0.3, 0);
      stone(base);
      const top = roughBox(1.9 * s, 0.35, 1.9 * s, p.seed + 1, 0.05);
      transform(top, 0, 0.88, 0, Math.PI / 8);
      stone(top);
      // a glowing rune circle and a floating orb
      const ring = new THREE.TorusGeometry(0.72 * s, 0.05, 3, 28);
      transform(ring, 0, 1.08, 0, 0, 1, Math.PI / 2);
      out.push(part(ring, runeCol, [0, 0, 2]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const tick = new THREE.BoxGeometry(0.06, 0.04, 0.3 * s);
        transform(tick, Math.cos(a) * 0.45 * s, 1.08, Math.sin(a) * 0.45 * s, -a + Math.PI / 2);
        out.push(part(tick, runeCol, [0, 0, 2]));
      }
      const orb = new THREE.IcosahedronGeometry(0.3 * s, 1);
      transform(orb, 0, 2.1, 0);
      out.push(part(orb, runeCol, [0, 0, 3]));
      break;
    }
    case "block": {
      const b = roughBox(1.1 * p.h, 0.75 * p.h, 0.95 * p.h, p.seed, 0.1);
      transform(b, 0, 0.2 * p.h, 0, 0, 1, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
      stone(b);
      break;
    }
  }
  return out;
}

/** every ruin site merged into one world-space geometry (1 draw call) */
export function buildRuinsGeometry(sites: RuinSite[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  sites.forEach((site, si) => {
    const runeCol = site.kind === "shrine" || si % 3 === 2 ? RUNE_GOLD : RUNE_CYAN;
    for (const p of site.parts) {
      for (const g of ruinPartGeometry(p, runeCol)) {
        transform(g, p.x, p.y - 0.15, p.z, p.rot);
        parts.push(g);
      }
    }
  });
  return parts.length ? merge(parts) : null;
}

/** a small broken arch + pillar for the top of a floating island (local coords) */
export function buildMiniRuinGeometry(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const pieces: RuinPart[] = [
    { kind: "arch", x: 0, y: 0, z: 0, rot: 0.3, h: 1, seed, runes: true },
    { kind: "broken", x: -3.6, y: 0, z: 3, rot: 1, h: 2.4, seed: seed + 1, runes: false },
    { kind: "block", x: 3, y: 0, z: 3.4, rot: 0.4, h: 0.9, seed: seed + 2, runes: false },
  ];
  for (const p of pieces)
    for (const g of ruinPartGeometry(p, RUNE_CYAN)) {
      transform(g, p.x, p.y - 0.1, p.z, p.rot);
      parts.push(g);
    }
  return parts;
}
