// Parícutin's own small hand-built touches: the crater's warm glow, a column of steam/ash puffs
// drifting up from it, occasional harmless lava bombs arcing inside the bowl, the half-buried
// church of San Juan Parangaricutiro poking out of the lava field, and a handful of switchback
// railing posts along the climb trail. The volcano's actual SHAPE (the cone, the crater bowl, the
// lava field) is the island's ordinary height-field terrain (registry/paricutin.ts's paricutinY,
// used by registry/terrain.ts's finish()) with a Parícutin-local colour override in
// world/fantasy/terrainMesh.ts's groundColor() — this file only adds the small extras on top.
// Built once, unconditionally (a handful of cheap static/instanced meshes, the same budget as
// everestDecor.ts): no streaming needed.
//
// SAFE and friendly by design (ages 6-10): the glow and the "lava bombs" are gentle, slow and
// obviously harmless — soft colour and motion, nothing that reads as danger, and the kid can never
// be hurt by any of it.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PARICUTIN_CHURCH, PARICUTIN_CONE, PARICUTIN_RIM, PARICUTIN_BASE_H, CRATER_U, LAVA_FIELD_OUT, RIM_NEAR_A, paricutinY } from "../registry/paricutin";
import { PARICUTIN_ROUTE } from "../registry/paricutinRoute";
import { groundY } from "../registry/terrain";

/** ParkWorld.ts's FX_NO_OUTLINE_LAYER (kept local — importing it would reach back into the engine
 *  from world/ code — world/waterways/falls.ts's mist/spray/rainbow meshes use the exact same local
 *  redefinition). Objects on this layer still render normally (the main camera has it enabled
 *  alongside layer 0) but are skipped by the diorama's ink-outline pass. */
const FX_NO_OUTLINE_LAYER = 1;

export interface ParicutinDecor {
  group: THREE.Group;
  update(dt: number, t: number, glow?: number, focus?: THREE.Vector3): void;
  dispose(): void;
}

const smoothstep01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** the crater's own floor height — lava bombs arc from here, the ash plume rises from just above it */
function craterFloorY(): number {
  return groundY(PARICUTIN_CONE.x, PARICUTIN_CONE.z);
}
const RIM_R = PARICUTIN_CONE.r * CRATER_U;
/** how far below the crater floor the lava pool's own swirl sits (buildLavaPool) — shared with
 *  buildCraterGlow so the warm glow sits right at the sunken pool's own surface instead of floating
 *  as its own separate plate well above it (round 5's own re-check: the glow disc's old fixed
 *  "+2.6 above floor" offset was unrelated to the pool's new sunken position, so the two read as two
 *  disconnected stacked shapes with a dark gap between them). */
const POOL_SUNK = 1.0;
/** the lava field's own inner/outer radius (the cone's bare base, and the footprint's crisp outer
 *  edge) — round 3's new decor (rock chunks, ridges, cracks, steam, the front rubble wall) scatters
 *  across this whole annulus, not just the crater bowl. */
const FIELD_IN = PARICUTIN_CONE.r;
const FIELD_OUT = PARICUTIN_CONE.r * LAVA_FIELD_OUT;

/** a flat, irregular (never perfectly circular) disc — jitters a CircleGeometry's own outer ring
 *  before laying it flat, the same "never a clean cut-out" idea the far silhouette and the crust
 *  wall below both use. Used for the crust plates floating on the lava pool. */
