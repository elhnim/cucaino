// No-auth smoke harness for Cucaino Park (lib/park). Bundle with:
//   npx esbuild scripts/smoke/park-harness.ts --bundle --format=iife --outfile=<dir>/park-smoke.js
// and serve <dir> alongside a copy of public/park-assets.
import * as THREE from "three";
import { ParkWorld } from "../../lib/park/engine/ParkWorld";

const q = new URLSearchParams(location.search);
const world = new ParkWorld(document.getElementById("app")!, {
  kidAnimal: (q.get("kid") ?? "animal-fox") as never,
  petAnimal: (q.get("pet") ?? "animal-cat") as never,
  themeId: q.get("theme") ?? "garden",
  quality: q.get("q") === "low" ? "low" : "standard",
  onPlace: (p) => console.log("[park] place", p.id),
  onReady: () => console.log("[park] ready"),
  onError: (e) => console.log("[park] error", String(e)),
});
(window as unknown as Record<string, unknown>).__park = world;
(window as unknown as Record<string, unknown>).__THREE = THREE;
