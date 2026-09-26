import * as THREE from "three";
import { makeSoftShadowTexture } from "./textures";

export interface CritterOptions {
  bodyColor: string;
  bellyColor: string;
  accentColor: string;
  scale?: number;
  /** "fox" = pointy ears + bushy tail, "round" = floppy ears + puff tail */
  earStyle?: "fox" | "round";
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
}

/** A friendly low-poly critter built from primitives — no external model needed. */
export function buildCritter(opts: CritterOptions): Critter {
  const scale = opts.scale ?? 1;
  const body = new THREE.Color(opts.bodyColor);
  const belly = new THREE.Color(opts.bellyColor);
  const accent = new THREE.Color(opts.accentColor);

  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);

  const bodyMat = new THREE.MeshStandardMaterial({ color: body, roughness: 0.75, flatShading: true });
  const bellyMat = new THREE.MeshStandardMaterial({ color: belly, roughness: 0.8, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2016, roughness: 0.5 });

  // torso: a squashed sphere reads as a soft rounded body at low poly counts
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), bodyMat);
  torso.scale.set(1, 0.92, 1.15);
  torso.position.y = 0.72;
  torso.castShadow = true;
  bob.add(torso);

  const belly2 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bellyMat);
  belly2.scale.set(0.95, 0.8, 0.7);
  belly2.position.set(0, 0.55, 0.32);
  bob.add(belly2);

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.32, 0.38);
  bob.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), bodyMat);
  skull.castShadow = true;
  head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bellyMat);
  muzzle.scale.set(0.9, 0.75, 1.15);
  muzzle.position.set(0, -0.08, 0.36);
  head.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), darkMat);
  nose.position.set(0, -0.04, 0.58);
  head.add(nose);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), darkMat);
    eye.position.set(side * 0.19, 0.05, 0.4);
    head.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.024, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(side * 0.19 + 0.02, 0.08, 0.46);
    head.add(glint);
  }
  const earGeo =
    opts.earStyle === "round"
      ? new THREE.SphereGeometry(0.2, 8, 6)
      : new THREE.ConeGeometry(0.16, 0.42, 6);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, accentMat);
    ear.position.set(side * 0.32, 0.46, -0.02);
    ear.rotation.z = side * 0.25;
    if (opts.earStyle !== "round") ear.rotation.x = -0.15;
    head.add(ear);
  }

  // tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.62, -0.58);
  bob.add(tailPivot);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.85, 8), accentMat);
  tail.rotation.x = Math.PI / 2.6;
  tail.position.z = -0.28;
  tail.castShadow = true;
  tailPivot.add(tail);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), bellyMat);
  tailTip.position.set(0, 0.16, -0.66);
  tailPivot.add(tailTip);

  // stubby legs (two feet is enough at this scale/angle — reads as walking, not distracting)
  const feet: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bodyMat);
    foot.scale.set(1, 0.7, 1.2);
    foot.position.set(side * 0.28, 0.2, 0.08);
    foot.castShadow = true;
    bob.add(foot);
    feet.push(foot);
  }

  // contact shadow, kept out of `bob` so it doesn't float with the bounce
  const shadowMat = new THREE.MeshBasicMaterial({
    map: makeSoftShadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  root.scale.setScalar(scale);

  let walkT = 0;
  let facing = 0;
  let celebrateT = 0;

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
      } else {
        walkT += dt * 2.2;
        bob.position.y = Math.sin(walkT) * 0.025;
        tailPivot.rotation.y = Math.sin(walkT * 0.6) * 0.18;
        feet[0].position.y = 0.2;
        feet[1].position.y = 0.2;
      }
      if (celebrateT > 0) {
        celebrateT = Math.max(0, celebrateT - dt);
        bob.position.y += Math.max(0, Math.sin(celebrateT * 14)) * 0.3;
        root.rotation.y = facing + Math.sin(celebrateT * 20) * 0.25;
      } else {
        // shortest-path smoothing so the critter never spins the long way round
        let diff = ((facing - root.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
        root.rotation.y += diff * Math.min(1, dt * 10);
      }
    },
    setFacingAngle(angleRad) {
      facing = angleRad;
    },
    celebrate() {
      celebrateT = 0.8;
    },
  };
}
