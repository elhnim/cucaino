import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BOND_STEPS, buildRideables } from "./index";
import { createDragonFlight } from "./dragonFlight";
import { pickSeaCall, pickMantaCall, angleTo, turnTowards, keepGap, sideGap, MANTA_CALL, MIN_GAP, SEA_FIRST_CALL, SEA_MIN_DEPTH, type MantaCall, type SeaCall } from "./plan";
import { RIDEABLE_SPOTS } from "../../registry/rideables";
import { DRAGON_BREEDS, DRAGON_BREED_IDS, HOP_REACH, M, MOUNT_BODY, RIDEABLE_KINDS, mountBody, buildMount, isBoat, isCraft, isSub, mountStatueGeometry, type MountKind } from "../../characters/mounts";
import { GARDENS, atSea } from "../underwater/plan";
import { seaDepth, seaFloorY } from "../sea/wander";
import { WATER_Y, groundY } from "../../registry/terrain";

const spot = (id: string) => RIDEABLE_SPOTS.find((s) => s.id === id)!;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** draw calls the group would issue: visible meshes (instanced meshes with count 0 are hidden) */
function drawCalls(root: THREE.Object3D) {
  let n = 0;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 0)) n++;
    o.children.forEach(walk);
  };
  walk(root);
  return n;
}

describe("mount rigs", () => {
  it("every kind builds as one skinned mesh + a shadow (+ a glass bubble for subs), with a seat above its feet", () => {
    for (const k of [...RIDEABLE_KINDS, "pony" as const]) {
      const rig = buildMount(k);
      let meshes = 0;
      rig.root.traverse((o) => (o as THREE.Mesh).isMesh && meshes++);
      expect(meshes, k).toBe(isSub(k) ? 3 : 2);
      expect(rig.root.getObjectByName("mount-body")).toBeTruthy();
      for (let i = 0; i < 20; i++) rig.update(0.05, 6, k === "manta" || k === "dragon", 0.5, 0);
      // (boats: the kid stands on the floor just above the waterline; subs: inside the bubble, round the hull's axis)
      expect(rig.seat.y, k).toBeGreaterThan(isSub(k) ? -1.2 : isBoat(k) ? 0.1 : 0.3);
      expect(Number.isFinite(rig.seat.x + rig.seat.y + rig.seat.z + rig.petSeat.y)).toBe(true);
      rig.dispose();
      const g = mountStatueGeometry(k);
      expect(g.attributes.position.count).toBeGreaterThan(100);
      expect(g.attributes.glow).toBeTruthy();
      g.dispose();
    }
  });
  it("flies = the engine's 3D-altitude movement (dragon in the air, manta under water; subs have their own depth rules)", () => {
    expect(buildMount("dragon").flies).toBe(true);
    expect(buildMount("manta").flies).toBe(true);
    for (const k of ["bike", "car", "unicorn", "pony", "whale", "dolphin", "pedalo", "sailboat", "speedboat", "ship", "sub", "deepsub"] as const) expect(buildMount(k).flies, k).toBe(false);
  });

  it("everything is TRUE SIZE next to the kid (1 m = 1.6 units)", () => {
    const box = (k: MountKind) => {
      const g = mountStatueGeometry(k);
      g.computeBoundingBox();
      const b = g.boundingBox!.clone();
      g.dispose();
      return b;
    };
    const m = (v: number) => v / M;
    // a horse's shoulder ~1.6 m: the unicorn's back
    const u = box("unicorn");
    expect(m(u.max.y)).toBeGreaterThan(1.5);
    expect(m(u.max.z - u.min.z)).toBeGreaterThan(1.9);
    // dolphin 2.5-3 m, manta 5-7 m wingspan, humpback ~14 m, the dragon ~10 m
    const d = box("dolphin");
    expect(m(d.max.z - d.min.z)).toBeGreaterThan(2.4);
    expect(m(d.max.z - d.min.z)).toBeLessThan(3.1);
    const mt = box("manta");
    expect(m(mt.max.x - mt.min.x)).toBeGreaterThan(5);
    expect(m(mt.max.x - mt.min.x)).toBeLessThan(7);
    const w = box("whale");
    expect(m(w.max.z - w.min.z)).toBeGreaterThan(12.5);
    expect(m(w.max.z - w.min.z)).toBeLessThan(15.5);
    const dr = box("dragon");
    expect(m(dr.max.z - dr.min.z)).toBeGreaterThan(8.5);
    expect(m(dr.max.z - dr.min.z)).toBeLessThan(12);
    // the breeds: a 4-5 m Zippit up to the ~11 m Roostwarden; every one stands on four legs, its
    // back level (like a big cat: longer than it is tall), with the saddle on top
    const lens: Record<string, number> = {};
    for (const b of DRAGON_BREED_IDS) {
      const g = mountStatueGeometry("dragon", "#ff5fa8", "classic", {}, b);
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const len = m(bb.max.z - bb.min.z);
      lens[b] = len;
      // (cheap enough to have several about: ~7k triangles each)
      expect(g.attributes.position.count / 3, b).toBeLessThan(9000);
      g.dispose();
      expect(len, b).toBeGreaterThan(b === "zippit" ? 3.5 : 5.5);
      expect(len, b).toBeLessThan(12);
      const rig = buildMount("dragon", "#ff5fa8", "classic", b);
      rig.drive!({ mode: "park", act: "stand", look: 0, flap: 0, dive: 0 });
      for (let i = 0; i < 30; i++) rig.update(0.05, 0, false, 0, 0);
      expect(rig.breed).toBe(b);
      // the seat is up on its back, well under its length (not stood up tall like a kangaroo)
      expect(rig.seat.y / M, b).toBeGreaterThan(b === "zippit" ? 0.8 : 1.4);
      expect(rig.seat.y / M, b).toBeLessThan(len * 0.42);
      rig.dispose();
    }
    expect(lens.zippit).toBeLessThan(lens.puffwing);
    expect(lens.roostwarden).toBeGreaterThan(lens.puffwing);
    // boats: pedalo ~3.4 m, sailboat ~6 m, Rocket Boat ~5.5 m, the Pirate Ship ~14 m; subs ~4 m
    const len = (k: MountKind) => {
      const b = box(k);
      return m(b.max.z - b.min.z);
    };
    expect(len("pedalo")).toBeGreaterThan(3);
    expect(len("pedalo")).toBeLessThan(4.5);
    expect(len("sailboat")).toBeGreaterThan(5.5);
    expect(len("sailboat")).toBeLessThan(7);
    expect(len("speedboat")).toBeGreaterThan(5);
    expect(len("speedboat")).toBeLessThan(6.5);
    expect(len("ship")).toBeGreaterThan(12.5);
    expect(len("ship")).toBeLessThan(17);
    expect(len("sub")).toBeGreaterThan(3.6);
    expect(len("sub")).toBeLessThan(4.8);
    // the footprint the engine uses matches the model (within a metre or so)
    for (const k of ["pedalo", "sailboat", "speedboat", "ship", "sub", "deepsub", "whale", "dolphin"] as MountKind[]) {
      const b = box(k);
      expect(Math.abs((b.max.z - b.min.z) / 2 - MOUNT_BODY[k][0]), k).toBeLessThan(k === "ship" ? 2.4 : isCraft(k) ? 1.6 : 2.2);
    }
  });
});

