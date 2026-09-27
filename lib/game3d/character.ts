import * as THREE from "three";
import { makeSoftShadowTexture } from "./textures";
import type { AnimalDef, EarStyle, Extra, TailStyle } from "./registry/animals";

export interface CritterOptions {
  bodyColor: string;
  bellyColor: string;
  accentColor: string;
  scale?: number;
  /** legacy shorthand: "fox" = pointy ears + bushy tail, "round" = floppy ears + puff tail */
  earStyle?: "fox" | "round";
  /** full animal look from registry/animals.ts; overrides colours/earStyle when given */
  animal?: AnimalDef;
}

export interface Critter {
  /** Parent this into the world; move it by setting root.position. */
  root: THREE.Group;
  /** Call every frame with dt (seconds) and whether the critter is currently moving. */
  update(dt: number, moving: boolean): void;
  /** Smoothly turn to face a world-space direction (radians, three's atan2(x,z) convention). */
  setFacingAngle(angleRad: number): void;
  /** One-off happy bounce, e.g. on arriving somewhere or a pet reacting to a treat. */
  celebrate(): void;
  /** A little wave with one paw (kid-picker, shopkeeper, greeting). */
  wave(): void;
}

// Shared across every critter ever built — geometry is identical, only materials differ.
const SHADOW_GEO = new THREE.PlaneGeometry(1.15, 1.15);
let shadowTex: THREE.CanvasTexture | null = null;

