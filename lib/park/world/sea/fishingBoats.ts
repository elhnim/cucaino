// Little fishing boats working the seas: colourful wooden trawlers with a cabin, a mast and a
// derrick for the net, buoys and crates of fish, 1-2 crew in yellow oilskins (the shared folk crowd,
// village/crowd.ts) — streamed in only once a boat comes near the kid, like world/trade/index.ts's
// carts and barge (same split: fishingBoatsPlan.ts's pure fishingBoatStateAtTime() says where every
// boat is and what it's doing; this module turns that into instanced meshes, a kid push-out via
// seaBodies(), and a chat line when the kid's close).
//
// Draw calls: hull+cabin+mast+derrick+buoys+crates merged into one instanced mesh, one net-bag mesh
// (shown only for boats mid-haul), the shared crowd's five (bodies/heads/limbs/wings/tools) and one
// gull-body mesh (its wings share the crowd's own wing mesh) — eight, inside the ~8 budget.
import * as THREE from "three";
import { box, ball, cyl, flat, lump, gem, mergeAll, place, pp } from "../village/kit";
import { hull as loftHull } from "../../characters/boats";
import { fxMaterial, makeUniforms, type FantasyUniforms } from "../fantasy/shaders";
import { buildCrowd, folkInstance, resolveRig, makeRig, type Anim, type Crowd, type FolkMeshHandle, type Pose, type Rig, type Tool } from "../village/crowd";
import { buildGull, WING_GULL } from "../village/folk";
import { hullTilt, type SeaBody, type Tilt } from "../rideables/craft";
import { WATER_Y } from "../../registry/terrain";
import { FISHING_BOATS, HOUR_SECONDS, fishingBoatStateAtTime, fishingBoatLine, type FishingBoatDef, type FishingBoatState } from "./fishingBoatsPlan";

export interface FishingTalk {
  id: string;
  name: string;
  line: string;
  emoji: string;
}
export interface FishingBoatsSystem {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number }): { talk: FishingTalk | null };
  /** everything afloat a boat (the kid's own) mustn't sail through: refreshed every update(), read-only */
  seaBodies(): readonly SeaBody[];
  dispose(): void;
}

/** built once any boat comes within this of the kid; torn down past this */
const BUILD_R = 420;
const DISPOSE_R = 520;
const TALK_R = 6;
const WAVE_R = 8;
/** fishing boats near the kid's own boat give way: pause (same trick world/trade/index.ts uses for
 *  a cart stood in the kid's way on the road) while it's close ahead on their path */
const GIVE_WAY_R = 7;
const N = FISHING_BOATS.length;
/** a few boats, picked once, get a couple of gulls wheeling round them while they're out fishing */
const GULL_BOATS = FISHING_BOATS.filter((_, i) => i % 4 === 0).map((d) => d.id);
const GULL_CAP = GULL_BOATS.length * 2;

/** the boat's own length/beam (m) — lofted below, not boxed, so these are no longer wall thicknesses
 *  to get right, just the overall size (matches what the old boxed hull used, for seaBodies() etc.) */
const BOAT_LEN = 7.0;
const BOAT_BEAM = 2.5;
const HULL_HL = BOAT_LEN / 2;
const HULL_HW = BOAT_BEAM / 2;
/** the deck's height (boat-local y, 0 at the waterline) — well below the gunwale (which itself
 *  rises from the stern towards the bow, following the hull's own sheer line), so the crew plainly
 *  stand inside a real curved hull, not on top of a box */
const FLOOR_Y = 0.3;
const CABIN_Y = FLOOR_Y + 0.5;
const MAST_BASE_Y = FLOOR_Y + 0.04;
/** local (boat frame, bow +z — hull()'s own convention, u=0 stern / u=1 bow): the derrick's tip (net
 *  hauled up) and where the net hangs when let out, close to the water on the working side */
const NET_UP = { x: 1.6, y: 2.75, z: -0.3 };
const NET_DOWN = { x: 1.85, y: 0.25, z: -0.2 };
/** a plain white placeholder, swapped per-instance for the fleet's candy colours — it marks the
 *  stripe band below so buildHullGeometry() knows which loftHull() part to tint (aFx.x = 1) */
const STRIPE_WHITE = "#ffffff";

