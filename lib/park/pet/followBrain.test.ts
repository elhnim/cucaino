import { describe, expect, it } from "vitest";
import { newPetBrain, stepPetBrain, type PetKid } from "./followBrain";

const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const DT = 1 / 60;

describe("the pet's follow brain", () => {
  it("moves like a body: it never jumps, never out-accelerates itself and never spins on the spot at speed", () => {
    const rnd = seeded();
    const b = newPetBrain(0, 0);
    const kid: PetKid = { x: 2, z: 0, facing: 0, speed: 0 };
    let maxStep = 0;
    let maxDv = 0;
    let maxTurnAtSpeed = 0;
    for (let i = 0; i < 60 * 90; i++) {
      // the kid walks a wandering path, stopping now and then
      const t = i * DT;
      const walking = Math.floor(t / 9) % 2 === 0;
      kid.speed = walking ? 7 : 0;
      if (walking) {
        kid.facing = Math.sin(t * 0.3) * 2;
        kid.x += Math.sin(kid.facing) * 7 * DT;
        kid.z += Math.cos(kid.facing) * 7 * DT;
      }
      const px = b.x;
      const pz = b.z;
      const pv = Math.hypot(b.vx, b.vz);
      const ph = Math.atan2(b.vx, b.vz);
      stepPetBrain(b, DT, kid, rnd);
      maxStep = Math.max(maxStep, Math.hypot(b.x - px, b.z - pz));
      const v = Math.hypot(b.vx, b.vz);
      maxDv = Math.max(maxDv, Math.abs(v - pv));
      if (v > 3 && pv > 3) maxTurnAtSpeed = Math.max(maxTurnAtSpeed, Math.abs(Math.atan2(Math.sin(Math.atan2(b.vx, b.vz) - ph), Math.cos(Math.atan2(b.vx, b.vz) - ph))));
    }
    expect(maxStep).toBeLessThan(13 * DT + 0.01); // never faster than a sprint
    expect(maxDv).toBeLessThan(24 * DT + 0.001); // eases in and out of its speed
    expect(maxTurnAtSpeed).toBeLessThan(5.3 * DT + 0.001); // running, it arcs round
  });

  it("keeps up on a long walk, at the kid's side rather than on their heels or miles behind", () => {
    const rnd = seeded(3);
    const b = newPetBrain(-1, -1);
    const kid: PetKid = { x: 0, z: 0, facing: 0.4, speed: 7 };
    let worst = 0;
    let closest = Infinity;
    for (let i = 0; i < 60 * 40; i++) {
      kid.x += Math.sin(kid.facing) * 7 * DT;
      kid.z += Math.cos(kid.facing) * 7 * DT;
      stepPetBrain(b, DT, kid, rnd);
      if (i > 120) {
        const d = Math.hypot(kid.x - b.x, kid.z - b.z);
        worst = Math.max(worst, d);
        closest = Math.min(closest, d);
      }
    }
    expect(worst).toBeLessThan(7.5);
    expect(closest).toBeGreaterThan(0.8);
  });

  it("when the kid stops it comes up, settles and looks at them — it does not orbit for ever", () => {
    const rnd = () => 0.95; // (the "just be happy" choice every time: no pottering off)
    const b = newPetBrain(6, 6);
    const kid: PetKid = { x: 0, z: 0, facing: 0, speed: 0 };
    for (let i = 0; i < 60 * 6; i++) stepPetBrain(b, DT, kid, rnd);
    expect(Math.hypot(b.x, b.z)).toBeLessThan(2.8);
    expect(Math.hypot(b.x, b.z)).toBeGreaterThan(1.2);
    const at = { x: b.x, z: b.z };
    for (let i = 0; i < 60 * 2; i++) stepPetBrain(b, DT, kid, rnd);
    expect(Math.hypot(b.x - at.x, b.z - at.z)).toBeLessThan(0.05); // standing still
    const toKid = Math.atan2(-b.x, -b.z);
    expect(Math.abs(Math.atan2(Math.sin(b.heading - toKid), Math.cos(b.heading - toKid)))).toBeLessThan(0.2);
  });

  it("left alone it finds things to do — potters off, sniffs, comes back, and never strays far", () => {
    const rnd = seeded(11);
    const b = newPetBrain(1.5, 1.5);
    const kid: PetKid = { x: 0, z: 0, facing: 0, speed: 0 };
    const modes = new Set<string>();
    let far = 0;
    let happy = 0;
    for (let i = 0; i < 60 * 240; i++) {
      if (stepPetBrain(b, DT, kid, rnd).emote) happy++;
      modes.add(b.mode);
      far = Math.max(far, Math.hypot(b.x, b.z));
    }
    expect(modes.has("potter")).toBe(true);
    expect(modes.has("sniff")).toBe(true);
    expect(modes.has("zoom")).toBe(true);
    expect(happy).toBeGreaterThan(0);
    expect(far).toBeLessThan(8.5);
  });

  it("is beside the kid at once after they are whisked far away", () => {
    const b = newPetBrain(0, 0);
    stepPetBrain(b, DT, { x: 900, z: -600, facing: 1, speed: 0 }, seeded());
    expect(Math.hypot(b.x - 900, b.z + 600)).toBeLessThan(3);
  });
});