describe("sea call planning", () => {
  it("comes up seaward of the kid, in deep enough water, 8-14 m away", () => {
    // (heading 0.9 used to be open park sea on the old round island; now it's the Wildlands, so
    //  use a heading on the park's own shore arc instead — see PARK_SHORE in registry/island.ts)
    const kid = atSea(0.2, 60);
    const out: SeaCall = { x: 0, z: 0, sx: 0, sz: 0 };
    let ok = 0;
    for (let i = 0; i < 40; i++) {
      const c = pickSeaCall(kid.x, kid.z, "dolphin", (i % 8) / 8, (i % 5) / 5, out);
      if (!c) continue;
      ok++;
      const d = Math.hypot(c.x - kid.x, c.z - kid.z);
      expect(d).toBeGreaterThanOrEqual(8);
      expect(d).toBeLessThanOrEqual(14);
      expect(seaDepth(c.x, c.z)).toBeGreaterThanOrEqual(SEA_MIN_DEPTH.dolphin);
      expect(Math.hypot(c.sx, c.sz)).toBeGreaterThan(Math.hypot(c.x, c.z) - 10);
    }
    expect(ok).toBeGreaterThan(20);
  });
  it("whales only come up in the deep blue", () => {
    const out: SeaCall = { x: 0, z: 0, sx: 0, sz: 0 };
    const shallow = atSea(0.2, 16); // the lagoon (on the park's own shore)
    for (let i = 0; i < 20; i++) expect(pickSeaCall(shallow.x, shallow.z, "whale", i / 20, 0.5, out)).toBeNull();
  });
  it("a waiting ride is only ever nudged aside, just enough not to sit on the kid", () => {
    const r = { kind: "whale" as MountKind, x: 0, z: 0, yaw: 0 };
    // the kid well clear: it doesn't move
    keepGap(r, 10, 0);
    expect(r.x).toBe(0);
    expect(r.z).toBe(0);
    // the kid swimming into its flank: pushed aside to exactly MIN_GAP
    keepGap(r, 3, -1);
    expect(sideGap("whale", r.x, r.z, r.yaw, 3, -1)).toBeCloseTo(MIN_GAP, 4);
    expect(Math.hypot(r.x, r.z)).toBeLessThan(2);
    // right on its middle line: steps sideways
    const q = { kind: "dolphin" as MountKind, x: 5, z: 5, yaw: 1 };
    keepGap(q, 5, 5);
    expect(sideGap("dolphin", q.x, q.z, q.yaw, 5, 5)).toBeCloseTo(MIN_GAP, 4);
  });

  it("a manta glides in to a diving kid from open water, at their depth", () => {
    const out: MantaCall = { x: 0, y: 0, z: 0, sx: 0, sz: 0 };
    const k = atSea(2.8, 70);
    const ky = WATER_Y - 4;
    let ok = 0;
    for (let i = 0; i < 16; i++) {
      const c = pickMantaCall(k.x, ky, k.z, i / 16, out);
      if (!c) continue;
      ok++;
      expect(Math.hypot(c.sx - k.x, c.sz - k.z)).toBeCloseTo(MANTA_CALL.startR, 3);
      expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeCloseTo(MANTA_CALL.wait, 3);
      expect(c.y).toBeLessThan(WATER_Y - 1.5);
      expect(c.y).toBeGreaterThan(seaFloorY(c.sx, c.sz) + 1.5);
    }
    expect(ok).toBeGreaterThan(8);
    // never through the shallows of a beach
    const beach = atSea(2.8, -12);
    for (let i = 0; i < 16; i++) if (seaDepth(beach.x, beach.z) < 2) expect(pickMantaCall(beach.x, ky, beach.z, i / 16, out)).toBeNull();
  });

  it("angle helpers wrap", () => {
    expect(angleTo(3, -3)).toBeCloseTo(2 * Math.PI - 6, 5);
    expect(turnTowards(0, 1, 2, 0.1)).toBeCloseTo(0.2, 5);
    expect(turnTowards(0, 0.05, 2, 0.1)).toBeCloseTo(0.05, 5);
  });
});

