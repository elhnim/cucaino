// Travelling traders in 3D: little carts (a woolly candy beast pulling a canopied cart of goods)
// and a trading sailboat, streamed in only once a trader comes near the kid (nothing is built at
// the park spawn, far from every post). Positions come straight from plan.ts's pure
// traderStateAtTime() — this module turns that into instanced meshes, a kid push-out, and a chat
// line when the kid is close. The folk riding/walking/selling are the SAME shared crowd rig
// Lakeside's and Coralcove's villagers use (village/crowd.ts) — true size, posed, waving when the
// kid's near — just with their own clan's palette (or a candy one, for Market Street's own folk).
// Train riders are a separate, small addition (the train's own run is stateful, not a pure
// function of time, so its riders are read off the live Railway handle each frame instead).
//
// Draw calls: one merged cart mesh, one merged boat mesh, one crate mesh (re-coloured per cargo
// good) and the shared crowd's five (bodies/heads/limbs/wings/tools) — eight, inside the ~10 budget.
import * as THREE from "three";
import { box, ball, col, cone, cyl, flat, mergeAll, place, pp } from "../village/kit";
import { fxMaterial, makeUniforms, type FantasyUniforms } from "../fantasy/shaders";
import { groundY, WATER_Y } from "../../registry/terrain";
import { TRADE_POSTS, TRADE_ROUTES, tradePostOf, goodOf } from "../../registry/trade";
import { TRADERS, traderStateAtTime, traderLine, TRAIN_TRADERS, trainTraderStateAtTime, trainTraderLine, trainTraderRiding, type TraderDef } from "./plan";
import { STATIONS, RAIL_LENGTH, type Station } from "../../registry/railway";
import { buildCrowd, makeRig, resolveRig, type Anim, type Crowd, type Pose, type Rig, type Tool } from "../village/crowd";
import { SKINS as TIDEWING_SKINS, HAIRS as TIDEWING_HAIRS, CLOTHS as TIDEWING_CLOTHS, WINGS as TIDEWING_WINGS } from "../village/routine";

export interface TradeTalk {
  id: string;
  name: string;
  line: string;
  emoji: string;
}
export interface TrainInfo {
  /** the station the train is standing at (null while it's running) */
  at: Station | null;
  /** where it is along the loop right now */
  s: number;
  /** car i's world transform (0 = the engine) — same as Railway.carPose */
  carPose(i: number, out: { x: number; y: number; z: number; yaw: number }): void;
}
export interface TradeSystem {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour: number; train: TrainInfo }): { talk: TradeTalk | null };
  /** push the kid out from under a cart/animal, like fauna.pushKid */
  pushKid(pos: THREE.Vector3, kidR: number, kidY: number): void;
  dispose(): void;
}

/** built once any trader (or post) comes within this of the kid; torn down past this */
const BUILD_R = 400;
const DISPOSE_R = 500;
const TALK_R = 4;
/** folk wave at the kid once this close (fading in over the last couple of metres) */
const WAVE_R = 6;
const CART_TRADERS = TRADERS.filter((d) => d.mode === "cart");
const BOAT_TRADERS = TRADERS.filter((d) => d.mode === "boat");
const CART_CAP = CART_TRADERS.length;
const BOAT_CAP = BOAT_TRADERS.length;
/** 2 crates per travelling trader (cart bed / boat deck), plus a little stall stack (2) per post */
const CRATE_CAP = TRADERS.length * 2 + TRADE_POSTS.length * 2;
/** the shared crowd: a driver + a walking escort per cart, 2 crew per boat, a seller per post, one
 *  walker per train-riding trader, up to 3 riding the train itself */
const CROWD_CAP = CART_TRADERS.length * 2 + BOAT_TRADERS.length * 2 + TRADE_POSTS.length + TRAIN_TRADERS.length + 3;

