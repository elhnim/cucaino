// Cucaino Karts, seen from outside in the main park world: the track ribbon, red/white kerbs,
// boost-pad arrows, the start/finish gantry, a grandstand, a little pit garage and a banner sign.
// Static primitives (no GLB loading) — candy-bright flat colours, cheap to build (one small
// circuit, nowhere near settlement-sized). The ACTUAL race runs in its own light "ride" scene
// (lib/game3d/interiors/karts.ts, built from lib/park/karts/track.ts's local-space shape, like mini
// golf's own room) for a smooth 60fps drive; this file is purely what a kid walking past sees and
// the door they tap to start one. World placement comes from registry/kartTrack.ts's
// kartTrackWorld()/kartLocalToWorld (the SAME local shape the race drives on, just placed on the
// island) so the outdoor track can never drift out of step with the real circuit. Pure three.js, no
// React, no physics.
import * as THREE from "three";
import { emojiSprite, labelSprite } from "@/lib/game3d/buildingKit";
import { buildKartTrackShape, trackAt, type KartTrack } from "../../karts/track";
import { kartLocalToWorld, kartTrackWorld, KART_PAD_HEIGHT, KART_ROTATION, KART_SITE } from "../../registry/kartTrack";

const ASPHALT = 0x4a4a55;
const ASPHALT_LINE = 0xf4e8c8;
const KERB_RED = 0xe6483c;
const KERB_WHITE = 0xfbf6ea;
const TYRE_BLACK = 0x2b2b32;
const TYRE_WHITE = 0xf4f0e6;
const GANTRY = 0xffd84a;
const GRANDSTAND_SEAT = 0x4fb7e0;
const PIT_WALL = 0xf26fa0;
const PIT_ROOF = 0xffffff;

type P2 = [number, number];

/** the circuit's painted artwork (public/park-assets/karts/, from codex-world-art/karts/): loaded
 *  once and shared by the park's view of the circuit and the race itself */
const artCache = new Map<string, THREE.Texture>();
function art(name: string, repeat = false): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  let t = artCache.get(name);
  if (!t) {
    t = new THREE.TextureLoader().load(`/park-assets/karts/${name}.webp`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    artCache.set(name, t);
  }
  return t;
}
/** a painted surface: the picture, glowing a touch so it reads at dusk */
function painted(name: string, fallback: number, repeat = false): THREE.MeshStandardMaterial {
  const map = art(name, repeat);
  return new THREE.MeshStandardMaterial({ map: map ?? undefined, color: map ? 0xffffff : fallback, roughness: 0.85, emissive: 0xffffff, emissiveMap: map ?? undefined, emissiveIntensity: map ? 0.18 : 0, side: THREE.DoubleSide });
}

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.02, ...opts });
}

/** local (x, z) -> world (x, z), as a plain tuple (kartLocalToWorld takes/returns {x,z} objects) */
function toWorld(x: number, z: number): P2 {
  const w = kartLocalToWorld(KART_SITE, KART_ROTATION, { x, z });
  return [w.x, w.z];
}
/** a local HEADING (radians, atan2(dx,dz) convention) turned the same way toWorld turns a point */
function toWorldYaw(yaw: number): number {
  return yaw + KART_ROTATION;
}

