// The island's road network in 3D (Agent R; the route + frozen heights: ../../registry/roads.ts).
// Streamed like the Wildlands Railway (world/railway/index.ts is the model): the long ribbon is
// built a section at a time as the kid nears it and dropped when far. The small, fixed number of
// bridges, tunnels, car parks and junction signs are built once, up front (there are only a couple
// of each — far cheaper than streaming them, and they're all far enough apart that only the nearby
// ones are ever in view / un-fogged anyway).
//
//   road      dark asphalt with a painted grain, white edge lines, a dashed centre line (one
//             shared canvas texture, tiled along the ribbon — see lib/game3d/interiors/
//             kartScenery.ts's own road for the technique this follows)
//   verges    the grass mask (world/fantasy/mask.ts) already keeps grass off the bed; a kerb line
//             is painted into the same texture so the edge reads crisply at the park's normal
//             camera distance
//   lamps     posts along the ribbon near every car park and settlement
//   signs     a fingerpost at every junction (registry/roads.ts's ROAD_JUNCTIONS), "P" signboards
//             at every car park
//   bridges   a textured deck, timber rails on posts, stone piers down to the real ground; the
//             grand Wild River Viaduct also gets two candy-steel arch ribs (the same through-arch
//             idea as world/waterways/wildBridge.ts's Victoria Falls Bridge, simplified)
//   tunnels   a stone portal (arch, keystone, name plate) at each end, a dark barrel lining with
//             ceiling lamps the whole bored length, and a low rock/earth mound over the trench so
//             the hill reads as whole from outside
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundY } from "../../registry/terrain";
import { groundColor } from "../fantasy/terrainMesh";
import { rawHeight } from "../../registry/landform";
import { ROAD_SEGMENTS, ROAD_HALF, ROAD_SURFACE_LIFT, ROUNDABOUT_OUTER, ROUNDABOUT_INNER, densifyRoad, BRIDGES, TUNNELS, CAR_PARKS, ROAD_JUNCTIONS, LEVEL_CROSSINGS, crossingBoomDown, type RoadSeg, type RoadBridge, type RoadTunnel, type CarPark } from "../../registry/roads";
import { nearestRail, railAt, railIndexAt, RAIL_POINTS } from "../../registry/railway";
import { labelSprite } from "@/lib/game3d/buildingKit";

const SEC = 18; // points per streamed road section
const SHOW_R = 420; // built/shown within this of the kid (fog hides past ~430 anyway)

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const r0 = rng(20261006);

// ── the shared road texture (asphalt grain, edge lines, a dashed centre line, a soft kerb shadow) ──
const ROAD_TEX = canvasTex(256, 256, (c) => {
  c.fillStyle = "#54545c";
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const v = 60 + Math.floor(r0() * 60);
    c.fillStyle = `rgba(${v + 14},${v + 14},${v + 20},${0.2 + r0() * 0.3})`;
    c.fillRect(r0() * 256, r0() * 256, 1 + r0() * 1.6, 1 + r0() * 1.6);
  }
  // a faint rubbered groove either side of the centre
  const g = c.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "rgba(0,0,0,0.16)");
  g.addColorStop(0.2, "rgba(0,0,0,0)");
  g.addColorStop(0.5, "rgba(0,0,0,0.1)");
  g.addColorStop(0.8, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.16)");
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  // edge lines
  c.fillStyle = "#f3eee0";
  c.fillRect(10, 0, 6, 256);
  c.fillRect(240, 0, 6, 256);
  // dashed centre line
  c.fillStyle = "#f0e3ad";
  for (let y = 0; y < 256; y += 40) c.fillRect(125, y, 6, 22);
});
// a small, bright asphalt patch for car park aprons (bay stripes)
const PARK_TEX = canvasTex(256, 256, (c) => {
  c.fillStyle = "#5c5c64";
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 70 + Math.floor(r0() * 50);
    c.fillStyle = `rgba(${v},${v},${v + 8},0.3)`;
    c.fillRect(r0() * 256, r0() * 256, 1.4, 1.4);
  }
  c.strokeStyle = "#f2eddb";
  c.lineWidth = 5;
  for (const x of [40, 88, 136, 184]) {
    c.beginPath();
    c.moveTo(x, 18);
    c.lineTo(x, 100);
    c.stroke();
  }
});
// DoubleSide: a ribbon's winding can flip sign at a bend (same reason
// lib/game3d/interiors/kartScenery.ts's own road material uses it) — never let that cull the road
// away when the kid is looking at the "wrong" side of a tight corner
const roadMat = new THREE.MeshStandardMaterial({ map: ROAD_TEX, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
const parkMat = new THREE.MeshStandardMaterial({ map: PARK_TEX, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });

// ── little reusable solid-colour parts (posts, portals, piers — one shared vertex-coloured mat) ──
const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
// the lamp heads' own material: shared across every lamp (sections stream in/out, but there's only
// ever one THREE.Material object, so toggling night on/off is one assignment, not a per-lamp loop
const lampMat = new THREE.MeshStandardMaterial({ color: "#fff0b8", emissive: "#000000", emissiveIntensity: 0, roughness: 0.55 });
/** day <-> night: emissive glow only after dark (ParkWorld.isNight), one assignment for every lamp */
function setLampsNight(night: boolean) {
  lampMat.emissive.set(night ? "#ffcf6b" : "#000000");
  lampMat.emissiveIntensity = night ? 1.6 : 0;
}
// a tunnel's ceiling lamps are lit day and night (it's dark in there regardless)
const tunnelLampMat = new THREE.MeshStandardMaterial({ color: "#fff0b8", emissive: "#ffcf6b", emissiveIntensity: 1.3, roughness: 0.55 });
// the tunnel floor's own material: same look as roadMat (not shared with it — roadMat is used
// everywhere else, in daylight, and giving IT an emissive would glow every ordinary road too) plus a
// small constant emissive, since the lamps above glow but don't cast real light onto the floor (no
// per-lamp dynamic light — too many draw calls down a few-hundred-unit bore) — without it the floor
// reads as solid black wherever a lamp isn't directly in frame.
const tunnelFloorMat = new THREE.MeshStandardMaterial({ map: ROAD_TEX, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, emissive: "#2a241c", emissiveIntensity: 0.45 });
const LAMP_COL = new THREE.Color("#fff0b8");
const POST_COL = new THREE.Color("#6b5a46");
const SIGN_COL = new THREE.Color("#f6efd8");
const SIGN_POST_COL = new THREE.Color("#5a4632");
const STONE_COL = new THREE.Color("#9a9186");
const STONE_D = new THREE.Color("#7c756b");
const MOUND_COL = new THREE.Color("#6f8f4e");
const MOUND_D = new THREE.Color("#5a7540");
const TIMBER_COL = new THREE.Color("#b98a52");
const RAIL_RED = new THREE.Color("#d84a52");
const RAIL_RED_D = new THREE.Color("#ab333c");
const GATE_COL = new THREE.Color("#e7e3da");
const GATE_STRIPE = new THREE.Color("#d84a52");
const GRASS_COL = new THREE.Color("#5a9a4a");

// ── roundabouts: every 3+-way junction (registry/roads.ts's ROAD_JUNCTIONS) gets a one-lane ring
// round a planted island instead of several ribbons overlapping at odd angles over one big slab —
// round 3's fix for "the Park Station hub is a mess". Every road's own ribbon stops cleanly at the
// ring's outer edge (see the trim in buildSection below); the ring itself is drawn with roadMat, its
// UV wrapped round the circumference so the SAME dashed-line texture used along every straight
// stretch reads as a continuous lane marking with no extra art. ROUNDABOUT_OUTER/INNER themselves
// live in registry/roads.ts (a leaf module) — terrain.ts needs them too, to stamp the ring's own flat
// bed, and it can't import this file (three.js, and this file imports terrain.ts's groundY).

const clean = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== "position" && k !== "normal") out.deleteAttribute(k);
  return out;
};
function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const out = clean(g);
  const n = out.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const e4 = new THREE.Euler();
