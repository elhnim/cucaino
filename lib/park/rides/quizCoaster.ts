// Quiz Coaster: ride a candy roller coaster; the cart rolls to a stop at each gate and a
// question pops up (React overlay). Right answers = confetti + a whoosh of speed.
// Procedural and light: one tube track, instanced pillars/decor, a handful of gate arches.
import * as THREE from "three";
import type { Ride } from "../engine/ParkWorld";
import { labelSprite } from "@/lib/game3d/buildingKit";
import { makeSparkleTexture } from "@/lib/game3d/textures";

export interface CoasterControls {
  /** answer given for the current gate: true = right */
  resume?: (correct: boolean) => void;
}

export function buildQuizCoaster(gates: number, onGate: (index: number) => void, onFinish: () => void, controls: CoasterControls) {
  return (_accent: string): Ride => {
    const scene = new THREE.Scene();
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
    const toon = (c: string) => track(new THREE.MeshToonMaterial({ color: c }));

    // sky + light + meadow
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const c = cv.getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "#9f8bff");
    g.addColorStop(0.55, "#ffb8dc");
    g.addColorStop(1, "#ffe6c9");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    const skyTex = track(new THREE.CanvasTexture(cv));
    skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.add(new THREE.Mesh(track(new THREE.SphereGeometry(400, 20, 14)), track(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }))));
    scene.fog = new THREE.Fog(0xffd0e6, 90, 330);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd6c8ff, 1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(-20, 40, 20);
    scene.add(sun);
    const ground = new THREE.Mesh(track(new THREE.CircleGeometry(380, 48)), toon("#6fe8ab"));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // the track: a big wobbly loop with hills, dips and a corkscrew-ish swoop
    const pts: THREE.Vector3[] = [];
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 70 + Math.sin(a * 2) * 22;
      const y = 7 + Math.sin(a * 3) * 5 + Math.max(0, Math.sin(a * 5)) * 7;
      pts.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    scene.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 600, 0.55, 8, true)), toon("#ff5fa8")));
    scene.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 600, 0.2, 6, true)), toon("#ffffff")));
    const pillarMat = toon("#fff1f8");
    const pillars = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.4, 0.55, 1, 8)), pillarMat, 70);
    for (let i = 0; i < 70; i++) {
      const p = curve.getPointAt(i / 70);
      pillars.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.y, 1)));
    }
    scene.add(pillars);

    // candy decor: gumdrops and lollipop spheres round the course
    const gum = new THREE.InstancedMesh(track(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), toon("#ffffff"), 40);
    const cols = ["#ffb3d6", "#b3f0d4", "#fff0a3", "#d6c2ff", "#a8dcff"];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 120;
      const s = 2 + Math.random() * 6;
      gum.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s)));
      gum.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    }
    scene.add(gum);

    // gates: rainbow arches with a big question number
    const gateU: number[] = [];
    const arches: THREE.Object3D[] = [];
    for (let i = 0; i < gates; i++) {
      const u = 0.08 + (i / gates) * 0.86;
      gateU.push(u);
      const p = curve.getPointAt(u);
      const tg = curve.getTangentAt(u);
      const arch = new THREE.Group();
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(3.4, 0.35, 8, 28, Math.PI)), toon(cols[i % cols.length]));
      arch.add(ring);
      const num = labelSprite(`❓ ${i + 1}`);
      track(num.material);
      if (num.material.map) track(num.material.map);
      num.scale.multiplyScalar(0.7);
      num.position.y = 4.6;
      arch.add(num);
      arch.position.copy(p);
      arch.lookAt(p.clone().add(tg));
      scene.add(arch);
      arches.push(arch);
    }

    // the cart the kid sits in
    const cart = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(2.2, 0.9, 2.8)), toon("#ffd23f"));
    body.position.y = 0.45;
    const trim = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 0.2, 2.9)), toon("#ff5fa8"));
    trim.position.y = 0.95;
    cart.add(body, trim);
    scene.add(cart);

    // sparkles for right answers
    const sparkTex = track(makeSparkleTexture());
    const bursts: { pts: THREE.Points; vel: Float32Array; life: number }[] = [];
    const burst = (at: THREE.Vector3) => {
      const n = 50;
      const pos = new Float32Array(n * 3);
      const vel = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const pal = [0xff5fa8, 0xffd23f, 0x5ee6a8, 0x6cc6ff, 0xc38bff].map((x) => new THREE.Color(x));
      for (let i = 0; i < n; i++) {
        pos.set([at.x, at.y, at.z], i * 3);
        vel.set([(Math.random() - 0.5) * 10, Math.random() * 8 + 2, (Math.random() - 0.5) * 10], i * 3);
        const cc = pal[i % pal.length];
        col.set([cc.r, cc.g, cc.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: sparkTex, size: 1.1, vertexColors: true, transparent: true, depthWrite: false }));
      scene.add(pts);
      bursts.push({ pts, vel, life: 1.3 });
    };

    let u = 0;
    let speed = 0.02; // track fraction per second
    let boost = 0;
    let nextGate = 0;
    let waiting = false;
    let finished = false;
    let laps = 0;
    controls.resume = (correct) => {
      if (!waiting) return;
      waiting = false;
      if (correct) {
        boost = 2.2;
        burst(curve.getPointAt(gateU[nextGate - 1]).add(new THREE.Vector3(0, 3, 0)));
      }
    };

    const seat = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const look = new THREE.Matrix4();
    const camPos = new THREE.Vector3();

    return {
      scene,
      spawnPoint: curve.getPointAt(0),
      bounds: 1000,
      zones: [],
      playerAnchor() {
        return { position: seat.clone().setY(seat.y + 0.4), facing: Math.atan2(ahead.x - seat.x, ahead.z - seat.z) };
      },
      camera(cam, dt) {
        const back = curve.getPointAt((u - 0.018 + 1) % 1);
        camPos.set(back.x, back.y + 4.2, back.z);
        cam.position.lerp(camPos, Math.min(1, dt * 4));
        const target = curve.getPointAt((u + 0.03) % 1);
        cam.lookAt(target.x, target.y + 1, target.z);
      },
      update(dt) {
        if (!finished && !waiting) {
          boost = Math.max(0, boost - dt);
          // roll slower uphill, faster downhill, whoosh after a right answer
          const tg = curve.getTangentAt(u);
          const slope = -tg.y * 0.012;
          const v = Math.max(0.008, speed + slope + (boost > 0 ? 0.03 : 0));
          const before = u;
          u = u + v * dt;
          if (u >= 1) {
            u -= 1;
            laps++;
          }
          if (nextGate < gateU.length && before < gateU[nextGate] - 0.004 && u >= gateU[nextGate] - 0.004 && laps === 0) {
            u = gateU[nextGate] - 0.004;
            waiting = true;
            nextGate++;
            onGate(nextGate - 1);
          } else if (nextGate >= gateU.length && laps > 0) {
            finished = true;
            onFinish();
          }
        }
        const p = curve.getPointAt(u);
        seat.copy(p).setY(p.y + 0.55);
        ahead.copy(curve.getPointAt((u + 0.004) % 1));
        cart.position.copy(p).setY(p.y + 0.5);
        look.lookAt(ahead, p, up);
        cart.quaternion.setFromRotationMatrix(look);
        arches.forEach((a, i) => (a.scale.setScalar(i === nextGate - 1 && waiting ? 1 + Math.sin(Date.now() / 150) * 0.05 : 1)));
        for (let i = bursts.length - 1; i >= 0; i--) {
          const b = bursts[i];
          b.life -= dt;
          const attr = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
          const arr = attr.array as Float32Array;
          for (let k = 0; k < b.vel.length; k += 3) {
            b.vel[k + 1] -= dt * 9;
            arr[k] += b.vel[k] * dt;
            arr[k + 1] += b.vel[k + 1] * dt;
            arr[k + 2] += b.vel[k + 2] * dt;
          }
          attr.needsUpdate = true;
          (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / 1.3);
          if (b.life <= 0) {
            scene.remove(b.pts);
            b.pts.geometry.dispose();
            (b.pts.material as THREE.Material).dispose();
            bursts.splice(i, 1);
          }
        }
      },
      dispose() {
        for (const d of disposables) d.dispose();
      },
    };
  };
}
