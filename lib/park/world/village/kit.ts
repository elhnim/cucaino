// Small geometry + material helpers for Coralcove Isle.
//
// Two vertex layouts:
//   - props: the fantasy kit's layout (position, normal, color, aFx = tint/sway/glow — see
//     ../fantasy/geo.ts + shaders.ts), merged into one mesh with its wind sway and night glow
//   - folk (villagers, their tools, critters, boats): position, normal, color, aSlot, aVar, aGlow.
//     aSlot picks which colour tints a vertex (0 its own, 1 the instance colour, 2 a second
//     per-instance colour aColB); aVar lets one geometry hold several variants (hair styles, tools,
//     critter kinds) — an instance shows only the vertices whose aVar matches its aSel (or -1 = all)
//     and the rest collapse to nothing. So a whole clan of different-looking people is a handful
//     of instanced draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise3 } from "../fantasy/noise";

export const col = (h: string | number) => new THREE.Color(h);
const _c = new THREE.Color();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

// ── primitives, positioned (all return fresh, non-UV geometry) ──

export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
export function cyl(rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(x, y + h / 2, z);
  return g;
}
export function cone(r: number, h: number, seg: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1, false);
  g.translate(x, y + h / 2, z);
  return g;
}
export function ball(r: number, x = 0, y = 0, z = 0, detail = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}
/** a tiny 8-faced gem (eyes' glints, buns, fruit, shells: small things) */
export function gem(r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}
/** a lumpy faceted blob (canopies, rocks, bread), displaced by noise so no two look alike */
export function lump(r: number, x: number, y: number, z: number, seed: number, sx = 1, sy = 1, sz = 1, amount = 0.25, detail = 0): THREE.BufferGeometry {
  const g = detail > 0 ? new THREE.IcosahedronGeometry(1, detail) : new THREE.DodecahedronGeometry(1, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(_p.x * 1.7 + seed, _p.y * 1.7, _p.z * 1.7 - seed, 3) - 0.5) * amount * 2;
    pos.setXYZ(i, x + _p.x * r * sx * k, y + _p.y * r * sy * k * (_p.y < -0.2 ? 0.82 : 1), z + _p.z * r * sz * k);
  }
  return g;
}
/** a flat polygon from 2D points in the XY plane (both sides) */
export function flat(pts: [number, number][], both = true): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[0];
    const b = pts[i];
    const c = pts[i + 1];
    pos.push(a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0);
    if (both) pos.push(a[0], a[1], 0, c[0], c[1], 0, b[0], b[1], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
/** a stick (thin box) from a to b */
export function stick(a: THREE.Vector3, b: THREE.Vector3, w: number, d = w): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, d);
  g.translate(0, len / 2, 0);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(a.x, a.y, a.z);
  return g;
}
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, s: number | THREE.Vector3 = 1, rx = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), typeof s === "number" ? new THREE.Vector3(s, s, s) : s);
  g.applyMatrix4(m);
  return g;
}

// ── the props layout (fantasy kit: color + aFx) ──

export type Fx = [number, number, number];
type PerV<T> = T | ((p: THREE.Vector3, n: THREE.Vector3) => T);

/** faceted, flat-coloured-per-face part in the fantasy kit's layout */
export function pp(g: THREE.BufferGeometry, color: PerV<THREE.Color | string>, fx: PerV<Fx> = [0, 0, 0]): THREE.BufferGeometry {
  return layout(g, color, (geo, cc, n) => {
    const fxa = new Float32Array(n * 3);
    geo.setAttribute("aFx", new THREE.BufferAttribute(fxa, 3));
    return (i, p, nn) => {
      const f = typeof fx === "function" ? fx(p, nn) : fx;
      fxa[i * 3] = f[0];
      fxa[i * 3 + 1] = f[1];
      fxa[i * 3 + 2] = f[2];
      void cc;
    };
  });
}

// ── the folk layout (color + aSlot + aVar + aGlow) ──

/** faceted part for the folk: `slot` 0 own colour / 1 instance colour / 2 aColB; `v` variant (-1 = all) */
export function fp(g: THREE.BufferGeometry, color: PerV<THREE.Color | string>, slot = 0, v = -1, glow = 0): THREE.BufferGeometry {
  return layout(g, color, (geo, _cc, n) => {
    geo.setAttribute("aSlot", new THREE.BufferAttribute(new Float32Array(n).fill(slot), 1));
    geo.setAttribute("aVar", new THREE.BufferAttribute(new Float32Array(n).fill(v), 1));
    geo.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
    return () => {};
  });
}

