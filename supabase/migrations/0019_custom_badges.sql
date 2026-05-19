-- ============================================================================
-- Custom badges — parent-defined, task-specific, count or streak tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.custom_badges (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid        NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  name             text        NOT NULL,
  icon             text        NOT NULL DEFAULT '🏅',
  description      text,
  task_id          uuid        NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  track_type       text        NOT NULL DEFAULT 'count'
                               CHECK (track_type IN ('count', 'streak')),
  bronze_threshold integer     NOT NULL DEFAULT 5,
  silver_threshold integer     NOT NULL DEFAULT 15,
  gold_threshold   integer     NOT NULL DEFAULT 30,
  kid_ids          uuid[],
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_badges_family_id_idx
  ON public.custom_badges (family_id);

ALTER TABLE public.custom_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.custom_badges
  USING (family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.custom_badge_progress (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid        NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  kid_id            uuid        NOT NULL REFERENCES public.kids (id) ON DELETE CASCADE,
  badge_id          uuid        NOT NULL REFERENCES public.custom_badges (id) ON DELETE CASCADE,
  current_count     integer     NOT NULL DEFAULT 0,
  current_tier      text        NOT NULL DEFAULT 'none'
                                CHECK (current_tier IN ('none', 'bronze', 'silver', 'gold')),
  last_completed_date date,
  bronze_earned_at  timestamptz,
  silver_earned_at  timestamptz,
  gold_earned_at    timestamptz,
  UNIQUE (kid_id, badge_id)
);

CREATE INDEX IF NOT EXISTS custom_badge_progress_kid_id_idx
  ON public.custom_badge_progress (kid_id);

ALTER TABLE public.custom_badge_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.custom_badge_progress
  USING (family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_custom_badge_progress(
  p_kid_id    uuid,
  p_badge_id  uuid,
  p_family_id uuid,
  p_today     date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_badge        record;
  v_prog         record;
  v_new_count    integer;
  v_old_tier     text;
  v_new_tier     text;
  v_crossed_tier text := NULL;
BEGIN
  SELECT track_type, bronze_threshold, silver_threshold, gold_threshold
    INTO v_badge
    FROM public.custom_badges
   WHERE id = p_badge_id;

  INSERT INTO public.custom_badge_progress
         (family_id, kid_id, badge_id, current_count, last_completed_date)
  VALUES (p_family_id, p_kid_id, p_badge_id, 0, NULL)
  ON CONFLICT (kid_id, badge_id) DO NOTHING;

  SELECT * INTO v_prog
    FROM public.custom_badge_progress
   WHERE kid_id = p_kid_id AND badge_id = p_badge_id;

  v_old_tier := v_prog.current_tier;

  IF v_badge.track_type = 'streak' THEN
    IF v_prog.last_completed_date = p_today - 1 THEN
      v_new_count := v_prog.current_count + 1;
    ELSE
      v_new_count := 1;
    END IF;
  ELSE
    v_new_count := v_prog.current_count + 1;
  END IF;

  IF v_new_count >= v_badge.gold_threshold THEN
    v_new_tier := 'gold';
  ELSIF v_new_count >= v_badge.silver_threshold THEN
    v_new_tier := 'silver';
  ELSIF v_new_count >= v_badge.bronze_threshold THEN
    v_new_tier := 'bronze';
  ELSE
    v_new_tier := 'none';
  END IF;

  IF v_new_tier != v_old_tier AND v_new_tier != 'none' THEN
    v_crossed_tier := v_new_tier;
  END IF;

  UPDATE public.custom_badge_progress
     SET current_count       = v_new_count,
         current_tier        = v_new_tier,
         last_completed_date = p_today,
         bronze_earned_at    = CASE WHEN v_crossed_tier = 'bronze' AND bronze_earned_at IS NULL
                                    THEN now() ELSE bronze_earned_at END,
         silver_earned_at    = CASE WHEN v_crossed_tier = 'silver' AND silver_earned_at IS NULL
                                    THEN now() ELSE silver_earned_at END,
         gold_earned_at      = CASE WHEN v_crossed_tier = 'gold'   AND gold_earned_at IS NULL
                                    THEN now() ELSE gold_earned_at END
   WHERE kid_id = p_kid_id AND badge_id = p_badge_id;

  RETURN v_crossed_tier;
END;
$$;