/** a cheerful little wooden trawler, properly LOFTED (characters/boats.ts's hull() — the very same
 *  cross-section math the harbour's Candy Sailboat and Rocket Boat are built from, just unskinned
 *  and instanced here): wide amidships, a sheer line rising to a hull that's genuinely narrow and
 *  raised at the bow — a real point from every angle, not a boxed step — a flatter, rounded transom
 *  at the stern, banded bilge/candy-stripe/topsides by height, a rounded gunwale rail, and a floor
 *  that follows the hull's own curve inward (so the crew stand behind real curved sides, not on a
 *  slab). A wheelhouse cabin with warm little windows that glow at night sits aft of that, with a
 *  mast carrying a pennant and a lantern that glows at night too (fantasy/shaders.ts's fx glow
 *  channel — the same trick the village's lanterns and the lighthouse's lantern room use), and a
 *  short derrick out to starboard for the net. Only the stripe band and the cabin walls take the
 *  boat's own instance colour (a night-fisher's lantern-warm tint, or one of the fleet's candy
 *  hull colours) — everything else keeps its own fixed colour. */
function buildHullGeometry(): THREE.BufferGeometry {
  const BILGE = "#8a6a46";
  const HULL = "#f4efe2";
  const RAIL = "#6b4a30";
  const INNER = "#c9924f";
  const DECK = "#c9924f";
  const CABIN = "#f4efe2";
  const ROOF = "#3a6ea5";
  const WINDOW = "#fff3c4";
  const MAST = "#5e3f22";
  const METAL = "#4a4440";
  const CRATE = "#8a6238";
  const BOARD = "#2a2638";
  const LANTERN_GLASS = "#fff6c0";
  const FLAG = "#ff5fa8";
  // a boat's own candy colour (set per-instance) tints the stripe + cabin walls — aFx.x = 1 turns
  // that tinting on for a vertex (see fantasy/shaders.ts's fxPatch); everything else keeps its own
  // fixed colour regardless (aFx.x = 0, the pp() default)
  const TINT: [number, number, number] = [1, 0, 0];
  /** warm emissive glow (0..1 by day, up to this at night via uGlowK) — same channel + convention
   *  the lighthouse's lantern room and the village's lit windows use (world/village/props.ts) */
  const glow = (k: number): [number, number, number] => [0, 0, k];
  const parts: THREE.BufferGeometry[] = [];

  // ── the hull itself: lofted cross-sections, u = 0 stern .. 1 bow ──
  // width: full and rounded amidships-to-stern (a flat-ish transom, width(0) > 0), tapering all the
  // way to a true point at the bow. sheer: the gunwale rises well above the stern towards the bow —
  // a proper raised prow, true from every angle since it's real geometry, not a flat illusion.
  const hullParts = loftHull({
    len: BOAT_LEN,
    beam: BOAT_BEAM,
    n: 2.0,
    NU: 16,
    NV: 10,
    width: (u) => Math.min(1, Math.pow(1 - u, 0.6) * (0.76 + 0.34 * Math.sin(Math.PI * Math.min(1, u * 1.3)))),
    sheer: (u) => 0.58 + 1.05 * u * u,
    keel: (u) => 0.55 * (1 - Math.pow(u, 3)) + 0.12,
    bands: [
      [0.16, STRIPE_WHITE],
      [0.84, HULL],
      [1, BILGE],
    ],
    inner: INNER,
    rail: RAIL,
    railR: 0.07,
    floorY: FLOOR_Y,
    floor: DECK,
  });
  for (const part of hullParts) parts.push(pp(part.g, part.c, part.c === STRIPE_WHITE ? TINT : [0, 0, 0]));

  // a little painted name-board on the transom
  parts.push(pp(box(0.8, 0.18, 0.03, 0, 0.5, -HULL_HL - 0.04), BOARD));

  // the wheelhouse cabin, aft, with a few little windows that glow warm at night
  parts.push(pp(box(1.4, 1.0, 1.5, 0, CABIN_Y, -HULL_HL + 1.15), CABIN, TINT));
  parts.push(pp(box(1.5, 0.1, 1.65, 0, CABIN_Y + 0.52, -HULL_HL + 1.15), ROOF));
  for (const [wx, wz] of [
    [-0.71, -HULL_HL + 0.65],
    [-0.71, -HULL_HL + 1.6],
    [0.71, -HULL_HL + 0.65],
    [0.71, -HULL_HL + 1.6],
  ])
    parts.push(pp(box(0.03, 0.26, 0.32, wx, CABIN_Y + 0.02, wz), WINDOW, glow(1.1)));

  // the mast amidships, a little striped pennant, and a lantern that glows at night
  const mastH = 2.3;
  parts.push(pp(cyl(0.07, 0.09, mastH, 6, 0, MAST_BASE_Y, 0.1), MAST));
  const flag = flat([
    [0, 0],
    [0.32, 0.09],
    [0, 0.18],
  ]);
  flag.rotateY(Math.PI / 2);
  parts.push(pp(place(flag, 0.04, MAST_BASE_Y + mastH - 0.25, 0.1), FLAG));
  parts.push(pp(ball(0.1, 0, MAST_BASE_Y + 0.32, 0.1), LANTERN_GLASS, glow(1.6)));
  // a short horizontal derrick out to starboard for the net
  parts.push(pp(box(1.6, 0.08, 0.08, NET_UP.x - 0.06, NET_UP.y + 0.15, NET_UP.z), METAL));

  // a couple of buoys hung along the gunwale, and crates of fish on deck
  for (const [sx, sz, c] of [
    [-1.0, -1.5, "#e8475e"],
    [-1.0, 0.3, "#ffffff"],
    [0.98, -0.9, "#ffffff"],
  ] as const)
    parts.push(pp(ball(0.19, sx, 0.75, sz), c));
  for (const [cx, cz] of [
    [-0.4, 0.5],
    [0.4, 0.5],
    [0, 0.95],
  ])
    parts.push(pp(box(0.42, 0.4, 0.42, cx, FLOOR_Y + 0.22, cz), CRATE));
  return mergeAll(parts);
}

