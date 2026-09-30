import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WATER_Y, groundY } from "../../registry/terrain";
import {
  FOOTPRINTS,
  GARDENS,
  HERO_ANEMONES,
  PEARLS,
  PEARL_COUNT,
  REEF_KINDS,
  RULES,
  SECTORS,
  SPECIES,
  TEMPLE,
  WRECK,
  avoidKid,
  causticField,
  clampWater,
  fillWindow,
  planJellies,
  planReef,
  planSchools,
  planVents,
  seaD,
  sectorOf,
  stepFish,
  windowCount,
} from "./plan";
import {
  anemoneGeometry,
  brainGeometry,
  bushGeometry,
  clamBaseGeometry,
  clamLidGeometry,
  crabGeometry,
  eelGeometry,
  fanGeometry,
  fishGeometry,
  galleonGeometry,
  jellyGeometry,
  kelpGeometry,
  mantaGeometry,
  octopusGeometry,
  orcaGeometry,
  rayGeometry,
  seagrassGeometry,
  seahorseGeometry,
  smallFishGeometry,
  staghornGeometry,
  starfishGeometry,
  tableGeometry,
  templeGeometry,
  tubeGeometry,
  turtleGeometry,
  urchinGeometry,
} from "./geometry";
import { buildUnderwater } from "./index";
import { buildRockGeometry } from "../fantasy/stones";
import { makeSwimmer, seaFloorY, swim, type SwimStyle } from "../sea/wander";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const finite = (g: THREE.BufferGeometry) => Array.from(g.attributes.position.array as Float32Array).every(Number.isFinite);

describe("pearls", () => {
  it("there are 15, with ids 0..14", () => {
    expect(PEARL_COUNT).toBe(15);
    expect(PEARLS.map((p) => p.id)).toEqual([...Array(15).keys()]);
  });
  it("every pearl sits on the sea floor, under water, on the reef", () => {
    for (const p of PEARLS) {
      expect(p.y).toBeLessThan(WATER_Y - 1.5);
      expect(Math.abs(p.y - groundY(p.x, p.z))).toBeLessThan(1e-6);
      const d = seaD(p.x, p.z);
      expect(d).toBeGreaterThan(14);
      expect(d).toBeLessThan(44);
    }
  });
  it("pearls are spread out (no two clams on top of each other)", () => {
    for (let i = 0; i < PEARLS.length; i++)
      for (let j = i + 1; j < PEARLS.length; j++) expect(Math.hypot(PEARLS[i].x - PEARLS[j].x, PEARLS[i].z - PEARLS[j].z)).toBeGreaterThan(3);
  });
});

describe("reef gardens and landmarks", () => {
  it("four gardens, one of each kind, out on the reef", () => {
    expect(GARDENS.map((g) => g.kind).sort()).toEqual(["glow", "rainbow", "ruins", "wreck"]);
    for (const g of GARDENS) {
      expect(seaD(g.x, g.z)).toBeGreaterThan(20);
      expect(seaD(g.x, g.z)).toBeLessThan(40);
      expect(g.y).toBeLessThan(-3);
    }
  });
  it("the galleon and temple sit deep enough to stand tall", () => {
    expect(WRECK.y).toBeLessThan(-6);
    expect(TEMPLE.y).toBeLessThan(-6);
  });
  it("hero anemones (clownfish homes) are under water", () => {
    for (const a of HERO_ANEMONES) expect(a.y).toBeLessThan(WATER_Y - 2);
  });
});

