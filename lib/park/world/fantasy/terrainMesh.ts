// The island's ground for shaders and (optionally) as a mesh.
//   makeHeightTexture()  the terrain height grid as a half-float texture (linear-filterable on
//                        every WebGL2 device incl. iPad) for the grass / leaves vertex shaders
//   buildTerrainMesh()   an optional ground mesh: vertex-coloured by height/slope — meadow greens
//                        with variation, warm rock on cliffs, snow caps, sand at the coast
import * as THREE from "three";
import { coastR, TRAIL_POINTS } from "../../registry/island";
import { TERRAIN_EXTENT, TERRAIN_N, groundY, slopeAt, terrainGrid } from "../../registry/terrain";
import { col, mix } from "./geo";
import { maskAt, terrainGrassFactor, type GrassMask } from "./mask";
import { fbm2, noise2, smoothstep } from "./noise";

export function makeHeightTexture(): THREE.DataTexture {
  const g = terrainGrid();
  const half = new Uint16Array(g.length);
  for (let i = 0; i < g.length; i++) half[i] = THREE.DataUtils.toHalfFloat(g[i]);
  const tex = new THREE.DataTexture(half, TERRAIN_N, TERRAIN_N, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** uniforms the height texture needs in GLSL (world xz -> uv) */
export const TERRAIN_UNIFORMS = {
  uTerrE: TERRAIN_EXTENT,
  uTerrCell: (TERRAIN_EXTENT * 2) / (TERRAIN_N - 1),
  uTerrN: TERRAIN_N,
};

export const TERRAIN_GLSL = /* glsl */ `
uniform sampler2D uHeightTex; uniform float uTerrE; uniform float uTerrCell; uniform float uTerrN;
float terrainY(vec2 p) { return texture2D(uHeightTex, ((p + uTerrE) / uTerrCell + 0.5) / uTerrN).r; }
`;

const GRASS_A = col("#4f8a2a");
const GRASS_B = col("#7a9a2e");
const GRASS_C = col("#2f7a4c");
const GRASS_DARK = col("#2c5a1c");
const DIRT = col("#8a6a47");
const ROCK_A = col("#8a7a6a");
const ROCK_B = col("#6f6a7c");
const ROCK_DARK = col("#4d4450");
const SNOW = col("#eef3fa");
const SAND = col("#e2cf9a");
const WET_SAND = col("#a8946a");
const SEA_SAND = col("#e8d7a4");
const SEA_TINT = col("#179a9e");
const REEF_ROCK = col("#9a7f8a");
const DEEP_ROCK = col("#3a4a6a");

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
  const snow = smoothstep(24, 29, h + n2 * 3) * (1 - smoothstep(0.75, 0.95, slope));
  out.lerp(SNOW, snow);
  // bare earth where the grass is carved away (trails, plaza, around places) — optional
  if (mask && paths) {
    const bare = (1 - maskAt(mask, x, z)) * terrainGrassFactor(x, z, h, slope);
    out.lerp(DIRT, bare * 0.85);
  }
  // sand at the coast, wet sand under the water line
  const r = Math.hypot(x, z);
  const coast = coastR(Math.atan2(x, z));
  out.lerp(SAND, smoothstep(coast - 7, coast - 3, r + n2 * 2));
  out.lerp(WET_SAND, smoothstep(coast + 2, coast + 10, r));
  // under the sea: pale lagoon sand, then reef rock on the mounds, dark on the deep wall
  if (h < -0.8) {
    // sand seen through water takes on the sea's colour: turquoise in the lagoon, blue deeper
    out.lerp(SEA_SAND, smoothstep(-0.8, -2.2, h));
    out.lerp(SEA_TINT, smoothstep(-0.5, -3.2, h) * 0.8);
    out.lerp(REEF_ROCK, smoothstep(0.45, 0.62, n1) * smoothstep(-2.5, -4, h) * (1 - smoothstep(-9, -13, h)) * 0.7);
    out.lerp(DEEP_ROCK, smoothstep(-8, -18, h));
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