// ── every stretch of track a "train" route's two posts sit either side of (registry/cartRoad.ts's
// Park<->Lake arc, generalised to any pair of posts with a station — a new settlement joins just by
// listing a `train` TRADE_ROUTE, nothing here needs to change) — the ambient riders in the first
// carriage show while the train is actually running any one of these arcs ──
function stationSOf(postId: string): number {
  const post = tradePostOf(postId);
  const st = post?.stationId ? STATIONS.find((s) => s.id === post.stationId) : undefined;
  if (!st) throw new Error(`trade: post ${postId} has no station for a train route`);
  return st.s;
}
const TRAIN_ARCS: [number, number][] = TRADE_ROUTES.filter((r) => r.mode === "train").map((r) => [stationSOf(r.from), stationSOf(r.to)]);
/** is `s` on the shorter arc of the loop between sA and sB (wrap-aware) */
function onArc(sA: number, sB: number, s: number): boolean {
  const lo = Math.min(sA, sB);
  const hi = Math.max(sA, sB);
  const direct = hi - lo;
  if (direct <= RAIL_LENGTH - direct) return s >= lo && s <= hi;
  return s >= hi || s <= lo; // the short way wraps past the loop's own start
}
const onAnyTrainArc = (s: number) => TRAIN_ARCS.some(([sA, sB]) => onArc(sA, sB, s));

/** every good's colour, as a THREE.Color made once (the crate mesh just re-sets these, no
 *  allocation per frame) */
const GOOD_COLOR = new Map<string, THREE.Color>();
function colorOf(goodId: string): THREE.Color {
  let c = GOOD_COLOR.get(goodId);
  if (!c) {
    c = new THREE.Color(goodOf(goodId).color);
    GOOD_COLOR.set(goodId, c);
  }
  return c;
}

// ── geometry: a cart (deck, wheels, a striped canopy, a woolly candy beast with a harness bell) ──
function buildCartGeometry(): THREE.BufferGeometry {
  const WOOD = "#8a6238";
  const WOOD_D = "#5e3f22";
  const METAL = "#4a4440";
  const BEAST = "#f3d6e0";
  const BEAST_D = "#e3b6c8";
  const AWNING_A = "#fdf6ea";
  const AWNING_B = "#e8536b";
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(box(1.7, 0.46, 1.3, 0, 0.58, -0.05), WOOD));
  parts.push(pp(box(1.78, 0.12, 1.36, 0, 0.84, -0.05), WOOD_D));
  for (const side of [-1, 1]) parts.push(pp(place(cyl(0.4, 0.4, 0.16, 10), side * 0.86, 0.42, -0.05, 0, 1, 0, Math.PI / 2), METAL));
  parts.push(pp(box(0.08, 0.08, 1.0, 0, 0.62, 0.85), WOOD_D));
  // a little striped canopy over the driver's seat — every cart's own candy awning
  for (const [cx, cz] of [
    [0.78, -0.55],
    [-0.78, -0.55],
    [0.78, 0.5],
    [-0.78, 0.5],
  ])
    parts.push(pp(cyl(0.035, 0.035, 0.68, 6, cx, 1.18, cz), WOOD_D));
  parts.push(pp(box(1.85, 0.08, 1.5, 0, 1.56, -0.05), AWNING_A));
  for (const k of [-0.55, 0, 0.55]) parts.push(pp(box(1.85, 0.085, 0.3, 0, 1.565, -0.05 + k), AWNING_B));
  // the beast: a stocky, woolly candy-pastel quadruped, true-size-ish beside a 2.26 m kid
  const by = 0.95;
  parts.push(pp(box(0.6, 0.55, 1.05, 0, by, 1.85), BEAST));
  parts.push(pp(box(0.3, 0.4, 0.4, 0, by + 0.55, 2.45), BEAST));
  parts.push(pp(box(0.22, 0.2, 0.22, 0, by + 0.8, 2.66), BEAST_D));
  for (const [sx, sz] of [
    [0.22, 1.45],
    [-0.22, 1.45],
    [0.22, 2.2],
    [-0.22, 2.2],
  ])
    parts.push(pp(cyl(0.09, 0.09, 0.72, 6, sx, by - 0.65, sz), BEAST_D));
  for (const sx of [-0.14, 0.14]) parts.push(pp(cone(0.1, 0.22, 5, sx, by + 0.95, 2.56), BEAST_D));
  parts.push(pp(cone(0.09, 0.3, 5, 0, by + 0.1, 1.35), BEAST_D));
  // a harness strap over the back and a little bell at the chest
  parts.push(pp(box(0.5, 0.06, 0.12, 0, by + 0.33, 2.0), "#4a2f1a"));
  parts.push(pp(box(0.12, 0.3, 0.06, 0, by + 0.1, 1.3), "#4a2f1a"));
  parts.push(pp(ball(0.055, 0, by - 0.08, 2.18), "#e8c84a"));
  return mergeAll(parts);
}
/** where the driver sits (local to the cart, before yaw/position) */
const CART_SEAT = { x: 0, y: 1.02, z: -0.25 };
/** where a walking escort keeps pace, beside the cart */
const CART_ESCORT = { x: 0.95, y: 0, z: -1.1 };
/** the goods on the bed, behind the driver */
const CART_CRATES: { x: number; y: number; z: number }[] = [
  { x: -0.4, y: 0.95, z: 0.35 },
  { x: 0.4, y: 0.95, z: 0.6 },
];