function layout(g: THREE.BufferGeometry, color: PerV<THREE.Color | string>, extra: (geo: THREE.BufferGeometry, c: Float32Array, n: number) => (i: number, p: THREE.Vector3, n: THREE.Vector3) => void): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const name of Object.keys(geo.attributes)) if (name !== "position") geo.deleteAttribute(name);
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const n = pos.count;
  const c = new Float32Array(n * 3);
  const per = extra(geo, c, n);
  const fixed = typeof color === "function" ? null : typeof color === "string" ? col(color) : color;
  for (let f = 0; f < n; f += 3) {
    // per face: one flat colour (evaluated at the face centre)
    _p.set(0, 0, 0);
    _n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      _p.x += pos.getX(f + k) / 3;
      _p.y += pos.getY(f + k) / 3;
      _p.z += pos.getZ(f + k) / 3;
      _n.x += nor.getX(f + k);
      _n.y += nor.getY(f + k);
      _n.z += nor.getZ(f + k);
    }
    _n.normalize();
    if (fixed) _c.copy(fixed);
    else {
      const r = (color as (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color | string)(_p, _n);
      if (typeof r === "string") _c.set(r);
      else _c.copy(r);
    }
    for (let k = 0; k < 3; k++) {
      c[(f + k) * 3] = _c.r;
      c[(f + k) * 3 + 1] = _c.g;
      c[(f + k) * 3 + 2] = _c.b;
      per(f + k, _p, _n);
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geo;
}

/** merge same-layout parts (disposes the inputs) */
export function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts, false);
  if (!out) throw new Error("village: mergeGeometries failed (attribute mismatch)");
  for (const p of parts) p.dispose();
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

export const trisOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ── the folk material ──

export interface FolkUniforms {
  uGlowK: { value: number };
}

const FOLK_VERT_HEAD = /* glsl */ `
  attribute float aSlot; attribute float aVar; attribute float aGlow;
  attribute vec3 aColB; attribute float aSel;
  varying float vGlowF;
`;
const FOLK_COLLAPSE = /* glsl */ `
  if ( aVar > -0.5 && abs( aVar - aSel ) > 0.5 ) transformed = vec3( 0.0 );
`;

/** the shared material for villagers, tools, critters and boats (vertex colours + the slot tints) */
export function folkMaterial(U: FolkUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, flatShading: true });
  mat.customProgramCacheKey = () => "village-folk";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowK = U.uGlowK;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${FOLK_VERT_HEAD}`)
      .replace(
        "#include <color_vertex>",
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec4( 1.0 );
          #ifdef USE_COLOR
            vColor.rgb *= color.rgb;
          #endif
          #ifdef USE_INSTANCING_COLOR
            vColor.rgb *= aSlot > 1.5 ? aColB : ( aSlot > 0.5 ? instanceColor.rgb : vec3( 1.0 ) );
          #endif
        #endif
        vGlowF = aGlow;`,
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${FOLK_COLLAPSE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGlowF;\nuniform float uGlowK;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        #if defined( USE_COLOR )
          totalEmissiveRadiance += vColor.rgb * vGlowF * uGlowK;
        #endif`,
      );
  };
  return mat;
}

/** the matching shadow-caster (so hidden variants don't cast shadows) */
export function folkDepthMaterial(): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.customProgramCacheKey = () => "village-folk-depth";
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aVar; attribute float aSel;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${FOLK_COLLAPSE}`);
  };
  return mat;
}

/** the per-instance attributes the folk material reads (aColB colour, aSel variant) */
export function addFolkInstanceAttrs(mesh: THREE.InstancedMesh): { colB: THREE.InstancedBufferAttribute; sel: THREE.InstancedBufferAttribute } {
  const n = mesh.count;
  const colB = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
  const sel = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  mesh.geometry.setAttribute("aColB", colB);
  mesh.geometry.setAttribute("aSel", sel);
  // (instanceColor must exist for the slot tints)
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c);
  return { colB, sel };
}