const v4 = new THREE.Vector3();
const s4 = new THREE.Vector3(1, 1, 1);
function put(parts: THREE.BufferGeometry[], g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, pitch = 0, sx = 1, sy = 1, sz = 1) {
  e4.set(pitch, yaw, 0, "YXZ");
  m4.compose(v4.set(x, y, z), q4.setFromEuler(e4), s4.set(sx, sy, sz));
  parts.push(g.clone().applyMatrix4(m4));
}

/** a lamp post, all in `lampParts` — the shared emissive `lampMat` (no vertex colours: the whole
 *  post reads as a plain cream post by day and glows warm at night, one material swap for all of
 *  them — see setLampsNight()); a soft painted "light pool" disc on the ground completes it */
function lampPost(lampParts: THREE.BufferGeometry[], x: number, y: number, z: number) {
  put(lampParts, new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), x, y + 1.3, z);
  put(lampParts, new THREE.SphereGeometry(0.22, 8, 6), x, y + 2.75, z);
  put(lampParts, new THREE.ConeGeometry(0.3, 0.22, 8), x, y + 3.0, z);
}

/** a wooden signboard on a post, facing `face` */
function signboard(group: THREE.Group, parts: THREE.BufferGeometry[], x: number, y: number, z: number, face: number) {
  put(parts, paint(new THREE.CylinderGeometry(0.07, 0.08, 1.9, 6), SIGN_POST_COL), x, y + 0.95, z);
  put(parts, paint(new THREE.BoxGeometry(1.5, 0.55, 0.08), SIGN_COL), x, y + 1.85, z, face);
  put(parts, paint(new THREE.BoxGeometry(1.58, 0.1, 0.1), SIGN_POST_COL), x, y + 2.14, z, face);
}

// ── the frozen chain's own heading at a point (for signs / lamps / perpendicular offsets) ──
function headingAt(seg: RoadSeg, i: number): number {
  const a = seg.points[Math.max(0, i - 1)];
  const b = seg.points[Math.min(seg.points.length - 1, i + 1)];
  return Math.atan2(b.x - a.x, b.z - a.z);
}

// The ribbon is DRAPED over the real ground: every vertex takes the highest ground within a
// stride of it (the terrain mesh is a coarser grid than groundY, so its triangles can stand a
// little proud of any single sample) plus a small z-fighting clearance. terrain.ts stamps a flat
// bed under the road, so on ordinary ground this is simply the bed; where the road meets the
// railway, a path or a station pad it follows whatever ground won there instead of being buried.
const GROUND_LIFT = ROAD_SURFACE_LIFT;
const DRAPE = 1.6;
function drapeY(x: number, z: number): number {
  return Math.max(groundY(x, z), groundY(x + DRAPE, z), groundY(x - DRAPE, z), groundY(x, z + DRAPE), groundY(x, z - DRAPE)) + GROUND_LIFT;
}

/** one streamed road section: the ribbon (textured) + its furniture (lamps/kerb posts/reflectors/
 *  guard rails on steep bends), one draw call each. The ribbon trusts the frozen/densified bed
 *  height directly (+ GROUND_LIFT) — not groundY() — now that terrain.ts stamps a flat bed under
 *  this exact point set (registry/roads.ts's densifyRoad(), shared by both). Three vertices across
 *  (left/centre/right), not just two edges, so the centreline sits on the bed too. */
