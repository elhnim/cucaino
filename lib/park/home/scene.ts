// My Home: the kid's cottage as a park "ride" (its own scene; ParkWorld.enterRide brings the kid
// and pet in). Two cosy rooms joined by an arch — My Bedroom and the Pet Corner — with windows
// looking out on the park and the front door back out. The kid taps to walk about; in decorate
// mode a ghost of the chosen item follows your finger over the floor (or walls) and snaps to the
// grid. The pet lives here: it naps in its bed, eats from its bowl, plays with its toys and
// trots after the kid. Placement rules: ./rules.ts (shared with the server).
//
//   const home = buildHomeInterior(accent, layout, { pet, petName, petAnim, petSleep, badges });
//   world.enterRide(() => home);          // `home` is a Ride plus the controller below
//   home.subscribe((e) => ...);           // taps, ghost moves, "exit" ...
import * as THREE from "three";
import type { Ride } from "../engine/ParkWorld";
import { getToonRamp } from "../assets/loader";
import { getHomeItem } from "./catalog";
import { buildItemModel, lighten, type BuiltItem, type FurnitureKit } from "./furniture";
import { choosePetActivity, newThingLine, petSpotFor, type PetSpot } from "./pet";
import {
  ARCH_ROWS,
  RESERVED,
  ROOMS,
  ROOM_IDS,
  SPAWN,
  WALL_FEATURES,
  WALL_H,
  blockedGrid,
  canPlace,
  findPath,
  findSpot,
  nearestWall,
  placedTransform,
  roomAt,
  snapFloor,
  snapWall,
  wallAlong,
  wallFrame,
  SIDE_SPLAY,
  worldToGlobal,
  GRID_W,
  footprint,
  type HomeLayout,
  type HomePlaced,
  type PlaceReason,
  type PlaceSpec,
  type RoomId,
  type RoomStyle,
  type WallId,
} from "./rules";
import { homeCamera } from "./camera";
import { backdropTexture, bubbleTexture, emojiTexture, floorTexture, signTexture, wallpaperTexture, windowViewTexture } from "./textures";

export interface HomePetState {
  hunger: number;
  happiness: number;
  energy: number;
  cleanliness?: number;
  isSleeping: boolean;
}

export interface HomeOptions {
  pet?: HomePetState | null;
  petName?: string;
  /** play one of the pet's animations — wire to ParkWorld.petAnim */
  petAnim?: (name: string) => void;
  /** loop the pet's sleep animation (true) or wake it (false) — wire to ParkWorld.setPetSleeping */
  petSleep?: (on: boolean) => void;
  /** earned badge emoji for the trophy shelf */
  badges?: string[];
  /** 0–24: after dark the windows show the night park */
  hour?: number;
  /** cheaper shadows */
  low?: boolean;
}

export type HomeEvent =
  | { type: "ghost"; spec: PlaceSpec; ok: boolean; reason?: PlaceReason }
  | { type: "tap-item"; uid: string; item: string }
  | { type: "tap-empty" }
  | { type: "tap-pet" }
  | { type: "exit" }
  | { type: "room"; room: RoomId }
  | { type: "pet-happy"; item: string; line: string }
  | { type: "no-bed" };

/** the same shape as components/park/pet/PetCareSheet's PetFx, so it can be passed straight in */
export interface HomePetFx {
  react: (mode: string, anim: string) => Promise<void>;
  say: (text: string) => void;
  status: (pet: { hunger: number; happiness: number; energy: number; cleanliness: number }) => void;
  sleep: (on: boolean) => void;
  celebrate: () => void;
}

export interface HomeController {
  subscribe(fn: (e: HomeEvent) => void): () => void;
  /** show a (saved or optimistic) layout; new pet things get a happy visit from the pet */
  setLayout(layout: HomeLayout): void;
  setEditing(on: boolean): void;
  /** which room decorate mode looks at (phones show one room at a time) */
  viewRoom(room: RoomId): void;
  readonly viewedRoom: RoomId;
  /** start placing `itemId` (or moving placed item `uid`); returns where the ghost starts, null if there's no room */
  startGhost(itemId: string, opts?: { uid?: string; r?: number }): PlaceSpec | null;
  turnGhost(): void;
  ghost(): { spec: PlaceSpec; ok: boolean; uid?: string } | null;
  endGhost(): void;
  select(uid: string | null): void;
  /** try a wallpaper / floor on a room before buying (null = back to the saved look) */
  previewStyle(room: RoomId, style: Partial<RoomStyle> | null): void;
  setPet(state: HomePetState | null, name?: string): void;
  readonly petFx: HomePetFx;
  petSay(text: string, seconds?: number): void;
  celebrate(): void;
  /**
   * What the pet is saying right now and where its bubble goes on screen (normalised device
   * coordinates, -1..1, y up), or null. With a HUD attached (setSpeechHud) the bubble is drawn by
   * the page (crisp text at the screen's own resolution, see components/park/home/HomeSpeech)
   * instead of as a sprite in the (chunky-pixel) scene.
   */
  speech(): { text: string; x: number; y: number } | null;
  setSpeechHud(on: boolean): void;
}

export type HomeRide = Ride & HomeController;

const KID_SPEED = 3.6;
const PET_SPEED = 3.2;
const ACTOR_SCALE = 0.82;
const T = 0.3; // outer wall thickness
const MID = 0.3; // half thickness of the middle wall
const WIN_Y0 = 1.1;
const WIN_Y1 = 2.9;
const ARCH_TOP = 2.55;
const DOOR_TOP = 2.75;
const DOOR_FRONT = { x: 7.5, z: -3.35 };

type Rect = { a: number; b: number; y0: number; y1: number };

/** rectangles covering a wall [0,len] x [0,h] around its openings */
function wallRects(len: number, h: number, holes: Rect[]): Rect[] {
  const out: Rect[] = [];
  let at = 0;
  for (const o of [...holes].sort((p, q) => p.a - q.a)) {
    if (o.a > at) out.push({ a: at, b: o.a, y0: 0, y1: h });
    if (o.y0 > 0) out.push({ a: o.a, b: o.b, y0: 0, y1: o.y0 });
    if (o.y1 < h) out.push({ a: o.a, b: o.b, y0: o.y1, y1: h });
    at = o.b;
  }
  if (at < len) out.push({ a: at, b: len, y0: 0, y1: h });
  return out;
}

/** world-scaled UVs (1 texture tile = 2 x 2 units) so every wall / floor piece tiles evenly */
function worldUV(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x / 2, -z / 2);
    else if (nx >= nz) uv.setXY(i, z / 2, y / 2);
    else uv.setXY(i, x / 2, y / 2);
  }
  uv.needsUpdate = true;
}