// ── geometry: a cheerful little trading sailboat (striped sail, hull stripe, deck goods) ──
function buildBoatGeometry(): THREE.BufferGeometry {
  const HULL = "#c98a48";
  const HULL_D = "#8a5a36";
  const STRIPE = "#ff5fa8";
  const DECK = "#f0d9a8";
  const MAST = "#5e3f22";
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(box(1.3, 0.55, 3.8, 0, 0.32, 0), HULL));
  parts.push(pp(box(1.34, 0.12, 3.5, 0, 0.44, 0), STRIPE));
  parts.push(pp(place(box(1.3, 0.55, 1.1, 0, 0, 0), 0, 0.32, 2.2, 0, new THREE.Vector3(0.3, 1, 1)), HULL_D));
  parts.push(pp(place(box(1.3, 0.55, 1.1, 0, 0, 0), 0, 0.32, -2.2, 0, new THREE.Vector3(0.3, 1, 1)), HULL_D));
  parts.push(pp(box(1.2, 0.06, 3.4, 0, 0.62, 0), DECK));
  parts.push(pp(cyl(0.055, 0.08, 3.3, 6, 0, 0.62 + 1.65, 0.3), MAST));
  // a candy-striped sail: one flat quad, painted in horizontal bands by its own local height
  const sail = flat([
    [0, 0],
    [0.95, 1.15],
    [0.65, 2.75],
    [-0.1, 2.15],
  ]);
  sail.rotateY(Math.PI / 2);
  const BAND_A = col("#ffffff");
  const BAND_B = col(STRIPE);
  parts.push(pp(place(sail, 0.03, 1.35, 0.3), (p) => (Math.floor(p.y / 0.42) % 2 ? BAND_B : BAND_A)));
  // a little pennant at the masthead
  const flag = flat([
    [0, 0],
    [0.34, 0.09],
    [0, 0.18],
  ]);
  flag.rotateY(Math.PI / 2);
  parts.push(pp(place(flag, 0.04, 2.95, 0.3), "#ffe36b"));
  return mergeAll(parts);
}
/** the two crew seats (bow and stern) */
const BOAT_SEATS: { x: number; y: number; z: number }[] = [
  { x: 0, y: 0.78, z: -1.55 },
  { x: 0, y: 0.78, z: 1.2 },
];
const BOAT_CRATES: { x: number; y: number; z: number }[] = [
  { x: -0.32, y: 0.82, z: -0.1 },
  { x: 0.32, y: 0.82, z: 0.35 },
];

/** a plain crate (no fx/wind-sway — its colour is the whole point, set per instance) */
function buildCrateGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.42, 0.36, 0.42);
}

