// The ground's textures for the shaders, as windows that follow the kid. The grass blades, the
// wildflowers and the drifting leaves only ever live within ~60 m of the focus, so instead of a
// texture over the whole island (which would be enormous on a big island) each is a fixed-size
// window of the height field (terrain.ts) and the grass mask (mask.ts), re-centred — copied from
// their lazily baked tiles — whenever the focus wanders far enough from the window's middle.
// The shaders turn world xz into window uv with the uniforms here (TERRAIN_GLSL, MASK_GLSL).
import * as THREE from "three";
import { TERRAIN_CELL, TERRAIN_EXTENT, terrainSample } from "../../registry/terrain";
import { MASK_HALF, MASK_TILE, maskPx, maskTile } from "./mask";

/** the height window, in grid samples a side */
export const HEIGHT_WIN = 160;
/** re-centre the windows once the focus is this far (world units) from their middle */
const RECENTRE = 28;

export const TERRAIN_GLSL = /* glsl */ `
uniform sampler2D uHeightTex; uniform vec2 uTerrO; uniform float uTerrCell; uniform float uTerrN;
float terrainY(vec2 p) { return texture2D(uHeightTex, ((p - uTerrO) / uTerrCell + 0.5) / uTerrN).r; }
`;
export const MASK_GLSL = /* glsl */ `
uniform sampler2D uMask; uniform vec2 uMaskO; uniform float uMaskSpan;
vec4 grassMaskAt(vec2 p) { return texture2D(uMask, (p - uMaskO) / uMaskSpan); }
`;

export interface HeightUniforms {
  uHeightTex: { value: THREE.DataTexture };
  /** world xz of the window's first sample */
  uTerrO: { value: THREE.Vector2 };
  uTerrCell: { value: number };
  uTerrN: { value: number };
}
export interface MaskUniforms {
  uMask: { value: THREE.DataTexture };
  /** world xz of the window's first pixel's outer corner */
  uMaskO: { value: THREE.Vector2 };
  /** the window's side (world units) */
  uMaskSpan: { value: number };
}

export interface TerrainWindows {
  height: HeightUniforms;
  mask: MaskUniforms;
  /** re-centre on (x, z) if it has wandered off the middle; true when anything moved */
  update(x: number, z: number): boolean;
  dispose(): void;
}

/**
 * @param maskN the grass mask's whole-island resolution (1024 standard, 512 low)
 * @param maskWin the mask window's side in pixels (a multiple of MASK_TILE)
 */
export function buildTerrainWindows(maskN: number, maskWin: number): TerrainWindows {
  // ── heights: HEIGHT_WIN² half floats, sample (i, j) = grid sample (hi0 + i, hj0 + j) ──
  const HW = HEIGHT_WIN;
  const hData = new Uint16Array(HW * HW);
  const hTex = new THREE.DataTexture(hData, HW, HW, THREE.RedFormat, THREE.HalfFloatType);
  hTex.minFilter = THREE.LinearFilter;
  hTex.magFilter = THREE.LinearFilter;
  hTex.wrapS = hTex.wrapT = THREE.ClampToEdgeWrapping;
  hTex.generateMipmaps = false;
  const height: HeightUniforms = {
    uHeightTex: { value: hTex },
    uTerrO: { value: new THREE.Vector2() },
    uTerrCell: { value: TERRAIN_CELL },
    uTerrN: { value: HW },
  };
  let hi0 = NaN;
  let hj0 = NaN;
  const fillHeights = (x: number, z: number) => {
    const ci = Math.round((x + TERRAIN_EXTENT) / TERRAIN_CELL);
    const cj = Math.round((z + TERRAIN_EXTENT) / TERRAIN_CELL);
    hi0 = ci - HW / 2;
    hj0 = cj - HW / 2;
    for (let j = 0; j < HW; j++) for (let i = 0; i < HW; i++) hData[j * HW + i] = THREE.DataUtils.toHalfFloat(terrainSample(hi0 + i, hj0 + j));
    height.uTerrO.value.set(-TERRAIN_EXTENT + hi0 * TERRAIN_CELL, -TERRAIN_EXTENT + hj0 * TERRAIN_CELL);
    hTex.needsUpdate = true;
  };

  // ── the grass mask: maskWin² RGBA8, pixel (i, j) = the mask's pixel (mi0 + i, mj0 + j) ──
  const MW = maskWin;
  const T = MASK_TILE;
  const px = maskPx(maskN);
  const mData = new Uint8Array(MW * MW * 4);
  const mTex = new THREE.DataTexture(mData, MW, MW, THREE.RGBAFormat, THREE.UnsignedByteType);
  mTex.minFilter = THREE.LinearFilter;
  mTex.magFilter = THREE.LinearFilter;
  mTex.wrapS = mTex.wrapT = THREE.ClampToEdgeWrapping;
  mTex.generateMipmaps = false;
  const mask: MaskUniforms = {
    uMask: { value: mTex },
    uMaskO: { value: new THREE.Vector2() },
    uMaskSpan: { value: MW * px },
  };
  let mi0 = NaN;
  let mj0 = NaN;
  const fillMask = (x: number, z: number) => {
    // (whole tiles: the window starts on a tile edge)
    const ti0 = Math.round((x + MASK_HALF) / px / T - MW / T / 2);
    const tj0 = Math.round((z + MASK_HALF) / px / T - MW / T / 2);
    if (ti0 * T === mi0 && tj0 * T === mj0) return;
    mi0 = ti0 * T;
    mj0 = tj0 * T;
    const nt = MW / T;
    for (let tj = 0; tj < nt; tj++)
      for (let ti = 0; ti < nt; ti++) {
        const t = maskTile(maskN, ti0 + ti, tj0 + tj);
        for (let j = 0; j < T; j++) mData.set(t.subarray(j * T * 4, (j + 1) * T * 4), ((tj * T + j) * MW + ti * T) * 4);
      }
    mask.uMaskO.value.set(-MASK_HALF + mi0 * px, -MASK_HALF + mj0 * px);
    mTex.needsUpdate = true;
  };

  let cx = NaN;
  let cz = NaN;
  return {
    height,
    mask,
    update(x, z) {
      // (the mask follows tile by tile — a cheap copy of cached tiles — so its window can stay
      // small; the heights' window is wide and re-centres now and then)
      const m0 = mi0;
      const n0 = mj0;
      fillMask(x, z);
      let moved = m0 !== mi0 || n0 !== mj0;
      if (!(Math.abs(x - cx) < RECENTRE && Math.abs(z - cz) < RECENTRE)) {
        cx = x;
        cz = z;
        fillHeights(x, z);
        moved = true;
      }
      return moved;
    },
    dispose() {
      hTex.dispose();
      mTex.dispose();
    },
  };
}
