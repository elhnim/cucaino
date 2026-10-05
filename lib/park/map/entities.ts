// Turns every registry the island is built from into one flat list of "things you can find on the
// map" — one entity per quest board, land, railway station, settlement, Natural Wonder and far
// island. Nothing here is hard-coded by name: add a new wonder/settlement/station to its own
// registry and it shows up here (and so on the map) automatically. Pure data, no three.js, no DOM.
import { LANDS, PLACES, type LandDef, type PlaceDef } from "../registry/places";
import { STATIONS, type Station } from "../registry/railway";
import { SETTLEMENTS, type SettlementDef } from "../registry/settlements";
import { WONDERS, type WonderDef } from "../registry/wonders";
import { ISLAND_LANDMARKS, WORLD_PLACES, type WorldPlace } from "../registry/worldMap";

/** the docks (registry/harbours.ts's DOCKS), copied rather than imported: harbours.ts pulls in
 *  the boat/sub rig geometry from characters/mounts.ts, which — like ParkWorld.ts itself — is
 *  three.js, and this module (lib/park/map/**) has to stay safe for a plain browser/vitest bundle
 *  with no three.js in it. entities.test.ts imports harbours.ts directly (fine there: tests run in
 *  node, never bundled) to check this copy hasn't drifted. Same "copy the number, not the heavy
 *  module" trick places.ts's kartDoorWorld comment already uses, for the same reason. */
export const MAP_DOCKS: { id: string; name: string; x: number; z: number }[] = [
  { id: "candy-harbour", name: "Candy Harbour", x: -51.9, z: 167.8 },
  { id: "frost-dock", name: "Frostpeak Ice Dock", x: 959.1, z: 990.5 },
  { id: "great-lake", name: "Great Lake Jetty", x: 1427, z: -511 },
  { id: "rift-dock", name: "Rift Dock", x: 63.5, z: 976 },
  { id: "coralcove", name: "Shellharbour Jetty", x: 336, z: 711 },
  { id: "dino", name: "Dino Isle Jetty", x: -405.7, z: -50 },
];

/** "dragon" never appears in STATIC_ENTITIES (dragons roam — they're merged in live, from
 *  ParkWorld.ridePins, by components/park/map/MapScreen.tsx); every other category is registry-driven */
export type MapCategory = "quest" | "home" | "ride" | "village" | "wonder" | "station" | "island" | "mountain" | "land" | "dock" | "dragon";

export interface MapEntity {
  id: string;
  name: string;
  emoji: string;
  x: number;
  z: number;
  category: MapCategory;
  /** higher draws over / survives de-cluttering longer */
  priority: number;
  /** a wonder/settlement/far-island/sky-island: hidden as a "?" silhouette until found (see foundSet.ts) */
  discoverable?: boolean;
  blurb?: string;
  /** a railway station id this entity can be reached through (for the trip planner) */
  stationId?: string;
  /** true for places far out at sea / up in the sky: a kid can't walk there */
  remote?: boolean;
}

/** the places a kid can self-add… no: the Quest Board, home and the big landmark buildings — read
 *  off places.ts so a new one just appears */
const QUEST_BOARD = PLACES.find((p) => p.action === "quests");
const HOME_PLACE = PLACES.find((p) => p.action === "home");

function fromLand(l: LandDef): MapEntity {
  return { id: `land:${l.id}`, name: l.name, emoji: l.emoji, x: l.x, z: l.z, category: "land", priority: 3 };
}
function fromPlace(p: PlaceDef, category: MapCategory, priority: number): MapEntity {
  return { id: `place:${p.id}`, name: p.label, emoji: p.emoji, x: p.x, z: p.z, category, priority };
}
function fromStation(s: Station): MapEntity {
  return { id: s.id, name: s.name, emoji: s.emoji, x: s.x, z: s.z, category: "station", priority: 8, blurb: s.blurb, stationId: s.id };
}
function fromSettlement(s: SettlementDef): MapEntity {
  return { id: s.id, name: s.name, emoji: s.emoji, x: s.x, z: s.z, category: "village", priority: 7, discoverable: true, blurb: `${s.name}, home of ${s.clan}.`, stationId: s.stationId };
}
function fromWonder(w: WonderDef): MapEntity {
  return { id: w.id, name: w.name, emoji: w.emoji, x: w.x, z: w.z, category: "wonder", priority: 9, discoverable: true, blurb: w.blurb };
}
function fromWorldPlace(w: WorldPlace): MapEntity {
  // sky islands float right above the park itself (reached by flying straight up, not by any
  // cross-island journey) — at Island/World zoom they'd otherwise pile into a dense knot right on
  // top of the park, so they fade out with the park's own buildings instead of competing with the
  // genuinely far-flung destinations (real islands, the Abyss) a kid actually travels the map to
  const localToPark = w.kind === "sky";
  return {
    id: w.id,
    name: w.name,
    emoji: w.emoji,
    x: w.x,
    z: w.z,
    category: localToPark ? "mountain" : "island",
    priority: localToPark ? 3 : w.kind === "abyss" ? 5 : 7,
    discoverable: true,
    blurb: w.how,
    remote: true,
  };
}

