/**
 * The ONLY I/O seam between the canvas and the app. Scenes never touch Supabase;
 * they call these wrappers, which delegate to the existing server actions. Initial
 * reads are passed in as props from the server route (see InitialGameData); this
 * bridge handles mutations + refreshes.
 */
import { feedPet, playWithPet, cuddlePet, washPet, toggleSleep } from "@/lib/actions/pet";
import { completeTask, uncompleteTask } from "@/lib/actions/completions";
import type { Pet } from "@/lib/pet/logic";
import type { WorldTask } from "../types";

export interface PetMutationResult {
  ok: boolean;
  pet?: Pet;
  pointsBalance?: number;
  error?: string;
}

export const bridge = {
  feed: (kidId: string, foodId: string) => feedPet(kidId, foodId) as Promise<PetMutationResult>,
  play: (kidId: string, score: number) => playWithPet(kidId, score) as Promise<PetMutationResult>,
  cuddle: (kidId: string) => cuddlePet(kidId) as Promise<PetMutationResult>,
  wash: (kidId: string) => washPet(kidId) as Promise<PetMutationResult>,
  sleep: (kidId: string) => toggleSleep(kidId) as Promise<PetMutationResult>,

  completeTask: (kidId: string, t: WorldTask) =>
    completeTask(t.id, kidId, t.points, t.familyPoints, t.category, Math.max(1, t.frequencyPerDay), t.cashValueCents, t.requiresApproval),
  uncompleteTask: (kidId: string, t: WorldTask) => uncompleteTask(t.id, kidId),
};
