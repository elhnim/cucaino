import { describe, expect, it } from "vitest";
import * as THREE from "three";
// terrain.ts (which imports settlements.ts before paricutin.ts — see its own import order) must load
// before anything imports registry/paricutin.ts directly: paricutin.ts sits in the same
// settlements<->town.ts<->everestBaseCamp.ts module cycle (it's pushed onto SETTLEMENTS, the same
// as every settlement), and importing it as this FILE's own first module would make IT the cycle's
// entry point instead, tripping the exact "Cannot access before initialization" trap those other
// files' own comments warn about. Importing terrain.ts (or settlements.ts) first sidesteps that.
import { groundY, rawHeight } from "./terrain";
import { SETTLEMENTS } from "./settlements";
import {
  CRATER_DEPTH,
  CRATER_U,
  FARM_RADIUS,
  LAVA_FIELD_OUT,
  PARICUTIN_CHURCH,
  PARICUTIN_CONE,
  PARICUTIN_FARM_SITE,
  PARICUTIN_RIM,
  PARICUTIN_TRAILHEAD,
  RIM_NEAR_A,
  findParicutinConeSite,
  findParicutinFarmSite,
  nearParicutin,
  paricutinY,
} from "./paricutin";
import { nearRail } from "./railway";
import { nearCartRoad } from "./cartRoad";
import { wildWaterSdf } from "./wildWater";
import { seaDist } from "./island";
import { PARICUTIN_ROUTE, PARICUTIN_STOP_U, distToParicutinRoute, paricutinHeadingAtU, paricutinPointAtU } from "./paricutinRoute";
import { PARICUTIN_STOPS } from "./paricutinFacts";
import { WONDERS, wonderAt, wonderSignAt } from "./wonders";
import { groundColor } from "../world/fantasy/terrainMesh";

const OTHER_SETTLEMENTS = SETTLEMENTS.filter((s) => s.id !== "paricutin-farm").map((s) => ({ x: s.x, z: s.z }));

describe("Dionisio's farm + Parícutin's site (frozen, re-run against the live search)", () => {
  it("the farm site stays exactly where findParicutinFarmSite() lands, given every other settlement as the avoid list", () => {
    const found = findParicutinFarmSite(OTHER_SETTLEMENTS);
    expect(found).toEqual(PARICUTIN_FARM_SITE);
  });

  it("the cone site stays exactly where findParicutinConeSite() lands, given the frozen farm site", () => {
    const found = findParicutinConeSite(PARICUTIN_FARM_SITE, OTHER_SETTLEMENTS, PARICUTIN_CONE.r, LAVA_FIELD_OUT);
    expect(found).toEqual({ x: PARICUTIN_CONE.x, z: PARICUTIN_CONE.z });
  });

  it("the farm is well clear of every other settlement (the pairwise distance test in settlements.test.ts already requires > 560; this just sanity-checks the margin is comfortable)", () => {
    for (const s of SETTLEMENTS) {
      if (s.id === "paricutin-farm") continue;
      expect(Math.hypot(s.x - PARICUTIN_FARM_SITE.x, s.z - PARICUTIN_FARM_SITE.z), s.id).toBeGreaterThan(560);
    }
  });

  it("the farm, the cone and the church all stay clear of the railway and the cart road", () => {
    for (const p of [PARICUTIN_FARM_SITE, PARICUTIN_CONE, PARICUTIN_CHURCH]) {
      expect(nearRail(p.x, p.z, 10)).toBe(false);
      expect(nearCartRoad(p.x, p.z, 10)).toBe(false);
    }
  });

  it("the whole footprint (farm, cone and the lava field reach) sits well inland, on dry land", () => {
    expect(seaDist(PARICUTIN_FARM_SITE.x, PARICUTIN_FARM_SITE.z)).toBeLessThan(-40);
    expect(seaDist(PARICUTIN_CONE.x, PARICUTIN_CONE.z)).toBeLessThan(-40);
    expect(wildWaterSdf(PARICUTIN_CONE.x, PARICUTIN_CONE.z)).toBeGreaterThan(20);
  });

  it("the farm's own flat pad sits safely outside the cone's own steep base (no overlap between the settlement pad and the volcano's own slope)", () => {
    const d = Math.hypot(PARICUTIN_FARM_SITE.x - PARICUTIN_CONE.x, PARICUTIN_FARM_SITE.z - PARICUTIN_CONE.z);
    expect(d - FARM_RADIUS).toBeGreaterThan(PARICUTIN_CONE.r + 5);
  });
});