/** A friendly low-poly critter built from primitives — no external model needed. */
export function buildCritter(opts: CritterOptions): Critter {
  const scale = opts.scale ?? 1;
  const a = opts.animal;
  const ears: EarStyle = a?.ears ?? (opts.earStyle === "round" ? "round" : "pointy");
  const tailStyle: TailStyle = a?.tail ?? (opts.earStyle === "round" ? "puff" : "bushy");
  const extras = new Set<Extra>(a?.extras ?? []);
  const body = new THREE.Color(a?.body ?? opts.bodyColor);
  const belly = new THREE.Color(a?.belly ?? opts.bellyColor);
  const trim = new THREE.Color(a?.trim ?? opts.accentColor);

  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);

  const bodyMat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.75, flatShading: true });
  const bellyMat = new THREE.MeshStandardMaterial({ color: belly, roughness: 0.8, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.6, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2016, roughness: 0.5 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.accentColor), roughness: 0.7, flatShading: true });

  // torso: a squashed sphere reads as a soft rounded body at low poly counts
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 9), bodyMat);
  torso.scale.set(1, 0.92, 1.15);
  torso.position.y = 0.72;
  torso.castShadow = true;
  bob.add(torso);

  const belly2 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bellyMat);
  belly2.scale.set(0.95, 0.8, 0.7);
  belly2.position.set(0, 0.55, 0.32);
  bob.add(belly2);

  // a little scarf in the kid's theme colour, so every animal still feels like "theirs"
  if (a) {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 14), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 1.02, 0.12);
    bob.add(scarf);
  }

  if (extras.has("stripes")) {
    for (const y of [0.55, 0.78, 1.0]) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 4, 16, Math.PI), trimMat);
      stripe.rotation.set(0, Math.PI / 2, Math.PI / 2);
      stripe.position.set(0, y - 0.05, -0.1);
      stripe.scale.set(1, 1.1, 1);
      bob.add(stripe);
    }
  }
  if (extras.has("spikes")) {
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 5), trimMat);
      spike.position.set(0, 1.18 - i * 0.2, -0.3 - i * 0.12);
      spike.rotation.x = -0.6 - i * 0.2;
      bob.add(spike);
    }
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.32, 0.38);
  bob.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 9), bodyMat);
  skull.castShadow = true;
  head.add(skull);

  if (extras.has("mane")) {
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 6, 14), trimMat);
    mane.position.set(0, 0.02, -0.08);
    head.add(mane);
  }

  if (extras.has("beak")) {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), trimMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.05, 0.5);
    head.add(beak);
  } else if (extras.has("trunk")) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.45, 7), bodyMat);
    trunk.rotation.x = Math.PI / 2.4;
    trunk.position.set(0, -0.14, 0.58);
    head.add(trunk);
  } else if (extras.has("snout")) {
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), trimMat);
    snout.scale.set(1.1, 0.75, 0.6);
    snout.position.set(0, -0.08, 0.42);
    head.add(snout);
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), darkMat);
      nostril.position.set(side * 0.07, -0.07, 0.54);
      head.add(nostril);
    }
  } else {
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bellyMat);
    muzzle.scale.set(0.9, 0.75, 1.15);
    muzzle.position.set(0, -0.08, 0.36);
    head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), darkMat);
    nose.position.set(0, -0.04, 0.58);
    head.add(nose);
  }

  for (const side of [-1, 1]) {
    if (extras.has("eye-patches")) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), trimMat);
      patch.scale.set(1, 1.2, 0.5);
      patch.position.set(side * 0.19, 0.05, 0.37);
      head.add(patch);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), darkMat);
    eye.position.set(side * 0.19, 0.05, 0.4);
    head.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.024, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(side * 0.19 + 0.02, 0.08, 0.46);
    head.add(glint);
    if (extras.has("cheeks")) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff9fb8, transparent: true, opacity: 0.8 }));
      cheek.scale.set(1, 0.6, 0.4);
      cheek.position.set(side * 0.28, -0.1, 0.36);
      head.add(cheek);
    }
  }

  // ears
  const earGroup: THREE.Object3D[] = [];
  if (ears === "horn") {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0xffe28a, emissive: 0x8a6a00, emissiveIntensity: 0.2, flatShading: true }));
    horn.position.set(0, 0.52, 0.12);
    horn.rotation.x = 0.3;
    head.add(horn);
  }
  if (ears !== "none") {
    const earGeo =
      ears === "round" ? new THREE.SphereGeometry(0.2, 8, 6)
      : ears === "small" ? new THREE.SphereGeometry(0.13, 8, 6)
      : ears === "long" ? new THREE.CapsuleGeometry(0.09, 0.45, 3, 6)
      : ears === "horn" ? new THREE.ConeGeometry(0.1, 0.22, 5)
      : new THREE.ConeGeometry(0.16, 0.42, 6);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, trimMat);
      const spread = ears === "small" ? 0.3 : ears === "long" ? 0.17 : 0.32;
      ear.position.set(side * spread, ears === "long" ? 0.62 : 0.46, -0.02);
      ear.rotation.z = side * (ears === "long" ? 0.12 : 0.25);
      if (ears === "pointy") ear.rotation.x = -0.15;
      if (ears === "horn") ear.position.x = side * 0.36;
      head.add(ear);
      earGroup.push(ear);
    }
  }

  // tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.62, -0.58);
  bob.add(tailPivot);
  if (tailStyle === "bushy") {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.85, 8), trimMat);
    tail.rotation.x = Math.PI / 2.6;
    tail.position.z = -0.28;
    tail.castShadow = true;
    tailPivot.add(tail);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), bellyMat);
    tailTip.position.set(0, 0.16, -0.66);
    tailPivot.add(tailTip);
  } else if (tailStyle === "puff") {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 6), bellyMat);
    puff.position.set(0, 0, -0.08);
    tailPivot.add(puff);
  } else if (tailStyle === "thin") {
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 5), bodyMat);
    tail.rotation.x = -Math.PI / 3.2;
    tail.position.set(0, 0.2, -0.28);
    tailPivot.add(tail);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), trimMat);
    tip.position.set(0, 0.5, -0.5);
    tailPivot.add(tip);
  } else if (tailStyle === "curly") {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 5, 10, Math.PI * 1.6), trimMat);
    curl.position.set(0, 0.05, -0.1);
    curl.rotation.y = Math.PI / 2;
    tailPivot.add(curl);
  } else if (tailStyle === "flat") {
    const flat = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), bodyMat);
    flat.rotation.x = -Math.PI / 2;
    flat.position.set(0, -0.2, -0.05);
    flat.scale.set(1, 1, 0.35);
    tailPivot.add(flat);
  }

  // stubby feet + little arms (arms let the critter wave hello)
  const feet: THREE.Mesh[] = [];
  const footMat = extras.has("beak") ? trimMat : bodyMat;
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), footMat);
    foot.scale.set(1, 0.7, 1.2);
    foot.position.set(side * 0.28, 0.2, 0.08);
    foot.castShadow = true;
    bob.add(foot);
    feet.push(foot);
  }
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5, 0.95, 0.12);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 3, 6), bodyMat);
    arm.position.y = -0.18;
    pivot.add(arm);
    pivot.rotation.z = side * 0.35;
    bob.add(pivot);
    arms.push(pivot);
  }

  // contact shadow, kept out of `bob` so it doesn't float with the bounce
  shadowTex ??= makeSoftShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(SHADOW_GEO, shadowMat);
  shadow.userData.shared = true;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  root.scale.setScalar(scale);

  let walkT = Math.random() * 10;
  let facing = 0;
  let celebrateT = 0;
  let waveT = 0;
  let blinkT = 2 + Math.random() * 3;
  const eyes = head.children.filter((c) => (c as THREE.Mesh).material === darkMat && c.position.y > 0);

  return {
    root,
    update(dt, moving) {
      if (moving) {
        walkT += dt * 9;
        bob.position.y = Math.abs(Math.sin(walkT)) * 0.09;
        head.rotation.z = Math.sin(walkT * 0.5) * 0.05;
        tailPivot.rotation.y = Math.sin(walkT * 0.9) * 0.35;
        feet[0].position.y = 0.2 + Math.max(0, Math.sin(walkT)) * 0.14;
        feet[1].position.y = 0.2 + Math.max(0, Math.sin(walkT + Math.PI)) * 0.14;
        arms[0].rotation.x = Math.sin(walkT) * 0.6;
        arms[1].rotation.x = -Math.sin(walkT) * 0.6;
      } else {
        walkT += dt * 2.2;
        bob.position.y = Math.sin(walkT) * 0.025;
        tailPivot.rotation.y = Math.sin(walkT * 0.6) * 0.18;
        feet[0].position.y = 0.2;
        feet[1].position.y = 0.2;
        arms[0].rotation.x *= 0.9;
        arms[1].rotation.x *= 0.9;
        head.rotation.y = Math.sin(walkT * 0.3) * 0.18; // looks around a little while idle
      }
      for (const e of earGroup) e.rotation.x = (ears === "pointy" ? -0.15 : 0) + Math.sin(walkT * 0.8) * 0.05;

      // blink every few seconds — tiny detail, huge cuteness gain
      blinkT -= dt;
      const blinking = blinkT < 0.12;
      for (const e of eyes) e.scale.y = blinking ? 0.15 : 1;
      if (blinkT < 0) blinkT = 2.5 + Math.random() * 3;

      if (waveT > 0) {
        waveT = Math.max(0, waveT - dt);
        arms[1].rotation.z = 2.4 + Math.sin(waveT * 18) * 0.35;
      } else {
        arms[1].rotation.z += (0.35 - arms[1].rotation.z) * Math.min(1, dt * 8);
      }

      if (celebrateT > 0) {
        celebrateT = Math.max(0, celebrateT - dt);
        bob.position.y += Math.max(0, Math.sin(celebrateT * 14)) * 0.3;
        root.rotation.y = facing + Math.sin(celebrateT * 20) * 0.25;
        arms[0].rotation.z = -2.2;
        arms[1].rotation.z = 2.2;
      } else {
        arms[0].rotation.z += (-0.35 - arms[0].rotation.z) * Math.min(1, dt * 8);
        // shortest-path smoothing so the critter never spins the long way round
        const diff = ((((facing - root.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        root.rotation.y += diff * Math.min(1, dt * 10);
      }
    },
    setFacingAngle(angleRad) {
      facing = angleRad;
    },
    celebrate() {
      celebrateT = 0.8;
    },
    wave() {
      waveT = 1.2;
    },
  };
}
