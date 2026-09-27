// Registry of walk-up attractions dotted around the village plaza.
//
// To add a new attraction:
//   1. Append an AttractionDef below with a free spot (angleDeg/ring between the landmarks).
//   2. Handle its id in ATTRACTION_HANDLERS in components/game/KidGameApp.tsx (what happens
//      when the kid walks up — a toast, a panel, a reward, ...).
//   3. Optionally drive its look from React with world.setAttractionState(id, {...}).
// The engine builds, animates, proximity-triggers and disposes every entry automatically.
import * as THREE from "three";
import { labelSprite, woodBox } from "../buildingKit";
import { makeSparkleTexture, makeStoneTexture } from "../textures";
import { buildCritter } from "../character";
import { getAnimal } from "./animals";

/** Who rides the carousel — any animal ids from registry/animals.ts. */
const CAROUSEL_ANIMALS = ["unicorn", "bunny", "lion", "panda", "dragon", "pig"];

export interface AttractionContext {
  scene: THREE.Scene;
  accent: string;
  /** world position already resolved from angleDeg/ring, on the ground */
  position: THREE.Vector3;
}

export interface AttractionInstance {
  radius: number;
  update(dt: number, t: number): void;
  /** React-driven state, e.g. { ready: true } for the daily gift */
  setState?(state: Record<string, unknown>): void;
  /**
   * Rideable attractions (Ferris wheel, carousel): the engine seats the player and moves
   * them along `seat(progress 0..1)` for `duration` seconds, then steps them back off.
   */
  ride?: { duration: number; seat(progress: number, out: THREE.Vector3): number /* facing */; cameraOffset?: THREE.Vector3 };
  dispose(): void;
}

export interface AttractionDef {
  id: string;
  label: string;
  emoji: string;
  angleDeg: number;
  ring: number;
  /** how far village trees/bushes keep away from it (default 4) */
  clearance?: number;
  build(ctx: AttractionContext): AttractionInstance;
}

/** Disposal helper: every attraction builds into its own group and tracks what it creates. */
function kit(ctx: AttractionContext) {
  const group = new THREE.Group();
  group.position.copy(ctx.position);
  ctx.scene.add(group);
  const owned: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(r: T) => (owned.push(r), r);
  const label = (text: string, y: number) => {
    const s = labelSprite(text);
    s.scale.multiplyScalar(0.62);
    s.position.y = y;
    track(s.material);
    if ((s.material as THREE.SpriteMaterial).map) track((s.material as THREE.SpriteMaterial).map!);
    group.add(s);
    return s;
  };
  const trackMesh = (m: THREE.Mesh) => {
    track(m.geometry);
    const mat = m.material as THREE.MeshStandardMaterial;
    track(mat);
    if (mat.map) track(mat.map);
    return m;
  };
  return {
    group,
    track,
    label,
    trackMesh,
    dispose() {
      ctx.scene.remove(group);
      for (const o of owned) o.dispose();
    },
  };
}