function buildSection(seg: RoadSeg, k: number): THREE.Group {
  const raw = seg.points.slice(k * SEC, Math.min(seg.points.length, k * SEC + SEC + 1));
  const group = new THREE.Group();
  group.name = `road-${seg.id}-${k}`;
  if (raw.length < 2) return group;
  let pts = densifyRoad(raw, 2.5);
  // every road ends at a roundabout's own outer ring with a real OVERLAP (round 4: a plain trim at
  // the ring's exact edge left a hairline seam — bare earth between the ribbon's last vertex and the
  // ring, since the two meshes' edges don't quite land on the same float. Trim 1 unit INSIDE the
  // ring instead (ROUNDABOUT_OUTER - 1), so the ribbon's last stretch is drawn UNDER the ring with a
  // real metre of overlap — the ring itself is built with a touch more height (+0.01, see
  // buildRoundabout) so it draws on top and the seam is never visible.
  const JOIN_OVERLAP = 1;
  const nearJunction = (p: { x: number; z: number }) => ROAD_JUNCTIONS.some((j) => Math.hypot(p.x - j.x, p.z - j.z) < ROUNDABOUT_OUTER - JOIN_OVERLAP);
  // round 4: a plain "stop at the first point that's back out of range" scan (tried first) missed a
  // real case — a road that starts right at a junction can swing back within the ring's own radius a
  // few points later (its own stub out to the junction, then its pre-existing route curving back
  // near the new hub before straightening away for good — measured on ring-h2-h3, dipping back to
  // 20.7 at point 6 after its stub already carried it out to 40 at point 1): the simple scan stopped
  // trimming at point 1 and left the still-too-close points 2-6 drawn right across the roundabout's
  // own interior. Scan the WHOLE prefix/suffix instead and trim up to the LAST near point, not the
  // first point that happens to be far enough away.
  // (bounded to each half so a road passing close to a DIFFERENT junction at its other end, often
  // only a few hundred points away in a long section, can never be mistaken for this end's own dip)
  const mid = pts.length >> 1;
  let lo = 0;
  for (let i = 0; i < mid; i++) if (nearJunction(pts[i])) lo = i + 1;
  let hi = pts.length;
  for (let i = pts.length - 1; i >= mid; i--) if (nearJunction(pts[i])) hi = i;
  pts = pts.slice(lo, hi);
  if (pts.length < 2) return group;
  // ribbon geometry (UV.v runs along the road so the dashed line tiles sensibly) — 3 vertices across
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    // the road's direction here: the average of the stretch before and after (the last point of a
    // section takes the stretch before it — with no direction its cross-section collapsed to a
    // point and left a bow-tie gap at every section join)
    const p0 = pts[Math.max(0, i - 1)];
    const dx = b.x - p0.x;
    const dz = b.z - p0.z;
    const l = Math.hypot(dx, dz) || 1;
    const px = dz / l;
    const pz = -dx / l;
    // five vertices across (edges, quarter points, centre), each on the ground under it
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      const vx = a.x + px * ROAD_HALF * f;
      const vz = a.z + pz * ROAD_HALF * f;
      pos.push(vx, drapeY(vx, vz), vz);
    }
    uv.push(0, s / 9, 0.25, s / 9, 0.5, s / 9, 0.75, s / 9, 1, s / 9);
    if (i + 1 < pts.length) s += Math.hypot(b.x - a.x, b.z - a.z);
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = i * 5;
    for (let c = 0; c < 4; c++) idx.push(a + c, a + c + 1, a + c + 5, a + c + 1, a + c + 6, a + c + 5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ribbon = new THREE.Mesh(geo, roadMat);
  ribbon.receiveShadow = true;
  ribbon.name = "ribbon";
  group.add(ribbon);

  // furniture: a lamp every ~70 units (alternating sides), a reflector post every ~16 units, a
  // guard rail along the outer edge of any stretch bending sharply (a steep outer bend)
  const parts: THREE.BufferGeometry[] = [];
  const lampParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < raw.length; i += 7) {
    const p = raw[i];
    const h = headingAt(seg, k * SEC + i);
    const side = i % 14 === 0 ? 1 : -1;
    const lx = p.x + Math.cos(h) * side * (ROAD_HALF + 1.1);
    const lz = p.z - Math.sin(h) * side * (ROAD_HALF + 1.1);
    lampPost(lampParts, lx, groundY(lx, lz), lz);
  }
  for (let i = 2; i + 2 < pts.length; i += 5) {
    const a = pts[i - 2];
    const b = pts[i + 2];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const prevHeading = Math.atan2(pts[Math.max(0, i - 4)].x - a.x || 1e-6, pts[Math.max(0, i - 4)].z - a.z || 1e-6);
    void prevHeading;
    const p = pts[i];
    for (const side of [-1, 1]) {
      const rx = p.x + Math.cos(heading) * side * (ROAD_HALF + 0.5);
      const rz = p.z - Math.sin(heading) * side * (ROAD_HALF + 0.5);
      put(parts, paint(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 5), side > 0 ? GATE_STRIPE : SIGN_COL), rx, groundY(rx, rz) + 0.25, rz);
    }
  }
  // guard rails: wherever the road's own heading turns more than ~0.09 rad between samples spaced
  // ~13 units apart (a tight bend), a timber rail on posts runs along the OUTER edge of the bend
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const hA = Math.atan2(b.x - a.x, b.z - a.z);
    const look = pts[Math.min(pts.length - 1, i + 5)];
    const hB = Math.atan2(look.x - b.x, look.z - b.z);
    let turn = hB - hA;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    if (Math.abs(turn) < 0.05) continue;
    const side = turn > 0 ? -1 : 1; // the outside of the bend
    const rx = a.x + Math.cos(hA) * side * (ROAD_HALF + 0.35);
    const rz = a.z - Math.sin(hA) * side * (ROAD_HALF + 0.35);
    const gy = groundY(rx, rz);
    put(parts, paint(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 5), POST_COL), rx, gy + 0.3, rz);
    const bx = b.x + Math.cos(hA) * side * (ROAD_HALF + 0.35);
    const bz = b.z - Math.sin(hA) * side * (ROAD_HALF + 0.35);
    const len = Math.hypot(bx - rx, bz - rz);
    put(parts, paint(new THREE.BoxGeometry(0.12, 0.12, len + 0.05), TIMBER_COL), (rx + bx) / 2, gy + 0.55, (rz + bz) / 2, hA);
  }
  if (lampParts.length) {
    const fgeo = merge2(lampParts);
    const fmesh = new THREE.Mesh(fgeo, lampMat);
    fmesh.castShadow = true;
    fmesh.name = "lamps";
    group.add(fmesh);
  }
  if (parts.length) {
    const fgeo = merge2(parts);
    const fmesh = new THREE.Mesh(fgeo, solidMat);
    fmesh.castShadow = true;
    fmesh.name = "furniture";
    group.add(fmesh);
  }
  return group;
}
function merge2(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ── bridges (built once: there are only two) ──
function buildBridge(b: RoadBridge): THREE.Group {
  const group = new THREE.Group();
  group.name = `bridge-${b.id}`;
  const hx = Math.sin(b.heading);
  const hz = Math.cos(b.heading);
  const px = Math.cos(b.heading);
  const pz = -Math.sin(b.heading);
  const deckY = (u: number) => b.y0 + (b.y1 - b.y0) * u + Math.sin(u * Math.PI) * b.rise;
  // deck: a textured ribbon, exactly like a road section, cambered per bridgeDeckAt's own formula
  const n = Math.max(10, Math.round(b.span / 2.2));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = (u - 0.5) * b.span;
    const x = b.x + hx * a;
    const z = b.z + hz * a;
    const y = deckY(u);
    pos.push(x - px * b.half, y, z - pz * b.half, x + px * b.half, y, z + pz * b.half);
    uv.push(0, (u * b.span) / 9, 1, (u * b.span) / 9);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  dgeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  dgeo.setIndex(idx);
  dgeo.computeVertexNormals();
  const deck = new THREE.Mesh(dgeo, roadMat);
  deck.receiveShadow = true;
  deck.castShadow = true;
  deck.name = "deck";
  group.add(deck);

  const parts: THREE.BufferGeometry[] = [];
  // timber rails on posts along both edges
  for (const side of [-1, 1]) {
    for (let i = 0; i <= n; i += 2) {
      const u = i / n;
      const a = (u - 0.5) * b.span;
      const x = b.x + hx * a + px * b.half * side;
      const z = b.z + hz * a + pz * b.half * side;
      const y = deckY(u);
      put(parts, paint(new THREE.CylinderGeometry(0.07, 0.08, 1.05, 6), POST_COL), x, y + 0.53, z);
    }
    // the handrail itself: a chain of short boxes following the camber
    for (let i = 0; i < n; i++) {
      const ua = i / n;
      const ub = (i + 1) / n;
      const aA = (ua - 0.5) * b.span;
      const aB = (ub - 0.5) * b.span;
      const xa = b.x + hx * aA + px * b.half * side;
      const za = b.z + hz * aA + pz * b.half * side;
      const xb = b.x + hx * aB + px * b.half * side;
      const zb = b.z + hz * aB + pz * b.half * side;
      const ya = deckY(ua) + 1.05;
      const yb = deckY(ub) + 1.05;
      const len = Math.hypot(xb - xa, zb - za, yb - ya);
      const mx = (xa + xb) / 2;
      const my = (ya + yb) / 2;
      const mz = (za + zb) / 2;
      const yaw = Math.atan2(xb - xa, zb - za);
      const pitch = -Math.atan2(yb - ya, Math.hypot(xb - xa, zb - za));
      put(parts, paint(new THREE.BoxGeometry(0.1, 0.1, len + 0.05), TIMBER_COL), mx, my, mz, yaw, pitch);
    }
  }
  if (b.style === "overpass") {
    // an embankment under each ramp (earth fill, since the road itself rides up over real ground
    // most of the way) and two steel girders under the short clear span over the rail itself
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const ua = i / steps;
      const ub = (i + 1) / steps;
      const um = (ua + ub) / 2;
      const a = (um - 0.5) * b.span;
      const x = b.x + hx * a;
      const z = b.z + hz * a;
      const topY = deckY(um) - 0.15;
      const baseY = groundY(x, z);
      if (Math.abs(um - 0.5) > 0.22) {
        // embankment: a trapezoidal earth fill slab, wider at the base than the deck
        const h = Math.max(0.4, topY - baseY);
        const wA = (ub - ua) * b.span + 0.4;
        put(parts, paint(new THREE.BoxGeometry(b.half * 2 + h * 0.9, h, wA), i % 2 ? MOUND_COL : MOUND_D), x, baseY + h / 2, z, b.heading);
      } else {
        // the clear span: two steel girders, no fill underneath (the train passes beneath)
        for (const side of [-1, 1]) {
          const gx = x + px * b.half * side * 0.7;
          const gz = z + pz * b.half * side * 0.7;
          put(parts, paint(new THREE.BoxGeometry((ub - ua) * b.span + 0.3, 0.55, 0.22), RAIL_RED_D), gx, topY - 0.25, gz, b.heading);
        }
      }
    }
    // low parapet walls along the embankment's own edge (in addition to the timber rail above)
  } else {
    // stone piers down to the real ground, every ~1/4 of the span (skip the very ends)
    const pierN = b.piers;
    for (let i = 1; i <= pierN; i++) {
      const u = i / (pierN + 1);
      const a = (u - 0.5) * b.span;
      const x = b.x + hx * a;
      const z = b.z + hz * a;
      const topY = deckY(u) - 0.1;
      const baseY = groundY(x, z);
      const h = Math.max(1.5, topY - baseY);
      put(parts, paint(new THREE.CylinderGeometry(0.85, 1.1, h, 8), i % 2 ? STONE_COL : STONE_D), x, baseY + h / 2, z);
      put(parts, paint(new THREE.BoxGeometry(2.6, 0.3, 1.6), STONE_D), x, topY - 0.15, z, b.heading);
    }
  }
  if (b.style === "grand") {
    // two candy-steel through-arch ribs, rising from the gorge below the deck to just under it at
    // mid-span (the same idea as world/waterways/wildBridge.ts's Victoria Falls Bridge, simplified)
    for (const side of [-1, 1]) {
      const ribPts: THREE.Vector3[] = [];
      const steps = 16;
      const footY = groundY(b.x + hx * (-b.span * 0.42), b.z + hz * (-b.span * 0.42));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 0.08 + t * 0.84;
        const a = (u - 0.5) * b.span;
        const x = b.x + hx * a + px * (b.half + 0.6) * side;
        const z = b.z + hz * a + pz * (b.half + 0.6) * side;
        const arch = Math.sin(t * Math.PI);
        const crown = Math.min(deckY(0.5) - 2.2, footY + 18);
        const y = footY + (crown - footY) * arch;
        ribPts.push(new THREE.Vector3(x, y, z));
      }
      for (let i = 0; i < ribPts.length - 1; i++) {
        const a = ribPts[i];
        const bb = ribPts[i + 1];
        const len = a.distanceTo(bb);
        const mx = (a.x + bb.x) / 2;
        const my = (a.y + bb.y) / 2;
        const mz = (a.z + bb.z) / 2;
        const yaw = Math.atan2(bb.x - a.x, bb.z - a.z);
        const pitch = -Math.atan2(bb.y - a.y, Math.hypot(bb.x - a.x, bb.z - a.z));
        put(parts, paint(new THREE.CylinderGeometry(0.35, 0.4, len + 0.05, 6), i % 2 ? RAIL_RED : RAIL_RED_D), mx, my, mz, yaw, pitch + Math.PI / 2);
      }
      // a few suspender posts from the arch up to the deck
      for (let i = 2; i < ribPts.length - 2; i += 3) {
        const p = ribPts[i];
        const u = 0.08 + (i / steps) * 0.84;
        const deckP = { x: b.x + hx * (u - 0.5) * b.span + px * b.half * side * 0.7, y: deckY(u) - 0.1, z: b.z + hz * (u - 0.5) * b.span + pz * b.half * side * 0.7 };
        const len = Math.hypot(deckP.x - p.x, deckP.y - p.y, deckP.z - p.z);
        if (len < 0.3) continue;
        const mx = (p.x + deckP.x) / 2;
        const my = (p.y + deckP.y) / 2;
        const mz = (p.z + deckP.z) / 2;
        const yaw = Math.atan2(deckP.x - p.x, deckP.z - p.z);
        const pitch = -Math.atan2(deckP.y - p.y, Math.hypot(deckP.x - p.x, deckP.z - p.z));
        put(parts, paint(new THREE.CylinderGeometry(0.06, 0.06, len, 5), SIGN_COL), mx, my, mz, yaw, pitch + Math.PI / 2);
      }
    }
  }
  const fgeo = merge2(parts);
  const fmesh = new THREE.Mesh(fgeo, solidMat);
  fmesh.castShadow = true;
  fmesh.receiveShadow = true;
  fmesh.name = "furniture";
  group.add(fmesh);
  // a sign at the near end
  const nearX = b.x - hx * (b.span / 2 + 2);
  const nearZ = b.z - hz * (b.span / 2 + 2);
  const sign = labelSprite(b.style === "grand" ? `\u{1F309} ${b.name}` : `\u{1F309} ${b.name}`);
  sign.position.set(nearX, deckY(0) + 2.6, nearZ);
  sign.scale.multiplyScalar(1.1);
  group.add(sign);
  return group;
}

