-- ============================================================================
-- 0007 — quiz_banks index + kid_daily_task_additions table
-- ============================================================================

-- Composite index so built-in banks always sort before custom ones
CREATE INDEX IF NOT EXISTS quiz_banks_builtin_name_idx
  ON public.quiz_banks (is_builtin DESC, name);

-- Date-scoped self-adds: kids can attach a flexible task to a single day
-- without mutating the task library or creating a permanent schedule.
CREATE TABLE IF NOT EXISTS public.kid_daily_task_additions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid        NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  kid_id      uuid        NOT NULL REFERENCES public.kids (id) ON DELETE CASCADE,
  task_id     uuid        NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  date        date        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kid_id, task_id, date)
);

CREATE INDEX IF NOT EXISTS kid_daily_additions_kid_date_idx
  ON public.kid_daily_task_additions (kid_id, date);

ALTER TABLE public.kid_daily_task_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kid_daily_task_additions: family scope"
  ON public.kid_daily_task_additions
  FOR ALL
  USING  (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());