describe("buildRideables", () => {
  it("finds, takes and releases a bike", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const b = spot("bike-plaza-1");
    const kid = V(b.x + 1, b.y!, b.z);
    w.update(0.03, 1, { kid, under: false, atSea: false, glow: 0 });
    const n = w.nearest(kid, 3)!;
    expect(n.id).toBe("bike-plaza-1");
    expect(n.kind).toBe("bike");
    expect(n.label).toContain("Bike");
    w.take(n.id);
    w.update(0.03, 1.03, { kid, under: false, atSea: false, glow: 0 });
    expect(w.nearest(kid, 3)?.id ?? null).not.toBe("bike-plaza-1");
    // ride it away and hop off
    const x = 30;
    const z = 30;
    const y = groundY(x, z);
    w.release("bike-plaza-1", x, y, z, 1.2);
    const kid2 = V(x + 1, y, z);
    w.update(0.03, 2, { kid: kid2, under: false, atSea: false, glow: 0 });
    const m = w.nearest(kid2, 3)!;
    expect(m.id).toBe("bike-plaza-1");
    expect(m.x).toBeCloseTo(x, 5);
    expect(m.y).toBeCloseTo(y, 5);
    w.dispose();
    expect(scene.children.length).toBe(0);
  });

  it("a unicorn trots over when the kid stands near its meadow, and stays on land", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const u = spot("unicorn-meadow-west");
    const kid = V(u.x + 12, groundY(u.x + 12, u.z), u.z);
    let t = 0;
    for (let i = 0; i < 400; i++) w.update(0.05, (t += 0.05), { kid, under: false, atSea: false, glow: 0 });
    const n = w.nearest(kid, 4.5);
    expect(n?.id).toBe("unicorn-meadow-west");
    expect(n!.y).toBeGreaterThan(WATER_Y);
    w.dispose();
  });

  it("a released manta swims off, then comes back to its reef spot later", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const m = spot("manta-wreck-2");
    const kid = V(m.x, m.y!, m.z);
    w.update(0.05, 0, { kid, under: true, atSea: true, glow: 0 });
    expect(w.nearest(kid, 6)?.id).toBe("manta-wreck-2");
    w.take("manta-wreck-2");
    w.release("manta-wreck-2", m.x, m.y!, m.z, 0);
    w.update(0.05, 0.05, { kid, under: true, atSea: true, glow: 0 });
    expect(w.nearest(kid, 6)?.id ?? null).not.toBe("manta-wreck-2");
    // the kid swims away; much later it's back home
    const far = V(0, 0, 0);
    let t = 0;
    for (let i = 0; i < 1000; i++) w.update(0.1, (t += 0.1), { kid: far, under: false, atSea: false, glow: 0 });
    w.update(0.1, (t += 0.1), { kid, under: true, atSea: true, glow: 0 });
    expect(w.nearest(kid, 6)?.id).toBe("manta-wreck-2");
    w.dispose();
  });

  it("out at sea a dolphin comes up 8-14 m away and waits; in the deep a whale comes too", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const k0 = atSea(0.2, 70);
    const kid = V(k0.x, WATER_Y - 0.6, k0.z);
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 3000; i++) {
      w.update(0.1, (t += 0.1), { kid, under: false, atSea: true, glow: 0 });
      const n = w.nearest(kid, 15);
      if (n && (n.kind === "dolphin" || n.kind === "whale")) {
        const d = Math.hypot(n.x - kid.x, n.z - kid.z);
        expect(d).toBeGreaterThan(7);
        // (the true-size whale waits a bit further off; you climb onto its flank)
        expect(d).toBeLessThan(n.kind === "whale" ? 21 : 15.5);
        seen.add(n.kind);
      }
    }
    expect(seen.has("dolphin")).toBe(true);
    expect(seen.has("whale")).toBe(true);
    // back on land: nobody from the sea waits for you
    const land = V(0, 0, 20);
    for (let i = 0; i < 200; i++) w.update(0.1, (t += 0.1), { kid: land, under: false, atSea: false, glow: 0 });
    for (let i = 0; i < 1; i++) {
      const n = w.nearest(kid, 30);
      expect(n?.kind === "dolphin" || n?.kind === "whale").toBe(false);
    }
    w.dispose();
  });

  /** run a kid at sea until `id` waits beside them (at most `secs`), returning the seconds taken */
  function waitFor(w: ReturnType<typeof buildRideables>, id: string, kid: THREE.Vector3, secs: number, o: { under?: boolean; diving?: boolean } = {}, t0 = 0): number {
    let t = t0;
    for (let i = 0; i < secs * 10; i++) {
      w.update(0.1, (t += 0.1), { kid, under: !!o.under, atSea: true, glow: 0, diving: o.diving });
      if (w.peek(id)?.state === "waiting") return t - t0;
    }
    return Infinity;
  }
  /** swim the kid straight at a ride's middle at `speed` m/s until it can hop on; seconds taken */
  function swimTo(w: ReturnType<typeof buildRideables>, id: string, kid: THREE.Vector3, speed: number, secs: number, t0: number, o: { under?: boolean; diving?: boolean } = {}): number {
    let t = t0;
    let minGap = Infinity;
    const start = w.peek(id)!;
    for (let i = 0; i < secs * 20; i++) {
      const p = w.peek(id)!;
      const dx = p.x - kid.x;
      const dz = p.z - kid.z;
      const d = Math.hypot(dx, dz) || 1;
      kid.x += (dx / d) * speed * 0.05;
      kid.z += (dz / d) * speed * 0.05;
      w.update(0.05, (t += 0.05), { kid, under: !!o.under, atSea: true, glow: 0, diving: o.diving });
      const q = w.peek(id)!;
      minGap = Math.min(minGap, sideGap(id.startsWith("whale") ? "whale" : id.startsWith("dolphin") ? "dolphin" : "manta", q.x, q.z, q.yaw, kid.x, kid.z));
      const n = w.nearest(kid);
      if (n?.id === id) {
        // it never sat on top of the kid, and it stayed put (no backing away) while they swam up
        expect(minGap).toBeGreaterThan(MIN_GAP - 0.05);
        expect(Math.hypot(q.x - start.x, q.z - start.z)).toBeLessThan(3);
        return t - t0;
      }
    }
    return Infinity;
  }

  it("swim off a beach: the dolphin comes within ~15 s and waits; swim to it and it can be boarded", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const k0 = atSea(4.4, 28); // ~28 m off the beach
    const kid = V(k0.x, WATER_Y - 0.95, k0.z);
    expect(seaDepth(kid.x, kid.z)).toBeGreaterThan(2.5);
    const t = waitFor(w, "dolphin-sea", kid, 40);
    expect(t).toBeLessThan(SEA_FIRST_CALL.dolphin + 3 + 10);
    const p = w.peek("dolphin-sea")!;
    expect(Math.hypot(p.x - kid.x, p.z - kid.z)).toBeGreaterThan(5);
    const s = swimTo(w, "dolphin-sea", kid, 5, 15, t);
    expect(s).toBeLessThan(5);
    w.dispose();
  });

  it("in the deep the whale comes too, stays put broadside, and a kid swimming at the surface can climb on", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    // (heading 1.2 used to be open park sea on the old round island; now it's the Wildlands, so use
    //  a heading on the park's own shore arc instead — see PARK_SHORE in registry/island.ts)
    const k0 = atSea(-0.5, 70);
    const kid = V(k0.x, WATER_Y - 0.95, k0.z);
    const t = waitFor(w, "whale-sea", kid, 60);
    expect(t).toBeLessThan(SEA_FIRST_CALL.whale + 3 + 25);
    const p = w.peek("whale-sea")!;
    // it waits beside the kid (they swim the last bit to its side)
    expect(sideGap("whale", p.x, p.z, p.yaw, kid.x, kid.z)).toBeGreaterThan(HOP_REACH - 1);
    const s = swimTo(w, "whale-sea", kid, 5, 20, t);
    expect(s).toBeLessThan(6);
    // the engine's hop height check: the whale's root vs a kid paddling at the surface
    const n = w.nearest(kid)!;
    expect(n.kind).toBe("whale");
    expect(Math.abs(n.y - kid.y)).toBeLessThan(4.5);
    // and a kid a couple of metres under, beside it, too
    kid.y = WATER_Y - 2.4;
    w.update(0.05, t + s + 0.05, { kid, under: true, atSea: true, glow: 0 });
    expect(w.nearest(kid)?.kind).toBe("whale");
    w.dispose();
  });

  it("the whale and the dolphin never come onto land, whatever the kid does along any coast", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    let t = 0;
    let worst = Infinity;
    let where = "";
    // a kid swimming along the shore (the park's and the Wildlands'), in and out of the water, then
    // up the beach — the sea friends come, follow, wait and swim off all the while
    for (const a of [-2, -0.5, 0.3, 1.2, 2.2, 3]) {
      for (let i = 0; i < 1200; i++) {
        const u = a + Math.sin(i / 300) * 0.05;
        const k0 = atSea(u, i % 400 < 300 ? 18 + (i % 300) * 0.1 : 2);
        const kid = V(k0.x, WATER_Y - 0.6, k0.z);
        w.update(0.1, (t += 0.1), { kid, under: false, atSea: i % 400 < 300, glow: 0 });
        for (const id of ["whale-sea", "dolphin-sea"]) {
          const p = w.peek(id)!;
          if (p.state === "away" || p.state === "taken") continue;
          const d = seaDepth(p.x, p.z);
          if (d < worst) ((worst = d), (where = `${id} ${p.state} @ ${p.x.toFixed(0)},${p.z.toFixed(0)} (heading ${a})`));
        }
      }
    }
    expect(worst, where).toBeGreaterThan(1);
    w.dispose();
  });

  it("a kid diving in deep water is visited by a manta within ~40 s, beside them at their depth", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    // well away from the reef gardens' mantas
    const a = 2.6; // between the Rainbow Reef and the Glow Reef
    const k0 = atSea(a, 60);
    const kid = V(k0.x, WATER_Y - 4.5, k0.z);
    expect(seaDepth(kid.x, kid.z)).toBeGreaterThan(MANTA_CALL.minDepth);
    for (const s of RIDEABLE_SPOTS.filter((q) => q.kind === "manta")) expect(Math.hypot(s.x - kid.x, s.z - kid.z)).toBeGreaterThan(25);
    const t = waitFor(w, "manta-visit", kid, 60, { under: true, diving: true });
    expect(t).toBeLessThan(40);
    const p = w.peek("manta-visit")!;
    expect(Math.abs(p.y - kid.y)).toBeLessThan(1.5);
    // it's right there: hop on straight away, or after a stroke or two
    const s = swimTo(w, "manta-visit", kid, 4, 10, t, { under: true, diving: true });
    expect(s).toBeLessThan(3);
    w.take("manta-visit");
    w.release("manta-visit", kid.x, kid.y, kid.z, 0);
    expect(w.peek("manta-visit")!.state).toBe("leaving");
    w.dispose();
  });

  it("the manta doesn't come to a kid paddling at the top, or in the shallows", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const k0 = atSea(2.6, 60);
    const kid = V(k0.x, WATER_Y - 0.95, k0.z);
    expect(waitFor(w, "manta-visit", kid, 60, { under: false, diving: false })).toBe(Infinity);
    w.dispose();
  });

  it("a parked dragon is found from 25 m (for the hint), and hopped on from its side", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const d = spot("dragon-hill-1");
    const far = V(d.x + 40, groundY(d.x + 40, d.z), d.z);
    w.update(0.05, 0.05, { kid: far, under: false, atSea: false, glow: 0 });
    expect(w.parkedNear(far, "dragon", 25)).toBeNull();
    const near = V(d.x + 20, groundY(d.x + 20, d.z), d.z);
    w.update(0.05, 0.1, { kid: near, under: false, atSea: false, glow: 0 });
    expect(w.parkedNear(near, "dragon", 25)).toBe("dragon-hill-1");
    // walk up to its flank
    const p = w.peek("dragon-hill-1")!;
    const hw = mountBody("dragon", d.breed)[1];
    const sx = p.x + Math.cos(p.yaw) * (hw + 2);
    const sz = p.z - Math.sin(p.yaw) * (hw + 2);
    const side = V(sx, groundY(sx, sz), sz);
    w.update(0.05, 0.15, { kid: side, under: false, atSea: false, glow: 0 });
    const n = w.nearest(side)!;
    expect(n.id).toBe("dragon-hill-1");
    expect(n.breed).toBe(d.breed);
    expect(n.label).toContain(DRAGON_BREEDS[d.breed!].name);
    // pins for the map: every dragon, the reefs and the docks
    const pins = w.pins();
    expect(pins.filter((q) => q.kind === "dragon").length).toBe(RIDEABLE_SPOTS.filter((q) => q.kind === "dragon" && !q.lounge).length);
    expect(pins.filter((q) => q.kind === "manta").length).toBe(GARDENS.length);
    expect(pins.some((q) => q.kind === "dock" && q.label === "Candy Harbour")).toBe(true);
    w.dispose();
  });

  it("making friends with a dragon: shy, a sniff, a nuzzle, hearts, then friends (and it trots over after)", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const id = "dragon-hill-2";
    const d = spot(id);
    const hw = mountBody("dragon", d.breed)[1];
    const sx = d.x + Math.cos(d.yaw) * (hw + 2.5);
    const sz = d.z - Math.sin(d.yaw) * (hw + 2.5);
    const kid = V(sx, groundY(sx, sz), sz);
    let t = 0;
    const step = (n: number, k = kid) => {
      for (let i = 0; i < n; i++) w.update(0.05, (t += 0.05), { kid: k, under: false, atSea: false, glow: 0 });
    };
    step(20);
    // a stranger close by: it's shy
    expect(w.peek(id)!.act).toBe("shy");
    expect(w.peek(id)!.bonded).toBe(false);
    expect(w.bond(id)).toBe(true);
    const acts = new Set<string>();
    let done: string | null = null;
    let hearts = 0;
    const group = scene.getObjectByName("rideables")!;
    for (let i = 0; i < 160 && !done; i++) {
      step(1);
      acts.add(w.peek(id)!.act!);
      // (no Hop on while they're getting to know each other)
      if (w.bonding() === id) expect(w.nearest(kid)?.id).not.toBe(id);
      const h = group.getObjectByName("rideables:hearts") as THREE.InstancedMesh;
      hearts = Math.max(hearts, h.visible ? h.count : 0);
      done = w.takeBonded();
    }
    expect(done).toBe(id);
    expect(t).toBeLessThan(BOND_STEPS.happy + 2);
    for (const a of ["shy", "sniff", "nuzzle", "happy"]) expect(acts, a).toContain(a);
    expect(hearts).toBeGreaterThan(3);
    expect(w.peek(id)!.bonded).toBe(true);
    // its snout came up to the kid's hand (it shuffled to face them, at a snout's reach)
    const p = w.peek(id)!;
    expect(Math.abs(angleTo(p.yaw, Math.atan2(kid.x - p.x, kid.z - p.z)))).toBeLessThan(0.4);
    // now it's a friend: hop straight on
    step(60);
    expect(w.nearest(kid)?.id).toBe(id);
    // and when the kid stands a little way off, it trots over to them
    const far = V(p.x + Math.sin(p.yaw + 2) * 16, 0, p.z + Math.cos(p.yaw + 2) * 16);
    far.y = groundY(far.x, far.z);
    const d0 = Math.hypot(p.x - far.x, p.z - far.z);
    step(160, far);
    const q = w.peek(id)!;
    expect(Math.hypot(q.x - far.x, q.z - far.z)).toBeLessThan(d0 - 4);
    expect(q.y).toBeCloseTo(groundY(q.x, q.z), 1);
    // remembered friends: a fresh park told about them knows the kid straight away
    const w2 = buildRideables(new THREE.Scene(), {});
    w2.setBonded([id]);
    expect(w2.peek(id)!.bonded).toBe(true);
    w2.dispose();
    w.dispose();
  });

  it("left alone, dragons nap, scratch, chase their tails and look about (and stay home)", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const far = V(500, 0, 500);
    const acts = new Set<string>();
    let t = 0;
    for (let i = 0; i < 2400; i++) {
      w.update(0.1, (t += 0.1), { kid: far, under: false, atSea: false, glow: 0 });
      if (i % 5 === 0) for (const s of RIDEABLE_SPOTS.filter((q) => q.kind === "dragon")) acts.add(w.peek(s.id)!.act!);
    }
    for (const a of ["nap", "scratch", "chase", "stand"]) expect(acts, a).toContain(a);
    for (const s of RIDEABLE_SPOTS.filter((q) => q.kind === "dragon")) {
      const p = w.peek(s.id)!;
      expect(Math.hypot(p.x - s.x, p.z - s.z), s.id).toBeLessThan(3);
    }
    w.dispose();
  });

  it("dragon flight: banks into turns, noses down in a dive, rolls, puffs fire, bursts clouds", () => {
    const scene = new THREE.Scene();
    const fx = createDragonFlight(scene, {});
    const rig = buildMount("dragon", "#ff5fa8", "classic", "skyfin");
    scene.add(rig.root);
    const kidRig = new THREE.Group();
    const pos = V(0, 30, 0);
    fx.start("skyfin");
    const frame = (dYaw: number, climb: number, alt = 20) => fx.apply(0.05, { mount: rig, kidRig, pos, dYaw, alt, climb, moving: true });
    for (let i = 0; i < 40; i++) frame(0.06, 0);
    const bankL = rig.root.rotation.z;
    expect(Math.abs(bankL)).toBeGreaterThan(0.3);
    for (let i = 0; i < 60; i++) frame(-0.06, 0);
    expect(Math.sign(rig.root.rotation.z)).toBe(-Math.sign(bankL));
    // the kid leans forward
    expect(kidRig.rotation.x).toBeGreaterThan(0.2);
    // a dive: nose down, camera pulls back
    for (let i = 0; i < 60; i++) frame(0, -12);
    expect(rig.root.rotation.x).toBeGreaterThan(0.3);
    expect(fx.camBack).toBeGreaterThan(1.25);
    for (let i = 0; i < 60; i++) frame(0, 0);
    expect(fx.camBack).toBeLessThan(1.1);
    // a barrel roll goes all the way round
    expect(fx.trick("roll")).toBe(true);
    let maxRoll = 0;
    for (let i = 0; i < 30; i++) {
      frame(0, 0);
      maxRoll = Math.max(maxRoll, Math.abs(rig.root.rotation.z));
    }
    expect(maxRoll).toBeGreaterThan(Math.PI);
    // a fire puff
    expect(fx.trick("fire")).toBe(true);
    const puffs = scene.getObjectByName("dragon-flight:puffs") as THREE.InstancedMesh;
    for (let i = 0; i < 6; i++) {
      frame(0, 0);
      fx.update(0.05, i * 0.05, { pos, riding: true });
    }
    expect(puffs.visible).toBe(true);
    // fly into a cloud: it bursts
    const c = fx.clouds[0];
    pos.set(c.x, c.y, c.z);
    fx.update(0.05, 1, { pos, riding: true });
    expect(fx.clouds[0].pop).toBeGreaterThan(0);
    // the wings: real beats when climbing (they swing through a big arc), held out when gliding
    const arm = (r: typeof rig) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 40; i++) {
        r.update(0.05, 8, true, 0, 20);
        const b = r.root.getObjectByName("mount-body") as THREE.SkinnedMesh;
        const z = b.skeleton.bones.find((x) => x.children.length && Math.abs(x.position.x) > 0.1 && x.position.y > 0.8)!.rotation.z;
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
      return hi - lo;
    };
    rig.drive!({ mode: "fly", act: "stand", look: 0, flap: 1, dive: 0 });
    const beat = arm(rig);
    rig.drive!({ mode: "fly", act: "stand", look: 0, flap: 0, dive: 0 });
    const glide = arm(rig);
    expect(beat).toBeGreaterThan(0.8);
    expect(glide).toBeLessThan(0.15);
    rig.dispose();
    fx.dispose();
    expect(scene.getObjectByName("dragon-flight")).toBeUndefined();
  });

  it("stays within the draw-call budget wherever the kid is", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const group = scene.getObjectByName("rideables")!;
    let t = 0;
    const probes = [V(0, 0, 0), V(spot("bike-plaza-1").x, 0, spot("bike-plaza-1").z), V(-78, 0, 30), atSea(0.9, 70) as unknown as THREE.Vector3];
    for (const p of probes) {
      const kid = V(p.x, (p as THREE.Vector3).y ?? 0, p.z);
      const sea = seaDepth(kid.x, kid.z) > 1;
      for (let i = 0; i < 600; i++) {
        w.update(0.1, (t += 0.1), { kid, under: false, atSea: sea, glow: 0.5 });
        expect(drawCalls(group)).toBeLessThanOrEqual(25);
      }
    }
    w.dispose();
  });
});

