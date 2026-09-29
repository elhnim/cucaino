// Magical glowing plants, Pandora style: giant dream trees with glowing vines, luminous
// mushrooms, spiral lilies, bell flowers, glow ferns and crystal clusters. By day they are soft
// candy pastels; as the world glows (atmosphere.glow) their glowing parts stay lit while the
// world darkens around them, and a halo layer makes them bloom. Everything is instanced: one
// draw call per plant part, whatever the number of plants.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeSparkTexture } from "./atmosphere";
import { getToonRamp } from "../assets/loader";

export interface GlowFlora {
  update(dt: number, t: number, glow: number): void;
  dispose(): void;
}

type Area = { x: number; z: number; radius: number; count: number };
type Kind = "tree" | "mushroom" | "lily" | "bells" | "fern" | "crystal";

const GLOW_COLORS = ["#6ff7ff", "#ff7ae0", "#b98bff", "#8dffb4", "#ffd36b", "#7aa8ff"];

function rngOf(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── unit-sized part geometries (instanced with per-plant scale/rotation/colour) ──
function treeParts() {
  // a twisted trunk rising to a wide, layered canopy with hanging glowing vines and bulbs
  const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, 3, 0.2), new THREE.Vector3(-0.3, 6.5, -0.2), new THREE.Vector3(0.1, 9.5, 0.1)]);
  const trunk = new THREE.TubeGeometry(trunkCurve, 16, 0.55, 7, false);
  const roots: THREE.BufferGeometry[] = [trunk];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(Math.cos(a) * 1.1, 0.5, Math.sin(a) * 1.1), new THREE.Vector3(Math.cos(a) * 2, 0, Math.sin(a) * 2)]);
    roots.push(new THREE.TubeGeometry(c, 8, 0.28, 6, false));
  }
  const canopyParts: THREE.BufferGeometry[] = [];
  const layers: [number, number, number, number, number][] = [
    [0, 10.2, 0, 4.6, 1.5],
    [1.6, 11.4, 1, 3.2, 1.2],
    [-1.8, 11, -0.8, 3.4, 1.2],
    [0.2, 12.4, -1.2, 2.8, 1.1],
  ];
  for (const [x, y, z, r, h] of layers) {
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(r, h, r);
    g.translate(x, y, z);
    canopyParts.push(g);
  }
  const vines: THREE.BufferGeometry[] = [];
  const bulbs: THREE.BufferGeometry[] = [];
  const r = rngOf(9);
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    const rad = 1.2 + r() * 3.2;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const len = 2 + r() * 4;
    const top = 9.6 - (rad > 3.5 ? 0.6 : 0);
    const v = new THREE.CylinderGeometry(0.045, 0.03, len, 4);
    v.translate(x, top - len / 2, z);
    vines.push(v);
    const b = new THREE.SphereGeometry(0.16 + r() * 0.12, 6, 4);
    b.translate(x, top - len, z);
    bulbs.push(b);
  }
  return { solid: mergeGeometries(roots)!, canopy: mergeGeometries(canopyParts)!, glow: mergeGeometries([...vines, ...bulbs])!, halos: bulbs.map((b) => { b.computeBoundingSphere(); return b.boundingSphere!.center.clone(); }).filter((_, i) => i % 3 === 0) };
}

function mushroomParts() {
  const stem = new THREE.CylinderGeometry(0.28, 0.42, 2.2, 10);
  stem.translate(0, 1.1, 0);
  const cap = new THREE.SphereGeometry(1.3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.62, 1);
  cap.translate(0, 2.1, 0);
  const gills = new THREE.CircleGeometry(1.25, 14);
  gills.rotateX(Math.PI / 2);
  gills.translate(0, 2.09, 0);
  const spots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const s = new THREE.SphereGeometry(0.16, 5, 4);
    s.translate(Math.cos(a) * 0.75, 2.62, Math.sin(a) * 0.75);
    spots.push(s);
  }
  const top = new THREE.SphereGeometry(0.2, 6, 5);
  top.translate(0, 2.92, 0);
  spots.push(top);
  return { solid: stem, canopy: cap, glow: mergeGeometries([gills, ...spots])!, halos: [new THREE.Vector3(0, 2.3, 0)] };
}

function lilyParts() {
  // Pandora-style spiral lily: a stalk wrapped by a glowing spiral frond
  const stalk = new THREE.CylinderGeometry(0.08, 0.14, 3.4, 6);
  stalk.translate(0, 1.7, 0);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const a = u * Math.PI * 6;
    const rad = 0.18 + u * 0.55;
    pts.push(new THREE.Vector3(Math.cos(a) * rad, 1.2 + u * 2.6, Math.sin(a) * rad));
  }
  const spiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.07, 4, false);
  const bud = new THREE.SphereGeometry(0.28, 8, 6);
  bud.scale(1, 1.5, 1);
  bud.translate(0, 3.55, 0);
  return { solid: stalk, canopy: null, glow: mergeGeometries([spiral, bud])!, halos: [new THREE.Vector3(0, 3.5, 0)] };
}