export function buildHomeInterior(accent: string, initial: HomeLayout, opts: HomeOptions = {}): HomeRide {
  const scene = new THREE.Scene();
  const night = opts.hour !== undefined && (opts.hour >= 19 || opts.hour < 6.5);
  const listeners = new Set<(e: HomeEvent) => void>();
  const emit = (e: HomeEvent) => listeners.forEach((fn) => fn(e));

  // ── shared materials / textures ──
  const disposables: { dispose: () => void }[] = [];
  const track = <X extends { dispose: () => void }>(x: X) => (disposables.push(x), x);
  const toonCache = new Map<string, THREE.Material>();
  const glowCache = new Map<string, THREE.MeshBasicMaterial>();
  const texCache = new Map<string, THREE.Texture>();
  const picCache = new Map<string, THREE.Material>();
  const toon = (color: string) => {
    let m = toonCache.get(color);
    if (!m) toonCache.set(color, (m = track(new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp() }))));
    return m;
  };
  const texture = (key: string, make: () => THREE.Texture) => {
    let t = texCache.get(key);
    if (!t) texCache.set(key, (t = track(make())));
    return t;
  };
  let glassMat: THREE.Material | null = null;
  const kit: FurnitureKit = {
    accent,
    badges: opts.badges ?? [],
    toon,
    glow(color) {
      let m = glowCache.get(color);
      if (!m) glowCache.set(color, (m = track(new THREE.MeshBasicMaterial({ color }))));
      return m;
    },
    glass() {
      if (!glassMat) glassMat = track(new THREE.MeshToonMaterial({ color: "#5cc8ff", transparent: true, opacity: 0.5, gradientMap: getToonRamp(), depthWrite: false }));
      return glassMat;
    },
    texture,
    picture(key, make) {
      let m = picCache.get(key);
      if (!m) picCache.set(key, (m = track(new THREE.MeshToonMaterial({ map: texture(key, make), gradientMap: getToonRamp() }))));
      return m;
    },
  };
  const geo = <G extends THREE.BufferGeometry>(g: G) => track(g);

  // ── sky, light ──
  scene.background = track(backdropTexture(night));
  scene.add(new THREE.HemisphereLight(night ? 0xe6dcff : 0xfff6ea, 0xd9b99a, night ? 1.0 : 1.2));
  const sun = new THREE.DirectionalLight(night ? 0xffe2c0 : 0xfff0dc, night ? 1.05 : 1.45);
  sun.position.set(-7, 16, 11);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.low ? 512 : 1024, opts.low ? 512 : 1024);
  const sc = sun.shadow.camera;
  sc.left = -13;
  sc.right = 13;
  sc.top = 9;
  sc.bottom = -9;
  sc.near = 1;
  sc.far = 45;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  track({ dispose: () => sun.shadow.map?.dispose() });

  const shell = new THREE.Group();
  shell.name = "home-shell";
  scene.add(shell);
  const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = shell) => {
    const mesh = new THREE.Mesh(geo(g), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // grassy base + foundation (the cottage is a little diorama on a lawn)
  const grass = addMesh(new THREE.CylinderGeometry(1, 1, 0.5, 40), toon("#a4e3a0"), 0, -0.52, 0.6);
  grass.scale.set(15.5, 1, 8.6);
  addMesh(new THREE.BoxGeometry(27.2, 0.5, 9.0), toon("#f0d6b0"), 0, -0.25, -0.1);
  addMesh(new THREE.BoxGeometry(27.4, 0.12, 0.3), toon("#e2bf92"), 0, -0.05, 4.35);
  // (outside the splayed side walls: how far out the wall is at z)
  const out = (x: number, z: number) => x + Math.sign(x) * Math.max(0, z + 4.3) * Math.tan(SIDE_SPLAY);
  // bushes, flowers and a lollipop tree round the outside
  for (const [x, z, s, c] of [
    [-11.3, 3.6, 0.8, "#7fd08f"],
    [-11.0, 1.8, 0.6, "#6cc47f"],
    [11.2, 3.4, 0.85, "#7fd08f"],
    [11.4, 1.4, 0.55, "#6cc47f"],
    [-6, 5.2, 0.5, "#7fd08f"],
    [4.5, 5.3, 0.45, "#6cc47f"],
  ] as const) {
    const b = addMesh(new THREE.SphereGeometry(1, 14, 10), toon(c), Math.abs(x) > 9 ? out(x, z) : x, 0.1 + s * 0.5, z);
    b.scale.set(s * 1.3, s, s * 1.1);
  }
  for (let i = 0; i < 14; i++) {
    const x = (i % 2 ? 1 : -1) * (10.6 + ((i * 37) % 10) / 12);
    const z = -3 + ((i * 53) % 70) / 10;
    addMesh(new THREE.SphereGeometry(0.14, 8, 6), toon(["#ff8fc4", "#ffd36b", "#b99bff", "#ffffff"][i % 4]), out(x, z), 0.12, z);
  }
  addMesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 8), toon("#ffffff"), 11.6, 1.1, -3.2);
  addMesh(new THREE.SphereGeometry(1.1, 16, 12), toon("#ff8fc4"), 11.6, 2.9, -3.2);

  // ── floors ──
  const wallMat = {} as Record<RoomId, THREE.MeshToonMaterial>;
  const floorMat = {} as Record<RoomId, THREE.MeshToonMaterial>;
  for (const id of ROOM_IDS) {
    wallMat[id] = track(new THREE.MeshToonMaterial({ gradientMap: getToonRamp() }));
    floorMat[id] = track(new THREE.MeshToonMaterial({ gradientMap: getToonRamp() }));
    const R = ROOMS[id];
    const x0 = id === "bedroom" ? R.x0 : MID;
    const x1 = id === "bedroom" ? -MID : R.x0 + R.cols;
    const g = new THREE.PlaneGeometry(x1 - x0, R.rows);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, R.z0 + R.rows / 2);
    worldUV(g);
    const f = addMesh(g, floorMat[id]);
    f.castShadow = false;
    f.userData.homeFloor = id;
  }
  addMesh(new THREE.BoxGeometry(MID * 2 + 0.02, 0.03, 2), toon("#c98d52"), 0, 0.012, 0);

  // ── walls ──
  const trim = toon("#fff3dc");
  const skirting = toon("#ffffff");
  const wallBox = (room: RoomId, w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D = shell) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    worldUV(g);
    return addMesh(g, wallMat[room], 0, 0, 0, parent);
  };
  const holesOn = (room: RoomId, wall: WallId, offset = 0): Rect[] =>
    (WALL_FEATURES[room][wall] ?? []).filter((f) => f.kind === "window").map((f) => ({ a: f.from + offset, b: f.to + 1 + offset, y0: WIN_Y0, y1: WIN_Y1 }));
  // back walls (the bedroom's runs on round the corner to the left wall's outside edge)
  for (const id of ROOM_IDS) {
    const R = ROOMS[id];
    const xa = id === "bedroom" ? R.x0 - T : MID;
    const xb = id === "bedroom" ? -MID : R.x0 + R.cols + T;
    const off = R.x0 - xa;
    for (const r of wallRects(xb - xa, WALL_H, holesOn(id, "back", off))) wallBox(id, r.b - r.a, r.y1 - r.y0, T, xa + (r.a + r.b) / 2, (r.y0 + r.y1) / 2, R.z0 - T / 2);
    addMesh(new THREE.BoxGeometry(xb - xa, 0.16, T + 0.14), trim, (xa + xb) / 2, WALL_H + 0.08, R.z0 - T / 2);
    const sa = id === "bedroom" ? R.x0 : MID;
    const sb = id === "bedroom" ? -MID : R.x0 + R.cols;
    addMesh(new THREE.BoxGeometry(sb - sa, 0.16, 0.06), skirting, (sa + sb) / 2, 0.08, R.z0 + 0.03);
  }
  // side walls: hinged at the back corners and splayed outward like a dollhouse's (see rules.ts
  // SIDE_SPLAY), so they face the camera a little and what hangs on them reads; a wedge of floor runs
  // out to meet each one
  for (const [id, wall] of [
    ["bedroom", "left"],
    ["den", "right"],
  ] as const) {
    const R = ROOMS[id];
    const f = wallFrame(id, wall);
    const sg = wall === "left" ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(f.x, 0, f.z);
    pivot.rotation.y = sg * SIDE_SPLAY;
    shell.add(pivot);
    // (long enough to reach the floor's front edge)
    const len = R.rows / Math.cos(SIDE_SPLAY);
    const x = sg * (T / 2);
    for (const r of wallRects(len, WALL_H, holesOn(id, wall))) {
      wallBox(id, T, r.y1 - r.y0, r.b - r.a, x, (r.y0 + r.y1) / 2, (r.a + r.b) / 2, pivot);
    }
    addMesh(new THREE.BoxGeometry(T + 0.14, 0.16, len + T), trim, x, WALL_H + 0.08, len / 2 - T / 2, pivot);
    addMesh(new THREE.BoxGeometry(0.06, 0.16, len), skirting, -sg * 0.03, 0.08, len / 2, pivot);
    // the wedge of floor between the room's grid and the splayed wall
    const wedge = new THREE.BufferGeometry();
    const fx = f.x + sg * R.rows * Math.tan(SIDE_SPLAY);
    const zf = R.z0 + R.rows;
    const tri = wall === "left" ? [f.x, 0, f.z, fx, 0, zf, f.x, 0, zf] : [f.x, 0, f.z, f.x, 0, zf, fx, 0, zf];
    wedge.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
    wedge.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(6), 2));
    wedge.computeVertexNormals();
    worldUV(wedge);
    addMesh(wedge, floorMat[id]).castShadow = false;
  }
  // the middle wall with its arch (each face wears its own room's wallpaper)
  {
    const z0 = ROOMS.bedroom.z0;
    const arch: Rect = { a: ARCH_ROWS[0], b: ARCH_ROWS[ARCH_ROWS.length - 1] + 1, y0: 0, y1: ARCH_TOP };
    for (const [id, x] of [
      ["bedroom", -MID / 2],
      ["den", MID / 2],
    ] as const)
      for (const r of wallRects(8, WALL_H, [arch])) wallBox(id, MID, r.y1 - r.y0, r.b - r.a, x, (r.y0 + r.y1) / 2, z0 + (r.a + r.b) / 2);
    addMesh(new THREE.BoxGeometry(MID * 2 + 0.14, 0.16, 8 + T), trim, 0, WALL_H + 0.08, z0 + 4 - T / 2);
    // arch trim: two posts and a rounded lintel with a heart
    const archWood = toon("#e3ab6c");
    for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(MID * 2 + 0.16, ARCH_TOP, 0.16), archWood, 0, ARCH_TOP / 2, z0 + 4 + s * 1.02);
    addMesh(new THREE.BoxGeometry(MID * 2 + 0.2, 0.22, 2.3), archWood, 0, ARCH_TOP + 0.05, z0 + 4);
    const heart = addMesh(new THREE.SphereGeometry(0.16, 12, 8), toon("#ff8fb8"), MID + 0.1, ARCH_TOP + 0.4, z0 + 4);
    heart.scale.set(0.5, 1, 1.2);
    const heart2 = addMesh(new THREE.SphereGeometry(0.16, 12, 8), toon("#ff8fb8"), -MID - 0.1, ARCH_TOP + 0.4, z0 + 4);
    heart2.scale.set(0.5, 1, 1.2);
    for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(0.06, 0.16, 3), skirting, s * (MID + 0.03), 0.08, z0 + 1.5);
    for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(0.06, 0.16, 3), skirting, s * (MID + 0.03), 0.08, z0 + 6.5);
  }
  // a candy roof edge + chimney peeking over the back wall
  {
    const roof = toon("#ff8f8f");
    const r = addMesh(new THREE.BoxGeometry(21.4, 0.3, 1.8), roof, 0, WALL_H + 0.55, ROOMS.den.z0 - 0.75);
    r.rotation.x = -0.5;
    for (let i = 0; i < 22; i++) {
      const b = addMesh(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(i % 2 ? "#ff8f8f" : "#ff7a86"), -10.3 + i * 0.98, WALL_H + 0.18, ROOMS.den.z0 + 0.02);
      b.rotation.x = Math.PI;
      b.scale.set(1, 0.5, 0.7);
    }
    addMesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), toon("#e8b48a"), -6.5, WALL_H + 1.1, ROOMS.den.z0 - 1.1);
    addMesh(new THREE.BoxGeometry(1.1, 0.2, 1.1), toon("#c98d52"), -6.5, WALL_H + 1.95, ROOMS.den.z0 - 1.1);
  }

  // ── windows (with the park outside) ──
  const viewMats = [0, 1, 2, 3].map((s) => track(new THREE.MeshBasicMaterial({ map: track(windowViewTexture(night, s)) })));
  const shaftMat = track(new THREE.MeshBasicMaterial({ color: night ? "#9fb0ff" : "#fff1c8", transparent: true, opacity: night ? 0.06 : 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const frameMat = toon("#ffffff");
  const curtain = toon(lighten(accent, 0.25));
  let winN = 0;
  const addWindow = (cx: number, cz: number, rotY: number, w: number) => {
    const g = new THREE.Group();
    g.position.set(cx, (WIN_Y0 + WIN_Y1) / 2, cz);
    g.rotation.y = rotY;
    shell.add(g);
    const h = WIN_Y1 - WIN_Y0;
    // the painted view sits just outside the glass (kept inside the wall's shadow so it never
    // shows as a billboard on the lawn from above)
    const view = addMesh(new THREE.PlaneGeometry(w + 0.4, h + 0.4), viewMats[winN++ % viewMats.length], 0, 0, -T - 0.04, g);
    view.castShadow = view.receiveShadow = false;
    addMesh(new THREE.BoxGeometry(w + 0.24, 0.14, 0.24), frameMat, 0, h / 2 + 0.03, 0.02, g);
    addMesh(new THREE.BoxGeometry(w + 0.44, 0.14, 0.42), frameMat, 0, -h / 2 - 0.03, 0.1, g);
    for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(0.14, h + 0.1, 0.24), frameMat, (s * (w + 0.1)) / 2, 0, 0.02, g);
    addMesh(new THREE.BoxGeometry(0.07, h, 0.08), frameMat, 0, 0, -0.1, g);
    addMesh(new THREE.BoxGeometry(w, 0.07, 0.08), frameMat, 0, 0.1, -0.1, g);
    for (const s of [-1, 1]) addMesh(new THREE.BoxGeometry(0.42, h + 0.5, 0.1), curtain, s * (w / 2 + 0.28), 0.12, 0.16, g);
    addMesh(new THREE.CylinderGeometry(0.04, 0.04, w + 1.3, 8), toon("#c98d52"), 0, h / 2 + 0.34, 0.2, g).rotation.z = Math.PI / 2;
    // a flower box on the sill
    addMesh(new THREE.BoxGeometry(Math.min(1.2, w * 0.5), 0.2, 0.22), toon("#ff9a7a"), w * 0.18, -h / 2 + 0.14, 0.14, g);
    for (let i = 0; i < 3; i++) addMesh(new THREE.SphereGeometry(0.09, 8, 6), toon(["#ff8fc4", "#ffd36b", "#b99bff"][i]), w * 0.18 + (i - 1) * 0.28, -h / 2 + 0.32, 0.14, g);
    // soft sunbeam onto the floor
    const shaft = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, 3.2)), shaftMat);
    shaft.position.set(0, -1.2, 1.4);
    shaft.rotation.x = -0.95;
    shaft.renderOrder = 3;
    g.add(shaft);
  };
  for (const id of ROOM_IDS) {
    const R = ROOMS[id];
    for (const [wall, list] of Object.entries(WALL_FEATURES[id]) as [WallId, (typeof WALL_FEATURES)["den"]["back"]][]) {
      for (const f of list ?? []) {
        if (f.kind !== "window") continue;
        const w = f.to - f.from + 1;
        const along = f.from + w / 2;
        const fr = wallFrame(id, wall);
        addWindow(fr.x + fr.dx * along, fr.z + fr.dz * along, fr.rotY, w);
      }
    }
  }

  // ── the front door (back out to the park) ──
  const doorMeshes: THREE.Object3D[] = [];
  {
    const R = ROOMS.den;
    const door = WALL_FEATURES.den.back!.find((f) => f.kind === "door")!;
    const w = door.to - door.from + 1;
    const cx = R.x0 + door.from + w / 2;
    const z = R.z0;
    const wood = toon("#c98d52");
    for (const s of [-1, 1]) doorMeshes.push(addMesh(new THREE.BoxGeometry(0.2, DOOR_TOP + 0.1, 0.2), wood, cx + (s * (w - 0.1)) / 2, (DOOR_TOP + 0.1) / 2, z + 0.06));
    doorMeshes.push(addMesh(new THREE.BoxGeometry(w + 0.2, 0.22, 0.24), wood, cx, DOOR_TOP + 0.1, z + 0.06));
    const panel = addMesh(new THREE.BoxGeometry(w - 0.3, DOOR_TOP - 0.05, 0.1), toon("#7fd6b8"), cx, (DOOR_TOP - 0.05) / 2, z + 0.05);
    doorMeshes.push(panel);
    for (let i = 0; i < 3; i++) doorMeshes.push(addMesh(new THREE.BoxGeometry(w - 0.5, 0.05, 0.03), toon("#6cc4a6"), cx, 0.5 + i * 0.7, z + 0.115));
    doorMeshes.push(addMesh(new THREE.SphereGeometry(0.08, 10, 8), toon("#ffc53d"), cx + w / 2 - 0.36, 1.25, z + 0.14));
    const porthole = addMesh(new THREE.CircleGeometry(0.28, 20), kit.glow(night ? "#b8b0ff" : "#dff4ff"), cx, 2.05, z + 0.105);
    doorMeshes.push(porthole);
    doorMeshes.push(addMesh(new THREE.TorusGeometry(0.28, 0.05, 6, 20), toon("#ffffff"), cx, 2.05, z + 0.11));
    const sign = addMesh(new THREE.PlaneGeometry(1.7, 0.48), kit.picture("sign:park", () => signTexture("🎡 To the Park")), cx, DOOR_TOP + 0.55, z + 0.02);
    sign.castShadow = false;
    doorMeshes.push(sign);
    addMesh(new THREE.BoxGeometry(1.6, 0.03, 0.8), toon("#ff9a7a"), cx, 0.015, z + 0.55).receiveShadow = true;
    addMesh(new THREE.BoxGeometry(1.2, 0.035, 0.45), toon("#ffd36b"), cx, 0.02, z + 0.55);
    for (const m of doorMeshes) m.userData.homeDoor = true;
  }

  // ── decorate-mode grid ──
  const gridGroup = new THREE.Group();
  gridGroup.visible = false;
  scene.add(gridGroup);
  {
    const pts: number[] = [];
    for (const id of ROOM_IDS) {
      const R = ROOMS[id];
      for (let i = 0; i <= R.cols; i++) pts.push(R.x0 + i, 0.02, R.z0, R.x0 + i, 0.02, R.z0 + R.rows);
      for (let j = 0; j <= R.rows; j++) pts.push(R.x0, 0.02, R.z0 + j, R.x0 + R.cols, 0.02, R.z0 + j);
    }
    const lg = geo(new THREE.BufferGeometry());
    lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    gridGroup.add(new THREE.LineSegments(lg, track(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 }))));
    const keep = track(new THREE.MeshBasicMaterial({ color: "#8fd0ff", transparent: true, opacity: 0.28, depthWrite: false }));
    const cellG = geo(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2));
    for (const id of ROOM_IDS)
      for (const [gx, gz] of RESERVED[id]) {
        const m = new THREE.Mesh(cellG, keep);
        m.position.set(ROOMS[id].x0 + gx + 0.5, 0.025, ROOMS[id].z0 + gz + 0.5);
        gridGroup.add(m);
      }
  }

  // ── placed items ──
  const itemsGroup = new THREE.Group();
  itemsGroup.name = "home-items";
  scene.add(itemsGroup);
  type Entry = { placed: HomePlaced; holder: THREE.Group; built: BuiltItem };
  const items = new Map<string, Entry>();
  let layout: HomeLayout = initial;
  let blocked = blockedGrid(layout.placed);

  const positionHolder = (holder: THREE.Group, p: Pick<HomePlaced, "item" | "room" | "gx" | "gz" | "r" | "wall">) => {
    const t = placedTransform(p);
    holder.position.set(t.x, t.y, t.z);
    holder.rotation.y = t.rotY;
  };
  const makeEntry = (p: HomePlaced): Entry => {
    const built = buildItemModel(p.item, kit);
    const holder = new THREE.Group();
    holder.add(built.group);
    built.group.traverse((o) => (o.userData.homeUid = p.uid));
    positionHolder(holder, p);
    itemsGroup.add(holder);
    return { placed: p, holder, built };
  };
  const removeEntry = (e: Entry) => {
    itemsGroup.remove(e.holder);
    e.built.dispose();
  };

  // ── styles ──
  let preview: Partial<Record<RoomId, Partial<RoomStyle>>> = {};
  const applyStyles = () => {
    for (const id of ROOM_IDS) {
      const s = { ...layout.rooms[id], ...(preview[id] ?? {}) };
      const wm = texture(`wp:${s.wall}`, () => wallpaperTexture(s.wall));
      const fm = texture(`fl:${s.floor}`, () => floorTexture(s.floor));
      if (wallMat[id].map !== wm) {
        wallMat[id].map = wm;
        wallMat[id].needsUpdate = true;
      }
      if (floorMat[id].map !== fm) {
        floorMat[id].map = fm;
        floorMat[id].needsUpdate = true;
      }
    }
  };

  // ── kid + pet ──
  const own = new Set<THREE.Object3D>();
  let kidActor: THREE.Object3D | null = null;
  let petActor: THREE.Object3D | null = null;
  const kidPos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  let kidFacing = 0; // facing +Z: towards the camera
  let kidRoute: { x: number; z: number }[] = [];
  let kidArrive: (() => void) | null = null;
  let kidRoom: RoomId = roomAt(kidPos.x);

  const petPos = new THREE.Vector3(SPAWN.x + 1.2, 0, SPAWN.z + 0.8);
  let petFace = 0;
  let petRoute: { x: number; z: number }[] = [];
  let petY = 0;
  let petYTarget = 0;
  type PetTask = { spot: PetSpot; arrive: () => void; timeout: number };
  let petTask: PetTask | null = null;
  let petBusyUntil = 0; // using something: stand still until then
  let petNextIdea = 6;
  let petState: HomePetState | null = opts.pet ?? null;
  let petName = opts.petName ?? "";
  let petAsleep = false;
  let followAt = new THREE.Vector3(Number.NaN, 0, 0);
  let noBedToldOnce = false;
  let time = 0;

  const fx = new THREE.Group();
  fx.name = "home-fx";
  scene.add(fx);

  const walkKidTo = (x: number, z: number, arrive?: () => void) => {
    kidRoute = findPath(blocked, kidPos.x, kidPos.z, x, z);
    kidArrive = arrive ?? null;
    if (kidRoute.length === 0) {
      kidArrive = null;
      arrive?.();
    }
  };
  const petGo = (spot: PetSpot, then?: () => void): Promise<void> =>
    new Promise((resolve) => {
      if (petAsleep) {
        resolve();
        return;
      }
      petRoute = findPath(blocked, petPos.x, petPos.z, spot.x, spot.z);
      // the bed itself: walk right onto it
      if (spot.y > 0) petRoute.push({ x: spot.x, z: spot.z });
      petYTarget = 0;
      const done = () => {
        petTask = null;
        petFace = spot.face;
        petYTarget = spot.y;
        then?.();
        resolve();
      };
      petTask = { spot, arrive: done, timeout: time + 6 };
      if (petRoute.length === 0) done();
    });

  const itemSpot = (uid: string): PetSpot | null => {
    const e = items.get(uid);
    return e ? petSpotFor(e.placed, blocked) : null;
  };
  const firstOf = (use: string) => layout.placed.find((p) => getHomeItem(p.item)?.petUse === use);

  // ── little effects: hearts, bubbles, speech, status bars, zzz ──
  type Particle = { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number };
  const particles: Particle[] = [];
  const spriteMats = new Map<string, THREE.SpriteMaterial>();
  const burst = (at: THREE.Vector3, emoji: string, n = 8) => {
    let mat = spriteMats.get(emoji);
    if (!mat) spriteMats.set(emoji, (mat = track(new THREE.SpriteMaterial({ map: texture(`emoji:${emoji}`, () => emojiTexture(emoji)), transparent: true, depthWrite: false }))));
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.scale.setScalar(0.45);
      s.position.copy(at);
      fx.add(s);
      const a = Math.random() * Math.PI * 2;
      particles.push({ s, v: new THREE.Vector3(Math.cos(a) * 0.9, 1.4 + Math.random() * 1.1, Math.sin(a) * 0.9), life: 0, max: 1.4 + Math.random() * 0.5 });
    }
  };
  let bubble: { s: THREE.Sprite; until: number } | null = null;
  const clearSprite = (s: THREE.Sprite) => {
    fx.remove(s);
    s.material.map?.dispose();
    s.material.dispose();
  };
  let speechText: string | null = null;
  let speechUntil = 0;
  let speechHud = false;
  const speechAt = new THREE.Vector3();
  const speechTmp = new THREE.Vector3();
  const speechNdc = { x: 0, y: 0 };
  const petSay = (text: string, seconds = 3.2) => {
    speechText = text;
    speechUntil = time + seconds;
    if (bubble) clearSprite(bubble.s);
    const b = bubbleTexture(text);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: b.texture, transparent: true, depthWrite: false }));
    const h = 1.3;
    s.scale.set(h * b.aspect * 0.55, h, 1);
    fx.add(s);
    s.visible = !speechHud;
    bubble = { s, until: time + seconds };
  };
  let statusBar: { s: THREE.Sprite; until: number } | null = null;
  const showStatus = (st: { hunger: number; happiness: number; energy: number; cleanliness: number }) => {
    if (statusBar) clearSprite(statusBar.s);
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 96;
    const c = cv.getContext("2d")!;
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath();
    c.roundRect(2, 2, 252, 92, 22);
    c.fill();
    ([
      ["🍎", st.hunger, "#ff6b8a"],
      ["😊", st.happiness, "#ffc83d"],
      ["⚡", st.energy, "#4cc9ff"],
      ["🫧", st.cleanliness, "#7be0b0"],
    ] as const).forEach(([icon, v, col], i) => {
      const x = 12 + i * 61;
      c.font = "26px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'";
      c.fillText(icon, x + 12, 34);
      c.fillStyle = "#f3dbe8";
      c.beginPath();
      c.roundRect(x, 50, 52, 16, 8);
      c.fill();
      c.fillStyle = v < 30 ? "#ff4f6d" : col;
      c.beginPath();
      c.roundRect(x, 50, Math.max(8, (52 * Math.max(0, Math.min(100, v))) / 100), 16, 8);
      c.fill();
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(2.1, 0.79, 1);
    fx.add(s);
    statusBar = { s, until: time + 6 };
  };
  let zzz: THREE.Sprite | null = null;
  const setZzz = (on: boolean) => {
    if (on && !zzz) {
      zzz = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: texture("emoji:💤", () => emojiTexture("💤")), transparent: true, depthWrite: false })));
      zzz.scale.setScalar(1.05);
      fx.add(zzz);
    } else if (!on && zzz) {
      fx.remove(zzz);
      zzz = null;
    }
  };

  const setSleeping = (on: boolean) => {
    if (on === petAsleep) return;
    if (on) {
      const bed = firstOf("sleep");
      const lieDown = () => {
        petAsleep = true;
        petBusyUntil = Infinity;
        opts.petSleep?.(true);
        setZzz(true);
      };
      if (bed) {
        const spot = itemSpot(bed.uid);
        if (spot) void petGo(spot, lieDown);
        else lieDown();
      } else {
        if (!noBedToldOnce) emit({ type: "no-bed" });
        noBedToldOnce = true;
        lieDown();
      }
    } else {
      petAsleep = false;
      petBusyUntil = time + 1.2;
      petYTarget = 0;
      setZzz(false);
      opts.petSleep?.(false);
      opts.petAnim?.("gesture-positive");
      burst(petPos.clone().setY(1.2), "☀️", 4);
    }
  };

  /** the pet goes and uses one of its things */
  const petUse = (uid: string, why: "idea" | "new" | "tap" = "idea") => {
    const e = items.get(uid);
    const def = e ? getHomeItem(e.placed.item) : undefined;
    if (!e || !def?.petUse || petAsleep || !petActor) return;
    const spot = petSpotFor(e.placed, blocked);
    if (!spot) return;
    void petGo(spot, () => {
      const hold = def.petUse === "sleep" ? 5 : 2.6;
      petBusyUntil = time + hold;
      if (why === "new") {
        opts.petAnim?.("gesture-positive");
        burst(petPos.clone().setY(1.3), "💖", 9);
        const line = newThingLine(petName, def.id);
        petSay(line);
        emit({ type: "pet-happy", item: def.id, line });
        window.setTimeout(() => !petAsleep && runUse(), 1300);
      } else runUse();
      function runUse() {
        if (!e || !def) return;
        if (def.petUse === "eat") {
          opts.petAnim?.("eat");
          burst(petPos.clone().setY(0.9), "😋", 3);
        } else if (def.petUse === "play") {
          opts.petAnim?.(def.id === "pet-tunnel" ? "dance" : "fetch");
          playToy(e);
        } else if (def.petUse === "scratch") opts.petAnim?.("dance");
        else if (def.petUse === "sleep") {
          opts.petAnim?.("sleep");
          window.setTimeout(() => {
            if (!petAsleep) petYTarget = 0;
          }, hold * 1000);
        }
      }
    });
  };
  const toyAnims: { e: Entry; t: number }[] = [];
  const playToy = (e: Entry) => {
    if (e.built.toy) toyAnims.push({ e, t: 0 });
    burst(e.holder.position.clone().setY(0.8), "🎉", 4);
  };

  // ── ghost (decorate mode) ──
  type Ghost = { itemId: string; uid?: string; r: number; spec: PlaceSpec; ok: boolean; reason?: PlaceReason; model: BuiltItem; holder: THREE.Group; mats: THREE.Material[]; tiles: THREE.Group };
  let ghost: Ghost | null = null;
  const okMat = track(new THREE.MeshBasicMaterial({ color: "#3fe08e", transparent: true, opacity: 0.68, depthWrite: false }));
  const badMat = track(new THREE.MeshBasicMaterial({ color: "#ff4f73", transparent: true, opacity: 0.68, depthWrite: false }));
  const selMat = track(new THREE.MeshBasicMaterial({ color: "#ffd36b", transparent: true, opacity: 0.55, depthWrite: false }));
  const tileGeo = geo(new THREE.PlaneGeometry(0.9, 0.9));
  const fillTiles = (group: THREE.Group, spec: Pick<PlaceSpec, "item" | "room" | "gx" | "gz" | "r" | "wall">, mat: THREE.Material) => {
    group.clear();
    const def = getHomeItem(spec.item);
    if (!def) return;
    const R = ROOMS[spec.room];
    if (def.surface === "wall" && spec.wall) {
      for (let i = 0; i < def.w; i++) {
        const m = new THREE.Mesh(tileGeo, mat);
        const along = spec.gx + i + 0.5;
        const fr = wallFrame(spec.room, spec.wall);
        m.position.set(fr.x + fr.dx * along + Math.sin(fr.rotY) * 0.02, 0.5, fr.z + fr.dz * along + Math.cos(fr.rotY) * 0.02);
        m.rotation.y = fr.rotY;
        m.scale.y = 0.2;
        m.position.y = (def.wallY ?? 2.2) - 0.75;
        group.add(m);
      }
      return;
    }
    const { w, d } = footprint(def, spec.r);
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++) {
        const m = new THREE.Mesh(tileGeo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(R.x0 + spec.gx + i + 0.5, 0.03, R.z0 + spec.gz + j + 0.5);
        group.add(m);
      }
  };
  const updateGhost = (spec: PlaceSpec) => {
    if (!ghost) return;
    const check = canPlace(layout.placed, spec, ghost.uid);
    const changed = !ghost.spec || JSON.stringify(ghost.spec) !== JSON.stringify(spec) || ghost.ok !== check.ok;
    ghost.spec = spec;
    ghost.ok = check.ok;
    ghost.reason = check.ok ? undefined : check.reason;
    positionHolder(ghost.holder, spec);
    const def = getHomeItem(spec.item);
    if (def?.surface === "wall") ghost.holder.position.add(new THREE.Vector3(0, 0, 0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), ghost.holder.rotation.y));
    else ghost.holder.position.y = 0.06;
    fillTiles(ghost.tiles, spec, check.ok ? okMat : badMat);
    for (const m of ghost.mats) (m as THREE.MeshToonMaterial).emissive?.set(check.ok ? "#0a3a1c" : "#5a0a18");
    if (changed) emit({ type: "ghost", spec, ok: check.ok, reason: ghost.reason });
  };
  const ghostFromRay = (ray: THREE.Ray) => {
    if (!ghost) return;
    const def = getHomeItem(ghost.itemId);
    if (!def) return;
    const floor = new THREE.Vector3();
    const hitFloor = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floor);
    if (def.surface === "wall") {
      // aim straight at a wall if we can, else the wall nearest the floor point
      let best: { room: RoomId; wall: WallId; along: number; t: number } | null = null;
      const tryPlane = (room: RoomId, wall: WallId, plane: THREE.Plane) => {
        const p = new THREE.Vector3();
        if (!ray.intersectPlane(plane, p)) return;
        if (p.y < 0.2 || p.y > WALL_H + 0.6) return;
        const R = ROOMS[room];
        const along = wallAlong(room, wall, p.x, p.z);
        const len = wall === "back" ? R.cols : R.rows;
        if (along < -0.3 || along > len + 0.3) return;
        const t = p.distanceTo(ray.origin);
        if (!best || t < best.t) best = { room, wall, along, t };
      };
      tryPlane("bedroom", "back", new THREE.Plane(new THREE.Vector3(0, 0, 1), -ROOMS.bedroom.z0));
      tryPlane("den", "back", new THREE.Plane(new THREE.Vector3(0, 0, 1), -ROOMS.den.z0));
      for (const [room, wall] of [
        ["bedroom", "left"],
        ["den", "right"],
      ] as const) {
        const fr = wallFrame(room, wall);
        const n = new THREE.Vector3(Math.sin(fr.rotY), 0, Math.cos(fr.rotY));
        tryPlane(room, wall, new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(fr.x, 0, fr.z)));
      }
      const b = best as { room: RoomId; wall: WallId; along: number; t: number } | null;
      if (b) {
        const s = snapWall(ghost.itemId, b.room, b.wall, b.along);
        updateGhost({ item: ghost.itemId, room: s.room, gx: s.gx, gz: 0, r: 0, wall: s.wall });
      } else if (hitFloor) {
        const room = roomAt(floor.x);
        const wall = nearestWall(room, floor.x, floor.z);
        const s = snapWall(ghost.itemId, room, wall, wallAlong(room, wall, floor.x, floor.z));
        updateGhost({ item: ghost.itemId, room, gx: s.gx, gz: 0, r: 0, wall });
      }
      return;
    }
    if (!hitFloor) return;
    const s = snapFloor(ghost.itemId, floor.x, floor.z, ghost.r);
    updateGhost({ item: ghost.itemId, room: s.room, gx: s.gx, gz: s.gz, r: ghost.r });
  };

  // the ghost lives in its own group, so actor-finding never mistakes it for the pet
  const ghostGroup = new THREE.Group();
  scene.add(ghostGroup);

  // selection
  let selected: string | null = null;
  const selTiles = new THREE.Group();
  scene.add(selTiles);

  // ── pointer ──
  const raycaster = new THREE.Raycaster();
  let down: { at: THREE.Vector3; t: number } | null = null;
  let editing = false;
  let viewed: RoomId = "den";
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const tap = (ray: THREE.Ray) => {
    raycaster.ray.copy(ray);
    const targets: THREE.Object3D[] = [itemsGroup, ...doorMeshes];
    if (petActor && !editing) targets.unshift(petActor);
    const hit = raycaster.intersectObjects(targets, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    let isPet = false;
    while (o) {
      if (o === petActor) isPet = true;
      o = o.parent;
    }
    const uid = hit?.object.userData.homeUid as string | undefined;
    if (editing) {
      if (uid && items.has(uid)) emit({ type: "tap-item", uid, item: items.get(uid)!.placed.item });
      else emit({ type: "tap-empty" });
      return;
    }
    if (isPet) {
      emit({ type: "tap-pet" });
      if (!petAsleep) {
        opts.petAnim?.("gesture-positive");
        burst(petPos.clone().setY(1.3), "💖", 5);
      }
      return;
    }
    if (hit?.object.userData.homeDoor) {
      walkKidTo(DOOR_FRONT.x, DOOR_FRONT.z, () => emit({ type: "exit" }));
      return;
    }
    const e = uid ? items.get(uid) : undefined;
    const def = e ? getHomeItem(e.placed.item) : undefined;
    if (e && def?.surface === "wall") {
      // walk up to the wall below it
      const t = placedTransform(e.placed);
      walkKidTo(t.x + Math.sin(t.rotY) * 1.2, t.z + Math.cos(t.rotY) * 1.2);
      return;
    }
    if (e && def?.petUse) petUse(e.placed.uid, "tap"); // tap the ball: the pet goes and plays
    // otherwise walk to where you tapped (or as near as the furniture allows)
    const p = new THREE.Vector3();
    if (hit && def && def.surface !== "rug") p.copy(hit.point);
    else if (!ray.intersectPlane(floorPlane, p)) return;
    walkKidTo(Math.max(-9.3, Math.min(9.3, p.x)), Math.max(-3.8, Math.min(3.8, p.z)));
  };

  // ── camera ──
  const camPos = new THREE.Vector3(0, 14, 18);
  const camLook = new THREE.Vector3(0, 0.5, 0);
  let camInit = false;
  const camera = (cam: THREE.PerspectiveCamera, dt: number) => {
    // (the framing itself is ./camera.ts homeCamera: tested)
    const portrait = (cam.aspect || 1) < 1.15;
    let focusX = kidPos.x;
    let panLo: number | undefined;
    let panHi: number | undefined;
    if (portrait && editing) {
      const R = ROOMS[viewed];
      panLo = viewed === "bedroom" ? R.x0 - T : MID;
      panHi = viewed === "bedroom" ? -MID : R.x0 + R.cols + T;
      focusX = ghost ? ghost.holder.position.x : selected && items.has(selected) ? items.get(selected)!.holder.position.x : R.x0 + R.cols / 2;
    }
    const hc = homeCamera({ aspect: cam.aspect || 1, fov: cam.fov, editing, focusX, panLo, panHi });
    const look = new THREE.Vector3(hc.look.x, hc.look.y, hc.look.z);
    const pos = new THREE.Vector3(hc.pos.x, hc.pos.y, hc.pos.z);
    const k = camInit ? Math.min(1, dt * 4) : 1;
    camInit = true;
    camPos.lerp(pos, k);
    camLook.lerp(look, k);
    cam.position.copy(camPos);
    cam.lookAt(camLook);
    // (where the pet's speech bubble sits on screen, for the page's HUD)
    if (speechText) {
      cam.updateMatrixWorld();
      const v = speechTmp.copy(speechAt).project(cam);
      speechNdc.x = v.x;
      speechNdc.y = v.y;
    }
  };

  // ── per-frame ──
  const update = (dt: number, playerPos: THREE.Vector3) => {
    time += dt;
    // find the kid and pet the engine brought in (the only things in the scene we didn't add)
    if (!kidActor || !petActor) {
      for (const c of scene.children) {
        if (own.has(c)) continue;
        if (c.position === playerPos) kidActor = c;
        else if (c !== kidActor && !petActor) {
          petActor = c;
          petPos.copy(c.position).setY(0);
          if (petState?.isSleeping) {
            // already asleep when we came in: straight into bed
            const bed = firstOf("sleep");
            const spot = bed ? itemSpot(bed.uid) : null;
            if (spot) {
              petPos.set(spot.x, 0, spot.z);
              petY = petYTarget = spot.y;
              petFace = spot.face;
            }
            petAsleep = true;
            petBusyUntil = Infinity;
            setZzz(true);
            opts.petSleep?.(true);
          }
        }
      }
    }

    // kid walking
    if (kidRoute.length) {
      const tgt = kidRoute[0];
      const dx = tgt.x - kidPos.x;
      const dz = tgt.z - kidPos.z;
      const dist = Math.hypot(dx, dz);
      const step = KID_SPEED * dt;
      if (dist <= step) {
        kidPos.set(tgt.x, 0, tgt.z);
        kidRoute.shift();
        if (!kidRoute.length) {
          const a = kidArrive;
          kidArrive = null;
          a?.();
        }
      } else {
        kidPos.x += (dx / dist) * step;
        kidPos.z += (dz / dist) * step;
      }
      if (dist > 0.01) kidFacing = Math.atan2(dx, dz);
    }
    playerPos.copy(kidPos);
    const nowRoom = roomAt(kidPos.x);
    if (nowRoom !== kidRoom) {
      kidRoom = nowRoom;
      emit({ type: "room", room: nowRoom });
    }

    // pet brain
    if (petActor) {
      if (!petAsleep && !petTask && time > petBusyUntil) {
        const kidStill = kidRoute.length === 0;
        petNextIdea -= dt;
        if (kidStill && petNextIdea <= 0 && petState && !editing) {
          petNextIdea = 7 + Math.random() * 7;
          const act = choosePetActivity(petState, layout.placed, Math.random(), Math.random());
          if (act.kind === "wander") {
            const a = Math.random() * Math.PI * 2;
            const x = Math.max(-9, Math.min(9, kidPos.x + Math.cos(a) * 2.5));
            const z = Math.max(-3.5, Math.min(3.5, kidPos.z + Math.sin(a) * 2.5));
            void petGo({ x, y: 0, z, face: Math.atan2(kidPos.x - x, kidPos.z - z) });
          } else if (act.kind === "rest" || act.kind === "eat" || act.kind === "play" || act.kind === "scratch") petUse(act.uid);
        }
        if (!petTask) {
          // trot after the kid, a little behind and to the side
          const fwdX = Math.sin(kidFacing);
          const fwdZ = Math.cos(kidFacing);
          const tx = kidPos.x - fwdX * 0.9 + fwdZ * 0.9;
          const tz = kidPos.z - fwdZ * 0.9 - fwdX * 0.9;
          const far = Math.hypot(petPos.x - kidPos.x, petPos.z - kidPos.z) > 1.7;
          if (far && (Number.isNaN(followAt.x) || Math.hypot(followAt.x - tx, followAt.z - tz) > 0.8 || petRoute.length === 0)) {
            followAt.set(tx, 0, tz);
            petRoute = findPath(blocked, petPos.x, petPos.z, tx, tz);
            petYTarget = 0;
          }
        }
      }
      // move along the route
      if (petRoute.length && (petTask || time > petBusyUntil)) {
        const tgt = petRoute[0];
        const dx = tgt.x - petPos.x;
        const dz = tgt.z - petPos.z;
        const dist = Math.hypot(dx, dz);
        const speed = petTask ? PET_SPEED : PET_SPEED * Math.min(1.3, 0.7 + Math.hypot(petPos.x - kidPos.x, petPos.z - kidPos.z) * 0.2);
        const step = speed * dt;
        if (dist <= step) {
          petPos.set(tgt.x, 0, tgt.z);
          petRoute.shift();
        } else {
          petPos.x += (dx / dist) * step;
          petPos.z += (dz / dist) * step;
        }
        if (dist > 0.01) petFace = Math.atan2(dx, dz);
      } else if (!petTask && !petAsleep && time > petBusyUntil && kidRoute.length === 0 && Math.hypot(petPos.x - kidPos.x, petPos.z - kidPos.z) < 2.2) {
        // stood next to the kid: look at them
        petFace = Math.atan2(kidPos.x - petPos.x, kidPos.z - petPos.z);
      }
      if (petTask && (petRoute.length === 0 || time > petTask.timeout)) {
        if (time > petTask.timeout) {
          petPos.set(petTask.spot.x, 0, petTask.spot.z);
          petRoute = [];
        }
        petTask.arrive();
      }
      petY += (petYTarget - petY) * Math.min(1, dt * 6);
      petActor.position.set(petPos.x, petY, petPos.z);
      let dr = petFace - petActor.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      petActor.rotation.y += dr * Math.min(1, dt * 9);
    }

    // toys being played with
    for (let i = toyAnims.length - 1; i >= 0; i--) {
      const a = toyAnims[i];
      a.t += dt;
      const toy = a.e.built.toy!;
      if (a.e.placed.item === "pet-ball") {
        toy.position.y = Math.abs(Math.sin(a.t * 7)) * 0.5 * Math.max(0, 1 - a.t / 2.2);
        toy.rotation.x += dt * 6;
      } else {
        toy.position.y = Math.abs(Math.sin(a.t * 9)) * 0.12;
        toy.scale.setScalar(1 + Math.sin(a.t * 18) * 0.06);
      }
      if (a.t > 2.2) {
        toy.position.set(0, 0, 0);
        toy.scale.setScalar(1);
        toyAnims.splice(i, 1);
      }
    }
    // item animations
    for (const e of items.values()) e.built.anim?.(time, dt);
    // the ghost bobs gently so it's easy to spot
    if (ghost && getHomeItem(ghost.itemId)?.surface !== "wall") ghost.holder.position.y = 0.1 + Math.abs(Math.sin(time * 4)) * 0.12;
    // selection pulse
    if (selected && items.has(selected)) items.get(selected)!.holder.scale.setScalar(1 + Math.sin(time * 6) * 0.03);
    // effects
    const head = petActor ? petY + 1.25 * ACTOR_SCALE + 0.5 : 1.6;
    speechAt.set(petPos.x, head + 0.55, petPos.z);
    if (speechText && time > speechUntil) speechText = null;
    if (bubble) {
      bubble.s.position.set(petPos.x, head + 0.5, petPos.z);
      if (time > bubble.until) {
        clearSprite(bubble.s);
        bubble = null;
      }
    }
    if (statusBar) {
      statusBar.s.position.set(petPos.x, head + (bubble ? 1.2 : 0.35), petPos.z);
      if (time > statusBar.until) {
        clearSprite(statusBar.s);
        statusBar = null;
      }
    }
    if (zzz) zzz.position.set(petPos.x + 0.35, head + 0.35 + Math.sin(time * 2) * 0.12, petPos.z + 0.3);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.s.position.addScaledVector(p.v, dt);
      p.v.y -= dt * 0.8;
      p.s.material.opacity = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) {
        fx.remove(p.s);
        p.s.material.dispose();
        particles.splice(i, 1);
      }
    }
  };

  // ── layout sync ──
  let first = true;
  const setLayout = (next: HomeLayout) => {
    const prevUids = new Set(items.keys());
    const nextUids = new Set(next.placed.map((p) => p.uid));
    for (const [uid, e] of items)
      if (!nextUids.has(uid)) {
        removeEntry(e);
        items.delete(uid);
      }
    const fresh: HomePlaced[] = [];
    for (const p of next.placed) {
      const e = items.get(p.uid);
      if (e && e.placed.item === p.item) {
        e.placed = p;
        positionHolder(e.holder, p);
      } else {
        if (e) removeEntry(e);
        items.set(p.uid, makeEntry(p));
        if (!prevUids.has(p.uid)) fresh.push(p);
      }
    }
    layout = next;
    blocked = blockedGrid(layout.placed);
    applyStyles();
    // nobody ends up stuck inside new furniture
    const nudge = (v: THREE.Vector3) => {
      const { c, row } = worldToGlobal(v.x, v.z);
      if (!blocked[row * GRID_W + c]) return;
      const r = findPath(blocked, v.x, v.z, v.x, v.z);
      const to = r[r.length - 1] ?? SPAWN;
      v.set(to.x, 0, to.z);
    };
    nudge(kidPos);
    if (!petAsleep) nudge(petPos);
    if (selected && !items.has(selected)) select(null);
    else if (selected) select(selected);
    if (!first) {
      const petThing = fresh.find((p) => getHomeItem(p.item)?.petUse);
      if (petThing && !petAsleep) window.setTimeout(() => petUse(petThing.uid, "new"), 300);
      if (petThing && petAsleep && getHomeItem(petThing.item)?.petUse === "sleep") {
        // moved house while asleep: hop into the new bed
        const spot = itemSpot(petThing.uid);
        if (spot) {
          petPos.set(spot.x, 0, spot.z);
          petYTarget = spot.y;
        }
      }
    }
    first = false;
  };

  const select = (uid: string | null) => {
    if (selected && items.has(selected)) items.get(selected)!.holder.scale.setScalar(1);
    selected = uid;
    selTiles.clear();
    const e = uid ? items.get(uid) : undefined;
    if (e) fillTiles(selTiles, e.placed, selMat);
  };

  const endGhost = () => {
    if (!ghost) return;
    ghostGroup.remove(ghost.holder, ghost.tiles);
    ghost.model.dispose();
    ghost.mats.forEach((m) => m.dispose());
    if (ghost.uid && items.has(ghost.uid)) items.get(ghost.uid)!.holder.visible = true;
    ghost = null;
  };

  const startGhost = (itemId: string, o: { uid?: string; r?: number } = {}): PlaceSpec | null => {
    endGhost();
    const def = getHomeItem(itemId);
    if (!def) return null;
    let spec: PlaceSpec | null = null;
    const moving = o.uid ? items.get(o.uid) : undefined;
    if (moving) spec = { item: itemId, room: moving.placed.room, gx: moving.placed.gx, gz: moving.placed.gz, r: moving.placed.r, wall: moving.placed.wall };
    else {
      spec = findSpot(layout.placed, itemId, viewed, o.r ?? 0);
      if (!spec) spec = findSpot(layout.placed, itemId, viewed === "den" ? "bedroom" : "den", o.r ?? 0);
    }
    if (!spec) return null;
    const model = buildItemModel(itemId, kit);
    const mats: THREE.Material[] = [];
    model.group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.Material;
      const c = src.clone();
      c.transparent = true;
      (c as THREE.MeshToonMaterial).opacity = 0.86;
      c.depthWrite = false;
      mats.push(c);
      m.material = c;
      m.castShadow = false;
      m.renderOrder = 5;
    });
    const holder = new THREE.Group();
    holder.add(model.group);
    const tiles = new THREE.Group();
    ghostGroup.add(holder, tiles);
    ghost = { itemId, uid: o.uid, r: spec.r, spec: null as unknown as PlaceSpec, ok: false, model, holder, mats, tiles };
    if (moving) moving.holder.visible = false;
    select(null);
    updateGhost(spec);
    return spec;
  };

  const turnGhost = () => {
    if (!ghost) return;
    const def = getHomeItem(ghost.itemId);
    if (!def || def.surface === "wall") return;
    ghost.r = (ghost.r + 1) % 4;
    // keep it centred where it was
    const t = placedTransform(ghost.spec);
    const s = snapFloor(ghost.itemId, t.x, t.z, ghost.r, ghost.spec.room);
    updateGhost({ item: ghost.itemId, room: s.room, gx: s.gx, gz: s.gz, r: ghost.r });
  };

  const petFx: HomePetFx = {
    react: async (mode, anim) => {
      if (mode === "feed") {
        const bowl = firstOf("eat");
        const spot = bowl ? itemSpot(bowl.uid) : null;
        if (spot) await petGo(spot);
        petBusyUntil = time + 2.6;
        opts.petAnim?.(anim);
        burst(petPos.clone().setY(0.9), "😋", 3);
        return;
      }
      if (mode === "wash") burst(petPos.clone().setY(0.8), "🫧", 12);
      else burst(petPos.clone().setY(1.2), "💖", 6);
      petBusyUntil = time + 2.4;
      opts.petAnim?.(anim);
    },
    say: (t) => petSay(t),
    status: (p) => showStatus(p),
    sleep: (on) => {
      if (petState) petState = { ...petState, isSleeping: on };
      setSleeping(on);
    },
    celebrate: () => {
      burst(petPos.clone().setY(1.3), "✨", 10);
      burst(kidPos.clone().setY(1.8), "💖", 6);
      opts.petAnim?.("gesture-positive");
    },
  };

  // first build
  applyStyles();
  setLayout(initial);
  for (const c of scene.children) own.add(c);

  const ride: HomeRide = {
    scene,
    spawnPoint: new THREE.Vector3(SPAWN.x, 0, SPAWN.z),
    bounds: 1000,
    rect: { halfX: 9.5, halfZ: 4 },
    zones: [],
    actorScale: ACTOR_SCALE,
    camera,
    playerAnchor: () => ({ position: kidPos, facing: kidFacing }),
    petAnchor: () => new THREE.Vector3(petPos.x, petY, petPos.z),
    pointer(kind, ray) {
      const p = new THREE.Vector3();
      const onFloor = ray.intersectPlane(floorPlane, p) !== null;
      if (kind === "down") {
        down = { at: onFloor ? p.clone() : new THREE.Vector3(Number.NaN, 0, 0), t: performance.now() };
        if (editing && ghost) ghostFromRay(ray);
        return;
      }
      if (kind === "move") {
        if (down && editing && ghost) ghostFromRay(ray);
        return;
      }
      const d = down;
      down = null;
      if (!d) return;
      if (editing && ghost) {
        ghostFromRay(ray);
        return;
      }
      const moved = onFloor && !Number.isNaN(d.at.x) ? d.at.distanceTo(p) : 0;
      if (moved < 0.8 && performance.now() - d.t < 600) tap(ray);
    },
    update,
    dispose() {
      endGhost();
      for (const e of items.values()) e.built.dispose();
      items.clear();
      for (const p of particles) p.s.material.dispose();
      if (bubble) clearSprite(bubble.s);
      if (statusBar) clearSprite(statusBar.s);
      disposables.forEach((d) => d.dispose());
      listeners.clear();
    },

    // ── controller ──
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setLayout,
    setEditing(on) {
      editing = on;
      gridGroup.visible = on;
      if (on) {
        viewed = kidRoom;
        kidRoute = [];
      } else {
        endGhost();
        select(null);
        preview = {};
        applyStyles();
      }
    },
    viewRoom(room) {
      viewed = room;
    },
    get viewedRoom() {
      return viewed;
    },
    startGhost,
    turnGhost,
    ghost: () => (ghost ? { spec: ghost.spec, ok: ghost.ok, uid: ghost.uid } : null),
    endGhost,
    select,
    previewStyle(room, style) {
      if (style) preview[room] = style;
      else delete preview[room];
      applyStyles();
    },
    setPet(state, name) {
      const wasAsleep = petState?.isSleeping ?? false;
      petState = state;
      if (name !== undefined) petName = name;
      if (state && state.isSleeping !== wasAsleep) setSleeping(state.isSleeping);
    },
    petFx,
    petSay,
    speech: () => (speechText ? { text: speechText, x: speechNdc.x, y: speechNdc.y } : null),
    setSpeechHud: (on: boolean) => {
      speechHud = on;
      if (bubble) bubble.s.visible = !on;
    },
    celebrate: petFx.celebrate,
  };
  return ride;
}