/** a flat ribbon of `width` along a closed world-space polyline, as one triangle-strip mesh */
function ribbonMesh(poly: P2[], width: number, color: number, y = 0.02, surface?: string): THREE.Mesh {
  const n = poly.length;
  const pos: number[] = [];
  const uv: number[] = [];
  let along = 0;
  for (let i = 0; i <= n; i++) {
    const a = poly[i % n];
    const b = poly[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const px = (dz / l) * (width / 2);
    const pz = (-dx / l) * (width / 2);
    pos.push(a[0] - px, y, a[1] - pz, a[0] + px, y, a[1] + pz);
    // (u runs along the track — the asphalt's rubber lines follow the racing line — v across it)
    uv.push(along / 9, 0, along / 9, 1);
    along += l;
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = surface ? painted(surface, color, true) : mat(color, { side: THREE.DoubleSide });
  // (drawn a hair nearer than the grass it lies on, so it never flickers against it from far above)
  m.polygonOffset = true;
  m.polygonOffsetFactor = -3;
  m.polygonOffsetUnits = -3;
  return new THREE.Mesh(geo, m);
}

/** short alternating red/white kerb blocks hugging both edges of the track */
function buildKerbs(poly: P2[], width: number): THREE.Group {
  const g = new THREE.Group();
  const step = 3.2;
  const cum: number[] = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = cum[cum.length - 1];
  const blockGeo = new THREE.BoxGeometry(0.9, 0.16, step * 0.92);
  const matRed = mat(KERB_RED);
  const matWhite = mat(KERB_WHITE);
  for (let s = 0, k = 0; s < total; s += step, k++) {
    let i = 0;
    while (i < cum.length - 1 && cum[i + 1] < s) i++;
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.max(0, Math.min(1, (s - cum[i]) / segLen));
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    const dx = (b[0] - a[0]) / segLen;
    const dz = (b[1] - a[1]) / segLen;
    const yaw = Math.atan2(dx, dz);
    for (const side of [-1, 1]) {
      const px = x + dz * side * (width / 2 + 0.5);
      const pz = z - dx * side * (width / 2 + 0.5);
      const block = new THREE.Mesh(blockGeo, k % 2 === 0 ? matRed : matWhite);
      block.position.set(px, 0.08, pz);
      block.rotation.y = yaw;
      g.add(block);
    }
  }
  return g;
}

/** a glowing arrow decal for a boost pad, flush on the road, pointing the way round the lap */
function buildBoostArrow(x: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0.03, z);
  g.rotation.y = yaw;
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 3.2);
  arrowShape.lineTo(-1.6, 0.6);
  arrowShape.lineTo(-0.6, 0.6);
  arrowShape.lineTo(-0.6, -3.2);
  arrowShape.lineTo(0.6, -3.2);
  arrowShape.lineTo(0.6, 0.6);
  arrowShape.lineTo(1.6, 0.6);
  arrowShape.closePath();
  const geo = new THREE.ShapeGeometry(arrowShape);
  geo.rotateX(-Math.PI / 2);
  const glow = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xffb300, emissiveIntensity: 1.1, roughness: 0.4, side: THREE.DoubleSide }));
  g.add(glow);
  const light = new THREE.PointLight(0xffd34d, 0.6, 9, 2);
  light.position.set(0, 1.2, 0);
  g.add(light);
  return g;
}

/** the start/finish gantry: two posts, a checkered crossbeam, three countdown "lights", a banner */
function buildGantry(x: number, z: number, yaw: number, halfWidth: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const postGeo = new THREE.CylinderGeometry(0.35, 0.4, 6.4, 8);
  const postMat = mat(GANTRY);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(side * (halfWidth + 1), 3.2, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + 3, 1.1, 0.7), postMat);
  beam.position.set(0, 6.2, 0);
  g.add(beam);
  const checkSize = 0.55;
  const cols = Math.round((halfWidth * 2 + 2) / checkSize);
  const blackMat = mat(0x201e24);
  const whiteMat = mat(0xf6f3ea);
  for (let i = 0; i < cols; i++) {
    const sq = new THREE.Mesh(new THREE.BoxGeometry(checkSize, checkSize, 0.1), i % 2 === 0 ? blackMat : whiteMat);
    sq.position.set(-((cols - 1) * checkSize) / 2 + i * checkSize, 5.55, 0.42);
    g.add(sq);
  }
  const lightColors = [0xff5050, 0xffd24a, 0x58e06a];
  lightColors.forEach((c, i) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5 }));
    lamp.position.set(-2.4 + i * 2.4, 6.9, 0.4);
    g.add(lamp);
  });
  const banner = labelSprite("Cucaino Karts");
  banner.scale.set(5.2, 1.6, 1);
  banner.position.set(0, 7.8, 0);
  g.add(banner);
  const icon = emojiSprite("🏎️", 1.6);
  icon.position.set(0, 9.0, 0);
  g.add(icon);
  return g;
}

/** a cheap tiered grandstand with a scatter of candy-coloured "folk" (no rig — just stacked
 *  primitives, far cheaper than a chibi for background crowd that's never interacted with) */
