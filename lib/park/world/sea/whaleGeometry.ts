// The giant whales' bodies, built once, in the underwater kit's vertex layout (position, normal,
// color, aFx = [tint, flap, glow]) plus `aWh` = [signed angle round the body / PI (0 = the ridge
// of the back, ±1 = the belly), throat-pleat mask, mottling amount] which the "whale" shader
// pattern (underwater/shaders.ts) turns into crisp throat pleats, the mouth line, blowholes and
// mottling at any size. Unit length: the nose is at z = +0.5, the tail stock ends at z = -0.5 (the
// flukes reach a little further); scale an instance by the whale's length in metres.
//
//   blue whale  very long and slender, a broad flat U-shaped head, a tiny dorsal fin far back,
//               slim pectorals, mottled blue-grey with a paler belly
//   humpback    stockier, knobbly head (tubercles), very long white pectoral fins with scalloped
//               leading edges, a hump + small dorsal fin, serrated flukes with a white underside
import * as THREE from "three";
import { col, merge, mix, part } from "../fantasy/geo";
import { noise3, smoothstep } from "../fantasy/noise";

export type WhaleKind = "blue" | "humpback";

interface Profile {
  /** radius (units of length) at t (0 = tail stock end .. 1 = nose) */
  R: (t: number) => number;
  /** width factor */
  wx: (t: number) => number;
  /** height factors above / below the centre line */
  top: (t: number) => number;
  bot: (t: number) => number;
  /** centre line height (a gentle downward head) */
  cy: (t: number) => number;
}

const pow = Math.pow;
const BLUE: Profile = {
  R: (t) => {
    const M = 0.06;
    if (t < 0.34) return M * (0.13 + 0.87 * pow(smoothstep(0, 0.34, t), 0.85));
    if (t < 0.8) return M * (1 - 0.05 * pow((t - 0.6) / 0.26, 2));
    return M * 0.985 * pow(Math.max(0, 1 - pow((t - 0.8) / 0.2, 3.2)), 0.5);
  },
  // tail stock squeezed sideways; the head broad and flat (U-shaped from above)
  wx: (t) => 0.5 + 0.5 * smoothstep(0.06, 0.42, t) + 0.2 * smoothstep(0.74, 0.95, t),
  top: (t) => (1 + 0.25 * (1 - smoothstep(0.05, 0.3, t))) * (1 - 0.34 * smoothstep(0.76, 0.99, t)),
  bot: (t) => (1 + 0.2 * (1 - smoothstep(0.05, 0.3, t))) * (1 + 0.08 * smoothstep(0.55, 0.85, t)),
  cy: (t) => -0.006 * smoothstep(0.75, 1, t),
};
const HUMP: Profile = {
  R: (t) => {
    const M = 0.098;
    if (t < 0.36) return M * (0.1 + 0.9 * pow(smoothstep(0, 0.36, t), 0.72));
    if (t < 0.72) return M * (1 - 0.06 * pow((t - 0.56) / 0.2, 2));
    return M * 0.975 * pow(Math.max(0, 1 - pow((t - 0.72) / 0.28, 2.3)), 0.55);
  },
  // a slimmer, flat-topped rostrum
  wx: (t) => 0.5 + 0.47 * smoothstep(0.05, 0.45, t) - 0.26 * smoothstep(0.76, 1, t),
  top: (t) => (1 + 0.3 * (1 - smoothstep(0.05, 0.32, t))) * (1 - 0.42 * smoothstep(0.72, 1, t)),
  bot: (t) => (1 + 0.22 * (1 - smoothstep(0.05, 0.32, t))) * (1 + 0.12 * smoothstep(0.6, 0.9, t)),
  cy: (t) => -0.01 * smoothstep(0.7, 1, t),
};

const zOf = (t: number) => -0.5 + t;

/** a point on the body surface: t along (0 tail .. 1 nose), a round (0 = top, PI = belly) */
function surface(P: Profile, t: number, a: number, out: THREE.Vector3) {
  const r = P.R(t);
  const c = Math.cos(a);
  out.set(Math.sin(a) * r * P.wx(t), P.cy(t) + c * r * (c >= 0 ? P.top(t) : P.bot(t)), zOf(t));
  return out;
}

