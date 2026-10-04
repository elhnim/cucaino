// The island's ground colours, and (optionally) the whole field as one mesh (tools; the park
// streams its ground in chunks: terrainChunks.ts; the shaders' textures: terrainWindow.ts).
//   buildTerrainMesh()   an optional ground mesh: vertex-coloured by height/slope — meadow greens
//                        with variation, warm rock on cliffs, snow caps, sand at the coast
import * as THREE from "three";
import { TRAIL_POINTS, seaDist } from "../../registry/island";
import { beachK, mesaEdgeDist, waterSdf } from "../../registry/waterways";
import { wildShelfEdgeDist } from "../../registry/wildWater";
import { groundY, slopeAt } from "../../registry/terrain";
import { settlementAt } from "../../registry/settlements";

/** the one-piece mesh covers the park's own square */
const TERRAIN_EXTENT = 200;
import { col, mix } from "./geo";
import { maskAt, terrainGrassFactor, type GrassMask } from "./mask";
import { fbm2, noise2, smoothstep } from "./noise";

const GRASS_A = col("#4f8a2a");
const GRASS_B = col("#7a9a2e");
const GRASS_C = col("#2f7a4c");
const GRASS_DARK = col("#2c5a1c");
const DIRT = col("#8a6a47");
/** Sunnybrook's cobbled square + streets (mask.ts carves the same footprint clear of grass; this
 *  is just the tint) — a cool stone grey, distinct from every trail's warm DIRT brown */
const COBBLE_GROUND = col("#9a9486");
const ROCK_A = col("#8a7a6a");
const ROCK_B = col("#6f6a7c");
const ROCK_DARK = col("#4d4450");
const SNOW = col("#eef3fa");
const SAND = col("#e2cf9a");
const WET_SAND = col("#a8946a");
const SEA_SAND = col("#f4e3b2");
const SEA_TINT = col("#5cc8bc");
const REEF_ROCK = col("#c49a8e");
const DEEP_ROCK = col("#8a9cb4");
const MESA_A = col("#7a5e4a");
const MESA_B = col("#5c4a40");
const MESA_DARK = col("#3e3430");
const MESA_MOSS = col("#3f7a2e");
const BED_SAND = col("#cdb88a");
const BED_MUD = col("#6f7a4a");
const BED_DEEP = col("#3a5a4c");
const PEBBLE = col("#a8a090");

