import type { Pet } from "@/lib/pet/logic";
import type { ThemeId } from "@/lib/domain/types";

/** Snapshot handed from the server route into the 3D world so it opens instantly. */
export interface InitialGameData {
  kid: {
    id: string;
    name: string;
    pointsBalance: number;
    avatar: string;
    themeId: ThemeId;
  };
  pet: Pet | null;
  tasksToday: { total: number; done: number };
}

/** One of the five walk-up landmarks around the village. */
export type LandmarkKey = "work" | "shop" | "friends" | "playground" | "pet";

export interface LandmarkDef {
  key: LandmarkKey;
  label: string;
  emoji: string;
  angleDeg: number;
}

/** Every landmark now opens a real 3D interior room (lib/game3d/interiors/) instead of navigating away. */
export const LANDMARKS: LandmarkDef[] = [
  { key: "work", label: "Schedule", emoji: "📋", angleDeg: -90 },
  { key: "shop", label: "Store", emoji: "🏪", angleDeg: -18 },
  { key: "friends", label: "Friends", emoji: "💌", angleDeg: 54 },
  { key: "playground", label: "Play", emoji: "🎪", angleDeg: 126 },
  { key: "pet", label: "Pet Home", emoji: "🐾", angleDeg: 198 },
];
