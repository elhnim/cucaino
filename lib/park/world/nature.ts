// Natural features of Cucaino Island: a sparkling stream that winds from the Glow Forest down to
// the sea (with sandy banks and little wooden bridges where trails cross), and gentle grassy
// hills dotted with flowers in the open meadows. Shapes come from lib/park/registry/island.ts
// so the 3D world and the map always agree.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getToonRamp } from "../assets/loader";
import { BRIDGES, HILLS, POND, STREAM_POINTS, STREAM_WIDTH, type P2 } from "../registry/island";

export interface Nature {
  /** round obstacles the kid walks around (the hills) */
  obstacles: { x: number; z: number; r: number }[];
  update(dt: number, t: number, glow: number): void;
  dispose(): void;
}

/** a flat ribbon following a polyline (XZ), `width` wide, with uv.x along its length */
function ribbon(points: P2[], width: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const d = Math.hypot(dx, dz) || 1;
    const nx = -dz / d;
    const nz = dx / d;
    // a little wider towards the sea
    const w = (width / 2) * (0.85 + (i / points.length) * 0.5);
    if (i > 0) len += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]);
    pos.push(p[0] + nx * w, y, p[1] + nz * w, p[0] - nx * w, y, p[1] - nz * w);
    uv.push(len / 6, 0, len / 6, 1);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildNature(scene: THREE.Scene): Nature {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const added: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T) => (scene.add(o), added.push(o), o);
  const ramp = getToonRamp();
  const toon = (c: string) => track(new THREE.MeshToonMaterial({ color: c, gradientMap: ramp }));

  // ── the stream: sandy banks + flowing water with sparkles (glows a little at twilight) ──
  add(new THREE.Mesh(track(ribbon(STREAM_POINTS, STREAM_WIDTH + 2.2, 0.03)), toon("#f5dcae")));
  const streamMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uGlow: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uGlow; varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
          vec3 day = mix(vec3(0.55, 0.9, 1.0), vec3(0.35, 0.75, 0.98), edge);
          vec3 night = mix(vec3(0.2, 0.45, 0.8), vec3(0.12, 0.25, 0.6), edge);
          vec3 col = mix(day, night, uGlow);
          // ripples flowing downstream
          float flow = sin((vUv.x * 6.0 - uTime * 1.6) + vUv.y * 3.0) * 0.5 + 0.5;
          col += flow * 0.06;
          vec2 q = vec2(vUv.x * 5.0 - uTime * 0.8, vUv.y * 3.0);
          float sp = step(0.94, hash(floor(q))) * (1.0 - smoothstep(0.1, 0.35, length(fract(q) - 0.5)));
          col += sp * mix(vec3(0.9), vec3(0.4, 1.0, 0.95), uGlow) * 0.8;
          gl_FragColor = vec4(col, 0.92);
        }`,
    }),
  );
  add(new THREE.Mesh(track(ribbon(STREAM_POINTS, STREAM_WIDTH, 0.06)), streamMat));
  // round pebbles along the banks
  const pebbleGeo = track(new THREE.SphereGeometry(0.35, 7, 5));
  const pebbles = add(new THREE.InstancedMesh(pebbleGeo, toon("#ffffff"), 70));
  const pebCols = ["#d8d2f0", "#f0d8e6", "#cfe8f0", "#e9e2d2"];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const k = Math.floor(rnd() * (STREAM_POINTS.length - 2)) + 1;
    const p = STREAM_POINTS[k];
    const n = STREAM_POINTS[k + 1];
    const dx = n[0] - p[0];
    const dz = n[1] - p[1];
    const d = Math.hypot(dx, dz) || 1;
    const side = rnd() < 0.5 ? -1 : 1;
    const off = STREAM_WIDTH / 2 + 0.4 + rnd() * 0.8;
    m.compose(new THREE.Vector3(p[0] + (-dz / d) * off * side, 0.08, p[1] + (dx / d) * off * side), q.identity(), new THREE.Vector3(1, 0.45, 0.8).multiplyScalar(0.6 + rnd() * 0.9));
    pebbles.setMatrixAt(i, m);
    pebbles.setColorAt(i, new THREE.Color(pebCols[i % pebCols.length]));
  }

  // ── the lily pond the stream runs into ──
  const bank = new THREE.Mesh(track(new THREE.CircleGeometry(POND.r + 1.4, 40)), toon("#f5dcae"));
  bank.rotation.x = -Math.PI / 2;
  bank.position.set(POND.x, 0.035, POND.z);
  const pond = new THREE.Mesh(track(new THREE.CircleGeometry(POND.r, 40)), streamMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(POND.x, 0.065, POND.z);
  add(bank);
  add(pond);
  const padGeo = track(new THREE.CircleGeometry(0.9, 14, 0.4, Math.PI * 2 - 0.8));
  const pads = add(new THREE.InstancedMesh(padGeo, toon("#5fcf7a"), 9));
  const lotusGeo = track(new THREE.ConeGeometry(0.32, 0.45, 6));
  const lotus = add(new THREE.InstancedMesh(lotusGeo, toon("#ff9fd6"), 4));
  for (let i = 0; i < 9; i++) {
    const a = i * 2.3;
    const r = 1.2 + (i % 3) * 1.5;
    m.compose(new THREE.Vector3(POND.x + Math.sin(a) * r, 0.09, POND.z + Math.cos(a) * r), q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, a)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + (i % 2) * 0.4));
    pads.setMatrixAt(i, m);
    if (i < 4) {
      m.compose(new THREE.Vector3(POND.x + Math.sin(a) * r, 0.3, POND.z + Math.cos(a) * r), q.identity(), new THREE.Vector3(1, 1, 1));
      lotus.setMatrixAt(i, m);
    }
  }
  q.identity();

  // ── little wooden arched bridges where trails cross ──
  const plank = toon("#c98a5a");
  const rail = toon("#ffffff");
  for (const b of BRIDGES) {
    // built from planks, rails and posts, then merged into one mesh per material (2 draw calls)
    const planks: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    const span = STREAM_WIDTH + 3;
    const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, rotX = 0) => {
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0)), new THREE.Vector3(1, 1, 1)));
      return g.index ? g.toNonIndexed() : g;
    };
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      planks.push(place(new THREE.BoxGeometry(3.4, 0.14, span / 9 + 0.05), 0, 0.12 + Math.sin(u * Math.PI) * 0.55, (u - 0.5) * span, -Math.cos(u * Math.PI) * 0.35));
    }
    for (const side of [-1, 1]) {
      const pts = Array.from({ length: 9 }, (_, i) => {
        const u = i / 8;
        return new THREE.Vector3(side * 1.7, 0.95 + Math.sin(u * Math.PI) * 0.55, (u - 0.5) * span);
      });
      rails.push(place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.08, 5, false), 0, 0, 0));
      for (const u of [0, 0.5, 1]) rails.push(place(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), side * 1.7, 0.5 + Math.sin(u * Math.PI) * 0.55, (u - 0.5) * span));
    }
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.heading;
    g.add(new THREE.Mesh(track(mergeGeometries(planks)!), plank), new THREE.Mesh(track(mergeGeometries(rails)!), rail));
    for (const x of [...planks, ...rails]) x.dispose();
    add(g);
  }

  // ── gentle grassy hills with flower tufts on top ──
  const hillGeo = track(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  const hills = add(new THREE.InstancedMesh(hillGeo, toon("#ffffff"), HILLS.length));
  const hillCols = ["#8ee6b0", "#9eeab6", "#b2f0c2", "#8fdcc0", "#a8e8a8"];
  const tuftGeo = track(new THREE.SphereGeometry(0.4, 8, 6));
  const tufts = add(new THREE.InstancedMesh(tuftGeo, toon("#ffffff"), HILLS.length * 5));
  const tuftCols = ["#ff9fd6", "#fff09a", "#c6b3ff", "#ffffff", "#9ad8ff"];
  HILLS.forEach((h, i) => {
    m.compose(new THREE.Vector3(h.x, -0.05, h.z), q.identity(), new THREE.Vector3(h.r, h.h, h.r * 0.85));
    hills.setMatrixAt(i, m);
    hills.setColorAt(i, new THREE.Color(hillCols[i % hillCols.length]));
    for (let k = 0; k < 5; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * h.r * 0.55;
      const lx = Math.sin(a) * rr;
      const lz = Math.cos(a) * rr * 0.85;
      // sit on the dome's surface
      const y = h.h * Math.sqrt(Math.max(0, 1 - (lx / h.r) ** 2 - (lz / (h.r * 0.85)) ** 2));
      m.compose(new THREE.Vector3(h.x + lx, y, h.z + lz), q.identity(), new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.6));
      tufts.setMatrixAt(i * 5 + k, m);
      tufts.setColorAt(i * 5 + k, new THREE.Color(tuftCols[(i + k) % tuftCols.length]));
    }
  });

  return {
    obstacles: [...HILLS.map((h) => ({ x: h.x, z: h.z, r: h.r * 0.82 })), { x: POND.x, z: POND.z, r: POND.r + 0.6 }],
    update(_dt, t, glow) {
      streamMat.uniforms.uTime.value = t;
      streamMat.uniforms.uGlow.value = glow;
    },
    dispose() {
      for (const o of added) scene.remove(o);
      for (const d of disposables) d.dispose();
    },
  };
}