function bellParts() {
  const stems: THREE.BufferGeometry[] = [];
  const bells: THREE.BufferGeometry[] = [];
  const halos: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const h = 1.3 + (i % 3) * 0.35;
    const x = Math.cos(a) * 0.35;
    const z = Math.sin(a) * 0.35;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, h * 0.7, z), new THREE.Vector3(x * 2.2, h, z * 2.2), new THREE.Vector3(x * 2.6, h - 0.25, z * 2.6)]);
    stems.push(new THREE.TubeGeometry(c, 6, 0.035, 3, false));
    const bell = new THREE.ConeGeometry(0.22, 0.4, 7, 1, true);
    bell.translate(x * 2.6, h - 0.45, z * 2.6);
    bells.push(bell);
    halos.push(new THREE.Vector3(x * 2.6, h - 0.5, z * 2.6));
  }
  return { solid: mergeGeometries(stems)!, canopy: null, glow: mergeGeometries(bells)!, halos: halos.slice(0, 2) };
}

function fernParts() {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const b = new THREE.ConeGeometry(0.12, 1.4 + (i % 3) * 0.3, 4);
    b.translate(0, 0.7, 0);
    b.rotateZ(0.45);
    b.rotateY(a);
    blades.push(b);
  }
  return { solid: null, canopy: null, glow: mergeGeometries(blades)!, halos: [] as THREE.Vector3[] };
}

function crystalParts() {
  const shards: THREE.BufferGeometry[] = [];
  const r = rngOf(4);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.OctahedronGeometry(0.4, 0);
    s.scale(0.6, 1.6 + r() * 1.4, 0.6);
    s.rotateZ((r() - 0.5) * 0.8);
    s.rotateX((r() - 0.5) * 0.8);
    s.translate((r() - 0.5) * 1.2, 0.7, (r() - 0.5) * 1.2);
    shards.push(s);
  }
  return { solid: null, canopy: null, glow: mergeGeometries(shards)!, halos: [new THREE.Vector3(0, 1, 0)] };
}

const KIND_BUILD: Record<Kind, () => { solid: THREE.BufferGeometry | null; canopy: THREE.BufferGeometry | null; glow: THREE.BufferGeometry; halos: THREE.Vector3[] }> = {
  tree: treeParts,
  mushroom: mushroomParts,
  lily: lilyParts,
  bells: bellParts,
  fern: fernParts,
  crystal: crystalParts,
};
const KIND_SCALE: Record<Kind, [number, number]> = { tree: [0.95, 1.35], mushroom: [0.9, 2.3], lily: [0.9, 1.5], bells: [1, 1.6], fern: [0.8, 1.3], crystal: [0.8, 1.6] };
const KIND_PAD: Record<Kind, number> = { tree: 5, mushroom: 2.4, lily: 1.2, bells: 1, fern: 0.8, crystal: 1.2 };
const TRUNK_COLORS = ["#8a5fd6", "#5f6fd6", "#b0689f"];
const CANOPY_COLORS = ["#b58cff", "#7fd9ff", "#ff9fd6", "#9fffd0", "#c7b3ff"];

