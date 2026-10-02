import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { KID_SKI_VMAX, makeKidSki, skiHutAt, stepKidSki } from "./kidSki";
import { K_LIFT, KL_DONE, KL_OFF, KL_RIDE, KL_WAIT, SEAT_HALF, kidLiftOffer, kidLiftRequest, kidLiftSpot, makeSkiField, stepSkiField } from "./ski";
import { KID_CHUTES, PET_SLIDE_GAP, makeKidSlide, petSlidePose, slideSplashS, stepKidSlide } from "./kidSlide";
import { buildFrostIsland } from "./index";
import { FROST_SKI, GATE_HALF, frostLandY, frostPisteAt } from "../../registry/frostIsland";

const dt = 1 / 30;

describe("the Park kid skis the Penguin Ski Run", { timeout: 120_000 }, () => {
  it("skis are on offer at the start hut (and not far from it)", () => {
    expect(skiHutAt(FROST_SKI.hut.x + 1, FROST_SKI.hut.z)).toBe(true);
    expect(skiHutAt(FROST_SKI.hut.x + 12, FROST_SKI.hut.z)).toBe(false);
  });

  it("carving through the gates with the joystick: on the piste, gentle speed, S-turns with sprays, every gate counted, a finish", () => {
    const k = makeKidSki();
    let steps = 0;
    let vMax = 0;
    let sprays = 0;
    let gates = 0;
    let turns = 0;
    let lastSide = 0;
    let finished = false;
    while (k.phase !== "done" && steps++ < 3000) {
      // aim at the next gate's middle (the joystick: + = the kid's left)
      // (like a kid racing gates: once safely inside a gate's poles, already turning for the next one)
      const G = FROST_SKI.gates;
      let gi = k.nextGate;
      if (G[gi] && Math.abs(k.lat - G[gi].lat) < GATE_HALF * 0.7 && G[gi].s - k.s < 1.6) gi++;
      const g = G[gi];
      const want = g ? g.lat : 0;
      const steer = Math.max(-1, Math.min(1, (want - k.lat) * 3 - k.latV * 0.25));
      stepKidSki(k, dt, steer, true, Infinity);
      vMax = Math.max(vMax, k.v);
      if (k.spray) sprays++;
      if (k.gate) gates++;
      if (k.finish) finished = true;
      if (k.phase === "run" && k.s > 0.5) {
        const at = frostPisteAt(k.x, k.z);
        expect(at && !at.nursery && at.d < FROST_SKI.piste.hw).toBeTruthy();
        expect(Math.abs(k.y - (frostLandY(k.x, k.z) ?? 0))).toBeLessThan(0.3);
        const side = Math.sign(k.latV);
        if (Math.abs(k.latV) > 0.45 && side !== lastSide) ((turns += 1), (lastSide = side));
      }
    }
    expect(finished).toBe(true);
    expect(k.phase).toBe("done");
    expect(vMax).toBeLessThanOrEqual(KID_SKI_VMAX + 1e-6);
    expect(gates).toBe(FROST_SKI.gates.length);
    expect(k.gates).toBe(FROST_SKI.gates.length);
    expect(turns).toBeGreaterThanOrEqual(FROST_SKI.gates.length - 1);
    expect(sprays).toBeGreaterThanOrEqual(FROST_SKI.gates.length - 1);
    // ...and it stops on the run-out at the bottom
    expect(Math.hypot(k.x - FROST_SKI.bottom.x, k.z - FROST_SKI.bottom.z)).toBeLessThan(14);
  });

  it("straight down with no steering: still a finish, but the gates off the line are missed", () => {
    const k = makeKidSki();
    let steps = 0;
    while (k.phase !== "done" && steps++ < 3000) stepKidSki(k, dt, 0, true, Infinity);
    expect(k.phase).toBe("done");
    expect(k.gates).toBeLessThan(FROST_SKI.gates.length);
    expect(FROST_SKI.gates.some((g) => Math.abs(g.lat) >= GATE_HALF)).toBe(true);
  });

  it("waits at the start for a penguin setting off, and never skis into one ahead", () => {
    const k = makeKidSki();
    for (let i = 0; i < 90; i++) stepKidSki(k, dt, 0, false, Infinity);
    expect(k.phase).toBe("start");
    stepKidSki(k, dt, 0, true, Infinity);
    expect(k.phase).toBe("run");
    let ahead = 12;
    let steps = 0;
    while (k.phase === "run" && steps++ < 2000) {
      ahead += 1.2 * dt;
      stepKidSki(k, dt, 0, true, ahead);
      expect(ahead - k.s).toBeGreaterThan(2.4);
    }
  });

  it("the chairlift: waits on the boarding line, the next free chair scoops the kid up, a ride to the top, a hop off", () => {
    const f = makeSkiField(false);
    const spot = kidLiftSpot();
    expect(kidLiftOffer(spot.x + 1, spot.z)).toBe(true);
    expect(kidLiftOffer(spot.x + 9, spot.z)).toBe(false);
    expect(kidLiftRequest(f, spot.x + 1.5, spot.z)).toBe(true);
    // (not twice)
    expect(kidLiftRequest(f, spot.x, spot.z)).toBe(false);
    let t = 0;
    const seen = new Set<number>();
    let rideMinClear = Infinity;
    let shared = 0;
    for (let i = 0; i < 60 * 30 && f.kid.state !== KL_DONE; i++) {
      t += dt;
      stepSkiField(f, dt, t, { x: f.kid.x, z: f.kid.z });
      seen.add(f.kid.state);
      if (f.kid.state === KL_RIDE && f.kid.t > 0.5) {
        rideMinClear = Math.min(rideMinClear, f.kid.y - (frostLandY(f.kid.x, f.kid.z) ?? 0));
        // nobody else on the kid's chair
        for (const s of f.skiers) if (s.state === K_LIFT && s.chair === f.kid.chair) shared++;
      }
    }
    for (const st of [KL_WAIT, KL_RIDE, KL_OFF, KL_DONE]) expect(seen.has(st)).toBe(true);
    expect(rideMinClear).toBeGreaterThan(0.5);
    expect(shared).toBe(0);
    // off at the top, on the snow beside the top station
    expect(Math.hypot(f.kid.x - FROST_SKI.lift.t.x, f.kid.z - FROST_SKI.lift.t.z)).toBeLessThan(7);
    expect(Math.abs(f.kid.y - (frostLandY(f.kid.x, f.kid.z) ?? 0))).toBeLessThan(0.1);
  });

  it("the penguins ride the chairlift in pairs (two to a chair, side by side)", () => {
    const f = makeSkiField(false);
    let t = 0;
    let pairs = 0;
    let singles = 0;
    for (let i = 0; i < 240 * 30; i++) {
      t += dt;
      stepSkiField(f, dt, t, null);
      if (i % 30) continue;
      for (let c = 0; c < f.chairs; c++) {
        const a = f.seatBy[c * 2];
        const b = f.seatBy[c * 2 + 1];
        if (a >= 0 && b >= 0) {
          pairs++;
          const A = f.skiers[a];
          const B = f.skiers[b];
          expect(Math.hypot(A.x - B.x, A.z - B.z)).toBeCloseTo(SEAT_HALF * 2, 1);
        } else if (a >= 0 || b >= 0) singles++;
      }
    }
    expect(pairs).toBeGreaterThan(singles);
  });
});

