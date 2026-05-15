# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full first-run onboarding flow — goals, interests (kids), welcome screen, and guided tour — for both parents and kids.

**Architecture:** Two client wrapper components (`ParentOnboardingWrapper`, `KidOnboardingWrapper`) are inserted into the existing parent and kid layouts. Each wrapper owns a `phase` state machine (`goals → welcome → touring → done` for parents; `goals → interests → welcome → touring → done` for kids) and renders the appropriate full-screen overlay. A shared `TourProvider` context handles navigation across tour stops. All selections and completion flags are persisted to Supabase.

**Tech Stack:** Next.js App Router · React 19 · TypeScript · Tailwind CSS · Supabase

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/0017_onboarding_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0017_onboarding_fields.sql
alter table public.families
  add column if not exists parent_tour_seen boolean not null default false,
  add column if not exists parent_goals text[] not null default '{}',
  add column if not exists parent_goals_other text;

alter table public.kids
  add column if not exists tour_seen boolean not null default false,
  add column if not exists goals text[] not null default '{}',
  add column if not exists goals_other text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists interests_other text;
```

- [ ] **Step 2: Apply the migration**

Run via Supabase MCP:
```
mcp__supabase__apply_migration — name: "0017_onboarding_fields", query: <contents above>
```

Or via CLI: `supabase db push`

Expected: no errors, migration listed in `supabase migration list`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_onboarding_fields.sql
git commit -m "feat: add onboarding fields to families and kids tables"
```

---

### Task 2: Domain types + query updates

**Files:**
- Modify: `lib/domain/types.ts`
- Modify: `lib/data/queries.ts`

- [ ] **Step 1: Add fields to `Family` interface in `lib/domain/types.ts`**

```ts
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
```

- [ ] **Step 2: Add fields to `Kid` interface in `lib/domain/types.ts`**

```ts
export interface Kid {
  id: string;
  familyId: string;
  name: string;
  age: number;
  avatar: string;
  themeId: ThemeId;
  dateOfBirth: string | null;
  pin: string | null;
  pointsBalance: number;
  currentStreak: number;
  longestStreak: number;
  totalStarsEarned: number;
  totalCompletions: number;
  selectedAvatarEmoji: string | null;
  selectedFrame: "none" | "blue_glow" | "gold" | "fire" | "rainbow" | null;
  tourSeen: boolean;
  goals: string[];
  goalsOther: string | null;
  interests: string[];
  interestsOther: string | null;
}
```

- [ ] **Step 3: Update `getFamily()` in `lib/data/queries.ts`**

Add three new fields to the return object (around line 150):

```ts
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
```

- [ ] **Step 4: Update `mapKid()` in `lib/data/queries.ts`**

Add four new fields to the return object (around line 77):

```ts
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
  };
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add lib/domain/types.ts lib/data/queries.ts
git commit -m "feat: add onboarding fields to Family and Kid types"
```

---

### Task 3: Server actions

**Files:**
- Create: `lib/actions/onboarding.ts`

