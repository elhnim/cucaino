// The lake's little lives, TRUE size (modelled in metres, drawn x1.6): bullfrogs croaking on the lily
// pads (they plop into the water if you come too close), turtles basking in a row along the
// half-sunk log (they slide off when a kid splashes near), a grey heron wading the shallows and
// stabbing at fish, a kingfisher diving from its post with a splash, and dragonflies darting and
// hovering over the reed beds. (The ducks, their ducklings and the platypus live with ../fauna.)
//
// ONE instanced mesh for all of them: the model holds every kind's parts, each instance shows only
// its own (the rest collapse in the vertex shader), legs/necks/wings are posed there too.
// Behaviour is allocation-free.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WATER_Y, groundY } from "../../registry/terrain";
import { LAKE, lakeRadius, waterDepthAt } from "../../registry/waterways";
import { rngOf } from "../fantasy/noise";
import type { WaterSpots } from "./props";

export const C_FROG = 0;
export const C_TURTLE = 1;
export const C_HERON = 2;
export const C_KINGFISHER = 3;
export const C_DRAGONFLY = 4;
const U = 1.6;

interface Critter {
  kind: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0 idle, 1 moving (hop / flight / dash), 2 hidden (dived in) */
  st: number;
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  u: number;
  dur: number;
  wait: number;
  act: number;
  home: number;
  seed: number;
}

/** build one kind's parts: [geometry, sub-part id] list in metres */
function kindParts(kind: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, color: string, sub: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute("uv");
    ng.deleteAttribute("normal");
    ng.computeVertexNormals();
    const n = ng.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
    ng.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    ng.setAttribute("aSub", new THREE.BufferAttribute(new Float32Array(n).fill(sub), 1));
    out.push(ng);
  };
  const ball = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
    // (small, so an octahedron's 8 facets are plenty — every instance draws every kind's parts)
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(rx, ry, rz);
    g.translate(x, y, z);
    return g;
  };
  if (kind === C_FROG) {
    add(ball(0, 0.05, 0, 0.07, 0.05, 0.09), "#5aa83a", 0);
    add(ball(0, 0.035, 0.035, 0.05, 0.03, 0.04), "#e8e8a0", 4); // the throat
    for (const s of [-1, 1]) {
      add(ball(s * 0.035, 0.1, 0.05, 0.02, 0.022, 0.02), "#f0e060", 0);
      add(ball(s * 0.035, 0.103, 0.06, 0.009, 0.012, 0.009), "#1a1a1a", 0);
      add(ball(s * 0.075, 0.02, -0.04, 0.03, 0.02, 0.06), "#4a9a32", 1);
    }
  } else if (kind === C_TURTLE) {
    const shell = new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    shell.scale(0.14, 0.07, 0.17);
    add(shell, "#4a6a3a", 0);
    add(ball(0, 0.01, 0, 0.15, 0.02, 0.18), "#d8c87a", 0);
    add(ball(0, 0.04, 0.21, 0.04, 0.035, 0.05), "#6a8a4a", 3);
    for (const s of [-1, 1]) for (const f of [-1, 1]) add(ball(s * 0.12, 0.01, f * 0.1, 0.04, 0.015, 0.03), "#6a8a4a", 1);
  } else if (kind === C_HERON) {
    add(ball(0, 0.62, 0, 0.12, 0.13, 0.24), "#9aa4b0", 0);
    add(ball(0, 0.6, -0.2, 0.08, 0.05, 0.12), "#5a6470", 0);
    // the long neck (an S), the head with its dagger bill and black crest
    const neck = new THREE.CylinderGeometry(0.03, 0.04, 0.42, 5);
    neck.rotateX(0.35);
    neck.translate(0, 0.86, 0.16);
    add(neck, "#e8ecf0", 3);
    add(ball(0, 1.08, 0.24, 0.045, 0.045, 0.06), "#f0f2f4", 3);
    const bill = new THREE.ConeGeometry(0.018, 0.17, 4);
    bill.rotateX(Math.PI / 2);
    bill.translate(0, 1.07, 0.36);
    add(bill, "#e8b030", 3);
    add(ball(0, 1.11, 0.17, 0.012, 0.012, 0.07), "#2a2a30", 3);
    for (const s of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.56, 4);
      leg.translate(s * 0.05, 0.3, 0);
      add(leg, "#a88a5a", s < 0 ? 1 : 2);
    }
  } else if (kind === C_KINGFISHER) {
    add(ball(0, 0.06, 0, 0.035, 0.04, 0.07), "#2a9ae0", 0);
    add(ball(0, 0.04, 0.01, 0.03, 0.028, 0.05), "#f08a2a", 0);
    add(ball(0, 0.1, 0.05, 0.03, 0.03, 0.03), "#2a8ad0", 0);
    const bill = new THREE.ConeGeometry(0.008, 0.06, 4);
    bill.rotateX(Math.PI / 2);
    bill.translate(0, 0.095, 0.1);
    add(bill, "#1a1a1a", 0);
    for (const s of [-1, 1]) add(ball(s * 0.035, 0.07, -0.01, 0.01, 0.025, 0.055), "#1a6ab0", s < 0 ? 1 : 2);
  } else {
    // a dragonfly: a long glittering body and four glassy wings
    add(ball(0, 0, 0, 0.007, 0.007, 0.045), "#2ad0a0", 0);
    add(ball(0, 0, 0.035, 0.009, 0.009, 0.01), "#2a7ae0", 0);
    for (const s of [-1, 1])
      for (const f of [0.012, -0.004]) {
        const w = new THREE.BufferGeometry();
        w.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.002, f, s * 0.05, 0.002, f + 0.006, s * 0.05, 0.002, f - 0.008], 3));
        add(w, "#d8f4ff", s < 0 ? 1 : 2);
      }
  }
  return out;
}