// exported so the race's own ride scene (lib/game3d/interiors/karts.ts) can place the SAME
// grandstand/pit garage in its local track space — both read the same track shape, so "where the
// stand sits relative to the finish line" never drifts between the outdoor view and the ride.
export function buildGrandstand(x: number, z: number, faceYaw: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = faceYaw;
  const rows = 4;
  const frameMat = mat(0xffffff, { roughness: 0.95 });
  const peopleColors = [0xff6f91, 0xffd24a, 0x58c4e0, 0x8bd96a, 0xc98bf0];
  // the stand itself is the painted picture — tiers of red, yellow and blue seats under a striped
  // canopy — leaning back behind the folk, on a plain white deck
  const W = 15;
  const Hs = 10;
  const lean = 0.5;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, Hs), painted("grandstand", GRANDSTAND_SEAT));
  panel.rotation.x = -lean;
  panel.position.set(0, (Hs / 2) * Math.cos(lean) + 0.2, -(Hs / 2) * Math.sin(lean) - 0.6);
  panel.castShadow = true;
  g.add(panel);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, 2.2), frameMat);
  deck.position.set(0, 0.2, 0.2);
  g.add(deck);
  for (let r = 0; r < rows; r++) {
    for (let p = 0; p < 6; p++) {
      const px = -6 + p * 2.4 + (r % 2) * 0.5;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 2, 6), mat(peopleColors[(p + r) % peopleColors.length]));
      // (seated up the leaning stand, a little in front of the picture)
      const fy = 1.3 + r * 1.35;
      const fz = -fy * Math.tan(lean) - 0.15;
      body.position.set(px, fy, fz);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mat(0xffe0bd));
      head.position.set(px, fy + 0.45, fz);
      g.add(body, head);
    }
  }
  return g;
}

function buildMiniParkedKart(color: number): THREE.Group {
  const g = new THREE.Group();
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 2.1), mat(color));
  chassis.position.y = 0.42;
  g.add(chassis);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 8), mat(color));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.42, 1.3);
  g.add(nose);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 10);
  const wheelMat = mat(0x201e24);
  for (const [wx, wz] of [
    [-0.72, 0.8],
    [0.72, 0.8],
    [-0.72, -0.8],
    [0.72, -0.8],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.34, wz);
    g.add(wheel);
  }
  return g;
}

/** the pit garage: the "go-karts" door (registry/places.ts) sits just outside it — a simple
 *  building with an awning, plus two "parked" candy go-karts out front for flavour */
export function buildPitGarage(x: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  // the painted pit and race-control building: white and red boards, three open garages below a
  // glazed control room, a chequered band between (its front on the wall that faces the track)
  const front = painted("pit-front", PIT_WALL);
  const side = painted("pit-side", PIT_WALL);
  const plain = mat(PIT_ROOF);
  // (BoxGeometry's faces: +x, -x, +y, -y, +z, -z — the track is on the -z side)
  const body = new THREE.Mesh(new THREE.BoxGeometry(10.5, 7, 7), [side, side, plain, plain, side, front]);
  body.position.set(0, 3.5, 2.6);
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11.1, 0.4, 7.6), mat(0xc8262b));
  roof.position.set(0, 7.2, 2.6);
  g.add(roof);
  for (const side of [-3.2, 3.2]) {
    const kart = buildMiniParkedKart(0xff5fa8);
    kart.position.set(side, 0, -2.6);
    kart.rotation.y = Math.PI;
    g.add(kart);
  }
  return g;
}

/** tyre-wall stacks outside the sharper corners (chicane/hairpin), so they read as a real barrier */
function buildTyreWalls(shape: KartTrack): THREE.Group {
  const g = new THREE.Group();
  const stackGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.42, 12);
  const matA = mat(TYRE_BLACK);
  const matB = mat(TYRE_WHITE);
  const half = shape.width / 2;
  for (const c of shape.corners) {
    if (c.kind !== "hairpin" && c.kind !== "chicane") continue;
    const mid = (c.s0 + c.s1) / 2 > c.s0 ? (c.s0 + c.s1) / 2 : c.s0; // s1 may wrap past 0
    for (let off = -6; off <= 6; off += 3) {
      const s = mid + off;
      const at = trackAt(shape, s);
      for (let row = 0; row < 2; row++) {
        const lx = at.x + at.dz * (half + 1.8 + row * 0.9);
        const lz = at.z - at.dx * (half + 1.8 + row * 0.9);
        const [wx, wz] = toWorld(lx, lz);
        const tyre = new THREE.Mesh(stackGeo, Math.round(off / 3 + row) % 2 === 0 ? matA : matB);
        tyre.position.set(wx, 0.21 + row * 0.42, wz);
        g.add(tyre);
      }
    }
  }
  return g;
}

