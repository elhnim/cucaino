import { describe, expect, it } from "vitest";
import { DINO_M, DINO_NAV, DINO_REX_BRIDGE, HERD_PLANS, KID_R, RAPTOR_GAP, SPECIES, TREX_SAFE, TRUE_SIZE, bodyGap, dayPhase, makeSim, pushKid, stepSim, trexMode, trueK, type Animal, type DinoSim } from "./herd";
import { DINO_DECKS, DINO_FENCE_E, DINO_FENCE_POSTS, DINO_GORGE, DINO_ICE_LINE, DINO_ISLAND, DINO_OBSTACLES, DINO_SPECIES, DINO_ZONES, dinoDeckY, dinoGorgeE, dinoGroundY, dinoLandY, dinoShoreDist, dinoWaterAt, dinoZone } from "../../registry/dinoIsland";

/** the park's clock: a whole day every 15 minutes, starting at 8 am */
const hourAt = (t: number) => ((t / 900) * 24 + 8) % 24;
const run = (sim: DinoSim, secs: number, t0: number, hour: number | null, kx: number, kz: number, near: boolean, each?: (t: number) => void, dt = 1 / 20) => {
  let t = t0;
  for (let k = 0; k < secs / dt; k++) {
    t += dt;
    stepSim(sim, dt, t, hour ?? hourAt(t), kx, kz, near);
    each?.(t);
  }
  return t;
};
const walkers = (sim: DinoSim) => sim.animals.filter((a) => a.def.id !== "ptero" && a.def.id !== "plesio");
const roamers = (sim: DinoSim) => sim.herds.filter((h) => !h.plan.home && h.members.length && h.plan.species !== "raptor");

