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
  dispose(): void;
}

export interface AttractionDef {
  id: string;
  label: string;
  emoji: string;
  angleDeg: number;
  ring: number;
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
];

export function attractionPosition(def: AttractionDef, groundY: number): THREE.Vector3 {
  const rad = (def.angleDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(rad) * def.ring, groundY, Math.cos(rad) * def.ring);
}

/** Kid-sized "did you know?" facts for the wishing well. Append freely. */
export const FUN_FACTS = [
  "Octopuses have three hearts! 🐙",
  "Honey never goes bad — 3000-year-old honey is still yummy! 🍯",
  "A group of flamingos is called a flamboyance! 🦩",
  "Your heart beats about 100,000 times a day! ❤️",
  "Bananas are berries, but strawberries aren't! 🍌",
  "Sloths can hold their breath for 40 minutes! 🦥",
  "The Moon slowly moves 4 cm further from Earth each year! 🌙",
  "Koalas sleep up to 20 hours a day! 🐨",
  "A snail can sleep for three years! 🐌",
  "Butterflies taste with their feet! 🦋",
  "Saving a little every week adds up to a lot — that's how money grows! 💰",
  "Brushing twice a day keeps sugar bugs away! 🪥",
  "Sharks were around before trees! 🦈",
  "Cows have best friends and get sad when apart! 🐮",
  "Water covers about 71% of Earth! 🌊",
  "The Eiffel Tower grows about 15 cm in summer heat! 🗼",
  "A day on Venus is longer than a year on Venus! 🪐",
  "Penguins give pebbles to say 'I like you'! 🐧",
  "Reading 20 minutes a day = about 1.8 million words a year! 📚",
  "Elephants can recognise themselves in a mirror! 🐘",
];
