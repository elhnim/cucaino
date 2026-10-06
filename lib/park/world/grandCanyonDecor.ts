// The Grand Canyon's own hand-built scenery: the river at the bottom, desert plants and red
// boulders scattered across the rim, the watchtower and the Skywalk's own look (their WALKABILITY
// + invisible railings are registry/grandCanyon.ts's grandCanyonDeckY, plugged into
// registry/harbours.ts/ParkWorld.ts already — this file only draws what's there), the rim lodge, a
// couple of standing mules, a few bighorn sheep on the ledges, and condors circling on the warm air
// rising out of the gorge. The canyon's actual SHAPE (the terraces, the buttes, the strata) is the
// island's ordinary height-field terrain + groundColor()'s canyon-local override — this is just the
// small, cheap, hand-placed dressing on top of it (the same idea as everestDecor.ts: built once,
// unconditionally, since the footprint is bounded and the draw-call budget is small — no streaming
// needed, same discipline as Everest's own summit flag/glacier/seracs).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  alongToWorld,
  CANYON_BAND_GLSL,
  CANYON_LODGE,
  CANYON_RIVER_SPAN,
  CANYON_SIDE_CANYONS,
  CANYON_SITE,
  CANYON_SKYWALK,
  CANYON_TRAILHEAD,
  CANYON_WATCHTOWER,
  canyonAxisPointAt,
  canyonChannelHalfWidthAt,
  canyonDesertK,
  canyonPlateauRaise,
  canyonProfilePoint,
  CANYON_BUTTES,
  MULE_ALONG,
  canyonMainTerraceFloorY,
  canyonTerraceFloorY,
  canyonVisualFloorY,
  grandCanyonGroundY,
  nearCanyonFootpath,
  nearGrandCanyon,
  type SideCanyon,
} from "../registry/grandCanyon";
import { rawHeight } from "../registry/landform";
import { groundY } from "../registry/terrain";
import { smoothstep } from "../registry/geom2d";

/** round-6's own root cause, fixed here for good: an InstancedMesh's own capacity (the `count`
 *  passed to `new THREE.InstancedMesh(geo, mat, count)`) and its scatter loop's own fill cap must
 *  always agree. They drifted apart here once already (canyon-sage capped its loop at 140 but was
 *  only built with room for 90; canyon-cactus-flowers capped at 80 but built with room for 70) —
 *  every instance past the mesh's own real capacity reads UNINITIALIZED GPU buffer memory as its
 *  transform matrix: a garbage-scaled, garbage-rotated copy of the geometry that can blank the
 *  whole frame to a flat colour (the "black screen"/"green slab" bug) depending on what garbage
 *  values happen to be sitting in that memory. Always set an instanced mesh's active count through
 *  this, never `mesh.count = n` directly, so a future capacity/loop-cap mismatch fails LOUDLY (a
 *  thrown error during world-build) instead of silently painting garbage triangles into the sky. */
function setInstanceCount(mesh: THREE.InstancedMesh, n: number): void {
  if (n > mesh.instanceMatrix.count) {
    throw new Error(`grandCanyonDecor: "${mesh.name || "(unnamed instanced mesh)"}" filled ${n} instances but was only built with room for ${mesh.instanceMatrix.count} — raise its own "new THREE.InstancedMesh(geo, mat, count)" to match the scatter loop's own cap`);
  }
  mesh.count = n;
}

/** a tiny deterministic hash (0..1) and a seeded PRNG, the same little trick every other
 *  registry/world module in the park uses */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const groundAt = (x: number, z: number) => grandCanyonGroundY(x, z, rawHeight(x, z)) ?? groundY(x, z);
/** how close to the flat rim (x, z) is: ~0 right on it, growing the further down a cliff/terrace it is */
function belowRim(x: number, z: number): number {
  const rim = rawHeight(x, z) + canyonPlateauRaise(x, z);
  return Math.max(0, rim - groundAt(x, z));
}

// ── materials (plain, cheap toon-ish materials — no shaders beyond the river's gentle shimmer) ──
const WOOD = new THREE.MeshStandardMaterial({ color: "#8a6238", roughness: 0.85 });
const STONE = new THREE.MeshStandardMaterial({ color: "#9a7a62", roughness: 0.9 });
const STONE_DARK = new THREE.MeshStandardMaterial({ color: "#6e5648", roughness: 0.9 });
const ROOF = new THREE.MeshStandardMaterial({ color: "#7a4a36", roughness: 0.8 });
const RAIL = new THREE.MeshStandardMaterial({ color: "#5c3e2a", roughness: 0.8 });
const GLASS = new THREE.MeshStandardMaterial({ color: "#7fd4e8", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 });
const GLASS_EDGE = new THREE.MeshStandardMaterial({ color: "#2a4a52", roughness: 0.6 });
const CACTUS_GREEN = new THREE.MeshStandardMaterial({ color: "#5a8a4a", roughness: 0.85 });
const CACTUS_FLOWER = new THREE.MeshStandardMaterial({ color: "#e85c8a", roughness: 0.7 });
const YUCCA_GREEN = new THREE.MeshStandardMaterial({ color: "#6a9a52", roughness: 0.85 });
const SAGE_GREEN = new THREE.MeshStandardMaterial({ color: "#8a9a6a", roughness: 0.9 });
const JUNIPER_GREEN = new THREE.MeshStandardMaterial({ color: "#4a6a3e", roughness: 0.9 });
const JUNIPER_TRUNK = new THREE.MeshStandardMaterial({ color: "#5c4432", roughness: 0.9 });
const BOULDER = new THREE.MeshStandardMaterial({ color: "#a5583a", roughness: 0.95 });
const SHEEP_COAT = new THREE.MeshStandardMaterial({ color: "#c9b89a", roughness: 0.9 });
const SHEEP_HORN = new THREE.MeshStandardMaterial({ color: "#6e5a44", roughness: 0.7 });
const MULE_COAT = new THREE.MeshStandardMaterial({ color: "#7a6a5c", roughness: 0.9 });
const MULE_MANE = new THREE.MeshStandardMaterial({ color: "#3e332a", roughness: 0.85 });
const MULE_MUZZLE = new THREE.MeshStandardMaterial({ color: "#5a4c42", roughness: 0.85 });
const MULE_BLANKET = new THREE.MeshStandardMaterial({ color: "#a53c3c", roughness: 0.8 });
const MULE_PACK = new THREE.MeshStandardMaterial({ color: "#6b4a30", roughness: 0.85 });
const CONDOR_BODY = new THREE.MeshStandardMaterial({ color: "#2a2622", roughness: 0.8 });
const CONDOR_HEAD = new THREE.MeshStandardMaterial({ color: "#d9c48a", roughness: 0.7 });

