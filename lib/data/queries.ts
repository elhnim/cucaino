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

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/data/perf";
import { getTierFromCount } from "@/lib/domain/badge-config";
import type {
  BadgeCategory,
  BadgeTier,
  BadgeProgress,
  CashTransaction,
  CustomBadge,
  CustomBadgeProgress,
  CustomBadgeTrackType,
  Family,
  HistoryEntry,
  Kid,
  PendingCompletion,
  QuizBank,
  QuizCategory,
  QuizQuestion,
  QuizSet,
  Reward,
  RewardRequest,
  SchoolClass,
  SchoolItem,
  Task,
  TaskCompletion,
  ThemeId,
  WishlistItem,
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
  kid_ids: string[] | null;
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
    age: row.date_of_birth
      ? Math.floor((Date.now() - new Date(row.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : (row.age ?? 0),
    avatar: row.avatar,
    themeId: row.theme_id as ThemeId,
    dateOfBirth: row.date_of_birth,
    pin: row.pin_hash,
    pointsBalance: row.points_balance,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    totalStarsEarned: (row as any).total_stars_earned ?? 0,
    totalCompletions: (row as any).total_completions ?? 0,
    selectedAvatarEmoji: (row as any).selected_avatar_emoji ?? null,
    selectedFrame: (row as any).selected_frame ?? null,
    tourSeen: (row as any).tour_seen ?? false,
    goals: (row as any).goals ?? [],
    goalsOther: (row as any).goals_other ?? null,
    interests: (row as any).interests ?? [],
    interestsOther: (row as any).interests_other ?? null,
    cashBalance: (row as any).cash_balance ?? 0,
  };
}

export function mapTask(row: DbTaskRow): Task {
  return {
    id: row.id,
    familyId: row.family_id,
    kidIds: row.kid_ids,
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
    rule: (row as any).rule ?? "strict",
    flexibleMinPerWeek: (row as any).flexible_min_per_week ?? null,
    timeSlots: (row as any).time_slots ?? [],
    target: (row as any).target ?? "none",
    targetDurationMinutes: (row as any).target_duration_minutes ?? null,
    targetReps: (row as any).target_reps ?? null,
    targetRepLabel: (row as any).target_rep_label ?? null,
    checklistItems: (row as any).checklist_items ?? null,
    frequencyPerDay: (row as any).frequency_per_day ?? 1,
    musicEnabled: (row as any).music_enabled ?? false,
    description: (row as any).description ?? null,
    subject: (row as any).subject ?? null,
    customLabel: (row as any).custom_label ?? null,
    endTime: (row as any).end_time ?? null,
    room: (row as any).room ?? null,
    teacher: (row as any).teacher ?? null,
    cashValueCents: (row as any).cash_value_cents ?? 0,
    requiresParentApproval: (row as any).requires_parent_approval ?? false,
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
    parentDisplayName: (data as any).parent_display_name ?? null,
    parentAvatar: (data as any).parent_avatar ?? "🧙",
    weatherCity: (data as any).weather_city ?? null,
    weatherLat: (data as any).weather_lat ?? null,
    weatherLon: (data as any).weather_lon ?? null,
    isFounder: (data as any).is_founder ?? false,
    parentTourSeen: (data as any).parent_tour_seen ?? false,
    parentGoals: (data as any).parent_goals ?? [],
    parentGoalsOther: (data as any).parent_goals_other ?? null,
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

const _getKidRaw = cache(async (id: string): Promise<Kid | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kids")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapKid(data as DbKidRow);
});

export const getKid = timed("getKid", _getKidRaw);

export const listTasksForKid = timed("listTasksForKid", async (kidId: string): Promise<Task[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .or(`kid_ids.is.null,kid_ids.cs.{${kidId}}`)
    .eq("active", true);
  if (error || !data) return [];
  return (data as DbTaskRow[]).map(mapTask);
});

export async function getTask(id: string): Promise<Task | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapTask(data as DbTaskRow);
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

export const listCompletionsToday = timed("listCompletionsToday", async (kidId: string): Promise<TaskCompletion[]> => {
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
    cashAwardedCents: row.cash_awarded_cents ?? 0,
    pendingParentApproval: row.pending_parent_approval ?? false,
    parentApprovedAt: row.parent_approved_at ?? null,
  }));
});