/** ground colour at (x, z) — shared by the mesh and anything else that wants to match it */
export function groundColor(x: number, z: number, h: number, slope: number, out: THREE.Color, mask?: GrassMask, paths = false): THREE.Color {
  const n1 = fbm2(x / 40 + 3, z / 40 - 5, 3, 2);
  const n2 = noise2(x / 13, z / 13, 7);
  // meadow: lush green, patches of sun-kissed yellow-green and cool teal
  mix(GRASS_A, GRASS_B, smoothstep(0.45, 0.72, n1), out);
  out.lerp(GRASS_C, smoothstep(0.5, 0.8, n2) * 0.55);
  out.lerp(GRASS_DARK, smoothstep(0.35, 0.1, n2) * 0.4);
  // rock on steep ground (strata bands), snow on the peaks
  const rockAmt = smoothstep(0.3, 0.52, slope);
  if (rockAmt > 0) {
    const band = 0.5 + 0.5 * Math.sin(h * 1.35 + n1 * 5);
    const rock = mix(ROCK_A, ROCK_B, band, new THREE.Color()).lerp(ROCK_DARK, smoothstep(0.7, 1, slope) * 0.5 + (1 - band) * 0.15);
    out.lerp(rock, rockAmt);
  }
  // (the park's peaks are snowy from 24 m; out in the Wildlands only the high tops of the Great
  // Ridge and the lone peak are)
  const snowLine = 24 + 48 * smoothstep(260, 520, Math.hypot(x, z));
  const snow = smoothstep(snowLine, snowLine + 5, h + n2 * 3) * (1 - smoothstep(0.75, 0.95, slope));
  out.lerp(SNOW, snow);
  // bare earth where the grass is carved away (trails, plaza, around places) — optional
  if (mask && paths) {
    const bare = (1 - maskAt(mask, x, z)) * terrainGrassFactor(x, z, h, slope);
    const st = settlementAt(x, z, 4);
    out.lerp(st && st.style === "town" ? COBBLE_GROUND : DIRT, bare * (st && st.style === "town" ? 0.92 : 0.85));
  }
  // Rainbow Falls' mesa: warm dark rock in strata, moss and ferns on its ledges and its top
  // (the park's mesa, or the Great Falls' shelf out in the Wildlands)
  const md = Math.min(mesaEdgeDist(x, z), wildShelfEdgeDist(x, z));
  if (md < 6 && h > 2) {
    const band = 0.5 + 0.5 * Math.sin(h * 0.9 + n1 * 4);
    const rock = mix(MESA_A, MESA_B, band, new THREE.Color()).lerp(MESA_DARK, smoothstep(0.75, 1, slope) * 0.45 + n2 * 0.25);
    const ledge = (1 - smoothstep(0.35, 0.7, slope)) * smoothstep(0.35, 0.6, n2 + 0.2);
    out.lerp(rock, smoothstep(5, 0, md) * Math.max(smoothstep(0.25, 0.5, slope), 0.15));
    out.lerp(MESA_MOSS, ledge * smoothstep(5, 0, md) * 0.8);
  }
  // the river's, the pool's and the lake's beds and banks: pebbly sand at the edge, olive mud
  // deeper, dark green-blue in the deep; a sandy beach below the gate
  const wsd = waterSdf(x, z);
  if (wsd < 3 && h < 3) {
    const depth = -0.25 - h;
    if (wsd < 0.2) {
      const bed = mix(BED_SAND, BED_MUD, smoothstep(0.4, 2.2, depth), new THREE.Color()).lerp(BED_DEEP, smoothstep(2.2, 5.5, depth));
      bed.lerp(PEBBLE, smoothstep(0.62, 0.8, n2) * (1 - smoothstep(0.5, 2.5, depth)) * 0.6);
      out.copy(bed);
    } else {
      out.lerp(BED_SAND, (1 - smoothstep(0.2, 2.6, wsd)) * (0.55 + beachK(x, z) * 0.45));
    }
    out.lerp(SAND, beachK(x, z) * smoothstep(3, 0, wsd) * 0.8);
  }
  // sand at the coast, wet sand under the water line
  const sd = seaDist(x, z);
  out.lerp(SAND, smoothstep(-7, -3, sd + n2 * 2));
  out.lerp(WET_SAND, smoothstep(2, 10, sd));
  // under the sea: pale lagoon sand, then reef rock on the mounds, dark on the deep wall
  if (h < -0.8 && wsd > 0.5) {
    // sand seen through water takes on the sea's colour: turquoise in the lagoon, blue deeper
    out.lerp(SEA_SAND, smoothstep(-0.8, -2.2, h));
    // (the water itself is clear turquoise now: the sand only needs a light sea tint, not grey-teal)
    out.lerp(SEA_TINT, smoothstep(-0.5, -3.2, h) * 0.3);
    out.lerp(REEF_ROCK, smoothstep(0.45, 0.62, n1) * smoothstep(-2.5, -4, h) * (1 - smoothstep(-9, -13, h)) * 0.7);
    out.lerp(DEEP_ROCK, smoothstep(-8, -18, h) * 0.75);
  }
  return out;
}

export interface TerrainMeshOptions {
  lowQuality?: boolean;
  /** pass the grass mask to paint bare earth where grass is carved away (trails, plaza, places) */
  mask?: GrassMask;
  /** paint earthy trails from TRAIL_POINTS (default false — the park draws its own paths) */
  paths?: boolean;
}

/** An optional ground mesh (the park may draw its own). ~200² segments standard, 120² low. */
export function buildTerrainMesh(opts: TerrainMeshOptions = {}): THREE.Mesh {
  const segs = opts.lowQuality ? 120 : 200;
  const size = TERRAIN_EXTENT * 2;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute("uv");
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundY(x, z);
    pos.setY(i, h);
    groundColor(x, z, h, slopeAt(x, z), c, opts.mask, opts.paths);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  if (opts.paths && !opts.mask) {
    // no mask: paint the trails directly (coarse)
    for (const pts of TRAIL_POINTS)
      for (const [px, pz] of pts) {
        const step = size / segs;
        const ci = Math.round((px + TERRAIN_EXTENT) / step);
        const cj = Math.round((pz + TERRAIN_EXTENT) / step);
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const k = (cj + dj) * (segs + 1) + (ci + di);
            if (k < 0 || k >= pos.count) continue;
            colors[k * 3] = DIRT.r;
            colors[k * 3 + 1] = DIRT.g;
            colors[k * 3 + 2] = DIRT.b;
          }
      }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.name = "fantasy-terrain";
  return mesh;
}
