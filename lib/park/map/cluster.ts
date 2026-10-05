// De-cluttering: at any zoom, only show markers that have screen room to breathe. Higher-priority
// markers claim space first; anything of the same emoji that lands too close to one already shown
// folds into a little "🐉×3" cluster instead of overlapping it. Pure maths — components/park/map/
// MapCanvas.tsx feeds it already-projected screen points every frame.
import type { Camera } from "./camera";
import { worldToScreen } from "./camera";

export interface ClusterInput {
  id: string;
  x: number;
  z: number;
  emoji: string;
  priority: number;
  /** groups for clustering purposes when it differs from what's actually drawn — e.g. every
   *  undiscovered mystery place draws the same "❓", but a mystery wonder should never cluster
   *  with a mystery island; defaults to `emoji` */
  groupKey?: string;
}

export interface ClusterResult {
  /** the representative member's id (a real marker) when count === 1; a synthetic "cluster:<emoji>:n"
   *  id otherwise */
  id: string;
  x: number;
  z: number;
  emoji: string;
  count: number;
  /** every original id folded into this result (length 1 for a lone marker) */
  memberIds: string[];
}

/**
 * Greedily keeps high-priority markers and folds same-emoji neighbours within `minGapPx` screen
 * pixels of a kept one into a cluster centred on their average position. Stable: given the same
 * inputs and camera it always returns the same groupings (sorted by priority then id, so ties
 * never flicker between renders).
 */
export function clusterMarkers(items: ClusterInput[], cam: Camera, w: number, h: number, minGapPx = 30): ClusterResult[] {
  const sorted = [...items].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const kept: { item: ClusterInput; sx: number; sz: number; members: ClusterInput[] }[] = [];
  for (const item of sorted) {
    const [sx, sz] = worldToScreen(cam, w, h, item.x, item.z);
    let joined = false;
    const key = item.groupKey ?? item.emoji;
    for (const k of kept) {
      if ((k.item.groupKey ?? k.item.emoji) !== key) continue;
      if (Math.hypot(sx - k.sx, sz - k.sz) <= minGapPx) {
        k.members.push(item);
        joined = true;
        break;
      }
    }
    if (!joined) kept.push({ item, sx, sz, members: [item] });
  }
  return kept.map((k) => {
    const cx = k.members.reduce((s, m) => s + m.x, 0) / k.members.length;
    const cz = k.members.reduce((s, m) => s + m.z, 0) / k.members.length;
    return {
      id: k.members.length > 1 ? `cluster:${k.item.emoji}:${k.members.length}:${k.item.id}` : k.item.id,
      x: cx,
      z: cz,
      emoji: k.item.emoji,
      count: k.members.length,
      memberIds: k.members.map((m) => m.id),
    };
  });
}

/** everything on screen, with a comfortable pad so near-edge markers aren't dropped the instant
 *  they're half off-screen (worth clustering for, but no point projecting the whole world) */
export function visibleItems<T extends { x: number; z: number }>(items: T[], cam: Camera, padFactor = 1.15): T[] {
  const r = cam.view * padFactor;
  return items.filter((i) => Math.abs(i.x - cam.cx) <= r && Math.abs(i.z - cam.cz) <= r);
}
