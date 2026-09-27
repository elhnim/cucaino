import * as THREE from "three";
import { createNoise2D } from "./noise";
import {
  CHUNK_SIZE,
  CHUNK_SEGMENTS,
  LOAD_RADIUS_CHUNKS,
  VILLAGE_CLEAR_RADIUS,
  TERRAIN_TEXTURE_WORLD_SIZE,
  SLOT_TREE_CAP,
  SLOT_ROCK_CAP,
  SLOT_BUSH_CAP,
  SLOT_FLOWER_CAP,
  chunkCoordAt,
  chunkKey,
  chunkCenter,
  chunkSeed,
  heightAt,
  type ChunkCoord,
} from "./terrainMath";
import { makeGrassTexture } from "./textures";

export interface TerrainOptions {
  /** Stable per-kid seed (see seedFromString in noise.ts) so a kid's world is consistent across sessions. */
  seed: number;
  /** multiply tint over the grass texture, per kid theme (see biomes.ts) */
  grassTint?: string;
}

export interface Terrain {
  heightAt(x: number, z: number): number;
  /** Streams chunks in/out around the player; cheap no-op unless the player crossed into a new chunk. */
  update(playerPos: THREE.Vector3): void;
  dispose(): void;
}

// Deterministic tiny RNG for per-chunk prop placement, independent of the noise module
// (kept local since it only needs to run a handful of times per chunk assignment).
function chunkRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

interface Slot {
  group: THREE.Group;
  groundGeo: THREE.PlaneGeometry;
  trunks: THREE.InstancedMesh;
  leaves: THREE.InstancedMesh;
  rocks: THREE.InstancedMesh;
  bushes: THREE.InstancedMesh;
  flowers: THREE.InstancedMesh;
  coord: ChunkCoord | null;
}