describe("planReef", () => {
  const plan = planReef();
  const low = planReef({ lowQuality: true });
  it("every item is in its band, under water, clear of the landmarks", () => {
    for (const kind of REEF_KINDS) {
      const R = RULES[kind];
      for (const it of plan.items[kind]) {
        const d = seaD(it.x, it.z);
        expect(d).toBeGreaterThanOrEqual(R.d0);
        expect(d).toBeLessThanOrEqual(R.d1);
        expect(it.y).toBeLessThan(WATER_Y - 1);
        for (const f of FOOTPRINTS) expect(Math.hypot(it.x - f.x, it.z - f.z)).toBeGreaterThanOrEqual(f.r);
      }
    }
  });
  it("is deterministic", () => {
    const again = planReef();
    for (const kind of REEF_KINDS) {
      expect(again.items[kind].length).toBe(plan.items[kind].length);
      expect(again.items[kind][0]).toEqual(plan.items[kind][0]);
    }
  });
  it("items are bucketed by sector and every sector's range is right", () => {
    for (const kind of REEF_KINDS) {
      const st = plan.starts[kind];
      expect(st[0]).toBe(0);
      expect(st[SECTORS]).toBe(plan.items[kind].length);
      for (let s = 0; s < SECTORS; s++) {
        expect(st[s + 1]).toBeGreaterThanOrEqual(st[s]);
        for (let i = st[s]; i < st[s + 1]; i++) expect(plan.items[kind][i].sector).toBe(s);
      }
    }
  });
  it("capacities stay within the caps (half at low quality)", () => {
    for (const kind of REEF_KINDS) {
      expect(plan.capacity[kind]).toBeLessThanOrEqual(RULES[kind].cap);
      expect(low.capacity[kind]).toBeLessThanOrEqual(Math.ceil(RULES[kind].cap / 2));
    }
  });
  it("the reef runs all the way round the island", () => {
    let empty = 0;
    for (let s = 0; s < SECTORS; s++) if (windowCount(plan.starts.staghorn, s, 1) + windowCount(plan.starts.seagrass, s, 1) === 0) empty++;
    expect(empty).toBe(0);
  });
  it("gardens are denser than the open reef", () => {
    const near = (x: number, z: number, r: number) => GARDENS.some((g) => Math.hypot(x - g.x, z - g.z) < r);
    let inG = 0;
    let outG = 0;
    for (const it of plan.items.staghorn) if (near(it.x, it.z, 18)) inG++;
    else outG++;
    const gardenArea = GARDENS.length * Math.PI * 18 * 18;
    const ringArea = Math.PI * (195 * 195 - 170 * 170);
    expect(inG / gardenArea).toBeGreaterThan((outG / ringArea) * 2);
  });
  it("fillWindow takes the kid's own sector first and never over-fills", () => {
    const st = plan.starts.staghorn;
    for (const centre of [0, 5, 64, 127]) {
      const seen: number[] = [];
      const n = fillWindow(st, centre, plan.half, 25, (i, slot) => {
        expect(slot).toBe(seen.length);
        seen.push(i);
      });
      expect(n).toBe(seen.length);
      expect(n).toBeLessThanOrEqual(25);
      const own = st[centre + 1] - st[centre];
      for (let k = 0; k < Math.min(own, 25); k++) expect(plan.items.staghorn[seen[k]].sector).toBe(centre);
    }
  });
  it("windows wrap round the island", () => {
    const st = plan.starts.rock;
    expect(windowCount(st, 0, 2)).toBe(windowCount(st, SECTORS, 2));
    let total = 0;
    for (let s = 0; s + 2 < SECTORS - 2; s += 5) total += windowCount(st, s, 2);
    expect(total).toBeLessThanOrEqual(plan.items.rock.length);
  });
  it("sectorOf covers 0..SECTORS-1", () => {
    for (let a = -Math.PI; a < Math.PI; a += 0.05) {
      const s = sectorOf(Math.sin(a) * 180, Math.cos(a) * 180);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(SECTORS);
    }
  });
});