export async function listKidDailyAdditions(kidId: string, date: string): Promise<Task[]> {
  const supabase = await createClient();
  const { data: additions, error: addErr } = await supabase
    .from("kid_daily_task_additions")
    .select("task_id")
    .eq("kid_id", kidId)
    .eq("date", date);
  if (addErr || !additions || additions.length === 0) return [];

  const taskIds = additions.map((a) => a.task_id as string);
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .in("id", taskIds);
  if (error || !data) return [];
  return (data as DbTaskRow[]).map(mapTask);
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

export async function getReward(id: string): Promise<Reward | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rewards")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    familyId: data.family_id,
    kidId: data.kid_id,
    name: data.name,
    description: data.description,
    icon: data.icon,
    costPoints: data.cost_points,
    type: data.type as Reward["type"],
    active: data.active,
    rewardType: (data as any).reward_type ?? "treat",
    who: (data as any).who ?? "individual",
    recurrence: (data as any).recurrence ?? "recurring",
    redemptionLimit: (data as any).redemption_limit ?? null,
    redemptionPeriod: (data as any).redemption_period ?? "none",
    requiresApproval: (data as any).requires_approval ?? true,
    availableTo: (data as any).available_to ?? [],
    costCashCents: (data as any).cost_cash_cents ?? 0,
  };
}

export const listRewardsForKid = timed("listRewardsForKid", async (kidId: string): Promise<Reward[]> => {
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
    rewardType: (row as any).reward_type ?? "treat",
    who: (row as any).who ?? "individual",
    recurrence: (row as any).recurrence ?? "recurring",
    redemptionLimit: (row as any).redemption_limit ?? null,
    redemptionPeriod: (row as any).redemption_period ?? "none",
    requiresApproval: (row as any).requires_approval ?? true,
    availableTo: (row as any).available_to ?? [],
    costCashCents: (row as any).cost_cash_cents ?? 0,
  }));
});

export const listPendingRequests = timed("listPendingRequests", async (): Promise<RewardRequest[]> => {
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
    paymentType: ((row as any).payment_type ?? "stars") as "stars" | "cash",
  }));
});

export const listQuizBanks = timed("listQuizBanks", async (): Promise<QuizBank[]> => {
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
    description: (row as any).description ?? null,
    category: row.category as QuizCategory,
    minAge: row.min_age,
    maxAge: row.max_age,
    isBuiltin: row.is_builtin,
  }));
});

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
    description: (data as any).description ?? null,
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
  kidId: string | null;
  kidName: string | null;
  kidAvatar: string | null;
};

export async function listFeatureRequests(): Promise<FeatureRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .select("*, kids(name, avatar)")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as FeatureRequest["category"],
    status: row.status as FeatureRequest["status"],
    createdAt: row.created_at,
    kidId: (row as any).kid_id ?? null,
    kidName: (row as any).kids?.name ?? null,
    kidAvatar: (row as any).kids?.avatar ?? null,
  }));
}

export type QuizQuestion2 = {
  id: string;
  familyId: string | null;
  type: "mc" | "fill_blank";
  questionText: string;
  theme: string;
  ageBand: string;
  difficulty: string;
  isBuiltin: boolean;
  choices: { label: string; isCorrect: boolean }[] | null;
  sentenceTemplate: string | null;
  acceptedAnswers: string[] | null;
  explanation: string | null;
  tags: string[];
  createdAt: string;
};

// QuizSet is defined in lib/domain/types.ts — no local redefinition needed

export async function listQuizQuestions2(opts?: { theme?: string }): Promise<QuizQuestion2[]> {
  const supabase = await createClient();
  let q = supabase.from("quiz_questions2").select("*").order("created_at", { ascending: false });
  if (opts?.theme) q = q.eq("theme", opts.theme);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    type: row.type as "mc" | "fill_blank",
    questionText: row.question_text,
    theme: row.theme,
    ageBand: row.age_band,
    difficulty: row.difficulty,
    isBuiltin: row.is_builtin,
    choices: row.choices as { label: string; isCorrect: boolean }[] | null,
    sentenceTemplate: row.sentence_template,
    acceptedAnswers: row.accepted_answers,
    explanation: row.explanation,
    tags: (row.tags as string[]) ?? [],
    createdAt: row.created_at,
  }));
}

export async function getQuizQuestion2(id: string): Promise<QuizQuestion2 | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("quiz_questions2").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    familyId: data.family_id,
    type: data.type as "mc" | "fill_blank",
    questionText: data.question_text,
    theme: data.theme,
    ageBand: data.age_band,
    difficulty: data.difficulty,
    isBuiltin: data.is_builtin,
    choices: data.choices as { label: string; isCorrect: boolean }[] | null,
    sentenceTemplate: data.sentence_template,
    acceptedAnswers: data.accepted_answers,
    explanation: data.explanation,
    tags: (data.tags as string[]) ?? [],
    createdAt: data.created_at,
  };
}

