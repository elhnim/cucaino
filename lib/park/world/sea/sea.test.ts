import { describe, expect, it } from "vitest";
import { abyssFloorY } from "../../registry/abyss";
import { frostGroundY, frostSeaFloorY } from "../../registry/frostIsland";
import { dinoSeaFloorY, dinoShoreDist } from "../../registry/dinoIsland";
import * as THREE from "three";
import { DEEP_FLOOR, TERRAIN_X0, TERRAIN_X1, TERRAIN_Z1, WATER_Y, WRAP_R, groundY, terrainCovers, wrapWorld } from "../../registry/terrain";
import { rngOf } from "../fantasy/noise";
import { dist2, follow, makeFocusTracker, makeSwimmer, respawn, seaDepth, seaFloorY, shiftSwimmers, swim, trackFocus, wrapAngle, type SwimStyle } from "./wander";
import { BREACH, CRUISE, EV_BLOW, EV_DRIP, EV_ENTER, EV_EXIT, FLUKE, SURFACE, WHALE_STYLE, bodyToWorld, directWhales, makeWhale, makeWhaleDirector, noseY, startMode, stepWhale, tailY, whaleLen, type Whale } from "./whales";
import { WHALE_GIRTH, blowholeLocal, whaleGeometry } from "./whaleGeometry";
import { seaDisc } from "../ocean";
import { villageGroundY, villageSeaFloorY } from "../../registry/villageIsland";
import { makeVisit, startVisit, stepVisit } from "./visits";

const OPEN: SwimStyle = { speed: [3, 5], turn: 0.25, wander: 0.05, depth: [2, 4], clear: 2, need: 10, look: 30, climb: 1, bank: 2 };
const dt = 1 / 20;

describe("the boundless sea floor", () => {
  it("is the terrain inside the height grid", () => {
    for (const [x, z] of [[0, 180], [150, -120], [-190, 60], [199, 199]]) expect(seaFloorY(x, z)).toBeCloseTo(groundY(x, z), 5);
  });
  it("is the deep sandy plain beyond it, with only low dunes", () => {
    const r = rngOf(3);
    for (let i = 0; i < 400; i++) {
      const a = r() * Math.PI * 2;
      const d = 300 + r() * 900;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      // (except Coralcove Isle's slopes, which rise out of the deep, and the Midnight Rift's crack)
      if (villageSeaFloorY(x, z) !== null) continue;
      if (abyssFloorY(x, z) !== null) continue;
      if (frostSeaFloorY(x, z) !== null || frostGroundY(x, z) !== null) continue;
      if (dinoSeaFloorY(x, z) !== null) continue;
      // (the main island itself: now 10x across and joined onto the huge Wildlands, so 300-1200 m
      //  from the plaza is often still dry land, not open sea — terrainCovers says where its ground,
      //  park or Wildlands alike, is actually drawn)
      if (terrainCovers(x, z)) continue;
      const y = seaFloorY(x, z);
      expect(y).toBeGreaterThan(DEEP_FLOOR - 1);
      expect(y).toBeLessThan(DEEP_FLOOR + 1);
    }
  });
  it("has no step or cliff where the grid ends", () => {
    for (let k = 0; k < 200; k++) {
      // (along the field's southern edge)
      const u = TERRAIN_X0 + (k / 199) * (TERRAIN_X1 - TERRAIN_X0);
      // (the field's now big enough that its southern edge runs right past Coralcove Isle's own
      //  jetty — a real deck at a real height, not a seam in the terrain field — so skip the
      //  stretch a satellite island's ground or slopes reach into and sample a clean run of it)
      let touchesIsland = false;
      for (let z = TERRAIN_Z1 - 2; z < TERRAIN_Z1 + 20 && !touchesIsland; z += 2) {
        if (villageGroundY(u, z) !== null || villageSeaFloorY(u, z) !== null || frostSeaFloorY(u, z) !== null || frostGroundY(u, z) !== null || dinoSeaFloorY(u, z) !== null) touchesIsland = true;
      }
      if (touchesIsland) continue;
      expect(Math.abs(seaFloorY(u, TERRAIN_Z1 + 0.2) - seaFloorY(u, TERRAIN_Z1 - 0.8))).toBeLessThan(0.8);
      let prev = seaFloorY(u, TERRAIN_Z1);
      for (let z = TERRAIN_Z1; z < TERRAIN_Z1 + 20; z += 0.5) {
        const y = seaFloorY(u, z);
        expect(Math.abs(y - prev)).toBeLessThan(0.6);
        prev = y;
      }
    }
  });
});

