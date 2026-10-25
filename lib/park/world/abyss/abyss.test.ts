import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WATER_Y } from "../../registry/terrain";
import { abyssFloorY, abyssPlainY, abyssProject, rimHalfAt } from "../../registry/abyss";
import { FACTS, RIFT_FACT } from "./facts";
import {
  ABYSS_M,
  ABYSS_TRUE,
  MEG_CLEAR,
  MEG_HALF_W,
  megLen,
  trueScale,
  BRIDGE,
  CHIMNEYS,
  GROTTO,
  RIFT_L,
  RIM_Y,
  VENT_FIELD,
  WHALE_FALL,
  floorAt,
  floorY,
  makeMegState,
  megPose,
  planCreatures,
  planProps,
  safeHalf,
  hoverTarget,
  stepCreature,
  stepEscort,
  stepMegalodon,
  toWorld,
  type KidInfo,
  type Species,
} from "./plan";
import { buildAbyss, cutAbyssFloor } from "./index";
import { anglerfishGeometry, giantSquidGeometry, megalodonGeometry } from "./creatures";

const ALL: Species[] = [
  "megalodon",
  "greenland",
  "liopleurodon",
  "dunkleosteus",
  "helicoprion",
  "goblinShark",
  "frilledShark",
  "coelacanth",
  "giantSquid",
  "gulper",
  "oarfish",
  "anglerfish",
  "vampireSquid",
  "dumbo",
  "barreleye",
  "combJelly",
  "siphonophore",
  "ammonite",
  "trilobite",
  "eurypterid",
  "seaPig",
  "isopod",
  "yetiCrab",
  "giantOctopus",
];

const kidAt = (s: number, u: number, y: number): KidInfo => {
  const p = toWorld(s, u, { x: 0, y: 0, z: 0 });
  const c = abyssProject(p.x, p.z)!;
  return { x: p.x, y, z: p.z, s: c.s, u: c.u };
};