/** add the `aWh` attribute to a kit-layout part */
function withWh(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3) => [number, number, number]) {
  const P = g.attributes.position as THREE.BufferAttribute;
  const N = g.attributes.normal as THREE.BufferAttribute;
  const out = new Float32Array(P.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    n.fromBufferAttribute(N, i);
    const v = fn(p, n);
    out[i * 3] = v[0];
    out[i * 3 + 1] = v[1];
    out[i * 3 + 2] = v[2];
  }
  g.setAttribute("aWh", new THREE.BufferAttribute(out, 3));
  return g;
}

/** mirror across x (fixes the winding and normals) */
function mirrorX(g: THREE.BufferGeometry) {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  geo.scale(-1, 1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i + 1);
    const y = pos.getY(i + 1);
    const z = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  geo.deleteAttribute("normal");
  geo.computeVertexNormals();
  return geo;
}

/** fluke / fin flex: only the back of the whale beats (shader "flap", axis z) */
const flapAmp = (z: number) => 0.034 * pow(smoothstep(0.02, -0.56, z), 1.6);

/** a thin fin from an outline in (x = span, y = chord, leading edge +y), lying flat, leading edge to +z */
function finFrom(shape: THREE.Shape, thick: number, curve = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelSize: thick * 0.45, bevelThickness: thick * 0.5, bevelSegments: 1, curveSegments: curve });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2); // shape y -> +z, thickness -> y
  g.deleteAttribute("uv");
  return g;
}

