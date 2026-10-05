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

// rides, for poking in devtools: __rides.coaster(n) / __rides.golf() / __rides.kart()
import { buildQuizCoaster } from "../../lib/park/rides/quizCoaster";
import { buildMiniGolfInterior } from "../../lib/game3d/interiors/minigolf";
import { buildKartRaceInterior, type KartRaceControl } from "../../lib/game3d/interiors/karts";
const coasterCtl: { resume?: (c: boolean) => void } = {};
const kartCtl: KartRaceControl = { steer: 0, brake: false };
(window as unknown as Record<string, unknown>).__rides = {
  ctl: coasterCtl,
  coaster: (n = 4) => world.enterRide(buildQuizCoaster(n, (i) => console.log("[ride] gate", i), () => console.log("[ride] finish"), coasterCtl)),
  golfCtl: {} as { skip?: () => void },
  golf: (from = 0) => world.enterRide((a) => buildMiniGolfInterior(a, (e) => console.log("[ride] golf", JSON.stringify(e)), (window as unknown as { __rides: { golfCtl: object } }).__rides.golfCtl, { from })),
  kartCtl,
  // `autopilot: true` drives the human seat with ai.ts's own steering instead of kartCtl, so a
  // scripted run (no real kid tapping ◀/▶) still races round the circuit and reaches the finish —
  // KartRace.tsx never passes this; a real kid always drives their own kart.
  kart: (opts: { aiOnly?: boolean; autopilot?: boolean } = {}) =>
    world.enterRide((a) =>
      buildKartRaceInterior(
        a,
        (e) => console.log("[ride] kart", JSON.stringify(e)),
        kartCtl,
        {
          trackId: "cucaino-karts",
          laps: 3,
          kid: { kidId: "smoke-kid", name: "Smoke Kid", animal: "animal-fox", colour: "#ff5fa8" },
          ghosts: opts.aiOnly
            ? []
            : [
                { kidId: "ghost-1", name: "Mia", animal: "animal-bunny", colour: "#6fc3ff", trackId: "cucaino-karts", lapMs: 32000, samples: [] },
              ],
          autopilot: opts.autopilot,
        },
      ),
    ),
};

// Climb Everest! walks the REAL mountain, not a separate ride scene — poke it directly on __park:
//   __park.boardClimb()                board at Base Camp's trailhead
//   __park.setClimbProgress(0.5)        jump the (eased) target anywhere on the route, 0..1
//   __park.climbPhase                   "climbing" | "summit" | "flyDown" | null
//   __park.startClimbFlyDown()          (once at the summit) the helicopter swoop back down
//   __park.leaveClimb()                 leave early — a safe return to Base Camp
