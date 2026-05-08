-- ============================================================================
-- Cucaino — redesign migration (Step 6+7+10)
--
-- Adds new columns and tables for the task/reward redesign, gamification,
-- wishlist, strikes, and the new quiz system.
-- All ALTER TABLE changes use defaults so existing rows remain valid.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tasks — new rule / target / music / description columns
-- ----------------------------------------------------------------------------

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS rule text NOT NULL DEFAULT 'strict',
  ADD COLUMN IF NOT EXISTS flexible_min_per_week integer,
  ADD COLUMN IF NOT EXISTS time_slots text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS target_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS target_reps integer,
  ADD COLUMN IF NOT EXISTS target_rep_label text,
  ADD COLUMN IF NOT EXISTS checklist_items text[],
  ADD COLUMN IF NOT EXISTS music_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;

-- Also add kid_can_add if not already present (referenced in domain types)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS kid_can_add boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 2. rewards — new type / who / recurrence / limit / approval / available_to
-- ----------------------------------------------------------------------------

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS reward_type text NOT NULL DEFAULT 'treat',
  ADD COLUMN IF NOT EXISTS who text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS redemption_limit integer,
  ADD COLUMN IF NOT EXISTS redemption_period text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_to text[] NOT NULL DEFAULT '{}';

-- ----------------------------------------------------------------------------
-- 3. kids — gamification columns
-- ----------------------------------------------------------------------------

ALTER TABLE public.kids
  ADD COLUMN IF NOT EXISTS total_stars_earned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_avatar_emoji text,
  ADD COLUMN IF NOT EXISTS selected_frame text;

-- ----------------------------------------------------------------------------
-- 4. wishlist_items
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id uuid NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  position integer NOT NULL,
  UNIQUE(kid_id, reward_id),
  UNIQUE(kid_id, position)
);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wishlist_items: family scope" ON public.wishlist_items
  FOR ALL USING (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  )
  WITH CHECK (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  );

-- ----------------------------------------------------------------------------
-- 5. badge_progress
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.badge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id uuid NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  category text NOT NULL,
  completion_count integer NOT NULL DEFAULT 0,
  UNIQUE(kid_id, category)
);

ALTER TABLE public.badge_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badge_progress: family scope" ON public.badge_progress
  FOR ALL USING (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  )
  WITH CHECK (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  );

-- ----------------------------------------------------------------------------
-- 6. strikes
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id uuid NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  issued_by_parent_name text NOT NULL,
  reason text NOT NULL,
  penalty_stars integer NOT NULL DEFAULT 0,
  deduct_at timestamptz,
  deducted_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strikes: family scope" ON public.strikes
  FOR ALL USING (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  )
  WITH CHECK (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  );

-- ----------------------------------------------------------------------------
-- 7. quiz_sets
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quiz_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES public.families(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🎯',
  themes text[] NOT NULL DEFAULT '{}',
  age_band_filter text,
  max_difficulty text NOT NULL DEFAULT 'medium',
  question_type_filter text[],
  questions_per_session integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_sets: family or builtin" ON public.quiz_sets
  FOR SELECT USING (family_id IS NULL OR family_id = public.current_family_id());

CREATE POLICY "quiz_sets: family writes" ON public.quiz_sets
  FOR INSERT WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "quiz_sets: family updates" ON public.quiz_sets
  FOR UPDATE USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "quiz_sets: family deletes" ON public.quiz_sets
  FOR DELETE USING (family_id = public.current_family_id());

-- ----------------------------------------------------------------------------
-- 8. quiz_questions2 — new question library
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quiz_questions2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES public.families(id) ON DELETE CASCADE,
  type text NOT NULL,
  question_text text NOT NULL,
  theme text NOT NULL,
  age_band text NOT NULL,
  difficulty text NOT NULL,
  is_builtin boolean NOT NULL DEFAULT false,
  choices jsonb,
  sentence_template text,
  accepted_answers text[],
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_questions2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_questions2: builtin or family" ON public.quiz_questions2
  FOR SELECT USING (is_builtin OR family_id = public.current_family_id());

CREATE POLICY "quiz_questions2: family writes" ON public.quiz_questions2
  FOR INSERT WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "quiz_questions2: family updates" ON public.quiz_questions2
  FOR UPDATE USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "quiz_questions2: family deletes" ON public.quiz_questions2
  FOR DELETE USING (family_id = public.current_family_id());

-- ----------------------------------------------------------------------------
-- 9. kid_timetable
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kid_timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id uuid NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  section text NOT NULL,
  slot_index integer NOT NULL,
  subject_id text NOT NULL,
  is_override boolean NOT NULL DEFAULT false,
  override_date date,
  UNIQUE(kid_id, day_of_week, section, slot_index, is_override, override_date)
);

ALTER TABLE public.kid_timetable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kid_timetable: family scope" ON public.kid_timetable
  FOR ALL USING (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  )
  WITH CHECK (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = public.current_family_id())
  );
