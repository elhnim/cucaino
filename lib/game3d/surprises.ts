import * as THREE from "three";
import {
  CHUNK_SIZE,
  LOAD_RADIUS_CHUNKS,
  VILLAGE_CLEAR_RADIUS,
  chunkCoordAt,
  chunkCenter,
  chunkKey,
  chunkSeed,
} from "./terrainMath";
import { makeSparkleTexture } from "./textures";

/**
 * Hidden surprises dotted through the endless countryside — one (or none) per chunk, placed
 * deterministically from the kid's world seed, so exploring always pays off. Each one has a
 * tall soft light-pillar so it can be spotted from far away. All kinds share a handful of
 * geometries/materials; a chunk's surprise is just a few Mesh objects, so streaming is cheap.
 */
export type SurpriseKind = "chest" | "gift" | "balloons" | "star" | "fairy-ring";

export interface SurpriseFind {
  kind: SurpriseKind;
  sparkles: number;
  message: string;
}

const FINDS: Record<SurpriseKind, { sparkles: number; messages: string[] }> = {
  chest: { sparkles: 10, messages: ["Treasure chest! 💰", "Pirate gold! 🏴‍☠️", "A chest full of shiny things! 💎"] },
  gift: { sparkles: 6, messages: ["A mystery gift! 🎁", "Surprise present! 🎀", "Someone left you a gift! 🎁"] },
  balloons: { sparkles: 4, messages: ["Pop! Balloon party! 🎈", "Balloons for you! 🎈"] },
  star: { sparkles: 15, messages: ["You caught a fallen star! 🌟", "A wishing star! Make a wish ⭐"] },
  "fairy-ring": { sparkles: 8, messages: ["A fairy ring! The fairies say hi 🧚", "Magic mushrooms circle! ✨🍄"] },
};

const KIND_ORDER: SurpriseKind[] = ["chest", "gift", "balloons", "gift", "fairy-ring", "chest", "balloons", "star"];

interface Live {
  key: string;
  kind: SurpriseKind;
  group: THREE.Group;
  pillar: THREE.Sprite;
  position: THREE.Vector3;
  phase: number;
  opening: number; // < 0 = idle, 0..1 = open animation progress
}

