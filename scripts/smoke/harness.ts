// Standalone canvas smoke harness — boots the real three.js world with mock data,
// so it can be viewed in a browser without auth/DB. Build with esbuild (build.mjs).
import { World3D } from "../../lib/game3d/engine";
import type { InitialGameData } from "../../lib/game3d/types";

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
  petSpeciesColor: "#F0A060",
  onArrive: (key) => console.log("[smoke] arrived:", key),
  onSparkle: (n) => console.log("[smoke] sparkles:", n),
});

(window as unknown as { __CUCAINO_DEBUG__?: boolean; __world?: World3D }).__CUCAINO_DEBUG__ = true;
(window as unknown as { __world?: World3D }).__world = world;