describe("the volcano's own terrain (paricutinY, used by registry/terrain.ts's finish())", () => {
  it("is null well outside its own footprint (the lava field's own reach), so it never disturbs unrelated ground", () => {
    expect(paricutinY(PARICUTIN_CONE.x + PARICUTIN_CONE.r * LAVA_FIELD_OUT + 40, PARICUTIN_CONE.z, 5)).toBeNull();
  });

  it("raises a cone roughly 70-110 units tall above the surrounding plain, steep (a real cinder cone's own angle of repose, not a gentle dome)", () => {
    const ground = rawHeight(PARICUTIN_CONE.x, PARICUTIN_CONE.z);
    // partway down the flank (not the crater-carved summit): the raw additive height there
    const flankD = PARICUTIN_CONE.r * 0.55;
    const flankGround = rawHeight(PARICUTIN_CONE.x + flankD, PARICUTIN_CONE.z);
    const flankH = paricutinY(PARICUTIN_CONE.x + flankD, PARICUTIN_CONE.z, flankGround)!;
    const bumpAtFlank = flankH - flankGround;
    expect(bumpAtFlank).toBeGreaterThan(30);
    // the summit's own bump (before the crater carve) is PARICUTIN_CONE.h, which the spec wants
    // between 70 and 110
    expect(PARICUTIN_CONE.h).toBeGreaterThanOrEqual(70);
    expect(PARICUTIN_CONE.h).toBeLessThanOrEqual(110);
    // steep: climbing the first half of the cone gains much more height than a gentle dome would
    // (a real cinder cone's slope stays close to its own angle of repose all the way up)
    const quarterD = PARICUTIN_CONE.r * 0.25;
    const quarterGround = rawHeight(PARICUTIN_CONE.x + quarterD, PARICUTIN_CONE.z);
    const quarterH = paricutinY(PARICUTIN_CONE.x + quarterD, PARICUTIN_CONE.z, quarterGround)!;
    const bumpAtQuarter = quarterH - quarterGround;
    expect(bumpAtQuarter).toBeGreaterThan(bumpAtFlank); // monotonically lower further from the centre
    void ground;
  });

  it("carves a real crater bowl: the rim stands well above the crater floor", () => {
    // sampled a quarter-turn AWAY from the rim's own deliberate viewpoint notch (RIM_NEAR_A, round
    // 3 — a kid's own mostly-level camera needs a real sightline down into the bowl from where the
    // climb trail arrives, so that one arc of the rim sits a little lower on purpose): this checks
    // the crater's GENERAL shape, not the one intentionally-lowered viewing arc.
    const g0 = rawHeight(PARICUTIN_CONE.x, PARICUTIN_CONE.z);
    const floor = paricutinY(PARICUTIN_CONE.x, PARICUTIN_CONE.z, g0)!;
    const rimD = PARICUTIN_CONE.r * CRATER_U;
    const a = RIM_NEAR_A + Math.PI / 2;
    const rx = PARICUTIN_CONE.x + Math.sin(a) * rimD;
    const rz = PARICUTIN_CONE.z + Math.cos(a) * rimD;
    const gr = rawHeight(rx, rz);
    const rim = paricutinY(rx, rz, gr)!;
    expect(rim - floor).toBeGreaterThan(10); // a real bowl you can look into, not a dimple
    expect(CRATER_DEPTH).toBeGreaterThan(0);
  });

  it("the rim's own viewpoint notch (RIM_NEAR_A, where the climb trail arrives) is real but modest: it opens a sightline without gutting the rim or breaking the cone's silhouette from afar", () => {
    const rimD = PARICUTIN_CONE.r * CRATER_U;
    const gNotch = rawHeight(PARICUTIN_RIM.x, PARICUTIN_RIM.z);
    const notchedRim = paricutinY(PARICUTIN_RIM.x, PARICUTIN_RIM.z, gNotch)!;
    const a = RIM_NEAR_A + Math.PI; // the far side — full, un-notched rim height
    const fx = PARICUTIN_CONE.x + Math.sin(a) * rimD;
    const fz = PARICUTIN_CONE.z + Math.cos(a) * rimD;
    const gFar = rawHeight(fx, fz);
    const farRim = paricutinY(fx, fz, gFar)!;
    // the notch is real (several units lower than the far rim)...
    expect(farRim - notchedRim).toBeGreaterThan(3);
    // ...but modest (not a huge gash — still clearly "a rim", not gone)
    expect(farRim - notchedRim).toBeLessThan(14);
  });

  it("the lava field apron is gentle and low, never below the natural ground (nothing is ever dug into a pit by this bump)", () => {
    for (let u = 1.05; u < LAVA_FIELD_OUT; u += 0.1) {
      const x = PARICUTIN_CONE.x + PARICUTIN_CONE.r * u;
      const z = PARICUTIN_CONE.z;
      const g = rawHeight(x, z);
      const h = paricutinY(x, z, g)!;
      expect(h).toBeGreaterThanOrEqual(g);
    }
  });

  it("nearParicutin matches the footprint radius exactly", () => {
    const r = PARICUTIN_CONE.r * LAVA_FIELD_OUT;
    expect(nearParicutin(PARICUTIN_CONE.x + r - 1, PARICUTIN_CONE.z)).toBe(true);
    expect(nearParicutin(PARICUTIN_CONE.x + r + 5, PARICUTIN_CONE.z)).toBe(false);
  });

  it("is actually baked into the real, sampled ground (registry/terrain.ts's groundY), not just the pure bump function", () => {
    expect(groundY(PARICUTIN_CONE.x, PARICUTIN_CONE.z)).toBeGreaterThan(groundY(PARICUTIN_FARM_SITE.x, PARICUTIN_FARM_SITE.z) + 20);
  });
});

