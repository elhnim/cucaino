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
  /**
   * what kind of thing it is (default a walled building):
   *  "stall" — an open market stall: its front picture is a cut-out (counter, posts and striped
   *            awning on a clear ground) standing before and behind a plain wooden counter, under a
   *            flat canopy in its roof covering (or the trim colour if it has no roof picture);
   *  "arch"  — a flat cut-out you walk through (the park's gate): the one picture, seen from both sides
   */
  kind?: "building" | "stall" | "arch";
  /** a stall with no roof picture of its own */
  noRoof?: boolean;
}

export const PAINTED_BUILDINGS: PaintedBuilding[] = [
  { place: "prize-shop", art: "prize-shop", w: 6.6, h: 4.4, d: 4.4, roofRise: 1.7, front: "front-refined", trim: "#f6ead8" },
  { place: "bank", art: "bank", w: 5.4, h: 3.6, d: 3.6, roofRise: 1.2, trim: "#efe6d2" },
  { place: "pet-house", art: "pet-house", w: 5.7, h: 3.8, d: 3.8, roofRise: 1.7, trim: "#f4f1e6" },
  // (a three-storey tower: its pictures are 2:3)
  { place: "friends-tower", art: "friends-cafe", w: 4.2, h: 6.3, d: 4.2, roofRise: 1.5, trim: "#f6efd8" },
  { place: "ride-station", art: "ride-station", w: 6.3, h: 4.2, d: 4.2, roofRise: 1.2, trim: "#f3e6cf" },
  // the kid's own cottage: cream plaster and timber, a mint door, heart-cut shutters, climbing roses, thatch
  { place: "my-home", art: "my-home", w: 7.2, h: 4.8, d: 4.8, roofRise: 2.3, replaces: [], trim: "#efe2c4" },
  // the grown-ups' kiosk: navy and cream boards with a serving hatch
  { place: "control-room", art: "info-kiosk", w: 3.3, h: 3.3, d: 2.7, roofRise: 1.0, trim: "#f1ead8" },
  // the market stalls
  { place: "pet-food", art: "stall-snack", kind: "stall", w: 4.7, h: 3.13, d: 1.9, roofRise: 0, trim: "#3f8f5a" },
  { place: "pet-stage", art: "stall-stage", kind: "stall", w: 5.1, h: 3.4, d: 2.0, roofRise: 0, trim: "#b3262b" },
  { place: "nugget-market", art: "stall-market", kind: "stall", w: 5.4, h: 3.6, d: 2.1, roofRise: 0, trim: "#e0b532" },
  { place: "money-town", art: "money-town-booth", kind: "stall", noRoof: true, w: 5.4, h: 3.6, d: 2.1, roofRise: 0, trim: "#1f5a3a" },
  // the park's gate: a pink-and-cream arch between two little towers, with iron gates folded back
  { place: "gate", art: "park-gate", kind: "arch", w: 13.5, h: 9, d: 0.4, roofRise: 0 },
];

export const paintedBuildingFor = (placeId: string): PaintedBuilding | undefined => PAINTED_BUILDINGS.find((b) => b.place === placeId);