export function whaleGeometry(kind: WhaleKind): THREE.BufferGeometry {
  const hump = kind === "humpback";
  const P = hump ? HUMP : BLUE;
  const parts: THREE.BufferGeometry[] = [];
  // ── palette ──
  // (a slate blue-black humpback, a pale blue-grey blue whale: dark enough to be themselves, light
  // enough to show their shape and markings under water)
  const back = hump ? col("#2e3846") : col("#6a8cab");
  const flank = hump ? col("#3c4858") : col("#87a6c0");
  const belly = hump ? col("#d4d9dd") : col("#a9bac6");
  const throat = hump ? col("#e6e9eb") : col("#b9c7d1");
  const tv = new THREE.Vector3();

  // ── the body: rings from the tail stock to the nose (denser at the head) ──
  const rings = hump ? 46 : 52;
  const radial = 30;
  const ts: number[] = [];
  for (let i = 0; i < rings; i++) {
    const u = i / (rings - 1);
    ts.push(u < 0.7 ? u * 0.8 : 0.56 + (1 - pow(Math.max(0, 1 - (u - 0.7) / 0.3), 1.8)) * 0.44);
  }
  const pos: number[] = [];
  const idx: number[] = [];
  const angle: number[] = [];
  for (let i = 0; i < rings; i++) {
    const t = Math.min(0.9985, ts[i]);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      surface(P, t, a, tv);
      // a keel along the tail stock (top and bottom ridges)
      const keel = (1 - smoothstep(0.05, 0.34, t)) * P.R(t) * 0.35 * pow(Math.abs(Math.cos(a)), 8);
      tv.y += Math.sign(Math.cos(a)) * keel;
      // humpback: the dorsal hump
      if (hump) tv.y += Math.max(0, Math.cos(a)) ** 3 * 0.02 * Math.exp(-(((t - 0.34) / 0.05) ** 2));
      pos.push(tv.x, tv.y, tv.z);
      angle.push(a > Math.PI ? (a - Math.PI * 2) / Math.PI : a / Math.PI);
    }
  }
  for (let i = 0; i + 1 < rings; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  const nose = pos.length / 3;
  surface(P, 1, 0, tv);
  pos.push(0, P.cy(1) - P.R(0.985) * 0.2, 0.5);
  angle.push(0.5);
  const tail = nose + 1;
  pos.push(0, 0, -0.5 - 0.004);
  angle.push(0.5);
  for (let k = 0; k < radial; k++) {
    idx.push((rings - 1) * radial + k, nose, (rings - 1) * radial + ((k + 1) % radial));
    idx.push(k, (k + 1) % radial, tail);
  }
  const bodyI = new THREE.BufferGeometry();
  bodyI.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  bodyI.setAttribute("aAng", new THREE.Float32BufferAttribute(angle, 1));
  bodyI.setIndex(idx);
  bodyI.computeVertexNormals();
  const bodyN = bodyI.toNonIndexed();
  bodyI.dispose();
  const angN = (bodyN.attributes.aAng as THREE.BufferAttribute).array as Float32Array;
  // fix the seam: a triangle straddling ±1 takes the sign of its majority
  for (let i = 0; i < angN.length; i += 3) {
    const s = angN[i] + angN[i + 1] + angN[i + 2];
    for (let k = 0; k < 3; k++) if (Math.abs(angN[i + k]) > 0.9 && Math.sign(angN[i + k]) !== Math.sign(s) && Math.abs(s) > 0.5) angN[i + k] = -angN[i + k];
  }
  const angCopy = Float32Array.from(angN);
  const body = part(
    bodyN,
    (p, n, i) => {
      const t = p.z + 0.5;
      const s = Math.abs(angCopy[i]); // 0 back .. 1 belly
      // countershading: dark back, paler flanks, pale belly (and a pale throat)
      let c = mix(back, flank, smoothstep(0.15, 0.5, s), new THREE.Color());
      c.lerp(belly, smoothstep(hump ? 0.6 : 0.55, hump ? 0.85 : 0.9, s));
      if (s > 0.6) c.lerp(throat, smoothstep(0.5, 0.75, t) * smoothstep(0.62, 0.85, s) * 0.8);
      if (hump) {
        // the knobbly rostrum is a touch paler
        c.lerp(flank, smoothstep(0.84, 0.92, t) * (1 - smoothstep(0.2, 0.4, s)) * 0.5);
      } else {
        // the blue whale's underside is a little yellowish (diatoms) toward the tail
        c.lerp(col("#aeb3a2"), smoothstep(0.65, 0.85, s) * (1 - smoothstep(0.35, 0.55, t)) * 0.4);
      }
      return c;
    },
    (p) => [0, flapAmp(p.z), 0],
  );
  // aWh: x = the per-vertex angle, y = throat pleats, z = mottling
  withWh(body, () => [0, 0, 0]);
  {
    const wh = (body.attributes.aWh as THREE.BufferAttribute).array as Float32Array;
    const P2 = body.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P2.count; i++) {
      const t = P2.getZ(i) + 0.5;
      const s = Math.abs(angCopy[i]);
      wh[i * 3] = angCopy[i];
      // pleats run from the chin to the navel on the underside
      wh[i * 3 + 1] = smoothstep(hump ? 0.44 : 0.42, hump ? 0.52 : 0.5, t) * (1 - smoothstep(0.97, 0.995, t)) * smoothstep(0.52, 0.64, s);
      wh[i * 3 + 2] = hump ? 0.5 + 0.5 * smoothstep(0.3, 0.7, s) : 1 - 0.4 * smoothstep(0.6, 0.9, s);
    }
  }
  body.deleteAttribute("aAng");
  parts.push(body);

  const bodyAt = (t: number, a: number) => surface(P, t, a, new THREE.Vector3());
  const finColour = (under: THREE.Color, over: THREE.Color) => (p: THREE.Vector3, n: THREE.Vector3) =>
    mix(over, under, smoothstep(0.25, -0.25, n.y), new THREE.Color());

  // ── pectoral fins ──
  {
    const sh = new THREE.Shape();
    if (hump) {
      // very long (a third of the body), narrow, with a scalloped leading edge
      const Lf = 0.31;
      const lead: [number, number][] = [];
      const n = 44;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const chord = 0.06 * (1 - 0.6 * u) * (u > 0.9 ? Math.sqrt(Math.max(0, 1 - (u - 0.9) / 0.1)) : 1);
        // the knobbly (tubercled) leading edge: soft round bumps
        const scallop = u > 0.06 && u < 0.9 ? Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 7), 2) * 0.0045 : 0;
        lead.push([u * Lf, chord * 0.45 + scallop]);
      }
      sh.moveTo(0, -0.03);
      for (const [x, y] of lead) sh.lineTo(x, y);
      for (let i = n; i >= 0; i--) {
        const u = i / n;
        const chord = 0.06 * (1 - 0.6 * u) * (u > 0.9 ? Math.sqrt(Math.max(0, 1 - (u - 0.9) / 0.1)) : 1);
        sh.lineTo(u * Lf, -chord * 0.55);
      }
    } else {
      // slim and pointed
      sh.moveTo(0, 0.024);
      sh.quadraticCurveTo(0.06, 0.022, 0.125, 0.004);
      sh.quadraticCurveTo(0.08, -0.012, 0, -0.022);
      sh.lineTo(0, 0.024);
    }
    const t = hump ? 0.71 : 0.72;
    for (const s of [1, -1]) {
      let f: THREE.BufferGeometry = finFrom(sh, hump ? 0.009 : 0.006, 8);
      // hang down and sweep back
      f.rotateZ(hump ? -0.46 : -0.5);
      f.rotateY(hump ? 0.42 : 0.5);
      const root = bodyAt(t, Math.PI * 0.64);
      f.translate(root.x * 0.92, root.y, root.z);
      if (s < 0) f = mirrorX(f);
      const under = hump ? throat : belly;
      const over = hump ? col("#eceff1") : flank;
      const g = part(
        f,
        (p, n) => {
          const c = finColour(under, over)(p, n);
          if (hump) {
            // dark mottles on the upper side near the root
            const d = Math.hypot(p.x, p.y);
            if (n.y > 0 && noise3(p.x * 40, p.y * 40, p.z * 40, 8) > 0.55 - d * 1.2) c.lerp(flank, 0.8);
          }
          return c;
        },
        [0, 0, 0],
      );
      parts.push(withWh(g, () => [0, 0, hump ? 0.3 : 0.6]));
    }
  }

  // ── dorsal fin (+ the hump) ──
  {
    const fin = new THREE.Shape();
    if (hump) {
      fin.moveTo(0.05, 0);
      fin.quadraticCurveTo(0.012, 0.012, -0.012, 0.022);
      fin.quadraticCurveTo(-0.018, 0.012, -0.05, 0);
    } else {
      fin.moveTo(0.028, 0);
      fin.quadraticCurveTo(0.004, 0.006, -0.012, 0.018);
      fin.quadraticCurveTo(-0.01, 0.006, -0.026, 0);
    }
    fin.lineTo(0.05, 0);
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 5 });
    g.deleteAttribute("uv");
    g.translate(0, 0, -0.004);
    g.rotateY(-Math.PI / 2); // shape x -> world z
    const t = hump ? 0.31 : 0.22;
    const top = bodyAt(t, 0);
    g.translate(0, top.y - 0.004 + (hump ? 0.014 : 0), top.z);
    parts.push(withWh(part(g, back, (p) => [0, flapAmp(p.z), 0]), () => [0, 0, 0.5]));
  }

  // ── flukes ──
  {
    const span = hump ? 0.16 : 0.13;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.02);
    sh.quadraticCurveTo(span * 0.45, 0.012, span, -0.05);
    if (hump) {
      // serrated trailing edge
      const n = 9;
      for (let i = 1; i <= n; i++) {
        const u = 1 - i / n;
        const x = span * u;
        const y = -0.05 + (1 - u) * 0.02 - 0.012 * Math.sin(u * Math.PI) - (i % 2 ? 0.004 : 0) ;
        sh.lineTo(x, y);
      }
      sh.lineTo(0, -0.03);
      for (let i = n; i >= 1; i--) {
        const u = 1 - i / n;
        const x = -span * u;
        const y = -0.05 + (1 - u) * 0.02 - 0.012 * Math.sin(u * Math.PI) - (i % 2 ? 0.004 : 0);
        sh.lineTo(x, y);
      }
    } else {
      sh.quadraticCurveTo(span * 0.55, -0.045, 0.012, -0.034);
      sh.lineTo(0, -0.028);
      sh.lineTo(-0.012, -0.034);
      sh.quadraticCurveTo(-span * 0.55, -0.045, -span, -0.05);
    }
    sh.quadraticCurveTo(-span * 0.45, 0.012, 0, 0.02);
    const g = finFrom(sh, 0.008, 8);
    g.translate(0, 0, -0.5 + 0.01);
    const under = hump ? col("#eef0f1") : belly;
    const flukes = part(
      g,
      (p, n) => {
        const c = finColour(under, back)(p, n);
        if (hump && n.y < 0) {
          // each humpback's own black-and-white fluke pattern
          const k = noise3(p.x * 50, 0, p.z * 50, 21) + Math.abs(p.x) * 2.2;
          if (k < 0.52) c.lerp(back, 0.9);
          // dark trailing edge
          if (p.z < -0.535) c.lerp(back, 0.7);
        }
        return c;
      },
      (p) => [0, flapAmp(p.z), 0],
    );
    parts.push(withWh(flukes, () => [0, 0, 0.4]));
  }

  // ── humpback: tubercles on the head, and the eyes ──
  if (hump) {
    const knob = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let row = -2; row <= 2; row++)
      for (let i = 0; i < 6; i++) {
        const t = 0.86 + i * 0.022 - Math.abs(row) * 0.01;
        if (t > 0.985) continue;
        const a = row * 0.14;
        const p = bodyAt(t, a);
        const k = knob.clone();
        const r = 0.0055 * (1 - Math.abs(row) * 0.12);
        k.scale(r, r * 0.8, r);
        k.rotateZ(-a);
        k.translate(p.x, p.y - r * 0.2, p.z);
        parts.push(withWh(part(k, flank, [0, 0, 0]), () => [0, 0, 0.3]));
      }
    // along the lower jaw
    for (const s of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const t = 0.84 + i * 0.02;
        const p = bodyAt(t, Math.PI * (0.64 - i * 0.005) * s);
        const k = knob.clone();
        k.scale(0.005, 0.004, 0.005);
        k.rotateZ(s > 0 ? -Math.PI * 0.6 : Math.PI * 0.6);
        k.translate(p.x, p.y, p.z);
        parts.push(withWh(part(k, flank, [0, 0, 0]), () => [0, 0, 0.3]));
      }
    knob.dispose();
  }
  for (const s of [-1, 1]) {
    const t = hump ? 0.83 : 0.845;
    const p = bodyAt(t, Math.PI * 0.56 * s);
    const eye = new THREE.SphereGeometry(hump ? 0.0055 : 0.0045, 7, 5);
    eye.translate(p.x + s * 0.001, p.y, p.z);
    parts.push(withWh(part(eye, col("#0b0d10"), [0, 0, 0]), () => [0, 0, 0]));
  }
  const g = dropDegenerate(merge(parts));
  g.computeBoundingSphere();
  return g;
}