function burstSprites(k: ReturnType<typeof kit>, n: number, color: number) {
  const tex = k.track(makeSparkleTexture());
  const out: THREE.Sprite[] = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(k.track(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    s.visible = false;
    k.group.add(s);
    out.push(s);
  }
  return out;
}

export const ATTRACTIONS: AttractionDef[] = [
  {
    // Daily habit hook: a fresh gift appears once per day; opening it is the reason to log in.
    id: "daily-gift",
    label: "Daily Gift",
    emoji: "🎁",
    angleDeg: 18,
    ring: 12.5,
    build(ctx) {
      const k = kit(ctx);
      const pedestal = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.4, 14), new THREE.MeshStandardMaterial({ color: "#f4f1e6", flatShading: true })));
      pedestal.position.y = 0.2;
      pedestal.receiveShadow = true;
      k.group.add(pedestal);
      const box = new THREE.Group();
      box.position.y = 0.4;
      k.group.add(box);
      const body = k.trackMesh(new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), new THREE.MeshStandardMaterial({ color: ctx.accent, flatShading: true })));
      body.position.y = 0.4;
      body.castShadow = true;
      box.add(body);
      const ribbonMat = k.track(new THREE.MeshStandardMaterial({ color: "#fff3c0", emissive: 0x806020, emissiveIntensity: 0.2 }));
      const rx = new THREE.Mesh(k.track(new THREE.BoxGeometry(1.04, 0.84, 0.18)), ribbonMat);
      rx.position.y = 0.4;
      const rz = new THREE.Mesh(k.track(new THREE.BoxGeometry(0.18, 0.84, 1.04)), ribbonMat);
      rz.position.y = 0.4;
      box.add(rx, rz);
      const lid = new THREE.Group();
      lid.position.set(0, 0.8, -0.5);
      box.add(lid);
      const lidMesh = k.trackMesh(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.22, 1.12), new THREE.MeshStandardMaterial({ color: ctx.accent, flatShading: true })));
      lidMesh.position.set(0, 0.11, 0.5);
      lid.add(lidMesh);
      const bowGeo = k.track(new THREE.TorusGeometry(0.2, 0.07, 6, 10));
      for (const s of [-1, 1]) {
        const bow = new THREE.Mesh(bowGeo, ribbonMat);
        bow.position.set(s * 0.18, 0.36, 0.5);
        bow.rotation.y = Math.PI / 2;
        lid.add(bow);
      }
      const sparkles = burstSprites(k, 6, 0xfff1b8);
      const sign = k.label("🎁 Daily Gift", 2.6);
      let ready = false;
      let openT = 0;
      return {
        radius: 1.3,
        setState(s) {
          const next = !!s.ready;
          if (ready && !next) openT = 0.001; // just claimed → play the open animation
          ready = next;
          sign.visible = true;
        },
        update(dt, t) {
          if (ready) {
            box.position.y = 0.4 + Math.abs(Math.sin(t * 3)) * 0.18;
            box.rotation.y = Math.sin(t * 1.5) * 0.25;
            lid.rotation.x = 0;
            sparkles.forEach((s, i) => {
              s.visible = true;
              const a = t * 1.4 + (i / sparkles.length) * Math.PI * 2;
              s.position.set(Math.sin(a) * 0.9, 1.1 + Math.sin(t * 2 + i) * 0.3, Math.cos(a) * 0.9);
              s.scale.setScalar(0.35 + Math.sin(t * 5 + i) * 0.08);
            });
          } else {
            box.position.y = 0.4;
            if (openT > 0) openT = Math.min(1, openT + dt * 2);
            lid.rotation.x = -1.9 * (openT > 0 ? openT : 1);
            sparkles.forEach((s) => (s.visible = false));
          }
        },
        dispose: k.dispose,
      };
    },
  },
  {
    // Learning hook: every coin tossed in the well pops out a kid-sized "did you know?" fact.
    id: "wishing-well",
    label: "Wishing Well",
    emoji: "🪙",
    angleDeg: 162,
    ring: 13,
    build(ctx) {
      const k = kit(ctx);
      const stone = k.track(makeStoneTexture(77));
      stone.repeat.set(3, 1);
      const wall = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 16, 1, true), new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9, side: THREE.DoubleSide })));
      wall.position.y = 0.45;
      wall.castShadow = true;
      k.group.add(wall);
      const water = k.trackMesh(new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), new THREE.MeshStandardMaterial({ color: "#4fb6e8", emissive: 0x1a6a9a, emissiveIntensity: 0.35, roughness: 0.2 })));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.55;
      k.group.add(water);
      for (const s of [-1, 1]) {
        const post = woodBox(0.16, 1.8, 0.16, "#8a5a2c");
        k.trackMesh(post);
        post.position.set(s * 1, 1.3, 0);
        k.group.add(post);
      }
      const roof = k.trackMesh(new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), new THREE.MeshStandardMaterial({ color: ctx.accent, flatShading: true })));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 2.5;
      roof.castShadow = true;
      k.group.add(roof);
      const glints = burstSprites(k, 5, 0x9adfff);
      k.label("🪙 Wishing Well", 3.4);
      let splashT = 0;
      return {
        radius: 1.6,
        setState(s) {
          if (s.splash) splashT = 1;
        },
        update(dt, t) {
          splashT = Math.max(0, splashT - dt);
          glints.forEach((g, i) => {
            g.visible = true;
            const a = t * 0.8 + i * 1.3;
            g.position.set(Math.sin(a) * 0.6, 0.62 + splashT * (1 + i * 0.3), Math.cos(a) * 0.6);
            g.scale.setScalar(0.25 + splashT * 0.4 + Math.sin(t * 4 + i) * 0.05);
          });
        },
        dispose: k.dispose,
      };
    },
  },
  {
    // Habit reward: finish every chore today and the tower launches a fireworks show.
    id: "fireworks",
    label: "Fireworks Tower",
    emoji: "🎆",
    angleDeg: -54,
    ring: 13.5,
    build(ctx) {
      const k = kit(ctx);
      const base = woodBox(1.3, 0.5, 1.3, "#6b4a2a");
      k.trackMesh(base);
      base.position.y = 0.25;
      k.group.add(base);
      const tubeMat = k.track(new THREE.MeshStandardMaterial({ color: "#e5484d", flatShading: true }));
      const tubeGeo = k.track(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 8));
      for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [0, 0.35]]) {
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.position.set(x, 1.05, z);
        tube.castShadow = true;
        k.group.add(tube);
      }
      const sign = k.label("🎆 Finish chores = show!", 2.7);
      const COLORS = [0xff5d8f, 0xffd447, 0x4ade80, 0x60a5fa, 0xc084fc];
      const shells = COLORS.map((c) => burstSprites(k, 10, c));
      let show = false;
      return {
        radius: 1.4,
        setState(s) {
          show = !!s.show;
          sign.visible = !show;
        },
        update(_dt, t) {
          shells.forEach((sparks, si) => {
            if (!show) {
              sparks.forEach((s) => (s.visible = false));
              return;
            }
            // each shell loops on its own 2.2s cycle: rise, pop, fade
            const cycle = ((t + si * 0.45) % 2.2) / 2.2;
            const cx = Math.sin(si * 2.1) * 2.2;
            const cz = Math.cos(si * 1.7) * 2.2;
            const peak = 9 + (si % 3) * 1.5;
            sparks.forEach((s, i) => {
              s.visible = true;
              if (cycle < 0.35) {
                const p = cycle / 0.35;
                s.position.set(cx * p, 1.5 + p * (peak - 1.5), cz * p);
                s.scale.setScalar(i === 0 ? 0.5 : 0.001);
              } else {
                const p = (cycle - 0.35) / 0.65;
                const a = (i / sparks.length) * Math.PI * 2;
                const r = p * 3;
                s.position.set(cx + Math.cos(a) * r, peak + Math.sin(a) * r - p * p * 2, cz + Math.sin(a * 1.3) * r * 0.5);
                s.scale.setScalar(Math.max(0.001, 0.9 * (1 - p)));
              }
            });
          });
        },
        dispose: k.dispose,
      };
    },
  },
  {
    // Theme park entrance: a big striped arch framing the way in.
    id: "park-gate",
    label: "Cucaino Park",
    emoji: "🎡",
    angleDeg: 0,
    ring: 31,
    clearance: 6,
    build(ctx) {
      const k = kit(ctx);
      const stripeA = k.track(new THREE.MeshStandardMaterial({ color: ctx.accent, flatShading: true }));
      const stripeB = k.track(new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true }));
      const segGeo = k.track(new THREE.CylinderGeometry(0.45, 0.45, 0.7, 12));
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const seg = new THREE.Mesh(segGeo, i % 2 ? stripeA : stripeB);
          seg.position.set(side * 3.6, 0.35 + i * 0.7, 0);
          seg.castShadow = true;
          k.group.add(seg);
        }
        const ball = new THREE.Mesh(k.track(new THREE.SphereGeometry(0.6, 12, 10)), k.track(new THREE.MeshStandardMaterial({ color: "#ffd447", emissive: "#b8860b", emissiveIntensity: 0.4 })));
        ball.position.set(side * 3.6, 6, 0);
        k.group.add(ball);
      }
      const beam = k.trackMesh(new THREE.Mesh(new THREE.BoxGeometry(8.4, 1, 0.8), new THREE.MeshStandardMaterial({ color: ctx.accent, flatShading: true })));
      beam.position.y = 5.4;
      beam.castShadow = true;
      k.group.add(beam);
      const sign = k.label("🎡 Welcome to Cucaino Park!", 6.9);
      sign.scale.multiplyScalar(1.7);
      // light bulbs chasing along the beam
      const bulbMats = [0, 1].map(() => k.track(new THREE.MeshStandardMaterial({ color: "#fff3c0", emissive: "#ffcf6b", emissiveIntensity: 1 })));
      const bulbGeo = k.track(new THREE.SphereGeometry(0.12, 8, 6));
      for (let i = 0; i < 14; i++) {
        const b = new THREE.Mesh(bulbGeo, bulbMats[i % 2]);
        b.position.set(-3.9 + i * 0.6, 4.85, 0.42);
        k.group.add(b);
      }
      k.group.lookAt(0, ctx.position.y, 0);
      return {
        radius: 0, // decorative: walk straight through it
        update(_dt, t) {
          const on = Math.floor(t * 3) % 2;
          bulbMats[0].emissiveIntensity = on ? 1.4 : 0.2;
          bulbMats[1].emissiveIntensity = on ? 0.2 : 1.4;
        },
        dispose: k.dispose,
      };
    },
  },
  {
    // The park's landmark ride — visible from anywhere, and you can ride it for a view of everything.
    id: "ferris-wheel",
    label: "Ferris Wheel",
    emoji: "🎡",
    angleDeg: 90,
    ring: 31,
    clearance: 8,
    build(ctx) {
      const k = kit(ctx);
      const R = 6.2;
      const HUB_Y = 7.4;
      const CABINS = 8;
      const frameMat = k.track(new THREE.MeshStandardMaterial({ color: "#f4f1e6", flatShading: true }));
      for (const side of [-1, 1]) {
        for (const lean of [-1, 1]) {
          const leg = new THREE.Mesh(k.track(new THREE.CylinderGeometry(0.14, 0.2, HUB_Y + 0.4, 6)), frameMat);
          leg.position.set(lean * 1.9, HUB_Y / 2, side * 0.9);
          leg.rotation.z = -lean * 0.25;
          leg.castShadow = true;
          k.group.add(leg);
        }
      }
      const wheel = new THREE.Group();
      wheel.position.y = HUB_Y;
      k.group.add(wheel);
      const spin = new THREE.Group();
      wheel.add(spin);
      const rim = new THREE.Mesh(k.track(new THREE.TorusGeometry(R, 0.14, 6, 40)), k.track(new THREE.MeshStandardMaterial({ color: ctx.accent, emissive: ctx.accent, emissiveIntensity: 0.35, flatShading: true })));
      spin.add(rim);
      const spokeGeo = k.track(new THREE.CylinderGeometry(0.05, 0.05, R * 2, 4));
      for (let i = 0; i < CABINS / 2; i++) {
        const spoke = new THREE.Mesh(spokeGeo, frameMat);
        spoke.rotation.z = (i / (CABINS / 2)) * Math.PI;
        spin.add(spoke);
      }
      const hub = new THREE.Mesh(k.track(new THREE.SphereGeometry(0.5, 10, 8)), k.track(new THREE.MeshStandardMaterial({ color: "#ffd447", emissive: "#b8860b", emissiveIntensity: 0.5 })));
      wheel.add(hub);
      const cabinColors = ["#ff5d8f", "#ffd447", "#4ade80", "#60a5fa", "#c084fc", "#fb923c", "#22d3ee", "#f472b6"];
      const cabinGeo = k.track(new THREE.BoxGeometry(1.1, 0.9, 1.1));
      const roofGeo = k.track(new THREE.ConeGeometry(0.8, 0.5, 4));
      const cabins: THREE.Group[] = [];
      for (let i = 0; i < CABINS; i++) {
        const c = new THREE.Group();
        const mat = k.track(new THREE.MeshStandardMaterial({ color: cabinColors[i], flatShading: true }));
        const box = new THREE.Mesh(cabinGeo, mat);
        box.position.y = -0.7;
        const roof = new THREE.Mesh(roofGeo, mat);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 0;
        c.add(box, roof);
        wheel.add(c);
        cabins.push(c);
      }
      k.label("🎡 Ferris Wheel · ride me!", 1.9);
      // no lookAt: the follow camera always views from +z, so the wheel faces +z to be seen face-on

      let angle = 0;
      let seatCalledAt = -1;
      let t = 0;
      const local = new THREE.Vector3();
      return {
        radius: 2.2,
        ride: {
          duration: 14,
          cameraOffset: new THREE.Vector3(0, 20, 24),
          seat(progress, out) {
            seatCalledAt = t;
            // cabin 0 carries the kid: start at the bottom, go all the way round once
            angle = -Math.PI / 2 + progress * Math.PI * 2;
            local.set(Math.cos(angle) * R, HUB_Y + Math.sin(angle) * R - 1.35, 0.1);
            k.group.updateMatrixWorld();
            out.copy(k.group.localToWorld(local));
            return 0; // face the camera so the kid can see their animal having fun
          },
        },
        update(dt, time) {
          t = time;
          const riding = t - seatCalledAt < 0.15;
          if (!riding) angle += dt * 0.25;
          // cabins hang level while the wheel turns; cabin 0 sits at `angle`
          cabins.forEach((c, i) => {
            const a = angle + (i / CABINS) * Math.PI * 2;
            c.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
          });
          spin.rotation.z = angle;
        },
        dispose: k.dispose,
      };
    },
  },
  {
    // Carousel: a spinning, bobbing ring of animals (straight from the animal registry).
    id: "carousel",
    label: "Carousel",
    emoji: "🎠",
    angleDeg: -126,
    ring: 30.5,
    clearance: 6,
    build(ctx) {
      const k = kit(ctx);
      const PLATFORM_R = 3.2;
      const base = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R + 0.3, PLATFORM_R + 0.4, 0.4, 24), new THREE.MeshStandardMaterial({ color: "#f4f1e6", flatShading: true })));
      base.position.y = 0.2;
      k.group.add(base);
      const spinner = new THREE.Group();
      spinner.position.y = 0.4;
      k.group.add(spinner);
      const deck = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R, 0.15, 24), new THREE.MeshStandardMaterial({ color: ctx.accent, flatShading: true })));
      spinner.add(deck);
      const pillar = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.4, 12), new THREE.MeshStandardMaterial({ color: "#ffd447", emissive: "#b8860b", emissiveIntensity: 0.3 })));
      pillar.position.y = 1.7;
      spinner.add(pillar);
      // striped canopy
      const colors = [ctx.accent, "#ffffff"];
      for (let i = 0; i < 12; i++) {
        const wedge = k.trackMesh(new THREE.Mesh(new THREE.ConeGeometry(PLATFORM_R + 0.5, 1.6, 3, 1, false, (i / 12) * Math.PI * 2, (Math.PI * 2) / 12), new THREE.MeshStandardMaterial({ color: colors[i % 2], flatShading: true })));
        wedge.position.y = 4.2;
        wedge.castShadow = true;
        spinner.add(wedge);
      }
      const poleGeo = k.track(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 5));
      const poleMat = k.track(new THREE.MeshStandardMaterial({ color: "#ffd447", metalness: 0.5, roughness: 0.3 }));
      const riders: { root: THREE.Object3D; phase: number; update: (dt: number) => void }[] = [];
      const cast = CAROUSEL_ANIMALS;
      cast.forEach((animalId, i) => {
        const a = (i / cast.length) * Math.PI * 2;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(Math.cos(a) * 2.4, 1.7, Math.sin(a) * 2.4);
        spinner.add(pole);
        const critter = buildCritter({ bodyColor: "", bellyColor: "", accentColor: ctx.accent, animal: getAnimal(animalId), scale: 0.8 });
        critter.root.position.set(Math.cos(a) * 2.4, 0.5, Math.sin(a) * 2.4);
        critter.setFacingAngle(Math.atan2(-Math.sin(a), Math.cos(a)));
        critter.root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
        critter.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) k.track(m.geometry);
          if (m.material) k.track(m.material as THREE.Material);
        });
        spinner.add(critter.root);
        riders.push({ root: critter.root, phase: i * 1.1, update: (dt) => critter.update(dt, false) });
      });
      k.label("🎠 Carousel · ride me!", 5.6);

      let spin = 0;
      let t = 0;
      const seat = new THREE.Vector3();
      return {
        radius: PLATFORM_R + 0.4,
        ride: {
          duration: 11,
          cameraOffset: new THREE.Vector3(0, 11, 12),
          seat(_progress, out) {
            // ride on the empty spot between the first two animals; the platform spins by
            // rotation.y = spin, which carries a local angle a0 to world angle a0 - spin
            const a = Math.PI / cast.length - spin;
            seat.set(Math.cos(a) * 2.4, 0.55 + Math.sin(t * 3) * 0.25, Math.sin(a) * 2.4);
            out.copy(ctx.position).add(seat);
            return Math.atan2(Math.sin(a), -Math.cos(a)); // face along the direction of travel
          },
        },
        update(dt, time) {
          t = time;
          spin += dt * 0.7;
          spinner.rotation.y = spin;
          for (const r of riders) {
            r.root.position.y = 0.5 + Math.sin(time * 3 + r.phase) * 0.28;
            r.update(dt);
          }
        },
        dispose: k.dispose,
      };
    },
  },
  {
    // Entrance to the Mini Golf world (lib/game3d/interiors/minigolf.ts).
    id: "minigolf",
    label: "Mini Golf",
    emoji: "⛳",
    angleDeg: 22,
    ring: 30.5,
    clearance: 5,
    build(ctx) {
      const k = kit(ctx);
      const green = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.2, 24), new THREE.MeshStandardMaterial({ color: "#3fb34f", flatShading: true })));
      green.position.y = 0.1;
      green.receiveShadow = true;
      k.group.add(green);
      const cup = new THREE.Mesh(k.track(new THREE.CircleGeometry(0.28, 16)), k.track(new THREE.MeshBasicMaterial({ color: 0x1a1a1a })));
      cup.rotation.x = -Math.PI / 2;
      cup.position.set(0.9, 0.21, -0.6);
      k.group.add(cup);
      const pole = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), new THREE.MeshStandardMaterial({ color: "#f4f1e6" })));
      pole.position.set(0.9, 1.1, -0.6);
      k.group.add(pole);
      const flag = k.trackMesh(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ color: ctx.accent, side: THREE.DoubleSide })));
      flag.position.set(1.3, 1.8, -0.6);
      k.group.add(flag);
      // little windmill
      const mill = k.trackMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.2, 8), new THREE.MeshStandardMaterial({ color: "#e5484d", flatShading: true })));
      mill.position.set(-1.2, 1.2, -0.4);
      mill.castShadow = true;
      k.group.add(mill);
      const millRoof = k.trackMesh(new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.8, 8), new THREE.MeshStandardMaterial({ color: "#8a5a2c", flatShading: true })));
      millRoof.position.set(-1.2, 2.7, -0.4);
      k.group.add(millRoof);
      const rotor = new THREE.Group();
      rotor.position.set(-1.2, 2, 0.15);
      const bladeGeo = k.track(new THREE.BoxGeometry(2.4, 0.3, 0.06));
      const bladeMat = k.track(new THREE.MeshStandardMaterial({ color: "#fff4e0", flatShading: true }));
      for (const r of [0, Math.PI / 2]) {
        const b = new THREE.Mesh(bladeGeo, bladeMat);
        b.rotation.z = r;
        rotor.add(b);
      }
      k.group.add(rotor);
      const ball = k.trackMesh(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: "#ffffff" })));
      ball.position.set(-0.2, 0.36, 0.9);
      k.group.add(ball);
      k.label("⛳ Mini Golf · walk in!", 3.6);
      k.group.lookAt(0, ctx.position.y, 0);
      return {
        radius: 2.3,
        update(_dt, t) {
          rotor.rotation.z = t * 1.4;
          flag.rotation.y = Math.sin(t * 3) * 0.3;
        },
        dispose: k.dispose,
      };
    },
  },
  {
    // Balloon cart: a pop of colour and a free balloon hello.
    id: "balloons",
    label: "Balloon Cart",
    emoji: "🎈",
    angleDeg: -162,
    ring: 16,
    build(ctx) {
      const k = kit(ctx);
      const cart = woodBox(1.4, 0.8, 0.9, "#c8483f");
      k.trackMesh(cart);
      cart.position.y = 0.7;
      k.group.add(cart);
      const wheelGeo = k.track(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12));
      const wheelMat = k.track(new THREE.MeshStandardMaterial({ color: "#3d2416" }));
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(s * 0.6, 0.3, 0.3);
        k.group.add(w);
      }
      const colors = ["#ff5d8f", "#ffd447", "#4ade80", "#60a5fa", "#c084fc", "#fb923c", "#22d3ee"];
      const balloonGeo = k.track(new THREE.SphereGeometry(0.34, 10, 8));
      const stringMat = k.track(new THREE.LineBasicMaterial({ color: 0xffffff }));
      const balloons: THREE.Mesh[] = [];
      const pts: THREE.Vector3[] = [];
      colors.forEach((c, i) => {
        const b = new THREE.Mesh(balloonGeo, k.track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 })));
        const a = (i / colors.length) * Math.PI * 2;
        b.position.set(Math.cos(a) * 0.55, 2.6 + (i % 3) * 0.3, Math.sin(a) * 0.4);
        b.scale.y = 1.15;
        b.userData.base = b.position.clone();
        k.group.add(b);
        balloons.push(b);
        pts.push(new THREE.Vector3(0, 1.1, 0), b.position.clone().setY(b.position.y - 0.35));
      });
      const strings = new THREE.LineSegments(k.track(new THREE.BufferGeometry().setFromPoints(pts)), stringMat);
      k.group.add(strings);
      k.label("🎈 Balloons!", 3.8);
      return {
        radius: 1.3,
        update(_dt, t) {
          balloons.forEach((b, i) => {
            const base = b.userData.base as THREE.Vector3;
            b.position.set(base.x + Math.sin(t * 1.3 + i) * 0.08, base.y + Math.sin(t * 2 + i) * 0.1, base.z);
          });
        },
        dispose: k.dispose,
      };
    },
  },
];

export function attractionPosition(def: AttractionDef, groundY: number): THREE.Vector3 {
  const rad = (def.angleDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(rad) * def.ring, groundY, Math.cos(rad) * def.ring);
}