describe("triangle budget", () => {
  it("the streamed reef stays within budget (standard <= 140k, low <= 72k triangles)", () => {
    const geos: Record<string, THREE.BufferGeometry> = {
      bush: bushGeometry(),
      seahorse: seahorseGeometry(),
      octopus: octopusGeometry(),
      eel: eelGeometry(),
      crab: crabGeometry(),
      staghorn: staghornGeometry(),
      brain: brainGeometry(),
      table: tableGeometry(),
      fan: fanGeometry(),
      tube: tubeGeometry(),
      anemone: anemoneGeometry(),
      seagrass: seagrassGeometry(),
      kelp: kelpGeometry(),
      rock: buildRockGeometry(),
      starfish: starfishGeometry(),
      urchin: urchinGeometry(),
    };
    const sum = (p: ReturnType<typeof planReef>) => REEF_KINDS.reduce((a, k) => a + p.capacity[k] * tris(geos[k]), 0) + HERO_ANEMONES.length * tris(geos.anemone);
    expect(sum(planReef())).toBeLessThanOrEqual(140000);
    expect(sum(planReef({ lowQuality: true }))).toBeLessThanOrEqual(72000);
  });
  it("the whole underwater world, everything at full capacity: <= 45 draw calls, <= 260k triangles (low: <= 130k)", () => {
    for (const lowQuality of [false, true]) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x3ccfd9, 20, 86);
      const uw = buildUnderwater(scene, { lowQuality });
      let calls = 0;
      let triangles = 0;
      for (const root of [uw.group, uw.surface])
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh && !(o as THREE.Points).isPoints) return;
          calls++;
          if ((o as THREE.Points).isPoints) return;
          const n = tris(m.geometry);
          // (instanced: every slot filled)
          triangles += n * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).instanceMatrix.count : 1);
        });
      expect(calls).toBeLessThanOrEqual(45);
      expect(triangles).toBeLessThanOrEqual(lowQuality ? 130000 : 260000);
      // and it runs (under water, day and twilight) without blowing up
      const kid = new THREE.Vector3(Math.sin(0.2) * 190, -4, Math.cos(0.2) * 190);
      for (let i = 0; i < 60; i++) uw.update(1 / 30, i / 30, { kid, under: true, glow: i > 30 ? 1 : 0 });
      uw.dispose();
    }
  });
  it("the new reef life is finite and modest", () => {
    for (const [name, g, max] of [
      ["bush", bushGeometry(), 160],
      ["seahorse", seahorseGeometry(), 160],
      ["octopus", octopusGeometry(), 320],
      ["eel", eelGeometry(), 160],
      ["crab", crabGeometry(), 160],
      ["ray", rayGeometry(), 260],
      ["small fish", smallFishGeometry(), 40],
    ] as const) {
      expect(finite(g), name).toBe(true);
      expect(tris(g), name).toBeLessThanOrEqual(max);
      expect(g.attributes.aFx, name).toBeDefined();
      expect(g.attributes.color, name).toBeDefined();
    }
  });
  it("creature and landmark geometry is finite and modest", () => {
    const list: [string, THREE.BufferGeometry, number][] = [
      ["fish", fishGeometry(), 130],
      ["manta", mantaGeometry(), 800],
      ["turtle", turtleGeometry(), 800],
      ["orca", orcaGeometry(), 1400],
      ["jelly", jellyGeometry(), 400],
      ["clam", clamBaseGeometry(), 800],
      ["lid", clamLidGeometry(), 700],
      ["galleon", galleonGeometry(), 2500],
      ["temple", templeGeometry({ headroom: 6 }).geometry, 3500],
    ];
    for (const [name, g, max] of list) {
      expect(finite(g), name).toBe(true);
      expect(tris(g), name).toBeLessThanOrEqual(max);
    }
  });
  it("the orca carries its markings", () => {
    const g = orcaGeometry();
    expect(g.attributes.aMark).toBeDefined();
    const m = g.attributes.aMark.array as Float32Array;
    let white = 0;
    let black = 0;
    for (let i = 0; i < m.length; i += 2) (m[i] > 0 ? white++ : black++);
    // mostly black, with a good amount of white (belly, eye patch)
    expect(white).toBeGreaterThan(black * 0.15);
    expect(black).toBeGreaterThan(white);
  });
});