/** the hauled net: a proper net-coloured, bigger bag of the catch with a few flashing fish, and a
 *  couple of floats trailing just behind it on the line — lifted to the derrick's tip when hauled,
 *  or let out just above the water */
function buildNetGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(lump(0.5, 0, -0.12, 0, 7, 1, 1.1, 1, 0.3), "#8a7452"));
  for (const [fx, fy, fz, c] of [
    [0.2, -0.08, 0.12, "#bfe3ff"],
    [-0.18, -0.2, -0.08, "#9fd6ef"],
    [0.04, -0.3, -0.2, "#e8f4ff"],
  ] as const)
    parts.push(pp(gem(0.12, fx, fy, fz, 1, 1.4, 1), c));
  // a couple of floats, trailing a little behind and below the bag (on their own line)
  for (const [bx, bz] of [
    [-0.26, -0.42],
    [0.28, -0.4],
  ])
    parts.push(pp(ball(0.13, bx, -0.34, bz), "#ff8a3d"));
  return mergeAll(parts);
}

// ── the crew: the shared folk crowd, in yellow oilskins and hats ──
const CREW_PALETTE = {
  skins: ["#e0b088", "#c99468", "#f0cda0", "#a97b52", "#dcbb8e"],
  hairs: ["#2f2416", "#5a3a22", "#1f1a12", "#6e4a2a", "#3a2a18"],
  cloths: ["#ffd23f", "#ffb627", "#f2a33c"],
};
interface Look {
  skin: THREE.Color;
  hair: THREE.Color;
  cloth: THREE.Color;
  hairStyle: number;
  body: number;
}
function seedOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function lookFor(seed: number): Look {
  return {
    skin: new THREE.Color(CREW_PALETTE.skins[seed % CREW_PALETTE.skins.length]),
    hair: new THREE.Color(CREW_PALETTE.hairs[(seed * 3 + 1) % CREW_PALETTE.hairs.length]),
    cloth: new THREE.Color(CREW_PALETTE.cloths[(seed * 5 + 2) % CREW_PALETTE.cloths.length]),
    hairStyle: seed % 3,
    body: (seed + 1) % 4,
  };
}
const CREW_LOOK = new Map<string, [Look, Look]>(FISHING_BOATS.map((d) => [d.id, [lookFor(seedOf(d.id)), lookFor(seedOf(d.id) + 11)]]));

