// Far-off herds, cheaply: every animal too far away to see its details is drawn by ONE instanced
// mesh of a little low-poly beast (~80 triangles) bent per instance into its species' shape — body,
// neck and head (raised or low), tail, four legs or two — in its own coat colour. From across the
// plains a herd of long-necks or a line of three-horns reads exactly right, for a fraction of the
// cost. (Near animals use their full rigged species meshes: see ./index.ts.)
import * as THREE from "three";
import { BODY, type MeshId } from "./herd";
import type { DinoSpeciesId } from "../../registry/dinoIsland";
import type { V3 } from "./rig";

/** a species' far shape (model units): body centre y/z, half length/height/width, neck root, head, head size, tail tip, legs, biped */
export interface FarShape {
  a: [number, number, number, number];
  b: [number, number, number, number];
  c: [number, number, number, number];
  d: [number, number, number, number];
}

const BIPEDS = new Set<DinoSpeciesId>(["trex", "raptor", "compy", "dodo", "moa", "terror"]);

/** work a species' far shape out from its rig pivots (neck root, head centre, hips) and its body capsule */
export function farShape(id: DinoSpeciesId, piv: { neck: V3; head: V3; hip: V3 }): FarShape {
  const [front, back, half] = BODY[id];
  const hip = piv.hip;
  const neck = piv.neck;
  const head = piv.head;
  const biped = BIPEDS.has(id);
  // the body: from just behind the hips to the neck's root
  const z0 = hip[2] - Math.max(0.15, half * 0.5);
  const z1 = neck[2] + half * 0.15;
  const cz = (z0 + z1) / 2;
  const hl = Math.max(half * 0.8, (z1 - z0) / 2);
  const cy = Math.max(hip[1], neck[1] * 0.9) * (biped ? 1.0 : 1.02);
  const hh = Math.max(0.12, cy * (biped ? 0.32 : 0.42));
  const hw = half * 0.85;
  const headR = Math.max(0.08, Math.min(half * 0.55, (front - head[2]) * 0.9 + 0.1));
  return {
    a: [cy, cz, hl, hh],
    b: [hw, neck[1], neck[2], headR],
    c: [head[1], head[2] + headR * 0.4, Math.max(0.05, hip[1] * 0.55), -back],
    d: [cz + hl * 0.62, cz - hl * 0.6, biped ? 1 : 0, Math.max(0.05, half * 0.42)],
  };
}

const VERT_HEAD = /* glsl */ `
  attribute float aPart;
  attribute vec4 aFA; attribute vec4 aFB; attribute vec4 aFC; attribute vec4 aFD;
  vec3 farAlong( vec3 p, vec3 r, vec3 t, float th ) {
    vec3 d = t - r; float L = max( 1e-3, length( d ) ); vec3 f = d / L;
    vec3 side = vec3( 1.0, 0.0, 0.0 );
    vec3 up = normalize( cross( f, side ) + vec3( 0.0, 1e-4, 0.0 ) );
    if ( up.y < 0.0 ) up = -up;
    return r + side * p.x * th + up * p.y * th + f * p.z * L;
  }
  vec3 farBend( vec3 p ) {
    float cy = aFA.x; float cz = aFA.y; float hl = aFA.z; float hh = aFA.w;
    float hw = aFB.x;
    if ( aPart < 0.5 ) return vec3( p.x * hw, cy + p.y * hh, cz + p.z * hl );
    if ( aPart < 1.5 ) return farAlong( p, vec3( 0.0, aFB.y, aFB.z ), vec3( 0.0, aFC.x, aFC.y ), max( 0.06, hw * 0.42 ) );
    if ( aPart < 2.5 ) return vec3( 0.0, aFC.x, aFC.y ) + p * aFB.w * vec3( 0.9, 0.8, 1.35 );
    if ( aPart < 3.5 ) return farAlong( p, vec3( 0.0, cy, cz - hl * 0.75 ), vec3( 0.0, aFC.z, aFC.w ), aFD.w );
    // legs: 4 front-left, 5 front-right, 6 hind-left, 7 hind-right (bipeds: no front legs)
    float k = aPart - 4.0;
    bool front = k < 1.5;
    if ( front && aFD.z > 0.5 ) return vec3( 0.0, cy, cz );
    float sx = mod( k, 2.0 ) < 0.5 ? -1.0 : 1.0;
    float lz = front ? aFD.x : aFD.y;
    float top = cy - hh * 0.5;
    float th = max( 0.05, hw * 0.34 );
    return vec3( sx * hw * 0.62 + p.x * th, p.y * top, lz + p.z * th );
  }
`;

/** the far beast's geometry: unit parts tagged with aPart */
function farGeometry(): THREE.BufferGeometry {
  const parts: { g: THREE.BufferGeometry; part: number }[] = [];
  const body = new THREE.IcosahedronGeometry(1, 0);
  parts.push({ g: body, part: 0 });
  // (neck and tail: open prisms along +z, 0..1)
  const prism = (r0: number, r1: number, seg: number) => {
    const g = new THREE.CylinderGeometry(r1, r0, 1, seg, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    return g;
  };
  parts.push({ g: prism(0.5, 0.42, 4), part: 1 });
  parts.push({ g: new THREE.OctahedronGeometry(1, 0), part: 2 });
  parts.push({ g: prism(1, 0.12, 4), part: 3 });
  for (let k = 0; k < 4; k++) {
    const g = new THREE.CylinderGeometry(0.5, 0.42, 1, 4, 1, true);
    g.translate(0, 0.5, 0);
    parts.push({ g, part: 4 + k });
  }
  const pos: number[] = [];
  const part: number[] = [];
  for (const { g, part: k } of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    const a = n.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      part.push(k);
    }
    if (n !== g) n.dispose();
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  return geo;
}

export interface FarHerds {
  mesh: THREE.InstancedMesh;
  fa: THREE.InstancedBufferAttribute;
  fb: THREE.InstancedBufferAttribute;
  fc: THREE.InstancedBufferAttribute;
  fd: THREE.InstancedBufferAttribute;
  dispose(): void;
}

export function buildFar(capacity: number): FarHerds {
  const geo = farGeometry();
  const mk = () => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const fa = mk();
  const fb = mk();
  const fc = mk();
  const fd = mk();
  geo.setAttribute("aFA", fa);
  geo.setAttribute("aFB", fb);
  geo.setAttribute("aFC", fc);
  geo.setAttribute("aFD", fd);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
  mat.customProgramCacheKey = () => "dino-far";
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${VERT_HEAD}`).replace("#include <begin_vertex>", "vec3 transformed = farBend( position );");
  };
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = "dino-far";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, c);
  mesh.count = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return {
    mesh,
    fa,
    fb,
    fc,
    fd,
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

/** the far shapes by mesh + variant (the small mixed meshes have several species) */
export type FarShapes = Map<MeshId, FarShape[]>;