describe("roaming", () => {
  it("a roamer meanders across the open ocean (not a circle), always in deep water", () => {
    const s = makeSwimmer(0, -3, 330, 0.3, 17, 4);
    const start = { x: s.x, z: s.z };
    let maxD = 0;
    let turnSum = 0;
    let prevYaw = s.yaw;
    for (let t = 0; t < 600; t += dt) {
      swim(s, OPEN, dt, t);
      expect(seaDepth(s.x, s.z)).toBeGreaterThan(OPEN.need * 0.8);
      expect(Math.abs(s.yawRate)).toBeLessThanOrEqual(OPEN.turn + 1e-9);
      expect(Math.abs(s.roll)).toBeLessThanOrEqual(0.75);
      expect(s.y).toBeLessThan(WATER_Y);
      turnSum += Math.abs(wrapAngle(s.yaw - prevYaw));
      prevYaw = s.yaw;
      maxD = Math.max(maxD, Math.hypot(s.x - start.x, s.z - start.z));
    }
    // it went somewhere, turning as it went
    expect(maxD).toBeGreaterThan(300);
    expect(turnSum).toBeGreaterThan(3);
  });
  it("turns away from the island before the water gets too shallow", () => {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      // start out at sea, heading straight for the beach
      // (not from Dino Isle's side: out west its slopes come within ~260 m of the main island)
      if (dinoShoreDist(Math.sin(a) * 260, Math.cos(a) * 260) < 80) continue;
      // (the island's grown ~10x across and joined onto the Wildlands, so most headings at 260 m
      //  from the plaza are dry land now, not open sea — only the park's own shore arc still has
      //  water out here; skip any heading that doesn't actually start at sea)
      if (seaDepth(Math.sin(a) * 260, Math.cos(a) * 260) < OPEN.need) continue;
      const s = makeSwimmer(Math.sin(a) * 260, -3, Math.cos(a) * 260, a + Math.PI, 100 + k, 4);
      let minDepth = Infinity;
      for (let t = 0; t < 120; t += dt) {
        swim(s, OPEN, dt, t);
        minDepth = Math.min(minDepth, seaDepth(s.x, s.z));
      }
      expect(minDepth).toBeGreaterThan(OPEN.need * 0.75);
    }
  });
  it("is deterministic", () => {
    const run = () => {
      const s = makeSwimmer(40, -3, 300, 1, 5, 4);
      for (let t = 0; t < 60; t += dt) swim(s, OPEN, dt, t);
      return [s.x, s.y, s.z, s.yaw];
    };
    expect(run()).toEqual(run());
  });
  it("a reef resident stays round its home", () => {
    const home = { x: 0, z: 185, r: 20 };
    const st: SwimStyle = { ...OPEN, speed: [0.7, 1.5], need: 3, look: 6, depth: [1.5, 30], clear: 1, home };
    const s = makeSwimmer(home.x, -4, home.z, 0, 9, 1);
    for (let t = 0; t < 900; t += dt) {
      swim(s, st, dt, t);
      expect(Math.hypot(s.x - home.x, s.z - home.z)).toBeLessThan(home.r * 1.7);
    }
  });
  it("respawns out of sight around the focus, mostly ahead, in deep enough water, passing close", () => {
    const r = rngOf(11);
    const s = makeSwimmer(0, 0, 0, 0, 1);
    // (420, 0) used to be well out in the open sea off the old little island; now that heading
    // (east) runs straight into the Wildlands, so the focus and its direction of travel are moved
    // to due south of the plaza instead — still comfortably inside the park's own open sea (the
    // only stretch of coast with a beach to be "mostly ahead, away from" any more)
    const focus = { x: 0, z: 300 };
    for (let i = 0; i < 200; i++) {
      respawn(s, OPEN, focus, 0, 1, r, 150, 230, 1.0);
      const d = Math.sqrt(dist2(s, focus));
      expect(d).toBeGreaterThanOrEqual(149.9);
      expect(d).toBeLessThanOrEqual(230.1);
      expect(seaDepth(s.x, s.z)).toBeGreaterThanOrEqual(OPEN.need);
      // ahead: within the arc of the direction of travel (+z, south)
      expect(Math.abs(wrapAngle(Math.atan2(s.x - focus.x, s.z - focus.z) - 0))).toBeLessThanOrEqual(1.0 + 1e-6);
      // heading: its path passes within ~half rMin of the focus
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      const along = (focus.x - s.x) * fx + (focus.z - s.z) * fz;
      expect(along).toBeGreaterThan(0);
      const lateral = Math.abs((focus.x - s.x) * fz - (focus.z - s.z) * fx);
      expect(lateral).toBeLessThanOrEqual(150 * 0.5);
    }
  });
  it("near the island, respawns are pushed out to sea", () => {
    const r = rngOf(12);
    const s = makeSwimmer(0, 0, 0, 0, 1);
    for (let i = 0; i < 60; i++) {
      respawn(s, { ...OPEN, need: 16 }, { x: 0, z: 0 }, 0, 0, r, 30, 60);
      expect(seaDepth(s.x, s.z)).toBeGreaterThanOrEqual(16);
    }
  });
  it("followers keep formation with their leader", () => {
    const lead = makeSwimmer(0, -3, 320, 0.5, 3, 4);
    const fol = makeSwimmer(-5, -3, 315, 0.5, 4, 4);
    let worst = 0;
    for (let t = 0; t < 300; t += dt) {
      swim(lead, OPEN, dt, t);
      follow(fol, OPEN, lead, 4, 5, dt, t);
      if (t > 20) worst = Math.max(worst, Math.hypot(fol.x - lead.x, fol.z - lead.z));
    }
    expect(worst).toBeLessThan(18);
  });
  it("the population jumps with the focus across the world wrap (the neighbourhood is kept)", () => {
    const f = makeFocusTracker();
    const kid = { x: WRAP_R - 1, z: 0 };
    trackFocus(f, kid.x, kid.z, dt);
    const pod = [makeSwimmer(kid.x + 20, -3, 5, 0, 1), makeSwimmer(kid.x - 30, -3, -12, 0, 2)];
    const rel = pod.map((p) => [p.x - kid.x, p.z - kid.z]);
    kid.x += 3; // swim past the edge...
    expect(wrapWorld(kid)).toBe(true); // ...and come in from the other side
    expect(trackFocus(f, kid.x, kid.z, dt)).toBe(true);
    shiftSwimmers(pod, f.jx, f.jz);
    pod.forEach((p, i) => {
      expect(p.x - kid.x).toBeCloseTo(rel[i][0], 6);
      expect(p.z - kid.z).toBeCloseTo(rel[i][1], 6);
    });
    // ordinary movement is not a jump, and gives a direction of travel
    for (let k = 0; k < 40; k++) expect(trackFocus(f, kid.x + (k + 1) * 0.3, kid.z, dt)).toBe(false);
    expect(f.vx).toBeGreaterThan(3);
  });
});

