// Standalone canvas smoke harness — boots the real Phaser scenes with mock data,
// so the world + pet can be viewed in a browser without auth/DB. Build with esbuild.
import { startGame } from "../../lib/game/start";
import type { InitialGameData } from "../../lib/game/types";

const mock: InitialGameData = {
  kid: { id: "smoke", name: "Mia", pointsBalance: 128, avatar: "🐱", themeId: "magical" },
  // a minimal pet-shaped object is enough for Phase-0 visuals
  pet: { name: "Coco", species: "cat", happiness: 80 } as unknown as InitialGameData["pet"],
  tasksToday: { total: 5, done: 3 },
  startScene: new URLSearchParams(location.search).get("scene") ?? "world",
};

startGame(document.getElementById("app")!, mock);