/** every static (registry-driven, never-moving) entity on the map: lands, the quest board, home,
 *  the market/arcade/golf/karts "rides" buildings, railway stations, Wildlands settlements, Natural
 *  Wonders, far islands/sky islands/the Abyss, and the big labelled landmarks (the Great Ridge). */
export function buildStaticEntities(): MapEntity[] {
  const out: MapEntity[] = [];
  for (const l of LANDS) if (l.id !== "gate" && l.id !== "plaza") out.push(fromLand(l));
  if (QUEST_BOARD) out.push({ ...fromPlace(QUEST_BOARD, "quest", 10) });
  if (HOME_PLACE) out.push({ ...fromPlace(HOME_PLACE, "home", 10) });
  for (const p of PLACES) {
    if (p.id === QUEST_BOARD?.id || p.id === HOME_PLACE?.id) continue;
    if (p.action === "rides" || p.action === "golf" || p.action === "arcade" || p.action === "karts" || p.action === "retro") out.push(fromPlace(p, "ride", 5));
  }
  for (const s of STATIONS) out.push(fromStation(s));
  for (const s of SETTLEMENTS) out.push(fromSettlement(s));
  for (const w of WONDERS) out.push(fromWonder(w));
  for (const w of WORLD_PLACES) out.push(fromWorldPlace(w));
  for (const lm of ISLAND_LANDMARKS) out.push({ id: lm.id, name: lm.name, emoji: lm.emoji, x: lm.x, z: lm.z, category: "mountain", priority: 4 });
  for (const dk of MAP_DOCKS) out.push({ id: `dock:${dk.id}`, name: dk.name, emoji: "⚓", x: dk.x, z: dk.z, category: "dock", priority: 5 });
  return out;
}

export const STATIC_ENTITIES: MapEntity[] = buildStaticEntities();

/** categories that should stay fully searchable (Where-to) but never get their own map pin: the
 *  quest board's live badge pin is supplied separately by ParkApp, and "ride" places (golf/arcade/
 *  karts/the Sky Coaster/retro) each sit inside a land that already shows its own icon + name —
 *  a second pin on top of it just reads as a confusing "x2" cluster */
export const MARKER_HIDDEN_CATEGORIES: readonly MapCategory[] = ["quest", "ride"];

/** category chips for the Where-to panel, in the order the spec lists them */
export const CATEGORY_CHIPS: { category: MapCategory; emoji: string; label: string }[] = [
  { category: "quest", emoji: "⭐", label: "Quests" },
  { category: "home", emoji: "🏡", label: "Home" },
  { category: "ride", emoji: "🎢", label: "Rides & games" },
  { category: "village", emoji: "🏘️", label: "Villages" },
  { category: "wonder", emoji: "🌍", label: "Wonders" },
  { category: "station", emoji: "🚂", label: "Stations" },
  { category: "dragon", emoji: "🐉", label: "Dragons" },
  { category: "dock", emoji: "⛵", label: "Boats & docks" },
  { category: "island", emoji: "🏝️", label: "Islands" },
];

/** ids worth tracking in the "found" progress strip, grouped the way it's shown: Wonders, Villages
 *  (the Wildlands settlements + Coralcove, kin to a village), Islands (the rest of WORLD_PLACES) */
export const PROGRESS_GROUPS: { key: "wonder" | "village" | "island"; emoji: string; label: string; ids: string[] }[] = [
  { key: "wonder", emoji: "🌍", label: "Wonders", ids: WONDERS.map((w) => w.id) },
  { key: "village", emoji: "🏘️", label: "Villages", ids: SETTLEMENTS.map((s) => s.id) },
  { key: "island", emoji: "🏝️", label: "Islands", ids: WORLD_PLACES.filter((w) => w.kind !== "sky").map((w) => w.id) },
];

export function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