describe("Dino Isle's animals", () => {
  it("has plenty of dinosaurs (about half in low quality), Ice Age giants and recent extinct animals", () => {
    const hi = makeSim(false);
    const lo = makeSim(true);
    const dinos = (s: DinoSim) => s.animals.filter((a) => DINO_SPECIES[a.def.id].era === "dino").length;
    expect(dinos(hi)).toBeGreaterThanOrEqual(45);
    expect(dinos(hi)).toBeLessThanOrEqual(75);
    expect(dinos(lo)).toBeLessThanOrEqual(Math.ceil(dinos(hi) * 0.62));
    expect(hi.animals.length).toBeLessThanOrEqual(110);
    const era = (s: DinoSim, e: string) => new Set(s.animals.filter((a) => DINO_SPECIES[a.def.id].era === e).map((a) => a.def.id)).size;
    expect(era(hi, "dino")).toBe(10);
    expect(era(hi, "iceage")).toBe(7);
    expect(era(hi, "recent")).toBe(4);
    expect(era(lo, "dino")).toBe(10);
    expect(era(lo, "iceage")).toBe(7);
    // babies: triceratops at the nests (some still hatching) and in the herds, mammoth calves, sabre-cat cubs
    expect(hi.animals.filter((a) => a.baby && a.def.id === "trike" && a.mode === 1).length).toBeGreaterThanOrEqual(1);
    expect(hi.animals.filter((a) => a.baby && a.def.id === "trike" && a.herd.plan.id !== "nests").length).toBeGreaterThanOrEqual(2);
    expect(hi.animals.some((a) => a.baby && a.def.id === "mammoth" && a.mother)).toBe(true);
    expect(hi.animals.filter((a) => a.def.id === "trex").length).toBe(1);
    expect(hi.animals.filter((a) => a.def.id === "raptor").length).toBeGreaterThanOrEqual(3);
    // several herds of the big ones
    expect(hi.herds.filter((h) => h.plan.species === "brachio" && h.members.length).length).toBe(2);
    expect(hi.herds.filter((h) => h.plan.species === "mammoth" && h.members.length).length).toBe(2);
  });

  it("every herd's places are on its own side of the land bridge, on open walkable ground", () => {
    for (const p of HERD_PLANS)
      for (const id of [...p.day, ...(p.water ?? []), ...(p.rest ?? [])]) {
        const z = dinoZone(id);
        expect(dinoLandY(z.x, z.z), `${p.id} ${id}`).not.toBeNull();
        if (z.realm === "ice") expect(z.z, id).toBeLessThan(DINO_ICE_LINE + 12);
        else expect(z.z, id).toBeGreaterThan(DINO_ICE_LINE + 14);
        // (a herd's realm is its zones' realm: they never mix)
        expect(z.realm, `${p.id} ${id}`).toBe(dinoZone(p.day[0] ?? id).realm);
      }
  });

  it("herds MIGRATE round the whole island over a park day: graze the plains, drink at dawn and dusk, sleep in the woods", { timeout: 60_000 }, () => {
    const sim = makeSim(false);
    const H = roamers(sim);
    const seen = H.map(() => new Set<string>());
    const pts = H.map(() => [] as [number, number][]);
    const realmCells = { dino: new Set<number>(), ice: new Set<number>() };
    let atFordTogether = 0;
    let restingAtNight = 0;
    let nightChecks = 0;
    let t = 0;
    const ford = dinoZone("ford");
    run(sim, 900, 0, null, 0, 0, false, (tt) => {
      t = tt;
      if (Math.round(tt * 20) % 40 !== 0) return;
      H.forEach((h, i) => {
        pts[i].push([h.cx, h.cz]);
        for (const z of DINO_ZONES) if (Math.hypot(z.x - h.cx, z.z - h.cz) < z.r + 4) seen[i].add(z.id);
        for (const a of h.members) {
          const ci = Math.floor((a.x - DINO_NAV.x(0) + DINO_NAV.cell / 2) / DINO_NAV.cell);
          const cj = Math.floor((a.z - DINO_NAV.z(0) + DINO_NAV.cell / 2) / DINO_NAV.cell);
          // (mark the cells within 30 m of it: it's "using" that bit of the island)
          for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) if (di * di + dj * dj <= 25) realmCells[h.realm].add((cj + dj) * DINO_NAV.nx + ci + di);
        }
      });
      const ph = dayPhase(hourAt(tt));
      // dusk: three-horns and duck-bills at the ford together
      if (ph === 2) {
        const near = (sp: string) => H.some((h) => h.plan.species === sp && Math.hypot(h.cx - ford.x, h.cz - ford.z) < ford.r + 18);
        if (near("trike") && near("para")) atFordTogether++;
      }
      if (ph === 3) {
        nightChecks++;
        const W = H.flatMap((h) => h.members);
        if (W.filter((a) => a.lie > 0.5).length / W.length > 0.35) restingAtNight++;
      }
    });
    void t;
    H.forEach((h, i) => {
      // each herd went somewhere: three or more of its places, a long way apart
      let span = 0;
      for (const a of pts[i]) for (const b of pts[i]) span = Math.max(span, Math.hypot(a[0] - b[0], a[1] - b[1]));
      expect(span, `${h.plan.id} span`).toBeGreaterThan(h.realm === "ice" ? 45 : 55);
      expect(seen[i].size, `${h.plan.id} places ${[...seen[i]]}`).toBeGreaterThanOrEqual(3);
    });
    // between them the herds use most of the island
    for (const realm of ["dino", "ice"] as const) {
      const r = realm === "ice" ? 2 : 1;
      let total = 0;
      let used = 0;
      for (let c = 0; c < DINO_NAV.realm.length; c++)
        if (DINO_NAV.realm[c] === r) {
          total++;
          if (realmCells[realm].has(c)) used++;
        }
      expect(used / total, `${realm} coverage`).toBeGreaterThan(realm === "ice" ? 0.6 : 0.5);
    }
    expect(atFordTogether, "trikes and paras mixing at the ford at dusk").toBeGreaterThan(0);
    expect(restingAtNight / Math.max(1, nightChecks), "asleep at night").toBeGreaterThan(0.5);
  });

  it("stay on dry land on their own side, out of the T-rex's valley and the trees, and keep their whole bodies apart", { timeout: 60_000 }, () => {
    const sim = makeSim(false);
    let t = 0;
    let worst = 0;
    let overlapsMax = 0;
    let deepBefore = new Set<string>();
    let persistent = 0;
    for (let m = 0; m < 12; m++) {
      t = run(sim, 40, t, null, 0, 0, false);
      for (const a of walkers(sim)) {
        if (a.def.id === "trex") continue;
        const g = dinoLandY(a.x, a.z);
        expect(g, a.def.id).not.toBeNull();
        // (waders may paddle in the river, the ford, the lagoon)
        if (!(a.def.wade && dinoWaterAt(a.x, a.z) !== null)) expect(g!, `${a.def.id} @ ${(a.x - DINO_ISLAND.x).toFixed(0)},${(a.z - DINO_ISLAND.z).toFixed(0)}`).toBeGreaterThan(1.0);
        expect(Math.abs(a.y - g!), a.def.id).toBeLessThan(a.mode === 1 ? 0.8 : 0.05);
        expect(dinoGorgeE(a.x, a.z), `${a.def.id} in the T-rex's valley`).toBeGreaterThan(DINO_FENCE_E);
        if (a.herd.realm === "ice") expect(a.z, a.def.id).toBeLessThan(DINO_ICE_LINE + 20);
        else expect(a.z, a.def.id).toBeGreaterThan(DINO_ICE_LINE + 2);
        // (the body's centre line never through a trunk or a rock)
        if (a.mode !== 1)
          for (const o of DINO_OBSTACLES) {
            const ux = a.cbx - a.cax;
            const uz = a.cbz - a.caz;
            const L2 = ux * ux + uz * uz || 1;
            const u = Math.max(0, Math.min(1, ((o.x - a.cax) * ux + (o.z - a.caz) * uz) / L2));
            const d = Math.hypot(a.cax + ux * u - o.x, a.caz + uz * u - o.z);
            // (never in one at all: not even a brush)
            if (d <= o.r - 0.05) expect(d, `${a.def.id} into an obstacle (r ${o.r.toFixed(1)})`).toBeGreaterThan(o.r - 0.05);
          }
      }
      // whole bodies (necks and tails too) apart: never more than a touch
      const W = walkers(sim).filter((a) => a.mode !== 1);
      let overlaps = 0;
      const deep = new Set<string>();
      for (let i = 0; i < W.length; i++)
        for (let j = i + 1; j < W.length; j++) {
          if (W[i].mother === W[j] || W[j].mother === W[i]) continue;
          const g = bodyGap(W[i], W[j]);
          if (g < -0.2) overlaps++;
          if (g < -0.2) deep.add(`${i}-${j}`);
          worst = Math.min(worst, g);
        }
      for (const k of deep) if (deepBefore.has(k)) persistent++;
      deepBefore = deep;
      overlapsMax = Math.max(overlapsMax, overlaps);
    }
    // (flanks may touch as herds pass; nobody is ever inside anybody)
    expect(overlapsMax, "bodies overlapping (> 0.2) at once").toBeLessThanOrEqual(2);
    expect(persistent, "pairs still overlapping 40 s later").toBe(0);
    expect(worst, "the deepest overlap").toBeGreaterThan(-0.5);
    // they're not all stood still
    expect(walkers(sim).filter((a) => a.speed > 0.05 || a.gait > 0.05).length).toBeGreaterThan(0);
  });

  it("notices the kid: heads turn, giants stop and let the kid pass, others step aside, curious ones sniff; nobody walks into the kid", { timeout: 30_000 }, () => {
    const sim = makeSim(false);
    let t = run(sim, 10, 0, 10, 0, 0, false);
    // stand right in front of a walking long-neck: it waits
    const b = sim.animals.find((a) => a.def.id === "brachio" && !a.baby)!;
    const kx = b.x + Math.sin(b.yaw) * (b.def.body[0] * b.scale + 4);
    const kz = b.z + Math.cos(b.yaw) * (b.def.body[0] * b.scale + 4);
    let minSpeed = Infinity;
    t = run(sim, 6, t, 10, kx, kz, true, () => (minSpeed = Math.min(minSpeed, b.speed)));
    expect(minSpeed, "the brachiosaur stops for the kid").toBeLessThan(0.3);
    expect(Math.abs(b.hy) + Math.abs(b.hp), "and looks at them").toBeGreaterThan(0.05);
    // the kid is never inside anyone's body (pushKid)
    for (const a of walkers(sim)) {
      const p = { x: (a.cax + a.cbx) / 2, z: (a.caz + a.cbz) / 2 };
      pushKid(sim, p);
      for (const q of walkers(sim)) {
        if (q.mode === 1) continue;
        const ux = q.cbx - q.cax;
        const uz = q.cbz - q.caz;
        const L2 = ux * ux + uz * uz || 1;
        const u = Math.max(0, Math.min(1, ((p.x - q.cax) * ux + (p.z - q.caz) * uz) / L2));
        expect(Math.hypot(q.cax + ux * u - p.x, q.caz + uz * u - p.z), `${q.def.id}`).toBeGreaterThan(q.cr + KID_R - 0.05);
      }
    }
    // among the compys: one comes right up to sniff
    const C = dinoZone("compy-a");
    let closest = Infinity;
    for (let k = 0; k < 30 * 20; k++) {
      stepSim(sim, 1 / 20, (t += 1 / 20), 10, C.x, C.z, true);
      for (const a of sim.animals.filter((q) => q.def.id === "compy")) closest = Math.min(closest, Math.hypot(a.x - C.x, a.z - C.z));
    }
    expect(closest).toBeLessThan(3);
    expect(closest).toBeGreaterThan(0.25);
  });

  it("the T-rex roams its walled valley: patrols, drinks, naps, ROARS when the kid comes to watch — and never comes near anywhere a kid can stand", { timeout: 60_000 }, () => {
    const sim = makeSim(false);
    const T = sim.trex;
    // everywhere a kid can stand round the valley: the rim outside the fence, the lookouts, the bridge
    const kidPts: [number, number, number][] = [];
    for (const p of DINO_FENCE_POSTS) {
      const ox = p.x - DINO_GORGE.x;
      const oz = p.z - DINO_GORGE.z;
      const l = Math.hypot(ox, oz);
      const x = p.x + (ox / l) * 1.2;
      const z = p.z + (oz / l) * 1.2;
      const y = dinoGroundY(x, z);
      if (y !== null) kidPts.push([x, y, z]);
    }
    for (const d of DINO_DECKS.filter((q) => q.id.startsWith("rex"))) for (let u = 0; u <= 1; u += 0.05) kidPts.push([d.ax + (d.bx - d.ax) * u, dinoDeckY(d.ax + (d.bx - d.ax) * u, d.az + (d.bz - d.az) * u)!, d.az + (d.bz - d.az) * u]);
    let minD = Infinity;
    let minFloor = Infinity;
    const check = () => {
      // its body and its head (up where it would be roaring)
      const hx = T.cbx;
      const hz = T.cbz;
      const hy = T.y + 5.6 * T.scale;
      for (const [x, y, z] of kidPts) {
        minD = Math.min(minD, Math.hypot(hx - x, hy - y, hz - z));
        const ux = T.cbx - T.cax;
        const uz = T.cbz - T.caz;
        const L2 = ux * ux + uz * uz || 1;
        const u = Math.max(0, Math.min(1, ((x - T.cax) * ux + (z - T.caz) * uz) / L2));
        minD = Math.min(minD, Math.hypot(T.cax + ux * u - x, T.y + 4 * T.scale - y, T.caz + uz * u - z) - T.cr);
      }
      minFloor = Math.min(minFloor, 1 - Math.max(dinoGorgeE(T.cax, T.caz), dinoGorgeE(T.cbx, T.cbz)));
    };
    const modes = new Set<string>();
    let t = 0;
    let roars = 0;
    let streak = 0;
    let maxStreak = 0;
    // 1. at the Rex Lookout for 50 s
    const look = DINO_DECKS.find((d) => d.id === "rex-look")!;
    t = run(sim, 50, t, 11, look.ax, look.az, true, () => {
      check();
      modes.add(trexMode(sim));
      if (sim.roared) {
        roars++;
        streak++;
      } else streak = 0;
      maxStreak = Math.max(maxStreak, streak);
    });
    expect(roars, "roars for the visitor").toBeGreaterThanOrEqual(1);
    expect(roars).toBeLessThanOrEqual(3);
    expect(maxStreak, "the roar event lasts one frame").toBe(1);
    // 2. on the Rex Bridge, right over its valley, through a siesta and a dusk drink
    const bx = (DINO_REX_BRIDGE.x0 + DINO_REX_BRIDGE.x1) / 2;
    for (const [h, secs] of [
      [13, 120],
      [18.5, 90],
      [22, 120],
    ] as [number, number][])
      t = run(sim, secs, t, h, bx, DINO_REX_BRIDGE.z, true, () => {
        check();
        modes.add(trexMode(sim));
      });
    // 3. nobody about: it roams
    let span = 0;
    const x0 = T.x;
    const z0 = T.z;
    t = run(sim, 240, t, 10, 0, 0, false, () => {
      check();
      modes.add(trexMode(sim));
      span = Math.max(span, Math.hypot(T.x - x0, T.z - z0));
    });
    expect(span, "it roams its valley").toBeGreaterThan(25);
    for (const m of ["patrol", "display", "roar", "yawn", "nap", "drink"]) expect(modes.has(m), m).toBe(true);
    expect(minFloor, "its whole body stays on the valley floor").toBeGreaterThan(0);
    expect(minD, "never near a kid").toBeGreaterThan(TREX_SAFE);
    // 4. a kid somehow down on the valley floor with it (off a dragon): it walks away, never towards them
    let kx = T.x;
    let kz = T.z;
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      kx = T.x + Math.sin(a) * 22;
      kz = T.z + Math.cos(a) * 22;
      if (dinoGorgeE(kx, kz) < 0.7) break;
    }
    expect(dinoGorgeE(kx, kz)).toBeLessThan(0.7);
    let closest = Infinity;
    let dEnd = 0;
    t = run(sim, 40, t, 11, kx, kz, true, () => {
      closest = Math.min(closest, Math.hypot(T.x - kx, T.z - kz));
      dEnd = Math.hypot(T.x - kx, T.z - kz);
    });
    expect(closest).toBeGreaterThan(14);
    expect(dEnd).toBeGreaterThan(22);
    expect(sim.trex.jaw).toBeLessThan(1.3);
  });

  it("the Swiftclaw pack stalks and chases a herd for show — the herd stampedes, the raptors never catch anything", { timeout: 60_000 }, () => {
    const sim = makeSim(false);
    const pack = sim.herds.find((h) => h.plan.species === "raptor")!;
    const hunts = new Set<number>();
    let fled = false;
    let gap = Infinity;
    run(sim, 600, 0, 11, 0, 0, false, () => {
      hunts.add(pack.hunt);
      if (pack.prey && pack.prey.flee > 0) fled = true;
      for (const r of pack.members)
        for (const a of sim.animals) if (["trike", "para", "stego", "ankylo"].includes(a.def.id) && a.mode !== 1) gap = Math.min(gap, bodyGap(r, a));
    });
    expect(hunts.has(1), "stalks").toBe(true);
    expect(hunts.has(2), "chases").toBe(true);
    expect(fled, "the herd stampedes").toBe(true);
    expect(gap, "never catches anything").toBeGreaterThan(RAPTOR_GAP * 0.4);
  });

  it("rests at night; pteranodons soar over the cliffs and swoop down to skim the sea; the plesiosaur swims round the coast", { timeout: 30_000 }, () => {
    const sim = makeSim(false);
    let skim = false;
    let high = 0;
    let n = 0;
    run(sim, 240, 0, 12, 0, 0, false, () => {
      for (const a of sim.animals.filter((q) => q.def.id === "ptero")) {
        n++;
        if (a.y > 20) high++;
        if (a.mode === 2 && a.y < 3 && dinoShoreDist(a.x, a.z) > 8) skim = true;
      }
      const ple = sim.animals.find((q) => q.def.id === "plesio")!;
      const sd = dinoShoreDist(ple.x, ple.z);
      expect(sd).toBeGreaterThan(14);
      expect(sd).toBeLessThan(40);
    });
    expect(skim, "a pteranodon skims the sea").toBe(true);
    expect(high / n, "mostly soaring high").toBeGreaterThan(0.6);
    run(sim, 150, 0, 22.5, 0, 0, false);
    const W = walkers(sim).filter((a) => a.mode !== 1 && a.def.id !== "trex");
    expect(W.filter((a) => a.lie > 0.5).length / W.length).toBeGreaterThan(0.4);
  });

  it("are true size next to the Park kid (2.26 units = a 1.4 m ten-year-old: 1 m = 1.6 units)", () => {
    expect(DINO_M).toBeCloseTo(2.26 / 1.4, 1);
    const sim = makeSim(false);
    for (const def of SPECIES) {
      const t = TRUE_SIZE[def.id];
      const mid = (def.scale[0] + def.scale[1]) / 2;
      expect(t.model * mid, def.id).toBeCloseTo(t.real * DINO_M, 1);
      for (const a of sim.animals.filter((q: Animal) => q.def === def && !q.baby)) {
        expect(a.scale / trueK(def.id), def.id).toBeGreaterThan(0.85);
        expect(a.scale / trueK(def.id), def.id).toBeLessThan(1.15);
      }
    }
    const KID = 2.26;
    const adult = (id: string) => sim.animals.find((a) => a.def.id === id && !a.baby)!;
    expect((13.1 * adult("brachio").scale) / KID).toBeGreaterThan(8);
    expect((12.95 * adult("trex").scale) / KID).toBeGreaterThan(8);
    expect((1.01 * adult("dodo").scale) / KID).toBeLessThan(0.6);
    // a Swiftclaw is about a grown-up's height long, much smaller than a T-rex
    expect((2.97 * adult("raptor").scale) / DINO_M).toBeGreaterThan(2.5);
    expect((2.97 * adult("raptor").scale) / DINO_M).toBeLessThan(3.5);
  });

  it("is deterministic", () => {
    const a = makeSim(false);
    const b = makeSim(false);
    run(a, 40, 0, 15, DINO_ISLAND.x + 10, DINO_ISLAND.z, true);
    run(b, 40, 0, 15, DINO_ISLAND.x + 10, DINO_ISLAND.z, true);
    expect(a.animals.map((q) => [q.x, q.z, q.yaw])).toEqual(b.animals.map((q) => [q.x, q.z, q.yaw]));
  });
});
