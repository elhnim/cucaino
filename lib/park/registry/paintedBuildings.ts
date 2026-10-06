// The park's painted buildings: places whose kit model is replaced by a hand-finished building —
// a simple solid shape (walls, a hipped roof, a plinth) wrapped in real painted artwork: a front
// elevation with its door, windows, awning and sign, a side wall, and a roof covering
// (public/park-assets/buildings/<art>-front.webp, -side.webp, -roof.webp, packed by
// scripts/art-pack.mjs from the pictures in codex-world-art/park/). One entry = one building;
// world/paintedBuilding.ts builds it and buildPark swaps it in for the place's first kit model.
export interface PaintedBuilding {
  /** the place it stands at (registry/places.ts id) */
  place: string;
  /** the artwork's name (its folder under codex-world-art/park/) */
  art: string;
  /** the front wall's width and height, and the building's depth front to back (world units) —
   *  width / height should match the front picture, depth / height the side picture */
  w: number;
  h: number;
  d: number;
  /** how far the roof rises above the walls (0 = a flat roof with a low parapet) */
  roofRise: number;
  /** which of the place's kit models it replaces (default: the first) */
  replaces?: number[];
  /** the front picture's file suffix if not plain "front" (e.g. a refined second version) */
  front?: string;
  /** trim colour for the plinth, eaves and parapet */
  trim?: string;
}

export const PAINTED_BUILDINGS: PaintedBuilding[] = [
  { place: "prize-shop", art: "prize-shop", w: 6.6, h: 4.4, d: 4.4, roofRise: 1.7, front: "front-refined", trim: "#f6ead8" },
  { place: "bank", art: "bank", w: 5.4, h: 3.6, d: 3.6, roofRise: 1.2, trim: "#efe6d2" },
  { place: "pet-house", art: "pet-house", w: 5.7, h: 3.8, d: 3.8, roofRise: 1.7, trim: "#f4f1e6" },
];

export const paintedBuildingFor = (placeId: string): PaintedBuilding | undefined => PAINTED_BUILDINGS.find((b) => b.place === placeId);
