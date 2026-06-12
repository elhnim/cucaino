import type { Pet } from "@/lib/pet/logic";

/** One of today's completable tasks, ready for the My Day (Work) scene. */
export interface WorldTask {
  id: string;
  name: string;
  icon: string;
  points: number;
  familyPoints: number;
  category: string;
  cashValueCents: number;
  requiresApproval: boolean;
  done: boolean;
}

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
  tasks: WorldTask[];
  /** which scene to boot into (from the URL), e.g. "world" | "pet" */
  startScene: string;
}

/** Registry key under which InitialGameData lives on the Phaser.Game. */
export const REGISTRY_DATA = "cucaino:data";
