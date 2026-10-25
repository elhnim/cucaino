// The ground's textures for the shaders, as windows that follow the kid. The grass blades, the
// wildflowers and the drifting leaves only ever live within ~60 m of the focus, so instead of a
// texture over the whole island (which would be enormous on a big island) each is a fixed-size
// window of the height field (terrain.ts) and the grass mask (mask.ts), re-centred — copied from
// their lazily baked tiles — whenever the focus wanders far enough from the window's middle.
// The shaders turn world xz into window uv with the uniforms here (TERRAIN_GLSL, MASK_GLSL).
import * as THREE from "three";
import { TERRAIN_CELL, TERRAIN_X0, TERRAIN_Z0, terrainSample } from "../../registry/terrain";
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
  // (a refill is worked out into a spare buffer a few rows a frame, then swapped in whole: the old
  // window stays up meanwhile — the focus is still well inside it)
  let hPend: { i0: number; j0: number; row: number; buf: Uint16Array } | null = null;
  const hSpare = new Uint16Array(HW * HW);
  const startHeights = (x: number, z: number) => {
    const ci = Math.round((x - TERRAIN_X0) / TERRAIN_CELL);
    const cj = Math.round((z - TERRAIN_Z0) / TERRAIN_CELL);
    hPend = { i0: ci - HW / 2, j0: cj - HW / 2, row: 0, buf: hSpare };
  };
  /** carry on with a height refill until `deadline`; true once it's swapped in */
  const stepHeights = (deadline: number) => {
    const P = hPend!;
    while (P.row < HW) {
      const j = P.row;
      for (let i = 0; i < HW; i++) P.buf[j * HW + i] = THREE.DataUtils.toHalfFloat(terrainSample(P.i0 + i, P.j0 + j));
      P.row++;
      if (P.row < HW && performance.now() > deadline) return false;
    }
    hData.set(P.buf);
    height.uTerrO.value.set(TERRAIN_X0 + P.i0 * TERRAIN_CELL, TERRAIN_Z0 + P.j0 * TERRAIN_CELL);
    hTex.needsUpdate = true;
    hPend = null;
    return true;
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
  let mPend: { ti0: number; tj0: number; k: number } | null = null;
  const mSpare = new Uint8Array(MW * MW * 4);
  const nt = MW / T;
  /** the window's tile origin for a focus (whole tiles: the window starts on a tile edge) */
  const maskOrigin = (x: number, z: number) => [Math.round((x + MASK_HALF) / px / T - nt / 2), Math.round((z + MASK_HALF) / px / T - nt / 2)];
  /** carry on with a mask refill until `deadline`; true once it's swapped in */
  const stepMask = (deadline: number) => {
    const P = mPend!;
    while (P.k < nt * nt) {
      const ti = P.k % nt;
      const tj = Math.floor(P.k / nt);
      const t = maskTile(maskN, P.ti0 + ti, P.tj0 + tj);
      for (let j = 0; j < T; j++) mSpare.set(t.subarray(j * T * 4, (j + 1) * T * 4), ((tj * T + j) * MW + ti * T) * 4);
      P.k++;
      if (P.k < nt * nt && performance.now() > deadline) return false;
    }
    mData.set(mSpare);
    mi0 = P.ti0 * T;
    mj0 = P.tj0 * T;
    mask.uMaskO.value.set(-MASK_HALF + mi0 * px, -MASK_HALF + mj0 * px);
    mTex.needsUpdate = true;
    mPend = null;
    return true;
  };

  let cx = NaN;
  let cz = NaN;
  return {
    height,
    mask,
    update(x, z) {
      // (the first time, all at once; after that a little each frame, within ~1.5 ms)
      // (…or all at once after a jump — the world wrap, a ride somewhere far — that left the
      // grass's reach off the edge of a window)
      const first = cx !== cx;
      const deadline = first ? Infinity : performance.now() + 1.5;
      let moved = false;
      // the mask follows tile by tile (mostly a copy of cached tiles), so its window stays small
      const [ti0, tj0] = maskOrigin(x, z);
      if ((ti0 * T !== mi0 || tj0 * T !== mj0) && !(mPend && mPend.ti0 === ti0 && mPend.tj0 === tj0)) mPend = { ti0, tj0, k: 0 };
      const mOff = Math.max(Math.abs(x - (-MASK_HALF + mi0 * px + (MW * px) / 2)), Math.abs(z - (-MASK_HALF + mj0 * px + (MW * px) / 2)));
      if (mPend && stepMask(mOff === mOff && mOff < (MW * px) / 2 - 62 ? deadline : Infinity)) moved = true;
      // the heights' window is wide and re-centres now and then
      if (!hPend && !(Math.abs(x - cx) < RECENTRE && Math.abs(z - cz) < RECENTRE)) {
        cx = x;
        cz = z;
        startHeights(x, z);
      }
      const hOff = Math.max(Math.abs(x - (height.uTerrO.value.x + (HW * TERRAIN_CELL) / 2)), Math.abs(z - (height.uTerrO.value.y + (HW * TERRAIN_CELL) / 2)));
      if (hPend && stepHeights(first || !(hOff < (HW * TERRAIN_CELL) / 2 - 62) ? Infinity : Math.max(deadline, performance.now() + 0.8))) moved = true;
      return moved;
    },
    dispose() {
      hTex.dispose();
      mTex.dispose();
    },
  };
}
