"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStory } from "@/lib/stories/registry";
import { LIBRARY_COURSE_ID, LIBRARY_PASS_PCT } from "@/lib/stories/types";

export interface StoryProgress {
  storyId: string;
  bestScore: number;
  total: number;
  starsAwarded: number;
  completedAt: string | null;
}

export async function getStoryProgress(kidId: string): Promise<StoryProgress[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("course_progress")
    .select("lesson_id, best_score, total, stars_awarded, completed_at")
    .eq("kid_id", kidId)
    .eq("course_id", LIBRARY_COURSE_ID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    storyId: r.lesson_id,
    bestScore: r.best_score,
    total: r.total,
    starsAwarded: r.stars_awarded,
    completedAt: r.completed_at,
  }));
}

export type CompleteStoryResult =
  | { ok: true; passed: boolean; starsAwarded: number; total: number }
  | { ok: false; error: string };

export async function completeStory(kidId: string, storyId: string, score: number): Promise<CompleteStoryResult> {
  const story = getStory(storyId);
  if (!story) return { ok: false, error: "Story not found" };

  const total = story.quiz.length;
  const safeScore = Math.max(0, Math.min(score, total));
  const passed = total > 0 && safeScore / total >= LIBRARY_PASS_PCT;

  const supabase = await createClient();
  const { data: kid } = await supabase.from("kids").select("family_id").eq("id", kidId).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familyId = (kid as any)?.family_id;
  if (!familyId) return { ok: false, error: "Family not found" };

  const { data: existing } = await supabase
    .from("course_progress")
    .select("best_score, stars_awarded")
    .eq("kid_id", kidId)
    .eq("course_id", LIBRARY_COURSE_ID)
    .eq("lesson_id", storyId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevBest = (existing as any)?.best_score ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevStars = (existing as any)?.stars_awarded ?? 0;
  const bestScore = Math.max(prevBest, safeScore);
  const starsAwarded = passed && prevStars === 0 ? story.starReward : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = {
    family_id: familyId,
    kid_id: kidId,
    course_id: LIBRARY_COURSE_ID,
    lesson_id: storyId,
    best_score: bestScore,
    total,
    stars_awarded: prevStars + starsAwarded,
    updated_at: new Date().toISOString(),
  };
  if (passed) row.completed_at = new Date().toISOString();

  const { error } = await supabase.from("course_progress").upsert(row, { onConflict: "kid_id,course_id,lesson_id" });
  if (error) return { ok: false, error: error.message };

  if (starsAwarded > 0) {
    await supabase.rpc("increment_kid_points", { p_kid_id: kidId, p_amount: starsAwarded });
  }

  revalidatePath("/play/library");
  return { ok: true, passed, starsAwarded, total };
}