export function createTerrain(scene: THREE.Scene, opts: TerrainOptions): Terrain {
  const noise = createNoise2D(opts.seed);
  const sampleHeight = (x: number, z: number) => heightAt(x, z, noise);

  const groundTex = makeGrassTexture(opts.seed + 900);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, color: opts.grassTint ?? "#ffffff" });

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#8a6a3c", flatShading: true });
  const leafGeo = new THREE.ConeGeometry(1, 1.7, 7);
  const leafMat = new THREE.MeshStandardMaterial({ color: "#4c9a3a", flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: "#9b9284", flatShading: true });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: "#5cb246", flatShading: true });
  const bushGeo = new THREE.SphereGeometry(0.55, 7, 5);
  const bushMat = leafMat2;
  // one flower mesh for every colour: per-instance colour keeps it a single draw call per chunk
  const flowerGeo = new THREE.SphereGeometry(0.14, 5, 4);
  const flowerMat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true });
  const FLOWER_COLORS = [0xe85b5b, 0xf2c14e, 0xef8fc0, 0xffffff, 0xb07be0, 0x6fb7ff].map((c) => new THREE.Color(c));

  const side = LOAD_RADIUS_CHUNKS * 2 + 1;
  const slots: Slot[] = [];
  let lastChunk: ChunkCoord | null = null;

  const m = new THREE.Matrix4();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  for (let i = 0; i < side * side; i++) {
    const group = new THREE.Group();
    const groundGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    group.add(ground);

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, SLOT_TREE_CAP);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, SLOT_TREE_CAP);
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, SLOT_ROCK_CAP);
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, SLOT_BUSH_CAP);
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, SLOT_FLOWER_CAP);
    for (let f = 0; f < SLOT_FLOWER_CAP; f++) flowers.setColorAt(f, FLOWER_COLORS[f % FLOWER_COLORS.length]);
    trunks.castShadow = leaves.castShadow = rocks.castShadow = true;
    trunks.count = leaves.count = rocks.count = bushes.count = flowers.count = 0;
    group.add(trunks, leaves, rocks, bushes, flowers);

    group.visible = false;
    scene.add(group);
    slots.push({ group, groundGeo, trunks, leaves, rocks, bushes, flowers, coord: null });
  }

  function assignSlot(slot: Slot, cx: number, cz: number) {
    const center = chunkCenter(cx, cz);
    slot.group.position.set(center.x, 0, center.z);
    slot.group.visible = true;

    const pos = slot.groundGeo.attributes.position as THREE.BufferAttribute;
    const uv = slot.groundGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const localX = pos.getX(i);
      const localZ = pos.getZ(i);
      const worldX = center.x + localX;
      const worldZ = center.z + localZ;
      pos.setY(i, sampleHeight(worldX, worldZ));
      uv.setXY(i, worldX / TERRAIN_TEXTURE_WORLD_SIZE, worldZ / TERRAIN_TEXTURE_WORLD_SIZE);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    slot.groundGeo.computeVertexNormals();

    // Scatter a handful of trees/rocks, skipping the hand-built village clearing at the origin.
    const rng = chunkRng(chunkSeed(opts.seed, cx, cz));
    let treeCount = 0;
    let rockCount = 0;
    for (let attempt = 0; attempt < SLOT_TREE_CAP * 3 && treeCount < SLOT_TREE_CAP; attempt++) {
      const localX = (rng() - 0.5) * CHUNK_SIZE;
      const localZ = (rng() - 0.5) * CHUNK_SIZE;
      const worldX = center.x + localX;
      const worldZ = center.z + localZ;
      if (Math.hypot(worldX, worldZ) < VILLAGE_CLEAR_RADIUS + 2) continue;
      const s = 0.85 + rng() * 0.5;
      const groundY = sampleHeight(worldX, worldZ); // slot group sits at y=0, so this is already local
      m.compose(
        new THREE.Vector3(localX, groundY + 0.55 * s, localZ),
        new THREE.Quaternion(),
        new THREE.Vector3(s, s, s),
      );
      slot.trunks.setMatrixAt(treeCount, m);
      m.compose(
        new THREE.Vector3(localX, groundY + (1.1 + 0.85) * s, localZ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0)),
        new THREE.Vector3(s, s, s),
      );
      slot.leaves.setMatrixAt(treeCount, m);
      treeCount++;
    }
    for (let attempt = 0; attempt < SLOT_ROCK_CAP * 3 && rockCount < SLOT_ROCK_CAP; attempt++) {
      const localX = (rng() - 0.5) * CHUNK_SIZE;
      const localZ = (rng() - 0.5) * CHUNK_SIZE;
      const worldX = center.x + localX;
      const worldZ = center.z + localZ;
      if (Math.hypot(worldX, worldZ) < VILLAGE_CLEAR_RADIUS + 2) continue;
      const s = 0.6 + rng() * 0.8;
      const groundY = sampleHeight(worldX, worldZ); // slot group sits at y=0, so this is already local
      m.compose(
        new THREE.Vector3(localX, groundY + 0.25 * s, localZ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng(), rng())),
        new THREE.Vector3(s, s, s),
      );
      slot.rocks.setMatrixAt(rockCount, m);
      rockCount++;
    }
    let bushCount = 0;
    for (let attempt = 0; attempt < SLOT_BUSH_CAP * 3 && bushCount < SLOT_BUSH_CAP; attempt++) {
      const localX = (rng() - 0.5) * CHUNK_SIZE;
      const localZ = (rng() - 0.5) * CHUNK_SIZE;
      if (Math.hypot(center.x + localX, center.z + localZ) < VILLAGE_CLEAR_RADIUS + 2) continue;
      const s = 0.7 + rng() * 0.7;
      m.compose(
        new THREE.Vector3(localX, sampleHeight(center.x + localX, center.z + localZ) + 0.3 * s, localZ),
        new THREE.Quaternion(),
        new THREE.Vector3(s, s * 0.8, s),
      );
      slot.bushes.setMatrixAt(bushCount++, m);
    }
    // flowers come in little patches so they read as meadows, not noise
    let flowerCount = 0;
    while (flowerCount < SLOT_FLOWER_CAP) {
      const px = (rng() - 0.5) * CHUNK_SIZE;
      const pz = (rng() - 0.5) * CHUNK_SIZE;
      for (let k = 0; k < 6 && flowerCount < SLOT_FLOWER_CAP; k++) {
        const lx = px + (rng() - 0.5) * 2.4;
        const lz = pz + (rng() - 0.5) * 2.4;
        if (Math.hypot(center.x + lx, center.z + lz) < VILLAGE_CLEAR_RADIUS + 2) {
          slot.flowers.setMatrixAt(flowerCount++, HIDDEN);
          continue;
        }
        m.makeTranslation(lx, sampleHeight(center.x + lx, center.z + lz) + 0.12, lz);
        slot.flowers.setMatrixAt(flowerCount++, m);
      }
    }
    for (let i = bushCount; i < SLOT_BUSH_CAP; i++) slot.bushes.setMatrixAt(i, HIDDEN);
    slot.bushes.count = SLOT_BUSH_CAP;
    slot.flowers.count = SLOT_FLOWER_CAP;
    slot.bushes.instanceMatrix.needsUpdate = true;
    slot.flowers.instanceMatrix.needsUpdate = true;
    // Hide any unused instance slots left over from a previous, denser assignment.
    for (let i = treeCount; i < SLOT_TREE_CAP; i++) {
      slot.trunks.setMatrixAt(i, HIDDEN);
      slot.leaves.setMatrixAt(i, HIDDEN);
    }
    for (let i = rockCount; i < SLOT_ROCK_CAP; i++) slot.rocks.setMatrixAt(i, HIDDEN);
    slot.trunks.count = slot.leaves.count = SLOT_TREE_CAP;
    slot.rocks.count = SLOT_ROCK_CAP;
    slot.trunks.instanceMatrix.needsUpdate = true;
    slot.leaves.instanceMatrix.needsUpdate = true;
    slot.rocks.instanceMatrix.needsUpdate = true;

    slot.coord = { cx, cz };
  }

  function refresh(center: ChunkCoord) {
    const desired = new Set<string>();
    for (let dx = -LOAD_RADIUS_CHUNKS; dx <= LOAD_RADIUS_CHUNKS; dx++) {
      for (let dz = -LOAD_RADIUS_CHUNKS; dz <= LOAD_RADIUS_CHUNKS; dz++) {
        desired.add(chunkKey(center.cx + dx, center.cz + dz));
      }
    }
    // Free slots whose chunk fell outside the desired window; keep ones already in it.
    const free: Slot[] = [];
    for (const slot of slots) {
      if (!slot.coord) {
        free.push(slot);
        continue;
      }
      const key = chunkKey(slot.coord.cx, slot.coord.cz);
      if (desired.has(key)) {
        desired.delete(key); // already loaded, nothing to do
      } else {
        slot.coord = null;
        free.push(slot);
      }
    }
    for (const key of desired) {
      const slot = free.pop();
      if (!slot) break; // shouldn't happen: free-slot count always matches window size
      const [cx, cz] = key.split(",").map(Number);
      assignSlot(slot, cx, cz);
    }
  }

  return {
    heightAt: sampleHeight,
    update(playerPos: THREE.Vector3) {
      const current = chunkCoordAt(playerPos.x, playerPos.z);
      if (lastChunk && lastChunk.cx === current.cx && lastChunk.cz === current.cz) return;
      lastChunk = current;
      refresh(current);
    },
    dispose() {
      for (const slot of slots) {
        slot.groundGeo.dispose();
        scene.remove(slot.group);
      }
      groundMat.dispose();
      groundTex.dispose();
      trunkGeo.dispose();
      trunkMat.dispose();
      leafGeo.dispose();
      leafMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      leafMat2.dispose();
      bushGeo.dispose();
      flowerGeo.dispose();
      flowerMat.dispose();
    },
  };
}
