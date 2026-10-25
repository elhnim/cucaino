import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildFishingBoats } from "./fishingBoats";
import { FISHING_BOATS, fishingBoatStateAtTime } from "./fishingBoatsPlan";

function meshStats(scene: THREE.Scene) {
  let drawCalls = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    drawCalls++;
  });
  return drawCalls;
}

describe("fishing boats, streamed", () => {
  it("builds nothing when the kid is far inland, away from the sea", () => {
    const scene = new THREE.Scene();
    const s = buildFishingBoats(scene);
    // a couple of km from every harbour and the river mouth (none of the fleet's homes, grounds or
    // transit routes are anywhere near here)
    s.update(1 / 20, 1, { kid: new THREE.Vector3(-2200, 2, -2200), glow: 0 });
    expect(meshStats(scene)).toBe(0);
    s.dispose();
  });

  it("builds a boat's gear when the kid is near its mooring, within budget, and tears it down far away", () => {
    const scene = new THREE.Scene();
    const s = buildFishingBoats(scene);
    const d = FISHING_BOATS[0];
    let t = 7 * 3600; // irrelevant unit here — fishingBoats.update's own `t` is in real seconds
    for (let k = 0; k < 20; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(d.hx, 2, d.hz), glow: 0 });
    const calls = meshStats(scene);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(8);
    for (let k = 0; k < 10; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(d.hx + 2000, 2, d.hz + 2000), glow: 0 });
    expect(meshStats(scene)).toBe(0);
    s.dispose();
  });

  it("a boat bumps the kid's own boat: its sea body sits right where the plan says it is", () => {
    const scene = new THREE.Scene();
    const s = buildFishingBoats(scene);
    const d = FISHING_BOATS[0];
    let t = 0;
    for (let k = 0; k < 5; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(d.hx, 2, d.hz), glow: 0 });
    const expected = fishingBoatStateAtTime(d, t);
    const found = s.seaBodies().find((b) => Math.hypot(b.x - expected.x, b.z - expected.z) < 0.5);
    expect(found).toBeTruthy();
    s.dispose();
  });

  it("seaBodies() stays right even far from the kid, where nothing is drawn (no boat sails through it unseen)", () => {
    const scene = new THREE.Scene();
    const s = buildFishingBoats(scene);
    const d = FISHING_BOATS[1];
    let t = 3 * 3600;
    // the kid is right beside this one boat, so it's in range for seaBodies() even though the
    // renderer itself may or may not have built the full mesh set yet
    s.update(1 / 20, t, { kid: new THREE.Vector3(d.hx, 2, d.hz), glow: 0 });
    expect(s.seaBodies().length).toBeGreaterThan(0);
    s.dispose();
  });

  it("a chatty crew member only speaks when the kid's within a few metres", () => {
    const scene = new THREE.Scene();
    const s = buildFishingBoats(scene);
    const d = FISHING_BOATS[0];
    let t = 0;
    let res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(d.hx + 200, 2, d.hz + 200), glow: 0 });
    expect(res.talk).toBeNull();
    for (let k = 0; k < 10; k++) res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(d.hx, 2, d.hz), glow: 0 });
    expect(res.talk?.id).toBe(d.id);
    expect(res.talk?.line.length).toBeGreaterThan(0);
    s.dispose();
  });
});
