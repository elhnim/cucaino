import { describe, expect, it } from "vitest";
import { DINO_M, SPECIES, TRUE_SIZE, makeSim, stepSim, trexMode, trueK, type DinoSim } from "./herd";
import { DINO_ISLAND, DINO_OBSTACLES, DINO_PADDOCK, DINO_RANGES, DINO_SPECIES, dinoLandY } from "../../registry/dinoIsland";

const run = (sim: DinoSim, secs: number, t0: number, hour: number, kx: number, kz: number, near: boolean) => {
  let t = t0;
  for (let k = 0; k < secs * 20; k++) stepSim(sim, 1 / 20, (t += 1 / 20), hour, kx, kz, near);
  return t;
};
const walkers = (sim: DinoSim) => sim.animals.filter((a) => a.def.id !== "ptero" && a.def.id !== "plesio");

describe("Dino Isle's animals", () => {
  it("has 20–35 dinosaurs (about half in low quality), plus Ice Age giants and recent extinct animals", () => {
    const hi = makeSim(false);
    const lo = makeSim(true);
    const dinos = (s: DinoSim) => s.animals.filter((a) => DINO_SPECIES[a.def.id].era === "dino").length;
    expect(dinos(hi)).toBeGreaterThanOrEqual(20);
    expect(dinos(hi)).toBeLessThanOrEqual(35);
    expect(dinos(lo)).toBeLessThanOrEqual(Math.ceil(dinos(hi) * 0.62));
    const era = (s: DinoSim, e: string) => new Set(s.animals.filter((a) => DINO_SPECIES[a.def.id].era === e).map((a) => a.def.id)).size;
    expect(era(hi, "dino")).toBe(9);
    expect(era(hi, "iceage")).toBe(7);
    expect(era(hi, "recent")).toBe(4);
    expect(era(lo, "iceage")).toBe(7);
    // babies: triceratops at the nests (some still hatching), a mammoth calf, sabre-cat cubs
    expect(hi.animals.filter((a) => a.baby && a.def.id === "trike").length).toBeGreaterThanOrEqual(3);
    expect(hi.animals.filter((a) => a.baby && a.def.id === "trike" && a.mode === 1).length).toBeGreaterThanOrEqual(1);
    expect(hi.animals.some((a) => a.baby && a.def.id === "mammoth" && a.mother)).toBe(true);
    expect(hi.animals.filter((a) => a.def.id === "trex").length).toBe(1);
  });

  it("roams its home ranges on dry land, round the obstacles and each other (a long day, nobody about)", () => {
    const sim = makeSim(false);
    let t = 0;
    for (let m = 0; m < 6; m++) {
      t = run(sim, 30, t, 8 + m, 0, 0, false);
      for (const a of walkers(sim)) {
        const g = dinoLandY(a.x, a.z);
        expect(g, a.def.id).not.toBeNull();
        expect(g!, a.def.id).toBeGreaterThan(1.0);
        expect(Math.abs(a.y - g!), a.def.id).toBeLessThan(a.mode === 1 ? 0.8 : 0.05);
        const r = a.baby && a.def.id === "trike" ? DINO_RANGES.nests : DINO_RANGES[a.def.range];
        const home = a.mother ? { x: a.mother.x, z: a.mother.z, r: 12 } : r;
        expect(Math.hypot(a.x - home.x, a.z - home.z), `${a.def.id} strays`).toBeLessThan(home.r + 9);
        if (a.mode !== 1) for (const o of DINO_OBSTACLES) expect(Math.hypot(o.x - a.x, o.z - a.z), `${a.def.id} in an obstacle`).toBeGreaterThan(o.r - 0.05);
      }
    }
    // they're not all stood still: the herds wander
    const moved = walkers(sim).filter((a) => a.speed > 0.05 || a.gait > 0.05).length;
    expect(moved).toBeGreaterThan(0);
    // (and don't pile up: few big overlaps)
    const W = walkers(sim).filter((a) => a.mode !== 1);
    let overlaps = 0;
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) if (Math.hypot(W[i].x - W[j].x, W[i].z - W[j].z) < (W[i].def.size * W[i].scale + W[j].def.size * W[j].scale) * 0.5) overlaps++;
    expect(overlaps).toBeLessThanOrEqual(2);
  }, 30_000); // (a long simulation: give it room when the whole suite runs in parallel)

  it("notices the kid: heads turn to look, big ones keep their distance, curious little ones come to sniff", () => {
    const sim = makeSim(false);
    let t = run(sim, 5, 0, 10, 0, 0, false);
    // stand in the middle of the brachiosaurs' range
    const B = DINO_RANGES.brachio;
    t = run(sim, 20, t, 10, B.x, B.z, true);
    for (const a of sim.animals.filter((q) => q.def.id === "brachio")) expect(Math.hypot(a.x - B.x, a.z - B.z), "a brachiosaur walks round the kid").toBeGreaterThan(3.5);
    const lookers = sim.animals.filter((a) => a.def.id === "brachio" && Math.abs(a.hy) > 0.08);
    expect(lookers.length).toBeGreaterThanOrEqual(1);
    // among the compys: one comes right up to sniff
    const C = DINO_RANGES.compy;
    let closest = Infinity;
    for (let k = 0; k < 20 * 20; k++) {
      stepSim(sim, 1 / 20, (t += 1 / 20), 10, C.x, C.z, true);
      for (const a of sim.animals.filter((q) => q.def.id === "compy")) closest = Math.min(closest, Math.hypot(a.x - C.x, a.z - C.z));
    }
    expect(closest).toBeLessThan(3);
    expect(closest).toBeGreaterThan(0.5);
  });

  it("the T-rex stays in its paddock, stomps over and ROARS when the kid comes to the fence, then yawns and naps", () => {
    const sim = makeSim(false);
    const P = DINO_PADDOCK;
    let t = run(sim, 3, 0, 11, 0, 0, false);
    const kx = P.x - P.r - 3;
    const kz = P.z;
    let roared = 0;
    const modes = new Set<string>();
    for (let k = 0; k < 20 * 60; k++) {
      stepSim(sim, 1 / 20, (t += 1 / 20), 11, kx, kz, true);
      if (sim.roared) roared++;
      modes.add(trexMode(sim));
      // (true size: its hips stay far enough in that its 7.8 m tail never pokes through the fence)
      expect(Math.hypot(sim.trex.x - P.x, sim.trex.z - P.z) + 7.8 * sim.trex.scale).toBeLessThan(P.r);
    }
    expect(roared).toBeGreaterThanOrEqual(1);
    expect(roared).toBeLessThanOrEqual(4);
    for (const m of ["stomp", "roar", "yawn", "nap"]) expect(modes.has(m), m).toBe(true);
    expect(sim.trex.jaw).toBeLessThan(1.3);
  });

  it("rests at night; pteranodons keep soaring, the plesiosaur keeps swimming round the island", () => {
    const sim = makeSim(false);
    const t = run(sim, 120, 0, 22.5, 0, 0, false);
    const W = walkers(sim).filter((a) => a.mode !== 1 && !a.mother);
    const resting = W.filter((a) => a.lie > 0.5).length;
    expect(resting / W.length).toBeGreaterThan(0.3);
    for (const a of sim.animals.filter((q) => q.def.id === "ptero")) expect(a.y).toBeGreaterThan(20);
    const ple = sim.animals.find((q) => q.def.id === "plesio")!;
    const d = Math.hypot(ple.x - DINO_ISLAND.x, ple.z - DINO_ISLAND.z);
    expect(d).toBeGreaterThan(DINO_ISLAND.r * 1.1);
    expect(d).toBeLessThan(DINO_ISLAND.r * 1.5);
    void t;
  });

  it("are true size next to the Park kid (2.26 units = a 1.4 m ten-year-old: 1 m = 1.6 units)", () => {
    expect(DINO_M).toBeCloseTo(2.26 / 1.4, 1);
    const sim = makeSim(false);
    for (const def of SPECIES) {
      const t = TRUE_SIZE[def.id];
      // the average grown-up's model size x scale = its real size x 1.6 (within the herd's jitter)
      const mid = (def.scale[0] + def.scale[1]) / 2;
      expect(t.model * mid, def.id).toBeCloseTo(t.real * DINO_M, 1);
      for (const a of sim.animals.filter((q) => q.def === def && !q.baby)) {
        expect(a.scale / trueK(def.id), def.id).toBeGreaterThan(0.85);
        expect(a.scale / trueK(def.id), def.id).toBeLessThan(1.15);
      }
    }
    const KID = 2.26;
    const adult = (id: string) => sim.animals.find((a) => a.def.id === id && !a.baby)!;
    // a brachiosaur's head is ~9 kids up; a T-rex is ~8.5 kids long; a dodo comes up to the kid's waist
    expect((13.1 * adult("brachio").scale) / KID).toBeGreaterThan(8);
    expect((12.95 * adult("trex").scale) / KID).toBeGreaterThan(8);
    expect((1.01 * adult("dodo").scale) / KID).toBeLessThan(0.6);
  });

  it("is deterministic", () => {
    const a = makeSim(false);
    const b = makeSim(false);
    run(a, 40, 0, 15, DINO_ISLAND.x + 10, DINO_ISLAND.z, true);
    run(b, 40, 0, 15, DINO_ISLAND.x + 10, DINO_ISLAND.z, true);
    expect(a.animals.map((q) => [q.x, q.z, q.yaw])).toEqual(b.animals.map((q) => [q.x, q.z, q.yaw]));
  });
});