/**
 * Remove zero-area triangles (bevel seams, duplicate outline points). They draw nothing at rest,
 * but their normals are zero — and once the flukes flex, a sliver can cover a pixel and put a NaN
 * into the frame, which the bloom pass then smears across the whole screen.
 */
function dropDegenerate(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const P = g.attributes.position as THREE.BufferAttribute;
  const N = g.attributes.normal as THREE.BufferAttribute;
  const keep: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i);
    b.fromBufferAttribute(P, i + 1).sub(a);
    c.fromBufferAttribute(P, i + 2).sub(a);
    let ok = b.cross(c).lengthSq() > 1e-14;
    for (let k = 0; k < 3 && ok; k++) if (Math.hypot(N.getX(i + k), N.getY(i + k), N.getZ(i + k)) < 1e-4) ok = false;
    if (ok) keep.push(i);
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const src = g.attributes[name] as THREE.BufferAttribute;
    const n = src.itemSize;
    const arr = new Float32Array(keep.length * 3 * n);
    let o = 0;
    for (const i of keep) for (let k = 0; k < 3; k++) for (let j = 0; j < n; j++) arr[o++] = (src.array as Float32Array)[(i + k) * n + j];
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  g.dispose();
  return out;
}

/** where on a whale (unit length) the blowholes are */
export function blowholeLocal(kind: WhaleKind): { y: number; z: number } {
  const P = kind === "humpback" ? HUMP : BLUE;
  const t = kind === "humpback" ? 0.8 : 0.83;
  return { y: surface(P, t, 0, new THREE.Vector3()).y, z: zOf(t) };
}

/** the whale's body radius at its widest (units of length) */
export const WHALE_GIRTH: Record<WhaleKind, number> = { blue: BLUE.R(0.6), humpback: HUMP.R(0.56) };
