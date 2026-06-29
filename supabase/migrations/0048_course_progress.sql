-- Course progress — tracks a kid's per-lesson best score and star awards for
-- the educational courses (e.g. "How to Win Friends"). Stars are awarded once
-- per lesson (server-tracked) so quizzes can't be farmed by retaking.

CREATE TABLE IF NOT EXISTS public.course_progress (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kid_id        uuid        NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  course_id     text        NOT NULL,
  lesson_id     text        NOT NULL,
  best_score    integer     NOT NULL DEFAULT 0,
  total         integer     NOT NULL DEFAULT 0,
  stars_awarded integer     NOT NULL DEFAULT 0,
  completed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kid_id, course_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS course_progress_kid_course_idx
  ON public.course_progress (kid_id, course_id);

ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.course_progress
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());