function group(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

// ── the watchtower: a short stone tower, a railed viewing platform on top (walkable via
// grandCanyonDeckY — this just draws it) ──
function buildWatchtower(): THREE.Group {
  const g = group("canyon-watchtower");
  const base = groundAt(CANYON_WATCHTOWER.x, CANYON_WATCHTOWER.z);
  const topY = base + 7;
  g.position.set(CANYON_WATCHTOWER.x, base, CANYON_WATCHTOWER.z);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 7, 10), STONE);
  tower.position.y = 3.5;
  tower.castShadow = true;
  g.add(tower);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.4, 14), WOOD);
  deck.position.y = 7.2;
  g.add(deck);
  const railPost = new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6);
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const post = new THREE.Mesh(railPost, RAIL);
    post.position.set(Math.sin(a) * 4.8, 7.95, Math.cos(a) * 4.8);
    g.add(post);
  }
  const railRing = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.08, 6, 24), RAIL);
  railRing.rotation.x = Math.PI / 2;
  railRing.position.y = 8.45;
  g.add(railRing);
  const roofC = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.2, 10), ROOF);
  roofC.position.y = 9.6;
  g.add(roofC);
  void topY;
  return g;
}

// ── the Skywalk: a railed, glass-floored horseshoe balcony on a short walk out from the rim ──
function buildSkywalk(): THREE.Group {
  const g = group("canyon-skywalk");
  const y = groundAt(CANYON_SKYWALK.x, CANYON_SKYWALK.z) - 0.05;
  g.position.set(CANYON_SKYWALK.x, y, CANYON_SKYWALK.z);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.5, 20, 1, false, 0, Math.PI), WOOD);
  g.add(deck);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.08, 20, 1, false, 0, Math.PI), GLASS);
  glass.position.y = 0.3;
  g.add(glass);
  // a dark mullion ring round the glass panel's own edge, so it reads as a distinct see-through
  // panel set into the wood deck, not just a pale patch
  const edge = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.09, 6, 24, Math.PI), GLASS_EDGE);
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.3;
  g.add(edge);
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 5), RAIL);
    post.position.set(Math.sin(a) * 8.7, 0.75, Math.cos(a) * 8.7);
    g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(8.7, 0.07, 6, 24, Math.PI), RAIL);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 1.25;
  g.add(rail);
  // a couple of steel support struts underneath, cantilevered out past the rim (just for the look)
  for (const s of [-5, 0, 5]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 10, 6), STONE_DARK);
    strut.rotation.x = Math.PI / 2.6;
    strut.position.set(s, -3.5, 3);
    g.add(strut);
  }
  return g;
}

/** the rim lodge: a small timber-and-stone visitor hut */
/** the Canyon Rim Outpost's own ranger lodge: real stone walls, a heavy timber porch and a
 *  pitched shingle roof — built to read as a proper ranger station, not a tent camp (the
 *  settlement itself only supplies a couple of small tents for the roster's own homes; this
 *  building is the one every camera sees) */
function buildLodge(): THREE.Group {
  const g = group("canyon-lodge");
  const y = groundAt(CANYON_LODGE.x, CANYON_LODGE.z);
  g.position.set(CANYON_LODGE.x, y, CANYON_LODGE.z);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.8, 6.5), STONE);
  walls.position.y = 1.9;
  walls.castShadow = true;
  g.add(walls);
  // a timber-framed upper gable (stone below, log-built above — a classic lodge look)
  const gableWall = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.4, 6.5), WOOD);
  gableWall.position.y = 4.5;
  g.add(gableWall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.8, 4), ROOF);
  roof.position.y = 6.6;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 1.25);
  roof.castShadow = true;
  g.add(roof);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), STONE_DARK);
  chimney.position.set(-2.6, 5.2, -1.5);
  g.add(chimney);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.3, 2.8), WOOD);
  porch.position.set(0, 0.15, 4.2);
  g.add(porch);
  for (const dx of [-4, 0, 4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 2.8, 7), WOOD);
    post.position.set(dx, 1.6, 5.3);
    g.add(post);
  }
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 3.2), ROOF);
  porchRoof.position.set(0, 3.05, 4.4);
  porchRoof.rotation.x = -0.12;
  g.add(porchRoof);
  // a hanging sign
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6), WOOD);
  signPost.position.set(4.8, 1.2, 5.4);
  g.add(signPost);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.1), WOOD);
  signBoard.position.set(4.8, 2.3, 5.4);
  g.add(signBoard);
  return g;
}

/** a small timber supply shed beside the lodge (saddles, rope, feed for the mules) — a second
 *  real building so the outpost reads as a little ranger station, not one hut alone */
function buildSupplyShed(): THREE.Group {
  const g = group("canyon-supply-shed");
  const a = Math.atan2(CANYON_SITE.x - CANYON_LODGE.x, CANYON_SITE.z - CANYON_LODGE.z) + 1.9;
  const x = CANYON_LODGE.x + Math.sin(a) * 9;
  const z = CANYON_LODGE.z + Math.cos(a) * 9;
  const y = groundAt(x, z);
  g.position.set(x, y, z);
  g.rotation.y = a;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.4), WOOD);
  walls.position.y = 1.2;
  walls.castShadow = true;
  g.add(walls);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 3.8), ROOF);
  roof.position.y = 2.55;
  roof.rotation.x = -0.18;
  g.add(roof);
  for (let i = 0; i < 2; i++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10), STONE_DARK);
    barrel.position.set(2.6, 0.45, -1 + i * 1.3);
    g.add(barrel);
  }
  return g;
}