describe("the fleet (boats + subs) budget", () => {
  it("adds at most 6 draw calls wherever the kid is, even driving a sub with its lights on", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const fleet = scene.getObjectByName("fleet")!;
    expect(fleet).toBeTruthy();
    const harbour = spot("ship-harbour");
    const deep = spot("deepsub-rift");
    let t = 0;
    for (const p of [V(harbour.x, 1.2, harbour.z), V(deep.x, -60, deep.z)]) {
      for (let i = 0; i < 40; i++) {
        const driven = { kind: "deepsub" as const, x: p.x, y: p.y, z: p.z, yaw: 0.3, pitch: 0, roll: 0, speed: 8 };
        w.update(0.05, (t += 0.05), { kid: p, under: p.y < 0, atSea: true, glow: 0.8, driven });
        expect(drawCalls(fleet)).toBeLessThanOrEqual(6);
      }
      // a speedboat at full tilt: wake + spray instead of beams
      for (let i = 0; i < 40; i++) {
        const driven = { kind: "speedboat" as const, x: p.x + i * 1.7, y: WATER_Y, z: p.z, yaw: Math.PI / 2, pitch: 0, roll: 0, speed: 34 };
        w.update(0.05, (t += 0.05), { kid: V(driven.x, 0, driven.z), under: false, atSea: true, glow: 0.2, driven });
        expect(drawCalls(fleet)).toBeLessThanOrEqual(6);
      }
    }
    w.dispose();
  });

  it("keeps the triangle count modest", () => {
    let total = 0;
    const per: Record<string, number> = {};
    const count: Record<string, number> = {};
    for (const s of RIDEABLE_SPOTS) if (isCraft(s.kind)) count[s.kind] = (count[s.kind] ?? 0) + 1;
    for (const k of Object.keys(count) as MountKind[]) {
      const g = mountStatueGeometry(k);
      per[k] = g.attributes.position.count / 3;
      total += per[k] * count[k];
      g.dispose();
    }
    console.log("craft triangles", JSON.stringify(per), "all moored:", total);
    expect(per.ship).toBeLessThan(16000);
    for (const k of ["pedalo", "sailboat", "speedboat", "sub", "deepsub"]) expect(per[k], k).toBeLessThan(9000);
  });

  it("updates fast, without allocating, with every craft bobbing", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const h = spot("ship-harbour");
    const kid = V(h.x, 1.2, h.z);
    const driven = { kind: "speedboat" as const, x: h.x + 20, y: WATER_Y, z: h.z + 10, yaw: 1, pitch: 0, roll: 0, speed: 30 };
    let t = 0;
    for (let i = 0; i < 100; i++) w.update(0.016, (t += 0.016), { kid, under: false, atSea: true, glow: 0.5, driven });
    const t0 = performance.now();
    const N = 600;
    for (let i = 0; i < N; i++) {
      driven.x += 0.5;
      w.update(0.016, (t += 0.016), { kid, under: false, atSea: true, glow: 0.5, driven });
    }
    const per = (performance.now() - t0) / N;
    console.log("rideables.update ms/frame (all rides + fleet):", per.toFixed(3));
    // (the whole rideables update - land rides, sea friends and the fleet - in node, no GPU)
    expect(per).toBeLessThan(1.5);
    w.dispose();
  });
});