// ── tunnels (built once: there are only two) ──
function buildTunnel(t: RoadTunnel): THREE.Group {
  const group = new THREE.Group();
  group.name = `tunnel-${t.id}`;
  const dx = t.x1 - t.x0;
  const dz = t.z1 - t.z0;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const heading = Math.atan2(dx, dz);
  const deckY = (u: number) => t.y0 + (t.y1 - t.y0) * u;
  const parts: THREE.BufferGeometry[] = [];
  const archW = t.half + 0.9;
  const archH = t.clear + 2.4;

  // local (along-heading, sideways, up) -> world, so the portal's own shape is simple box maths —
  // `along` is +outward (away from the bore), `side` is across the road, `up` is height
  function at(x: number, z: number, along: number, side: number): { x: number; z: number } {
    return { x: x - Math.sin(heading) * along + Math.cos(heading) * side, z: z - Math.cos(heading) * along - Math.sin(heading) * side };
  }
  function portal(x: number, z: number, y: number, outward: number) {
    // a plain, sturdy stone portal: two jambs, a lintel, a stepped pediment, a keystone block —
    // boxes only (robust, no per-segment arch trig to get wrong), reads clearly as a tunnel mouth
    const depth = 1.3;
    const faceAlong = outward * 0.45;
    const faceX = x - Math.sin(heading) * faceAlong;
    const faceZ = z - Math.cos(heading) * faceAlong;
    const sideAxis = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const upAxis = new THREE.Vector3(0, 1, 0);
    const alongAxis = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const springY = y + archH;
    // two jambs (the straight sides of the opening)
    for (const side of [-1, 1]) {
      const p = at(x, z, faceAlong, side * archW);
      put(parts, paint(new THREE.BoxGeometry(1.15, archH, depth), STONE_COL), p.x, y + archH / 2, p.z, heading);
    }
    // wing walls: flat battered walls flanking the jambs, set into the hillside either side
    for (const side of [-1, 1]) {
      const p = at(x, z, faceAlong + outward * 0.3, side * (archW + 2.3));
      put(parts, paint(new THREE.BoxGeometry(3.4, archH * 0.85, depth * 0.9), STONE_D), p.x, y + (archH * 0.85) / 2, p.z, heading);
    }
    // the voussoir arch: a true semicircle of wedge stones, correctly oriented (tangent x radial x
    // along-heading basis), springing from the top of the jambs — no more flat "beam" stack
    const VOUSS = 9;
    for (let i = 0; i < VOUSS; i++) {
      const a = ((i + 0.5) / VOUSS) * Math.PI; // 0 at the right spring, PI at the left spring
      const tangent = sideAxis.clone().multiplyScalar(-Math.sin(a)).add(upAxis.clone().multiplyScalar(Math.cos(a))).normalize();
      const radial = sideAxis.clone().multiplyScalar(Math.cos(a)).add(upAxis.clone().multiplyScalar(Math.sin(a))).normalize();
      const center = new THREE.Vector3(faceX, springY, faceZ).addScaledVector(radial, archW - 0.1);
      const wedge = new THREE.BoxGeometry((Math.PI * archW) / VOUSS + 0.05, 0.85, depth);
      const basis = new THREE.Matrix4().makeBasis(tangent, radial, alongAxis);
      wedge.applyMatrix4(basis);
      wedge.translate(center.x, center.y, center.z);
      put(parts, paint(wedge, i % 2 ? STONE_COL : STONE_D), 0, 0, 0);
    }
    // the keystone, right at the crown
    {
      const center = new THREE.Vector3(faceX, springY, faceZ).addScaledVector(upAxis, archW + 0.35);
      const key = new THREE.BoxGeometry(0.95, 1.25, depth + 0.15);
      put(parts, paint(key, STONE_D), center.x, center.y, center.z, heading);
    }
    // the flat face wall above the arch and between the wing walls (fills the rectangle the arch
    // sits inside; its own top is hidden under the earth mound below)
    {
      const p = at(x, z, faceAlong, 0);
      put(parts, paint(new THREE.BoxGeometry(archW * 2 + 4.6, 1.4, depth * 0.95), STONE_D), p.x, springY + archW + 1.0, p.z, heading);
    }
    // (the dark bore itself shows through the arch opening — the lining mesh's own BackSide
    // material right behind the portal face; no separate "mouth" shape needed)
    // a mound of earth over and immediately behind the portal, blending the stone face into the
    // hillside (the CONTINUOUS mound over the full bored length is built once, after both portals)
    for (let i = 0; i < 6; i++) {
      const side = (i - 2.5) * archW * 0.6;
      const back = outward * (1.6 + Math.abs(i - 2.5) * 0.4);
      const p = at(x, z, back, side);
      const r = 1.9 - Math.abs(i - 2.5) * 0.18;
      put(parts, paint(new THREE.IcosahedronGeometry(Math.max(0.9, r), 0), i % 2 ? MOUND_COL : MOUND_D), p.x, y + archH + 1.3 + r * 0.4, p.z);
    }
  }
  portal(t.x0, t.z0, t.y0, -1);
  portal(t.x1, t.z1, t.y1, 1);
  // the name plate
  const sign = labelSprite(`\u{26F0}️ ${t.name}`);
  sign.position.set(t.x0 + ux * 1.5, t.y0 + archH * 0.55, t.z0 + uz * 1.5);
  sign.scale.multiplyScalar(1.05);
  group.add(sign);

  // the lining: a half-barrel roof over the bored length, dark inside, lamps along the ceiling
  const ringSegs = 10;
  const lenSegs = Math.max(6, Math.round(len / 10));
  const ringPos: number[] = [];
  const ringIdx: number[] = [];
  // the FULL cross-section, floor to floor: a vertical wall up each side from the floor to the
  // springline, THEN the domed arc over the top — not just the dome on its own. The dome-only
  // version left the whole lower collar (floor to springline, archH tall) with no lining at all:
  // bare excavated trench wall showing through there read as "no roof, open to the sky" from
  // inside, even though the dome itself was geometrically fine (round 3's actual bug — not the
  // BackSide winding, which was real too but not the main cause of the open-sky look).
  const WALL_SEGS = 3;
  const section: [number, number][] = []; // [lateral, heightAboveFloor]
  for (let k = 0; k <= WALL_SEGS; k++) section.push([-archW, (k / WALL_SEGS) * archH]); // left wall, up
  for (let j = 1; j < ringSegs; j++) {
    const a = (j / ringSegs) * Math.PI;
    section.push([-Math.cos(a) * archW, archH + Math.sin(a) * archW]); // the dome, left spring to right spring
  }
  for (let k = 0; k <= WALL_SEGS; k++) section.push([archW, archH - (k / WALL_SEGS) * archH]); // right wall, down
  const secN = section.length;
  for (let i = 0; i <= lenSegs; i++) {
    const u = i / lenSegs;
    const cx = t.x0 + dx * u;
    const cz = t.z0 + dz * u;
    const cy = deckY(u);
    for (const [rx, ry] of section) ringPos.push(cx + Math.cos(heading) * rx, cy + ry, cz - Math.sin(heading) * rx);
  }
  for (let i = 0; i < lenSegs; i++)
    for (let j = 0; j < secN - 1; j++) {
      const a = i * secN + j;
      const b2 = (i + 1) * secN + j;
      ringIdx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
    }
  const liningGeo = new THREE.BufferGeometry();
  liningGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringPos, 3));
  liningGeo.setIndex(ringIdx);
  liningGeo.computeVertexNormals();
  // a small constant emissive on the lining itself: the lamps (tunnelLampMat below) glow but don't
  // cast real light onto surrounding geometry (no per-lamp dynamic light — too many draw calls down
  // a few-hundred-unit bore), so without this the bore reads as solid black wherever a lamp isn't
  // directly in frame. This is sized to look like dim bounced lamplight, not daylight.
  // DoubleSide, not BackSide: the ring's own triangle winding (built by hand, ringIdx below) turned
  // out to only raycast/render correctly from ABOVE looking down, not from inside the bore looking
  // up — a direction-dependent culling bug that read as "no roof, blue sky overhead" from inside
  // (confirmed directly: a raycast straight up from inside the tube hit nothing on BackSide, while
  // the same ray pointed straight down DID hit the mesh). DoubleSide always renders regardless of
  // winding, which is worth the (tiny, one mesh per tunnel, built once) extra triangle cost here.
  const liningMat = new THREE.MeshStandardMaterial({ color: "#3a3630", emissive: "#2a241c", emissiveIntensity: 0.55, roughness: 0.95, side: THREE.DoubleSide });
  const lining = new THREE.Mesh(liningGeo, liningMat);
  lining.name = "lining";
  group.add(lining);
  // the roof mound: a continuous rock/earth cover over the WHOLE bored length (not just near the
  // portals) at the real, un-carved natural height (rawHeight) either side of centre, with a slight
  // dome and jitter so it reads as hillside, not a flat lid — this is what makes the mountain look
  // whole from outside/above along the entire tunnel, not just a short stretch at each mouth
  {
    const roofParts: THREE.BufferGeometry[] = [];
    // wide enough to cover the whole cutting and reach natural ground either side, where it meets
    // the hillside at its own height and in its own colours (so the mountain reads as whole)
    const roofHalf = archW + 9;
    const crossN = 12;
    const gc = new THREE.Color();
    const domeJ = (c: number) => Math.sin(c * Math.PI) * 1.4; // a gentle dome, 0 at the edges
    const rpos: number[] = [];
    const ridx: number[] = [];
    const rcol: number[] = [];
    const jr = rng(t.x0 * 13 + t.z0 * 7);
    for (let i = 0; i <= lenSegs; i++) {
      const u = i / lenSegs;
      const cx = t.x0 + dx * u;
      const cz = t.z0 + dz * u;
      for (let j = 0; j <= crossN; j++) {
        const c = j / crossN; // 0..1 across the width
        const side = (c - 0.5) * 2 * roofHalf;
        const wx = cx + Math.cos(heading) * side;
        const wz = cz - Math.sin(heading) * side;
        const natural = rawHeight(wx, wz);
        const edge = Math.min(1, (1 - Math.abs(c - 0.5) * 2) * 3); // 0 at the edges -> 1 over the bore
        const jitter = (jr() - 0.5) * 0.5 * edge;
        // the mound must NEVER sit below the lining's own arch ceiling right under it, whatever
        // rawHeight() says there — it can read low right along a bore cut through a steep slope (and
        // further still if something else re-sculpts the natural terrain here later, e.g. a nearby
        // carved feature), and an unclamped mound then dips inside the arch, leaving the bore open
        // to the sky straight through the roof (confirmed by a direct screenshot: daylight visible
        // between the lining walls). Clamp up to the arch's own curve (or the springline, past its
        // radius) plus a safety margin, so the hill always reads as solid from outside even if the
        // natural ground there is thinner than the tunnel needs.
        const archY = deckY(u) + archH + (Math.abs(side) <= archW ? Math.sqrt(Math.max(0, archW * archW - side * side)) : 0);
        const y = Math.max(natural + domeJ(c) * 0.5 * edge + jitter, edge > 0.2 ? archY + 1.3 : -1e9);
        rpos.push(wx, y, wz);
        // the hillside's own colour here (grass low down, rock and snow higher up)
        groundColor(wx, wz, y, 0.22, gc);
        rcol.push(gc.r, gc.g, gc.b);
      }
    }
    const rowLen = crossN + 1;
    for (let i = 0; i < lenSegs; i++)
      for (let j = 0; j < crossN; j++) {
        const a = i * rowLen + j;
        const b2 = (i + 1) * rowLen + j;
        ridx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
      }
    const roofGeo = new THREE.BufferGeometry();
    roofGeo.setAttribute("position", new THREE.Float32BufferAttribute(rpos, 3));
    roofGeo.setAttribute("color", new THREE.Float32BufferAttribute(rcol, 3));
    roofGeo.setIndex(ridx);
    roofGeo.computeVertexNormals();
    const roofMesh = new THREE.Mesh(roofGeo, solidMat);
    roofMesh.name = "roof-mound";
    roofMesh.receiveShadow = true;
    roofMesh.castShadow = true;
    group.add(roofMesh);
    void roofParts;
  }
  // a yellow diamond "tunnel ahead" warning sign a little before each portal
  for (const [px0, pz0, out] of [
    [t.x0, t.z0, -1],
    [t.x1, t.z1, 1],
  ] as const) {
    const wx = px0 - Math.sin(heading) * out * 14;
    const wz = pz0 - Math.cos(heading) * out * 14;
    const warnParts: THREE.BufferGeometry[] = [];
    put(warnParts, paint(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 6), SIGN_POST_COL), wx, groundY(wx, wz) + 0.85, wz);
    const diamond = new THREE.BoxGeometry(0.6, 0.6, 0.06);
    diamond.rotateZ(Math.PI / 4);
    put(warnParts, paint(diamond, GATE_STRIPE), wx, groundY(wx, wz) + 1.85, wz, heading);
    const wgeo = merge2(warnParts);
    const wmesh = new THREE.Mesh(wgeo, solidMat);
    wmesh.castShadow = true;
    group.add(wmesh);
  }
  // the floor (asphalt, same as the road)
  const floorPos: number[] = [];
  const floorUv: number[] = [];
  const floorIdx: number[] = [];
  let sAcc = 0;
  for (let i = 0; i <= lenSegs; i++) {
    const u = i / lenSegs;
    const cx = t.x0 + dx * u;
    const cz = t.z0 + dz * u;
    const cy = deckY(u);
    floorPos.push(cx - Math.cos(heading) * t.half, cy, cz + Math.sin(heading) * t.half, cx + Math.cos(heading) * t.half, cy, cz - Math.sin(heading) * t.half);
    floorUv.push(0, sAcc / 9, 1, sAcc / 9);
    sAcc += len / lenSegs;
    if (i < lenSegs) floorIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(floorPos, 3));
  floorGeo.setAttribute("uv", new THREE.Float32BufferAttribute(floorUv, 2));
  floorGeo.setIndex(floorIdx);
  floorGeo.computeVertexNormals();
  const floor = new THREE.Mesh(floorGeo, tunnelFloorMat);
  floor.receiveShadow = true;
  floor.name = "floor";
  group.add(floor);
  // ceiling lamps (emissive — lit day and night inside the bore, since it's dark in there regardless)
  const lampParts: THREE.BufferGeometry[] = [];
  for (let i = 1; i < lenSegs; i += 2) {
    const u = i / lenSegs;
    const cx = t.x0 + dx * u;
    const cz = t.z0 + dz * u;
    const cy = deckY(u);
    put(lampParts, new THREE.SphereGeometry(0.28, 8, 6), cx, cy + archH - 0.6, cz);
    put(parts, paint(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5), POST_COL), cx, cy + archH - 0.2, cz);
  }
  const fgeo = merge2(parts);
  const fmesh = new THREE.Mesh(fgeo, solidMat);
  fmesh.name = "furniture";
  group.add(fmesh);
  const lgeo = merge2(lampParts);
  const lmesh = new THREE.Mesh(lgeo, tunnelLampMat);
  lmesh.name = "lamps";
  group.add(lmesh);
  return group;
}