describe("the Midnight Rift: plan", () => {
  it("is deterministic and has every animal asked for", () => {
    const a = planCreatures(false);
    const b = planCreatures(false);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const sp of ALL) expect(a.some((c) => c.sp === sp)).toBe(true);
    for (const sp of ALL) expect(planCreatures(true).some((c) => c.sp === sp)).toBe(true);
    expect(JSON.stringify(planProps(false))).toBe(JSON.stringify(planProps(false)));
  });

  it("safeHalf: open water above the rim, nothing below the floor, wider higher up", () => {
    for (let s = 60; s < RIFT_L - 60; s += 17) {
      expect(safeHalf(s, RIM_Y + 5, 1, 1)).toBe(60);
      expect(safeHalf(s, floorAt(s, 0) - 2, 1, 0)).toBe(0);
      const lo = safeHalf(s, floorAt(s, 0) + 8, 1, 1);
      const hi = safeHalf(s, -30, 1, 1);
      expect(hi).toBeGreaterThanOrEqual(lo);
      expect(hi).toBeLessThanOrEqual(rimHalfAt(s) + 0.5);
    }
  });

  it("places the landmarks down in the rift, on the rock", () => {
    for (const p of [WHALE_FALL, VENT_FIELD, GROTTO]) {
      expect(abyssProject(p.x, p.z)).not.toBeNull();
      expect(Math.abs(floorY(p.x, p.z) - p.y)).toBeLessThan(1.2);
      expect(p.y).toBeLessThan(-45);
    }
    expect(WHALE_FALL.y).toBeLessThan(-100);
    expect(VENT_FIELD.y).toBeLessThan(-100);
    // the grotto is on a wall ledge well up from the floor
    expect(GROTTO.y - floorAt(GROTTO.s, 0)).toBeGreaterThan(15);
    // the bridge's ends are buried in the walls
    expect(floorAt(BRIDGE.s, BRIDGE.uL)).toBeGreaterThan(BRIDGE.y);
    expect(floorAt(BRIDGE.s, BRIDGE.uR)).toBeGreaterThan(BRIDGE.y);
    for (const c of CHIMNEYS) expect(Math.abs(floorY(c.x, c.z) - c.y)).toBeLessThan(1);
  });

  it("props stand in the rift (sessile life on the rock, boulders and crusts on the walls)", () => {
    for (const p of planProps(false)) {
      expect(abyssProject(p.x, p.z)).not.toBeNull();
      if (p.kind === "rock" || p.kind === "crust") {
        // on the cliff face: rock within a metre of it (boulders half buried, crusts on the surface)
        expect(p.y).toBeLessThan(RIM_Y);
        let rock = false;
        for (let a = 0; a < 12; a++) if (floorY(p.x + Math.sin(a * 0.52) * 0.9, p.z + Math.cos(a * 0.52) * 0.9) > p.y) rock = true;
        expect(rock).toBe(true);
        if (p.kind === "crust") expect(floorY(p.x, p.z)).toBeLessThan(p.y + 0.05);
      } else expect(Math.abs(floorY(p.x, p.z) - p.y)).toBeLessThan(0.6);
    }
  });

  it("every creature stays in the water, inside the rift, above the rock (2 simulated minutes)", () => {
    const cs = planCreatures(false);
    const meg = cs.find((c) => c.kind === "megalodon")!;
    const st = makeMegState(meg);
    const kid = kidAt(RIFT_L * 0.5, 0, -60);
    const dt = 0.2;
    for (let k = 0; k < 600; k++) {
      const t = k * dt;
      for (const c of cs) {
        if (c.kind === "megalodon") {
          stepMegalodon(c, st, kid, dt, t);
          megPose(st, c.pose, dt);
        } else if (c.kind === "escort") stepEscort(c, t, dt, kid);
        else stepCreature(c, t, dt);
        const p = c.pose;
        expect(Number.isFinite(p.x + p.y + p.z + p.yaw + p.pitch + p.roll)).toBe(true);
        expect(p.y).toBeLessThan(WATER_Y - 1);
        const fl = floorY(p.x, p.z);
        if (c.kind === "crawl" || c.kind === "fixed") expect(p.y).toBeGreaterThan(fl - 0.2);
        else expect(p.y).toBeGreaterThan(fl + 0.3);
        if (c.kind !== "megalodon" || p.y < RIM_Y) expect(abyssProject(p.x, p.z)).not.toBeNull();
      }
    }
  }, 60000);

  it("the megalodon comes to circle a diving kid, never too close, and swims off again", () => {
    const cs = planCreatures(false);
    const meg = cs.find((c) => c.kind === "megalodon")!;
    const st = makeMegState(meg);
    const kid = kidAt(RIFT_L * 0.55, 1, -58);
    const dt = 1 / 30;
    let closest = Infinity;
    let cameAt = -1;
    let modes = new Set<number>();
    let circling = 0;
    for (let k = 0; k < 30 * 150; k++) {
      const t = k * dt;
      stepMegalodon(meg, st, kid, dt, t);
      megPose(st, meg.pose, dt);
      modes.add(st.mode);
      const d = Math.hypot(meg.pose.x - kid.x, meg.pose.y - kid.y, meg.pose.z - kid.z);
      closest = Math.min(closest, d);
      if (cameAt < 0 && d < 25) cameAt = t;
      if (st.mode === 2 && d < 25) circling++;
    }
    expect(cameAt).toBeGreaterThanOrEqual(0);
    expect(cameAt).toBeLessThan(75);
    // (a true-size megalodon is ~26 units long: its centre stays well away from the kid)
    expect(closest).toBeGreaterThan(MEG_CLEAR - 1);
    expect(circling * dt).toBeGreaterThan(10);
    expect(modes.has(0) && modes.has(1) && modes.has(2)).toBe(true);
    modes = new Set();
  }, 30000);
});

describe("the Midnight Rift: true size (the Park kid: 2.26 units = a 1.4 m ten-year-old)", () => {
  it("every creature swims at its real size", () => {
    const len = (g: { geo: THREE.BufferGeometry }) => (g.geo.computeBoundingBox(), g.geo.boundingBox!.max.z - g.geo.boundingBox!.min.z);
    expect(len(megalodonGeometry())).toBeCloseTo(ABYSS_TRUE.megalodon.model, 1);
    expect(len(giantSquidGeometry())).toBeCloseTo(ABYSS_TRUE.giantSquid.model, 1);
    expect(len(anglerfishGeometry())).toBeCloseTo(ABYSS_TRUE.anglerfish.model, 1);
    const cs = planCreatures(false);
    const meg = cs.find((c) => c.sp === "megalodon")!;
    expect(megLen(meg) / ABYSS_M).toBeCloseTo(16, 5);
    // the megalodon is longer than 11 kids lying head to toe; an anglerfish is smaller than the kid's head
    expect(megLen(meg) / 2.26).toBeGreaterThan(11);
    for (const c of cs) {
      if (c.sp === "giantOctopus") continue;
      const k = c.scale / trueScale(c.sp);
      expect(k, c.sp).toBeGreaterThan(0.8);
      expect(k, c.sp).toBeLessThan(1.45);
    }
  });

  it("the megalodon's fins stay clear of the rift's walls, cruising and circling (3 simulated minutes)", () => {
    const cs = planCreatures(false);
    const meg = cs.find((c) => c.kind === "megalodon")!;
    const st = makeMegState(meg);
    const kid = kidAt(194, -5, -45);
    const dt = 0.1;
    let worst = Infinity;
    for (let k = 0; k < 1800; k++) {
      stepMegalodon(meg, st, kid, dt, k * dt);
      megPose(st, meg.pose, dt);
      const p = meg.pose;
      // its pectoral fin tips and its nose and tail: in the water, not in the rock
      for (const [ax, az] of [[MEG_HALF_W, 0], [-MEG_HALF_W, 0], [0, megLen(meg) * 0.45], [0, -megLen(meg) * 0.45]]) {
        const x = p.x + Math.cos(p.yaw) * ax + Math.sin(p.yaw) * az;
        const z = p.z - Math.sin(p.yaw) * ax + Math.cos(p.yaw) * az;
        worst = Math.min(worst, p.y - floorY(x, z));
      }
    }
    expect(worst).toBeGreaterThan(0.5);
  }, 30000);
});

