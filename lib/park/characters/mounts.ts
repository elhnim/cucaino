// Rideable animal friends for getting round the island: the Puffy Pony gallops along the ground,
// the Sky Manta and the Cloud Dragon fly. Built in code in the same chibi style as the
// characters (big sparkly eyes, soft toon colours), each with a saddle `seat` the kid sits on.
import * as THREE from "three";
import { getToonRamp } from "../assets/loader";

export type MountKind = "pony" | "manta" | "dragon";

export const MOUNTS: { kind: MountKind; name: string; emoji: string; flies: boolean; blurb: string }[] = [
  { kind: "pony", name: "Puffy Pony", emoji: "🦄", flies: false, blurb: "Gallops super fast along the ground" },
  { kind: "manta", name: "Sky Manta", emoji: "🪽", flies: true, blurb: "Glides through the sky, glows at night" },
  { kind: "dragon", name: "Cloud Dragon", emoji: "🐉", flies: true, blurb: "Flaps high over everything!" },
];

export interface MountRig {
  kind: MountKind;
  flies: boolean;
  root: THREE.Group;
  /** where the kid sits, in root space */
  seat: THREE.Vector3;
  /** where the pet sits (just behind the kid) */
  petSeat: THREE.Vector3;
  /** `above` = height above the ground (the shadow stays on the ground) */
  update(dt: number, speed: number, airborne: boolean, glow: number, above?: number): void;
  dispose(): void;
}