/** a boat's own candy hull colour (cycled over the fleet) — night-fishers get a warm lantern tint
 *  instead, so they read as lit up even by day */
const HULL_COLORS = ["#ff8a8a", "#7fb8ff", "#8fe0a0", "#ffd25c", "#c9a0ff", "#ff9ecb"].map((c) => new THREE.Color(c));
const LANTERN_COLOR = new THREE.Color("#ffdf9e");
const GULL_WHITE = new THREE.Color("#ffffff");
function hullColorOf(def: FishingBoatDef): THREE.Color {
  return def.night ? LANTERN_COLOR : HULL_COLORS[seedOf(def.id) % HULL_COLORS.length];
}

interface Built {
  group: THREE.Group;
  hullMesh: THREE.InstancedMesh;
  netMesh: THREE.InstancedMesh;
  hullMat: THREE.Material;
  netMat: THREE.Material;
  hullU: FantasyUniforms;
  netU: FantasyUniforms;
  crowd: Crowd;
  gulls: FolkMeshHandle;
}

function buildOnce(scene: THREE.Scene): Built {
  const group = new THREE.Group();
  group.name = "fishing-boats";
  scene.add(group);
  const hullU = makeUniforms();
  const netU = makeUniforms();
  const hullMat = fxMaterial(hullU, { roughness: 0.82, metalness: 0, flatShading: true });
  const netMat = fxMaterial(netU, { roughness: 0.9, metalness: 0, flatShading: true });
  const hullMesh = new THREE.InstancedMesh(buildHullGeometry(), hullMat, Math.max(1, N));
  const netMesh = new THREE.InstancedMesh(buildNetGeometry(), netMat, Math.max(1, N));
  for (const m of [hullMesh, netMesh]) {
    m.name = "fishing-" + m.id;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.count = 0;
    // (every instance is placed far from the mesh's own local origin — see trade/index.ts's same note)
    m.frustumCulled = false;
    group.add(m);
  }
  // (the crew never have wings of their own — wings:true just so the mesh exists, sized for the gulls)
  const crowd = buildCrowd(group, Math.max(1, N * 2), { wings: true, wingCapacity: Math.max(1, GULL_CAP), name: "fishing-crew" });
  const gulls = folkInstance(group, crowd.folkMat, crowd.depthMat, buildGull(), Math.max(1, GULL_CAP), { name: "fishing-gulls", lowQuality: false });
  return { group, hullMesh, netMesh, hullMat, netMat, hullU, netU, crowd, gulls };
}
function disposeBuilt(b: Built) {
  b.group.parent?.remove(b.group);
  for (const m of [b.hullMesh, b.netMesh]) {
    m.geometry.dispose();
    m.dispose();
  }
  b.gulls.dispose();
  b.crowd.dispose();
  b.hullMat.dispose();
  b.netMat.dispose();
}