- [ ] **Step 1: Write the server actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveParentGoals(
  goals: string[],
  goalsOther: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("families")
    .update({
      parent_goals: goals,
      parent_goals_other: goalsOther || null,
    })
    .eq("id", fam.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markParentTourSeen(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("families")
    .update({ parent_tour_seen: true })
    .eq("id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent", "layout");
  return { ok: true };
}

export async function saveKidGoals(
  kidId: string,
  goals: string[],
  goalsOther: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({
      goals,
      goals_other: goalsOther || null,
    })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveKidInterests(
  kidId: string,
  interests: string[],
  interestsOther: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({
      interests,
      interests_other: interestsOther || null,
    })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markKidTourSeen(kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({ tour_seen: true })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}`, "layout");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add lib/actions/onboarding.ts
git commit -m "feat: add onboarding server actions"
```

---

### Task 4: Tour config + context

**Files:**
- Create: `components/onboarding/tourSteps.ts`
- Create: `components/onboarding/TourContext.tsx`

- [ ] **Step 1: Write tour step config**

```ts
// components/onboarding/tourSteps.ts

export interface TourStep {
  route: string;
  label: string;
  description: string;
}

export const PARENT_TOUR_STEPS: TourStep[] = [
  {
    route: "/parent/overview",
    label: "📊 Overview",
    description:
      "Your daily snapshot — see which kids have completed tasks and the family star balance at a glance.",
  },
  {
    route: "/parent/tasks",
    label: "✅ Tasks",
    description:
      "Create and schedule tasks for your kids. Assign points, set a time block, and they appear on each kid's daily list.",
  },
  {
    route: "/parent/rewards",
    label: "🎁 Rewards",
    description:
      "Set up what kids can earn with their stars. You control what's available and whether it needs your approval.",
  },
  {
    route: "/parent/requests",
    label: "🔔 Requests",
    description:
      "When a kid claims a reward that needs approval, it shows up here. Approve or deny with one tap.",
  },
  {
    route: "/parent/settings",
    label: "⚙️ Settings",
    description:
      "Manage your kids' profiles, set a parent PIN, and customise your family's setup.",
  },
];

export function kidTourSteps(kidId: string): TourStep[] {
  return [
    {
      route: `/kid/${kidId}/home`,
      label: "🏠 Home",
      description:
        "See your stars, streaks, and today's progress. This is your command centre!",
    },
    {
      route: `/kid/${kidId}/todo`,
      label: "📋 Schedule",
      description:
        "Your daily tasks live here. Tick them off to earn stars — try to get them all done!",
    },
    {
      route: `/kid/${kidId}/rewards`,
      label: "🎁 Store",
      description:
        "Spend your stars on rewards. Save up for the big ones or grab something small today.",
    },
    {
      route: `/play?kid=${kidId}`,
      label: "🎮 Play",
      description:
        "Quiz time! Answer questions, beat your score, and earn bonus stars.",
    },
  ];
}
```

- [ ] **Step 2: Write TourContext**

```tsx
// components/onboarding/TourContext.tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { TourStep } from "./tourSteps";

interface TourContextValue {
  active: boolean;
  currentStep: number;
  totalSteps: number;
  currentStepData: TourStep | null;
  start: () => void;
  next: () => void;
  skip: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({
  steps,
  onComplete,
  children,
}: {
  steps: TourStep[];
  onComplete: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const start = useCallback(() => {
    setCurrentStep(0);
    setActive(true);
    router.push(steps[0].route);
  }, [steps, router]);

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      router.push(steps[nextStep].route);
    } else {
      setActive(false);
      onCompleteRef.current();
    }
  }, [currentStep, steps, router]);

  const skip = useCallback(() => {
    setActive(false);
    onCompleteRef.current();
  }, []);

  return (
    <TourContext.Provider
      value={{
        active,
        currentStep,
        totalSteps: steps.length,
        currentStepData: active ? steps[currentStep] : null,
        start,
        next,
        skip,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

/** Rendered inside TourProvider when the wrapper phase transitions to "touring".
 *  Calls start() on mount so the tour activates without the wrapper needing
 *  direct access to the context. */
export function TourAutoStart() {
  const { start } = useTour();
  useEffect(() => {
    start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add components/onboarding/tourSteps.ts components/onboarding/TourContext.tsx
git commit -m "feat: add tour step config and TourProvider context"
```

---

### Task 5: TourCard

**Files:**
- Create: `components/onboarding/TourCard.tsx`

- [ ] **Step 1: Write TourCard**

```tsx
// components/onboarding/TourCard.tsx
"use client";

import { useTour } from "./TourContext";

export function TourCard() {
  const { active, currentStep, totalSteps, currentStepData, next, skip } =
    useTour();

  if (!active || !currentStepData) return null;

  const isLast = currentStep === totalSteps - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 pointer-events-none" />

      {/* Card */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-50 bg-white rounded-2xl shadow-2xl p-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <button
            onClick={skip}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Skip tour ×
          </button>
        </div>

        <p className="text-sm font-bold text-slate-800 mb-1">
          {currentStepData.label}
        </p>
        <p className="text-xs text-slate-500 mb-3">
          {currentStepData.description}
        </p>

        <div className="flex justify-end">
          <button
            onClick={next}
            className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/TourCard.tsx
git commit -m "feat: add TourCard overlay component"
```

---

### Task 6: GoalsScreen

**Files:**
- Create: `components/onboarding/GoalsScreen.tsx`

- [ ] **Step 1: Write GoalsScreen**

```tsx
// components/onboarding/GoalsScreen.tsx
"use client";

import { useState } from "react";
import type { ThemeId } from "@/lib/domain/types";

export interface GoalsOption {
  key: string;
  emoji: string;
  label: string;
}

interface GoalsScreenProps {
  variant: "parent" | "kid";
  familyName?: string;
  kidName?: string;
  kidAvatar?: string;
  themeId?: ThemeId;
  options: GoalsOption[];
  onContinue: (selected: string[], otherText: string) => void;
  onSkip?: () => void;
}

export function GoalsScreen({
  variant,
  familyName,
  kidName,
  kidAvatar,
  options,
  onContinue,
  onSkip,
}: GoalsScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const heading =
    variant === "parent"
      ? `What do you want for your family, ${familyName}?`
      : `Hey ${kidName}! What are you here for? 🤩`;

  const subtext =
    variant === "parent" ? "Pick everything that applies." : "Pick everything you love!";

  const ctaLabel = variant === "parent" ? "Continue →" : "Next →";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        {variant === "kid" && kidAvatar && (
          <div className="text-5xl text-center mb-2">{kidAvatar}</div>
        )}
        <h2 className="text-base font-bold text-slate-800 text-center mb-1">
          {heading}
        </h2>
        <p className="text-xs text-slate-500 text-center mb-4">{subtext}</p>

        <div className="flex flex-col gap-2 mb-4">
          {options.map((opt) => {
            const isSelected = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggle(opt.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-colors ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-xl">{opt.emoji}</span>
                <span className="text-sm font-medium text-slate-700">
                  {opt.label}
                </span>
                {isSelected && (
                  <span className="ml-auto text-indigo-500 text-sm">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {selected.has("other") && (
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Tell us more..."
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        )}

        <button
          onClick={() => onContinue(Array.from(selected), otherText)}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm transition-colors"
        >
          {ctaLabel}
        </button>

        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/GoalsScreen.tsx
git commit -m "feat: add GoalsScreen component"
```

---

### Task 7: InterestsScreen

**Files:**
- Create: `components/onboarding/InterestsScreen.tsx`

- [ ] **Step 1: Write InterestsScreen**

```tsx
// components/onboarding/InterestsScreen.tsx
"use client";

import { useState } from "react";
import type { ThemeId } from "@/lib/domain/types";

export interface InterestOption {
  key: string;
  emoji: string;
  label: string;
  tag: "task" | "reward" | "both";
}

export const KID_INTEREST_OPTIONS: InterestOption[] = [
  { key: "sports", emoji: "⚽", label: "Sports & fitness", tag: "task" },
  { key: "music", emoji: "🎵", label: "Music", tag: "task" },
  { key: "art", emoji: "🎨", label: "Art & crafts", tag: "task" },
  { key: "reading", emoji: "📚", label: "Reading & books", tag: "task" },
  { key: "gaming", emoji: "🎮", label: "Video games", tag: "both" },
  { key: "cooking", emoji: "🍳", label: "Cooking & baking", tag: "task" },
  { key: "outdoors", emoji: "🌿", label: "Outdoors & nature", tag: "task" },
  { key: "tech", emoji: "💻", label: "Technology & coding", tag: "task" },
  { key: "animals", emoji: "🐾", label: "Animals & pets", tag: "task" },
  { key: "drama", emoji: "🎭", label: "Drama & performance", tag: "task" },
  { key: "treats", emoji: "🍦", label: "Treats & sweets", tag: "reward" },
  { key: "screen_time", emoji: "📱", label: "Screen time & devices", tag: "reward" },
  { key: "movies", emoji: "🎬", label: "Movies & TV shows", tag: "reward" },
  { key: "shopping", emoji: "🛍️", label: "Shopping & new stuff", tag: "reward" },
  { key: "days_out", emoji: "🎡", label: "Days out & adventures", tag: "reward" },
  { key: "other", emoji: "✏️", label: "Something else", tag: "both" },
];

interface InterestsScreenProps {
  kidName: string;
  kidAvatar: string;
  themeId: ThemeId;
  onContinue: (selected: string[], otherText: string) => void;
  onSkip: () => void;
}

export function InterestsScreen({
  kidName,
  kidAvatar,
  onContinue,
  onSkip,
}: InterestsScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        <div className="text-5xl text-center mb-2">{kidAvatar}</div>
        <h2 className="text-base font-bold text-slate-800 text-center mb-1">
          What are you into? 🤩
        </h2>
        <p className="text-xs text-slate-500 text-center mb-4">
          Pick everything you love!
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {KID_INTEREST_OPTIONS.map((opt) => {
            const isSelected = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggle(opt.key)}
                className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 transition-colors ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-xs font-medium text-slate-700 text-center leading-tight">
                  {opt.label}
                </span>
                {isSelected && (
                  <span className="text-indigo-500 text-xs">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {selected.has("other") && (
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Tell us more..."
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        )}

        <button
          onClick={() => onContinue(Array.from(selected), otherText)}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm transition-colors"
        >
          Next →
        </button>
        <button
          onClick={onSkip}
          className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/InterestsScreen.tsx
git commit -m "feat: add InterestsScreen component with merged task/reward options"
```

---

### Task 8: WelcomeScreen

**Files:**
- Create: `components/onboarding/WelcomeScreen.tsx`

- [ ] **Step 1: Write WelcomeScreen**

```tsx
// components/onboarding/WelcomeScreen.tsx
"use client";

import type { ThemeId } from "@/lib/domain/types";

interface WelcomeScreenProps {
  variant: "parent" | "kid";
  familyName?: string;
  kidName?: string;
  kidAvatar?: string;
  themeId?: ThemeId;
  onContinue: () => void;
  onSkip?: () => void;
}

export function WelcomeScreen({
  variant,
  familyName,
  kidName,
  kidAvatar,
  onContinue,
  onSkip,
}: WelcomeScreenProps) {
  if (variant === "parent") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-br from-indigo-500 to-purple-600">
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
          <div className="text-4xl mb-2">🏠</div>
          <h2 className="text-lg font-extrabold text-slate-800 mb-1">
            Welcome to Cucaino,<br />{familyName} family! 👋
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Here's how families get the most out of it:
          </p>

          <div className="flex flex-col gap-3 text-left mb-6">
            {[
              { emoji: "✅", title: "Set tasks once, repeat daily", sub: "No more reminding — kids check their own list" },
              { emoji: "⭐", title: "Stars make chores exciting", sub: "Kids earn stars for every task — they actually want to help" },
              { emoji: "🎁", title: "Rewards they'll work toward", sub: "You decide what's worth earning — screen time, treats, outings" },
              { emoji: "📊", title: "See everything at a glance", sub: "Daily progress, streaks, and family goals — all in one place" },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 items-start">
                <span className="text-xl">{item.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onContinue}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm transition-colors"
          >
            Show me around →
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
            >
              Skip intro
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-amber-400">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
        <div className="text-5xl mb-2">{kidAvatar}</div>
        <h2 className="text-lg font-extrabold text-slate-800 mb-1">
          Hey {kidName}! 👋
        </h2>
        <p className="text-xs text-slate-500 mb-4">Ready to earn some stars?</p>

        <div className="flex items-center justify-center gap-3 mb-5">
          {[
            { emoji: "📋", label: "Do tasks" },
            { emoji: "→", label: null },
            { emoji: "⭐", label: "Earn stars" },
            { emoji: "→", label: null },
            { emoji: "🎁", label: "Get rewards" },
          ].map((item, i) =>
            item.label ? (
              <div key={i} className="flex flex-col items-center">
                <span className="text-2xl">{item.emoji}</span>
                <span className="text-xs font-bold text-slate-700 mt-1">{item.label}</span>
              </div>
            ) : (
              <span key={i} className="text-slate-300 text-lg">→</span>
            )
          )}
        </div>

        <div className="bg-amber-50 rounded-xl p-3 text-left mb-5 flex flex-col gap-2">
          {[
            "🏅 Build streaks by doing tasks every day",
            "🏆 Unlock badges as you level up",
            "🎯 Save stars for the rewards you want most",
          ].map((line) => (
            <p key={line} className="text-xs text-slate-600">{line}</p>
          ))}
        </div>

        <button
          onClick={onContinue}
          className="w-full bg-amber-400 hover:bg-amber-500 text-white font-extrabold py-3 rounded-xl text-sm transition-colors shadow-md"
        >
          Show me around! →
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/WelcomeScreen.tsx
git commit -m "feat: add WelcomeScreen for parent and kid variants"
```

---

### Task 9: ParentOnboardingWrapper + parent layout integration

**Files:**
- Create: `components/onboarding/ParentOnboardingWrapper.tsx`
- Modify: `app/parent/layout.tsx`

- [ ] **Step 1: Write ParentOnboardingWrapper**

```tsx
// components/onboarding/ParentOnboardingWrapper.tsx
"use client";

import { useState, useCallback } from "react";
import { GoalsScreen, type GoalsOption } from "./GoalsScreen";
import { WelcomeScreen } from "./WelcomeScreen";
import { TourProvider, TourAutoStart } from "./TourContext";
import { TourCard } from "./TourCard";
import { PARENT_TOUR_STEPS } from "./tourSteps";
import { saveParentGoals, markParentTourSeen } from "@/lib/actions/onboarding";

const PARENT_GOALS_OPTIONS: GoalsOption[] = [
  { key: "habits", emoji: "🌟", label: "Build habits my kids stick to on their own" },
  { key: "morning", emoji: "☀️", label: "Create a calm, smooth morning routine" },
  { key: "screen_time", emoji: "📱", label: "Take the battle out of screen time" },
  { key: "music", emoji: "🎵", label: "Make music practice a daily habit" },
  { key: "school", emoji: "📚", label: "Stay on top of schoolwork together" },
  { key: "value", emoji: "💰", label: "Teach my kids the value of earning things" },
  { key: "other", emoji: "✏️", label: "Other" },
];

type Phase = "goals" | "welcome" | "touring" | "done";

interface ParentOnboardingWrapperProps {
  parentTourSeen: boolean;
  familyName: string;
  children: React.ReactNode;
}

export function ParentOnboardingWrapper({
  parentTourSeen,
  familyName,
  children,
}: ParentOnboardingWrapperProps) {
  const [phase, setPhase] = useState<Phase>(parentTourSeen ? "done" : "goals");

  const handleGoalsContinue = useCallback(
    async (selected: string[], otherText: string) => {
      if (selected.length > 0 || otherText) {
        await saveParentGoals(selected, otherText);
      }
      setPhase("welcome");
    },
    [],
  );

  const handleGoalsSkip = useCallback(() => setPhase("welcome"), []);

  const handleWelcomeContinue = useCallback(() => setPhase("touring"), []);

  const handleWelcomeSkip = useCallback(async () => {
    await markParentTourSeen();
    setPhase("done");
  }, []);

  const handleTourComplete = useCallback(async () => {
    await markParentTourSeen();
    setPhase("done");
  }, []);

  return (
    <TourProvider steps={PARENT_TOUR_STEPS} onComplete={handleTourComplete}>
      {children}
      <TourCard />
      {phase === "touring" && <TourAutoStart />}

      {phase === "goals" && (
        <GoalsScreen
          variant="parent"
          familyName={familyName}
          options={PARENT_GOALS_OPTIONS}
          onContinue={handleGoalsContinue}
          onSkip={handleGoalsSkip}
        />
      )}

      {phase === "welcome" && (
        <WelcomeScreen
          variant="parent"
          familyName={familyName}
          onContinue={handleWelcomeContinue}
          onSkip={handleWelcomeSkip}
        />
      )}
    </TourProvider>
  );
}
```

- [ ] **Step 2: Update `app/parent/layout.tsx`**

```tsx
import { getParentPinFromDb, listPendingRequests, getFamily } from "@/lib/data/queries";
import ParentPinGateClient from "@/components/parent/ParentPinGateClient";
import ParentShell from "@/components/parent/ParentShell";
import { ParentOnboardingWrapper } from "@/components/onboarding/ParentOnboardingWrapper";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [parentPin, pending, family] = await Promise.all([
    getParentPinFromDb(),
    listPendingRequests(),
    getFamily(),
  ]);
  return (
    <ParentPinGateClient parentPin={parentPin}>
      <ParentShell
        pendingCount={pending.length}
        displayName={family?.parentDisplayName ?? null}
        avatar={family?.parentAvatar ?? "🧙"}
      >
        <ParentOnboardingWrapper
          parentTourSeen={family?.parentTourSeen ?? true}
          familyName={family?.name ?? ""}
        >
          {children}
        </ParentOnboardingWrapper>
      </ParentShell>
    </ParentPinGateClient>
  );
}
```

Note: `parentTourSeen` defaults to `true` if family is null — prevents the tour triggering on error states.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 4: Run dev server and manually test**

```bash
npm run dev
```

Reset your own family's tour state first:
```sql
UPDATE families SET parent_tour_seen = false, parent_goals = '{}' WHERE true;
```

Then visit http://localhost:3000/parent/overview and verify:
1. Goals screen appears — select 2 goals, click Continue
2. Welcome screen appears with family name — click "Show me around"
3. Tour card appears on Overview (Step 1 of 5)
4. Click Next — navigates to Tasks with Step 2 of 5
5. Continue through Rewards → Requests → Settings
6. Click Done on Settings — tour dismissed, no card
7. Refresh — no onboarding screens appear
8. Check Supabase: `parent_tour_seen = true`, `parent_goals` has your selections

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add components/onboarding/ParentOnboardingWrapper.tsx app/parent/layout.tsx
git commit -m "feat: integrate parent onboarding flow into parent layout"
```

---

### Task 10: KidOnboardingWrapper + kid layout integration

**Files:**
- Create: `components/onboarding/KidOnboardingWrapper.tsx`
- Modify: `app/kid/[kidId]/layout.tsx`

- [ ] **Step 1: Write KidOnboardingWrapper**

```tsx
// components/onboarding/KidOnboardingWrapper.tsx
"use client";

import { useState, useCallback } from "react";
import { GoalsScreen, type GoalsOption } from "./GoalsScreen";
import { InterestsScreen } from "./InterestsScreen";
import { WelcomeScreen } from "./WelcomeScreen";
import { TourProvider, TourAutoStart } from "./TourContext";
import { TourCard } from "./TourCard";
import { kidTourSteps } from "./tourSteps";
import {
  saveKidGoals,
  saveKidInterests,
  markKidTourSeen,
} from "@/lib/actions/onboarding";
import type { ThemeId } from "@/lib/domain/types";

const KID_GOALS_OPTIONS: GoalsOption[] = [
  { key: "prizes", emoji: "🎁", label: "Get awesome prizes" },
  { key: "badges", emoji: "🏆", label: "Collect all the badges" },
  { key: "streak", emoji: "🔥", label: "Never break my streak" },
  { key: "music", emoji: "🎵", label: "Become a music superstar" },
  { key: "hero", emoji: "💪", label: "Be my family's hero" },
  { key: "quizzes", emoji: "🎮", label: "Dominate the quizzes" },
  { key: "other", emoji: "✏️", label: "Something else" },
];

type Phase = "goals" | "interests" | "welcome" | "touring" | "done";

interface KidOnboardingWrapperProps {
  tourSeen: boolean;
  kidId: string;
  kidName: string;
  kidAvatar: string;
  themeId: ThemeId;
  children: React.ReactNode;
}

export function KidOnboardingWrapper({
  tourSeen,
  kidId,
  kidName,
  kidAvatar,
  themeId,
  children,
}: KidOnboardingWrapperProps) {
  const [phase, setPhase] = useState<Phase>(tourSeen ? "done" : "goals");
  const steps = kidTourSteps(kidId);

  const handleGoalsContinue = useCallback(
    async (selected: string[], otherText: string) => {
      if (selected.length > 0 || otherText) {
        await saveKidGoals(kidId, selected, otherText);
      }
      setPhase("interests");
    },
    [kidId],
  );

  const handleGoalsSkip = useCallback(() => setPhase("interests"), []);

  const handleInterestsContinue = useCallback(
    async (selected: string[], otherText: string) => {
      if (selected.length > 0 || otherText) {
        await saveKidInterests(kidId, selected, otherText);
      }
      setPhase("welcome");
    },
    [kidId],
  );

  const handleInterestsSkip = useCallback(() => setPhase("welcome"), []);

  const handleWelcomeContinue = useCallback(() => setPhase("touring"), []);

  const handleWelcomeSkip = useCallback(async () => {
    await markKidTourSeen(kidId);
    setPhase("done");
  }, [kidId]);

  const handleTourComplete = useCallback(async () => {
    await markKidTourSeen(kidId);
    setPhase("done");
  }, [kidId]);

  return (
    <TourProvider steps={steps} onComplete={handleTourComplete}>
      {children}
      <TourCard />
      {phase === "touring" && <TourAutoStart />}

      {phase === "goals" && (
        <GoalsScreen
          variant="kid"
          kidName={kidName}
          kidAvatar={kidAvatar}
          themeId={themeId}
          options={KID_GOALS_OPTIONS}
          onContinue={handleGoalsContinue}
          onSkip={handleGoalsSkip}
        />
      )}

      {phase === "interests" && (
        <InterestsScreen
          kidName={kidName}
          kidAvatar={kidAvatar}
          themeId={themeId}
          onContinue={handleInterestsContinue}
          onSkip={handleInterestsSkip}
        />
      )}

      {phase === "welcome" && (
        <WelcomeScreen
          variant="kid"
          kidName={kidName}
          kidAvatar={kidAvatar}
          themeId={themeId}
          onContinue={handleWelcomeContinue}
          onSkip={handleWelcomeSkip}
        />
      )}
    </TourProvider>
  );
}
```

- [ ] **Step 2: Update `app/kid/[kidId]/layout.tsx`**

```tsx
import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid, listTasksForKid, listCompletionsToday, listBadgeProgress, getFamily } from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { KidOnboardingWrapper } from "@/components/onboarding/KidOnboardingWrapper";

export default async function KidLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const dow = isoWeekday();

  const [tasks, completions, badges, family] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    listBadgeProgress(kid.id),
    getFamily(),
  ]);

  const todayTasks = tasksForDay(tasks, dow);
  const completableTasks = todayTasks.filter((t) => t.requiresCompletion);
  const completedIds = new Set(completions.map((c) => c.taskId));
  const done = completableTasks.filter((t) => completedIds.has(t.id)).length;
  const total = completableTasks.length;

  const familyGoal = family
    ? { name: family.name, emoji: "⭐", current: family.familyPointsBalance, target: 2000 }
    : undefined;

  return (
    <KidShell
      kid={kid}
      todayProgress={total > 0 ? { done, total } : undefined}
      badges={badges}
      familyGoal={familyGoal}
      weatherLocation={
        family?.weatherLat != null && family?.weatherLon != null
          ? { lat: family.weatherLat, lon: family.weatherLon }
          : undefined
      }
    >
      <KidOnboardingWrapper
        tourSeen={kid.tourSeen}
        kidId={kid.id}
        kidName={kid.name}
        kidAvatar={kid.avatar}
        themeId={kid.themeId}
      >
        {children}
      </KidOnboardingWrapper>
    </KidShell>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 4: Run dev server and manually test**

```bash
npm run dev
```

Reset a kid's onboarding state in Supabase:
```sql
UPDATE kids SET tour_seen = false, goals = '{}', interests = '{}' WHERE true;
```

Then log in as that kid and verify:
1. Goals screen appears with kid's avatar — select goals, click Next
2. Interests screen appears (2-column grid) — select interests, click Next
3. Welcome screen appears with story arc — click "Show me around!"
4. Tour card appears on Home (Step 1 of 4)
5. Click Next — navigates to Schedule (Step 2 of 4)
6. Continue through Store → Play
7. Click Done — tour dismissed
8. Refresh — no onboarding screens
9. Check Supabase: `tour_seen = true`, `goals` and `interests` have selections

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add components/onboarding/KidOnboardingWrapper.tsx "app/kid/[kidId]/layout.tsx"
git commit -m "feat: integrate kid onboarding flow into kid layout"
```
