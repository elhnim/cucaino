// Per-kid "have I found this?" memory for the map's fog-of-discovery: undiscovered settlements,
// Natural Wonders and far islands show as faint "?" silhouettes until the kid actually walks up to
// one (ParkWorld already fires onVillage/onWonder the first time that happens, per visit — this is
// what makes it stick between visits). Stored flat (just ids — the map works out which category an
// id belongs to from lib/park/map/entities.ts's own lists, so nothing can drift out of step), under
// `cucaino:found:<kidId>`, same convention as every other per-kid localStorage key in ParkApp.tsx.
// Every call is try/catch-guarded: a private window or blocked storage just means nothing persists,
// never a crash.
export type FoundStorage = Pick<Storage, "getItem" | "setItem">;

function storageOrNull(storage?: FoundStorage): FoundStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const key = (kidId: string) => `cucaino:found:${kidId}`;

export function loadFoundIds(kidId: string, storage?: FoundStorage): string[] {
  const s = storageOrNull(storage);
  if (!s || !kidId) return [];
  try {
    const raw = s.getItem(key(kidId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** marks `id` found and returns the up-to-date full list (so a caller can setState with it
 *  straight away instead of reading storage again) */
export function markFound(kidId: string, id: string, storage?: FoundStorage): string[] {
  const s = storageOrNull(storage);
  const cur = loadFoundIds(kidId, storage);
  if (cur.includes(id)) return cur;
  const next = [...cur, id];
  if (s && kidId) {
    try {
      s.setItem(key(kidId), JSON.stringify(next));
    } catch {
      // storage full / blocked — the discovery still shows for this session, just doesn't persist
    }
  }
  return next;
}

export function isFound(foundIds: readonly string[], id: string): boolean {
  return foundIds.includes(id);
}

/** how many of `ids` are in the found list — for the "🌍 Wonders 2/7" progress strip */
export function countFound(foundIds: readonly string[], ids: readonly string[]): number {
  return ids.reduce((n, id) => n + (foundIds.includes(id) ? 1 : 0), 0);
}
