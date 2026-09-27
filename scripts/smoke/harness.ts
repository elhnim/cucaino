// Standalone canvas smoke harness — boots the real three.js world with mock data,
// so it can be viewed in a browser without auth/DB. Build with esbuild (build.mjs).
import * as THREE from "three";
import { World3D } from "../../lib/game3d/engine";
import { buildPetHomeInterior } from "../../lib/game3d/interiors/pethome";
import { buildScheduleInterior } from "../../lib/game3d/interiors/schedule";
import { buildStoreInterior } from "../../lib/game3d/interiors/store";
import { buildFriendsInterior } from "../../lib/game3d/interiors/friends";
import { buildPlayHallInterior } from "../../lib/game3d/interiors/playhall";
import type { InitialGameData } from "../../lib/game3d/types";
import { ANIMALS, getAnimal } from "../../lib/game3d/registry/animals";

const mock: InitialGameData = {
  kid: { id: "smoke", name: "Mia", pointsBalance: 128, avatar: "🐱", themeId: "magical" },
  pet: {
    id: "p1", kidId: "smoke", name: "Coco", species: "kitten",
    hunger: 80, happiness: 80, energy: 80, cleanliness: 80, xp: 40,
    accessories: [], tricks: [], personalities: [], isSleeping: false,
    totalStarsSpent: 0, careStreak: 1, lastCareDate: null, lastGiftDate: null,
    lastTickAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  },
  tasksToday: { total: 5, done: 2 },
};

const world = new World3D(document.getElementById("app")!, {
  playerAccent: "#c026d3",
  playerAnimal: getAnimal(new URLSearchParams(location.search).get("animal") ?? "bunny"),
  petAnimal: getAnimal("cat"),
  themeId: "magical",
  quality: new URLSearchParams(location.search).get("q") === "low" ? "low" : "standard",
  petSpeciesColor: "#F0A060",
  onAttraction: (id) => console.log("[smoke] attraction:", id),
  onSurprise: (f) => console.log("[smoke] surprise:", f.kind, f.message),
  onArrive: (key) => console.log("[smoke] arrived:", key),
  onZone: (key) => console.log("[smoke] zone:", key),
  onSparkle: (n) => console.log("[smoke] sparkles:", n),
});

(window as unknown as { __CUCAINO_DEBUG__?: boolean; __world?: World3D }).__CUCAINO_DEBUG__ = true;
(window as unknown as { __world?: World3D }).__world = world;
// Exposed for manual poking in devtools — e.g. window.__world.enterInterior(window.__interiors.pethome)
(window as unknown as { __THREE?: typeof THREE }).__THREE = THREE;
(window as unknown as {
  __interiors?: {
    pethome: typeof buildPetHomeInterior;
    schedule: typeof buildScheduleInterior;
    store: typeof buildStoreInterior;
    friends: typeof buildFriendsInterior;
    playhall: typeof buildPlayHallInterior;
  };
}).__interiors = {
  pethome: buildPetHomeInterior,
  schedule: buildScheduleInterior,
  store: buildStoreInterior,
  friends: buildFriendsInterior,
  playhall: buildPlayHallInterior,
};

(window as unknown as { __animals?: typeof ANIMALS }).__animals = ANIMALS;
world.setBeacon("work", "❗");
world.setBeacon("daily-gift", "🎁");
world.setAttractionState("daily-gift", { ready: true });
world.setAttractionState("fireworks", { show: true });
world.setPetMood("🍽️");
