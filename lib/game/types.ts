import type { Pet } from "@/lib/pet/logic";

/** Snapshot handed from the server route into the canvas so the world opens instantly. */
export interface InitialGameData {
  kid: {
    id: string;
    name: string;
    pointsBalance: number;
    avatar: string;
    themeId: string;
  };
  pet: Pet | null;
  tasksToday: { total: number; done: number };
  /** which scene to boot into (from the URL), e.g. "world" | "pet" */
  startScene: string;
}

/** Registry key under which InitialGameData lives on the Phaser.Game. */
export const REGISTRY_DATA = "cucaino:data";