/** builds the whole circuit as seen from outside in the main park: track, kerbs, boost arrows,
 *  gantry, grandstand, pit garage, tyre walls. One call, added straight into the park's scene. */
export function buildKartTrack(): THREE.Group {
  const g = new THREE.Group();
  g.name = "cucaino-karts";
  // the real ground here isn't dead flat (rawHeight varies a few units round the loop) — the whole
  // circuit settles to ONE shared pad height (registry/kartTrack.ts's KART_PAD_HEIGHT, the same
  // number terrain.ts's stamps level the ground to), like a settlement's own settlePadHeight, so it
  // reads as graded, not dug into a trench or floating above the grass
  g.position.y = KART_PAD_HEIGHT;
  const shape = buildKartTrackShape();
  const world = kartTrackWorld();
  const poly: P2[] = world.points.map((p) => [p.x, p.z]);

  g.add(ribbonMesh(poly, world.width, ASPHALT, 0.02, "asphalt"));
  g.add(ribbonMesh(poly, 0.35, ASPHALT_LINE, 0.03));
  g.add(buildKerbs(poly, world.width));
  g.add(buildTyreWalls(shape));

  for (const pad of shape.boostPads) {
    const at = trackAt(shape, pad.s);
    const ahead = trackAt(shape, pad.s + 2);
    const [x, z] = toWorld(at.x, at.z);
    const yaw = toWorldYaw(Math.atan2(ahead.x - at.x, ahead.z - at.z));
    g.add(buildBoostArrow(x, z, yaw));
  }

  const startAt = trackAt(shape, 0);
  const [gx, gz] = toWorld(startAt.x, startAt.z);
  g.add(buildGantry(gx, gz, toWorldYaw(Math.atan2(startAt.dx, startAt.dz)), world.width / 2));

  // the grandstand looks back over the line from the first "sweeper" after the start, set back off
  // the track's outside edge
  const sweeper = shape.corners.find((c) => c.kind === "sweeper") ?? shape.corners[0];
  const standS = (sweeper.s0 + sweeper.s1) / 2;
  const standAt = trackAt(shape, standS);
  const standLocalX = standAt.x + standAt.dz * (world.width / 2 + 14);
  const standLocalZ = standAt.z - standAt.dx * (world.width / 2 + 14);
  const [sx, sz] = toWorld(standLocalX, standLocalZ);
  const toLine = Math.atan2(startAt.x - standLocalX, startAt.z - standLocalZ);
  g.add(buildGrandstand(sx, sz, toWorldYaw(toLine)));

  // the pit garage: just off the start/finish straight, opposite the grandstand's side
  const pitLocalX = startAt.x - startAt.dz * (world.width / 2 + 9);
  const pitLocalZ = startAt.z + startAt.dx * (world.width / 2 + 9);
  const [px, pz] = toWorld(pitLocalX, pitLocalZ);
  const pitYaw = Math.atan2(startAt.x - pitLocalX, startAt.z - pitLocalZ);
  g.add(buildPitGarage(px, pz, toWorldYaw(pitYaw)));

  return g;
}

/** the "go-karts" door's world position (registry/places.ts's PlaceDef) — just in front of the pit
 *  garage, facing the start/finish straight */
export function kartDoorWorld(): P2 {
  const shape = buildKartTrackShape();
  const startAt = trackAt(shape, 0);
  const localX = startAt.x - startAt.dz * (shape.width / 2 + 5);
  const localZ = startAt.z + startAt.dx * (shape.width / 2 + 5);
  return toWorld(localX, localZ);
}