export async function listQuizSets(): Promise<QuizSet[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("quiz_sets").select("*").order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    description: (row as any).description ?? null,
    emoji: row.emoji,
    themes: row.themes,
    ageBandFilter: row.age_band_filter,
    maxDifficulty: row.max_difficulty,
    questionTypeFilter: (row as any).question_type_filter ?? null,
    questionsPerSession: row.questions_per_session,
  }));
}

export async function getQuizSet(id: string): Promise<QuizSet | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("quiz_sets").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    familyId: data.family_id,
    name: data.name,
    description: (data as any).description ?? null,
    emoji: data.emoji,
    themes: data.themes,
    ageBandFilter: data.age_band_filter,
    maxDifficulty: data.max_difficulty,
    questionTypeFilter: data.question_type_filter ?? null,
    questionsPerSession: data.questions_per_session,
  };
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

export async function listBadgeProgress(kidId: string): Promise<BadgeProgress[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("badge_progress")
    .select("*")
    .eq("kid_id", kidId);
  if (error || !data) return [];

  const KNOWN_CATEGORIES = new Set([
    "champion","athlete","musician","self_care","explorer","scholar",
    "streak","star_collector","task_titan",
  ]);

  return data
    .filter((row) => KNOWN_CATEGORIES.has(row.category))
    .map((row) => {
      const count = (row.completion_count as number) ?? 0;
      const category = row.category as BadgeCategory;
      return {
        id: row.id ?? `${row.kid_id}-${row.category}`,
        kidId: row.kid_id,
        category,
        completionCount: count,
        currentTier: getTierFromCount(category, count),
        bronzeEarnedAt: (row as any).bronze_earned_at ?? null,
        silverEarnedAt: (row as any).silver_earned_at ?? null,
        goldEarnedAt:   (row as any).gold_earned_at   ?? null,
      };
    });
}

export async function listKidAddableTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("rule", "flexible")
    .eq("active", true)
    .is("kid_ids", null)
    .order("name");
  if (error || !data) return [];
  return (data as DbTaskRow[]).map(mapTask);
}

/** Returns total points_awarded per kid for the current ISO week (Mon–Sun). */
export async function listWeeklyStarsByKid(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const daysSinceMon = (dow + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMon);
  const weekStart = monday.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("task_completions")
    .select("kid_id, points_awarded")
    .gte("date", weekStart);
  if (error || !data) return {};
  const totals: Record<string, number> = {};
  for (const row of data) {
    totals[row.kid_id] = (totals[row.kid_id] ?? 0) + (row.points_awarded ?? 0);
  }
  return totals;
}

export async function listWishlistItems(kidId: string): Promise<WishlistItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("*")
    .eq("kid_id", kidId)
    .order("position", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    kidId: row.kid_id,
    rewardId: row.reward_id,
    addedAt: row.added_at,
    position: row.position,
  }));
}

export const listKidHistory = timed(
  "listKidHistory",
  async (kidId: string, days: number): Promise<HistoryEntry[]> => {
    const supabase = await createClient();

    // Calculate the start date
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromDate = from.toISOString().slice(0, 10); // YYYY-MM-DD
    const fromDatetime = from.toISOString();           // full ISO for timestamp column

    const [{ data: completions, error: cErr }, { data: requests, error: rErr }] =
      await Promise.all([
        supabase
          .from("task_completions")
          .select("date, points_awarded, tasks(name, icon)")
          .eq("kid_id", kidId)
          .gte("date", fromDate)
          .order("date", { ascending: false }),
        supabase
          .from("reward_requests")
          .select("requested_at, rewards(name, icon, cost_points)")
          .eq("kid_id", kidId)
          .in("status", ["approved", "delivered"])
          .gte("requested_at", fromDatetime)
          .order("requested_at", { ascending: false }),
      ]);

    if (cErr || rErr) return [];

    const taskEntries: HistoryEntry[] = (completions ?? []).map((row: any) => ({
      kind: "task",
      date: row.date as string,
      taskName: (row.tasks as any)?.name ?? "Task",
      taskIcon: (row.tasks as any)?.icon ?? "✅",
      pointsAwarded: row.points_awarded ?? 0,
    }));

    const rewardEntries: HistoryEntry[] = (requests ?? []).map((row: any) => ({
      kind: "reward",
      date: (row.requested_at as string).slice(0, 10),
      rewardName: (row.rewards as any)?.name ?? "Reward",
      rewardIcon: (row.rewards as any)?.icon ?? "🎁",
      pointsSpent: (row.rewards as any)?.cost_points ?? 0,
    }));

    // Merge and sort newest first
    return [...taskEntries, ...rewardEntries].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  },
);