/** a standing mule (decorative — the ride's own mount is a chibi guide via climbRoutes.ts), built
 *  as a proper pack animal: body, a raised neck carrying a real head (tapered snout, not a plain
 *  box), ears, a short tail, four legs, a cross-back saddle blanket and two hanging pack bags —
 *  not just "a capsule body on stick legs" (round-3 feedback), since this is the ride's own
 *  trailhead mascot and sits in several close-range shots */
function buildMule(): THREE.Group {
  const g = group("canyon-mule");
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 1.3, 4, 8), MULE_COAT);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.15;
  body.castShadow = true;
  g.add(body);
  // neck: a shorter, narrower capsule angled up from the shoulders to the head, so the head reads
  // as carried forward and up rather than welded straight onto the body
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.55, 4, 7), MULE_COAT);
  neck.position.set(0, 1.56, 0.78);
  neck.rotation.x = -0.95;
  neck.castShadow = true;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.55), MULE_COAT);
  head.position.set(0, 1.86, 1.18);
  g.add(head);
  // a tapered muzzle (narrower box, darker) so the face reads as a mule's long snout, not a block
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.42), MULE_MUZZLE);
  muzzle.position.set(0, 1.74, 1.52);
  g.add(muzzle);
  for (const ex of [-0.2, 0.2]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.48, 6), MULE_MANE);
    ear.position.set(ex, 2.22, 1.04);
    ear.rotation.z = ex * 0.5;
    g.add(ear);
  }
  for (const [lx, lz] of [
    [-0.32, 0.5],
    [0.32, 0.5],
    [-0.32, -0.5],
    [0.32, -0.5],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 1.1, 6), MULE_COAT);
    leg.position.set(lx, 0.55, lz);
    leg.castShadow = true;
    g.add(leg);
  }
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.7), MULE_MANE);
  mane.position.set(0, 1.9, 0.68);
  mane.rotation.x = -0.95;
  g.add(mane);
  // a short tapered tail with a dark tuft at the end
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.75, 6), MULE_COAT);
  tail.position.set(0, 0.95, -0.82);
  tail.rotation.x = 0.35;
  g.add(tail);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), MULE_MANE);
  tuft.position.set(0, 0.63, -1.05);
  g.add(tuft);
  // a draped saddle blanket over the back
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.9), MULE_BLANKET);
  blanket.position.set(0, 1.68, 0.05);
  g.add(blanket);
  // two hanging pack bags, one each side
  for (const sx of [-1, 1]) {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.5), MULE_PACK);
    pack.position.set(sx * 0.52, 1.32, 0.05);
    pack.castShadow = true;
    g.add(pack);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.06), MULE_PACK);
    strap.position.set(sx * 0.5, 1.5, 0.05);
    g.add(strap);
  }
  return g;
}

/** a bighorn sheep, idling on a ledge */
function buildSheep(): THREE.Group {
  const g = group("canyon-sheep");
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 7), SHEEP_COAT);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.62;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), SHEEP_COAT);
  head.position.set(0, 0.8, 0.55);
  g.add(head);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 5, 10, Math.PI * 1.3), SHEEP_HORN);
    horn.position.set(s * 0.16, 0.95, 0.5);
    horn.rotation.y = s * 0.5;
    horn.rotation.z = 0.6;
    g.add(horn);
  }
  for (const [lx, lz] of [
    [-0.18, 0.28],
    [0.18, 0.28],
    [-0.18, -0.28],
    [0.18, -0.28],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.56, 5), SHEEP_COAT);
    leg.position.set(lx, 0.28, lz);
    g.add(leg);
  }
  return g;
}

// ── desert flora (instanced, built once) ──
/** a saguaro: a tall fluted trunk with 1-2 upturned arms (a bent elbow + a vertical forearm) — the
 *  single most recognisable Arizona desert plant, not just a plain green cylinder */
function buildSaguaroGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.26, 0.32, 2.0, 9);
  trunk.translate(0, 1.0, 0);
  parts.push(trunk);
  const trunkTop = new THREE.SphereGeometry(0.26, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  trunkTop.translate(0, 2.0, 0);
  parts.push(trunkTop);
  // two arms, each: a short elbow bent out from the trunk, then a vertical forearm reaching back up
  for (const [ax, elbowY, armLen, side] of [
    [0.3, 1.05, 0.95, 1],
    [-0.27, 1.45, 0.72, -1],
  ] as const) {
    const elbow = new THREE.CylinderGeometry(0.15, 0.2, 0.55, 7);
    elbow.rotateZ((side * Math.PI) / 2.6);
    elbow.translate(ax * 0.75, elbowY, 0);
    parts.push(elbow);
    const forearm = new THREE.CylinderGeometry(0.13, 0.16, armLen, 7);
    forearm.translate(ax * 1.35, elbowY + armLen / 2 + 0.12, 0);
    parts.push(forearm);
    const cap = new THREE.SphereGeometry(0.13, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(ax * 1.35, elbowY + armLen + 0.12, 0);
    parts.push(cap);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("grandCanyonDecor: saguaro mergeGeometries failed");
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}
function buildBoulderGeometry(rnd: () => number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.8 + rnd() * 0.4), pos.getY(i) * (0.6 + rnd() * 0.3), pos.getZ(i) * (0.8 + rnd() * 0.4));
  }
  g.computeVertexNormals();
  return g;
}

// ── the cliff walls: the canyon's own dramatic faces, redrawn as real geometry (near-vertical
// cliffs + flat benches, lofted straight off the real terrace profile — registry/grandCanyon.ts's
// canyonProfilePoint — so it sits flush with the terrain underneath) with a PER-FRAGMENT banded
// shader (CANYON_BAND_GLSL) instead of per-vertex colour. The shared height-field terrain mesh is
// too coarse to hold a crisp band on a near-vertical face (one triangle can span most of a band's
// own height, so Gouraud interpolation blurs the edge into a diagonal smear); a dedicated surface
// built and coloured on its own sidesteps that entirely — the bands read sharp and perfectly
// horizontal from any distance. One mesh, one draw call, built once (not streamed: the footprint is
// bounded and this is cheap — a few thousand triangles). ──
/** vertical fluting/buttress relief: how far outward (in world units) a whole along-ring of the
 *  wall pushes, varying smoothly along the canyon's length so the face reads as a real rock wall
 *  with alternating buttresses and re-entrant alcoves (like the real Redwall Limestone's own
 *  fluted faces) rather than one dead-flat plane. Two layered frequencies keep it from looking
 *  mechanically regular; it never goes negative (staying a comfortably positive push at every
 *  along) so a ring can never fold back past its neighbour and self-intersect. */
