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
  | "personal"
  | "school_subject";

export type ThemeId =
  | "adventure"
  | "magical"
  | "galactic"
  | "ocean"
  | "dino"
  | "garden";

// ----------------------------------------------------------------------------
// New task rule/target/slot types (Step 6 redesign)
// ----------------------------------------------------------------------------

export type TaskRule = "strict" | "flexible";
export type TaskTarget = "none" | "time" | "reps" | "checklist";
export type TaskTimeSlot = "morning" | "afternoon" | "evening";

export interface Family {
  id: string;
  name: string;
  familyPointsBalance: number;
  parentDisplayName: string | null;
  parentAvatar: string;
  weatherCity: string | null;
  weatherLat: number | null;
  weatherLon: number | null;
  isFounder: boolean;
  parentTourSeen: boolean;
  parentGoals: string[];
  parentGoalsOther: string | null;
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
  // New gamification fields
  totalStarsEarned: number;
  totalCompletions: number;
  selectedAvatarEmoji: string | null;
  selectedFrame: "none" | "blue_glow" | "gold" | "fire" | "rainbow" | null;
  tourSeen: boolean;
  goals: string[];
  goalsOther: string | null;
  interests: string[];
  interestsOther: string | null;
  cashBalance: number;
}

export interface Task {
  id: string;
  familyId: string;
  kidIds: string[] | null; // null = all kids
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

  // New rule system
  rule: TaskRule;                     // default "strict"
  flexibleMinPerWeek: number | null;  // only for rule="flexible"; 0 = bonus/optional
  timeSlots: TaskTimeSlot[];          // for strict tasks (replaces timeBlock for new tasks)

  // Target
  target: TaskTarget;                 // default "none"
  targetDurationMinutes: number | null;   // for target="time"
  targetReps: number | null;              // for target="reps"
  targetRepLabel: string | null;          // e.g. "basketball throws"
  checklistItems: string[] | null;        // ordered list for target="checklist"

  // Music
  musicEnabled: boolean;

  // How many completions required per day (default 1)
  frequencyPerDay: number;

  // Description
  description: string | null;

  // school_subject only
  subject: string | null;
  customLabel: string | null;
  endTime: string | null;
  room: string | null;
  teacher: string | null;
  cashValueCents: number;
  requiresParentApproval: boolean;
}

export interface TaskCompletion {
  id: string;
  taskId: string;
  kidId: string;
  date: string; // YYYY-MM-DD
  completedAt: string; // ISO
  durationActualSeconds: number | null;
  pointsAwarded: number;
  cashAwardedCents: number;
  pendingParentApproval: boolean;
  parentApprovedAt: string | null;
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

// ----------------------------------------------------------------------------
// New reward types (Step 6 redesign)
// ----------------------------------------------------------------------------

export type RewardType = "privilege" | "treat" | "experience" | "prize";
export type RewardWho = "individual" | "team";
export type RewardRecurrence = "recurring" | "one_off";
export type RewardPeriodLimit = "day" | "week" | "month" | "none";

export interface Reward {
  id: string;
  familyId: string;
  kidId: string | null; // null = family reward
  name: string;
  description: string | null;
  icon: string;
  costPoints: number;
  type: "individual" | "family"; // kept for backward compat
  active: boolean;