describe("fish", () => {
  it("a full ocean: ~700-900 fish at standard, about half at low; most of the little ones on the cheap mesh", () => {
    const all = planSchools();
    const n = all.reduce((a, s) => a + s.n, 0);
    const nl = planSchools({ lowQuality: true }).reduce((a, s) => a + s.n, 0);
    expect(n).toBeGreaterThanOrEqual(700);
    expect(n).toBeLessThanOrEqual(900);
    expect(nl).toBeGreaterThan(n * 0.4);
    expect(nl).toBeLessThan(n * 0.6);
    const small = all.filter((s) => s.small).reduce((a, s) => a + s.n, 0);
    expect(small).toBeGreaterThan(n * 0.4);
    // schools that keep near the kid wherever they swim, a bait ball among them, and a buddy swarm
    expect(all.filter((s) => s.follow).length).toBeGreaterThanOrEqual(6);
    expect(all.some((s) => s.follow && s.bait)).toBe(true);
    expect(all.some((s) => s.buddy)).toBe(true);
    // every species shows up somewhere
    const species = new Set(all.map((s) => s.species));
    for (const sp of [SPECIES.clown, SPECIES.blueTang, SPECIES.yellowTang, SPECIES.anthias, SPECIES.sardine, SPECIES.parrot, SPECIES.grouper, SPECIES.butterfly, SPECIES.angel]) expect(species.has(sp)).toBe(true);
  });
  it("reef schools roam round their reef (not a fixed loop), always in the water", () => {
    for (const [si, s] of planSchools().entries()) {
      if (s.follow || s.buddy || s.n === 1 || s.rad < 1) continue;
      const st: SwimStyle = { speed: [0.7, 1.5], turn: 0.55, wander: 0.07, depth: [1.4, 30], clear: s.spread[1] + 0.7, need: (s.spread[1] + 0.6) * 1.5 + 1.4, look: 7, climb: 0.4, bank: 0.8, above: [1.6 + s.spread[1], 4.5 + s.spread[1]], home: { x: s.ax, z: s.az, r: s.rad * 2.4 + 8 } };
      const sw = makeSwimmer(s.ax, s.ay, s.az, si, 300 + si * 7, 1);
      let far = 0;
      const seen = new Set<string>();
      for (let t = 0; t < 600; t += 1 / 15) {
        swim(sw, st, 1 / 15, t);
        expect(sw.y).toBeLessThan(WATER_Y - 0.4);
        expect(sw.y).toBeGreaterThan(seaFloorY(sw.x, sw.z));
        far = Math.max(far, Math.hypot(sw.x - s.ax, sw.z - s.az));
        seen.add(`${Math.floor(sw.x / 4)},${Math.floor(sw.z / 4)}`);
      }
      // stays by its reef, but explores it
      expect(far).toBeLessThan(st.home!.r * 1.6);
      expect(seen.size).toBeGreaterThan(12);
    }
  });
  it("clampWater keeps a point between floor and surface", () => {
    const p = PEARLS[0];
    expect(clampWater(p.x, p.z, 10, 0.5)).toBeLessThan(WATER_Y);
    expect(clampWater(p.x, p.z, -100, 0.5)).toBeGreaterThanOrEqual(groundY(p.x, p.z));
  });
  it("fish scatter away from the kid, and ignore a far-off kid", () => {
    const out = { x: 0, y: 0, z: 0 };
    const kid = { x: 0, y: 0, z: 0 };
    const k = avoidKid(1, 0, 0, kid, 4, out);
    expect(k).toBeGreaterThan(0);
    expect(out.x).toBeGreaterThan(0);
    expect(1 + out.x).toBeGreaterThanOrEqual(3.9);
    expect(avoidKid(10, 0, 0, kid, 4, out)).toBe(0);
    expect(out.x).toBe(0);
    // right on top of the kid: still a clean push, no NaN
    avoidKid(0, 0, 0, kid, 4, out);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(0);
  });
  it("stepFish settles on its target without overshooting the speed limit", () => {
    const p = new Float32Array([0, 0, 0]);
    const v = new Float32Array(3);
    for (let i = 0; i < 400; i++) {
      const sp = stepFish(p, v, 0, 5, 1, -3, 1 / 30, 2.2, 2.6);
      expect(sp).toBeLessThanOrEqual(2.6 + 1e-6);
    }
    expect(Math.hypot(p[0] - 5, p[1] - 1, p[2] + 3)).toBeLessThan(0.05);
  });
});

describe("big creatures", () => {
  it("jellies and bubble vents are in the water", () => {
    const js = planJellies(30);
    expect(js.length).toBe(30);
    for (const j of js) {
      expect(j.y).toBeLessThan(WATER_Y - 1);
      expect(j.y).toBeGreaterThan(groundY(j.x, j.z));
    }
    for (const v of planVents(10)) expect(v.y).toBeLessThan(WATER_Y - 1);
  });
});

describe("caustics texture", () => {
  it("tiles seamlessly and has bright lines and dark cells", () => {
    const n = 64;
    const f = causticField(n, 5, 7);
    let min = 255;
    let max = 0;
    for (const v of f) ((min = Math.min(min, v)), (max = Math.max(max, v)));
    expect(max).toBeGreaterThan(200);
    expect(min).toBeLessThan(40);
    // wrap-around: the last column continues into the first as smoothly as neighbours do
    let wrap = 0;
    let inner = 0;
    for (let j = 0; j < n; j++) {
      wrap += Math.abs(f[j * n + n - 1] - f[j * n]);
      inner += Math.abs(f[j * n + n - 2] - f[j * n + n - 1]);
    }
    expect(wrap).toBeLessThan(inner * 2 + n * 8);
  });
});