function flutingOffset(along: number, side: number): number {
  const a = along * 0.046 + side * 2.35;
  const lobe = 0.5 + 0.5 * Math.sin(a);
  const ripple = 0.6 + 0.4 * Math.sin(a * 2.7 + 1.3);
  return 0.6 + 1.6 * lobe * ripple;
}
function buildCliffWalls(): THREE.Mesh {
  const ALONG_STEP = 6;
  const ALONG_MIN = -300;
  const ALONG_MAX = 300;
  // explicit u samples, clustered tightly round the 3 real cliff transitions (registry/
  // grandCanyon.ts's canyonTerraceFrac: ~0.07-0.1, ~0.4-0.44, ~0.68-0.73) — a uniform spacing
  // coarser than one of those near-vertical bands would connect "below the cliff" on one ring to
  // "above the cliff" on its neighbour, lofting a twisted sliver of a triangle between them (it
  // read as thin dark spikes poking out of the slopes); sampling densely exactly where the real
  // profile is steep keeps every ring's own cliff aligned with its neighbours'.
  const US = [0.085, 0.095, 0.1, 0.108, 0.115, 0.13, 0.17, 0.22, 0.28, 0.34, 0.39, 0.405, 0.415, 0.425, 0.435, 0.44, 0.46, 0.5, 0.56, 0.62, 0.665, 0.682, 0.69, 0.698, 0.706, 0.714, 0.73, 0.76, 0.82, 0.89, 0.96, 1.03, 1.14];
  const U_N = US.length;
  const alongs: number[] = [];
  for (let a = ALONG_MIN; a <= ALONG_MAX; a += ALONG_STEP) alongs.push(a);

  const positions: number[] = [];
  const indices: number[] = [];
  const outward = new THREE.Vector3();
  for (const side of [1, -1] as const) {
    const base = positions.length / 3;
    for (const along of alongs) {
      const fo = flutingOffset(along, side);
      for (let k = 0; k < U_N; k++) {
        const u = US[k];
        const p = canyonProfilePoint(along, side, u);
        // the CRISP visual floor (real near-vertical cliffs, true flat benches) is what this mesh
        // actually draws; it stands provably at-or-above the much-softened height field the kid
        // walks on everywhere (canyonTerraceFracSoft's transitions are strictly wider than and
        // nested around canyonTerraceFrac's own, so the crisp plateau is always reached first), but
        // the max() + lift below is a cheap, explicit safety net against that ever being violated by
        // a side-canyon interaction — the one failure mode that reads as "terrain poking through
        // the cliff face" instead of a clean lofted wall. round 7: canyonMainTerraceFloorY, NOT
        // canyonVisualFloorY (nor even canyonTerraceFloorY) — this wall must never also hug a
        // butte's own protected disc OR a side canyon's own mouth-taper, either of which sits at a
        // u this mesh's own US sampling (tuned for the three real MAIN terrace cliffs only) was
        // never dense enough to resolve smoothly — exactly what read as "hard scribbled fluting"
        // standing proud of the real rock at the wrong height. Buttes are their own dense,
        // standalone mesas (buildButteMesas); side canyons get their own properly-sampled wall
        // (buildSideCanyonWalls) — the main wall only ever represents the main gorge's own terraces.
        const crispY = canyonMainTerraceFloorY(p.x, p.z, rawHeight(p.x, p.z)) ?? rawHeight(p.x, p.z) + canyonPlateauRaise(p.x, p.z);
        const softY = grandCanyonGroundY(p.x, p.z, rawHeight(p.x, p.z)) ?? rawHeight(p.x, p.z) + canyonPlateauRaise(p.x, p.z);
        const y = Math.max(crispY, softY);
        // nudge the wall a hair outward (away from the canyon's own centre) so it doesn't z-fight
        // the terrain it's drawn flush against — the outward direction is just the direction the
        // profile itself is already moving in as u grows, no extra export needed
        const p2 = canyonProfilePoint(along, side, Math.min(US[US.length - 1], u + 0.01));
        outward.set(p2.x - p.x, 0, p2.z - p.z);
        if (outward.lengthSq() > 1e-6) outward.normalize();
        positions.push(p.x + outward.x * fo, y + 0.05, p.z + outward.z * fo);
      }
    }
    for (let i = 0; i + 1 < alongs.length; i++) {
      // leave a gap in the wall along the mule trail's own corridor (side +1 only — the trail
      // never rides the far side): the ride's camera sits right up against these same near-
      // vertical faces, and would otherwise clip straight through this decor skin
      if (side > 0 && Math.abs(alongs[i] - MULE_ALONG) < 45) continue;
      for (let k = 0; k + 1 < U_N; k++) {
        const a0 = base + i * U_N + k;
        const b0 = base + (i + 1) * U_N + k;
        if (side > 0) indices.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        else indices.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  // flat (faceted) shading: smooth vertex normals averaged straight across a near-vertical
  // cliff/flat-bench crease point the wrong way at the seam, reading as dark spiky artifacts —
  // flat shading derives each face's own normal from screen-space derivatives instead, giving a
  // clean faceted terrace look (which also suits this low-poly park's own style)
  // DoubleSide: the kid walks INSIDE the canyon, between the two walls, so the camera is always on
  // the concave (inward) side of whichever wall is in view — the wall's own winding/normal would
  // need to face inward to show up under FrontSide culling there, which doesn't hold for every
  // viewpoint (looking back the other way, or from outside the rim); simplest and robust is to
  // just draw both faces.
  const mesh = new THREE.Mesh(geo, bandedWallMaterial());
  mesh.name = "canyon-cliff-walls";
  // neither casts nor receives shadows: a custom onBeforeCompile material sampling the shadow map
  // too (receiveShadow) was an occasional black-frame hazard under software rendering (a shader
  // program/link race) — this mesh's own banding is the whole point, a shadow falling across it
  // would just dim it, so it's no real loss
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

/** the same crisp per-fragment banded shader buildCliffWalls() uses, factored out so the side-
 *  canyon walls and the butte mesas (below) read the identical strata — one rock, one palette,
 *  wherever a cliff face is drawn in the canyon. A single shared material instance (not a fresh one
 *  per mesh): CANYON_BAND_GLSL only ever reads world-space Y, nothing mesh-specific, so every cliff
 *  surface can safely share one compiled shader program — cheaper, and one fewer shader-link race
 *  for the intermittent black-frame issue already traced to software-rendering shader compilation. */
let _bandedWallMat: THREE.MeshStandardMaterial | null = null;
function bandedWallMaterial(): THREE.MeshStandardMaterial {
  if (_bandedWallMat) return _bandedWallMat;
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.93,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: true,
    // round-4: the wall deliberately sits almost exactly where the real (soft) terrain already is
    // on every flat bench (the two profiles agree there by construction — see canyonVisualFloorY's
    // own docstring), separated by only a hair of world-space offset (+0.05 Y, a small outward
    // nudge). At typical viewing distance the depth buffer doesn't have the precision to keep that
    // hair-thin gap resolved, so the wall and the terrain underneath z-fight — interleaving,
    // flickering triangles that read exactly as "a translucent, faceted block" even though neither
    // material is actually transparent. polygonOffset is the correct, standard fix for two
    // deliberately near-coplanar surfaces (it biases the DEPTH TEST, not the vertices, so it works
    // at any distance) — small negative values pull the wall reliably in front of the terrain
    // without moving it in world space or opening a visible gap on the benches where they're meant
    // to coincide exactly. (Confirmed this is not itself what caused round-4's black-frame
    // regression: that reproduces identically with this removed — see the round-4 report.)
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vCanyonY;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvCanyonY = ( modelMatrix * vec4( position, 1.0 ) ).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying float vCanyonY;\n${CANYON_BAND_GLSL}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = canyonBandColor( vCanyonY );")
      // round 6: the gorge is only ~200 units across, so the OPPOSITE wall sits right at (or past)
      // the global fog's own near/far start — the same fog every other object on the island uses,
      // tuned for the open rolling terrain, washes these walls to a pale green-white at exactly the
      // distance a kid needs to see the far rim's own reds and creams to read it as a canyon at
      // all. Replacing the standard <fog_fragment> chunk with the same logic, just scaling its own
      // fogFactor down, keeps the far wall receding into haze — just much more gently, so it stays
      // richly coloured and clearly banded rather than a flat wash — without touching scene.fog
      // itself, which every OTHER object on the island still reads completely normally.
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  fogFactor *= 0.45; // the canyon's own walls: a gentler, kid-readable recede, not a wash to white
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,
      );
  };
  _bandedWallMat = mat;
  return mat;
}

// ── the two short side canyons get the same lofted treatment as the main walls: a single ring of
// samples per branch (they're straight, so one cross-section per `along'` is enough — no need for
// the main axis's own wandering-centreline handling), heights always read from canyonVisualFloorY
// at the real (x, z) so a decor-side taper approximation can never desync from the true carve ──
function sideCanyonHalfWidthAt(sc: SideCanyon, along: number): number {
  const taper = 1 - smoothstep(sc.length - 40, sc.length, Math.max(0, along));
  return Math.max(0.5, sc.halfWidth * taper);
}
function buildSideCanyonWalls(): THREE.Mesh {
  const US = [0.085, 0.095, 0.1, 0.108, 0.115, 0.13, 0.17, 0.22, 0.28, 0.34, 0.39, 0.405, 0.415, 0.425, 0.435, 0.44, 0.46, 0.5, 0.56, 0.62, 0.665, 0.682, 0.69, 0.698, 0.706, 0.714, 0.73, 0.76, 0.82, 0.89, 0.96, 1.03, 1.14];
  const U_N = US.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const sc of CANYON_SIDE_CANYONS) {
    const mouth = alongToWorld(sc.mouthAlong, sc.mouthLateral);
    const dx = Math.sin(sc.heading);
    const dz = Math.cos(sc.heading);
    const sxv = Math.cos(sc.heading);
    const szv = -Math.sin(sc.heading);
    // round 6: starting this wall right at the branch's own mouth (the old `-6`) put it in the
    // SAME physical space the main cliff wall already drew back then — the main wall used to also
    // bump up near a side canyon's own mouth (canyonVisualFloorY's min() blend), so the two
    // independent, un-joined surfaces overlapped and z-fought right at the junction (the "broken
    // glass with dark scribbled lines" reported near the Watchtower, whose own along is only 20
    // units from the first side canyon's mouth). Round 7 fixed the ROOT of that: the main wall now
    // lofts itself from canyonMainTerraceFloorY, which never blends in a side canyon at all, so it
    // can no longer compete with this mesh for the same rock face at the mouth — this can start
    // much closer in again (12, not 30) without reopening that overlap, leaving only a small strip
    // right at along=0 uncovered by EITHER wall (the terrain's own soft carve there, blended
    // smoothly, not a glitch — just not yet dressed with crisp decor).
    const alongs: number[] = [];
    for (let a = 12; a <= sc.length; a += 6) alongs.push(a);
    for (const side of [1, -1] as const) {
      const base = positions.length / 3;
      for (const along of alongs) {
        const hw = sideCanyonHalfWidthAt(sc, along);
        const fo = flutingOffset(sc.mouthAlong + along, side * 1.6);
        for (let k = 0; k < U_N; k++) {
          const u = US[k];
          const lateral = side * u * hw;
          const x = mouth.x + dx * along + sxv * lateral;
          const z = mouth.z + dz * along + szv * lateral;
          // round 7: canyonTerraceFloorY here too, same reason as the main wall above — never hug
          // a butte's own protected disc, that's buildButteMesas()'s own job now
          const crispY = canyonTerraceFloorY(x, z, rawHeight(x, z)) ?? rawHeight(x, z) + canyonPlateauRaise(x, z);
          const softY = grandCanyonGroundY(x, z, rawHeight(x, z)) ?? rawHeight(x, z) + canyonPlateauRaise(x, z);
          const y = Math.max(crispY, softY);
          const lateral2 = side * Math.min(US[US.length - 1], u + 0.01) * hw;
          const x2 = mouth.x + dx * along + sxv * lateral2;
          const z2 = mouth.z + dz * along + szv * lateral2;
          const ox = x2 - x;
          const oz = z2 - z;
          const oLen = Math.hypot(ox, oz) || 1;
          positions.push(x + (ox / oLen) * fo, y + 0.05, z + (oz / oLen) * fo);
        }
      }
      for (let i = 0; i + 1 < alongs.length; i++) {
        for (let k = 0; k + 1 < U_N; k++) {
          const a0 = base + i * U_N + k;
          const b0 = base + (i + 1) * U_N + k;
          if (side > 0) indices.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
          else indices.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, bandedWallMaterial());
  mesh.name = "canyon-side-walls";
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

// ── the three standing buttes, now built as real standalone mesas (clean stacked, slightly
// irregular extruded blocks with the same banded shader) instead of a height-field bump: each is a
// few box "courses" of decreasing size stacked up from the carved floor at its own (along, lateral)
// to its own crown height, with a per-butte random seed so the courses aren't identical twins ──
function buildButteMesas(): THREE.Group {
  const g = group("canyon-buttes");
  let seed = 7001;
  for (const b of CANYON_BUTTES) {
    const ax = alongToWorld(b.along, b.lateral);
    const base = canyonVisualFloorY(ax.x, ax.z, rawHeight(ax.x, ax.z)) ?? rawHeight(ax.x, ax.z);
    const rim = rawHeight(ax.x, ax.z) + canyonPlateauRaise(ax.x, ax.z);
    const crown = base + (rim - base) * b.heightFrac;
    const rnd = rngOf(seed++);
    const courses = 4 + Math.floor(rnd() * 2);
    let y = base;
    const totalH = Math.max(4, crown - base);
    const mesa = new THREE.Group();
    for (let i = 0; i < courses; i++) {
      const t = i / (courses - 1);
      const r = b.r * (1 - t * 0.45) * (0.9 + rnd() * 0.2);
      const h = totalH / courses;
      const jx = (rnd() - 0.5) * b.r * 0.15;
      const jz = (rnd() - 0.5) * b.r * 0.15;
      const course = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r, h, 8), bandedWallMaterial());
      course.position.set(jx, y + h / 2, jz);
      course.castShadow = true;
      course.receiveShadow = false;
      mesa.add(course);
      y += h;
    }
    mesa.position.set(ax.x, 0, ax.z);
    mesa.name = "canyon-butte";
    g.add(mesa);
  }
  return g;
}

export interface GrandCanyonDecor {
  group: THREE.Group;
  update(dt: number, t: number): void;
  dispose(): void;
}

export function buildGrandCanyonDecor(scene: THREE.Scene): GrandCanyonDecor {
  const root = group("grand-canyon-decor");

  root.add(buildCliffWalls());
  root.add(buildSideCanyonWalls());
  root.add(buildButteMesas());
  root.add(buildWatchtower());
  root.add(buildSkywalk());
  root.add(buildLodge());
  root.add(buildSupplyShed());

  // two standing mules near the trailhead
  const mulePositions = [
    { x: CANYON_TRAILHEAD.x + 3.2, z: CANYON_TRAILHEAD.z - 1.4, yaw: 0.6 },
    { x: CANYON_TRAILHEAD.x - 2.6, z: CANYON_TRAILHEAD.z - 2.2, yaw: -0.4 },
  ];
  for (const m of mulePositions) {
    const mule = buildMule();
    mule.position.set(m.x, groundAt(m.x, m.z), m.z);
    mule.rotation.y = m.yaw;
    root.add(mule);
  }

  // bighorn sheep, dotted on the ledges (the upper/lower shelves — picked by sampling for a spot
  // that's part-way down the walls, not right on the flat rim or the river itself)
  const sheepRng = rngOf(991199);
  let sheepPlaced = 0;
  for (let tries = 0; tries < 400 && sheepPlaced < 6; tries++) {
    const along = (sheepRng() - 0.5) * 2 * 300;
    const lateral = (sheepRng() - 0.5) * 2 * 110;
    const x = CANYON_SITE.x + lateral;
    const z = CANYON_SITE.z + along;
    if (!nearGrandCanyon(x, z, -10)) continue;
    const below = belowRim(x, z);
    if (below < 8 || below > 55) continue; // on a mid-height ledge, not the rim or the riverbed
    const sheep = buildSheep();
    sheep.position.set(x, groundAt(x, z), z);
    sheep.rotation.y = sheepRng() * Math.PI * 2;
    root.add(sheep);
    sheepPlaced++;
  }

  // desert flora + boulders on the rim (never inside the carved trench, never on the footpath/
  // lodge/trailhead): cacti, yucca, sage tufts and gnarly junipers, each its own InstancedMesh
  const cactusGeo = buildSaguaroGeometry();
  const cactusMesh = new THREE.InstancedMesh(cactusGeo, CACTUS_GREEN, 80);
  cactusMesh.name = "canyon-cacti";
  const flowerGeo = new THREE.SphereGeometry(0.16, 6, 5);
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, CACTUS_FLOWER, 80);
  flowerMesh.name = "canyon-cactus-flowers";
  const yuccaGeo = new THREE.ConeGeometry(0.5, 1.3, 7);
  const yuccaMesh = new THREE.InstancedMesh(yuccaGeo, YUCCA_GREEN, 60);
  yuccaMesh.name = "canyon-yucca";
  const sageGeo = new THREE.SphereGeometry(0.42, 7, 5);
  const sageMesh = new THREE.InstancedMesh(sageGeo, SAGE_GREEN, 140);
  sageMesh.name = "canyon-sage";
  const juniperTrunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.1, 6);
  const juniperTrunkMesh = new THREE.InstancedMesh(juniperTrunkGeo, JUNIPER_TRUNK, 40);
  juniperTrunkMesh.name = "canyon-juniper-trunks";
  const juniperLeafGeo = new THREE.IcosahedronGeometry(0.85, 0);
  const juniperLeafMesh = new THREE.InstancedMesh(juniperLeafGeo, JUNIPER_GREEN, 40);
  juniperLeafMesh.name = "canyon-juniper-leaves";
  const boulderGeo = buildBoulderGeometry(rngOf(55667788));
  const boulderMesh = new THREE.InstancedMesh(boulderGeo, BOULDER, 150);
  boulderMesh.name = "canyon-boulders";

  for (const m of [cactusMesh, flowerMesh, yuccaMesh, sageMesh, juniperTrunkMesh, juniperLeafMesh, boulderMesh]) {
    setInstanceCount(m, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    root.add(m);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scatterRng = rngOf(442211);
  let nCactus = 0;
  let nFlower = 0;
  let nYucca = 0;
  let nSage = 0;
  let nJTrunk = 0;
  let nBoulder = 0;
  const placed: { x: number; z: number; r: number }[] = [];
  const clearOf = (x: number, z: number, r: number) =>
    !nearCanyonFootpath(x, z, 3) &&
    Math.hypot(x - CANYON_LODGE.x, z - CANYON_LODGE.z) > 26 &&
    Math.hypot(x - CANYON_TRAILHEAD.x, z - CANYON_TRAILHEAD.z) > 10 &&
    Math.hypot(x - CANYON_WATCHTOWER.x, z - CANYON_WATCHTOWER.z) > 8 &&
    Math.hypot(x - CANYON_SKYWALK.x, z - CANYON_SKYWALK.z) > 14 &&
    placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r);
  for (let tries = 0; tries < 4200 && nCactus + nYucca + nSage + nJTrunk + nBoulder < 480; tries++) {
    const along = (scatterRng() - 0.5) * 2 * 320;
    const lateral = (scatterRng() - 0.5) * 2 * 140;
    const x = CANYON_SITE.x + lateral;
    const z = CANYON_SITE.z + along;
    if (!nearGrandCanyon(x, z, -8)) continue;
    const below = belowRim(x, z);
    if (below > 4) continue; // the rim's own tableland only — nothing growing down the cliffs
    const y = groundAt(x, z);
    const u = scatterRng();
    if (u < 0.22 && nCactus < 80) {
      const s = 0.8 + scatterRng() * 0.7;
      if (!clearOf(x, z, 1.2 * s)) continue;
      m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, scatterRng() * Math.PI * 2, 0)), new THREE.Vector3(s, s, s));
      cactusMesh.setMatrixAt(nCactus, m4);
      placed.push({ x, z, r: 1.2 * s });
      if (scatterRng() < 0.5 && nFlower < 80) {
        m4.compose(new THREE.Vector3(x, y + 2.15 * s, z), q.set(0, 0, 0, 1), new THREE.Vector3(1, 1, 1));
        flowerMesh.setMatrixAt(nFlower, m4);
        nFlower++;
      }
      nCactus++;
    } else if (u < 0.38 && nYucca < 60) {
      const s = 0.7 + scatterRng() * 0.6;
      if (!clearOf(x, z, 0.9 * s)) continue;
      m4.compose(new THREE.Vector3(x, y + 0.65 * s, z), q.setFromEuler(new THREE.Euler(0, scatterRng() * Math.PI * 2, 0)), new THREE.Vector3(s, s, s));
      yuccaMesh.setMatrixAt(nYucca, m4);
      placed.push({ x, z, r: 0.9 * s });
      nYucca++;
    } else if (u < 0.6 && nSage < 140) {
      const s = 0.55 + scatterRng() * 0.55;
      if (!clearOf(x, z, 0.8 * s)) continue;
      m4.compose(new THREE.Vector3(x, y + 0.38 * s, z), q.set(0, 0, 0, 1), new THREE.Vector3(s, s * 0.8, s));
      sageMesh.setMatrixAt(nSage, m4);
      placed.push({ x, z, r: 0.8 * s });
      nSage++;
    } else if (u < 0.74 && nJTrunk < 40) {
      const s = 1.0 + scatterRng() * 0.9;
      if (!clearOf(x, z, 1.6 * s)) continue;
      m4.compose(new THREE.Vector3(x, y + 0.55 * s, z), q.setFromEuler(new THREE.Euler((scatterRng() - 0.5) * 0.3, scatterRng() * Math.PI * 2, (scatterRng() - 0.5) * 0.3)), new THREE.Vector3(s, s, s));
      juniperTrunkMesh.setMatrixAt(nJTrunk, m4);
      m4.compose(new THREE.Vector3(x, y + 1.15 * s, z), q.set(0, 0, 0, 1), new THREE.Vector3(s * 0.9, s * 0.7, s * 0.9));
      juniperLeafMesh.setMatrixAt(nJTrunk, m4);
      placed.push({ x, z, r: 1.6 * s });
      nJTrunk++;
    } else if (nBoulder < 150) {
      const s = 0.6 + scatterRng() * scatterRng() * 2.2;
      if (!clearOf(x, z, 1.1 * s)) continue;
      m4.compose(new THREE.Vector3(x, y + s * 0.3, z), q.setFromEuler(new THREE.Euler(scatterRng() * 0.6, scatterRng() * Math.PI * 2, scatterRng() * 0.6)), new THREE.Vector3(s, s * 0.8, s));
      boulderMesh.setMatrixAt(nBoulder, m4);
      placed.push({ x, z, r: 1.1 * s });
      nBoulder++;
    }
  }
  setInstanceCount(cactusMesh, nCactus);
  setInstanceCount(flowerMesh, nFlower);
  setInstanceCount(yuccaMesh, nYucca);
  setInstanceCount(sageMesh, nSage);
  setInstanceCount(juniperTrunkMesh, nJTrunk);
  setInstanceCount(juniperLeafMesh, nJTrunk);
  setInstanceCount(boulderMesh, nBoulder);
  for (const m of [cactusMesh, flowerMesh, yuccaMesh, sageMesh, juniperTrunkMesh, juniperLeafMesh, boulderMesh]) m.instanceMatrix.needsUpdate = true;

  // the river at the bottom: a simple flowing ribbon following the real (wandering) channel
  const riverPts: { x: number; y: number; z: number; half: number }[] = [];
  for (let along = CANYON_RIVER_SPAN[0]; along <= CANYON_RIVER_SPAN[1]; along += 8) {
    const p = canyonAxisPointAt(along);
    const y = groundAt(p.x, p.z) + 0.3;
    riverPts.push({ x: p.x, y, z: p.z, half: canyonChannelHalfWidthAt(along) });
  }
  const rPos: number[] = [];
  const rUv: number[] = [];
  for (let i = 0; i < riverPts.length; i++) {
    const p = riverPts[i];
    const prev = riverPts[Math.max(0, i - 1)];
    const next = riverPts[Math.min(riverPts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    const sx = dz / l;
    const sz = -dx / l;
    rPos.push(p.x - sx * p.half, p.y, p.z - sz * p.half, p.x + sx * p.half, p.y, p.z + sz * p.half);
    rUv.push(0, i, 1, i);
  }
  const rIdx: number[] = [];
  for (let i = 0; i + 1 < riverPts.length; i++) {
    const a = i * 2;
    rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute("position", new THREE.Float32BufferAttribute(rPos, 3));
  riverGeo.setAttribute("uv", new THREE.Float32BufferAttribute(rUv, 2));
  riverGeo.setIndex(rIdx);
  riverGeo.computeVertexNormals();
  const riverMat = new THREE.MeshToonMaterial({ color: "#3f93a8", transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const river = new THREE.Mesh(riverGeo, riverMat);
  river.name = "canyon-river";
  root.add(river);

  // condors: a handful of simple gliders, circling slowly on the warm air above the gorge
  interface Condor {
    mesh: THREE.Group;
    cx: number;
    cz: number;
    r: number;
    y: number;
    speed: number;
    phase: number;
  }
  function buildCondor(): THREE.Group {
    const c = group("canyon-condor");
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 3, 6), CONDOR_BODY);
    body.rotation.x = Math.PI / 2;
    c.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), CONDOR_HEAD);
    head.position.z = 0.55;
    c.add(head);
    const wingGeo = new THREE.BoxGeometry(1.9, 0.04, 0.42);
    wingGeo.translate(0.95, 0, 0);
    const wingL = new THREE.Mesh(wingGeo, CONDOR_BODY);
    const wingR = new THREE.Mesh(wingGeo, CONDOR_BODY);
    wingR.scale.x = -1;
    c.add(wingL, wingR);
    return c;
  }
  const condors: Condor[] = [];
  const condorRng = rngOf(773311);
  // round 8: sampling the live scene found every condor consistently 90+ units from both rim
  // decks (they all circle wide, out over the gorge's own middle, around CANYON_SITE) — far enough
  // that a kid standing at the Watchtower or the Skywalk never sees one close, just a tiny dot. The
  // first two birds now circle right past those two decks instead (close enough to glide by at a
  // kid-visible size), near deck height so they ride past roughly at eye level; the other two keep
  // circling wide over the gorge's middle for scale/atmosphere, same as before.
  const NEAR_DECK: { x: number; z: number; y: number }[] = [
    { x: CANYON_WATCHTOWER.x + (CANYON_SITE.x - CANYON_WATCHTOWER.x) * 0.12, z: CANYON_WATCHTOWER.z + (CANYON_SITE.z - CANYON_WATCHTOWER.z) * 0.12, y: rimHeightNear(CANYON_WATCHTOWER.x, CANYON_WATCHTOWER.z) },
    { x: CANYON_SKYWALK.x + (CANYON_SITE.x - CANYON_SKYWALK.x) * 0.12, z: CANYON_SKYWALK.z + (CANYON_SITE.z - CANYON_SKYWALK.z) * 0.12, y: rimHeightNear(CANYON_SKYWALK.x, CANYON_SKYWALK.z) },
  ];
  function rimHeightNear(x: number, z: number): number {
    return groundAt(x, z) + 6;
  }
  for (let i = 0; i < 4; i++) {
    const mesh = buildCondor();
    const near = NEAR_DECK[i];
    const cx = near ? near.x : CANYON_SITE.x + (condorRng() - 0.5) * 300;
    const cz = near ? near.z : CANYON_SITE.z + (condorRng() - 0.5) * 400;
    const y = near ? near.y + condorRng() * 6 : groundAt(cx, cz) + 40 + condorRng() * 25;
    const r = near ? 16 + condorRng() * 8 : 30 + condorRng() * 40;
    const c: Condor = { mesh, cx, cz, r, y, speed: 0.12 + condorRng() * 0.08, phase: condorRng() * Math.PI * 2 };
    root.add(mesh);
    condors.push(c);
  }

  scene.add(root);

  return {
    group: root,
    update(_dt, t) {
      riverMat.opacity = 0.78 + Math.sin(t * 1.3) * 0.06;
      for (const c of condors) {
        const a = t * c.speed + c.phase;
        c.mesh.position.set(c.cx + Math.sin(a) * c.r, c.y + Math.sin(a * 2.3) * 2, c.cz + Math.cos(a) * c.r);
        c.mesh.rotation.y = a + Math.PI / 2;
        c.mesh.rotation.z = Math.sin(a * 1.7) * 0.08;
      }
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if ((mesh as THREE.InstancedMesh).isInstancedMesh || mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) mat?.dispose();
        }
      });
      // the shared banded-wall material (bandedWallMaterial()'s own module-level cache) just got
      // disposed above along with everything else that referenced it — drop the cache so the next
      // buildGrandCanyonDecor() call compiles a fresh one instead of handing back a disposed material
      _bandedWallMat = null;
    },
  };
}