export function buildFishingBoats(scene: THREE.Scene): FishingBoatsSystem {
  let built: Built | null = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3(1, 1, 1);
  const tilt: Tilt = { pitch: 0, roll: 0, y: 0 };
  const rig: Rig = makeRig();
  const pose: Pose = { anim: "stand", cycle: 0, gait: 0, wave: 0, look: 0, tool: "none", hidden: false };
  /** give-way: how long each boat's effective time has been held back by the kid's own boat sitting
   *  close ahead on its path (outbound/inbound only — same trick as world/trade/index.ts's carts) */
  const pausedHours = new Map<string, number>();
  const bodies: SeaBody[] = [];
  for (let i = 0; i < N; i++) bodies.push({ x: 0, z: 0, r: HULL_HW, hl: HULL_HL - HULL_HW, yaw: 0 });
  let bodyCount = 0;
  const wE = new THREE.Euler(0, 0, 0, "YXZ");
  const wM = new THREE.Matrix4();

  function place3(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, pitch: number, yaw: number, roll: number, scale = 1) {
    e.set(pitch, yaw, roll, "YXZ");
    m4.compose(vp.set(x, y, z), q.setFromEuler(e), scale === 1 ? vs : vs.set(scale, scale, scale));
    mesh.setMatrixAt(i, m4);
  }
  function worldOf(ox: number, oy: number, oz: number, yaw: number, lx: number, ly: number, lz: number): [number, number, number] {
    return [ox + Math.sin(yaw) * lz + Math.cos(yaw) * lx, oy + ly, oz + Math.cos(yaw) * lz - Math.sin(yaw) * lx];
  }
  function placeCrew(b: Built, t: number, x: number, y: number, z: number, yaw: number, look: Look, anim: Anim, tool: Tool, seed: number, kid: THREE.Vector3, cycle = 0, gait = 0) {
    const d = Math.hypot(x - kid.x, z - kid.z);
    pose.anim = anim;
    pose.cycle = cycle;
    pose.gait = gait;
    pose.wave = Math.max(0, Math.min(1, (WAVE_R - d) / 3));
    pose.look = pose.wave > 0.3 ? 1 : 0;
    pose.tool = tool;
    pose.hidden = false;
    resolveRig(pose, seed, false, t, rig);
    b.crowd.place({ x, y, z, yaw, scale: 1, anim, rig, bodyVariant: look.body, hairStyle: look.hairStyle, cloth: look.cloth, skin: look.skin, hair: look.hair, tool });
  }

  return {
    update(dt, t, o) {
      const kid = o.kid;
      // ── every boat's own pure state (cheap: ~12 function calls, always kept current so
      // seaBodies() is right even far from the kid, where nothing is drawn) ──
      bodyCount = 0;
      let nearest = Infinity;
      let talk: FishingTalk | null = null;
      const states: { def: FishingBoatDef; s: FishingBoatState }[] = [];
      for (const def of FISHING_BOATS) {
        const paused = pausedHours.get(def.id) ?? 0;
        let s = fishingBoatStateAtTime(def, t - paused * HOUR_SECONDS);
        if (s.phase === "outbound" || s.phase === "inbound") {
          const d = Math.hypot(s.x - kid.x, s.z - kid.z);
          if (d < GIVE_WAY_R) {
            pausedHours.set(def.id, paused + dt / HOUR_SECONDS);
            s = fishingBoatStateAtTime(def, t - (paused + dt / HOUR_SECONDS) * HOUR_SECONDS);
          }
        }
        states.push({ def, s });
        const d = Math.hypot(s.x - kid.x, s.z - kid.z);
        if (d < nearest) nearest = d;
        if (d < 150) {
          const body = bodies[bodyCount++];
          body.x = s.x;
          body.z = s.z;
          body.yaw = s.yaw;
        }
        if (!talk && d < TALK_R) {
          const which = Math.floor(t / 5) % 2 === 0 ? 0 : 1;
          talk = { id: def.id, name: def.name, line: fishingBoatLine(def, s, which), emoji: "🐟" };
        }
      }

      if (!built && nearest < BUILD_R) built = buildOnce(scene);
      else if (built && nearest > DISPOSE_R) {
        disposeBuilt(built);
        built = null;
        pausedHours.clear();
      }
      if (!built) return { talk };
      const b = built;
      b.hullU.uTime.value = t;
      b.hullU.uGlowK.value = 0.1 + o.glow * 1.2;
      b.netU.uTime.value = t;
      b.netU.uGlowK.value = 0.1 + o.glow * 1.2;
      b.crowd.glow.uGlowK.value = 0.12 + o.glow * 1.2;

      let hullI = 0;
      let netI = 0;
      b.crowd.begin();
      const gullSeeds = GULL_BOATS;
      let gullI = 0;

      for (const { def, s } of states) {
        if (Math.hypot(s.x - kid.x, s.z - kid.z) > BUILD_R + 40) continue;
        const far = Math.abs(kid.x - s.x) + Math.abs(kid.z - s.z) > 240;
        if (far) {
          tilt.y = WATER_Y;
          tilt.pitch = tilt.roll = 0;
        } else hullTilt(s.x, s.z, s.yaw, HULL_HL * 2, HULL_HW * 2, t, tilt);
        const y = tilt.y + Math.sin(t * 1.1 + seedOf(def.id)) * 0.03;
        place3(b.hullMesh, hullI, s.x, y, s.z, tilt.pitch, s.yaw, tilt.roll);
        b.hullMesh.setColorAt(hullI, hullColorOf(def));
        hullI++;

        // the net: hauled up to the derrick, or let out just above the water
        const lift = s.haulLift;
        const lx = NET_DOWN.x + (NET_UP.x - NET_DOWN.x) * lift;
        const ly = NET_DOWN.y + (NET_UP.y - NET_DOWN.y) * lift;
        const lz = NET_DOWN.z + (NET_UP.z - NET_DOWN.z) * lift;
        const [nx, ny, nz] = worldOf(s.x, y, s.z, s.yaw, lx, ly, lz);
        // a little flapping swing on the line — stronger while it's up being hauled
        const flap = Math.sin(t * 5 + seedOf(def.id)) * 0.22 * lift;
        place3(b.netMesh, netI, nx, ny + Math.sin(t * 2 + seedOf(def.id)) * 0.03, nz, 0, s.yaw + flap, flap * 0.6, 1 + lift * 0.3);
        netI++;

        // crew: a hand by the wheelhouse, and a hauler by the derrick when there's a net to mind —
        // both standing right on the floor (FLOOR_Y), behind the hull's own curved sides
        const look = CREW_LOOK.get(def.id)!;
        const [hx, hy, hz] = worldOf(s.x, y, s.z, s.yaw, -0.45, FLOOR_Y, -HULL_HL + 1.75);
        placeCrew(b, t, hx, hy, hz, s.yaw, look[0], s.phase === "fishing" ? "look" : "stand", "none", def.crewSeed, kid);
        const [wx, wy, wz] = worldOf(s.x, y, s.z, s.yaw, 0.7, FLOOR_Y, -0.1);
        placeCrew(b, t, wx, wy, wz, s.yaw + Math.PI * 0.5, look[1], s.phase === "fishing" && s.hauling ? "nets" : s.phase === "fishing" ? "look" : "stand", "none", def.crewSeed + 1, kid);

        // a couple of gulls wheeling round a handful of boats while they fish
        if (s.phase === "fishing" && gullSeeds.includes(def.id)) {
          const gy = y + 3 + Math.sin(t * 0.4 + def.crewSeed) * 0.8;
          const R = 5 + (def.crewSeed % 3);
          for (let k = 0; k < 2 && gullI < GULL_CAP; k++) {
            const a = t * (0.5 + k * 0.12) + def.crewSeed * 1.7 + k * Math.PI;
            const gx = s.x + Math.sin(a) * R;
            const gz = s.z + Math.cos(a) * R;
            const gyaw = a + Math.PI / 2;
            e.set(0, gyaw, Math.sin(t * 3 + k) * 0.2, "YXZ");
            m4.compose(vp.set(gx, gy, gz), q.setFromEuler(e), vs.set(0.9, 0.9, 0.9));
            b.gulls.m.setMatrixAt(gullI, m4);
            b.gulls.m.setColorAt(gullI, GULL_WHITE);
            b.gulls.sel.setX(gullI, -1);
            const flap = Math.sin(t * 9 + gullI) * 0.5;
            for (let sd = 1; sd >= -1; sd -= 2) {
              wE.set(0, sd * flap, sd * 0.3);
              wM.compose(vp.set(gx + Math.sin(gyaw) * 0.1 * sd, gy + 0.06, gz + Math.cos(gyaw) * 0.1 * sd), q.setFromEuler(wE), vs.set(sd, 1, 1));
              b.crowd.extraWing(wM, GULL_WHITE, WING_GULL);
            }
            gullI++;
          }
        }
      }
      b.hullMesh.count = hullI;
      b.netMesh.count = netI;
      b.hullMesh.instanceMatrix.needsUpdate = true;
      b.netMesh.instanceMatrix.needsUpdate = true;
      if (b.hullMesh.instanceColor) b.hullMesh.instanceColor.needsUpdate = true;
      b.gulls.m.count = gullI;
      b.gulls.m.instanceMatrix.needsUpdate = true;
      if (b.gulls.m.instanceColor) b.gulls.m.instanceColor.needsUpdate = true;
      b.gulls.sel.needsUpdate = true;
      b.crowd.end();
      return { talk };
    },
    seaBodies() {
      return bodies.slice(0, bodyCount);
    },
    dispose() {
      if (built) disposeBuilt(built);
      built = null;
    },
  };
}
