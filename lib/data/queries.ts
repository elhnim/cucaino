/**
 * Supabase queries — real persistence.
 *
 * All read functions are server-side (use the server Supabase client). RLS
 * scopes everything to the logged-in parent's family.
 *
 * The `pin_hash` column stores the plain 4-digit PIN for now. Hashing with
 * bcrypt is a follow-up (low priority — this is a single-family app where
 * the threat model is "stop my sibling guessing", not security).
 */

import { createClient } from "@/lib/supabase/server";
import type {
  Family,
  Kid,
  QuizBank,
  QuizCategory,
  QuizQuestion,
  Reward,
  RewardRequest,
  SchoolClass,
  SchoolItem,
  Task,
  TaskCompletion,
  ThemeId,
} from "@/lib/domain/types";

type DbKidRow = {
  id: string;
  family_id: string;
  name: string;
  age: number | null;
  avatar: string;
  theme_id: string;
  date_of_birth: string | null;
  pin_hash: string | null;
  points_balance: number;
  current_streak: number;
  longest_streak: number;
};

type DbTaskRow = {
  id: string;
  family_id: string;
  kid_id: string | null;
  name: string;
  category: string;
  icon: string;
  schedule_type: string;
  days_of_week: number[];
  time_block: string;
  start_time: string | null;
  duration_minutes: number | null;
  points: number;
  family_points_contribution: number;
  requires_timer: boolean;
  requires_completion: boolean;
  location: string | null;
  packing_list: string[] | null;
  default_bpm: number | null;
  default_time_signature: string | null;
  active: boolean;
  kid_can_add: boolean;
};

// ----- Mappers -----

function mapKid(row: DbKidRow): Kid {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    age: row.age ?? 0,
    avatar: row.avatar,
    themeId: row.theme_id as ThemeId,
    dateOfBirth: row.date_of_birth,
    pin: row.pin_hash,
    pointsBalance: row.points_balance,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
  };
}

function mapTask(row: DbTaskRow): Task {
  return {
    id: row.id,
    familyId: row.family_id,
    kidId: row.kid_id,
    name: row.name,
    category: row.category as Task["category"],
    icon: row.icon,
    scheduleType: row.schedule_type as Task["scheduleType"],
    daysOfWeek: row.days_of_week as Task["daysOfWeek"],
    timeBlock: row.time_block as Task["timeBlock"],
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    points: row.points,
    familyPointsContribution: row.family_points_contribution,
    requiresTimer: row.requires_timer,
    requiresCompletion: row.requires_completion,
    location: row.location,
    packingList: row.packing_list,
    defaultBpm: row.default_bpm,
    defaultTimeSignature: row.default_time_signature,
    active: row.active,
    kidCanAdd: row.kid_can_add ?? false,
  };
}

// ----- Public queries -----

export async function getFamily(): Promise<Family | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("families")
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    familyPointsBalance: data.family_points_balance,
  };
}

export async function listKids(): Promise<Kid[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kids")
    .select("*")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as DbKidRow[]).map(mapKid);
}

export async function getKid(id: string): Promise<Kid | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kids")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapKid(data as DbKidRow);
}

export async function listTasksForKid(kidId: string): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .or(`kid_id.is.null,kid_id.eq.${kidId}`)
    .eq("active", true);
  if (error || !data) return [];
  return (data as DbTaskRow[]).map(mapTask);
}

export async function listAllTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("active", true)
    .order("time_block", { ascending: true })
    .order("start_time", { ascending: true });
  if (error || !data) return [];
  return (data as DbTaskRow[]).map(mapTask);
}

export async function listCompletionsToday(kidId: string): Promise<TaskCompletion[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("task_completions")
    .select("*")
    .eq("kid_id", kidId)
    .eq("date", today);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    kidId: row.kid_id,
    date: row.date,
    completedAt: row.completed_at,
    durationActualSeconds: row.duration_actual_seconds,
    pointsAwarded: row.points_awarded,
  }));
}

export async function listSchoolItemsForDay(
  kidId: string,
  dayOfWeek: number,
): Promise<SchoolItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_items")
    .select("*")
    .eq("kid_id", kidId)
    .eq("active", true)
    .contains("days_of_week", [dayOfWeek]);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    kidId: row.kid_id,
    name: row.name,
    icon: row.icon,
    daysOfWeek: row.days_of_week as SchoolItem["daysOfWeek"],
    active: row.active,
  }));
}

export async function listAllSchoolItems(): Promise<SchoolItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_items")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    kidId: row.kid_id,
    name: row.name,
    icon: row.icon,
    daysOfWeek: row.days_of_week as SchoolItem["daysOfWeek"],
    active: row.active,
  }));
}

export async function listRewardsForKid(kidId: string): Promise<Reward[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rewards")
    .select("*")
    .or(`kid_id.is.null,kid_id.eq.${kidId}`)
    .eq("active", true);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    kidId: row.kid_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    costPoints: row.cost_points,
    type: row.type as Reward["type"],
    active: row.active,
  }));
}

export async function listPendingRequests(): Promise<RewardRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reward_requests")
    .select("*")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    rewardId: row.reward_id,
    kidId: row.kid_id,
    requestedAt: row.requested_at,
    status: row.status as RewardRequest["status"],
    parentNote: row.parent_note,
  }));
}

export async function listQuizBanks(): Promise<QuizBank[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_banks")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("name");
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    category: row.category as QuizCategory,
    minAge: row.min_age,
    maxAge: row.max_age,
    isBuiltin: row.is_builtin,
  }));
}

export async function getQuizBank(id: string): Promise<QuizBank | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_banks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    familyId: data.family_id,
    name: data.name,
    category: data.category as QuizCategory,
    minAge: data.min_age,
    maxAge: data.max_age,
    isBuiltin: data.is_builtin,
  };
}

export async function listQuizQuestions(bankId: string): Promise<QuizQuestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("bank_id", bankId)
    .order("id");
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    bankId: row.bank_id,
    prompt: row.prompt,
    choices: row.choices as { label: string; isCorrect: boolean }[],
    timeLimitSeconds: row.time_limit_seconds,
    explanation: row.explanation,
  }));
}

export async function listSchoolClasses(kidId: string): Promise<SchoolClass[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_classes")
    .select("*")
    .eq("kid_id", kidId)
    .order("day_of_week")
    .order("start_time");
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    kidId: row.kid_id,
    dayOfWeek: row.day_of_week as SchoolClass["dayOfWeek"],
    subject: row.subject as SchoolClass["subject"],
    customLabel: row.custom_label,
    startTime: row.start_time,
    endTime: row.end_time,
    room: row.room,
    teacher: row.teacher,
  }));
}

export type FeatureRequest = {
  id: string;
  title: string;
  description: string;
  category: "kid_view" | "parent_view" | "quiz" | "rewards" | "music" | "other";
  status: "new" | "considering" | "in_progress" | "shipped" | "wont_do";
  createdAt: string;
};

export async function listFeatureRequests(): Promise<FeatureRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as FeatureRequest["category"],
    status: row.status as FeatureRequest["status"],
    createdAt: row.created_at,
  }));
}

export async function getParentPinFromDb(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("families")
    .select("parent_pin")
    .maybeSingle();
  if (error || !data) return null;
  return data.parent_pin ?? null;
}

export async function listKidAddableTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("kid_can_add", true)
    .eq("active", true)
    .order("name");
  if (error || !data) return [];
  return (data as DbTaskRow[]).map(mapTask);
}