describe("the Midnight Rift: escorts", () => {
  it("a few rare animals come to drift round a kid diving in the rift, off the rock", () => {
    const esc = planCreatures(false).filter((c) => c.kind === "escort");
    expect(esc.length).toBeGreaterThanOrEqual(4);
    const kid = kidAt(RIFT_L * 0.45, 0, -70);
    const dt = 0.1;
    let near = 0;
    for (let k = 0; k < 600; k++) {
      const t = k * dt;
      let n = 0;
      for (const c of esc) {
        stepEscort(c, t, dt, kid);
        const p = c.pose;
        expect(p.y).toBeGreaterThan(floorY(p.x, p.z) + 0.3);
        const d = Math.hypot(p.x - kid.x, p.y - kid.y, p.z - kid.z);
        if (t > 20) expect(d).toBeGreaterThan(2);
        if (d < 12) n++;
      }
      if (t > 20 && n >= 3) near++;
    }
    // (after they've arrived, at least three are round the kid nearly all the time)
    expect(near).toBeGreaterThan(380);
    // and they go home when the kid leaves
    const gone = { x: 0, y: -5, z: 0, s: NaN, u: 0 };
    for (let k = 0; k < 900; k++) for (const c of esc) stepEscort(c, 60 + k * dt, dt, gone);
    for (const c of esc) {
      const home = hoverTarget(c, 60 + 900 * dt, { x: 0, y: 0, z: 0 });
      expect(Math.hypot(c.pose.x - home.x, c.pose.y - home.y, c.pose.z - home.z)).toBeLessThan(6);
    }
  }, 30000);
});

describe("the Midnight Rift: facts", () => {
  it("every animal and place has a real, kid-sized fact card", () => {
    const all = [RIFT_FACT, ...Object.values(FACTS)];
    const ids = new Set<string>();
    for (const f of all) {
      expect(f.name.length).toBeGreaterThan(2);
      expect(f.text.length).toBeGreaterThan(60);
      expect(f.text.length).toBeLessThan(330);
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
    }
    for (const k of ["megalodon", "giantOctopus", "liopleurodon", "dunkleosteus", "helicoprion", "ammonite", "trilobite", "eurypterid"] as const) expect(FACTS[k].extinct).toBe(true);
    expect("extinct" in FACTS.anglerfish).toBe(false);
  });
});

