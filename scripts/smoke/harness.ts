// Standalone canvas smoke harness — boots the real Phaser scenes with mock data,
// so the world + pet can be viewed in a browser without auth/DB. Build with esbuild.
import { startGame } from "../../lib/game/start";
import type { InitialGameData } from "../../lib/game/types";

const mock: InitialGameData = {
  kid: { id: "smoke", name: "Mia", pointsBalance: 128, avatar: "🐱", themeId: "magical" },
  // a minimal pet-shaped object is enough for Phase-0 visuals
  pet: { name: "Coco", species: "cat", happiness: 80 } as unknown as InitialGameData["pet"],
  tasksToday: { total: 5, done: 2 },
  tasks: [
    { id: "1", name: "Brush teeth", icon: "🦷", points: 2, familyPoints: 0, category: "hygiene", cashValueCents: 0, requiresApproval: false, done: true },
    { id: "2", name: "Make bed", icon: "🛏️", points: 2, familyPoints: 0, category: "chore", cashValueCents: 0, requiresApproval: false, done: true },
    { id: "3", name: "Reading", icon: "📚", points: 3, familyPoints: 0, category: "learning", cashValueCents: 0, requiresApproval: false, done: false },
    { id: "4", name: "Piano", icon: "🎹", points: 5, familyPoints: 0, category: "music", cashValueCents: 0, requiresApproval: false, done: false },
    { id: "5", name: "Tidy toys", icon: "🧺", points: 2, familyPoints: 0, category: "chore", cashValueCents: 0, requiresApproval: false, done: false },
    { id: "6", name: "Eat veggies", icon: "🥗", points: 3, familyPoints: 0, category: "health", cashValueCents: 0, requiresApproval: false, done: false },
  ],
  startScene: new URLSearchParams(location.search).get("scene") ?? "world",
};

startGame(document.getElementById("app")!, mock);