/** run the whales (with their director) round a focus that moves along `path` */
function simulate(whales: Whale[], seconds: number, path: (t: number, out: { x: number; y: number; z: number }) => void, under = false, onStep?: (t: number, evs: number[], kid: { x: number; y: number; z: number }) => void) {
  const f = makeFocusTracker();
  const d = makeWhaleDirector();
  const r = rngOf(77);
  const kid = { x: 0, y: 0, z: 0 };
  const evs = whales.map(() => 0);
  for (let t = 0; t < seconds; t += dt) {
    path(t, kid);
    if (trackFocus(f, kid.x, kid.z, dt)) shiftSwimmers(whales, f.jx, f.jz);
    directWhales(whales, d, f, kid.y, under, dt, r);
    whales.forEach((w, i) => (evs[i] = stepWhale(w, dt, t, r, kid)));
    onStep?.(t, evs, kid);
  }
}
function pod(): Whale[] {
  // (true size: humpbacks ~14 m, blue whales ~25 m, x 1.6 units per metre)
  const ws = [makeWhale("humpback", whaleLen("humpback", 0), 11), makeWhale("humpback", whaleLen("humpback", 1), 13), makeWhale("blue", whaleLen("blue", 0), 12), makeWhale("blue", whaleLen("blue", 1), 14)];
  const r = rngOf(8080);
  for (const w of ws) respawn(w, WHALE_STYLE[w.kind], { x: 0, z: 0 }, 0, 0, r, 215, 300);
  return ws;
}