export function buildMount(kind: MountKind, accent = "#ff5fa8"): MountRig {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const ramp = getToonRamp();
  const mats = new Map<string, THREE.Material>();
  const toon = (c: string) => {
    let m = mats.get(c);
    if (!m) {
      m = track(new THREE.MeshToonMaterial({ color: c, gradientMap: ramp }));
      mats.set(c, m);
    }
    return m;
  };
  const glowMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(track(g), m);
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs/tilts
  root.add(body);

  const eyes = (parent: THREE.Object3D, x: number, y: number, z: number, r: number) => {
    const out: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(side * x, y, z);
      e.add(mesh(new THREE.SphereGeometry(r, 10, 8), toon("#2b1d2e")));
      const hi = mesh(new THREE.SphereGeometry(r * 0.35, 6, 5), glowMat);
      hi.position.set(r * 0.3, r * 0.35, r * 0.7);
      e.add(hi);
      parent.add(e);
      out.push(e);
      const blush = mesh(new THREE.SphereGeometry(r * 0.8, 8, 6), toon("#ff9fb8"));
      blush.scale.set(1.2, 0.6, 0.4);
      blush.position.set(side * (x + r * 0.9), y - r * 1.3, z - r * 0.3);
      parent.add(blush);
    }
    return out;
  };
  const saddle = (y: number, z: number, w: number) => {
    const s = mesh(new THREE.CylinderGeometry(w, w * 1.05, 0.18, 16), toon(accent));
    s.position.set(0, y, z);
    body.add(s);
    const trim = mesh(new THREE.TorusGeometry(w, 0.06, 6, 18), toon("#ffe08a"));
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, y + 0.05, z);
    body.add(trim);
  };

  let seat = new THREE.Vector3(0, 1.4, 0);
  let petSeat = new THREE.Vector3(0, 1.4, -0.9);
  let eyeList: THREE.Group[] = [];
  let anim: (t: number, speed: number, airborne: boolean) => void = () => {};
  const glowParts: THREE.MeshBasicMaterial[] = [];

  if (kind === "pony") {
    // a fluffy pastel unicorn pony with a rainbow mane and a glowing horn
    const coat = toon("#fff4fb");
    const torso = mesh(new THREE.CapsuleGeometry(0.62, 1.1, 6, 14), coat);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 1.15;
    body.add(torso);
    const head = new THREE.Group();
    head.position.set(0, 1.95, 0.95);
    body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.62, 16, 12), coat));
    const snout = mesh(new THREE.SphereGeometry(0.36, 12, 10), toon("#ffd6ea"));
    snout.scale.set(1.1, 0.8, 1);
    snout.position.set(0, -0.2, 0.46);
    head.add(snout);
    eyeList = eyes(head, 0.26, 0.1, 0.5, 0.11);
    for (const side of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.13, 0.32, 8), coat);
      ear.position.set(side * 0.3, 0.56, -0.05);
      ear.rotation.z = -side * 0.3;
      head.add(ear);
    }
    const hornMat = track(new THREE.MeshBasicMaterial({ color: "#ffe36b" }));
    glowParts.push(hornMat);
    const horn = mesh(new THREE.ConeGeometry(0.1, 0.55, 10), hornMat);
    horn.position.set(0, 0.72, 0.18);
    horn.rotation.x = 0.35;
    head.add(horn);
    const maneCols = ["#ff8ad8", "#ffb35c", "#fff06b", "#7fe8a8", "#7fc8ff", "#b99bff"];
    maneCols.forEach((c, i) => {
      const puff = mesh(new THREE.SphereGeometry(0.2, 8, 6), toon(c));
      puff.position.set(0, 0.45 - i * 0.18, -0.38 - i * 0.06);
      head.add(puff);
    });
    const tail = new THREE.Group();
    tail.position.set(0, 1.35, -1.2);
    body.add(tail);
    maneCols.forEach((c, i) => {
      const puff = mesh(new THREE.SphereGeometry(0.22 - i * 0.015, 8, 6), toon(c));
      puff.position.set(0, -i * 0.13, -i * 0.12);
      tail.add(puff);
    });
    const legs: THREE.Group[] = [];
    for (const [x, z] of [[-0.35, 0.55], [0.35, 0.55], [-0.35, -0.55], [0.35, -0.55]] as const) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.85, z);
      const l = mesh(new THREE.CapsuleGeometry(0.15, 0.5, 4, 8), coat);
      l.position.y = -0.4;
      const hoof = mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.16, 10), toon("#c9a8ff"));
      hoof.position.y = -0.76;
      leg.add(l, hoof);
      body.add(leg);
      legs.push(leg);
    }
    saddle(1.78, 0, 0.5);
    seat = new THREE.Vector3(0, 1.82, 0.05);
    petSeat = new THREE.Vector3(0, 1.7, -0.75);
    anim = (t, speed) => {
      const run = Math.min(1, speed / 6);
      const f = t * (6 + run * 8);
      legs.forEach((leg, i) => (leg.rotation.x = Math.sin(f + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 * run));
      body.position.y = Math.abs(Math.sin(f)) * 0.18 * run + Math.sin(t * 2) * 0.02;
      head.rotation.x = Math.sin(f * 2) * 0.08 * run;
      tail.rotation.x = -0.3 - Math.sin(f) * 0.3 * run;
      tail.rotation.y = Math.sin(t * 3) * 0.2;
    };
  } else if (kind === "manta") {
    // a big friendly manta ray with glowing spots, gently flapping
    const top = toon("#6a5ab8");
    const belly = toon("#e8e0ff");
    const core = mesh(new THREE.SphereGeometry(1, 20, 12), top);
    core.scale.set(1.1, 0.35, 1.3);
    core.position.y = 0.3;
    body.add(core);
    const under = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), belly);
    under.scale.set(1.08, 0.3, 1.25);
    under.position.y = 0.29;
    body.add(under);
    const wings: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(side * 0.9, 0.3, 0);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.8);
      shape.quadraticCurveTo(1.2, 0.5, 2.1, -0.3);
      shape.quadraticCurveTo(1, -0.4, 0, -0.9);
      shape.lineTo(0, 0.8);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      if (side < 0) g.scale(-1, 1, 1);
      w.add(mesh(g, top));
      body.add(w);
      wings.push(w);
    }
    // cephalic fins + face
    for (const side of [-1, 1]) {
      const fin = mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 6), top);
      fin.rotation.x = Math.PI / 2;
      fin.position.set(side * 0.38, 0.35, 1.35);
      body.add(fin);
    }
    eyeList = eyes(body, 0.55, 0.48, 1.05, 0.12);
    const tail = mesh(new THREE.ConeGeometry(0.07, 1.8, 6), top);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, 0.3, -2);
    body.add(tail);
    // glowing spots along the back (Pandora-ish)
    const spotMat = track(new THREE.MeshBasicMaterial({ color: "#8ff7ff" }));
    glowParts.push(spotMat);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = mesh(new THREE.SphereGeometry(0.07, 6, 4), spotMat);
      s.position.set(Math.sin(a) * 0.75, 0.62, Math.cos(a) * 0.95);
      body.add(s);
    }
    saddle(0.66, -0.1, 0.45);
    seat = new THREE.Vector3(0, 0.72, -0.05);
    petSeat = new THREE.Vector3(0, 0.66, -0.85);
    anim = (t, speed, air) => {
      const flap = Math.sin(t * (air ? 3.2 : 1.6)) * (air ? 0.45 : 0.12);
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
      body.position.y = (air ? Math.sin(t * 3.2) * 0.12 : 0) + 0.25;
      body.rotation.x = -Math.min(0.2, speed * 0.015);
    };
  } else {
    // a small round cloud dragon with bat wings, little horns and a curly tail
    const scale = toon("#8fe0c8");
    const tummy = toon("#fff3c8");
    const torso = mesh(new THREE.SphereGeometry(0.85, 18, 14), scale);
    torso.scale.set(1, 0.9, 1.25);
    torso.position.y = 1.1;
    body.add(torso);
    const belly = mesh(new THREE.SphereGeometry(0.7, 14, 10), tummy);
    belly.scale.set(0.9, 0.8, 1.1);
    belly.position.set(0, 0.95, 0.35);
    body.add(belly);
    const head = new THREE.Group();
    head.position.set(0, 1.85, 1.05);
    body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.62, 16, 12), scale));
    const snout = mesh(new THREE.SphereGeometry(0.38, 12, 10), scale);
    snout.scale.set(1.1, 0.8, 1);
    snout.position.set(0, -0.15, 0.5);
    head.add(snout);
    for (const side of [-1, 1]) {
      const nostril = mesh(new THREE.SphereGeometry(0.05, 6, 4), toon("#2b1d2e"));
      nostril.position.set(side * 0.13, -0.08, 0.86);
      head.add(nostril);
      const horn = mesh(new THREE.ConeGeometry(0.1, 0.35, 8), toon("#fff3c8"));
      horn.position.set(side * 0.28, 0.58, -0.1);
      horn.rotation.z = -side * 0.35;
      head.add(horn);
    }
    eyeList = eyes(head, 0.26, 0.15, 0.45, 0.12);
    // back spikes
    for (let i = 0; i < 5; i++) {
      const sp = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), toon("#ff9fd6"));
      sp.position.set(0, 1.95 - i * 0.12, 0.4 - i * 0.45);
      body.add(sp);
    }
    const wings: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(side * 0.6, 1.6, -0.1);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(1.5, 0.9);
      shape.quadraticCurveTo(1.3, 0.3, 1.6, 0.1);
      shape.quadraticCurveTo(1.1, -0.1, 1.2, -0.45);
      shape.quadraticCurveTo(0.7, -0.3, 0.5, -0.6);
      shape.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 8 });
      g.rotateX(-Math.PI / 2 + 0.4);
      if (side < 0) g.scale(-1, 1, 1);
      w.add(mesh(g, toon("#ffb3e0")));
      body.add(w);
      wings.push(w);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.9, -1);
    body.add(tail);
    for (let i = 0; i < 6; i++) {
      const s = mesh(new THREE.SphereGeometry(0.28 - i * 0.035, 10, 8), scale);
      s.position.set(Math.sin(i * 0.6) * 0.2 * i, -i * 0.05, -i * 0.3);
      tail.add(s);
    }
    const tipMat = track(new THREE.MeshBasicMaterial({ color: "#ffd36b" }));
    glowParts.push(tipMat);
    const tip = mesh(new THREE.OctahedronGeometry(0.16, 0), tipMat);
    tip.position.set(Math.sin(6 * 0.6) * 1.2, -0.3, -1.85);
    tail.add(tip);
    const legs: THREE.Mesh[] = [];
    for (const [x, z] of [[-0.45, 0.45], [0.45, 0.45], [-0.45, -0.4], [0.45, -0.4]] as const) {
      const l = mesh(new THREE.CapsuleGeometry(0.17, 0.25, 4, 8), scale);
      l.position.set(x, 0.3, z);
      body.add(l);
      legs.push(l);
    }
    saddle(1.93, -0.15, 0.45);
    seat = new THREE.Vector3(0, 1.97, -0.1);
    petSeat = new THREE.Vector3(0, 1.8, -0.85);
    anim = (t, speed, air) => {
      const flap = air ? Math.sin(t * 7) * 0.7 : Math.sin(t * 1.5) * 0.12 - 0.3;
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
      body.position.y = air ? Math.sin(t * 7) * 0.1 : Math.abs(Math.sin(t * (4 + speed))) * 0.08 * Math.min(1, speed / 3);
      tail.rotation.y = Math.sin(t * 2.2) * 0.35;
      head.rotation.x = Math.sin(t * 1.4) * 0.05;
      legs.forEach((l) => (l.visible = true));
    };
  }

  // a soft shadow on the ground (the engine keeps it at ground level while flying)
  const shadowTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(90,40,110,0.45)");
    g.addColorStop(1, "rgba(90,40,110,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return track(new THREE.CanvasTexture(cv));
  })();
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(3.2, 3.6)), track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.name = "mount-shadow";
  root.add(shadow);

  const glowBase = glowParts.map((g) => g.color.clone());
  let t = 0;
  let blink = 2;
  return {
    kind,
    flies: kind !== "pony",
    root,
    seat,
    petSeat,
    update(dt, speed, airborne, glow, above) {
      t += dt;
      anim(t, speed, airborne);
      blink -= dt;
      const closed = blink < 0.12;
      for (const e of eyeList) e.scale.y = closed ? 0.15 : 1;
      if (blink < 0) blink = 2 + Math.random() * 3;
      // keep the shadow on the ground, shrinking and fading as we climb
      const h = above ?? root.position.y;
      shadow.position.y = -h + 0.03;
      shadow.scale.setScalar(Math.max(0.35, 1 - h * 0.025));
      (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, 1 - h * 0.03);
      glowParts.forEach((g, i) => g.color.copy(glowBase[i]).multiplyScalar(0.75 + glow * 0.25));
    },
    dispose() {
      root.parent?.remove(root);
      for (const d of disposables) d.dispose();
    },
  };
}
