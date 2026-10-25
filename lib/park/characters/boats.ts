// The boats and submarines kids find moored round Cucaino Park's harbours (placed by
// lib/park/registry/harbours.ts, drawn idle by lib/park/world/rideables/fleet.ts), built at TRUE
// SIZE in world units (1 m = 1.6 units; the kid is 2.26 tall) in the candy-storybook style:
//   - Duck Pedalo (~3.4 m): a big yellow rubber-duck pedalo with a paddle wheel. A shore boat.
//   - Candy Sailboat (~6 m): a little cutter with a billowing candy-striped mainsail and a jib
//   - Rocket Boat (~5.5 m): a speedboat with a wraparound windscreen and a big outboard; its nose
//     lifts as it gets up on the plane (the world draws its wake and spray)
//   - Pirate Ship (~14 m): the showpiece - purple hull, gold trim, striped square sails, cannons,
//     a stern castle with glowing windows, and the kid at the helm on the quarterdeck
//   - Bubble Sub (~4 m): a yellow sub with a glass bubble the kid stands in, headlights, portholes,
//     a periscope and a propeller in a ring
//   - Deep Explorer: a bathysphere - a glass ball in an orange float frame with big lamps, side
//     thrusters and a grabber arm; it can go all the way down the Midnight Rift
// Each builder adds parts to the mount kit (mounts.ts bakes them into one skinned mesh); subs also
// get one glass bubble mesh afterwards (craftGlassMaterial, shared). Root conventions:
//   - boats: y = 0 is the sea surface (hulls are modelled below it), +z is the bow
//   - subs: y = 0 is the hull's axis; surfaced they ride at WATER_Y + SUB_CAPS.surf
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type V3 = [number, number, number];
type CraftKind = "pedalo" | "sailboat" | "speedboat" | "ship" | "sub" | "deepsub";