describe("the Midnight Rift: renderer", () => {
  const countTris = (scene: THREE.Scene) => {
    let tris = 0;
    let calls = 0;
    scene.getObjectByName("abyss")!.traverse((o) => {
      const b = o as THREE.BatchedMesh & { _instanceInfo: { active: boolean; geometryIndex: number }[]; _geometryInfo: { vertexCount: number }[] };
      if (b.isBatchedMesh) {
        calls++;
        for (const info of b._instanceInfo) if (info.active) tris += b._geometryInfo[info.geometryIndex].vertexCount / 3;
      } else if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) {
        calls++;
        const g = (o as THREE.Mesh).geometry;
        if ((o as THREE.Mesh).isMesh) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });
    return { tris, calls };
  };

  it("fits the budget: <= 20 draw calls, <= 200k triangles (low: far fewer)", () => {
    const s1 = new THREE.Scene();
    s1.fog = new THREE.Fog(0, 5, 40);
    const a = buildAbyss(s1, {});
    const std = countTris(s1);
    expect(std.calls).toBeLessThanOrEqual(20);
    expect(std.tris).toBeLessThanOrEqual(200000);
    const s2 = new THREE.Scene();
    s2.fog = new THREE.Fog(0, 5, 40);
    const b = buildAbyss(s2, { lowQuality: true });
    const lo = countTris(s2);
    expect(lo.calls).toBeLessThanOrEqual(20);
    expect(lo.tris).toBeLessThan(std.tris * 0.6);
    a.dispose();
    b.dispose();
    expect(s1.getObjectByName("abyss")).toBeUndefined();
  }, 30000);

  it("shows only under water near the rift; spots creatures and places; reuses its result", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0, 5, 40);
    const ab = buildAbyss(scene, {});
    const group = scene.getObjectByName("abyss")!;
    const far = new THREE.Vector3(0, -5, 0);
    const r0 = ab.update(1 / 30, 1, { kid: far, under: true, glow: 0 });
    expect(group.visible).toBe(false);
    expect(r0.spot).toBeNull();
    const p = toWorld(RIFT_L * 0.5, 0, { x: 0, y: 0, z: 0 });
    const kid = new THREE.Vector3(p.x, -60, p.z);
    ab.update(1 / 30, 2, { kid, under: false, glow: 0 });
    expect(group.visible).toBe(false);
    const r1 = ab.update(1 / 30, 3, { kid, under: true, glow: 0 });
    expect(group.visible).toBe(true);
    expect(r1).toBe(r0);
    // swim up to the vents
    kid.set(VENT_FIELD.x, VENT_FIELD.y + 5, VENT_FIELD.z);
    let spot: string | null = null;
    for (let k = 0; k < 10; k++) spot = ab.update(1 / 30, 4 + k / 30, { kid, under: true, glow: 0 }).spot?.id ?? null;
    expect(spot).not.toBeNull();
    // the octopus at its grotto
    kid.set(GROTTO.x + Math.sin(GROTTO.yaw) * 5, GROTTO.y + 2, GROTTO.z + Math.cos(GROTTO.yaw) * 5);
    for (let k = 0; k < 10; k++) spot = ab.update(1 / 30, 5 + k / 30, { kid, under: true, glow: 0 }).spot?.id ?? null;
    expect(spot).toBe("giant-octopus");
    // the rift's own card near the top
    const q = toWorld(RIFT_L * 0.5, 0, { x: 0, y: 0, z: 0 });
    kid.set(q.x, -24, q.z);
    const ids = new Set<string | null>();
    for (let k = 0; k < 5; k++) ids.add(ab.update(1 / 30, 8 + k, { kid, under: true, glow: 0 }).spot?.id ?? null);
    expect([...ids].some((id) => id !== null)).toBe(true);
    ab.dispose();
  }, 30000);

  it("update is deterministic for the same inputs", () => {
    const run = () => {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0, 5, 40);
      const ab = buildAbyss(scene, {});
      const p = toWorld(RIFT_L * 0.4, 0, { x: 0, y: 0, z: 0 });
      const kid = new THREE.Vector3(p.x, -70, p.z);
      for (let k = 0; k < 120; k++) ab.update(1 / 30, k / 30, { kid, under: true, glow: 0 });
      const life = scene.getObjectByName("abyss-life") as THREE.BatchedMesh;
      const m = new THREE.Matrix4();
      const out: number[] = [];
      for (let i = 0; i < 20; i++) {
        life.getMatrixAt(i, m);
        out.push(...m.elements.map((v) => Math.round(v * 1000)));
      }
      ab.dispose();
      return out.join(",");
    };
    expect(run()).toBe(run());
  }, 30000);

  it("cutAbyssFloor patches a floor material once (cache key + chained onBeforeCompile)", () => {
    const mat = new THREE.MeshStandardMaterial();
    let called = 0;
    mat.onBeforeCompile = () => {
      called++;
    };
    cutAbyssFloor(mat);
    cutAbyssFloor(mat);
    expect(mat.customProgramCacheKey()).toContain("abyss-cut");
    const shader = { uniforms: {}, vertexShader: "void main() {\n}", fragmentShader: "void main() {\n}" } as unknown as THREE.WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(called).toBe(1);
    expect(shader.fragmentShader).toContain("discard");
    expect(shader.vertexShader).toContain("vAbyssXZ");
  });

  it("the plain function agrees with the rift at its rim", () => {
    for (let s = 50; s < RIFT_L - 50; s += 23) {
      const r = rimHalfAt(s);
      const p = toWorld(s, r + 0.01, { x: 0, y: 0, z: 0 });
      const y = abyssFloorY(p.x, p.z);
      expect(y).not.toBeNull();
      expect(Math.abs((y as number) - abyssPlainY(p.x, p.z))).toBeLessThan(0.35);
    }
  });
});
