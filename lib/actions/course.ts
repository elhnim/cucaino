"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCourse } from "@/lib/courses/registry";

export interface LessonProgress {
  lessonId: string;
  bestScore: number;
  total: number;
  starsAwarded: number;
  completedAt: string | null;
}

export async function getCourseProgress(kidId: string, courseId: string): Promise<LessonProgress[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("course_progress")
    .select("lesson_id, best_score, total, stars_awarded, completed_at")
    .eq("kid_id", kidId)
    .eq("course_id", courseId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    lessonId: r.lesson_id,
    bestScore: r.best_score,
    total: r.total,
    starsAwarded: r.stars_awarded,
    completedAt: r.completed_at,
  }));
}

export type CompleteLessonResult =
  | { ok: true; passed: boolean; starsAwarded: number; bestScore: number; total: number }
  | { ok: false; error: string };

export async function completeLesson(
  kidId: string,
  courseId: string,
  lessonId: string,
  score: number,
): Promise<CompleteLessonResult> {
  const course = getCourse(courseId);
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  if (!course || !lesson) return { ok: false, error: "Lesson not found" };

  const total = lesson.quiz.length;
  const safeScore = Math.max(0, Math.min(score, total));
  const passed = total > 0 && safeScore / total >= course.passPct;

  const supabase = await createClient();
  const { data: kid } = await supabase.from("kids").select("family_id").eq("id", kidId).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familyId = (kid as any)?.family_id;
  if (!familyId) return { ok: false, error: "Family not found" };

  const { data: existing } = await supabase
    .from("course_progress")
    .select("best_score, stars_awarded")
    .eq("kid_id", kidId)
    .eq("course_id", courseId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevBest = (existing as any)?.best_score ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevStars = (existing as any)?.stars_awarded ?? 0;
  const bestScore = Math.max(prevBest, safeScore);

  // Award stars only the first time the lesson is passed.
  const starsAwarded = passed && prevStars === 0 ? lesson.starReward : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = {
    family_id: familyId,
    kid_id: kidId,
    course_id: courseId,
    lesson_id: lessonId,
    best_score: bestScore,
    total,
    stars_awarded: prevStars + starsAwarded,
    updated_at: new Date().toISOString(),
  };
  if (passed) row.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from("course_progress")
    .upsert(row, { onConflict: "kid_id,course_id,lesson_id" });
  if (error) return { ok: false, error: error.message };

  if (starsAwarded > 0) {
    await supabase.rpc("increment_kid_points", { p_kid_id: kidId, p_amount: starsAwarded });
  }

  revalidatePath(`/play/course/${courseId}`);
  return { ok: true, passed, starsAwarded, bestScore, total };
}
