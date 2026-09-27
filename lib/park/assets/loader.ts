// Loads Cucaino Park's Kenney kits (public/park-assets/*.glb, built by scripts/park-assets.mjs),
// repaints them candy-coloured and converts every material to one soft toon look.
//
// - kits are fetched once and cached; `spawn(kit, id)` clones a model (shares GPU buffers)
// - `instanced(kit, id, matrices)` draws many copies of a prop in one draw call per part
// - animals (Cube Pets) are loaded one file each, with their animation clips
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { candyColor, candyPixels, type CandyPalette } from "./candy";
import { PARK_ASSETS } from "./manifest.gen";

export type KitName = Exclude<keyof typeof PARK_ASSETS, "pets">;
export type AnimalId = keyof (typeof PARK_ASSETS)["pets"]["models"];

// NOT under /park/: that prefix is the protected kid route, and the auth middleware must never
// sit in front of model downloads.
const BASE = "/park-assets";

let loader: GLTFLoader | null = null;
function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

/** 3-step toon ramp shared by every material: soft, cartoony shading for almost no GPU cost. */
let toonRamp: THREE.DataTexture | null = null;
export function getToonRamp() {
  if (!toonRamp) {
    const data = new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]);
    toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

function candyTexture(src: THREE.Texture, pal: CandyPalette): THREE.Texture {
  const img = src.image as (ImageBitmap | HTMLImageElement) & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
  candyPixels(px.data, pal);
  ctx.putImageData(px, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = src.flipY;
  // palette swatches: nearest filtering keeps neighbouring colours from bleeding together
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Swap a model's materials for candy toon ones (cached per source material). */
function toonify(root: THREE.Object3D, pal: CandyPalette, cache: Map<THREE.Material, THREE.Material>, texCache: Map<THREE.Texture, THREE.Texture>) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material) => {
      let out = cache.get(m);
      if (!out) {
        const std = m as THREE.MeshStandardMaterial;
        let map: THREE.Texture | null = null;
        if (std.map) {
          map = texCache.get(std.map) ?? candyTexture(std.map, pal);
          texCache.set(std.map, map);
        }
        const color = new THREE.Color(1, 1, 1);
        if (!map && std.color) {
          const [r, g, b] = candyColor(std.color.r, std.color.g, std.color.b, pal);
          color.setRGB(r, g, b);
        }
        const toon = new THREE.MeshToonMaterial({
          map,
          color,
          gradientMap: getToonRamp(),
          transparent: std.transparent,
          opacity: std.opacity,
          side: std.side,
        });
        toon.name = std.name;
        out = toon;
        cache.set(m, out);
      }
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    mesh.castShadow = mesh.receiveShadow = false;
  });
}

export class ParkAssets {
  private kits = new Map<KitName, Promise<Map<string, THREE.Object3D>>>();
  private animals = new Map<AnimalId, Promise<GLTF>>();
  private matCache = new Map<THREE.Material, THREE.Material>();
  private texCache = new Map<THREE.Texture, THREE.Texture>();
  // animals keep their natural colours (a panda must still look like a panda) — only a light
  // candy brightening, cached separately from the fully candied world kits
  private animalMatCache = new Map<THREE.Material, THREE.Material>();
  private animalTexCache = new Map<THREE.Texture, THREE.Texture>();
  constructor(private palette: CandyPalette) {}

  loadKit(kit: KitName): Promise<Map<string, THREE.Object3D>> {
    let p = this.kits.get(kit);
    if (!p) {
      p = getLoader()
        .loadAsync(`${BASE}/${kit}.glb`)
        .then((gltf) => {
          const models = new Map<string, THREE.Object3D>();
          toonify(gltf.scene, this.palette, this.matCache, this.texCache);
          for (const child of [...gltf.scene.children]) models.set(child.name, child);
          return models;
        });
      this.kits.set(kit, p);
    }
    return p;
  }

  /** Clone one model from a loaded kit (geometry + materials are shared, so this is cheap). */
  async spawn(kit: KitName, id: string): Promise<THREE.Object3D> {
    const models = await this.loadKit(kit);
    const tpl = models.get(id);
    if (!tpl) throw new Error(`park asset missing: ${kit}/${id} — add it to scripts/park-assets.json`);
    const c = tpl.clone(true);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    c.scale.set(1, 1, 1);
    return c;
  }

  /**
   * Many copies of a prop as InstancedMeshes (one per sub-mesh of the model). `matrices` are
   * world placements; each sub-mesh keeps its offset inside the model.
   */
  async instanced(kit: KitName, id: string, matrices: THREE.Matrix4[]): Promise<THREE.Group> {
    const tpl = await this.spawn(kit, id);
    tpl.updateMatrixWorld(true);
    const group = new THREE.Group();
    group.name = `instanced:${kit}/${id}`;
    const tmp = new THREE.Matrix4();
    tpl.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length);
      matrices.forEach((m, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(m, mesh.matrixWorld)));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    });
    return group;
  }

  loadAnimal(id: AnimalId): Promise<GLTF> {
    let p = this.animals.get(id);
    if (!p) {
      p = getLoader()
        .loadAsync(`${BASE}/pets/${id}.glb`)
        .then((gltf) => {
          toonify(gltf.scene, { ...this.palette, strength: 0.25 }, this.animalMatCache, this.animalTexCache);
          return gltf;
        });
      this.animals.set(id, p);
    }
    return p;
  }

  /** A fresh animated copy of an animal (skinned-safe clone) + its clips. */
  async spawnAnimal(id: AnimalId): Promise<{ root: THREE.Object3D; clips: THREE.AnimationClip[] }> {
    const gltf = await this.loadAnimal(id);
    return { root: cloneSkinned(gltf.scene), clips: gltf.animations };
  }

  dispose() {
    for (const m of [...this.matCache.values(), ...this.animalMatCache.values()]) m.dispose();
    for (const t of [...this.texCache.values(), ...this.animalTexCache.values()]) t.dispose();
    this.kits.clear();
    this.animals.clear();
  }
}