describe("the Park kid and the penguins", { timeout: 120_000 }, () => {
  it("walking right through the lift queue: the penguins step aside and the kid never walks through one", () => {
    const scene = new THREE.Scene();
    const fr = buildFrostIsland(scene, {});
    const bodies = scene.getObjectByName("frost-penguins") as THREE.InstancedMesh;
    const group = scene.getObjectByName("frost-island")!;
    const spot = kidLiftSpot();
    // a line straight across the bottom station's queue lanes
    const L = FROST_SKI.lift;
    const rx = L.dz;
    const rz = -L.dx;
    const kid = new THREE.Vector3();
    const M = new THREE.Matrix4();
    const P = new THREE.Vector3();
    let t = 0;
    let worst = Infinity;
    let pushedKid = 0;
    for (let lap = 0; lap < 3; lap++)
      for (let i = 0; i <= 120; i++) {
        const u = i / 120;
        const want = { x: spot.x + rx * (6 - u * 12) - L.dx * (lap * 2 - 3), z: spot.z + rz * (6 - u * 12) - L.dz * (lap * 2 - 3) };
        const before = { ...want };
        fr.blockKid(want);
        if (Math.hypot(want.x - before.x, want.z - before.z) > 1e-3) pushedKid++;
        kid.set(want.x, frostLandY(want.x, want.z) ?? 3, want.z);
        fr.update(dt, (t += dt), { kid, glow: 0, hour: 12, under: false });
        group.updateMatrixWorld(true);
        for (let p = 0; p < bodies.count; p++) {
          bodies.getMatrixAt(p, M);
          M.premultiply(group.matrixWorld);
          P.setFromMatrixPosition(M);
          if (Math.abs(P.y - kid.y) > 1.2) continue;
          worst = Math.min(worst, Math.hypot(P.x - kid.x, P.z - kid.z));
        }
      }
    // (the kid's half-width plus a penguin's: never inside one another)
    expect(worst).toBeGreaterThan(0.75);
    fr.dispose();
    void pushedKid;
  });
});

describe("the pet on the penguin slides", () => {
  it("toboggans down the same chute just behind the kid, and splashes in after them", () => {
    for (let c = 0; c < KID_CHUTES.length; c++) {
      const C = KID_CHUTES[c];
      const k = makeKidSlide(c, C.x[0] - Math.sin(C.head[0]) * 1.2, C.z[0] - Math.cos(C.head[0]) * 1.2);
      const o = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      let steps = 0;
      let petS = -9;
      let splashed = false;
      while (!k.done && steps++ < 4000) {
        stepKidSlide(k, dt, 0, true, Infinity);
        const s0 = petS;
        petS = petSlidePose(k, o);
        if (s0 < slideSplashS(c) && petS >= slideSplashS(c)) splashed = true;
        // behind the kid on the chute
        expect(petS).toBeLessThan(k.s - 0.5);
        if (!k.waiting) expect(k.s - petS).toBeCloseTo(PET_SLIDE_GAP, 3);
        // on the chute's floor (its own pose, a little lower down the same chute)
        expect(Number.isFinite(o.x + o.y + o.z)).toBe(true);
        if (petS > 1) expect(o.y).toBeGreaterThanOrEqual(k.y - 1e-3);
      }
      // the kid splashed; the pet carries on down (as the engine runs it) and splashes too
      const q = makeKidSlide(c, o.x, o.z);
      q.s = petS;
      q.v = Math.max(3, k.v);
      q.waiting = false;
      for (let i = 0; i < 2000 && !q.done && !splashed; i++) {
        stepKidSlide(q, dt, 0, true, Infinity);
        if (q.splash) splashed = true;
      }
      expect(splashed).toBe(true);
    }
  });
});
