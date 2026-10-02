// Hand-made procedural chibi animals for Cucaino Park (no model files).
//
//   const rig = buildChibi("animal-fox", { height: 2.1, role: "kid", accent: "#e5484d" });
//   scene.add(rig.root);            // feet at y=0, facing +Z
//   rig.update(dt, groundSpeed);    // every frame; walk/run follow the speed
//   rig.play("wave", true);         // one-shot, then back to idle/walk
//   rig.setGlow(night);             // 0..1: eyes / cheeks / markings softly glow
//   rig.dispose();
//
// Geometry is baked + merged per joint & colour; materials are shared toon materials per colour
// (the glow ones are per rig so each character can fade its own glow).
import * as THREE from "three";
import type { AnimalId } from "@/lib/park/assets/loader";
import { ChibiAnimator, rngFrom, type ChibiAction } from "./animate";
import { DESIGNS } from "./designs";
import { isSharedMaterial } from "./materials";
import { kidOutfit, petOutfit, visitorOutfit } from "./outfits";
import { Kit, STD_LAYOUT, type Layout } from "./parts";

export type { ChibiAction };

export interface ChibiOptions {
  /** total height in world units (kid ~2.1, pet ~1.25, visitors 1.5–2.1) */
  height: number;
  /** "kid" wears a scarf + tiny backpack in `accent`; "pet" wears a collar with a round tag; "visitor" plain or a random small accessory */
  role: "kid" | "pet" | "visitor";
  /** accent colour for the kid outfit / pet collar (hex string) */
  accent?: string;
  /** seed for small random variation (visitor accessories, idle timing) */
  seed?: number;
}

export interface ChibiRig {
  root: THREE.Group; // feet at y=0, facing +Z
  /** start an action; once=true plays it one time then returns to idle/walk */
  play(action: ChibiAction, once?: boolean): void;
  /** call every frame. speed = current ground speed in units/s (0 = standing); drives walk/run automatically when no one-shot action is playing */
  update(dt: number, speed: number): void;
  /** night glow 0..1 — eyes/cheeks/markings can softly glow at night in the Pandora-like twilight */
  setGlow(amount: number): void;
  /** swimming (strokes + kicks when `moving`, treading water when not); false = back on land */
  setSwim(on: boolean, moving: boolean): void;
  /** belly-sliding head-first (Frostpeak's penguin slides); false = back on your feet */
  setSlide(on: boolean): void;
  /** Frostpeak's ski run: "ski" (carving down the piste) or "sit" (on the chairlift); null = normal */
  setStance(s: "ski" | "sit" | null): void;
  dispose(): void;
}

export const CHIBI_IDS = Object.keys(DESIGNS) as AnimalId[];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildChibi(id: AnimalId, opts: ChibiOptions): ChibiRig {
  const design = DESIGNS[id] ?? DESIGNS["animal-fox"];
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 2;
  const seed = opts.seed ?? hash(`${id}:${opts.role}`);
  const rand = rngFrom(seed ^ 0x9e3779b9);

  const root = new THREE.Group();
  root.name = `chibi:${id}`;
  const layout: Layout = { ...STD_LAYOUT, ...design.layout };
  const k = new Kit(root, layout);
  const hc = k.headE.c, hr = k.headE.r;
  k.top = { at: [hc.x, hc.y + hr.y, hc.z] };
  design.build(k, { role: opts.role });

  const accent = opts.accent ?? "#e5484d";
  if (opts.role === "kid") kidOutfit(k, accent);
  else if (opts.role === "pet") petOutfit(k, accent);
  else visitorOutfit(k, rand);
  k.finish();

  // design units → world units
  k.rig.scale.setScalar(height / k.fit);
  root.userData.chibi = { id, role: opts.role, height };

  const anim = new ChibiAnimator(k, height, seed);
  anim.setGlow(0);
  let disposed = false;

  return {
    root,
    play: (a, once) => anim.play(a, once),
    update: (dt, speed) => {
      if (!disposed) anim.update(dt, speed);
    },
    setGlow: (g) => anim.setGlow(g),
    setSwim: (on, moving) => anim.setSwim(on, moving),
    setSlide: (on) => anim.setSlide(on),
    setStance: (st) => anim.setStance(st),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) if (!isSharedMaterial(mat)) mat.dispose();
      });
      root.removeFromParent();
    },
  };
}