export const listCashTransactions = timed(
  "listCashTransactions",
  async (kidId: string, days: number): Promise<CashTransaction[]> => {
    const supabase = await createClient();
    const from = new Date();
    from.setDate(from.getDate() - days);
    const { data, error } = await supabase
      .from("cash_transactions")
      .select("*")
      .eq("kid_id", kidId)
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      kidId: row.kid_id,
      amountCents: row.amount_cents,
      description: row.description,
      type: row.type as "credit" | "debit",
      createdAt: row.created_at,
    }));
  },
);

export const listPendingCompletions = timed(
  "listPendingCompletions",
  async (): Promise<PendingCompletion[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("task_completions")
      .select(
        "id, kid_id, task_id, points_awarded, cash_awarded_cents, completed_at, date, kids(name, avatar), tasks(name, icon, category)",
      )
      .eq("pending_parent_approval", true)
      .order("completed_at", { ascending: false });
    if (error || !data) return [];
    return (data as any[]).map((row) => ({
      id: row.id,
      kidId: row.kid_id,
      kidName: row.kids?.name ?? "Kid",
      kidAvatar: row.kids?.avatar ?? "🦊",
      taskId: row.task_id,
      taskName: row.tasks?.name ?? "Task",
      taskIcon: row.tasks?.icon ?? "✅",
      taskCategory: row.tasks?.category ?? "chore",
      pointsAwarded: row.points_awarded ?? 0,
      cashAwardedCents: row.cash_awarded_cents ?? 0,
      completedAt: row.completed_at,
      date: row.date,
    }));
  },
);

export const listCustomBadges = timed(
  "listCustomBadges",
  async (): Promise<CustomBadge[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("custom_badges")
      .select("*, tasks(name, icon)")
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as any[]).map((row) => ({
      id: row.id,
      familyId: row.family_id,
      name: row.name,
      icon: row.icon,
      description: row.description ?? null,
      taskId: row.task_id,
      taskName: row.tasks?.name ?? "Task",
      taskIcon: row.tasks?.icon ?? "✅",
      trackType: row.track_type as CustomBadgeTrackType,
      bronzeThreshold: row.bronze_threshold,
      silverThreshold: row.silver_threshold,
      goldThreshold: row.gold_threshold,
      kidIds: row.kid_ids ?? null,
      active: row.active,
      createdAt: row.created_at,
    }));
  },
);

export const listCustomBadgeProgress = timed(
  "listCustomBadgeProgress",
  async (kidId: string): Promise<CustomBadgeProgress[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("custom_badge_progress")
      .select("*, custom_badges(*, tasks(name, icon))")
      .eq("kid_id", kidId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as any[]).map((row) => {
      const b = row.custom_badges;
      const badge: CustomBadge = {
        id: b.id,
        familyId: b.family_id,
        name: b.name,
        icon: b.icon,
        description: b.description ?? null,
        taskId: b.task_id,
        taskName: b.tasks?.name ?? "Task",
        taskIcon: b.tasks?.icon ?? "✅",
        trackType: b.track_type as CustomBadgeTrackType,
        bronzeThreshold: b.bronze_threshold,
        silverThreshold: b.silver_threshold,
        goldThreshold: b.gold_threshold,
        kidIds: b.kid_ids ?? null,
        active: b.active,
        createdAt: b.created_at,
      };
      const count = row.current_count ?? 0;
      const tier = count >= badge.goldThreshold ? "gold"
                 : count >= badge.silverThreshold ? "silver"
                 : count >= badge.bronzeThreshold ? "bronze"
                 : "none";
      return {
        id: row.id,
        kidId: row.kid_id,
        badgeId: row.badge_id,
        badge,
        currentCount: count,
        currentTier: tier as BadgeTier,
        lastCompletedDate: row.last_completed_date ?? null,
        bronzeEarnedAt: row.bronze_earned_at ?? null,
        silverEarnedAt: row.silver_earned_at ?? null,
        goldEarnedAt: row.gold_earned_at ?? null,
      };
    });
  },
);

export const listTasksForFamily = timed(
  "listTasksForFamily",
  async (): Promise<Task[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error || !data) return [];
    return (data as DbTaskRow[]).map(mapTask);
  },
);