export function buildGlowFlora(
  scene: THREE.Scene,
  opts: {
    /** where to grow: the Glow Forest (dense, with the giant trees) and the rest of the park (sparse) */
    forest: Area;
    park: Area;
    /** false = too close to a path/place/building */
    free: (x: number, z: number, pad: number) => boolean;
    lowQuality?: boolean;
    /** extra glow spots (e.g. path lanterns) that bloom at twilight */
    lights?: { x: number; y: number; z: number; color: string; size: number }[];
  },
): GlowFlora {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const toonRamp = getToonRamp();
  const solidMat = track(new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonRamp }));
  const canopyMat = track(new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonRamp, emissive: new THREE.Color("#000000") }));
  // glowing parts ignore the lights: they stay bright while the world darkens around them
  const glowMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));

  const r = rngOf(20260929);
  const q = low(opts.lowQuality);
  const plan: { kind: Kind; area: Area; share: number }[] = [
    { kind: "tree", area: opts.forest, share: 0.08 },
    { kind: "mushroom", area: opts.forest, share: 0.18 },
    { kind: "lily", area: opts.forest, share: 0.2 },
    { kind: "bells", area: opts.forest, share: 0.22 },
    { kind: "fern", area: opts.forest, share: 0.22 },
    { kind: "crystal", area: opts.forest, share: 0.1 },
    { kind: "mushroom", area: opts.park, share: 0.2 },
    { kind: "lily", area: opts.park, share: 0.22 },
    { kind: "bells", area: opts.park, share: 0.28 },
    { kind: "crystal", area: opts.park, share: 0.12 },
    { kind: "fern", area: opts.park, share: 0.18 },
  ];
  // gather placements per kind
  const byKind = new Map<Kind, { x: number; z: number; s: number; rot: number; ci: number }[]>();
  const taken: { x: number; z: number; pad: number }[] = [];
  for (const p of plan) {
    const n = Math.round(p.area.count * p.share * q);
    const list = byKind.get(p.kind) ?? [];
    let tries = 0;
    let made = 0;
    while (made < n && tries++ < n * 30) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * p.area.radius;
      const x = p.area.x + Math.sin(a) * rad;
      const z = p.area.z + Math.cos(a) * rad;
      const pad = KIND_PAD[p.kind];
      if (!opts.free(x, z, p.kind === "tree" ? pad + 6 : pad)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.pad + pad)) continue;
      taken.push({ x, z, pad });
      const [s0, s1] = KIND_SCALE[p.kind];
      list.push({ x, z, s: s0 + r() * (s1 - s0), rot: r() * Math.PI * 2, ci: Math.floor(r() * 1000) });
      made++;
    }
    byKind.set(p.kind, list);
  }

  const halos: { p: THREE.Vector3; c: THREE.Color; big: number }[] = [];
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const meshes: THREE.InstancedMesh[] = [];
  for (const [kind, list] of byKind) {
    if (!list.length) continue;
    const parts = KIND_BUILD[kind]();
    const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, colorOf: (ci: number) => string) => {
      if (!geo) return;
      track(geo);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((pl, i) => {
        quat.setFromAxisAngle(up, pl.rot);
        m.compose(new THREE.Vector3(pl.x, 0, pl.z), quat, new THREE.Vector3(pl.s, pl.s, pl.s));
        im.setMatrixAt(i, m);
        im.setColorAt(i, new THREE.Color(colorOf(pl.ci)));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      scene.add(im);
      meshes.push(im);
    };
    add(parts.solid, solidMat, (ci) => (kind === "tree" ? TRUNK_COLORS[ci % TRUNK_COLORS.length] : "#7fd6a8"));
    add(parts.canopy, canopyMat, (ci) => CANOPY_COLORS[ci % CANOPY_COLORS.length]);
    add(parts.glow, glowMat, (ci) => GLOW_COLORS[ci % GLOW_COLORS.length]);
    for (const pl of list) {
      const c = new THREE.Color(GLOW_COLORS[pl.ci % GLOW_COLORS.length]);
      for (const h of parts.halos) {
        const hp = h.clone().multiplyScalar(pl.s).applyAxisAngle(up, pl.rot);
        halos.push({ p: new THREE.Vector3(pl.x + hp.x, hp.y, pl.z + hp.z), c, big: kind === "tree" ? 2.2 : kind === "mushroom" ? 3.4 * pl.s : 1.6 });
      }
    }
  }

  for (const l of opts.lights ?? []) halos.push({ p: new THREE.Vector3(l.x, l.y, l.z), c: new THREE.Color(l.color), big: l.size });

  // bloom halos: one additive point cloud, size and brightness follow the glow
  const hp = new Float32Array(halos.length * 3);
  const hc = new Float32Array(halos.length * 3);
  const hs = new Float32Array(halos.length);
  halos.forEach((h, i) => {
    hp.set([h.p.x, h.p.y, h.p.z], i * 3);
    hc.set([h.c.r, h.c.g, h.c.b], i * 3);
    hs[i] = h.big;
  });
  const hGeo = track(new THREE.BufferGeometry());
  hGeo.setAttribute("position", new THREE.BufferAttribute(hp, 3));
  hGeo.setAttribute("color", new THREE.BufferAttribute(hc, 3));
  hGeo.setAttribute("aSize", new THREE.BufferAttribute(hs, 1));
  const spark = track(makeSparkTexture());
  const hMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { uGlow: { value: 0 }, uTime: { value: 0 }, uMap: { value: spark } },
      vertexShader: /* glsl */ `
        attribute float aSize; uniform float uGlow; uniform float uTime; varying vec3 vCol; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float pulse = 0.8 + 0.2 * sin(uTime * 1.6 + position.x * 0.7 + position.z * 0.5);
          vA = (0.08 + uGlow) * 0.9 * pulse;
          vCol = color;
          gl_PointSize = aSize * 55.0 * (1.0 + uGlow * 1.2) * pulse * (10.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec3 vCol; varying float vA;
        void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vCol * t.rgb, t.a * vA); }`,
    }),
  );
  const haloPoints = new THREE.Points(hGeo, hMat);
  haloPoints.frustumCulled = false;
  scene.add(haloPoints);

  const dayGlow = new THREE.Color("#ffffff");
  return {
    update(_dt, t, glow) {
      // by day the glowing parts are soft pastels; at twilight they shine
      glowMat.color.copy(dayGlow).multiplyScalar(0.78 + glow * 0.22);
      canopyMat.emissive.setRGB(0.18 * glow, 0.12 * glow, 0.3 * glow);
      hMat.uniforms.uGlow.value = glow;
      hMat.uniforms.uTime.value = t;
    },
    dispose() {
      for (const im of meshes) scene.remove(im);
      scene.remove(haloPoints);
      for (const d of disposables) d.dispose();
    },
  };
}

function low(isLow?: boolean) {
  return isLow ? 0.55 : 1;
}
