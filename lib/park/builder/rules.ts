// Pure rules for the Dream Park builder (no three.js, no I/O) — shared by the client (ghost
// preview) and the server actions (authoritative checks). Unit tested.
import { getPiece, type PieceDef } from "../registry/pieces";

/** The fenced Dream Park lawn east of the plaza, as a grid of CELL-sized squares. */
export const DREAM_ZONE = { x0: 68, z0: -6, cols: 12, rows: 12, cell: 2.4 } as const;

export interface Placed {
  uid: string;
  piece: string;
  gx: number;
  gz: number;
  /** quarter turns 0..3 */
  r: number;
}

/** Lifetime-stars profile levels (same table as the rest of the app). */
export const LEVELS = [0, 100, 300, 600, 1000];
export function levelFor(totalStarsEarned: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVELS.length; i++) if (totalStarsEarned >= LEVELS[i]) lvl = i + 1;
  return lvl;
}

export function footprint(p: PieceDef, r: number): { w: number; d: number } {
  return r % 2 === 0 ? { w: p.w, d: p.d } : { w: p.d, d: p.w };
}

export function isUnlocked(p: PieceDef, level: number, streak: number): boolean {
  if (p.unlock?.level && level < p.unlock.level) return false;
  if (p.unlock?.streak && streak < p.unlock.streak) return false;
  return true;
}

export function unlockHint(p: PieceDef): string {
  const parts: string[] = [];
  if (p.unlock?.level) parts.push(`level ${p.unlock.level}`);
  if (p.unlock?.streak) parts.push(`${p.unlock.streak}-day streak`);
  return parts.length ? `Unlocks at ${parts.join(" + ")}` : "";
}

function cells(piece: PieceDef, gx: number, gz: number, r: number): [number, number][] {
  const { w, d } = footprint(piece, r);
  const out: [number, number][] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([gx + i, gz + j]);
  return out;
}

export type PlaceCheck = { ok: true } | { ok: false; reason: "unknown" | "outside" | "overlap" };

/** Can `pieceId` go at (gx, gz, r) given what's already placed (optionally ignoring one uid being moved)? */
export function canPlace(layout: Placed[], pieceId: string, gx: number, gz: number, r: number, ignoreUid?: string): PlaceCheck {
  const piece = getPiece(pieceId);
  if (!piece) return { ok: false, reason: "unknown" };
  const mine = cells(piece, gx, gz, r);
  if (mine.some(([x, z]) => x < 0 || z < 0 || x >= DREAM_ZONE.cols || z >= DREAM_ZONE.rows)) return { ok: false, reason: "outside" };
  const taken = new Set<string>();
  for (const pl of layout) {
    if (pl.uid === ignoreUid) continue;
    const p = getPiece(pl.piece);
    if (!p) continue;
    for (const [x, z] of cells(p, pl.gx, pl.gz, pl.r)) taken.add(`${x},${z}`);
  }
  if (mine.some(([x, z]) => taken.has(`${x},${z}`))) return { ok: false, reason: "overlap" };
  return { ok: true };
}

/** World-space centre of a piece placed at (gx, gz, r). */
export function cellCenter(pieceId: string, gx: number, gz: number, r: number): { x: number; z: number } {
  const piece = getPiece(pieceId);
  const { w, d } = piece ? footprint(piece, r) : { w: 1, d: 1 };
  return {
    x: DREAM_ZONE.x0 + (gx + w / 2) * DREAM_ZONE.cell,
    z: DREAM_ZONE.z0 + (gz + d / 2) * DREAM_ZONE.cell,
  };
}

/** Which grid cell (top-left of the footprint) a world point lands the piece on. */
export function worldToCell(pieceId: string, x: number, z: number, r: number): { gx: number; gz: number } {
  const piece = getPiece(pieceId);
  const { w, d } = piece ? footprint(piece, r) : { w: 1, d: 1 };
  return {
    gx: Math.round((x - DREAM_ZONE.x0) / DREAM_ZONE.cell - w / 2),
    gz: Math.round((z - DREAM_ZONE.z0) / DREAM_ZONE.cell - d / 2),
  };
}

export function zoneBounds() {
  return {
    minX: DREAM_ZONE.x0,
    minZ: DREAM_ZONE.z0,
    maxX: DREAM_ZONE.x0 + DREAM_ZONE.cols * DREAM_ZONE.cell,
    maxZ: DREAM_ZONE.z0 + DREAM_ZONE.rows * DREAM_ZONE.cell,
  };
}

/** Removing a piece gives back half its tickets (rounded down) so rearranging isn't punished much. */
export function refundFor(pieceId: string): number {
  return Math.floor((getPiece(pieceId)?.cost ?? 0) / 2);
}

/** Tickets per completed quest (the only way to earn them besides ride bonuses). */
export const TICKETS_PER_QUEST = 1;