// ── folk: the shared crowd rig, in each home post's own palette (or a candy one for Market
// Street, which isn't a settlement clan) ──
interface Palette {
  skins: string[];
  hairs: string[];
  cloths: string[];
  wings?: string[];
}
// Lakeside's Reedling Folk — kept in step with world/settlements/index.ts's own SKINS/HAIRS/CLOTHS
// (a small, deliberate duplication: that file's palette is local to it, and importing across for
// three short arrays isn't worth a shared-module detour)
const LAKESIDE_PALETTE: Palette = {
  skins: ["#d9b98a", "#c9a476", "#e8caa0", "#b88c5e", "#f0d6ab", "#a97b52", "#dcbb8e"],
  hairs: ["#5a3a22", "#2f2416", "#8a5a2c", "#1f1a12", "#6e4a2a", "#3a2a18", "#4a3420", "#7a5633"],
  cloths: ["#2a9d8f", "#3a6ea5", "#4a8f3c", "#e8893c", "#1f7a8c", "#5e9c4a", "#d9a441"],
};
const CORALCOVE_PALETTE: Palette = { skins: TIDEWING_SKINS, hairs: TIDEWING_HAIRS, cloths: TIDEWING_CLOTHS, wings: TIDEWING_WINGS };
// Market Street's own folk aren't a settlement clan — a bright candy-park palette instead
const MARKET_PALETTE: Palette = {
  skins: ["#ffd9c2", "#f4b8a0", "#e8dcc8", "#ffcaaf", "#f2c9a0"],
  hairs: ["#ff8a3d", "#6a4fd6", "#2fb5a0", "#e85a8a", "#3a8fd9"],
  cloths: ["#ff6fa5", "#5ec8e8", "#ffd24a", "#8a6fe8", "#5ecb7a"],
};
// the Canopy Folk and the Peakfolk — kept in step with world/settlements/index.ts's own palettes
// (the same small, deliberate duplication as Lakeside's, above)
const TREETOP_PALETTE: Palette = {
  skins: ["#c9955f", "#b87f49", "#d9ab7a", "#a06a3a", "#e0bd8e", "#8c5a34", "#cf9c68"],
  hairs: ["#2a1f14", "#3a2818", "#1a140e", "#4a3420", "#241a10", "#352619", "#1e1610", "#4a3020"],
  cloths: ["#3f8a3f", "#ff8a3c", "#e03c8a", "#e8c23c", "#4e9e52", "#2f7a4a", "#6fae3f"],
};
const HIGHSTONE_PALETTE: Palette = {
  skins: ["#e0b088", "#d19a6e", "#c98a5c", "#eac29a", "#b87c52", "#d6a476", "#c08458"],
  hairs: ["#6e2a2a", "#2a3a6e", "#4a2a6e", "#7a5a1a", "#3a2a2a", "#2a4a5a", "#5a2a3a", "#6a4a1a"],
  cloths: ["#c0392b", "#2a4a8a", "#6a2a8a", "#c9972a", "#8a2a3a", "#2a6a8a", "#a8582a"],
};
const PALETTES: Record<string, Palette> = { lakeside: LAKESIDE_PALETTE, coralcove: CORALCOVE_PALETTE, market: MARKET_PALETTE, treetop: TREETOP_PALETTE, highstone: HIGHSTONE_PALETTE };

