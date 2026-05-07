/**
 * Domain types — shared across UI and (future) Supabase persistence.
 *
 * These mirror the Postgres schema in supabase/migrations/. When we wire
 * Supabase, the auto-generated types will replace these (or be aliased).
 * Until then, the stub data layer (lib/data/stub.ts) returns these shapes.
 */

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Mon, 7=Sun

export type ScheduleType = "daily" | "weekdays" | "weekends" | "specific_days";

export type TimeBlock =
  | "before_school"
  | "morning"
  | "afternoon"
  | "after_school"
  | "evening"
  | "anytime";

export type TaskCategory =
  | "chore"
  | "exercise"
  | "music"
  | "activity"
  | "personal";

export type ThemeId =
  | "adventure"
  | "magical"
  | "galactic"
  | "ocean"
  | "dino"
  | "garden";

export interface Family {
  id: string;
  name: string;
  familyPointsBalance: number;
}

export interface Kid {
  id: string;
  familyId: string;
  name: string;
  age: number;
  avatar: string; // emoji for now; later a media id
  themeId: ThemeId;
  /** ISO date YYYY-MM-DD. Drives birthday celebrations + age. */
  dateOfBirth: string | null;
  /** 4-digit PIN; null = no PIN set. Plain text in stub mode; bcrypt-hashed once Supabase is wired. */
  pin: string | null;
  pointsBalance: number;
  currentStreak: number;
  longestStreak: number;
}

export interface Task {
  id: string;
  familyId: string;
  kidId: string | null; // null = both kids
  name: string;
  category: TaskCategory;
  icon: string;
  scheduleType: ScheduleType;
  daysOfWeek: DayOfWeek[];
  timeBlock: TimeBlock;
  startTime: string | null; // "HH:MM"
  durationMinutes: number | null;
  points: number;
  familyPointsContribution: number;
  requiresTimer: boolean;
  requiresCompletion: boolean; // false = info-only (e.g., a reminder activity)
  location: string | null;
  packingList: string[] | null;
  defaultBpm: number | null;
  defaultTimeSignature: string | null;
  active: boolean;
  kidCanAdd: boolean;
}

export interface TaskCompletion {
  id: string;
  taskId: string;
  kidId: string;
  date: string; // YYYY-MM-DD
  completedAt: string; // ISO
  durationActualSeconds: number | null;
  pointsAwarded: number;
}

export interface SchoolItem {
  id: string;
  familyId: string;
  kidId: string;
  name: string;
  icon: string;
  daysOfWeek: DayOfWeek[];
  active: boolean;
}

export interface Reward {
  id: string;
  familyId: string;
  kidId: string | null; // null = family reward
  name: string;
  description: string | null;
  icon: string;
  costPoints: number;
  type: "individual" | "family";
  active: boolean;
}

export interface RewardRequest {
  id: string;
  rewardId: string;
  kidId: string;
  requestedAt: string;
  status: "pending" | "approved" | "denied" | "delivered";
  parentNote: string | null;
}

export type Subject =
  | "math"
  | "english"
  | "science"
  | "history"
  | "geography"
  | "art"
  | "pe"
  | "music"
  | "library"
  | "computing"
  | "language"
  | "religion"
  | "lunch"
  | "recess"
  | "other";

/** A single class period in a kid's school timetable. */
export interface SchoolClass {
  id: string;
  kidId: string;
  dayOfWeek: DayOfWeek; // 1..5 typically (Mon..Fri)
  subject: Subject;
  /** Optional free-text label, e.g. "Maths with Mr Brown" overrides default subject label */
  customLabel: string | null;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  room: string | null;
  teacher: string | null;
}

export type QuizCategory =
  | "maths"
  | "spelling"
  | "geography"
  | "science"
  | "silly"
  | "custom";

export interface QuizBank {
  id: string;
  familyId: string | null; // null = built-in
  name: string;
  category: QuizCategory;
  minAge: number;
  maxAge: number;
  isBuiltin: boolean;
}

export interface QuizQuestion {
  id: string;
  bankId: string;
  prompt: string;
  choices: { label: string; isCorrect: boolean }[];
  timeLimitSeconds: number;
  explanation: string | null;
}
