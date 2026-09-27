// Daily treasure hunt: a few candy chests hidden around the park (mostly in the Sweet Forest),
// in new spots every day. Walking into one pops it open with a sticker for the kid's album.
// Positions are seeded by the date, so they're stable for the day and fresh tomorrow.
import * as THREE from "three";
import type { ParkAssets } from "../assets/loader";
import { LANDS } from "../registry/places";

export const STICKERS = ["🦄", "🌈", "🍩", "🧁", "🍭", "⭐", "🎈", "🐙", "🦋", "🍓", "🌟", "🎀", "🐳", "🍦", "🪐", "🦖", "🌸", "🍉"];
export const TREASURES_PER_DAY = 6;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Today's treasure spots + which sticker each one holds. */
export function todaysTreasures(kidSeed: number, key = dayKey()) {
  let h = kidSeed >>> 0;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = rng(h);
  const forest = LANDS.find((l) => l.id === "forest")!;
  const spots: { id: number; x: number; z: number; sticker: string }[] = [];
  for (let i = 0; i < TREASURES_PER_DAY; i++) {
    // two thirds in the Sweet Forest, the rest hidden elsewhere in the park
    const inForest = i < 4;
    const a = r() * Math.PI * 2;
    const rad = inForest ? 3 + r() * (forest.radius - 4) : 24 + r() * 58;
    const cx = inForest ? forest.x : 0;
    const cz = inForest ? forest.z : 0;
    spots.push({ id: i, x: cx + Math.sin(a) * rad, z: cz + Math.cos(a) * rad, sticker: STICKERS[Math.floor(r() * STICKERS.length)] });
  }
  return spots;
}

export interface TreasureView {
  update(dt: number, t: number, kid: THREE.Vector3): number | null;
  dispose(): void;
}

export async function createTreasures(scene: THREE.Scene, assets: ParkAssets, spots: { id: number; x: number; z: number }[], found: Set<number>): Promise<TreasureView> {
  const live: { id: number; obj: THREE.Object3D; x: number; z: number; open: number }[] = [];
  const glowTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,240,160,0.9)");
    g.addColorStop(1, "rgba(255,240,160,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const s of spots) {
    if (found.has(s.id)) continue;
    const g = new THREE.Group();
    const box = await assets.spawn("holiday", s.id % 2 ? "present-a-round" : "present-b-cube");
    box.scale.setScalar(2);
    g.add(box);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(3.4, 3.4, 1);
    glow.position.y = 1;
    g.add(glow);
    g.position.set(s.x, 0, s.z);
    scene.add(g);
    live.push({ id: s.id, obj: g, x: s.x, z: s.z, open: -1 });
  }
  return {
    update(dt, t, kid) {
      let foundId: number | null = null;
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i];
        if (l.open >= 0) {
          l.open += dt;
          l.obj.position.y = l.open * 5;
          l.obj.scale.setScalar(Math.max(0.01, 1 - l.open * 1.6));
          if (l.open > 0.65) {
            scene.remove(l.obj);
            live.splice(i, 1);
          }
          continue;
        }
        l.obj.rotation.y = Math.sin(t * 1.5 + l.id) * 0.4;
        l.obj.position.y = Math.abs(Math.sin(t * 2.4 + l.id)) * 0.25;
        if (foundId === null && (kid.x - l.x) ** 2 + (kid.z - l.z) ** 2 < 3.2) {
          l.open = 0;
          foundId = l.id;
        }
      }
      return foundId;
    },
    dispose() {
      for (const l of live) scene.remove(l.obj);
      glowMat.dispose();
      glowTex.dispose();
    },
  };
}