describe("giant whales", () => {
  it("are true size next to the Park kid (2.26 units = 1.4 m): humpbacks ~14 m, blue whales ~25 m", () => {
    const KID = 2.26;
    expect(whaleLen("humpback") / KID).toBeCloseTo(14 / 1.4, 0);
    expect(whaleLen("blue") / KID).toBeCloseTo(25 / 1.4, 0);
    // a blue whale is as long as ~18 kids lying head to toe
    expect(whaleLen("blue")).toBeGreaterThan(38);
  });
  it("keep to the open ocean (never the lagoon), and never touch the sea floor", () => {
    const ws = pod();
    // a lap of the open ocean right round the island: a radius of 300 used to clear the old little
    // island easily, but the Wildlands (registry/island.ts) now reaches out to about 2.8 km from the
    // plaza at its farthest, so the lap has to be wide enough to clear that too (3000 still comes
    // well inside WRAP_R, so there's no world-wrap to worry about along the way)
    simulate(ws, 1500, (t, o) => ((o.x = Math.sin(t * 0.01) * 3000), (o.z = Math.cos(t * 0.01) * 3000), (o.y = 0)), false, () => {
      for (const w of ws) {
        expect(seaDepth(w.x, w.z)).toBeGreaterThan(13);
        expect(w.y).toBeGreaterThan(seaFloorY(w.x, w.z) + 1);
        // (its belly too: a true-size blue whale is ~5 units thick)
        expect(w.y - w.girth).toBeGreaterThan(seaFloorY(w.x, w.z));
        expect(noseY(w)).toBeGreaterThan(DEEP_FLOOR - 0.5);
        expect(Number.isFinite(w.x + w.y + w.z + w.yaw + w.pitch + w.roll)).toBe(true);
      }
    });
  }, 30_000); // (a long simulation: give it room when the whole suite runs in parallel)
  it("surface to blow, lift their flukes and dive — and humpbacks breach", () => {
    const ws = pod();
    const modes = new Set<string>();
    let blows = 0;
    simulate(ws, 1200, (t, o) => ((o.x = 350), (o.z = t * 0.5), (o.y = 0)), false, (_, evs) => {
      ws.forEach((w, i) => {
        modes.add(`${w.kind}:${w.mode}`);
        if (evs[i] & EV_BLOW) blows++;
      });
    });
    expect(blows).toBeGreaterThan(10);
    expect(modes.has(`blue:${SURFACE}`)).toBe(true);
    expect(modes.has(`humpback:${FLUKE}`)).toBe(true);
    expect(modes.has(`humpback:${BREACH}`)).toBe(true);
    expect(modes.has(`blue:${BREACH}`)).toBe(false);
  });
  it("a breach: two-thirds out of the sea, one splash out and one crash back in", () => {
    const w = makeWhale("humpback", whaleLen("humpback"), 3);
    Object.assign(w, { x: 0, z: 400, y: -8 });
    const r = rngOf(4);
    startMode(w, BREACH, r);
    let exits = 0;
    let enters = 0;
    let peakNose = -99;
    let peakY = -99;
    for (let t = 0; w.mode === BREACH; t += dt) {
      const ev = stepWhale(w, dt, t, r, null);
      if (ev & EV_EXIT) exits++;
      if (ev & EV_ENTER) enters++;
      peakNose = Math.max(peakNose, noseY(w));
      peakY = Math.max(peakY, w.y);
      expect(w.y).toBeGreaterThan(seaFloorY(w.x, w.z));
    }
    expect(exits).toBe(1);
    expect(enters).toBe(1);
    expect(peakNose).toBeGreaterThan(WATER_Y + w.len * 0.4);
    expect(peakY).toBeGreaterThan(WATER_Y);
    expect(w.mode).toBe(CRUISE);
  });
  it("a fluke-up dive raises the tail high, dripping, then slips under", () => {
    const w = makeWhale("humpback", whaleLen("humpback"), 3);
    Object.assign(w, { x: 0, z: 400 });
    w.y = WATER_Y - w.girth * 0.62;
    const r = rngOf(5);
    startMode(w, FLUKE, r);
    let peakTail = -99;
    let drips = 0;
    let enters = 0;
    for (let t = 0; w.mode === FLUKE; t += dt) {
      const ev = stepWhale(w, dt, t, r, null);
      if (ev & EV_DRIP) drips++;
      if (ev & EV_ENTER) enters++;
      peakTail = Math.max(peakTail, tailY(w));
      expect(noseY(w)).toBeGreaterThan(DEEP_FLOOR);
    }
    expect(peakTail).toBeGreaterThan(WATER_Y + 2.5);
    expect(drips).toBeGreaterThan(20);
    expect(enters).toBe(1);
    expect(w.y).toBeLessThan(WATER_Y - 6);
  });
  it("follow the player across the ocean, and come to meet them", () => {
    const ws = pod();
    let near = 0;
    let steps = 0;
    let visits = 0;
    let wasClose = false;
    // sail straight out and on round the world at 8 m/s
    simulate(ws, 900, (t, o) => {
      o.x = 0;
      o.z = 200 + t * 8;
      o.y = 0;
      wrapWorld(o);
    }, false, (t, _e, kid) => {
      if (t < 30) return;
      steps++;
      let best = Infinity;
      for (const w of ws) best = Math.min(best, dist2(w, kid));
      if (best < 330 * 330) near++;
      const close = best < 90 * 90;
      if (close && !wasClose) visits++;
      wasClose = close;
    });
    expect(near / steps).toBeGreaterThan(0.9);
    expect(visits).toBeGreaterThanOrEqual(4);
  });
  it("a whale sent to meet a kid who stays inland gives up and gets on with its life", () => {
    const ws = pod();
    let surfaced = 0;
    const cued = ws.map(() => 0);
    let longest = 0;
    simulate(ws, 700, (_t, o) => ((o.x = 0), (o.z = 0), (o.y = 2)), false, (_t, evs) => {
      evs.forEach((e) => e & EV_BLOW && surfaced++);
      ws.forEach((w, i) => {
        cued[i] = w.cue >= 0 ? cued[i] + dt : 0;
        longest = Math.max(longest, cued[i]);
      });
    });
    expect(longest).toBeLessThan(95);
    expect(surfaced).toBeGreaterThan(4);
  });
  it("glide past a diving kid at their depth", () => {
    const ws = pod();
    let passed = false;
    // (out over the deep south of the main island: the west is Dino Isle now)
    simulate(ws, 150, (_t, o) => ((o.x = 0), (o.z = 380), (o.y = -8)), true, (_t, _e, kid) => {
      for (const w of ws) if (dist2(w, kid) < 30 * 30 && Math.abs(w.y - kid.y) < 7) passed = true;
    });
    expect(passed).toBe(true);
  });
  it("a diving kid out over the deep meets a whale close up (8-16 m) every half-minute or so", () => {
    const ws = pod();
    let passes = 0;
    let wasClose = false;
    let closest = Infinity;
    simulate(ws, 300, (_t, o) => ((o.x = 0), (o.z = 380), (o.y = -8)), true, (t, _e, kid) => {
      if (t < 5) return;
      let best = Infinity;
      // (measured to the whale's flank: a true-size blue whale is ~5 units thick)
      for (const w of ws) if (Math.abs(w.y - kid.y) < 7 + w.girth) best = Math.min(best, Math.sqrt(dist2(w, kid)) - w.girth);
      closest = Math.min(closest, best);
      const close = best < 18;
      if (close && !wasClose) passes++;
      wasClose = close;
    });
    expect(passes).toBeGreaterThanOrEqual(6);
    // close, but they swim round the kid rather than through them
    expect(closest).toBeGreaterThan(3);
  });
  it("the whale kit: finite, modest, unit length, with skin markings", () => {
    for (const kind of ["blue", "humpback"] as const) {
      const g = whaleGeometry(kind);
      const pos = g.attributes.position.array as Float32Array;
      expect(Array.from(pos).every(Number.isFinite)).toBe(true);
      expect(g.attributes.position.count / 3).toBeLessThan(7000);
      expect(g.attributes.aWh).toBeDefined();
      expect(g.attributes.aFx).toBeDefined();
      // no zero normals (a flexing sliver would put a NaN on screen, and bloom smears it everywhere)
      const nrm = g.attributes.normal.array as Float32Array;
      for (let i = 0; i < nrm.length; i += 3) expect(Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2])).toBeGreaterThan(0.5);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(b.max.z).toBeCloseTo(0.5, 1);
      expect(b.min.z).toBeLessThan(-0.5);
      expect(b.min.z).toBeGreaterThan(-0.6);
      // the humpback's flippers reach far out; the blue whale is slender
      if (kind === "humpback") expect(b.max.x - b.min.x).toBeGreaterThan(0.35);
      else expect(WHALE_GIRTH.blue).toBeLessThan(WHALE_GIRTH.humpback);
      const bh = blowholeLocal(kind);
      expect(bh.z).toBeGreaterThan(0.2);
      expect(bh.y).toBeGreaterThan(0.03);
    }
  });
  it("bodyToWorld matches three.js (Euler YXZ)", () => {
    const s = { x: 3, y: -2, z: 7, yaw: 0.7, pitch: -0.4, roll: 1.1 };
    const out = { x: 0, y: 0, z: 0 };
    bodyToWorld(s, 0.5, 1.5, -4, out);
    const v = new THREE.Vector3(0.5, 1.5, -4).applyEuler(new THREE.Euler(s.pitch, s.yaw, s.roll, "YXZ")).add(new THREE.Vector3(s.x, s.y, s.z));
    expect(out.x).toBeCloseTo(v.x, 6);
    expect(out.y).toBeCloseTo(v.y, 6);
    expect(out.z).toBeCloseTo(v.z, 6);
  });
});