const CRIT_GLSL = /* glsl */ `
  attribute float aKind; attribute float aSub;
  attribute vec4 aWho; // kind, phase, act (0..1: hop / strike / flight), unused
  vec3 critPose( vec3 p ) {
    if ( abs( aKind - aWho.x ) > 0.5 ) return vec3( 0.0 );
    float ph = aWho.y; float act = aWho.z;
    if ( aKind < 0.5 ) {
      // frog: the throat balloons as it croaks; legs kick out on a hop
      if ( aSub > 3.5 ) p = vec3( 0.0, 0.035, 0.035 ) + ( p - vec3( 0.0, 0.035, 0.035 ) ) * ( 1.0 + max( 0.0, sin( ph * 3.0 ) ) * 0.9 * step( act, 0.01 ) );
      if ( aSub > 0.5 && aSub < 1.5 ) p.z -= act * 0.06;
    } else if ( aKind < 1.5 ) {
      if ( aSub > 2.5 ) p.z += sin( ph * 0.7 ) * 0.02;
    } else if ( aKind < 2.5 ) {
      // heron: the neck lunges forward and down to strike; legs stride while wading
      if ( aSub > 2.5 ) { p.z += act * 0.22; p.y -= act * 0.35 * smoothstep( 0.8, 1.1, p.y ); }
      if ( aSub > 0.5 && aSub < 2.5 ) p.z += sin( ph * 2.0 + aSub * 3.1 ) * 0.06 * ( 1.0 - step( 0.4, p.y ) * 0.0 ) * smoothstep( 0.6, 0.0, p.y );
    } else {
      // birds and dragonflies: wings beat (a dragonfly's in a blur)
      if ( aSub > 0.5 && aSub < 2.5 ) {
        float sd = aSub < 1.5 ? -1.0 : 1.0;
        float speed = aKind > 3.5 ? 60.0 : 22.0;
        float a = sin( ph * speed ) * ( aKind > 3.5 ? 0.6 : 0.9 * act );
        float c = cos( a * sd ), s = sin( a * sd );
        vec3 o = vec3( 0.0, p.y, p.z );
        vec3 q = p - o;
        p = o + vec3( c * q.x - s * q.y, s * q.x + c * q.y, q.z );
        if ( aKind < 3.5 ) p.x *= mix( 0.4, 1.0, act );
      }
    }
    return p;
  }
`;

export interface LakeCritters {
  mesh: THREE.InstancedMesh;
  tris: number;
  count: number;
  update(dt: number, t: number, kid: THREE.Vector3, splash: (x: number, z: number, k: number) => void): void;
  dispose(): void;
}

