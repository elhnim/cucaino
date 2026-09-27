import * as THREE from "three";
import { labelSprite, emojiSprite } from "../buildingKit";
import { makeSkyGradientTexture, makeSparkleTexture } from "../textures";
import { COURSE, holeOrigin, type HoleDef, type Vec2 } from "../minigolf/courses";
import { BALL_R, CUP_R, scoreName, shoot, speed, stepBall, type Ball } from "../minigolf/physics";
import type { Interior } from "./types";

export type GolfEvent =
  | { type: "hole-start"; hole: number; name: string; par: number }
  | { type: "stroke"; hole: number; strokes: number }
  | { type: "sunk"; hole: number; strokes: number; par: number; label: string }
  | { type: "course-done"; total: number; par: number; scores: number[] };

export interface GolfControls {
  restart?: () => void;
}

const FLOOR_Y = 1.5;
const AIM_MAX_DRAG = 3.2;

/**
 * Cucaino Mini Golf: a sunny outdoor course of holes laid side by side. Drag anywhere to
 * pull back and aim (like a slingshot), release to putt. Real 2D ball physics (physics.ts):
 * walls, spinning windmill blades, bouncy bumpers and sand. The kid's animal stands beside
 * the ball as the golfer and their pet cheers.
 */
export function buildMiniGolfInterior(accent: string, onEvent: (e: GolfEvent) => void, controls: GolfControls = {}): Interior {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(r: T) => (disposables.push(r), r);
  const std = (color: string | number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    track(new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra }));
  const trackSprite = (s: THREE.Sprite) => {
    const m = s.material as THREE.SpriteMaterial;
    track(m);
    if (m.map) track(m.map);
    return s;
  };

  // sunny sky + meadow all around the course
  const skyTex = track(makeSkyGradientTexture("#7cc8ff", "#effaff"));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(160, 16, 12)), track(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe6f6ff, 40, 140);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6ea843, 0.9));
  const sun = new THREE.DirectionalLight(0xfff3d8, 1.1);
  sun.position.set(20, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 30, bottom: -30, far: 120 });
  sun.target.position.set(COURSE.length * 9, 0, 0);
  scene.add(sun, sun.target);
  track(sun);

  const meadow = new THREE.Mesh(track(new THREE.PlaneGeometry(COURSE.length * 18 + 80, 70)), std("#7cc75a", { flatShading: false, roughness: 1 }));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.set(((COURSE.length - 1) * 18) / 2, FLOOR_Y - 0.02, 0);
  meadow.receiveShadow = true;
  scene.add(meadow);

  // shared bits
  const wallMat = std("#f4f1e6");
  const trimMat = std(accent);
  const feltMats = ["#3fb34f", "#34a853", "#46c25a"].map((c) => std(c, { flatShading: false, roughness: 0.95 }));
  const sandMat = std("#f2d98b", { flatShading: false, roughness: 1 });
  const bumperMat = std("#ff5d8f", { emissive: "#ff5d8f", emissiveIntensity: 0.25 });
  const cupMat = track(new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
  const bladeMat = std("#fff4e0");
  const millMat = std("#e5484d");

  interface HoleView {
    def: HoleDef;
    origin: Vec2;
    blades: THREE.Group[];
    bumpers: THREE.Mesh[];
    flag: THREE.Mesh;
  }
  const holes: HoleView[] = [];

  COURSE.forEach((def, i) => {
    const o = holeOrigin(i);
    const g = new THREE.Group();
    g.position.set(o.x, FLOOR_Y, o.z);
    scene.add(g);

    // green shaped from the outline (shape XY -> rotate onto XZ: (x, y) -> (x, 0, -y))
    const shape = new THREE.Shape(def.outline.map((p) => new THREE.Vector2(p.x, -p.z)));
    const green = new THREE.Mesh(track(new THREE.ShapeGeometry(shape)), feltMats[i % feltMats.length]);
    green.rotation.x = -Math.PI / 2;
    green.position.y = 0.01;
    green.receiveShadow = true;
    g.add(green);
    const base = new THREE.Mesh(track(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false })), std("#8a5a2c"));
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.14;
    g.add(base);

    // walls along every edge, with a coloured cap
    def.outline.forEach((a, k) => {
      const b = def.outline[(k + 1) % def.outline.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const wall = new THREE.Mesh(track(new THREE.BoxGeometry(len + 0.2, 0.32, 0.2)), wallMat);
      wall.position.set((a.x + b.x) / 2, 0.16, (a.z + b.z) / 2);
      wall.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      wall.castShadow = true;
      g.add(wall);
      const cap = new THREE.Mesh(track(new THREE.BoxGeometry(len + 0.24, 0.06, 0.24)), trimMat);
      cap.position.copy(wall.position).setY(0.34);
      cap.rotation.y = wall.rotation.y;
      g.add(cap);
    });

    for (const sd of def.sand ?? []) {
      const sand = new THREE.Mesh(track(new THREE.CircleGeometry(sd.r, 24)), sandMat);
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(sd.at.x, 0.02, sd.at.z);
      g.add(sand);
    }

    const bumpers: THREE.Mesh[] = [];
    for (const bp of def.bumpers ?? []) {
      const m = new THREE.Mesh(track(new THREE.CylinderGeometry(bp.r, bp.r, 0.4, 16)), bumperMat);
      m.position.set(bp.at.x, 0.2, bp.at.z);
      m.castShadow = true;
      g.add(m);
      bumpers.push(m);
    }

    const blades: THREE.Group[] = [];
    for (const bl of def.blades ?? []) {
      // windmill hub + two crossed sweeping blades (the physics uses the same angles)
      const hub = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 10, 8)), millMat);
      hub.position.set(bl.at.x, 0.25, bl.at.z);
      g.add(hub);
      const rotor = new THREE.Group();
      rotor.position.set(bl.at.x, 0.2, bl.at.z);
      for (const off of [0, Math.PI / 2]) {
        const blade = new THREE.Mesh(track(new THREE.BoxGeometry(bl.length, 0.24, 0.12)), bladeMat);
        blade.rotation.y = -off;
        blade.castShadow = true;
        rotor.add(blade);
      }
      g.add(rotor);
      blades.push(rotor);
    }

    const cup = new THREE.Mesh(track(new THREE.CircleGeometry(CUP_R, 20)), cupMat);
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(def.cup.x, 0.025, def.cup.z);
    g.add(cup);
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6)), wallMat);
    pole.position.set(def.cup.x, 0.8, def.cup.z);
    g.add(pole);
    const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(0.6, 0.38, 4, 1)), std(accent, { side: THREE.DoubleSide }));
    flag.position.set(def.cup.x + 0.3, 1.4, def.cup.z);
    g.add(flag);
    const num = trackSprite(emojiSprite(String(i + 1), 0.55));
    num.position.set(def.cup.x, 2, def.cup.z);
    g.add(num);

    const sign = trackSprite(labelSprite(`⛳ ${i + 1}. ${def.name} · Par ${def.par}`));
    sign.scale.multiplyScalar(0.7);
    // sign stands behind the far end of the hole so it never covers the golfer at the tee
    const farZ = Math.min(...def.outline.map((p) => p.z));
    sign.position.set(def.cup.x, 1.5, farZ - 0.9);
    g.add(sign);

    holes.push({ def, origin: o, blades, bumpers, flag });
  });

  // decorations: bunting poles + a big entrance arch
  const arch = trackSprite(labelSprite("⛳ Cucaino Mini Golf"));
  arch.scale.multiplyScalar(1.1);
  arch.position.set(0, FLOOR_Y + 3.4, 8.6);
  scene.add(arch);
  const treeGeo = track(new THREE.ConeGeometry(0.9, 2.2, 7));
  const treeMat = std("#4c9a3a");
  for (let i = 0; i < COURSE.length * 4; i++) {
    const tree = new THREE.Mesh(treeGeo, treeMat);
    const x = -8 + i * ((COURSE.length * 18) / (COURSE.length * 4)) + Math.sin(i * 7) * 2;
    tree.position.set(x, FLOOR_Y + 1.1, i % 2 ? -11 - (i % 3) : 11 + (i % 3));
    tree.castShadow = true;
    scene.add(tree);
  }

  // ball + aim arrow + sink sparkles
  const ballMesh = new THREE.Mesh(track(new THREE.SphereGeometry(BALL_R, 16, 12)), std("#ffffff", { flatShading: false, roughness: 0.3 }));
  ballMesh.castShadow = true;
  scene.add(ballMesh);
  const aim = new THREE.Group();
  const dotGeo = track(new THREE.SphereGeometry(0.07, 8, 6));
  const dotMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new THREE.Mesh(dotGeo, dotMat);
    aim.add(d);
    dots.push(d);
  }
  const arrow = new THREE.Mesh(track(new THREE.ConeGeometry(0.16, 0.36, 8)), track(new THREE.MeshBasicMaterial({ color: 0xffd447 })));
  arrow.rotation.x = Math.PI / 2;
  aim.add(arrow);
  aim.visible = false;
  scene.add(aim);
  const sparkTex = track(makeSparkleTexture());
  const sparkMat = track(new THREE.SpriteMaterial({ map: sparkTex, color: 0xfff1b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sinkSparks: THREE.Sprite[] = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(sparkMat);
    s.visible = false;
    scene.add(s);
    sinkSparks.push(s);
  }

  // game state
  let holeIdx = 0;
  let strokes = 0;
  const scores: number[] = [];
  const ball: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
  let courseT = 0;
  let aiming = false;
  let aimStart: THREE.Vector3 | null = null;
  const aimVec = new THREE.Vector2();
  let sinkT = -1;
  let doneT = -1;
  let golferFacing = Math.PI; // facing -z (towards the cup) at the tee
  const golferPos = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y);

  const world = (h: number, p: Vec2) => new THREE.Vector3(holes[h].origin.x + p.x, FLOOR_Y, holes[h].origin.z + p.z);

  function placeGolfer() {
    // stand behind the ball, opposite the way we're about to hit (or towards the cup at rest)
    const def = holes[holeIdx].def;
    let dx = def.cup.x - ball.x;
    let dz = def.cup.z - ball.z;
    if (aiming && aimVec.lengthSq() > 0.01) {
      dx = aimVec.x;
      dz = aimVec.y;
    }
    const len = Math.hypot(dx, dz) || 1;
    const o = holes[holeIdx].origin;
    golferPos.set(o.x + ball.x - (dx / len) * 0.95 + (dz / len) * 0.35, FLOOR_Y, o.z + ball.z - (dz / len) * 0.95 - (dx / len) * 0.35);
    golferFacing = Math.atan2(dx, dz);
  }

  function startHole(i: number) {
    holeIdx = i;
    strokes = 0;
    const def = holes[i].def;
    ball.x = def.tee.x;
    ball.z = def.tee.z;
    ball.vx = ball.vz = 0;
    sinkT = -1;
    placeGolfer();
    onEvent({ type: "hole-start", hole: i + 1, name: def.name, par: def.par });
  }

  controls.restart = () => {
    scores.length = 0;
    doneT = -1;
    startHole(0);
  };
  startHole(0);

  const ballWorld = () => world(holeIdx, ball).setY(FLOOR_Y + BALL_R);
  const focus = new THREE.Vector3();

  return {
    scene,
    spawnPoint: world(0, COURSE[0].tee).add(new THREE.Vector3(-0.9, 0, 0.6)),
    bounds: 1000,
    zones: [],
    cameraOffset: new THREE.Vector3(0, 9, 8.5),
    cameraFocus() {
      // look a little ahead of the ball, towards the cup, so kids can see where to aim
      const def = holes[holeIdx].def;
      const b = ballWorld();
      const c = world(holeIdx, def.cup);
      return focus.copy(b).lerp(c, 0.35);
    },
    playerAnchor() {
      return { position: golferPos, facing: golferFacing };
    },
    pointer(kind, ray) {
      const hit = new THREE.Vector3();
      if (!ray.intersectPlane(plane, hit)) return;
      const ready = speed(ball) === 0 && sinkT < 0 && doneT < 0;
      if (kind === "down" && ready) {
        aiming = true;
        aimStart = hit.clone();
        aimVec.set(0, 0);
      } else if (kind === "move" && aiming && aimStart) {
        // slingshot: drag back, the ball goes the opposite way
        aimVec.set(aimStart.x - hit.x, aimStart.z - hit.z);
        if (aimVec.length() > AIM_MAX_DRAG) aimVec.setLength(AIM_MAX_DRAG);
        placeGolfer();
      } else if (kind === "up" && aiming) {
        aiming = false;
        const power = aimVec.length() / AIM_MAX_DRAG;
        if (power > 0.06) {
          shoot(ball, aimVec.x, aimVec.y, power);
          strokes++;
          onEvent({ type: "stroke", hole: holeIdx + 1, strokes });
        }
        aimVec.set(0, 0);
      }
    },
    update(dt) {
      courseT += dt;
      const def = holes[holeIdx].def;
      for (const h of holes) {
        (h.def.blades ?? []).forEach((bl, bi) => (h.blades[bi].rotation.y = -(courseT * bl.speed)));
        h.flag.rotation.y = Math.sin(courseT * 3) * 0.3;
        h.bumpers.forEach((b, i) => b.scale.setScalar(1 + Math.max(0, Math.sin(courseT * 4 + i)) * 0.04));
      }

      if (sinkT < 0 && doneT < 0) {
        const r = stepBall(ball, def, dt, courseT);
        if (r.sunk) {
          sinkT = 0;
          scores.push(strokes);
          onEvent({ type: "sunk", hole: holeIdx + 1, strokes, par: def.par, label: scoreName(strokes, def.par) });
        } else if (!r.moving && !aiming) {
          placeGolfer();
        }
      }

      const b = ballWorld();
      ballMesh.position.copy(b);
      if (sinkT >= 0) {
        sinkT += dt;
        ballMesh.position.y = FLOOR_Y + BALL_R - Math.min(1, sinkT * 3) * 0.4;
        sinkSparks.forEach((s, i) => {
          const a = (i / sinkSparks.length) * Math.PI * 2;
          const r = sinkT * 2.2;
          s.visible = sinkT < 1;
          s.position.set(b.x + Math.cos(a) * r, FLOOR_Y + 0.3 + sinkT * 2 - sinkT * sinkT * 1.5, b.z + Math.sin(a) * r);
          s.scale.setScalar(0.5 * (1 - sinkT));
        });
        if (sinkT > 1.6) {
          sinkSparks.forEach((s) => (s.visible = false));
          if (holeIdx + 1 < holes.length) startHole(holeIdx + 1);
          else {
            sinkT = -1;
            doneT = 0;
            onEvent({
              type: "course-done",
              total: scores.reduce((a, c) => a + c, 0),
              par: COURSE.reduce((a, h) => a + h.par, 0),
              scores: [...scores],
            });
          }
        }
      } else {
        ballMesh.rotation.x += ball.vz * dt * 5;
        ballMesh.rotation.z -= ball.vx * dt * 5;
      }

      aim.visible = aiming && aimVec.length() > 0.1;
      if (aim.visible) {
        const dir = new THREE.Vector3(aimVec.x, 0, aimVec.y).normalize();
        const reach = 0.6 + (aimVec.length() / AIM_MAX_DRAG) * 3.2;
        dots.forEach((d, i) => {
          d.position.copy(b).addScaledVector(dir, ((i + 1) / dots.length) * reach);
          d.position.y = FLOOR_Y + 0.12;
          d.scale.setScalar(0.6 + (i / dots.length) * 0.6);
        });
        arrow.position.copy(b).addScaledVector(dir, reach + 0.2).setY(FLOOR_Y + 0.14);
        arrow.rotation.set(Math.PI / 2, 0, -Math.atan2(dir.x, dir.z) + Math.PI);
        (dotMat as THREE.MeshBasicMaterial).color.setHSL(0.33 - (aimVec.length() / AIM_MAX_DRAG) * 0.33, 0.9, 0.6); // green → red with power
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