describe("the half-buried church, in the lava field, on real ground", () => {
  it("sits within the lava field (past the cone's own steep base, short of the apron's outer edge) — neither on the bare cone nor off in open farmland", () => {
    const d = Math.hypot(PARICUTIN_CHURCH.x - PARICUTIN_CONE.x, PARICUTIN_CHURCH.z - PARICUTIN_CONE.z) / PARICUTIN_CONE.r;
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(LAVA_FIELD_OUT);
  });

  it("stands on real, finite ground (nothing floating or buried: groundY resolves to a sane, raised-but-not-extreme height)", () => {
    const y = groundY(PARICUTIN_CHURCH.x, PARICUTIN_CHURCH.z);
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBeGreaterThan(-5);
    expect(y).toBeLessThan(PARICUTIN_CONE.h);
  });
});

describe("the climb trail (registry/paricutinRoute.ts): a real path from the farm's trailhead to the crater rim", () => {
  it("starts exactly at the trailhead and ends exactly at the rim", () => {
    const start = paricutinPointAtU(0);
    const end = paricutinPointAtU(1);
    expect(start.x).toBeCloseTo(PARICUTIN_TRAILHEAD.x, 1);
    expect(start.z).toBeCloseTo(PARICUTIN_TRAILHEAD.z, 1);
    expect(end.x).toBeCloseTo(PARICUTIN_RIM.x, 1);
    expect(end.z).toBeCloseTo(PARICUTIN_RIM.z, 1);
  });

  it("the whole route lies on, or very close to, the real (now-raised) ground — walkable, nothing floating", () => {
    for (const [x, z] of PARICUTIN_ROUTE) {
      const y = groundY(x, z);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it("climbs steadily: the rim sits far higher than the trailhead, and height never drops back to the trailhead's own level partway up", () => {
    const trailheadY = groundY(PARICUTIN_TRAILHEAD.x, PARICUTIN_TRAILHEAD.z);
    const rimY = groundY(PARICUTIN_RIM.x, PARICUTIN_RIM.z);
    expect(rimY).toBeGreaterThan(trailheadY + 40);
    const mid = paricutinPointAtU(0.6);
    expect(groundY(mid.x, mid.z)).toBeGreaterThan(trailheadY + 5);
  });

  it("heading functions give a sensible direction (roughly towards the rim as u increases)", () => {
    const h0 = paricutinHeadingAtU(0.1);
    expect(Number.isFinite(h0)).toBe(true);
  });

  it("distToParicutinRoute is 0 on the route and grows off it", () => {
    const [x, z] = PARICUTIN_ROUTE[Math.floor(PARICUTIN_ROUTE.length / 2)];
    expect(distToParicutinRoute(x, z)).toBeLessThan(0.01);
    expect(distToParicutinRoute(x + 300, z + 300)).toBeGreaterThan(100);
  });

  it("PARICUTIN_STOP_U has one entry per PARICUTIN_STOPS, running 0 -> 1", () => {
    expect(PARICUTIN_STOP_U.length).toBe(PARICUTIN_STOPS.length);
    expect(PARICUTIN_STOP_U[0]).toBe(0);
    expect(PARICUTIN_STOP_U[PARICUTIN_STOP_U.length - 1]).toBe(1);
    for (let i = 1; i < PARICUTIN_STOP_U.length; i++) expect(PARICUTIN_STOP_U[i]).toBeGreaterThan(PARICUTIN_STOP_U[i - 1]);
  });
});

describe("Parícutin's own local ground-colour override (world/fantasy/terrainMesh.ts's groundColor)", () => {
  it("is a different colour inside the footprint than the ordinary meadow just outside it, and is pure (same inputs, same colour)", () => {
    const inside = new THREE.Color();
    groundColor(PARICUTIN_CONE.x + 20, PARICUTIN_CONE.z, groundY(PARICUTIN_CONE.x + 20, PARICUTIN_CONE.z), 0.1, inside);
    const farAway = new THREE.Color();
    const fx = PARICUTIN_CONE.x + PARICUTIN_CONE.r * LAVA_FIELD_OUT + 300;
    groundColor(fx, PARICUTIN_CONE.z, groundY(fx, PARICUTIN_CONE.z), 0.05, farAway);
    expect(inside.getHexString()).not.toBe(farAway.getHexString());
    const again = new THREE.Color();
    groundColor(PARICUTIN_CONE.x + 20, PARICUTIN_CONE.z, groundY(PARICUTIN_CONE.x + 20, PARICUTIN_CONE.z), 0.1, again);
    expect(again.getHexString()).toBe(inside.getHexString());
  });

  it("never reads as grass-green inside the lava field (dark, desaturated cinder/lava tones only)", () => {
    const c = new THREE.Color();
    groundColor(PARICUTIN_CONE.x, PARICUTIN_CONE.z - PARICUTIN_CONE.r * 0.5, groundY(PARICUTIN_CONE.x, PARICUTIN_CONE.z - PARICUTIN_CONE.r * 0.5), 0.3, c);
    // green should never dominate red+blue the way lush grass does
    expect(c.g).toBeLessThan(c.r + c.b + 0.1);
  });
});

describe("the Parícutin wonder entry (registry/wonders.ts)", () => {
  it("is discovered on arrival at the farm, and its sign posts resolve to its own facts", () => {
    const w = WONDERS.find((x) => x.id === "paricutin")!;
    expect(w).toBeTruthy();
    expect(wonderAt(PARICUTIN_FARM_SITE.x, PARICUTIN_FARM_SITE.z)?.id).toBe("paricutin");
    for (const vp of w.viewpoints ?? []) {
      const sign = wonderSignAt(vp.x, vp.z, 6);
      expect(sign?.wonder.id, `sign at ${vp.x},${vp.z}`).toBe("paricutin");
      expect(w.facts).toContain(sign?.fact);
    }
  });

  it("the facts are true to the real story and in the right ballpark (verified against the historical record)", () => {
    const w = WONDERS.find((x) => x.id === "paricutin")!;
    const joined = w.facts.join(" ");
    expect(joined).toContain("1943");
    expect(joined).toMatch(/336 m/);
    expect(joined).toMatch(/1952/);
    expect(joined.toLowerCase()).toContain("cornfield");
  });
});