// ── car parks (built once: there are only a dozen) ──
function buildCarPark(cp: CarPark): THREE.Group {
  const group = new THREE.Group();
  group.name = `carpark-${cp.id}`;
  // a rectangular apron (not a radial fan: the PARK_TEX bay stripes are drawn for a straight run,
  // so they read as real painted parking bays, not a distorted wheel), long axis along cp.heading
  const half = cp.r * 0.82;
  const len = cp.r * 2.3;
  const hx = Math.sin(cp.heading);
  const hz = Math.cos(cp.heading);
  const px = Math.cos(cp.heading);
  const pz = -Math.sin(cp.heading);
  // a grid of small quads draped over the ground (one big quad let the ground poke through)
  const na = Math.max(2, Math.ceil(len / 2.5));
  const ns = Math.max(2, Math.ceil((half * 2) / 2.5));
  const pos: number[] = [];
  const uv: number[] = [];
  const apronIdx: number[] = [];
  for (let i = 0; i <= na; i++) {
    for (let j = 0; j <= ns; j++) {
      const a = -len / 2 + (len * i) / na;
      const sd = -half + (half * 2 * j) / ns;
      const x = cp.x + hx * a + px * sd;
      const z = cp.z + hz * a + pz * sd;
      pos.push(x, drapeY(x, z) - 0.03, z);
      uv.push((a / len + 0.5) * (len / 7), (sd / half + 1) / 2);
    }
  }
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < ns; j++) {
      const q = i * (ns + 1) + j;
      apronIdx.push(q, q + ns + 1, q + 1, q + 1, q + ns + 1, q + ns + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(apronIdx);
  geo.computeVertexNormals();
  const apron = new THREE.Mesh(geo, parkMat);
  apron.receiveShadow = true;
  apron.name = "apron";
  group.add(apron);
  const parts: THREE.BufferGeometry[] = [];
  const lampParts: THREE.BufferGeometry[] = [];
  const signX = cp.x + px * (half + 1.2);
  const signZ = cp.z + pz * (half + 1.2);
  signboard(group, parts, signX, cp.y, signZ, cp.heading + Math.PI / 2);
  const lampX = cp.x - px * (half + 1.2);
  const lampZ = cp.z - pz * (half + 1.2);
  lampPost(lampParts, lampX, groundY(lampX, lampZ), lampZ);
  const fgeo = merge2(parts);
  const fmesh = new THREE.Mesh(fgeo, solidMat);
  fmesh.castShadow = true;
  group.add(fmesh);
  const lgeo = merge2(lampParts);
  const lmesh = new THREE.Mesh(lgeo, lampMat);
  lmesh.name = "lamps";
  group.add(lmesh);
  const sign = labelSprite(`\u{1F17F}️ ${cp.serves[0]}`);
  sign.position.set(signX, cp.y + 2.4, signZ);
  sign.scale.multiplyScalar(1.15);
  group.add(sign);
  return group;
}

// ── the roundabout ring + planted island at a junction (built once, like the fingerpost) ──
function buildRoundabout(x: number, z: number, bedY: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "roundabout";
  // the junction's OWN frozen bed height (now stamped flat by terrain.ts, like every other road
  // surface) + a touch more lift than the ordinary ribbon so the ring draws on TOP of the 1-unit
  // overlap where an approach road's own ribbon is trimmed to end just inside it (see buildSection's
  // JOIN_OVERLAP) — no z-fighting, no seam.
  const y = Math.max(bedY, groundY(x, z)) + GROUND_LIFT + 0.01;
  const segs = 56;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const circumference = 2 * Math.PI * ((ROUNDABOUT_OUTER + ROUNDABOUT_INNER) / 2);
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const v = (i / segs) * (circumference / 9);
    const rm = (ROUNDABOUT_INNER + ROUNDABOUT_OUTER) / 2;
    for (const [r, u] of [[ROUNDABOUT_INNER, 0], [rm, 0.5], [ROUNDABOUT_OUTER, 1]] as const) {
      pos.push(x + ca * r, drapeY(x + ca * r, z + sa * r) + 0.02, z + sa * r);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3;
    for (let c = 0; c < 2; c++) idx.push(a + c, a + c + 1, a + c + 3, a + c + 1, a + c + 4, a + c + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ring = new THREE.Mesh(geo, roadMat);
  ring.name = "ribbon"; // a real drivable surface: the raycast proof and nearRoad() both treat it as road
  ring.receiveShadow = true;
  group.add(ring);

  // the planted island: a flat grass disc a touch inside the ring's own inner edge, a few bushes,
  // and lane arrows painted round the ring's own mid-line (small chevrons, pointing the one-way
  // travel direction) — all one merged, vertex-coloured draw call
  const parts: THREE.BufferGeometry[] = [];
  put(parts, paint(new THREE.CylinderGeometry(ROUNDABOUT_INNER - 0.3, ROUNDABOUT_INNER - 0.1, 0.12, 24), GRASS_COL), x, y + 0.02, z);
  const jr = rng(x * 11 + z * 17 + 1);
  const bushN = 5;
  for (let i = 0; i < bushN; i++) {
    const a = (i / bushN) * Math.PI * 2 + jr() * 0.8;
    const r = ROUNDABOUT_INNER * (0.4 + jr() * 0.3);
    put(parts, paint(new THREE.IcosahedronGeometry(0.7 + jr() * 0.5, 0), i % 2 ? MOUND_COL : MOUND_D), x + Math.cos(a) * r, y + 0.5, z + Math.sin(a) * r);
  }
  const arrowN = 8;
  const midR = (ROUNDABOUT_INNER + ROUNDABOUT_OUTER) / 2;
  for (let i = 0; i < arrowN; i++) {
    const a = (i / arrowN) * Math.PI * 2;
    const travel = a + Math.PI / 2; // anticlockwise round the ring
    const chevron = new THREE.ConeGeometry(0.45, 1.3, 3);
    chevron.rotateX(Math.PI / 2);
    put(parts, paint(chevron, SIGN_COL), x + Math.cos(a) * midR, y + 0.03, z + Math.sin(a) * midR, travel);
  }
  const islandMesh = new THREE.Mesh(merge2(parts), solidMat);
  islandMesh.castShadow = true;
  islandMesh.receiveShadow = true;
  group.add(islandMesh);
  return group;
}

// ── junction fingerposts (built once) ──
function buildJunctionSign(x: number, z: number, signs: { label: string; heading: number }[]): THREE.Group {
  const group = new THREE.Group();
  const y = groundY(x, z);
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 7), SIGN_POST_COL)];
  parts[0].applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.3, 0));
  for (let i = 0; i < signs.length; i++) {
    const py = 2.5 - i * 0.42;
    const arm = paint(new THREE.BoxGeometry(1.2, 0.3, 0.06), i % 2 ? SIGN_COL : LAMP_COL);
    const yaw = signs[i].heading;
    arm.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(yaw) * 0.55, py, Math.cos(yaw) * 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1)));
    parts.push(arm);
  }
  const geo = merge2(parts);
  const mesh = new THREE.Mesh(geo, solidMat);
  mesh.castShadow = true;
  mesh.position.set(x, y, z);
  group.add(mesh);
  for (let i = 0; i < signs.length; i++) {
    const sp = labelSprite(signs[i].label);
    sp.scale.multiplyScalar(0.72);
    const py = y + 2.5 - i * 0.42;
    sp.position.set(x + Math.sin(signs[i].heading) * 1.3, py, z + Math.cos(signs[i].heading) * 1.3);
    group.add(sp);
  }
  return group;
}

