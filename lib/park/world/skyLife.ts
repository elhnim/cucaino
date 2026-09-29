// Little lives in the air so there's always something to look at: butterflies that flit round
// the park by day (and glow like moths at twilight), bird flocks gliding across the sky by day,
// and shooting stars streaking over the twilight. Two instanced meshes + a few lines.
import * as THREE from "three";
import { groundY } from "../registry/terrain";

export interface SkyLife {
  update(dt: number, t: number, glow: number): void;
  dispose(): void;
}

export function buildSkyLife(scene: THREE.Scene, opts: { radius: number; lowQuality?: boolean }): SkyLife {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ── butterflies: two wing quads that flap about a centre hinge ──
  const wing = new THREE.CircleGeometry(0.35, 10);
  wing.scale(1, 1.35, 1);
  wing.translate(0.33, 0, 0);
  const wingGeo = track(wing);
  const wingMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
  const nB = opts.lowQuality ? 18 : 40;
  const left = new THREE.InstancedMesh(wingGeo, wingMat, nB);
  const right = new THREE.InstancedMesh(wingGeo, wingMat, nB);
  const bCols = ["#ff8ad8", "#8fd8ff", "#ffe36b", "#b99bff", "#8dffb4", "#ffae6b"];
  const butterflies = Array.from({ length: nB }, (_, i) => {
    const a = rnd() * Math.PI * 2;
    const r = 12 + Math.sqrt(rnd()) * (opts.radius - 14);
    const c = new THREE.Color(bCols[i % bCols.length]);
    left.setColorAt(i, c);
    right.setColorAt(i, c);
    return { cx: Math.sin(a) * r, cz: Math.cos(a) * r, rad: 2 + rnd() * 4, sp: 0.3 + rnd() * 0.4, ph: rnd() * 10, h: 1.2 + rnd() * 2 };
  });
  scene.add(left, right);

  // ── bird flocks: little V-shaped gliders circling high up ──
  const birdShape = new THREE.BufferGeometry();
  birdShape.setAttribute("position", new THREE.Float32BufferAttribute([-0.9, 0.15, 0, 0, 0, 0.25, 0, 0, -0.1, 0.9, 0.15, 0, 0, 0, 0.25, 0, 0, -0.1], 3));
  const birdGeo = track(birdShape);
  const birdMat = track(new THREE.MeshBasicMaterial({ color: "#5a4a8a", side: THREE.DoubleSide, transparent: true }));
  const nFlock = opts.lowQuality ? 2 : 3;
  const perFlock = 7;
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, nFlock * perFlock);
  const flocks = Array.from({ length: nFlock }, (_, f) => ({ a: rnd() * 6.28, rad: 60 + f * 35, h: 34 + f * 6, sp: (f % 2 ? -1 : 1) * (0.05 + rnd() * 0.03) }));
  scene.add(birds);

  // ── shooting stars at twilight ──
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const starMat = track(new THREE.LineBasicMaterial({ color: "#fff6ff", transparent: true, opacity: 0, fog: false }));
  const shooting = new THREE.Line(starGeo, starMat);
  shooting.frustumCulled = false;
  scene.add(shooting);
  let starT = -1;
  let starWait = 4;
  const starFrom = new THREE.Vector3();
  const starDir = new THREE.Vector3();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const day = new THREE.Color("#ffffff");

  return {
    update(dt, t, glow) {
      // butterflies wander in lazy loops and flap; at twilight they glow like moths
      butterflies.forEach((b, i) => {
        const u = t * b.sp + b.ph;
        const x = b.cx + Math.sin(u) * b.rad + Math.sin(u * 2.3) * 0.8;
        const z = b.cz + Math.cos(u * 0.8) * b.rad;
        const y = groundY(x, z) + b.h + Math.sin(u * 3.1) * 0.4;
        const heading = Math.atan2(Math.cos(u) * b.rad, -Math.sin(u * 0.8) * b.rad * 0.8);
        const flap = Math.sin(t * 14 + b.ph) * 1.1;
        e.set(0, heading, 0);
        q.setFromEuler(e);
        const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, heading, 0));
        m.compose(p.set(x, y, z), q.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.4 + flap * 0.5)), s);
        left.setMatrixAt(i, m);
        m.compose(p, q.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI - 0.4 - flap * 0.5)), s);
        right.setMatrixAt(i, m);
      });
      left.instanceMatrix.needsUpdate = true;
      right.instanceMatrix.needsUpdate = true;
      wingMat.color.copy(day).multiplyScalar(0.85 + glow * 0.15);

      // birds glide by day, fade away at twilight
      let bi = 0;
      for (const f of flocks) {
        f.a += f.sp * dt;
        for (let k = 0; k < perFlock; k++, bi++) {
          const row = Math.ceil(k / 2);
          const side = k === 0 ? 0 : k % 2 ? -1 : 1;
          const a = f.a - row * 0.02 * Math.sign(f.sp);
          const x = Math.sin(a) * (f.rad + side * row * 1.4);
          const z = Math.cos(a) * (f.rad + side * row * 1.4);
          const flap = Math.sin(t * 5 + k) * 0.25;
          m.compose(p.set(x, f.h + Math.sin(t * 0.7 + k) * 0.6, z), q.setFromEuler(e.set(0, a + (f.sp > 0 ? Math.PI / 2 : -Math.PI / 2), flap)), s.set(1.4, 1.4, 1.4));
          birds.setMatrixAt(bi, m);
        }
      }
      s.set(1, 1, 1);
      birds.instanceMatrix.needsUpdate = true;
      birdMat.opacity = 1 - glow;
      birds.visible = glow < 0.95;

      // a shooting star every few seconds at twilight
      starWait -= dt;
      if (starT < 0 && starWait <= 0 && glow > 0.6) {
        starT = 0;
        starWait = 5 + rnd() * 8;
        const a = rnd() * Math.PI * 2;
        starFrom.set(Math.sin(a) * 260, 150 + rnd() * 80, Math.cos(a) * 260);
        starDir.set(-Math.sin(a) * 0.6 + (rnd() - 0.5), -0.35, -Math.cos(a) * 0.6 + (rnd() - 0.5)).normalize();
      }
      if (starT >= 0) {
        starT += dt;
        const u = starT / 0.9;
        const head = starFrom.clone().addScaledVector(starDir, u * 220);
        const tail = starFrom.clone().addScaledVector(starDir, Math.max(0, u * 220 - 40));
        const pos = starGeo.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, tail.x, tail.y, tail.z);
        pos.setXYZ(1, head.x, head.y, head.z);
        pos.needsUpdate = true;
        starMat.opacity = Math.sin(Math.min(1, u) * Math.PI) * glow;
        if (u >= 1) {
          starT = -1;
          starMat.opacity = 0;
        }
      }
    },
    dispose() {
      scene.remove(left, right, birds, shooting);
      for (const d of disposables) d.dispose();
    },
  };
}