  // New reward fields
  rewardType: RewardType;                    // default "treat"
  who: RewardWho;                            // default "individual"
  recurrence: RewardRecurrence;              // default "recurring"
  redemptionLimit: number | null;            // max redemptions per period (null = unlimited)
  redemptionPeriod: RewardPeriodLimit;       // period for the limit
  requiresApproval: boolean;                 // default true
  availableTo: string[];                     // array of kidIds; empty = all kids
  costCashCents: number;
}

export interface RewardRequest {
  id: string;
  rewardId: string;
  kidId: string;
  requestedAt: string;
  status: "pending" | "approved" | "denied" | "delivered";
  parentNote: string | null;
  paymentType: "stars" | "cash";
}

// ----------------------------------------------------------------------------
// History
// ----------------------------------------------------------------------------

export type HistoryEntry =
  | {
      kind: "task";
      date: string;           // YYYY-MM-DD
      taskName: string;
      taskIcon: string;
      pointsAwarded: number;
    }
  | {
      kind: "reward";
      date: string;           // YYYY-MM-DD (extracted from requested_at)
      rewardName: string;
      rewardIcon: string;
      pointsSpent: number;
    };

// ----------------------------------------------------------------------------
// Cash
// ----------------------------------------------------------------------------

export interface CashTransaction {
  id: string;
  kidId: string;
  amountCents: number;     // positive = credit, negative = debit
  description: string;
  type: "credit" | "debit";
  createdAt: string;
}

export interface PendingCompletion {
  id: string;
  kidId: string;
  kidName: string;
  kidAvatar: string;
  taskId: string;
  taskName: string;
  taskIcon: string;
  taskCategory: string;
  pointsAwarded: number;
  cashAwardedCents: number;
  completedAt: string;
  date: string;
}

// ----------------------------------------------------------------------------
// Wishlist
// ----------------------------------------------------------------------------

export interface WishlistItem {
  id: string;
  kidId: string;
  rewardId: string;
  addedAt: string; // ISO
  position: number; // 1-3
}

// ----------------------------------------------------------------------------
// Gamification — BadgeProgress
// ----------------------------------------------------------------------------

export type BadgeCategory =
  | "champion" | "athlete" | "musician" | "self_care" | "explorer" | "scholar"
  | "streak" | "star_collector" | "task_titan";

export type BadgeTier = "none" | "bronze" | "silver" | "gold";

export interface BadgeProgress {
  id: string;
  kidId: string;
  category: BadgeCategory;
  completionCount: number;
  currentTier: BadgeTier;
  bronzeEarnedAt: string | null;
  silverEarnedAt: string | null;
  goldEarnedAt: string | null;
}

export interface UnlockedBadge {
  category: BadgeCategory;
  tier: "bronze" | "silver" | "gold";
  tierName: string;
  icon: string;
  isCustom?: boolean;
  name?: string;
}

// ----------------------------------------------------------------------------
// Strikes
// ----------------------------------------------------------------------------

export interface Strike {
  id: string;
  kidId: string;
  issuedByParentName: string;
  reason: string;
  penaltyStars: number;        // 0 = warning only
  deductAt: string | null;     // ISO — null means "now", set = deferred
  deductedAt: string | null;   // ISO — set once deduction occurred
  clearedAt: string | null;    // ISO — set when parent clears
  createdAt: string;
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

// ----------------------------------------------------------------------------
// TimetableSlot
// ----------------------------------------------------------------------------

export type TimetableSection = "before_school" | "period" | "after_school";

export interface TimetableSlot {
  id: string;
  kidId: string;
  dayOfWeek: DayOfWeek;
  section: TimetableSection;
  slotIndex: number;
  subjectId: string;    // references Subject enum or school activity key
  isOverride: boolean;  // true = applies to a specific date only
  overrideDate: string | null;  // YYYY-MM-DD if isOverride=true
}

export type QuizCategory =
  | "maths"
  | "english"
  | "science"
  | "history"
  | "geography"
  | "sports"
  | "music"
  | "fun_facts"
  | "pop_culture"
  | "technology"
  | "food_culture"
  | "french"
  | "spanish"
  | "mandarin"
  // Legacy
  | "spelling"
  | "silly"
  | "custom";

export interface QuizBank {
  id: string;
  familyId: string | null; // null = built-in
  name: string;
  description: string | null;
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

// ----------------------------------------------------------------------------
// Quiz redesign types (Step 10)
// ----------------------------------------------------------------------------

export type QuizTheme =
  | "maths" | "english" | "science" | "history" | "geography"
  | "sports" | "music" | "french" | "spanish" | "mandarin"
  | "fun_facts" | "pop_culture" | "technology" | "food_culture";

export type QuizAgeBand = "5_6" | "7_8" | "9_10" | "11_12";
export type QuizDifficulty = "easy" | "medium" | "hard" | "genius";
export type QuizQuestionType = "multiple_choice" | "fill_in_blank";

export interface QuizSet {
  id: string;
  familyId: string | null;       // null = built-in
  name: string;
  description: string | null;
  emoji: string;
  themes: QuizTheme[];
  ageBandFilter: QuizAgeBand | null;   // null = all ages
  maxDifficulty: QuizDifficulty;
  questionTypeFilter: QuizQuestionType[] | null;  // null = all types
  questionsPerSession: number;
}

export interface QuizQuestion2 {
  id: string;
  setId: string | null;          // null = belongs to library only
  familyId: string | null;       // null = built-in
  type: QuizQuestionType;
  questionText: string;
  theme: QuizTheme;
  ageBand: QuizAgeBand;
  difficulty: QuizDifficulty;
  isBuiltin: boolean;
  // For multiple_choice:
  choices: { label: string; isCorrect: boolean }[] | null;
  // For fill_in_blank:
  sentenceTemplate: string | null;  // e.g. "The capital of France is ___"
  acceptedAnswers: string[] | null; // e.g. ["Paris", "paris"]
  explanation: string | null;
}

// ----------------------------------------------------------------------------
// Custom badges
// ----------------------------------------------------------------------------

export type CustomBadgeTrackType = "count" | "streak";

export interface CustomBadge {
  id: string;
  familyId: string;
  name: string;
  icon: string;
  description: string | null;
  taskId: string;
  taskName: string;
  taskIcon: string;
  trackType: CustomBadgeTrackType;
  bronzeThreshold: number;
  silverThreshold: number;
  goldThreshold: number;
  kidIds: string[] | null;
  active: boolean;
  createdAt: string;
}

export interface CustomBadgeProgress {
  id: string;
  kidId: string;
  badgeId: string;
  badge: CustomBadge;
  currentCount: number;
  currentTier: BadgeTier;
  lastCompletedDate: string | null;
  bronzeEarnedAt: string | null;
  silverEarnedAt: string | null;
  goldEarnedAt: string | null;
}