// ── the level crossing: a crossbuck + flashing lights at a fixed post, and a boom on its own pivot
// so it can lower when the train is near (registry/roads.ts's crossingBoomDown) and lift after ──
const crossingLampMat = new THREE.MeshStandardMaterial({ color: "#ff3b30", emissive: "#000000", emissiveIntensity: 0, roughness: 0.5 });
export interface LevelCrossingRig {
  group: THREE.Group;
  setBoomDown(down: boolean, dt: number): void;
}
function buildLevelCrossing(c: { x: number; z: number; heading: number }): LevelCrossingRig {
  const { x, z, heading: roadHeading } = c;
  const group = new THREE.Group();
  const y = groundY(x, z);
  const n = nearestRail(x, z);
  const rp = railAt(n.s);
  const railHeading = Math.atan2(rp.dx, rp.dz);
  const parts: THREE.BufferGeometry[] = [];
  const lampParts: THREE.BufferGeometry[] = [];
  const pivots: THREE.Group[] = [];
  // a post + boom on both sides of the track (one per direction of travel)
  for (const side of [-1, 1]) {
    const gx = x + Math.sin(railHeading) * side * 3;
    const gz = z + Math.cos(railHeading) * side * 3;
    put(parts, paint(new THREE.CylinderGeometry(0.1, 0.12, 2.1, 7), SIGN_POST_COL), gx, y + 1.05, gz);
    // a crossbuck (the "X" RXR sign) on its own short post, well clear of the boom's own swing
    const buckY = y + 2.3;
    put(parts, paint(new THREE.CylinderGeometry(0.07, 0.08, 1.6, 6), SIGN_POST_COL), gx, y + 0.8, gz);
    const buck = new THREE.BoxGeometry(1.5, 0.22, 0.06);
    put(parts, paint(buck.clone(), GATE_COL), gx, buckY, gz, roadHeading + Math.PI / 4);
    put(parts, paint(buck, GATE_COL), gx, buckY, gz, roadHeading - Math.PI / 4);
    // flashing-light heads (their own emissive material — toggled red when the boom is down)
    for (const lampSide of [-1, 1]) {
      const lx = gx + Math.cos(roadHeading) * lampSide * 0.78;
      const lz = gz - Math.sin(roadHeading) * lampSide * 0.78;
      put(lampParts, new THREE.SphereGeometry(0.13, 8, 6), lx, buckY, lz);
    }
    // the boom itself, on a pivot at the post (up/open by default; rotates down to block the road)
    const pivot = new THREE.Group();
    pivot.position.set(gx, y + 1.55, gz);
    pivot.rotation.y = roadHeading;
    const armParts: THREE.BufferGeometry[] = [];
    const arm = new THREE.BoxGeometry(2.8, 0.14, 0.14);
    arm.translate(1.4, 0, 0);
    armParts.push(paint(arm, GATE_COL));
    for (let k = 0; k < 4; k++) {
      const stripe = new THREE.BoxGeometry(0.42, 0.17, 0.17);
      stripe.translate(0.55 + k * 0.62, 0, 0);
      armParts.push(paint(stripe, k % 2 ? GATE_STRIPE : GATE_COL));
    }
    const armGeo = merge2(armParts);
    const armMesh = new THREE.Mesh(armGeo, solidMat);
    armMesh.castShadow = true;
    armMesh.rotation.z = side > 0 ? 0 : Math.PI; // the two booms swing from opposite posts
    pivot.add(armMesh);
    pivot.rotation.z = -Math.PI / 2; // start lifted straight up (open)
    pivots.push(pivot);
    group.add(pivot);
  }
  const geo = merge2(parts);
  const mesh = new THREE.Mesh(geo, solidMat);
  mesh.castShadow = true;
  group.add(mesh);
  const lgeo = merge2(lampParts);
  const lmesh = new THREE.Mesh(lgeo, crossingLampMat);
  lmesh.name = "crossing-lamps";
  group.add(lmesh);
  // the name sign, well clear of the booms and crossbucks (beside the road, facing the approach)
  const sign = labelSprite("\u{1F684} Level Crossing");
  const sx = x - Math.sin(roadHeading) * 9 + Math.cos(roadHeading) * (ROAD_HALF + 2.4);
  const sz = z - Math.cos(roadHeading) * 9 - Math.sin(roadHeading) * (ROAD_HALF + 2.4);
  sign.position.set(sx, groundY(sx, sz) + 2.6, sz);
  sign.scale.multiplyScalar(1.8); // round 3: bigger — flagged as hard to read
  group.add(sign);

  let openAngle = -Math.PI / 2;
  let targetAngle = -Math.PI / 2;
  return {
    group,
    setBoomDown(down, dt) {
      targetAngle = down ? 0 : -Math.PI / 2;
      openAngle += (targetAngle - openAngle) * Math.min(1, dt * 1.2);
      for (const p of pivots) p.rotation.z = openAngle;
      crossingLampMat.emissiveIntensity = down ? (Math.sin(performance.now() / 180) > 0 ? 1.6 : 0.1) : 0;
    },
  };
}

