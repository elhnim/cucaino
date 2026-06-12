import type { Pet } from "@/lib/pet/logic";

/** How a task is completed — mirrors the web TodoTaskCard mechanics. */
export type TaskMechanic = "tap" | "checklist" | "reps" | "timer";

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

  /** which interaction the card opens when tapped */
  mechanic: TaskMechanic;
  /** target="time" / requiresTimer — minutes to count down */
  timerMinutes: number | null;
  /** target="reps" */
  reps: number | null;
  repLabel: string | null;
  /** target="checklist" — ordered sub-steps */
  checklist: string[] | null;
  /** music practice: show a metronome alongside the timer */
  music: boolean;
  bpm: number | null;
  timeSignature: string | null;
  /** completions needed per day (>1 = tap several times) */
  frequencyPerDay: number;
  /** completions already recorded today (for frequency tasks) */
  doneCount: number;
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