/** the parts kit buildMount hands over (see mounts.ts) */
export interface CraftKit {
  body: THREE.Bone;
  sc: THREE.Group;
  mesh(g: THREE.BufferGeometry, col: string, glow?: boolean): THREE.Mesh;
  bone(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Bone;
  tube(parent: THREE.Object3D, a: V3, b: V3, r: number, col: string, seg?: number): THREE.Mesh;
  flat(pts: [number, number][], depth: number, bevel?: number, curve?: number): THREE.BufferGeometry;
  eyes(parent: THREE.Object3D, x: number, y: number, z: number, r: number, blush?: boolean): THREE.Bone[];
  main: string;
  accent: string;
}

export interface CraftParts {
  /** where the kid's feet go / the pet's (root space, before MOUNT_SCALE - which is 1 for craft) */
  seat: V3;
  pet: V3;
  anim: (t: number, dt: number, speed: number, airborne: boolean) => void;
  /** after baking: add the non-skinned parts (a sub's glass) */
  after?: (body: THREE.Bone) => void;
  eyes?: THREE.Bone[];
}

/** a sub's glass bubble in root space (centre + radius): the rig's bubble, and the fleet's instanced ones */
export const CRAFT_GLASS: Partial<Record<CraftKind, { x: number; y: number; z: number; r: number }>> = {
  sub: { x: 0, y: 1.5, z: 0.9, r: 1.5 },
  deepsub: { x: 0, y: 0.35, z: 0.55, r: 1.65 },
};
/** headlamps (root space): where each headlight beam starts; beams shine along +z, tipped down a touch */
export const CRAFT_LAMPS: Partial<Record<CraftKind, V3[]>> = {
  sub: [[-0.55, -0.2, 3.15], [0.55, -0.2, 3.15]],
  deepsub: [[-1.55, 1.55, 3.05], [1.55, 1.55, 3.05]],
};
/** where the propeller is (root space): bubbles / the wake start here */
export const CRAFT_PROP: Record<CraftKind, V3> = {
  pedalo: [0, 0, -2.75],
  sailboat: [0, 0, -4.5],
  speedboat: [0, -0.5, -4.9],
  ship: [0, 0, -10.8],
  sub: [0, 0, -3.45],
  deepsub: [0, 0.2, -1.6],
};

// ── the see-through glass (fresnel rim, a bright highlight, fogged like the rest) ──
let glassMat: THREE.ShaderMaterial | null = null;
/** one glass material for every bubble (rig meshes and the fleet's InstancedMesh) */
export function craftGlassMaterial(): THREE.ShaderMaterial {
  if (glassMat) return glassMat;
  glassMat = new THREE.ShaderMaterial({
    name: "craft:glass",
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTint: { value: new THREE.Color("#bff0ff") } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main() {
        mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vL = position;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uTint;
      varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main() {
        vec3 n = normalize(vN);
        float f = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
        // a soft window-shaped glint up on one side, and a thin bright rim
        float glint = smoothstep(0.82, 0.95, dot(normalize(vL), normalize(vec3(-0.45, 0.75, 0.45))));
        vec3 col = mix(uTint, vec3(1.0), f * 0.6 + glint);
        float a = 0.14 + f * 0.7 + glint * 0.6;
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  return glassMat;
}

// ── shapes ──

export interface Part {
  g: THREE.BufferGeometry;
  c: string;
}

/**
 * A boat hull lofted from cross-sections, open on top: outer skin (in colour bands from the
 * gunwale down), a see-through-proof inner skin, a gunwale rail, a flat floor (or deck) at
 * `floorY`, and optional closed decks over parts of it. u = 0 is the stern (a flat transom when
 * width(0) > 0), u = 1 the bow. Exported so world/sea/fishingBoats.ts can loft its own (unskinned,
 * instanced) little trawler hull from the very same cross-section math — a proper curved, tapered
 * hull instead of boxes, with no skeleton/skinning involved.
 */
export function hull(o: {
  len: number;
  beam: number;
  width: (u: number) => number;
  sheer: (u: number) => number;
  keel: (u: number) => number;
  /** superellipse fullness of the sections (2 = round, higher = boxier, lower = V) */
  n: number;
  bands: [number, string][];
  inner: string;
  rail: string;
  railR: number;
  floorY: number;
  floor: string;
  decks?: { u0: number; u1: number; y: number; col: string }[];
  /** close the bow with a cap too (for blunt bows) */
  bowCap?: boolean;
  NU?: number;
  NV?: number;
}): Part[] {
  const NU = o.NU ?? 18;
  const NV = o.NV ?? 12;
  const parts: Part[] = [];
  const e = 2 / o.n;
  const pt = (u: number, phi: number, shrink: number): THREE.Vector3 => {
    const hw = Math.max(0, (o.beam / 2) * o.width(u) - shrink);
    const c = -Math.cos(phi);
    const s = Math.sin(phi);
    const sh = o.sheer(u);
    const kl = Math.max(0.05, o.keel(u) - shrink);
    const x = hw * Math.sign(c) * Math.pow(Math.abs(c), e);
    const y = sh - (sh + kl) * Math.pow(Math.abs(s), e);
    return new THREE.Vector3(x, y, -o.len / 2 + u * o.len);
  };
  const skin = (phiA: number, phiB: number, shrink: number, flip: boolean) => {
    const nv = Math.max(2, Math.round((NV * (phiB - phiA)) / Math.PI));
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      for (let j = 0; j <= nv; j++) {
        const p = pt(u, phiA + ((phiB - phiA) * j) / nv, shrink);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j;
        const b = a + nv + 1;
        // (outer skin: normals out; flip = the inner skin, normals in)
        if (!flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // outer skin in bands (fractions of the half-section: 0 = gunwale, 1 = keel)
  let f0 = 0;
  for (const [f1, col] of o.bands) {
    const a = (f0 * Math.PI) / 2;
    if (f1 >= 1) parts.push({ g: skin(a, Math.PI - a, 0, false), c: col });
    else {
      const b = (f1 * Math.PI) / 2;
      parts.push({ g: skin(a, b, 0, false), c: col });
      parts.push({ g: skin(Math.PI - b, Math.PI - a, 0, false), c: col });
    }
    f0 = f1;
  }
  const t = o.railR * 0.9;
  parts.push({ g: skin(0, Math.PI, t, true), c: o.inner });
  // transom (and bow) caps: fans across the end section, outer face + inner face
  const cap = (u: number, shrink: number, outward: number) => {
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j <= NV; j++) ring.push(pt(u, (Math.PI * j) / NV, shrink));
    const pos: number[] = [];
    const top = (ring[0].y + ring[NV].y) / 2;
    for (let j = 0; j < NV; j++) {
      const a = ring[j];
      const b = ring[j + 1];
      const c = new THREE.Vector3((a.x + b.x) / 2, top, a.z);
      // (fan from the middle of the top edge)
      if (outward < 0) pos.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z);
      else pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  if (o.width(0) > 0.01) {
    parts.push({ g: cap(0, 0, -1), c: o.bands[o.bands.length - 1][1] });
    parts.push({ g: cap(0.002, t, 1), c: o.inner });
  }
  if (o.bowCap && o.width(1) > 0.01) {
    parts.push({ g: cap(1, 0, 1), c: o.bands[o.bands.length - 1][1] });
    parts.push({ g: cap(0.998, t, -1), c: o.inner });
  }
  // the gunwale rail
  const railPts: THREE.Vector3[] = [];
  for (let i = 0; i <= NU; i++) railPts.push(pt(i / NU, 0, t / 2));
  for (let i = NU; i >= 0; i--) railPts.push(pt(i / NU, Math.PI, t / 2));
  const closed = o.width(0) > 0.01;
  const curve = new THREE.CatmullRomCurve3(railPts, closed, "centripetal");
  parts.push({ g: new THREE.TubeGeometry(curve, NU * 4, o.railR, 5, closed), c: o.rail });
  // floor / deck: the inner skin's width at floorY, along the length
  const halfAt = (u: number, y: number) => {
    const sh = o.sheer(u);
    const kl = Math.max(0.05, o.keel(u) - t);
    const k = (sh - y) / (sh + kl);
    if (k <= 0 || k >= 1) return k <= 0 ? Math.max(0, (o.beam / 2) * o.width(u) - t) : 0;
    const s = Math.pow(k, o.n / 2);
    const c = Math.sqrt(Math.max(0, 1 - s * s));
    return Math.max(0, (o.beam / 2) * o.width(u) - t) * Math.pow(c, e);
  };
  const strip = (u0: number, u1: number, y: number | ((u: number) => number), half: (u: number) => number) => {
    const pos: number[] = [];
    const n = Math.max(2, Math.round(NU * (u1 - u0)));
    for (let i = 0; i < n; i++) {
      const ua = u0 + ((u1 - u0) * i) / n;
      const ub = u0 + ((u1 - u0) * (i + 1)) / n;
      const ya = typeof y === "number" ? y : y(ua);
      const yb = typeof y === "number" ? y : y(ub);
      const za = -o.len / 2 + ua * o.len;
      const zb = -o.len / 2 + ub * o.len;
      const wa = half(ua);
      const wb = half(ub);
      pos.push(-wa, ya, za, wb, yb, zb, wa, ya, za, -wa, ya, za, -wb, yb, zb, wb, yb, zb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  parts.push({ g: strip(0.004, 0.996, o.floorY, (u) => halfAt(u, o.floorY)), c: o.floor });
  for (const d of o.decks ?? []) parts.push({ g: strip(d.u0, d.u1, (u) => Math.min(d.y, o.sheer(u) - 0.02), (u) => halfAt(u, Math.min(d.y, o.sheer(u) - 0.02))), c: d.col });
  return parts;
}

/** a sail: a grid surface bellied out along x, in horizontal candy bands, two-sided */
function sail(o: {
  /** corner points in the sail's plane (y up, z along): luff bottom, luff top, leech top, leech bottom */
  quad: [[number, number], [number, number], [number, number], [number, number]];
  belly: number;
  bands: string[];
  /** bulge direction (+1 = +x) */
  side?: number;
  /** a square sail hangs across the boat: the plane is x/y and it bulges along +z */
  square?: boolean;
}): Part[] {
  const [lb, lt, rt, rb] = o.quad;
  const NB = o.bands.length;
  const NA = 6;
  const NC = 6;
  const out: Part[] = [];
  const P = (a: number, c: number) => {
    // a: 0..1 up the sail, c: 0..1 across it
    const ly = lb[0] + (lt[0] - lb[0]) * a;
    const lz = lb[1] + (lt[1] - lb[1]) * a;
    const ry = rb[0] + (rt[0] - rb[0]) * a;
    const rz = rb[1] + (rt[1] - rb[1]) * a;
    const y = ly + (ry - ly) * c;
    const z = lz + (rz - lz) * c;
    const b = o.belly * Math.sin(Math.PI * c) * (o.square ? Math.sin(Math.PI * (0.15 + a * 0.85)) : 1 - a * 0.55) * (o.side ?? 1);
    return o.square ? new THREE.Vector3(z, y, b) : new THREE.Vector3(b, y, z);
  };
  for (let k = 0; k < NB; k++) {
    const pos: number[] = [];
    const a0 = k / NB;
    const a1 = (k + 1) / NB;
    for (let i = 0; i < NA; i++)
      for (let j = 0; j < NC; j++) {
        const aa = a0 + ((a1 - a0) * i) / NA;
        const ab = a0 + ((a1 - a0) * (i + 1)) / NA;
        const ca = j / NC;
        const cb = (j + 1) / NC;
        const p = [P(aa, ca), P(aa, cb), P(ab, cb), P(ab, ca)];
        // front + back faces
        for (const [x, y, z] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) pos.push(p[x].x, p[x].y, p[x].z, p[y].x, p[y].y, p[y].z, p[z].x, p[z].y, p[z].z);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    out.push({ g, c: o.bands[k] });
  }
  return out;
}

/** a flag on a pole top: a little waving pennant (attach to a bone that flutters) */
function pennant(col: string, len: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = [0, h / 2, 0, 0, -h / 2, 0, 0, 0, -len, 0, -h / 2, 0, 0, h / 2, 0, 0, 0, -len];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  void col;
  return g;
}

/** a star outline (for decals and figureheads) */
function starPts(r0: number, r1: number, n = 5): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r1 : r0;
    out.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return out;
}

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// ── the builders ──

export function buildCraftParts(kind: CraftKind, k: CraftKit): CraftParts {
  const { body, mesh, bone, tube, flat, main, accent } = k;
  const put = (parent: THREE.Object3D, g: THREE.BufferGeometry, col: string, x = 0, y = 0, z = 0, glow = false) => {
    const m = mesh(g, col, glow);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const addParts = (parent: THREE.Object3D, ps: Part[]) => ps.forEach((p) => put(parent, p.g, p.c));
  /** a life ring facing sideways (red + white quarters) */
  const lifeRing = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, rotY: number) => {
    for (let q = 0; q < 4; q++) {
      const m = put(parent, new THREE.TorusGeometry(r, r * 0.3, 5, 6, Math.PI / 2), q % 2 ? "#ffffff" : "#ff4a5a", x, y, z);
      m.rotation.set(0, rotY, (q * Math.PI) / 2);
    }
  };
  const propeller = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, col: string, blades = 3) => {
    const p = bone(parent, x, y, z);
    put(p, new THREE.SphereGeometry(r * 0.28, 8, 6), col);
    for (let i = 0; i < blades; i++) {
      const b = put(p, new THREE.BoxGeometry(r * 0.36, r, r * 0.08), col);
      const a = (i / blades) * Math.PI * 2;
      b.position.set(Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55, 0);
      b.rotation.set(0, 0.5, -a);
    }
    return p;
  };

  if (kind === "pedalo") {
    // ── Duck Pedalo: a tubby yellow duck hull, the kid sits in the middle, a paddle wheel behind ──
    const yel = main;
    addParts(body, hull({
      len: 5.2, beam: 2.7, n: 2.8, NU: 14, NV: 10,
      width: (u) => Math.pow(Math.sin(Math.PI * (0.06 + u * 0.86)), 0.45),
      sheer: (u) => 0.95 + 0.25 * u * u,
      keel: () => 0.42,
      bands: [[0.16, "#ffffff"], [1, yel]],
      inner: "#fff1b8", rail: "#ff9a3c", railR: 0.12, floorY: 0.12, floor: "#ffe6a0", bowCap: true,
    }));
    // the duck: a chubby chest over the bow, a short neck, a big round head, a big orange beak
    const chest = put(body, new THREE.SphereGeometry(1, 12, 9), yel, 0, 1.05, 1.75);
    chest.scale.set(1.0, 0.75, 0.85);
    const neck = bone(body, 0, 1.5, 1.95);
    tube(neck, [0, 0, 0], [0, 0.7, 0.12], 0.5, yel, 12);
    const head = bone(neck, 0, 1.15, 0.2);
    put(head, new THREE.SphereGeometry(0.85, 14, 11), yel);
    const beak = put(head, new THREE.SphereGeometry(0.5, 10, 7), "#ff8a2a", 0, -0.18, 0.78);
    beak.scale.set(1.15, 0.38, 1.1);
    const beak2 = put(head, new THREE.SphereGeometry(0.42, 10, 6), "#ff9a3c", 0, -0.32, 0.7);
    beak2.scale.set(1.0, 0.3, 0.95);
    const eyesL = k.eyes(head, 0.36, 0.2, 0.68, 0.15);
    for (const [x, y, z, r] of [[0, 0.86, -0.05, 0.18], [0.14, 0.8, -0.28, 0.13], [-0.12, 0.78, 0.14, 0.12]] as const) put(head, new THREE.SphereGeometry(r, 7, 5), yel, x, y, z);
    // folded wings up on the gunwales, and a perky tail at the back
    for (const s of [-1, 1]) {
      const w = put(body, new THREE.SphereGeometry(1, 10, 7), "#ffe680", s * 1.2, 1.0, -0.55);
      w.scale.set(0.3, 0.42, 1.25);
      w.rotation.set(0.12, s * 0.06, s * -0.25);
      const tip = put(body, new THREE.ConeGeometry(0.28, 0.8, 8), "#ffe680", s * 1.18, 1.2, -1.7);
      tip.rotation.set(-1.9, 0, s * 0.2);
    }
    const tail = put(body, new THREE.ConeGeometry(0.55, 1.2, 10), yel, 0, 1.45, -2.25);
    tail.rotation.x = -0.65;
    // a cushioned bench behind the kid (the backrest has a heart on it), a life ring
    put(body, new RoundedBoxGeometry(2.0, 0.42, 0.75, 2, 0.12), accent, 0, 0.42, -1.05);
    const back = put(body, new RoundedBoxGeometry(2.0, 0.95, 0.26, 2, 0.12), accent, 0, 1.05, -1.4);
    back.rotation.x = -0.18;
    const heart = put(body, flat([[0, -0.28], [0.3, 0.02], [0.24, 0.2], [0.12, 0.24], [0, 0.12], [-0.12, 0.24], [-0.24, 0.2], [-0.3, 0.02]], 0.06, 0.02, 1), "#ffffff", 0, 1.1, -1.24);
    heart.rotation.x = Math.PI / 2 - 0.18;
    lifeRing(body, 1.33, 0.62, 0.75, 0.32, Math.PI / 2);
    // the paddle wheel under the tail (turns as you pedal), under a candy cover
    const wheel = bone(body, 0, 0.12, -2.72);
    put(wheel, new THREE.CylinderGeometry(0.16, 0.16, 1.0, 8), "#ffffff").rotation.z = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const p = put(wheel, new THREE.BoxGeometry(0.9, 0.12, 0.42), i % 2 ? "#6cc4ff" : "#ffffff");
      const a = (i / 6) * Math.PI * 2;
      p.position.set(0, Math.cos(a) * 0.42, Math.sin(a) * 0.42);
      p.rotation.x = a;
    }
    const cover = put(body, new THREE.CylinderGeometry(0.7, 0.7, 1.1, 12, 1, true, -Math.PI / 2, Math.PI), accent, 0, 0.18, -2.72);
    cover.rotation.z = Math.PI / 2;
    let roll = 0;
    return {
      seat: [0, 0.15, -0.3],
      pet: [0, 0.18, 0.75],
      eyes: eyesL,
      anim: (t, dt, speed) => {
        roll += speed * dt * 1.6;
        wheel.rotation.x = roll;
        body.position.y = Math.sin(t * 1.7) * 0.035;
        neck.rotation.x = Math.sin(t * 1.1) * 0.05 - Math.min(0.12, speed * 0.01);
        head.rotation.y = Math.sin(t * 0.37) * 0.25;
        head.rotation.z = Math.sin(t * 0.8) * 0.05;
      },
    };
  }

  if (kind === "sailboat") {
    // ── Candy Sailboat: a sky-blue cutter, white topsides, a striped mainsail on a swinging boom ──
    addParts(body, hull({
      len: 9.2, beam: 3.6, n: 2.1,
      width: (u) => Math.min(1, Math.pow(1 - u, 0.62) * (0.8 + 0.42 * Math.sin(Math.PI * Math.min(1, u * 1.3)))),
      sheer: (u) => 0.85 + 0.5 * u * u,
      keel: (u) => 0.75 * (1 - Math.pow(u, 3)) + 0.1,
      bands: [[0.2, "#ffffff"], [0.3, "#ff5fa8"], [1, main]],
      inner: "#fff2dc", rail: "#c98a48", railR: 0.1, floorY: 0.22, floor: "#e0a860",
      decks: [{ u0: 0.56, u1: 0.995, y: 1.6, col: "#f0c890" }],
    }));
    // a little fin keel + rudder (you see them when you swim under)
    put(body, flat([[0, 0], [1.2, 0], [0.9, -1.4], [0.2, -1.4]], 0.16), "#3a5f9a", 0, -0.5, -0.3).rotation.z = -Math.PI / 2;
    const rud = put(body, flat([[0, 0.4], [0.7, 0.4], [0.5, -1.1], [0, -1.1]], 0.12), "#3a5f9a", 0, -0.1, -4.55);
    rud.rotation.z = -Math.PI / 2;
    // tiller
    tube(body, [0, 0.95, -4.55], [0, 1.0, -3.2], 0.05, "#c98a48");
    // the mast, the forestay, the masthead star
    const mastZ = 1.15;
    tube(body, [0, 0.2, mastZ], [0, 12.4, mastZ], 0.12, "#fff6f0", 8);
    tube(body, [0, 11.2, mastZ], [0, 1.65, 4.45], 0.025, "#d8d0e8", 4);
    for (const s of [-1, 1]) tube(body, [0, 10.5, mastZ], [s * 1.7, 0.95, mastZ - 0.4], 0.02, "#d8d0e8", 4);
    const star = put(body, flat(starPts(0.32, 0.14), 0.08, 0.02, 1), "#ffe36b", 0, 12.6, mastZ, true);
    star.rotation.x = Math.PI / 2;
    // the boom swings round the mast; the mainsail rides on it (it billows as you sail)
    const boom = bone(body, 0, 2.75, mastZ);
    tube(boom, [0, 0, 0], [0, 0, -4.7], 0.09, "#c98a48");
    const mainS = bone(boom, 0, 0, 0);
    addParts(mainS, sail({ quad: [[0.1, -0.05], [9.3, -0.05], [9.3, -0.35], [0.1, -4.6]], belly: 0.7, bands: ["#ff5fa8", "#ffffff", "#ff9ad0", "#ffffff", "#ffe45c"] }));
    // the jib, out at the bow
    const jib = bone(body, 0, 0, 0);
    {
      const g = new THREE.BufferGeometry();
      const A = new THREE.Vector3(0, 1.75, 4.3);
      const B = new THREE.Vector3(0, 10.6, mastZ + 0.2);
      const C = new THREE.Vector3(0, 2.0, mastZ + 0.4);
      const pos: number[] = [];
      const N = 6;
      const P = (a: number, b: number) => {
        const p = A.clone().multiplyScalar(1 - a - b).addScaledVector(B, a).addScaledVector(C, b);
        p.x = 0.5 * Math.sin(Math.PI * Math.min(1, b * 1.7)) * (1 - a) * 1.2;
        return p;
      };
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N - i; j++) {
          const tri = [[i, j], [i + 1, j], [i, j + 1]];
          const tri2 = [[i + 1, j], [i + 1, j + 1], [i, j + 1]];
          for (const tt of j + i + 1 < N ? [tri, tri2] : [tri]) {
            const p = tt.map(([a, b]) => P(a / N, b / N));
            pos.push(p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z, p[2].x, p[2].y, p[2].z);
            pos.push(p[0].x, p[0].y, p[0].z, p[2].x, p[2].y, p[2].z, p[1].x, p[1].y, p[1].z);
          }
        }
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      put(jib, g, "#6cc4ff");
    }
    const flag = bone(body, 0, 12.0, mastZ - 0.1);
    put(flag, pennant(accent, 1.4, 0.55), accent);
    // a life ring on the stern, port/starboard lights at the bow
    lifeRing(body, 0, 0.6, -4.62, 0.36, 0);
    put(body, new THREE.SphereGeometry(0.12, 6, 5), "#ff4060", -0.75, 1.35, 3.6, true);
    put(body, new THREE.SphereGeometry(0.12, 6, 5), "#5fff8a", 0.75, 1.35, 3.6, true);
    // a cushion bench across the cockpit
    put(body, new RoundedBoxGeometry(2.6, 0.32, 0.8, 2, 0.1), accent, 0, 0.62, -3.3);
    return {
      seat: [0, 0.22, -1.9],
      pet: [0, 0.78, -3.3],
      anim: (t, dt, speed) => {
        const go = Math.min(1, speed / 12);
        boom.rotation.y = 0.32 + Math.sin(t * 0.35) * 0.08 + go * 0.12;
        mainS.scale.x = 0.85 + go * 0.35 + Math.sin(t * 2.3) * 0.06;
        jib.scale.x = 0.8 + go * 0.4 + Math.sin(t * 2.1 + 1) * 0.06;
        flag.rotation.y = 0.4 + go * 0.2 + Math.sin(t * (5 + go * 6)) * 0.35;
        body.position.y = Math.sin(t * 1.3) * 0.05;
      },
    };
  }

  if (kind === "speedboat") {
    // ── Rocket Boat: a deep-V red speedboat, white foredeck with a yellow stripe, big outboard ──
    addParts(body, hull({
      len: 8.6, beam: 3.3, n: 1.55,
      width: (u) => Math.min(1, Math.pow(1 - u, 0.7) * (0.86 + 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.4)))),
      sheer: (u) => 0.8 + 0.42 * u,
      keel: (u) => 0.55 * (1 - Math.pow(u, 4)) + 0.08,
      bands: [[0.22, "#ffffff"], [0.34, "#ffe45c"], [1, main]],
      inner: "#f6eefe", rail: "#e8e4f0", railR: 0.09, floorY: 0.16, floor: "#d8d0f0",
      decks: [{ u0: 0.52, u1: 0.995, y: 1.25, col: main }, { u0: 0.004, u1: 0.12, y: 0.86, col: main }],
    }));
    // racing stripes up the foredeck, a lightning star on each side
    for (const [x, w, c] of [[0, 0.5, "#ffffff"], [0, 0.22, "#ffe45c"]] as const) {
      const stripe = put(body, new THREE.BoxGeometry(w, 0.05 + (c === "#ffe45c" ? 0.01 : 0), 3.5), c, x, 1.33 + (c === "#ffe45c" ? 0.01 : 0), 2.3);
      stripe.rotation.x = 0.085;
    }
    for (const s of [-1, 1]) {
      const st = put(body, flat(starPts(0.42, 0.18), 0.05, 0.015, 1), "#ffe45c", s * 1.42, 0.62, 1.4, true);
      st.rotation.set(0, 0, s * Math.PI / 2);
    }
    // a wraparound windscreen with a frame
    const ws = put(body, new THREE.CylinderGeometry(1.45, 1.45, 0.62, 16, 1, true, -1.1, 2.2), "#bfefff", 0, 1.55, -0.1);
    ws.scale.set(1, 1, 0.55);
    const wf = put(body, new THREE.TorusGeometry(1.45, 0.05, 4, 16, 2.2), "#e8e4f0", 0, 1.86, -0.1);
    wf.rotation.set(Math.PI / 2, 0, -Math.PI / 2 - 1.1);
    wf.scale.set(1, 0.55, 1);
    // two bucket seats and a steering wheel
    for (const s of [-0.6, 0.6]) {
      put(body, new RoundedBoxGeometry(0.8, 0.3, 0.8, 2, 0.1), accent, s, 0.42, -1.35);
      const bk = put(body, new RoundedBoxGeometry(0.8, 0.9, 0.22, 2, 0.08), accent, s, 0.85, -1.85);
      bk.rotation.x = -0.15;
    }
    tube(body, [-0.6, 0.6, -0.45], [-0.6, 1.25, -0.75], 0.05, "#3a3040");
    const wheelG = put(body, new THREE.TorusGeometry(0.28, 0.05, 5, 14), "#3a3040", -0.6, 1.28, -0.78);
    wheelG.rotation.x = -0.7;
    // the outboard motor: a candy cowling on a stalk with the propeller underneath
    const motor = bone(body, 0, 1.0, -4.55);
    put(motor, new RoundedBoxGeometry(0.85, 1.1, 0.95, 2, 0.18), "#fff6f0", 0, 0.25, -0.2);
    put(motor, new THREE.BoxGeometry(0.88, 0.16, 0.98), accent, 0, 0.42, -0.2);
    tube(motor, [0, -0.2, -0.25], [0, -1.45, -0.32], 0.11, "#3a3040");
    put(motor, flat([[0, 0], [0.5, 0], [0.4, -0.5], [0, -0.5]], 0.06), "#3a3040", 0, -1.25, -0.3).rotation.z = -Math.PI / 2;
    const prop = propeller(motor, 0, -1.5, -0.35, 0.42, "#e8e4f0");
    // a headlight and a flag
    put(body, new THREE.SphereGeometry(0.16, 8, 6), "#fff6c0", 0, 1.48, 4.05, true);
    const flag = bone(body, 0, 2.6, -4.3);
    tube(body, [0, 0.86, -4.3], [0, 2.7, -4.3], 0.025, "#e8e4f0", 4);
    put(flag, pennant(accent, 1.0, 0.45), accent);
    let spin = 0;
    return {
      seat: [-0.6, 0.16, -1.0],
      pet: [0.6, 0.5, -1.3],
      anim: (t, dt, speed) => {
        // up on the plane: the nose lifts, the stern squats, and it slaps over the chop
        const plane = smooth(6, 26, speed);
        spin += dt * (4 + speed * 2.2);
        prop.rotation.z = spin;
        body.rotation.x = -0.1 * plane + Math.sin(t * 9.5) * 0.012 * plane;
        body.position.y = 0.16 * plane + Math.abs(Math.sin(t * 4.7)) * 0.05 * plane + Math.sin(t * 1.4) * 0.03;
        motor.rotation.x = -0.08 * plane;
        flag.rotation.y = Math.sin(t * (6 + plane * 10)) * (0.25 + plane * 0.3);
      },
    };
  }

  if (kind === "ship") {
    // ── the Pirate Ship: purple hull with a gold rail, pink below, striped sails, cannons, a
    //    stern castle with glowing windows; the kid stands at the wheel on the quarterdeck ──
    const purple = main;
    const deckY = 1.95;
    addParts(body, hull({
      len: 21, beam: 7, n: 2.5, NU: 22, NV: 14,
      width: (u) => Math.min(1, Math.pow(1 - u, 0.5) * (0.84 + 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.3)))),
      sheer: (u) => 3.0 + 1.0 * Math.pow(u, 3) + 0.3 * (1 - smooth(0, 0.25, u)),
      keel: (u) => 1.7 * (1 - Math.pow(u, 5)) + 0.15,
      bands: [[0.1, "#ffd36b"], [0.5, purple], [0.56, "#ffd36b"], [1, "#ff8fc8"]],
      inner: "#d9a46a", rail: "#ffd36b", railR: 0.16, floorY: deckY, floor: "#e8b878",
    }));
    // the stern castle: a raised quarterdeck with glowing windows on the back
    const qY = 3.75;
    const castle = put(body, new RoundedBoxGeometry(5.6, qY - deckY + 0.6, 4.4, 2, 0.2), purple, 0, (qY + deckY) / 2 - 0.3, -8.1);
    void castle;
    put(body, new THREE.BoxGeometry(5.5, 0.12, 4.3), "#e8b878", 0, qY + 0.02, -8.1);
    put(body, new THREE.BoxGeometry(5.8, 0.16, 4.6), "#ffd36b", 0, qY - 0.06, -8.1);
    // rail round the quarterdeck: posts + a top rail
    for (const [ax, az, bx, bz] of [[-2.7, -10.2, -2.7, -6.0], [2.7, -10.2, 2.7, -6.0], [-2.7, -10.2, 2.7, -10.2]] as const) {
      tube(body, [ax, qY + 0.75, az], [bx, qY + 0.75, bz], 0.07, "#ffd36b", 5);
      const n = Math.round(Math.hypot(bx - ax, bz - az) / 0.9);
      for (let i = 0; i <= n; i++) tube(body, [ax + ((bx - ax) * i) / n, qY, az + ((bz - az) * i) / n], [ax + ((bx - ax) * i) / n, qY + 0.75, az + ((bz - az) * i) / n], 0.05, "#ffd36b", 4);
    }
    for (let i = 0; i < 3; i++) {
      const w = put(body, new THREE.BoxGeometry(0.75, 0.6, 0.06), "#ffe9a0", -1.6 + i * 1.6, 2.95, -10.33, true);
      void w;
      put(body, new THREE.BoxGeometry(0.95, 0.8, 0.04), "#ffd36b", -1.6 + i * 1.6, 2.95, -10.31);
    }
    // the steps up to the quarterdeck
    for (let i = 0; i < 4; i++) put(body, new THREE.BoxGeometry(1.4, 0.18, 0.4), "#c98a48", 1.8, deckY + 0.2 + i * 0.44, -5.65 + i * -0.0 + 0.35 - i * 0.02);
    // the ship's wheel on a post, gold handles
    tube(body, [0, qY, -6.6], [0, qY + 1.0, -6.6], 0.12, "#c98a48");
    const wheel = bone(body, 0, qY + 1.25, -6.45);
    put(wheel, new THREE.TorusGeometry(0.55, 0.06, 5, 16), "#c98a48");
    for (let i = 0; i < 8; i++) {
      const sp = put(wheel, new THREE.BoxGeometry(0.05, 1.4, 0.05), "#c98a48");
      sp.rotation.z = (i / 8) * Math.PI;
      if (i < 8) {
        const a = (i / 8) * Math.PI * 2;
        put(wheel, new THREE.SphereGeometry(0.07, 5, 4), "#ffd36b", Math.sin(a) * 0.72, Math.cos(a) * 0.72, 0, true);
      }
    }
    // lanterns on the stern corners
    for (const s of [-1, 1]) {
      tube(body, [s * 2.6, qY + 0.75, -10.2], [s * 2.6, qY + 1.5, -10.2], 0.05, "#3a3040", 4);
      put(body, new THREE.SphereGeometry(0.24, 8, 6), "#ffd36b", s * 2.6, qY + 1.65, -10.2, true);
    }
    // cannons poking out of gun ports
    for (const s of [-1, 1])
      for (const z of [-3.2, 0.2, 3.6]) {
        const half = 3.5 * Math.min(1, Math.pow(1 - (z + 10.5) / 21, 0.5) * (0.84 + 0.3 * Math.sin(Math.PI * Math.min(1, ((z + 10.5) / 21) * 1.3))));
        put(body, new THREE.BoxGeometry(0.06, 0.75, 0.9), "#3a2a4a", s * (half + 0.0), 2.55, z);
        const c = put(body, new THREE.CylinderGeometry(0.2, 0.26, 1.2, 8), "#3a3040", s * (half + 0.25), 2.55, z);
        c.rotation.z = Math.PI / 2;
      }
    // masts, yards and striped square sails (they belly forward in the wind)
    const sails: THREE.Bone[] = [];
    const mast = (z: number, top: number, yards: [number, number, number][]) => {
      tube(body, [0, deckY, z], [0, top, z], 0.3, "#c98a48", 8);
      for (const [y, w, h] of yards) {
        tube(body, [-w / 2 - 0.3, y, z + 0.35], [w / 2 + 0.3, y, z + 0.35], 0.13, "#c98a48", 6);
        const sb = bone(body, 0, y - 0.1, z + 0.4);
        addParts(sb, sail({ quad: [[0, -w / 2], [-h, -w / 2 * 1.08], [-h, w / 2 * 1.08], [0, w / 2]].map(([yy, xx]) => [yy, xx]) as [[number, number], [number, number], [number, number], [number, number]], belly: 0.9, bands: ["#ffffff", "#ff7ab8", "#ffffff", "#ff7ab8"], square: true }));
        sails.push(sb);
      }
      // shrouds down to the rails
      for (const s of [-1, 1]) {
        tube(body, [0, top - 1.5, z], [s * 3.3, 3.0, z - 1.5], 0.035, "#5a4a3a", 4);
        tube(body, [0, top - 4, z], [s * 3.4, 3.0, z + 0.6], 0.035, "#5a4a3a", 4);
      }
    };
    mast(0.4, 17.5, [[15.6, 6.4, 3.4], [11.6, 8.8, 4.8]]);
    mast(6.4, 14.5, [[12.8, 5.2, 2.8], [9.4, 7.4, 4.1]]);
    // the crow's nest
    const nest = put(body, new THREE.CylinderGeometry(0.95, 0.75, 0.75, 12, 1, true), "#c98a48", 0, 16.4, 0.4);
    void nest;
    put(body, new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12), "#c98a48", 0, 16.05, 0.4);
    // the jolly roger (a friendly one: a grinning skull with a pink bow) up top
    const flag = bone(body, 0, 18.2, 0.4);
    tube(body, [0, 17.4, 0.4], [0, 18.8, 0.4], 0.06, "#c98a48", 5);
    const fl = put(flag, new THREE.BoxGeometry(0.04, 1.3, 2.0), "#2a1d3e", 0, 0, -1.0);
    void fl;
    put(flag, new THREE.SphereGeometry(0.32, 10, 8), "#ffffff", 0.04, 0.08, -1.0).scale.set(0.3, 1, 1);
    for (const s of [-1, 1]) put(flag, new THREE.SphereGeometry(0.075, 6, 5), "#2a1d3e", 0.12, 0.13, -1.0 + s * 0.12);
    put(flag, new THREE.SphereGeometry(0.14, 6, 5), "#ff5fa8", 0.08, 0.38, -0.82).scale.set(0.4, 0.7, 1.3);
    // the bowsprit + a golden star figurehead
    tube(body, [0, 3.7, 10.0], [0, 5.4, 14.4], 0.2, "#c98a48", 6);
    tube(body, [0, 5.4, 14.4], [0, 14.0, 6.4], 0.04, "#5a4a3a", 4);
    const fh = put(body, flat(starPts(0.85, 0.38), 0.25, 0.06, 1), "#ffd36b", 0, 3.5, 10.6, true);
    fh.rotation.set(Math.PI / 2, 0, 0);
    // an anchor hung on the bow
    tube(body, [1.95, 3.6, 7.6], [2.05, 1.8, 7.6], 0.09, "#3a3040", 5);
    tube(body, [2.05, 1.85, 7.0], [2.05, 1.85, 8.2], 0.09, "#3a3040", 5);
    return {
      seat: [0, qY, -7.6],
      pet: [1.4, qY, -8.6],
      anim: (t, dt, speed) => {
        const go = Math.min(1, speed / 10);
        sails.forEach((s, i) => (s.scale.z = 0.7 + go * 0.5 + Math.sin(t * 1.9 + i) * 0.05));
        wheel.rotation.z = Math.sin(t * 0.6) * 0.4;
        flag.rotation.y = Math.sin(t * (2.6 + go * 3)) * 0.35;
        body.rotation.z = Math.sin(t * 0.55) * 0.012;
        body.position.y = Math.sin(t * 0.7) * 0.06;
      },
    };
  }

  if (kind === "sub") {
    // ── the Bubble Sub: a round yellow sub; the kid stands in a glass bubble on top ──
    const yel = main;
    const hullG = new THREE.CapsuleGeometry(1.22, 3.9, 8, 18);
    hullG.rotateX(Math.PI / 2);
    put(body, hullG, yel);
    // a blue band, red nose ring, rivets as dots
    put(body, new THREE.CylinderGeometry(1.25, 1.25, 0.5, 18, 1, true), "#3fa8ff", 0, 0, -1.25).rotation.x = Math.PI / 2;
    put(body, new THREE.TorusGeometry(1.0, 0.14, 6, 18), "#ff5a4a", 0, 0, 2.55);
    // the cockpit: a floor disc under the glass (hides the kid's legs) and a collar round it
    const cf = put(body, new THREE.CircleGeometry(1.42, 20), "#ffe0ec", 0, 1.24, 0.9);
    cf.rotation.x = -Math.PI / 2;
    // a little seat back and a dashboard of glowing dials inside the bubble
    const sb = put(body, new RoundedBoxGeometry(1.2, 0.7, 0.24, 2, 0.1), accent, 0, 1.55, 0.05);
    sb.rotation.x = -0.15;
    const dash = put(body, new RoundedBoxGeometry(1.3, 0.3, 0.32, 2, 0.08), "#3fa8ff", 0, 1.42, 2.05);
    dash.rotation.x = 0.4;
    for (const [x, c] of [[-0.35, "#5fff8a"], [0, "#ffe45c"], [0.35, "#ff5fa8"]] as const) put(body, new THREE.SphereGeometry(0.07, 6, 5), c, x, 1.58, 2.0, true);
    const collar = put(body, new THREE.TorusGeometry(1.46, 0.15, 6, 22), "#ff7a3c", 0, 1.22, 0.9);
    collar.rotation.x = Math.PI / 2;
    // conning tower + periscope + an antenna with a red light
    put(body, new THREE.CylinderGeometry(0.42, 0.5, 0.9, 12), yel, 0, 1.4, -1.35);
    tube(body, [0, 1.8, -1.35], [0, 2.9, -1.35], 0.08, "#9aa8c0", 6);
    put(body, new THREE.BoxGeometry(0.16, 0.18, 0.42), "#9aa8c0", 0, 2.92, -1.2);
    tube(body, [0.3, 1.8, -1.65], [0.3, 2.5, -1.7], 0.025, "#9aa8c0", 4);
    put(body, new THREE.SphereGeometry(0.08, 6, 5), "#ff3a4a", 0.3, 2.55, -1.7, true);
    // portholes along both sides (they glow at night and in the deep)
    for (const s of [-1, 1])
      for (const z of [-0.2, -1.2, -2.2]) {
        const rim = put(body, new THREE.TorusGeometry(0.26, 0.07, 5, 12), "#ff7a3c", s * 1.2, 0.12, z);
        rim.rotation.y = Math.PI / 2;
        const gl = put(body, new THREE.CircleGeometry(0.22, 12), "#bff4ff", s * 1.235, 0.12, z, true);
        gl.rotation.y = (s * Math.PI) / 2;
      }
    // headlamps on the nose
    for (const [x, y, z] of CRAFT_LAMPS.sub!) {
      put(body, new THREE.CylinderGeometry(0.24, 0.3, 0.3, 10), "#e8e4f0", x, y, z - 0.1).rotation.x = Math.PI / 2;
      put(body, new THREE.CircleGeometry(0.2, 12), "#fff6c0", x, y, z + 0.06, true);
    }
    // fins: rudder up and down, dive planes out to the sides, little front planes
    for (const s of [-1, 1]) {
      const r = put(body, flat([[0, 0], [1.1, 0.1], [1.0, 0.85], [0.35, 0.85]], 0.12, 0.04), "#ff7a3c", 0, s * 0.85, -2.25);
      r.rotation.set(0, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2);
      const p = put(body, flat([[0, 0], [0.9, -0.2], [0.95, -0.85], [0, -0.95]], 0.12, 0.04), "#ff7a3c", s * 0.9, 0, -2.2);
      p.scale.x = s;
      put(body, flat([[0, 0.25], [0.55, 0.1], [0.55, -0.25], [0, -0.3]], 0.1, 0.03), "#ff7a3c", s * 1.05, -0.2, 1.6).scale.x = s;
    }
    // the propeller in a ring shroud
    const shroud = put(body, new THREE.TorusGeometry(0.72, 0.13, 6, 18), "#ff7a3c", 0, 0, -3.42);
    void shroud;
    for (const s of [-1, 1]) tube(body, [0, s * 0.6, -3.42], [0, s * 0.3, -3.0], 0.05, "#ff7a3c", 4);
    const prop = propeller(body, 0, 0, -3.42, 0.62, "#e8e4f0");
    const after = (b: THREE.Bone) => {
      const g = CRAFT_GLASS.sub!;
      const glass = new THREE.Mesh(new THREE.SphereGeometry(g.r, 22, 16), craftGlassMaterial());
      glass.name = "craft-glass";
      glass.position.set(g.x, g.y, g.z);
      glass.renderOrder = 3;
      b.add(glass);
    };
    let spin = 0;
    return {
      seat: [-0.42, 0.6, 1.0],
      pet: [0.55, 0.75, 1.05],
      after,
      anim: (t, dt, speed) => {
        spin += dt * (1 + speed * 1.5);
        prop.rotation.z = spin;
        body.position.y = Math.sin(t * 1.2) * 0.06;
        body.rotation.z = Math.sin(t * 0.9) * 0.02;
      },
    };
  }

  // ── the Deep Explorer: a bathysphere - a glass ball in an orange float frame, big lamps ──
  const orange = main;
  const steel = "#9aa8c0";
  // the float block on top, with white stripes and a number star
  put(body, new RoundedBoxGeometry(4.6, 1.15, 5.6, 3, 0.4), orange, 0, 2.55, 0.0);
  for (const z of [-1.6, 1.6]) put(body, new THREE.BoxGeometry(4.66, 1.0, 0.32), "#ffffff", 0, 2.55, z);
  for (const s of [-1, 1]) {
    const st = put(body, flat(starPts(0.42, 0.18), 0.05, 0.015, 1), "#ffe45c", s * 2.33, 2.55, 0, true);
    st.rotation.set(0, 0, (s * Math.PI) / 2);
  }
  // the frame: four struts down to two skids, and a hoop round the glass
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) tube(body, [sx * 1.85, 2.0, sz * 1.9], [sx * 1.75, -1.75, sz * 1.5], 0.11, steel, 6);
  for (const sx of [-1, 1]) {
    const sk = new THREE.CapsuleGeometry(0.2, 4.6, 4, 8);
    sk.rotateX(Math.PI / 2);
    put(body, sk, steel, sx * 1.75, -1.9, 0.3);
    tube(body, [sx * 1.75, -1.9, 2.8], [sx * 1.75, -1.45, 3.15], 0.2, steel, 6);
  }
  const hoop = put(body, new THREE.TorusGeometry(1.7, 0.12, 6, 24), "#ffd36b", 0, 0.35, 0.55);
  hoop.rotation.y = Math.PI / 2;
  const belt = put(body, new THREE.TorusGeometry(1.68, 0.14, 6, 24), "#ffd36b", 0, -0.32, 0.55);
  belt.rotation.x = Math.PI / 2;
  // the cabin floor (hides the kid's legs) and the hatch ring on top of the glass
  const floorD = put(body, new THREE.CircleGeometry(1.5, 20), "#ffe0ec", 0, -0.3, 0.55);
  floorD.rotation.x = -Math.PI / 2;
  const seatB = put(body, new RoundedBoxGeometry(1.2, 0.8, 0.26, 2, 0.1), accent, 0, 0.05, -0.55);
  seatB.rotation.x = -0.12;
  const dash = put(body, new RoundedBoxGeometry(1.4, 0.32, 0.34, 2, 0.08), "#3a3040", 0, -0.12, 1.75);
  dash.rotation.x = 0.45;
  for (const [x, c] of [[-0.4, "#5fff8a"], [0, "#ffe45c"], [0.4, "#ff5fa8"]] as const) put(body, new THREE.SphereGeometry(0.07, 6, 5), c, x, 0.04, 1.7, true);
  put(body, new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), steel, 0, 2.0, 0.55);
  // lamp booms out front, and lower spot lamps on the skids
  for (const [x, y, z] of CRAFT_LAMPS.deepsub!) {
    tube(body, [x * 0.9, 2.1, 2.4], [x, y, z - 0.35], 0.1, steel, 5);
    put(body, new THREE.CylinderGeometry(0.34, 0.42, 0.55, 10), "#e8e4f0", x, y, z - 0.2).rotation.x = Math.PI / 2;
    put(body, new THREE.CircleGeometry(0.3, 12), "#fff6c0", x, y, z + 0.09, true);
  }
  for (const s of [-1, 1]) put(body, new THREE.SphereGeometry(0.2, 8, 6), "#fff6c0", s * 1.75, -1.4, 3.25, true);
  // side thrusters with spinning props
  const props: THREE.Bone[] = [];
  for (const s of [-1, 1]) {
    const pod = new THREE.CapsuleGeometry(0.42, 1.2, 4, 10);
    pod.rotateX(Math.PI / 2);
    put(body, pod, orange, s * 2.75, 0.4, -0.6);
    tube(body, [s * 2.3, 0.4, -0.6], [s * 1.85, 1.0, -0.6], 0.12, steel, 5);
    put(body, new THREE.TorusGeometry(0.5, 0.12, 5, 14), "#ffd36b", s * 2.75, 0.4, -1.55);
    props.push(propeller(body, s * 2.75, 0.4, -1.5, 0.42, "#e8e4f0"));
  }
  // the grabber arm, folded under the nose (it waves a little)
  const arm = bone(body, 0.9, -1.2, 2.2);
  tube(arm, [0, 0, 0], [0, -0.1, 0.9], 0.09, steel, 5);
  const claw = bone(arm, 0, -0.1, 0.95);
  for (const s of [-1, 1]) {
    const f = put(claw, new THREE.BoxGeometry(0.08, 0.1, 0.45), "#ff7a3c", s * 0.12, 0, 0.18);
    f.rotation.y = s * 0.35;
  }
  // a flag on top with a light
  tube(body, [-1.6, 3.1, -2.3], [-1.6, 4.4, -2.3], 0.04, steel, 4);
  put(body, new THREE.SphereGeometry(0.1, 6, 5), "#ff3a4a", -1.6, 4.45, -2.3, true);
  const flag = bone(body, -1.6, 4.1, -2.3);
  put(flag, pennant(accent, 0.9, 0.42), accent);
  const after = (b: THREE.Bone) => {
    const g = CRAFT_GLASS.deepsub!;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(g.r, 22, 16), craftGlassMaterial());
    glass.name = "craft-glass";
    glass.position.set(g.x, g.y, g.z);
    glass.renderOrder = 3;
    b.add(glass);
  };
  let spin = 0;
  return {
    seat: [-0.45, -0.95, 0.7],
    pet: [0.6, -0.9, 0.65],
    after,
    anim: (t, dt, speed) => {
      spin += dt * (1 + speed * 1.4);
      props[0].rotation.z = spin;
      props[1].rotation.z = -spin;
      arm.rotation.x = Math.sin(t * 0.7) * 0.15;
      claw.rotation.z = Math.sin(t * 1.3) * 0.2;
      flag.rotation.y = Math.sin(t * 2.2) * 0.4;
      body.position.y = Math.sin(t * 0.9) * 0.07;
    },
  };
}