export interface Roads {
  group: THREE.Group;
  /** `trainS` — the Wildlands Railway train's own position along its loop right now (railway.ts's
   *  own arc-length units; buildPark.ts already tracks this as `railway.train.s`) — drives the one
   *  level crossing's boom; `night` drives every lamp's emissive glow. */
  update(dt: number, t: number, focus: THREE.Vector3, trainS: number, night: boolean): void;
  stats(): { sections: number; triangles: number };
  dispose(): void;
}

export function buildRoads(scene: THREE.Scene): Roads {
  const group = new THREE.Group();
  group.name = "island-roads";
  scene.add(group);

  // ── streamed ribbon sections ──
  const sections = new Map<string, THREE.Group>();
  const secCount = new Map<string, number>();
  const secMid = new Map<string, { x: number; z: number }[]>();
  for (const seg of ROAD_SEGMENTS) {
    const n = Math.ceil(seg.points.length / SEC);
    secCount.set(seg.id, n);
    secMid.set(
      seg.id,
      Array.from({ length: n }, (_, k) => {
        const p = seg.points[Math.min(seg.points.length - 1, k * SEC + (SEC >> 1))];
        return { x: p.x, z: p.z };
      }),
    );
  }

  // ── static, built-once features ──
  for (const b of BRIDGES) group.add(buildBridge(b));
  for (const t of TUNNELS) group.add(buildTunnel(t));
  for (const cp of CAR_PARKS) group.add(buildCarPark(cp));
  for (const j of ROAD_JUNCTIONS) {
    group.add(buildRoundabout(j.x, j.z, j.y));
    group.add(buildJunctionSign(j.x, j.z, j.signs));
  }
  const crossingRigs = LEVEL_CROSSINGS.map((c) => {
    const rig = buildLevelCrossing(c);
    group.add(rig.group);
    return { c, rig };
  });

  return {
    group,
    update(dt, _t, focus, trainS, night) {
      setLampsNight(night);
      for (const { c, rig } of crossingRigs) rig.setBoomDown(crossingBoomDown(c, trainS), dt);
      for (const seg of ROAD_SEGMENTS) {
        const mids = secMid.get(seg.id)!;
        const n = secCount.get(seg.id)!;
        let want = -1;
        let wd = Infinity;
        for (let k = 0; k < n; k++) {
          const key = `${seg.id}:${k}`;
          const m = mids[k];
          const d = Math.hypot(m.x - focus.x, m.z - focus.z);
          const mesh = sections.get(key);
          if (d < SHOW_R) {
            if (mesh) mesh.visible = true;
            else if (d < wd) {
              wd = d;
              want = k;
            }
          } else if (mesh) {
            if (d > SHOW_R + 200) {
              group.remove(mesh);
              mesh.traverse((o) => {
                const mm = o as THREE.Mesh;
                if (mm.geometry) mm.geometry.dispose();
              });
              sections.delete(key);
            } else mesh.visible = false;
          }
        }
        if (want >= 0) {
          const mesh = buildSection(seg, want);
          group.add(mesh);
          sections.set(`${seg.id}:${want}`, mesh);
        }
      }
    },
    stats() {
      let tris = 0;
      for (const mesh of sections.values())
        if (mesh.visible)
          mesh.traverse((o) => {
            const mm = o as THREE.Mesh;
            if (mm.geometry) tris += mm.geometry.attributes.position.count / 3;
          });
      return { sections: sections.size, triangles: Math.round(tris) };
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.geometry) mm.geometry.dispose();
      });
      ROAD_TEX.dispose();
      PARK_TEX.dispose();
      roadMat.dispose();
      parkMat.dispose();
      solidMat.dispose();
      lampMat.dispose();
      tunnelLampMat.dispose();
      tunnelFloorMat.dispose();
      crossingLampMat.dispose();
    },
  };
}