export interface Surprises {
  update(dt: number, playerPos: THREE.Vector3): SurpriseFind | null;
  /** nearest un-found surprise within maxDist (used by the pet to run ahead and show the way) */
  nearest(pos: THREE.Vector3, maxDist: number): THREE.Vector3 | null;
  dispose(): void;
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSurprises(
  scene: THREE.Scene,
  opts: { seed: number; heightAt: (x: number, z: number) => number },
): Surprises {
  const std = (color: number | string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
  const mats = {
    wood: std("#8a5a2c"),
    gold: std("#ffd447", { emissive: 0xb8860b, emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.35 }),
    giftA: std("#ff5d8f"),
    giftB: std("#60a5fa"),
    ribbon: std("#fff3c0"),
    string: new THREE.LineBasicMaterial({ color: 0xffffff }),
    capRed: std("#e5484d"),
    stem: std("#fff4e0"),
    star: std("#ffe066", { emissive: 0xffc400, emissiveIntensity: 0.9 }),
  };
  const balloonMats = [std("#ff5d8f"), std("#ffd447"), std("#4ade80"), std("#60a5fa"), std("#c084fc")];
  const geos = {
    chestBase: new THREE.BoxGeometry(1.1, 0.6, 0.75),
    chestLid: new THREE.BoxGeometry(1.1, 0.3, 0.75),
    band: new THREE.BoxGeometry(0.14, 0.92, 0.78),
    gift: new THREE.BoxGeometry(0.8, 0.8, 0.8),
    ribbonX: new THREE.BoxGeometry(0.84, 0.84, 0.16),
    ribbonZ: new THREE.BoxGeometry(0.16, 0.84, 0.84),
    bow: new THREE.TorusGeometry(0.16, 0.06, 6, 10),
    balloon: new THREE.SphereGeometry(0.38, 10, 8),
    cap: new THREE.SphereGeometry(0.32, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    stem: new THREE.CylinderGeometry(0.1, 0.13, 0.35, 6),
    star: new THREE.OctahedronGeometry(0.55, 0),
  };
  const sparkTex = makeSparkleTexture();
  const pillarMat = new THREE.SpriteMaterial({ map: sparkTex, color: 0xfff1b8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });

  const found = new Set<string>();
  const live = new Map<string, Live>();
  let lastChunk = "";
  let t = 0;

  function buildKind(kind: SurpriseKind): THREE.Group {
    const g = new THREE.Group();
    if (kind === "chest") {
      const base = new THREE.Mesh(geos.chestBase, mats.wood);
      base.position.y = 0.3;
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.6, -0.375);
      const lid = new THREE.Mesh(geos.chestLid, mats.wood);
      lid.position.set(0, 0.15, 0.375);
      lidPivot.add(lid);
      const band = new THREE.Mesh(geos.band, mats.gold);
      band.position.y = 0.46;
      g.add(base, lidPivot, band);
      g.userData.lid = lidPivot;
    } else if (kind === "gift") {
      const box = new THREE.Mesh(geos.gift, Math.random() < 0.5 ? mats.giftA : mats.giftB);
      box.position.y = 0.4;
      const rx = new THREE.Mesh(geos.ribbonX, mats.ribbon);
      rx.position.y = 0.4;
      const rz = new THREE.Mesh(geos.ribbonZ, mats.ribbon);
      rz.position.y = 0.4;
      for (const s of [-1, 1]) {
        const bow = new THREE.Mesh(geos.bow, mats.ribbon);
        bow.position.set(s * 0.14, 0.9, 0);
        bow.rotation.y = Math.PI / 2;
        g.add(bow);
      }
      g.add(box, rx, rz);
      g.userData.lid = box;
    } else if (kind === "balloons") {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const b = new THREE.Mesh(geos.balloon, balloonMats[i]);
        b.scale.y = 1.15;
        b.position.set(Math.sin(a) * 0.45, 2.2 + (i % 2) * 0.35, Math.cos(a) * 0.45);
        b.userData.bob = i;
        g.add(b);
        pts.push(new THREE.Vector3(0, 0.1, 0), b.position.clone().setY(b.position.y - 0.4));
      }
      const strings = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mats.string);
      strings.userData.ownGeometry = true;
      g.add(strings);
      g.userData.balloons = true;
    } else if (kind === "fairy-ring") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const m = new THREE.Group();
        const stem = new THREE.Mesh(geos.stem, mats.stem);
        stem.position.y = 0.17;
        const cap = new THREE.Mesh(geos.cap, mats.capRed);
        cap.position.y = 0.32;
        m.add(stem, cap);
        m.position.set(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3);
        m.scale.setScalar(0.8 + ((i * 37) % 5) * 0.1);
        g.add(m);
      }
    } else {
      const star = new THREE.Mesh(geos.star, mats.star);
      star.position.y = 1.1;
      g.add(star);
      g.userData.spin = star;
    }
    return g;
  }

  function spawnFor(cx: number, cz: number) {
    spawnOne(cx, cz, 0);
    spawnOne(cx, cz, 1);
  }

  function spawnOne(cx: number, cz: number, n: number) {
    const key = `${chunkKey(cx, cz)}#${n}`;
    if (found.has(key) || live.has(key)) return;
    const c = chunkCenter(cx, cz);
    if (Math.hypot(c.x, c.z) < VILLAGE_CLEAR_RADIUS + CHUNK_SIZE * 0.4) return;
    const r = rng(chunkSeed(opts.seed ^ (0x5eed + n * 7919), cx, cz));
    if (r() > (n === 0 ? 0.85 : 0.45)) return; // most chunks have one, many have two
    const x = c.x + (r() - 0.5) * CHUNK_SIZE * 0.7;
    const z = c.z + (r() - 0.5) * CHUNK_SIZE * 0.7;
    if (Math.hypot(x, z) < VILLAGE_CLEAR_RADIUS + 4) return;
    const kind = KIND_ORDER[Math.floor(r() * KIND_ORDER.length)];
    const group = buildKind(kind);
    const y = opts.heightAt(x, z);
    group.position.set(x, y, z);
    group.rotation.y = r() * Math.PI * 2;
    const pillar = new THREE.Sprite(pillarMat);
    pillar.scale.set(1.6, 9, 1);
    pillar.position.set(x, y + 4.5, z);
    scene.add(group, pillar);
    live.set(key, { key, kind, group, pillar, position: new THREE.Vector3(x, y, z), phase: r() * 10, opening: -1 });
  }

  function remove(l: Live) {
    scene.remove(l.group, l.pillar);
    l.group.traverse((o) => {
      if (o.userData.ownGeometry) (o as THREE.LineSegments).geometry.dispose();
    });
    live.delete(l.key);
  }

  return {
    update(dt, playerPos) {
      t += dt;
      const cc = chunkCoordAt(playerPos.x, playerPos.z);
      const ck = chunkKey(cc.cx, cc.cz);
      if (ck !== lastChunk) {
        lastChunk = ck;
        for (let dx = -LOAD_RADIUS_CHUNKS; dx <= LOAD_RADIUS_CHUNKS; dx++) {
          for (let dz = -LOAD_RADIUS_CHUNKS; dz <= LOAD_RADIUS_CHUNKS; dz++) spawnFor(cc.cx + dx, cc.cz + dz);
        }
        for (const l of [...live.values()]) {
          const lc = chunkCoordAt(l.position.x, l.position.z);
          if (Math.abs(lc.cx - cc.cx) > LOAD_RADIUS_CHUNKS || Math.abs(lc.cz - cc.cz) > LOAD_RADIUS_CHUNKS) remove(l);
        }
      }

      let find: SurpriseFind | null = null;
      for (const l of [...live.values()]) {
        const g = l.group;
        if (l.opening >= 0) {
          l.opening += dt * 1.6;
          const lid = g.userData.lid as THREE.Object3D | undefined;
          if (l.kind === "chest" && lid) lid.rotation.x = -Math.min(1, l.opening * 2) * 1.9;
          else if (l.kind === "balloons") g.position.y += dt * 6; // float away!
          else g.scale.setScalar(Math.max(0.01, 1 + Math.sin(Math.min(1, l.opening) * Math.PI) * 0.4 - l.opening * 0.9));
          l.pillar.visible = false;
          if (l.opening >= 1.4) remove(l);
          continue;
        }
        // idle life: bobbing star, swaying balloons, a gentle hop on gifts
        const spin = g.userData.spin as THREE.Object3D | undefined;
        if (spin) {
          spin.rotation.y += dt * 1.8;
          spin.position.y = 1.1 + Math.sin(t * 2 + l.phase) * 0.2;
        }
        if (g.userData.balloons) g.rotation.z = Math.sin(t * 1.3 + l.phase) * 0.06;
        if (l.kind === "gift") g.position.y = l.position.y + Math.max(0, Math.sin(t * 3 + l.phase)) * 0.12;
        l.pillar.scale.x = 1.6 + Math.sin(t * 2.2 + l.phase) * 0.25;

        const dx = playerPos.x - l.position.x;
        const dz = playerPos.z - l.position.z;
        if (!find && dx * dx + dz * dz < 2.6) {
          l.opening = 0;
          found.add(l.key);
          const info = FINDS[l.kind];
          find = { kind: l.kind, sparkles: info.sparkles, message: info.messages[Math.floor(Math.random() * info.messages.length)] };
        }
      }
      return find;
    },
    nearest(pos, maxDist) {
      let best: THREE.Vector3 | null = null;
      let bestD = maxDist * maxDist;
      for (const l of live.values()) {
        if (l.opening >= 0) continue;
        const d = (l.position.x - pos.x) ** 2 + (l.position.z - pos.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = l.position;
        }
      }
      return best;
    },
    dispose() {
      for (const l of [...live.values()]) remove(l);
      for (const m of [...Object.values(mats), ...balloonMats]) m.dispose();
      for (const g of Object.values(geos)) g.dispose();
      pillarMat.dispose();
      sparkTex.dispose();
    },
  };
}