export function buildLakeCritters(spots: WaterSpots, opts: { lowQuality?: boolean } = {}): LakeCritters {
  const low = !!opts.lowQuality;
  const r = rngOf(7733);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k <= C_DRAGONFLY; k++) parts.push(...kindParts(k));
  const geo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const list: Critter[] = [];
  const mk = (kind: number, x: number, y: number, z: number, home = 0) => list.push({ kind, x, y, z, yaw: r() * Math.PI * 2, st: 0, ax: x, ay: y, az: z, bx: x, by: y, bz: z, u: 1, dur: 1, wait: r() * 5, act: 0, home, seed: r() * 100 });
  // frogs on the lily pads
  const pads = spots.pads;
  for (let i = 0; i < Math.min(pads.length, low ? 4 : 8); i++) {
    const p = pads[Math.floor((i * pads.length) / (low ? 4 : 8))];
    mk(C_FROG, p.x, WATER_Y + 0.05, p.z, pads.indexOf(p));
  }
  // turtles along the log
  const L = spots.log;
  for (let i = 0; i < (low ? 2 : 4); i++) {
    const u = (i + 0.5) / (low ? 2 : 4) - 0.5;
    const x = L.x + Math.sin(L.rot) * u * L.len * 0.8;
    const z = L.z + Math.cos(L.rot) * u * L.len * 0.8;
    mk(C_TURTLE, x, WATER_Y + 0.08 + (u + 0.5) * 0.3 + 0.32, z, i);
    list[list.length - 1].yaw = L.rot + (i % 2 ? 0.3 : Math.PI - 0.3);
  }
  // the heron, in the shallows
  {
    const a = 1.2;
    const R = lakeRadius(a) - 1.4;
    mk(C_HERON, LAKE.x + Math.sin(a) * R, WATER_Y - waterDepthAt(LAKE.x + Math.sin(a) * R, LAKE.z + Math.cos(a) * R), LAKE.z + Math.cos(a) * R);
  }
  // the kingfisher on its post
  mk(C_KINGFISHER, spots.post.x, spots.post.y, spots.post.z);
  // dragonflies round the reed beds
  for (let i = 0; i < (low ? 5 : 10); i++) {
    const b = spots.reeds[(i * 3) % Math.max(1, spots.reeds.length)] ?? { x: LAKE.x, z: LAKE.z };
    mk(C_DRAGONFLY, b.x, WATER_Y + 1, b.z, (i * 3) % Math.max(1, spots.reeds.length));
  }
  const n = list.length;
  const who = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4);
  who.setUsage(THREE.DynamicDrawUsage);
  list.forEach((c, i) => who.setXYZW(i, c.kind, c.seed, 0, 0));
  geo.setAttribute("aWho", who);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${CRIT_GLSL}`).replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = critPose( transformed );");
  };
  mat.customProgramCacheKey = () => "lake-critters";
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  im.name = "lake-critters";
  im.count = n;
  im.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const go = (c: Critter, bx: number, by: number, bz: number, dur: number) => {
    c.ax = c.x;
    c.ay = c.y;
    c.az = c.z;
    c.bx = bx;
    c.by = by;
    c.bz = bz;
    c.u = 0;
    c.dur = dur;
    c.st = 1;
    if ((bx - c.x) ** 2 + (bz - c.z) ** 2 > 1e-4) c.yaw = Math.atan2(bx - c.x, bz - c.z);
  };
  return {
    mesh: im,
    count: n,
    tris: (geo.attributes.position.count / 3) * n,
    update(dt, t, kid, splash) {
      const sdt = Math.min(dt, 0.1);
      for (let i = 0; i < n; i++) {
        const c = list[i];
        const kd = Math.hypot(kid.x - c.x, kid.z - c.z);
        let hop = 0;
        if (c.st === 1) {
          c.u = Math.min(1, c.u + sdt / c.dur);
          const u = c.u;
          const ee = u * u * (3 - 2 * u);
          c.x = c.ax + (c.bx - c.ax) * ee;
          c.z = c.az + (c.bz - c.az) * ee;
          const arc = c.kind === C_FROG ? 0.35 : c.kind === C_KINGFISHER ? 0.6 : c.kind === C_HERON ? 1.4 : 0;
          c.y = c.ay + (c.by - c.ay) * ee + Math.sin(Math.PI * u) * arc;
          hop = Math.sin(Math.PI * u);
          if (u >= 1) {
            c.st = c.kind === C_TURTLE && c.by < WATER_Y ? 2 : 0;
            c.wait = c.kind === C_DRAGONFLY ? 0.3 + ((c.seed * 7.3 + t) % 1) * 1.2 : 2 + ((c.seed * 3.1 + t) % 1) * 6;
            if (c.kind === C_KINGFISHER && c.by < WATER_Y) {
              // in with a splash ... and straight back up to the post with a fish
              splash(c.x, c.z, 0.7);
              go(c, spots.post.x, spots.post.y, spots.post.z, 1.1);
            }
            if (c.kind === C_FROG && c.by < WATER_Y) c.st = 2;
          }
        } else if (c.st === 2) {
          // under the water for a bit, then back where it was
          c.wait -= sdt;
          if (c.wait <= 0 && kd > 9) {
            if (c.kind === C_FROG) {
              const p = pads[c.home];
              c.x = p.x;
              c.z = p.z;
              c.y = WATER_Y + 0.05;
            } else {
              const u = (c.home + 0.5) / (low ? 2 : 4) - 0.5;
              c.x = L.x + Math.sin(L.rot) * u * L.len * 0.8;
              c.z = L.z + Math.cos(L.rot) * u * L.len * 0.8;
              c.y = WATER_Y + 0.08 + (u + 0.5) * 0.3 + 0.32;
            }
            c.st = 0;
            c.wait = 4;
          }
        } else {
          c.wait -= sdt;
          if (c.kind === C_FROG) {
            if (kd < 3.2) {
              // plop!
              go(c, c.x + Math.sin(c.yaw) * 0.6, WATER_Y - 0.4, c.z + Math.cos(c.yaw) * 0.6, 0.5);
              splash(c.x, c.z, 0.35);
              c.wait = 6;
            } else if (c.wait <= 0) {
              const p = pads[Math.floor(((c.seed * 13.7 + t) % 1) * pads.length)];
              if (p && Math.hypot(p.x - c.x, p.z - c.z) < 4 && Math.hypot(p.x - c.x, p.z - c.z) > 0.8) {
                c.home = pads.indexOf(p);
                go(c, p.x, WATER_Y + 0.05, p.z, 0.7);
              } else c.wait = 3;
            }
          } else if (c.kind === C_TURTLE) {
            if (kd < 6) {
              go(c, c.x + Math.sin(c.yaw) * 0.8, WATER_Y - 0.5, c.z + Math.cos(c.yaw) * 0.8, 0.9);
              splash(c.x, c.z, 0.3);
              c.wait = 10;
            }
          } else if (c.kind === C_HERON) {
            if (kd < 7) {
              // off it flaps to the far shore
              const a = Math.atan2(c.x - LAKE.x, c.z - LAKE.z) + 1.8;
              const R = lakeRadius(a) - 1.4;
              const x = LAKE.x + Math.sin(a) * R;
              const z = LAKE.z + Math.cos(a) * R;
              go(c, x, WATER_Y - waterDepthAt(x, z), z, 6);
            } else if (c.wait <= 0) {
              // stalk a few steps along the shallows, or stab at a fish
              if (((c.seed + t) % 3) < 1) {
                c.act = 1;
                c.wait = 1.2;
              } else {
                const a = Math.atan2(c.x - LAKE.x, c.z - LAKE.z) + 0.05;
                const R = lakeRadius(a) - 1.2;
                const x = LAKE.x + Math.sin(a) * R;
                const z = LAKE.z + Math.cos(a) * R;
                go(c, x, Math.max(WATER_Y - waterDepthAt(x, z), groundY(x, z)), z, 3);
              }
            }
            c.act = Math.max(0, c.act - sdt * 1.2);
          } else if (c.kind === C_KINGFISHER) {
            if (c.wait <= 0) {
              const a = (c.seed + t) * 1.7;
              go(c, spots.post.x + Math.sin(a) * 4, WATER_Y - 0.2, spots.post.z + Math.cos(a) * 4, 0.9);
            }
          } else {
            // a dragonfly: hover (with a jitter), then dash to another spot by the reeds
            const b = spots.reeds[c.home] ?? { x: LAKE.x, z: LAKE.z };
            c.x += Math.sin(t * 9 + c.seed) * 0.004;
            c.y += Math.cos(t * 7 + c.seed) * 0.003;
            if (c.wait <= 0) {
              const a = (c.seed * 5 + t * 3) % (Math.PI * 2);
              const d = 1 + ((c.seed + t) % 1) * 3.5;
              go(c, b.x + Math.sin(a) * d, WATER_Y + 0.6 + ((c.seed * 2 + t) % 1) * 1.1, b.z + Math.cos(a) * d, 0.35);
            }
          }
        }
        const fly = c.kind === C_KINGFISHER || c.kind === C_HERON ? (c.st === 1 ? 1 : 0) : 0;
        who.setY(i, t + c.seed);
        who.setZ(i, c.kind === C_FROG ? hop : c.kind === C_HERON ? (c.st === 1 && c.dur > 4 ? 0 : c.act) : fly);
        e.set(c.kind === C_KINGFISHER && c.st === 1 ? (c.by < c.ay ? 0.9 : -0.4) : 0, c.yaw, 0, "YXZ");
        const hidden = c.st === 2;
        m4.compose(v.set(c.x, hidden ? -500 : c.y, c.z), q.setFromEuler(e), s3.setScalar(U));
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      who.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      im.dispose();
    },
  };
}
