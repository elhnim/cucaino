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
    { id: "1", name: "Brush teeth", icon: "🦷", points: 2, familyPoints: 0, category: "hygiene", cashValueCents: 0, requiresApproval: false, done: true, mechanic: "tap", timerMinutes: null, reps: null, repLabel: null, checklist: null, music: false, bpm: null, timeSignature: null, frequencyPerDay: 1, doneCount: 1 },
    { id: "2", name: "Pack school bag", icon: "🎒", points: 2, familyPoints: 0, category: "chore", cashValueCents: 0, requiresApproval: false, done: false, mechanic: "checklist", timerMinutes: null, reps: null, repLabel: null, checklist: ["Lunchbox", "Water bottle", "Homework", "Hat"], music: false, bpm: null, timeSignature: null, frequencyPerDay: 1, doneCount: 0 },
    { id: "3", name: "Reading", icon: "📚", points: 3, familyPoints: 0, category: "learning", cashValueCents: 0, requiresApproval: false, done: false, mechanic: "timer", timerMinutes: 10, reps: null, repLabel: null, checklist: null, music: false, bpm: null, timeSignature: null, frequencyPerDay: 1, doneCount: 0 },
    { id: "4", name: "Piano practice", icon: "🎹", points: 5, familyPoints: 0, category: "music", cashValueCents: 0, requiresApproval: false, done: false, mechanic: "timer", timerMinutes: 15, reps: null, repLabel: null, checklist: null, music: true, bpm: 90, timeSignature: "3/4", frequencyPerDay: 1, doneCount: 0 },
    { id: "5", name: "Basketball throws", icon: "🏀", points: 2, familyPoints: 0, category: "active", cashValueCents: 0, requiresApproval: false, done: false, mechanic: "reps", timerMinutes: null, reps: 20, repLabel: "throws", checklist: null, music: false, bpm: null, timeSignature: null, frequencyPerDay: 1, doneCount: 0 },
    { id: "6", name: "Drink water", icon: "💧", points: 1, familyPoints: 0, category: "health", cashValueCents: 0, requiresApproval: false, done: false, mechanic: "tap", timerMinutes: null, reps: null, repLabel: null, checklist: null, music: false, bpm: null, timeSignature: null, frequencyPerDay: 3, doneCount: 1 },
  ],
  startScene: new URLSearchParams(location.search).get("scene") ?? "world",
};

startGame(document.getElementById("app")!, mock);
