/**
 * The ONLY I/O seam between the 3D world and the app. The world never touches
 * Supabase directly; it calls these wrappers, which delegate to the existing
 * server actions used by the rest of the kid app.
 */
import { feedPet, playWithPet, cuddlePet, washPet } from "@/lib/actions/pet";
import type { Pet } from "@/lib/pet/logic";

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
};
