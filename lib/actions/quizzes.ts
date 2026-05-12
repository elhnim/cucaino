"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export interface QuestionFormData {
  type: "mc" | "fill_blank";
  questionText: string;
  theme: string;
  ageBand: string;
  difficulty: string;
  explanation: string;
  // MC
  choices: { label: string; isCorrect: boolean }[];
  // Fill in the blank
  sentenceTemplate: string;
  acceptedAnswers: string[];
}

export interface QuizSetFormData {
  name: string;
  description: string | null;
  emoji: string;
  themes: string[];
  ageBandFilter: string | null;
  maxDifficulty: string;
  questionsPerSession: number;
}

export async function createQuestion(data: QuestionFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam } = await supabase.from("families").select("id").maybeSingle();
  if (!fam) return { ok: false, error: "Family not found" };

  const { data: row, error } = await supabase.from("quiz_questions2").insert({
    family_id: fam.id,
    type: data.type,
    question_text: data.questionText,
    theme: data.theme,
    age_band: data.ageBand,
    difficulty: data.difficulty,
    is_builtin: false,
    choices: data.type === "mc" ? data.choices : null,
    sentence_template: data.type === "fill_blank" ? data.sentenceTemplate : null,
    accepted_answers: data.type === "fill_blank" ? data.acceptedAnswers : null,
    explanation: data.explanation || null,
  }).select("id").single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/quizzes");
  return { ok: true, id: row.id };
}

export async function updateQuestion(id: string, data: QuestionFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quiz_questions2").update({
    type: data.type,
    question_text: data.questionText,
    theme: data.theme,
    age_band: data.ageBand,
    difficulty: data.difficulty,
    choices: data.type === "mc" ? data.choices : null,
    sentence_template: data.type === "fill_blank" ? data.sentenceTemplate : null,
    accepted_answers: data.type === "fill_blank" ? data.acceptedAnswers : null,
    explanation: data.explanation || null,
  }).eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/quizzes");
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quiz_questions2").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/quizzes");
  return { ok: true };
}

export async function createQuizSet(data: QuizSetFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam } = await supabase.from("families").select("id").maybeSingle();
  if (!fam) return { ok: false, error: "Family not found" };

  const { data: row, error } = await supabase.from("quiz_sets").insert({
    family_id: fam.id,
    name: data.name,
    description: data.description,
    emoji: data.emoji,
    themes: data.themes,
    age_band_filter: data.ageBandFilter,
    max_difficulty: data.maxDifficulty,
    questions_per_session: data.questionsPerSession,
  }).select("id").single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/quizzes");
  return { ok: true, id: row.id };
}

export async function updateQuizSet(id: string, data: QuizSetFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quiz_sets").update({
    name: data.name,
    description: data.description,
    emoji: data.emoji,
    themes: data.themes,
    age_band_filter: data.ageBandFilter,
    max_difficulty: data.maxDifficulty,
    questions_per_session: data.questionsPerSession,
  }).eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/quizzes");
  return { ok: true };
}

export async function deleteQuizSet(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quiz_sets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/quizzes");
  return { ok: true };
}