describe("close encounters (visits)", () => {
  const ORCA_V: SwimStyle = { speed: [3.2, 4.4], turn: 0.34, wander: 0.04, depth: [1.8, 30], clear: 2.1, need: 4.5, look: 18, climb: 1.4, bank: 1.6 };
  const run = (focusAt: (t: number, o: { x: number; z: number }) => void, kidY: number, lateral: number, dirX = 0, dirZ = 1) => {
    const s = makeSwimmer(0, -5, 0, 0, 901, 4);
    const v = makeVisit(0);
    const kid = { x: 0, z: 0 };
    focusAt(0, kid);
    startVisit(s, ORCA_V, v, kid, dirX, dirZ, rngOf(5), 58, 70, lateral, kidY);
    const start = Math.sqrt(dist2(s, kid));
    let closest = Infinity;
    let yAtClosest = 0;
    for (let t = 0; t < 40; t += dt) {
      focusAt(t, kid);
      const d = stepVisit(s, ORCA_V, v, kid, dt, t);
      expect(s.y).toBeGreaterThan(seaFloorY(s.x, s.z) + 0.5);
      expect(s.y).toBeLessThan(WATER_Y - 1);
      if (d < closest) ((closest = d), (yAtClosest = s.y));
    }
    return { start, closest, yAtClosest, passed: v.passed };
  };
  it("a visitor turns up out in the blue and swims right past the kid, at their depth", () => {
    // out over the deep
    const r = run((_t, o) => ((o.x = 0), (o.z = 320)), -7, 10);
    expect(r.start).toBeGreaterThan(55);
    expect(r.passed).toBe(true);
    expect(r.closest).toBeLessThan(13);
    expect(r.closest).toBeGreaterThan(5);
    expect(Math.abs(r.yAtClosest + 7)).toBeLessThan(2);
  });
  it("it tracks a kid who's swimming along", () => {
    // (it turns up ahead of where they are going)
    const r = run((t, o) => ((o.x = t * 2.5), (o.z = 320)), -6, 8, 1, 0);
    expect(r.passed).toBe(true);
    expect(r.closest).toBeLessThan(12);
  });
  it("over the reef shelf it keeps clear of the floor", () => {
    // ~9 m of water off the galleon's garden
    const p = { x: Math.sin(0.2) * 193, z: Math.cos(0.2) * 193 };
    const r = run((_t, o) => ((o.x = p.x), (o.z = p.z)), seaFloorY(p.x, p.z) + 3, 8);
    expect(r.closest).toBeLessThan(20);
  });
});

describe("the sea surface", () => {
  it("is a disc that faces up and reaches past the fog", () => {
    const g = seaDisc(640, 40, 96);
    const p = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index!.array;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(p, idx[i]);
      b.fromBufferAttribute(p, idx[i + 1]);
      c.fromBufferAttribute(p, idx[i + 2]);
      expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
    }
    g.computeBoundingSphere();
    expect(g.boundingSphere!.radius).toBeGreaterThanOrEqual(600);
  });
});
