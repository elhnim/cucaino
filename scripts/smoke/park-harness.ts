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
  look: q.get("look") === "smooth" ? "smooth" : "diorama",
  // (the harness renders slowly on purpose: don't let the frame-rate safeguard degrade screenshots)
  adaptiveQuality: false,
  // ?hour=21 to see the glowing twilight, ?hour=12 for day
  hour: q.get("hour") ? () => Number(q.get("hour")) : undefined,
  onPlace: (p) => console.log("[park] place", p.id),
  onReady: () => console.log("[park] ready"),
  onError: (e) => console.log("[park] error", String(e)),
});
(window as unknown as Record<string, unknown>).__park = world;
(window as unknown as Record<string, unknown>).__THREE = THREE;

// rides, for poking in devtools: __rides.coaster(n) / __rides.golf()
import { buildQuizCoaster } from "../../lib/park/rides/quizCoaster";
import { buildMiniGolfInterior } from "../../lib/game3d/interiors/minigolf";
const coasterCtl: { resume?: (c: boolean) => void } = {};
(window as unknown as Record<string, unknown>).__rides = {
  ctl: coasterCtl,
  coaster: (n = 4) => world.enterRide(buildQuizCoaster(n, (i) => console.log("[ride] gate", i), () => console.log("[ride] finish"), coasterCtl)),
  golfCtl: {} as { skip?: () => void },
  golf: (from = 0) => world.enterRide((a) => buildMiniGolfInterior(a, (e) => console.log("[ride] golf", JSON.stringify(e)), (window as unknown as { __rides: { golfCtl: object } }).__rides.golfCtl, { from })),
};