interface Look {
  skin: THREE.Color;
  hair: THREE.Color;
  cloth: THREE.Color;
  wing: THREE.Color | null;
  hairStyle: number;
  body: number;
}
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
function lookFor(postId: string, seed: number): Look {
  const pal = PALETTES[postId] ?? MARKET_PALETTE;
  return {
    skin: new THREE.Color(pal.skins[seed % pal.skins.length]),
    hair: new THREE.Color(pal.hairs[(seed * 3 + 1) % pal.hairs.length]),
    cloth: new THREE.Color(pal.cloths[(seed * 5 + 2) % pal.cloths.length]),
    wing: pal.wings ? new THREE.Color(pal.wings[seed % pal.wings.length]) : null,
    hairStyle: seed % 3,
    body: (seed + 1) % 4,
  };
}
// one look per trader (their driver/crew/escort all share it — a trader's own folk), one per post
// (its stall-keeper) and three generic ones for whoever happens to be riding the train — all pure,
// computed once at import time, never reallocated per frame
const TRADER_LOOK = new Map<string, Look>(TRADERS.map((d) => [d.id, lookFor(d.homeId, seedOf(d.id))]));
const TRAIN_TRADER_LOOK = new Map<string, Look>(TRAIN_TRADERS.map((d) => [d.id, lookFor(d.homeId, seedOf(d.id) + 11)]));
const POST_LOOK = new Map<string, Look>(TRADE_POSTS.map((p) => [p.id, lookFor(p.id, seedOf(p.id) + 7)]));
const TRAIN_LOOKS: Look[] = [lookFor("lakeside", 101), lookFor("market", 202), lookFor("coralcove", 303)];

interface Built {
  group: THREE.Group;
  cartMesh: THREE.InstancedMesh;
  boatMesh: THREE.InstancedMesh;
  crateMesh: THREE.InstancedMesh;
  crowd: Crowd;
  cartMat: THREE.Material;
  boatMat: THREE.Material;
  cartU: FantasyUniforms;
  boatU: FantasyUniforms;
  /** current world (x, z, r) of every visible cart (the kid is pushed out of these) */
  cartObstacles: { x: number; z: number; r: number }[];
}

function buildOnce(scene: THREE.Scene): Built {
  const group = new THREE.Group();
  group.name = "trade";
  scene.add(group);
  const cartU = makeUniforms();
  const boatU = makeUniforms();
  const cartMat = fxMaterial(cartU, { roughness: 0.85, metalness: 0, flatShading: true });
  const boatMat = fxMaterial(boatU, { roughness: 0.75, metalness: 0, flatShading: true });
  const cartMesh = new THREE.InstancedMesh(buildCartGeometry(), cartMat, Math.max(1, CART_CAP));
  const boatMesh = new THREE.InstancedMesh(buildBoatGeometry(), boatMat, Math.max(1, BOAT_CAP));
  const crateMesh = new THREE.InstancedMesh(buildCrateGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(1, CRATE_CAP));
  for (const m of [cartMesh, boatMesh, crateMesh]) {
    m.name = "trade-" + m.id;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.count = 0;
    // the mesh's own transform never moves — every instance is placed far from it by its instance
    // matrix alone — so the default frustum culling (which only tests the geometry's local bounds
    // at the mesh's own origin) would cull the whole thing the moment the kid isn't near (0, 0, 0);
    // same fix folkInstance (village/crowd.ts) uses.
    m.frustumCulled = false;
    group.add(m);
  }
  const crowd = buildCrowd(group, Math.max(1, CROWD_CAP), { wings: true, name: "trade-folk" });
  return { group, cartMesh, boatMesh, crateMesh, crowd, cartMat, boatMat, cartU, boatU, cartObstacles: [] };
}
function disposeBuilt(b: Built) {
  b.group.parent?.remove(b.group);
  for (const m of [b.cartMesh, b.boatMesh, b.crateMesh]) {
    m.geometry.dispose();
    m.dispose();
  }
  b.crowd.dispose();
  b.cartMat.dispose();
  b.boatMat.dispose();
}