function buildIrregularDisc(baseR: number, segs: number, seed: number, jitterAmt: number): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(baseR, segs);
  const pos = geo.attributes.position;
  const r = rngOf(seed);
  for (let i = 1; i < pos.count; i++) {
    // index 0 is CircleGeometry's own centre vertex — leave it alone
    const x = pos.getX(i);
    const y = pos.getY(i);
    const rad = Math.hypot(x, y);
    if (rad < 1e-6) continue;
    const k = 1 + (r() - 0.5) * jitterAmt;
    pos.setX(i, x * k);
    pos.setY(i, y * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** round 5's own re-check: "flat discs with hard stepped edges... sitting ON the crater floor" —
 *  the pool's own bright swirl used to sit flush with (or just above) the floor, so it read as a
 *  stack of flat painted discs rather than a pool IN the ground. This is the bowl wall that makes it
 *  read as sunken: a ring of irregular radius at the floor's own level (the "rim" — jittered, never
 *  a perfect circle) sloping down to a smaller irregular ring at the swirl's own level, `sunk` units
 *  below. Baked with the same per-facet rock-colour trick the lava rocks/front wall use (dark basalt
 *  base, a few warm ember-tinted seams) so it reads as real hardened crust, not a flat painted cone. */
function buildCrustWall(topRBase: number, botRBase: number, sunk: number, seed: number): THREE.Mesh {
  const segs = 22;
  const r = rngOf(seed);
  const topR: number[] = [];
  const botR: number[] = [];
  for (let i = 0; i <= segs; i++) {
    topR.push(topRBase * (0.84 + r() * 0.32)); // irregular, not circular — the rim the brief asked for
    botR.push(botRBase * (0.88 + r() * 0.2));
  }
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    pos.push(sx * topR[i], 0, cz * topR[i]);
    pos.push(sx * botR[i], -sunk, cz * botR[i]);
  }
  for (let i = 0; i < segs; i++) {
    const a0 = i * 2;
    const b0 = i * 2 + 1;
    const a1 = (i + 1) * 2;
    const b1 = (i + 1) * 2 + 1;
    idx.push(a0, b0, a1, b0, b1, a1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // baked UNLIT (MeshBasicMaterial, not MeshToonMaterial): a toon-lit wall reads as warm/orange in
  // bright daylight (the scene's own sunlight + the bounce from the lava-coloured ground right next
  // to it wash out a lit dark grey into something indistinguishable from the swirl it's meant to
  // frame) — the same "must read as a lit shape in any light" trick buildCrackVents/
  // buildLavaFieldCracks already use in this file, so the rim stays unmistakably dark crust, not
  // another warm ring blending into the lava, at noon or at midnight alike.
  const flat = geo.toNonIndexed();
  const fpos = flat.attributes.position;
  const faceCount = fpos.count / 3;
  const colors = new Float32Array(fpos.count * 3);
  const dark = new THREE.Color("#1c110b");
  const darker = new THREE.Color("#0f0905");
  const ember = new THREE.Color("#ff7a2e");
  const c = new THREE.Color();
  const jr = rngOf(seed + 1);
  for (let f = 0; f < faceCount; f++) {
    c.copy(dark).lerp(darker, jr());
    if (jr() < 0.12) c.lerp(ember, 0.55); // a few glowing crust seams, same idea as the lava rocks
    for (let v = 0; v < 3; v++) colors.set([c.r, c.g, c.b], (f * 3 + v) * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.name = "paricutin-pool-wall";
  return mesh;
}

/** the crater's own lava pool: round 3's re-check was "looking in shows a black hole and nothing
 *  else; no glow is visible by day" — a purely ADDITIVE glow (buildCraterGlow, below) washes out
 *  completely against bright daylight ground, so the pool itself needs a layer that is NOT additive
 *  (reads as a bright, solid, warm surface at noon the same way the crack vents read as "lit" in
 *  any light) plus a bit of per-vertex colour variation round two rings, independently and slowly
 *  ROTATED each frame (never re-building the geometry) for a cheap but convincing "churning lava"
 *  illusion. Built smaller than the (now shallower, CRATER_DEPTH=15) bowl itself, so the walls still
 *  read all round it.
 *
 *  Redesigned for round 5 ("stacked orange dinner plates... flat discs with hard stepped edges"):
 *  the swirl itself is unchanged (still two independently-rotating, per-vertex-coloured rings plus a
 *  bright core — cheap, never rebuilt), but it now sits `sunk` units below the crater floor inside
 *  an irregular dark-crust bowl wall (buildCrustWall) that visibly connects the floor to the pool,
 *  so the whole thing reads as one sunken basin rather than shapes floating on top of the ground.
 *  A few irregular crust plates float on the swirl's own surface, breaking up the smooth swirl the
 *  way real cooled crust does. */
function buildLavaPool(): { group: THREE.Group; core: THREE.Mesh; mid: THREE.Mesh; outer: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = "paricutin-lava-pool";
  const poolR = RIM_R * 0.62;
  const sunk = POOL_SUNK; // how far below the crater floor the swirl itself sits — kept modest on
  // purpose: paricutinY's own rim notch (RIM_NEAR_A) only lowers the near wall enough to open a
  // sightline down to the FLOOR itself (round 3's own fix for "looking in shows a black hole"); a
  // deeper sink than that re-creates the same dark-hole sightline problem, just shifted a few units
  // lower, and hides the whole pool from the kid's own rim viewpoint. The irregular dark crust wall
  // (not the sheer drop) is what has to carry "sunken, not floating" here.
  const rimR = poolR * 0.95; // where the crust wall meets the real floor
  const swirlR = poolR * 0.58; // the sunken basin's own floor — the bright swirl lives here

  const wall = buildCrustWall(rimR, swirlR, sunk, 90111);
  group.add(wall);

  const core = new THREE.Mesh(new THREE.CircleGeometry(swirlR * 0.42, 24), new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.96, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  core.geometry.rotateX(-Math.PI / 2);
  core.position.y = -sunk;
  group.add(core);
  const buildSwirlRing = (rIn: number, rOut: number, segs: number, colA: THREE.Color, colB: THREE.Color, opacity: number) => {
    const geo = new THREE.RingGeometry(rIn, rOut, segs, 1);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const ang = Math.atan2(pos.getY(i), pos.getX(i));
      const t = Math.min(1, Math.max(0, Math.sin(ang * 3) * 0.35 + Math.sin(ang * 7 + 1) * 0.15 + 0.5));
      c.copy(colA).lerp(colB, t);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.rotateX(-Math.PI / 2); // bake flat into local space so mesh.rotation.y can freely spin it
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  };
  const mid = buildSwirlRing(swirlR * 0.38, swirlR * 0.74, 28, new THREE.Color("#ff8a2e"), new THREE.Color("#ffc257"), 0.92);
  mid.name = "paricutin-pool-mid";
  mid.position.y = -sunk;
  group.add(mid);
  const outer = buildSwirlRing(swirlR * 0.68, swirlR, 28, new THREE.Color("#7a2410"), new THREE.Color("#c4451f"), 0.88);
  outer.name = "paricutin-pool-outer";
  outer.position.y = -sunk;
  group.add(outer);

  // a few irregular crust plates floating right on the swirl's own surface — never perfectly round,
  // never all one size, scattered off-centre
  const pr = rngOf(90222);
  const plateCount = 5;
  for (let i = 0; i < plateCount; i++) {
    const a = (i / plateCount) * Math.PI * 2 + pr() * 1.2;
    const rad = swirlR * (0.12 + pr() * 0.52);
    const px = Math.sin(a) * rad;
    const pz = Math.cos(a) * rad;
    const plateR = swirlR * (0.14 + pr() * 0.14);
    const plateGeo = buildIrregularDisc(plateR, 9, 90300 + i, 0.55);
    const plateMat = new THREE.MeshToonMaterial({ color: i % 2 === 0 ? "#241610" : "#33201a" });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.name = "paricutin-pool-plate";
    plate.position.set(px, -sunk + 0.07, pz);
    plate.rotation.y = pr() * Math.PI * 2;
    group.add(plate);
  }

  group.renderOrder = 3;
  return { group, core, mid, outer };
}

/** a warm, gently pulsing glow lying flat across the crater floor — additive, modest opacity (never
 *  a white-out up close: the kid can walk right up to the rim and still see the bowl's own shape).
 *  Sits ON TOP of the lava pool above — the pool is what reads by day, this is the extra warmth that
 *  shows by night and up close. */
function buildCraterGlow(): THREE.Mesh {
  // a few units clear of the crater floor's own small rocky texture (paricutinY's `crag` term can
  // bump the real baked terrain a little above the plain floor height here and there — sitting the
  // glow disc only a hair above that average risks it being quietly clipped by the real, noisier
  // ground right under it). depthTest stays ON (round 3's own re-check: with it off, this additive
  // glow drew right through the cone's own solid flank — and, once the far silhouette existed to
  // reveal it, right through THAT too — reading as a bright blob floating in front of the whole
  // mountain from clear across the plain. depthWrite stays off, so it still blends softly with
  // whatever it's drawn over once it IS in front.)
  // round 5: tracks the pool's own new sunken surface (POOL_SUNK below the floor) plus a small lift,
  // so the glow sits right where the lava actually is instead of floating as its own disconnected
  // plate well above it
  const y = craterFloorY() - POOL_SUNK + 0.9;
  // a patch of warm glow on the floor, not a disc filling the whole bowl (the crater is only
  // ~RIM_R=19 units across; a 0.85*RIM_R disc all but filled it edge to edge and read as a flat
  // orange sun rather than a glow in a hollow)
  const geo = new THREE.CircleGeometry(RIM_R * 0.42, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: "#ff7a2e", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(PARICUTIN_CONE.x, y, PARICUTIN_CONE.z);
  mesh.name = "paricutin-crater-glow";
  mesh.renderOrder = 5;
  // a smaller, brighter core
  const core = new THREE.Mesh(new THREE.CircleGeometry(RIM_R * 0.2, 16), new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  core.rotateX(-Math.PI / 2);
  core.position.y = 0.08;
  core.renderOrder = 6;
  mesh.add(core);
  // a real point light, so the crater's own walls and rim catch a warm glow too (not just the flat
  // disc) — one extra light is cheap, and it's what makes the bowl read as genuinely glowing rather
  // than having a painted circle lying in it
  const light = new THREE.PointLight("#ff8a3c", 2.2, RIM_R * 5, 2);
  light.position.set(0, 3, 0);
  mesh.add(light);
  return mesh;
}

/** jagged glowing cracks/vents across the crater floor: unlit, nearly-opaque bright strips (NOT
 *  additive) so they read as a distinct glowing shape against the dark floor by day as well as
 *  night — the flat additive wash alone (buildCraterGlow) washes out too easily in daylight and
 *  reads as nothing from up on the rim (polish round 2's own complaint); these have a real,
 *  crisp-edged silhouette, the way a sign or a lantern reads as "lit" in any light. One merged
 *  static mesh (zig-zag ribbons, a few per vent), built once. */
function buildCrackVents(): THREE.Mesh {
  const r = rngOf(50301);
  const parts: THREE.BufferGeometry[] = [];
  const floorY = craterFloorY();
  const N_VENTS = 5;
  for (let i = 0; i < N_VENTS; i++) {
    const a = (i / N_VENTS) * Math.PI * 2 + r() * 0.6;
    const rad = RIM_R * (0.5 + r() * 0.42); // round the pool's own edge and the walls, not under it
    const cx = PARICUTIN_CONE.x + Math.sin(a) * rad;
    const cz = PARICUTIN_CONE.z + Math.cos(a) * rad;
    const dir = r() * Math.PI * 2;
    const len = RIM_R * (0.3 + r() * 0.35);
    const segs = 4 + Math.floor(r() * 3);
    const pos: number[] = [];
    const idx: number[] = [];
    let px = cx;
    let pz = cz;
    let heading = dir;
    const w = 0.35 + r() * 0.3;
    for (let s = 0; s <= segs; s++) {
      const segLen = (len / segs) * (0.7 + r() * 0.6);
      const nx = px + Math.sin(heading) * segLen;
      const nz = pz + Math.cos(heading) * segLen;
      const sideX = Math.cos(heading);
      const sideZ = -Math.sin(heading);
      const k = s * 2;
      pos.push(px + sideX * w, floorY + 0.15, pz + sideZ * w, px - sideX * w, floorY + 0.15, pz - sideZ * w);
      if (s > 0) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      px = nx;
      pz = nz;
      heading += (r() - 0.5) * 1.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false) ?? parts[0];
  const mat = new THREE.MeshBasicMaterial({ color: "#ff9a3c", transparent: true, opacity: 0.92, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = "paricutin-crack-vents";
  mesh.renderOrder = 4;
  return mesh;
}

/** a soft, layered steam/ash plume: many small translucent puffs drifting up from the crater,
 *  lighter in colour and bigger the higher they rise, reused as a single instanced mesh (per-puff
 *  colour via the instance-colour slot, since a plain MeshBasicMaterial has no per-instance alpha) */
function buildAshPlume(): THREE.InstancedMesh {
  const N = 42;
  const geo = new THREE.SphereGeometry(1, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  mesh.name = "paricutin-ash-plume";
  mesh.frustumCulled = false;
  return mesh;
}

/** occasional glowing lava "bombs": small bright embers lobbed on gentle, looping arcs inside the
 *  crater — exciting but obviously harmless (slow, soft, never leaving the bowl) */
function buildLavaBombs(): THREE.InstancedMesh {
  const N = 9;
  const geo = new THREE.SphereGeometry(1, 6, 5);
  const mat = new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = "paricutin-lava-bombs";
  mesh.frustumCulled = false;
  return mesh;
}

// ── round 3: the lava field itself was "a flat, featureless pure-black void — reads as a rendering
// hole, not lava". The ground colour (world/fantasy/terrainMesh.ts) now gives it a real charcoal
// texture; this decor scatters real 3D shape across the whole annulus (FIELD_IN..FIELD_OUT): jagged
// rock chunks, low ropy ridges, glowing cracks winding through it, a few steam wisps, and a crisp
// raised rubble wall right at the footprint's own edge where it meets the green fields. All static,
// instanced (one draw call each), built once — the same "no streaming needed" budget as everything
// else in this file. ──

/** round 4's own re-check: "the rocks are pure black blobs with no shading — every chunk is a flat
 *  black silhouette". A single flat MeshToonMaterial colour on a low-poly shape reads as a dark
 *  silhouette whenever its own facets don't happen to catch the light — this bakes real per-FACET
 *  variation (a non-indexed copy of the base geometry, so each flat face gets its own vertex colour
 *  instead of sharing a smoothed one) straight into the geometry: a dark basalt-grey base, lighter
 *  on the faces whose own local normal points up-ish (most instances, randomly rotated, still show
 *  SOME lit facets this way — collectively the field reads as varied, textured rock, not one flat
 *  colour), a per-face random jitter so no two facets match exactly, and a few random faces tinted
 *  toward a warm ember colour (glowing seams). Combined with flatShading + a real MeshToonMaterial
 *  (so the scene's own lighting still dims it properly at night, multiplying these baked colours
 *  rather than replacing them). */
function buildFacetedRockGeometry(base: THREE.BufferGeometry, seed: number, emberChance: number): THREE.BufferGeometry {
  const geo = base.toNonIndexed();
  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
  const r = rngOf(seed);
  const lo = new THREE.Color("#443a33"); // shaded side — clearly darker than the ground around it
  const hi = new THREE.Color("#73665a"); // lit facet — pops lighter than the ground
  const ember = new THREE.Color("#ff8a3c");
  const c = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  const faceCount = pos.count / 3;
  for (let f = 0; f < faceCount; f++) {
    const ny = normal.getY(f * 3);
    const lit = Math.max(0, ny) * 0.65 + r() * 0.45;
    c.copy(lo).lerp(hi, Math.min(1, lit));
    if (r() < emberChance) c.lerp(ember, 0.75);
    for (let v = 0; v < 3; v++) colors.set([c.r, c.g, c.b], (f * 3 + v) * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** jagged lava-rock chunks, scattered across the whole field — varied sizes, odd rotations, a real
 *  rockfall rather than a row of boulders (the church's own buildRockPile idea, instanced for scale) */
function buildLavaFieldRocks(): THREE.InstancedMesh {
  const r = rngOf(80211);
  const N = 90;
  const geo = buildFacetedRockGeometry(new THREE.IcosahedronGeometry(1, 0), 80212, 0.05);
  const mat = Object.assign(new THREE.MeshToonMaterial({ vertexColors: true }), { flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "paricutin-lava-rocks";
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2;
    const rad = FIELD_IN + 2 + r() * (FIELD_OUT - FIELD_IN - 6);
    const x = PARICUTIN_CONE.x + Math.sin(a) * rad;
    const z = PARICUTIN_CONE.z + Math.cos(a) * rad;
    const y = groundY(x, z);
    const s = 0.8 + r() * 2.4;
    q.setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI));
    m4.compose(new THREE.Vector3(x, y + s * 0.32, z), q, new THREE.Vector3(s, s * (0.6 + r() * 0.3), s));
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** low, ropy pressure ridges — elongated, half-buried lumps (the real texture of a cooled `a'a`/
 *  pahoehoe flow), laid flat at random headings */
function buildLavaFieldRidges(): THREE.InstancedMesh {
  const r = rngOf(80333);
  const N = 40;
  const geo = new THREE.CapsuleGeometry(1, 1.4, 3, 7);
  const mat = new THREE.MeshToonMaterial({ color: "#5c5047" });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;
  mesh.name = "paricutin-lava-ridges";
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2;
    const rad = FIELD_IN + 6 + r() * (FIELD_OUT - FIELD_IN - 12);
    const x = PARICUTIN_CONE.x + Math.sin(a) * rad;
    const z = PARICUTIN_CONE.z + Math.cos(a) * rad;
    const y = groundY(x, z);
    const len = 2 + r() * 3.5;
    const heading = r() * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, heading));
    m4.compose(new THREE.Vector3(x, y + 0.45, z), q, new THREE.Vector3(0.55 + r() * 0.45, len, 0.55 + r() * 0.45));
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** thin glowing cracks winding through the field itself (not just the crater) — the same crisp,
 *  NOT-additive trick buildCrackVents uses (reads as a lit shape in any light, never washed out by
 *  day), scattered zig-zag ribbons across the whole annulus */
function buildLavaFieldCracks(): THREE.Mesh {
  const r = rngOf(80555);
  const parts: THREE.BufferGeometry[] = [];
  const N_CRACKS = 12;
  for (let i = 0; i < N_CRACKS; i++) {
    const a0 = r() * Math.PI * 2;
    const rad0 = FIELD_IN + 4 + r() * (FIELD_OUT - FIELD_IN - 10);
    let px = PARICUTIN_CONE.x + Math.sin(a0) * rad0;
    let pz = PARICUTIN_CONE.z + Math.cos(a0) * rad0;
    let heading = r() * Math.PI * 2;
    const len = 9 + r() * 14;
    const segs = 5 + Math.floor(r() * 4);
    const pos: number[] = [];
    const idx: number[] = [];
    const w = 0.3 + r() * 0.22;
    for (let s = 0; s <= segs; s++) {
      const segLen = (len / segs) * (0.7 + r() * 0.6);
      const nx = px + Math.sin(heading) * segLen;
      const nz = pz + Math.cos(heading) * segLen;
      const sideX = Math.cos(heading);
      const sideZ = -Math.sin(heading);
      const y = groundY(px, pz) + 0.12;
      const k = s * 2;
      pos.push(px + sideX * w, y, pz + sideZ * w, px - sideX * w, y, pz - sideZ * w);
      if (s > 0) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      px = nx;
      pz = nz;
      heading += (r() - 0.5) * 1.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false) ?? parts[0];
  const mat = new THREE.MeshBasicMaterial({ color: "#ff8a3c", transparent: true, opacity: 0.85, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = "paricutin-field-cracks";
  mesh.renderOrder = 4;
  return mesh;
}

/** a few thin steam wisps drifting up here and there across the field — sparser and shorter than
 *  the crater's own ash plume */
function buildSteamWisps(): THREE.InstancedMesh {
  const N = 16;
  const geo = new THREE.SphereGeometry(1, 6, 5);
  const mat = new THREE.MeshBasicMaterial({ color: "#d7dade", vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(1), 3);
  mesh.name = "paricutin-steam-wisps";
  mesh.frustumCulled = false;
  return mesh;
}

/** a crisp, raised rubble wall right where the lava field meets the green fields (round 3: "a crisp
 *  raised lava FRONT — a low rubble wall 1-2 units high") — a broken ring of rock chunks round the
 *  footprint's own outer edge, with a gap left clear on the trailhead's own approach (RIM_NEAR_A)
 *  so the climb in from the farm is never blocked by decor. */
function buildLavaFrontWall(): THREE.InstancedMesh {
  const r = rngOf(80777);
  const N = 70;
  const geo = buildFacetedRockGeometry(new THREE.DodecahedronGeometry(1, 0), 80778, 0.03);
  const mat = Object.assign(new THREE.MeshToonMaterial({ vertexColors: true }), { flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "paricutin-lava-front-wall";
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const park = new THREE.Vector3(PARICUTIN_CONE.x, -400, PARICUTIN_CONE.z);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const angDiff = Math.atan2(Math.sin(a - RIM_NEAR_A), Math.cos(a - RIM_NEAR_A));
    if (Math.abs(angDiff) < 0.3) {
      // leaves the trailhead's own approach clear — park this instance out of sight
      m4.compose(park, q.identity(), new THREE.Vector3(0.001, 0.001, 0.001));
      mesh.setMatrixAt(i, m4);
      continue;
    }
    const rad = FIELD_OUT + (r() - 0.5) * 3;
    const x = PARICUTIN_CONE.x + Math.sin(a) * rad;
    const z = PARICUTIN_CONE.z + Math.cos(a) * rad;
    const y = groundY(x, z);
    const s = 0.9 + r() * 1.1;
    q.setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI));
    m4.compose(new THREE.Vector3(x, y + s * 0.4, z), q, new THREE.Vector3(s, s * (0.7 + r() * 0.4), s));
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** the tall landmark smoke/steam column the coordinator asked for — a chain of big, soft puffs
 *  rising 80-120 units above the summit and drifting, FOG-DISABLED so it stays visible from the
 *  farm, the railway and the plains (round 3: "the cone cannot be seen from the farm" — this is the
 *  one piece of it a kid can see from anywhere on the island, long before the cone's own silhouette
 *  resolves out of the haze). */
function buildLandmarkPlume(): THREE.InstancedMesh {
  const N = 14;
  const geo = new THREE.SphereGeometry(1, 10, 7);
  const mat = new THREE.MeshBasicMaterial({ color: "#eceae6", transparent: true, opacity: 0.4, depthWrite: false, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = "paricutin-landmark-plume";
  mesh.frustumCulled = false;
  return mesh;
}

/** a simple, fog-proof silhouette of the whole cone (a flat-topped frustum — the crater's own cut
 *  top, visible even in silhouette), hand-coloured hazy blue-grey fading to a rust cap: shown only
 *  from far away (round 3: "a kid at the farm has no idea a volcano is there" — the real terrain
 *  cone is there, but the shared atmosphere fog washes its own colours out at that range; this
 *  mesh's `fog: false` material never does, so it reads as an unmistakable mountain on the skyline),
 *  swapped out for the real, detailed terrain once the kid is close enough to see it properly. */
/** round 4's own re-check: "a smooth pastel gradient that looks like a paper cut-out" — a perfectly
 *  round, perfectly smooth cylinder reads as a cut-out shape, not a mountain, once it fills most of
 *  the view. Faceted here instead (few radial segments, flat-shaded, so each panel catches the light
 *  a little differently), with a per-column radius jitter running the panels' own full height —
 *  reads as vertical gully ribs running down the flank — and the top ring nudged unevenly so the
 *  rim itself doesn't look razor-straight. Coloured the real cone's own cinder brown for almost the
 *  whole body (closer to the real terrain's own palette, terrainMesh.ts's PARICUTIN_CINDER family),
 *  with the blue-grey atmospheric haze confined to a narrow band right at the base (looking along
 *  the ground, through the most air) rather than washing out the whole silhouette. */
/** round 5's own re-check: "a pale grey, LARGER cone sticking out behind and around the real
 *  mountain" — the round-4 shape was independently authored (an arbitrary frustum: topR 30% wider
 *  than the real rim, botR 4% wider than the real base, and a full h*1.04 tall even though the real
 *  profile is CUT by the crater at rim height, h - CRATER_DEPTH, not the full cone height) and so
 *  haloed well outside the real terrain during the cross-fade instead of hiding behind it. This
 *  samples the real profile straight from `paricutinY` itself (at a fixed azimuth clear of the rim
 *  notch, so the sampled curve is the clean, symmetric flank — not the kid's own look-down dip),
 *  then shrinks every sampled point by SHRINK so the whole swept shape sits strictly INSIDE the real
 *  surface; the per-column jitter below only ever shrinks further (never back out past SHRINK), so
 *  there is no radius/angle at which this mesh can poke through the real terrain. Built as a
 *  THREE.LatheGeometry (a true body of revolution through the sampled points) rather than a plain
 *  two-radius frustum, so the silhouette's own slope genuinely bends the way the real flank does. */
function buildFarSilhouette(): THREE.Mesh {
  // PARICUTIN_BASE_H — the real, levelled PLAIN height the cone stands on (not groundY at the
  // centre, which is the crater FLOOR, already raised partway up the mountain) — the same reference
  // paricutinY itself builds the real cone from, so this silhouette's base lines up with it exactly
  const baseY = PARICUTIN_BASE_H;
  const SHRINK = 0.97; // "~3% smaller in radius and height" — the coordinator's own margin
  const SEGS = 11; // few, deliberately angular panels — a faceted mountain, not a smooth cut-out
  // sample well clear of the rim notch (RIM_NEAR_A ± ~49°, see paricutinY) so the sampled curve is
  // the cone's own clean, symmetric outer flank, not the kid's look-down dip
  const sampleA = RIM_NEAR_A + Math.PI;
  const N_SAMPLES = 10;
  const points: THREE.Vector2[] = [];
  // base ring first (u=1, height 0 above the pad) up to the rim (u=CRATER_U, the crater's own cut
  // edge — the highest point the OUTSIDE silhouette ever needs, since above that is the bowl, which
  // the crater decor/terrain itself already draws up close)
  for (let i = 0; i <= N_SAMPLES; i++) {
    const u = 1 - (i / N_SAMPLES) * (1 - CRATER_U);
    const rad = u * PARICUTIN_CONE.r;
    const x = PARICUTIN_CONE.x + Math.sin(sampleA) * rad;
    const z = PARICUTIN_CONE.z + Math.cos(sampleA) * rad;
    const realY = paricutinY(x, z, baseY) ?? baseY;
    const hAbove = Math.max(0, realY - baseY);
    points.push(new THREE.Vector2(rad, hAbove));
  }
  const topY = points[points.length - 1].y;
  const lathe = new THREE.LatheGeometry(points, SEGS);
  // cap both ends (LatheGeometry leaves both poles open whenever their radius is > 0, which both
  // ours are — the real base radius and the real rim radius) so the silhouette never shows a hole
  // straight through it
  const topCap = new THREE.CircleGeometry(points[points.length - 1].x, SEGS);
  topCap.rotateX(-Math.PI / 2);
  topCap.translate(0, topY, 0);
  const botCap = new THREE.CircleGeometry(points[0].x, SEGS);
  botCap.rotateX(Math.PI / 2);
  const merged = mergeGeometries([lathe, topCap, botCap], false) ?? lathe;
  const flat = merged.toNonIndexed();
  flat.computeVertexNormals();
  const fpos = flat.attributes.position;
  // per-column radial jitter — ALWAYS a further shrink (0.93..0.97 of the already-SHRINK-scaled
  // radius), so irregularity can only pull the silhouette in, never push it back out past the
  // margin the coordinator asked for
  const r = rngOf(84411);
  const colJitter: number[] = Array.from({ length: SEGS + 1 }, () => 0.96 + r() * 0.04);
  for (let i = 0; i < fpos.count; i++) {
    const px = fpos.getX(i);
    const py = fpos.getY(i);
    const pz = fpos.getZ(i);
    const rad = Math.hypot(px, pz);
    if (rad < 1e-4) continue; // the summit/base cap centre points — leave them alone
    const ang = Math.atan2(pz, px);
    const col = Math.round(((ang + Math.PI) / (Math.PI * 2)) * SEGS) % (SEGS + 1);
    const k = SHRINK * colJitter[col];
    fpos.setX(i, (px / rad) * rad * k);
    fpos.setZ(i, (pz / rad) * rad * k);
    fpos.setY(i, py * SHRINK);
  }
  fpos.needsUpdate = true;
  flat.computeVertexNormals();
  const colors = new Float32Array(fpos.count * 3);
  // the real cone's own cinder-brown family (terrainMesh.ts's PARICUTIN_CINDER/_DARK), a rust ring
  // just under the rim, and the atmospheric haze confined to the base only
  const hazy = new THREE.Color("#7f93a0");
  const cinder = new THREE.Color("#746354");
  const cinderDark = new THREE.Color("#52463a");
  const rustTop = new THREE.Color("#8a5a42");
  const c = new THREE.Color();
  const jr = rngOf(84511);
  for (let i = 0; i < fpos.count; i++) {
    const py = fpos.getY(i);
    const u = topY > 0 ? py / topY : 0;
    c.copy(cinder).lerp(cinderDark, jr() * 0.4);
    c.lerp(rustTop, Math.max(0, (u - 0.74) / 0.26) * 0.7);
    c.lerp(hazy, Math.max(0, (0.1 - u) / 0.1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = Object.assign(new THREE.MeshToonMaterial({ vertexColors: true, fog: false, transparent: true, depthWrite: false }), { flatShading: true });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.name = "paricutin-far-silhouette";
  mesh.position.set(PARICUTIN_CONE.x, baseY, PARICUTIN_CONE.z);
  mesh.visible = false;
  mesh.renderOrder = -1;
  // opt out of the engine's ink-outline pass (the same convention world/waterways/falls.ts's
  // mist/spray/rainbow meshes use) — without this, the outline pass traces this mesh's own silhouette
  // edge as a thin dark line across the real cone's face while both are visible during the cross-fade
  mesh.layers.set(FX_NO_OUTLINE_LAYER);
  return mesh;
}

/** the half-buried church of San Juan Parangaricutiro — the real story's most famous image, built
 *  properly for polish round 2 (the first pass was "two beige pipes with tilted boxes"): a SQUARE
 *  stone bell tower (two tiers — a plain base, then a belfry with an arched opening on each of its
 *  four faces) topped with a little pyramidal cap and a cross; the top of the nave's own front
 *  facade standing just beside it, its arched doorway half-drowned in the lava flow with only the
 *  arch's own crown showing; a second, smaller tower, properly broken (no belfry left, just a
 *  jagged stump); rough, ANGULAR lava rock (never smooth round boulders) piled against every wall. */
function buildChurchRuins(): THREE.Group {
  const group = new THREE.Group();
  group.name = "paricutin-church";
  const baseY = groundY(PARICUTIN_CHURCH.x, PARICUTIN_CHURCH.z);
  const stoneMat = new THREE.MeshToonMaterial({ color: "#c9bda0" });
  const stoneWeatheredMat = new THREE.MeshToonMaterial({ color: "#a89880" });
  const stoneDarkMat = new THREE.MeshToonMaterial({ color: "#8a7a62" });
  const openingMat = new THREE.MeshToonMaterial({ color: "#0b0906" });
  const crossMat = new THREE.MeshToonMaterial({ color: "#3a332a" });
  // the rubble's own colour: a warm, ash-grey rockfall — deliberately NOT the same hex as the
  // ground's own PARICUTIN_LAVA/PARICUTIN_LAVA_LIGHT (world/fantasy/terrainMesh.ts), which would
  // blend invisibly into the apron instead of reading as a separate pile of rock
  const rubbleMat = new THREE.MeshToonMaterial({ color: "#5c4a38" });
  const rubbleMat2 = new THREE.MeshToonMaterial({ color: "#453526" });

  // rough, ANGULAR lava rock piled against a wall — icosahedra (jagged facets), never smooth
  // spheres, scattered at odd rotations so they read as a real rockfall, not a row of boulders; no
  // shadow-casting (many overlapping chunks stack their shadows into one solid black pool)
  const buildRockPile = (cx: number, cz: number, faceA: number, r: number) => {
    const pile = new THREE.Group();
    const n = 8;
    for (let i = 0; i < n; i++) {
      const spread = faceA + (i / (n - 1) - 0.5) * 2.0;
      const rad = r * (0.5 + (i % 3) * 0.28);
      const rockR = r * (0.28 + (i % 4) * 0.13);
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(rockR, 0), i % 2 ? rubbleMat : rubbleMat2);
      rock.position.set(cx + Math.sin(spread) * rad, baseY + rockR * 0.5, cz + Math.cos(spread) * rad);
      rock.rotation.set(i * 0.9, i * 1.3, i * 0.5);
      rock.scale.set(1, 0.75 + (i % 3) * 0.1, 1);
      rock.receiveShadow = true;
      pile.add(rock);
    }
    return pile;
  };

  // the bell tower: SQUARE in section (two box tiers, never a cylinder), a belfry with a dark
  // arched opening on every face, a little pyramidal roof, a cross
  const buildBellTower = (cx: number, cz: number, h: number, size: number, lean: number) => {
    const t = new THREE.Group();
    const baseH = h * 0.62;
    const belfryH = h * 0.3;
    const base = new THREE.Mesh(new THREE.BoxGeometry(size, baseH, size), stoneMat);
    base.position.y = baseH / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    t.add(base);
    // a weathered darker band low down (damp stone, not a clean stripe — a second, slightly wider
    // box with a couple of faces peeking past the base)
    const weather = new THREE.Mesh(new THREE.BoxGeometry(size * 1.03, baseH * 0.3, size * 1.03), stoneWeatheredMat);
    weather.position.y = baseH * 0.16;
    t.add(weather);
    // the belfry: a smaller square stage, one arched dark opening per face
    const belfrySize = size * 0.72;
    const belfry = new THREE.Mesh(new THREE.BoxGeometry(belfrySize, belfryH, belfrySize), stoneWeatheredMat);
    belfry.position.y = baseH + belfryH / 2;
    belfry.castShadow = true;
    t.add(belfry);
    for (const faceA of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const fx = Math.sin(faceA) * belfrySize * 0.51;
      const fz = Math.cos(faceA) * belfrySize * 0.51;
      const archBody = new THREE.Mesh(new THREE.BoxGeometry(belfrySize * 0.46, belfryH * 0.62, belfrySize * 0.14), openingMat);
      archBody.position.set(fx, baseH + belfryH * 0.42, fz);
      archBody.rotation.y = faceA;
      t.add(archBody);
      const archTop = new THREE.Mesh(new THREE.ConeGeometry(belfrySize * 0.24, belfryH * 0.3, 4), openingMat);
      archTop.rotation.y = faceA + Math.PI / 4;
      archTop.position.set(fx, baseH + belfryH * 0.42 + belfryH * 0.31 + belfryH * 0.15, fz);
      t.add(archTop);
    }
    // a little pyramidal cap, a plain cross on top
    const cap = new THREE.Mesh(new THREE.ConeGeometry(belfrySize * 0.78, h * 0.14, 4), stoneDarkMat);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = baseH + belfryH + (h * 0.14) / 2;
    cap.castShadow = true;
    t.add(cap);
    const crossY = baseH + belfryH + h * 0.14;
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(size * 0.06, h * 0.12, size * 0.06), crossMat);
    crossV.position.y = crossY + (h * 0.12) / 2;
    t.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(size * 0.3, size * 0.06, size * 0.06), crossMat);
    crossH.position.y = crossY + h * 0.07;
    t.add(crossH);
    t.position.set(cx, baseY, cz);
    t.rotation.z = lean;
    return t;
  };

  // the broken second tower: a plain square stump, no belfry left — just a jagged, collapsed top,
  // properly ruined (per the brief: "a broken second tower", distinct from the main bell tower)
  const buildBrokenTower = (cx: number, cz: number, h: number, size: number, lean: number, buried: number) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), stoneMat);
    body.position.y = h / 2 - buried;
    body.castShadow = true;
    body.receiveShadow = true;
    t.add(body);
    for (let i = 0; i < 5; i++) {
      const cs = size * (0.4 + (i % 3) * 0.22);
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(cs, cs * (0.5 + (i % 2) * 0.4), cs), i % 2 ? stoneDarkMat : stoneWeatheredMat);
      const a = i * 1.5;
      const rad = size * (0.18 + (i % 3) * 0.18);
      chunk.position.set(Math.sin(a) * rad, h - buried - cs * 0.2 + i * size * 0.08, Math.cos(a) * rad);
      chunk.rotation.set(i * 0.7, i * 1.1, i * 0.5);
      chunk.castShadow = true;
      t.add(chunk);
    }
    t.position.set(cx, baseY, cz);
    t.rotation.z = lean;
    return t;
  };

  // the nave facade's own top: a flat, broad wall (the front gable end), its arched doorway
  // half-drowned in the lava so only the arch's own crown still shows above it — a crisp story
  // beat, right at eye level
  const buildFacadeTop = (cx: number, cz: number, w: number, h: number, buried: number) => {
    const t = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.18), stoneMat);
    wall.position.y = h / 2 - buried;
    wall.castShadow = true;
    wall.receiveShadow = true;
    t.add(wall);
    // a broken, stepped pediment along the top (never a clean flat roofline)
    for (let i = 0; i < 4; i++) {
      const cs = w * (0.18 + (i % 2) * 0.1);
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(cs, cs * 0.7, w * 0.2), i % 2 ? stoneDarkMat : stoneWeatheredMat);
      chunk.position.set((i - 1.5) * w * 0.22, h - buried + cs * 0.25, 0);
      chunk.rotation.set(i * 0.3, i * 0.5, i * 0.2);
      chunk.castShadow = true;
      t.add(chunk);
    }
    // the arched doorway: only its upper crown pokes above the "buried" line (`buried` sinks the
    // whole facade down, so the doorway opening — fixed near the base — reads as drowned in lava)
    const doorW = w * 0.3;
    const doorH = h * 0.55;
    const doorY = doorH / 2 - buried;
    if (doorY + doorH / 2 > 0.3) {
      // enough of it still shows to bother drawing
      const doorBody = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, w * 0.22), openingMat);
      doorBody.position.set(0, doorY, 0);
      t.add(doorBody);
      const doorArch = new THREE.Mesh(new THREE.ConeGeometry(doorW * 0.53, doorW * 0.5, 4), openingMat);
      doorArch.rotation.y = Math.PI / 4;
      doorArch.position.set(0, doorY + doorH / 2 + doorW * 0.25, 0);
      t.add(doorArch);
    }
    t.position.set(cx, baseY, cz);
    return t;
  };

  const towardOpen = Math.PI * 0.15; // the rock piles lean away from the kid's usual approach
  group.add(buildBellTower(PARICUTIN_CHURCH.x - 2.8, PARICUTIN_CHURCH.z - 0.4, 10.5, 2.6, 0.02));
  group.add(buildFacadeTop(PARICUTIN_CHURCH.x + 0.6, PARICUTIN_CHURCH.z + 0.3, 5.6, 5.8, 2.6));
  group.add(buildBrokenTower(PARICUTIN_CHURCH.x + 3.6, PARICUTIN_CHURCH.z - 0.6, 5.4, 2.1, -0.07, 1.9));
  group.add(buildRockPile(PARICUTIN_CHURCH.x - 2.8, PARICUTIN_CHURCH.z - 0.4, towardOpen, 2.4));
  group.add(buildRockPile(PARICUTIN_CHURCH.x + 0.6, PARICUTIN_CHURCH.z + 0.3, towardOpen + 0.4, 3.4));
  group.add(buildRockPile(PARICUTIN_CHURCH.x + 3.6, PARICUTIN_CHURCH.z - 0.6, towardOpen - 0.5, 2.1));
  return group;
}

/** a few roadrunner-like birds and lizards, dotted among the farm's rim of boulders — small, cheap,
 *  static (a touch of true desert-scrub life, not simulated) */
function buildLittleLife(): THREE.Group {
  const group = new THREE.Group();
  group.name = "paricutin-little-life";
  const r = rngOf(70707);
  const lizardMat = new THREE.MeshToonMaterial({ color: "#7a8f5a" });
  const birdMat = new THREE.MeshToonMaterial({ color: "#8a7a5e" });
  const birdTailMat = new THREE.MeshToonMaterial({ color: "#2a2a2a" });
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const rad = PARICUTIN_CONE.r * 1.15 + r() * 30;
    const x = PARICUTIN_CONE.x + Math.sin(a) * rad;
    const z = PARICUTIN_CONE.z + Math.cos(a) * rad;
    const y = groundY(x, z);
    const lizard = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 2, 5), lizardMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.08;
    lizard.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 5), lizardMat);
    tail.rotation.z = -Math.PI / 2;
    tail.position.set(-0.22, 0.08, 0);
    lizard.add(tail);
    lizard.position.set(x, y, z);
    lizard.rotation.y = r() * Math.PI * 2;
    group.add(lizard);
  }
  for (let i = 0; i < 2; i++) {
    const a = r() * Math.PI * 2;
    const rad = PARICUTIN_CONE.r * 1.3 + r() * 40;
    const x = PARICUTIN_CONE.x + Math.sin(a) * rad;
    const z = PARICUTIN_CONE.z + Math.cos(a) * rad;
    const y = groundY(x, z);
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.18, 2, 6), birdMat);
    body.rotation.z = Math.PI / 2.3;
    body.position.y = 0.22;
    bird.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), birdTailMat);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-0.26, 0.26, 0);
    bird.add(tail);
    const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, birdTailMat);
      leg.position.set(0.04, 0.1, side * 0.03);
      bird.add(leg);
    }
    bird.position.set(x, y, z);
    bird.rotation.y = r() * Math.PI * 2;
    group.add(bird);
  }
  return group;
}

/** a few low wooden railing posts along the climb trail's own switchback turns — a friendly touch
 *  (the trail is on solid ground, not a raised deck, so there's no fall-off risk to engineer
 *  against, but a few posts read as "a real mountain path" the way Everest's own ladders do) */
function buildRailingPosts(): THREE.InstancedMesh {
  const N = 14;
  const geo = new THREE.CylinderGeometry(0.05, 0.06, 0.7, 5);
  const mat = new THREE.MeshToonMaterial({ color: "#6e4a2e" });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = "paricutin-railing-posts";
  mesh.castShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < N; i++) {
    const u = 0.08 + (i / N) * 0.86;
    const idx = Math.min(PARICUTIN_ROUTE.length - 1, Math.floor(u * (PARICUTIN_ROUTE.length - 1)));
    const next = Math.min(PARICUTIN_ROUTE.length - 1, idx + 1);
    const [rx, rz] = PARICUTIN_ROUTE[idx];
    const [nx, nz] = PARICUTIN_ROUTE[next];
    const dx = nx - rx;
    const dz = nz - rz;
    const l = Math.hypot(dx, dz) || 1;
    const side = (i % 2 === 0 ? 1 : -1) * 1.6;
    const px = rx + (dz / l) * side;
    const pz = rz + (-dx / l) * side;
    const y = groundY(px, pz);
    m4.compose(new THREE.Vector3(px, y + 0.35, pz), q.identity(), scale);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function buildParicutinDecor(scene: THREE.Scene): ParicutinDecor {
  const group = new THREE.Group();
  group.name = "paricutin-decor";
  const pool = buildLavaPool();
  pool.group.position.set(PARICUTIN_CONE.x, craterFloorY() + 0.25, PARICUTIN_CONE.z);
  group.add(pool.group);
  const glow = buildCraterGlow();
  group.add(glow);
  const vents = buildCrackVents();
  group.add(vents);
  const plume = buildAshPlume();
  group.add(plume);
  const bombs = buildLavaBombs();
  group.add(bombs);
  group.add(buildChurchRuins());
  group.add(buildLittleLife());
  group.add(buildRailingPosts());
  // the lava field's own decor: rocks, ridges, glowing cracks, steam, the front rubble wall
  group.add(buildLavaFieldRocks());
  group.add(buildLavaFieldRidges());
  group.add(buildLavaFieldCracks());
  const steam = buildSteamWisps();
  group.add(steam);
  group.add(buildLavaFrontWall());
  // the tall landmark plume (fog-proof) and the far, fog-proof silhouette — both read from the farm
  const landmarkPlume = buildLandmarkPlume();
  group.add(landmarkPlume);
  const farSilhouette = buildFarSilhouette();
  group.add(farSilhouette);
  scene.add(group);

  const floorY = craterFloorY();
  const N_PUFFS = 42;
  const plumeSeed: number[] = Array.from({ length: N_PUFFS }, (_, i) => i * 0.231);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const ashCol = new THREE.Color();
  const bombT: number[] = Array.from({ length: 9 }, (_, i) => i * 0.63);
  // the summit (roughly) — the landmark plume rises from up here, not the crater floor
  const summitY = groundY(PARICUTIN_RIM.x, PARICUTIN_RIM.z);
  const N_LANDMARK = 14;
  const landmarkSeed: number[] = Array.from({ length: N_LANDMARK }, (_, i) => i * 0.37);
  const N_STEAM = 16;
  const steamSeed: { a: number; rad: number; phase: number }[] = Array.from({ length: N_STEAM }, (_, i) => ({
    a: i * 2.4,
    rad: FIELD_IN + 8 + (i % 7) * ((FIELD_OUT - FIELD_IN - 16) / 7),
    phase: i * 0.19,
  }));
  const steamCol = new THREE.Color(1, 1, 1);

  return {
    group,
    update(dt: number, t: number, glowK = 0, focus?: THREE.Vector3) {
      // round 5: the coordinator confirmed the black-frame bug is gone (0/70 at four rim points) but
      // disputed the round-4 causal explanation (unbounded rotation.y — "sin/cos of a few thousand
      // radians is exact enough") without asking for further root-causing. This is pure defence in
      // depth against that whole CLASS of bug: bail out before touching any state at all if the
      // frame's own dt/t, or the kid's focus position, is ever NaN/Infinity — so this function can
      // never write a non-finite value into a matrix, rotation, scale or uniform, whatever the real
      // upstream cause of a bad frame turns out to be.
      if (!Number.isFinite(dt) || !Number.isFinite(t)) return;
      if (focus && (!Number.isFinite(focus.x) || !Number.isFinite(focus.y) || !Number.isFinite(focus.z))) return;

      // the lava pool: a slow, cheap "churn" — two rings independently rotating, never rebuilt
      // wrapped to ±2π each frame: an unbounded rotation.y (accumulating dt forever, every frame,
      // for as long as the park's been open) eventually loses enough float precision that THREE's
      // own sin/cos range-reduction for the rotation matrix degrades — a real risk over a long
      // session, and the exact kind of thing a hijacked-clock test (many large fake dt steps in a
      // few seconds) can trigger far sooner than real play would.
      pool.mid.rotation.y = (pool.mid.rotation.y + dt * 0.1) % (Math.PI * 2);
      pool.outer.rotation.y = (pool.outer.rotation.y - dt * 0.055) % (Math.PI * 2);
      const poolCoreMat = pool.core.material as THREE.MeshBasicMaterial;
      poolCoreMat.opacity = 0.9 + Math.sin(t * 1.4) * 0.06;

      // the far, fog-proof silhouette: visible once the kid is far enough that the real terrain's
      // own colours would be lost in the shared atmosphere haze (round 3: "the cone cannot be seen
      // from the farm") — faded in/out over a real band (140-180 units), not a hard cut (round 4's
      // own re-check: "make the swap to the real terrain invisible... no pop, no double image, no
      // gap") — a smooth cross-fade reads as continuous even though both meshes briefly overlap.
      if (focus) {
        const dKid = Math.hypot(focus.x - PARICUTIN_CONE.x, focus.z - PARICUTIN_CONE.z);
        const fadeK = smoothstep01(140, 180, dKid);
        const fsMat = farSilhouette.material as THREE.MeshToonMaterial;
        fsMat.opacity = fadeK;
        farSilhouette.visible = fadeK > 0.01;
      }

      // the tall landmark plume: big, soft, slow puffs rising high above the summit — FOG-DISABLED
      // (its own material), so it stays visible from the farm, the railway and the plains long
      // before the cone's own silhouette resolves
      for (let i = 0; i < landmarkSeed.length; i++) {
        const seed = landmarkSeed[i];
        const life = (t * 0.045 + seed) % 1;
        const a = seed * 7.7 + Math.floor((t * 0.045 + seed) / 1) * 1.7;
        const wobble = Math.sin(t * 0.25 + seed * 13) * 6 + life * 10 * Math.sin(seed * 31);
        const x = PARICUTIN_CONE.x + wobble;
        const z = PARICUTIN_CONE.z + Math.cos(a) * 3 + wobble * 0.4;
        const y = summitY + 4 + life * 110; // rises 80-120+ units above the summit
        const fadeOut = 1 - smoothstep01(0.75, 1, life);
        const fadeIn = smoothstep01(0, 0.08, life);
        const s = (2.2 + life * 9) * fadeOut * fadeIn;
        m4.compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(s, s, s));
        landmarkPlume.setMatrixAt(i, m4);
      }
      landmarkPlume.instanceMatrix.needsUpdate = true;
      const lpMat = landmarkPlume.material as THREE.MeshBasicMaterial;
      lpMat.opacity = 0.38;

      // a few steam wisps drifting up here and there over the field, short and sparse
      for (let i = 0; i < steamSeed.length; i++) {
        const sd = steamSeed[i];
        const life = (t * 0.09 + sd.phase) % 1;
        const x = PARICUTIN_CONE.x + Math.sin(sd.a) * sd.rad;
        const z = PARICUTIN_CONE.z + Math.cos(sd.a) * sd.rad;
        const y = groundY(x, z) + 1 + life * 6;
        const fadeOut = 1 - smoothstep01(0.7, 1, life);
        const s = (0.5 + life * 1.4) * fadeOut;
        m4.compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(s, s, s));
        steam.setMatrixAt(i, m4);
        steam.setColorAt(i, steamCol);
      }
      steam.instanceMatrix.needsUpdate = true;
      // the glow pulses gently, brighter by night (glowK: 0 day .. 1 night)
      const g0 = glow.material as THREE.MeshBasicMaterial;
      g0.opacity = 0.34 + Math.sin(t * 1.1) * 0.08 + glowK * 0.25;
      const core = glow.children[0] as THREE.Mesh;
      (core.material as THREE.MeshBasicMaterial).opacity = 0.42 + Math.sin(t * 1.7 + 1) * 0.1 + glowK * 0.3;
      const light = glow.children[1] as THREE.PointLight;
      if (light) light.intensity = 2.2 + glowK * 2.6;

      // the crack vents: a visible, crisp glow by day; a more saturated, slightly pulsing one by
      // night — never additive, so it always reads as a lit shape, never washed out
      const vm = vents.material as THREE.MeshBasicMaterial;
      vm.opacity = 0.75 + Math.sin(t * 2.3) * 0.08 + glowK * 0.2;
      vm.color.setHSL(0.07, 0.85, 0.42 + Math.sin(t * 2.3) * 0.04 + glowK * 0.15);

      // ash drifts up in a loose, layered column above the crater: many small puffs, each fading
      // in, growing, and brightening (greyish near the floor, lighter/whiter higher up) before
      // resetting — a soft cloud, not a stack of flat grey balls
      for (let i = 0; i < plumeSeed.length; i++) {
        const seed = plumeSeed[i];
        const life = (t * 0.16 + seed) % 1;
        const spread = (0.25 + life * 1.3) * RIM_R;
        const a = seed * 11.3 + Math.floor((t * 0.16 + seed) / 1) * 2.1; // a new drift path each loop
        const wobble = Math.sin(t * 0.7 + seed * 19) * 2.2;
        const x = PARICUTIN_CONE.x + Math.sin(a) * spread * 0.4 + wobble;
        const z = PARICUTIN_CONE.z + Math.cos(a) * spread * 0.4 + wobble * 0.6;
        const y = floorY + 1 + life * life * 30; // accelerates upward, like a real rising puff
        const fadeOut = 1 - smoothstep01(0.78, 1, life);
        // small puffs (the crater bowl itself is only ~RIM_R=19 units across): round 2's first pass
        // scaled up to a 3+ unit radius at full life, which read as a few giant flat dark discs
        // filling the bowl rather than a soft drifting cloud — a quarter the size looks right next
        // to the kid's own ~1-2 unit scale
        const s = (0.18 + life * 0.62) * fadeOut;
        m4.compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(s, s, s * 0.85));
        plume.setMatrixAt(i, m4);
        // darker ash near the floor, soft pale grey-white by the time it's high and about to fade
        const bright = 0.35 + life * 0.5;
        ashCol.setRGB(bright, bright * 0.98, bright * 0.95);
        plume.setColorAt(i, ashCol);
      }
      plume.instanceMatrix.needsUpdate = true;
      if (plume.instanceColor) plume.instanceColor.needsUpdate = true;
      const pm = plume.material as THREE.MeshBasicMaterial;
      pm.opacity = 0.32;

      // lava bombs: slow, looping lobs that never leave the bowl
      for (let i = 0; i < bombT.length; i++) {
        const seed = bombT[i];
        const u = (t * 0.3 + seed) % 1;
        const arc = Math.sin(u * Math.PI);
        const a = seed * 9.1;
        const rad = RIM_R * 0.5;
        const x = PARICUTIN_CONE.x + Math.sin(a) * rad;
        const z = PARICUTIN_CONE.z + Math.cos(a) * rad;
        const y = floorY + 1 + arc * 9;
        const s = 0.22 + arc * 0.08;
        m4.compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(s, s, s));
        bombs.setMatrixAt(i, m4);
      }
      bombs.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.parent?.remove(group);
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m?.dispose();
        }
      });
    },
  };
}