export function buildTrade(scene: THREE.Scene): TradeSystem {
  let built: Built | null = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3(1, 1, 1);
  const rig: Rig = makeRig();
  const pose: Pose = { anim: "stand", cycle: 0, gait: 0, wave: 0, look: 0, tool: "none", hidden: false };
  /** how long each cart trader has been held up by the kid blocking the road (the cart "gives
   *  way": it pauses, then goes on from where it stopped, a little behind its schedule) */
  const pausedHours = new Map<string, number>();
  const carPoseOut = { x: 0, y: 0, z: 0, yaw: 0 };

  function place3(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number) {
    e.set(0, yaw, 0, "YXZ");
    m4.compose(vp.set(x, y, z), q.setFromEuler(e), vs);
    mesh.setMatrixAt(i, m4);
  }
  /** a local (x, y, z) offset, rotated by yaw and placed at a world (ox, oy, oz) */
  function worldOf(ox: number, oy: number, oz: number, yaw: number, lx: number, ly: number, lz: number): [number, number, number] {
    return [ox + Math.sin(yaw) * lz + Math.cos(yaw) * lx, oy + ly, oz + Math.cos(yaw) * lz - Math.sin(yaw) * lx];
  }
  /** pose + place one of the shared crowd's folk, waving if the kid's close */
  function placeFolk(b: Built, t: number, x: number, y: number, z: number, yaw: number, look: Look, anim: Anim, tool: Tool, seed: number, kid: THREE.Vector3, cycle = 0, gait = 0) {
    const d = Math.hypot(x - kid.x, z - kid.z);
    pose.anim = anim;
    pose.cycle = cycle;
    pose.gait = gait;
    pose.wave = Math.max(0, Math.min(1, (WAVE_R - d) / 3));
    pose.look = pose.wave > 0.3 ? 1 : 0;
    pose.tool = tool;
    pose.hidden = false;
    resolveRig(pose, seed, false, t, rig);
    b.crowd.place({ x, y, z, yaw, scale: 1, anim, rig, bodyVariant: look.body, hairStyle: look.hairStyle, cloth: look.cloth, skin: look.skin, hair: look.hair, wing: look.wing ?? undefined, tool });
  }

  return {
    update(dt, t, o) {
      const nearestPost = Math.min(...TRADE_POSTS.map((p) => Math.hypot(p.x - o.kid.x, p.z - o.kid.z)));
      const nearestTrader = Math.min(
        ...TRADERS.map((d) => {
          const st = traderStateAtTime(d, t);
          return Math.hypot(st.x - o.kid.x, st.z - o.kid.z);
        })
      );
      const nearest = Math.min(nearestPost, nearestTrader);
      if (!built && nearest < BUILD_R) built = buildOnce(scene);
      else if (built && nearest > DISPOSE_R) {
        disposeBuilt(built);
        built = null;
        pausedHours.clear();
      }
      if (!built) return { talk: null };
      const b = built;
      const HOUR_SECONDS = (900 as number) / 24; // kept in step with plan.ts's HOUR_SECONDS

      b.cartU.uTime.value = t;
      b.cartU.uGlowK.value = 0.1 + o.glow * 1.2;
      b.boatU.uTime.value = t;
      b.boatU.uGlowK.value = 0.1 + o.glow * 1.2;
      b.crowd.glow.uGlowK.value = 0.12 + o.glow * 1.2;

      let talk: TradeTalk | null = null;
      let cartI = 0;
      let boatI = 0;
      let crateI = 0;
      b.cartObstacles.length = 0;
      b.crowd.begin();

      for (const def of TRADERS) {
        // give-way: freeze this trader's effective time while the kid stands right on the road
        // just ahead of it (only ever tracked while the system is built — i.e. only near the kid)
        const paused = pausedHours.get(def.id) ?? 0;
        let state = traderStateAtTime(def, t - paused * HOUR_SECONDS);
        if (state.atPostId === null) {
          const d = Math.hypot(state.x - o.kid.x, state.z - o.kid.z);
          if (d < 3.2) {
            pausedHours.set(def.id, paused + dt / HOUR_SECONDS);
            state = traderStateAtTime(def, t - (paused + dt / HOUR_SECONDS) * HOUR_SECONDS);
          }
        }

        const visible = state.atPostId === null || state.phase === "trading-away" || state.phase === "trading-home";
        if (!visible) continue;
        // a cart stands on the ground; a boat floats on the water's own surface (never the sea
        // floor beneath it — out in the open sea that can be a very long way down)
        const baseY = def.mode === "cart" ? groundY(state.x, state.z) : WATER_Y;
        const look = TRADER_LOOK.get(def.id)!;
        const seed = seedOf(def.id);
        const good = goodOf(state.cargo);
        if (def.mode === "cart") {
          place3(b.cartMesh, cartI, state.x, baseY, state.z, state.yaw);
          if (state.atPostId === null) b.cartObstacles.push({ x: state.x, z: state.z, r: 1.5 });
          cartI++;
          // the driver, sitting on the bench
          const [dx, dy, dz] = worldOf(state.x, baseY, state.z, state.yaw, CART_SEAT.x, CART_SEAT.y, CART_SEAT.z);
          placeFolk(b, t, dx, dy, dz, state.yaw, look, "sit", "none", seed, o.kid);
          // a walking escort, keeping pace beside the cart (visible only while it's on the move)
          if (state.atPostId === null) {
            const [ex, ey, ez] = worldOf(state.x, baseY, state.z, state.yaw, CART_ESCORT.x, CART_ESCORT.y, CART_ESCORT.z);
            placeFolk(b, t, ex, ey, ez, state.yaw, look, "walk", "basket", seed + 1, o.kid, t * 4 + seed, 1);
          }
          // the goods on the bed, both crates the colour of what's being carried right now
          for (const c of CART_CRATES) {
            const [cx, cy, cz] = worldOf(state.x, baseY, state.z, state.yaw, c.x, c.y, c.z);
            m4.compose(vp.set(cx, cy, cz), q.setFromEuler(e.set(0, state.yaw, 0, "YXZ")), vs);
            b.crateMesh.setMatrixAt(crateI, m4);
            b.crateMesh.setColorAt(crateI, colorOf(good.id));
            crateI++;
          }
        } else {
          place3(b.boatMesh, boatI, state.x, baseY, state.z, state.yaw);
          boatI++;
          // 2 crew: one at the tiller, one minding the sail
          BOAT_SEATS.forEach((s, i) => {
            const [sx, sy, sz] = worldOf(state.x, baseY, state.z, state.yaw, s.x, s.y, s.z);
            placeFolk(b, t, sx, sy, sz, state.yaw + (i === 0 ? Math.PI : 0), look, "sit", "none", seed + i, o.kid);
          });
          for (const c of BOAT_CRATES) {
            const [cx, cy, cz] = worldOf(state.x, baseY, state.z, state.yaw, c.x, c.y, c.z);
            m4.compose(vp.set(cx, cy, cz), q.setFromEuler(e.set(0, state.yaw, 0, "YXZ")), vs);
            b.crateMesh.setMatrixAt(crateI, m4);
            b.crateMesh.setColorAt(crateI, colorOf(good.id));
            crateI++;
          }
        }

        if (!talk) {
          const d = Math.hypot(state.x - o.kid.x, state.z - o.kid.z);
          if (d < TALK_R) {
            const which = Math.floor(t / 5) % 2 === 0 ? 0 : 1;
            talk = { id: def.id, name: def.name, line: traderLine(def, state, which), emoji: good.emoji };
          }
        }
      }
      b.cartMesh.count = cartI;
      b.boatMesh.count = boatI;
      b.cartMesh.instanceMatrix.needsUpdate = true;
      b.boatMesh.instanceMatrix.needsUpdate = true;

      // train-riding traders (Treetop/Highstone/Market Street): walking folk on foot between their
      // village and its own station — invisible while actually aboard the train (the ambient riders
      // below stand in for them then), visible again the moment they step off the other end
      const trainStates = TRAIN_TRADERS.map((d) => trainTraderStateAtTime(d, t));
      TRAIN_TRADERS.forEach((def, i) => {
        const state = trainStates[i];
        if (trainTraderRiding(state)) return;
        const visible = state.atPostId === null || state.phase === "trading-away" || state.phase === "trading-home";
        if (!visible) return;
        const baseY = groundY(state.x, state.z);
        const look = TRAIN_TRADER_LOOK.get(def.id)!;
        const seed = seedOf(def.id);
        const walking = state.atPostId === null;
        placeFolk(b, t, state.x, baseY, state.z, state.yaw, look, walking ? "walk" : "sell", "basket", seed, o.kid, t * 4 + seed, 1);
        if (!talk) {
          const d = Math.hypot(state.x - o.kid.x, state.z - o.kid.z);
          if (d < TALK_R) {
            const which = Math.floor(t / 5) % 2 === 0 ? 0 : 1;
            talk = { id: def.id, name: def.name, line: trainTraderLine(def, state, which), emoji: goodOf(state.cargo).emoji };
          }
        }
      });

      // a little stall at every post: two crates showing what it makes and what just arrived, and
      // its own seller, swapping goods for whoever's trading there right now
      for (const p of TRADE_POSTS) {
        if (Math.hypot(p.x - o.kid.x, p.z - o.kid.z) > BUILD_R) continue;
        const incomingState =
          TRADERS.map((d) => traderStateAtTime(d, t)).find((st) => st.atPostId === p.id && (st.phase === "trading-away" || st.phase === "trading-home")) ??
          trainStates.find((st) => st.atPostId === p.id && (st.phase === "trading-away" || st.phase === "trading-home"));
        const madeGood = goodOf(p.makes[0]);
        const arrivedGood = goodOf(incomingState ? incomingState.cargo : p.wants[0]);
        const py = groundY(p.x, p.z) + 0.2;
        for (const [off, good] of [
          [-0.5, madeGood],
          [0.5, arrivedGood],
        ] as const) {
          m4.compose(vp.set(p.x + off, py, p.z + 0.4), q.identity(), vs);
          b.crateMesh.setMatrixAt(crateI, m4);
          b.crateMesh.setColorAt(crateI, colorOf(good.id));
          crateI++;
        }
        // the stall-keeper: standing just behind the crates, trading when someone's there
        const look = POST_LOOK.get(p.id)!;
        placeFolk(b, t, p.x - 1.4, groundY(p.x - 1.4, p.z + 0.4), p.z + 0.4, 0, look, incomingState ? "sell" : "stand", "basket", seedOf(p.id), o.kid);
      }
      b.crateMesh.count = crateI;
      b.crateMesh.instanceMatrix.needsUpdate = true;
      if (b.crateMesh.instanceColor) b.crateMesh.instanceColor.needsUpdate = true;

      // train riders: read straight off the live train (its own run is stateful, not plan.ts's
      // pure schedule) — up to 3 of the shared crowd's folk sit in the first carriage while it's
      // running any "train" TRADE_ROUTE's own arc, waving if the kid's close (e.g. watching from a
      // platform). Stands in for every train-riding trader currently "aboard" (above) too.
      const inRailArc = o.train.at === null && onAnyTrainArc(o.train.s);
      if (inRailArc) {
        o.train.carPose(1, carPoseOut);
        // the carriage's own two benches (steamTrain.ts carriageGeometry) sit fore/aft at local
        // z = ±1.2, seat-tops around local y = 1.3 — an open "observation" carriage, built with low
        // walls on purpose so whoever's aboard shows above them
        const seatZ = [1.2, -1.2, 0];
        for (let k = 0; k < 3; k++) {
          const [sx, sy, sz] = worldOf(carPoseOut.x, carPoseOut.y, carPoseOut.z, carPoseOut.yaw, 0, 1.0, seatZ[k]);
          placeFolk(b, t, sx, sy, sz, carPoseOut.yaw, TRAIN_LOOKS[k], "sit", "basket", 400 + k, o.kid);
        }
      }

      b.crowd.end();
      return { talk };
    },
    pushKid(pos, kidR, _kidY) {
      if (!built) return;
      for (const o of built.cartObstacles) {
        const dx = pos.x - o.x;
        const dz = pos.z - o.z;
        const d = Math.hypot(dx, dz);
        const r = o.r + kidR;
        if (d < r && d > 0.001) {
          pos.x = o.x + (dx / d) * r;
          pos.z = o.z + (dz / d) * r;
        }
      }
    },
    dispose() {
      if (built) disposeBuilt(built);
      built = null;
    },
  };
}
