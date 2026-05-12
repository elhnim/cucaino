-- ============================================================================
-- Badge system redesign
-- - Rename 6 legacy categories to new names
-- - Add earned_at columns per tier
-- - Add total_completions to kids
-- - Upsert streak / star_collector / task_titan badge rows
-- - Update increment_badge_progress to return newly reached tier name
-- ============================================================================

-- 1. New columns on badge_progress
ALTER TABLE public.badge_progress
  ADD COLUMN IF NOT EXISTS bronze_earned_at timestamptz,
  ADD COLUMN IF NOT EXISTS silver_earned_at timestamptz,
  ADD COLUMN IF NOT EXISTS gold_earned_at   timestamptz;

-- 2. total_completions on kids
ALTER TABLE public.kids
  ADD COLUMN IF NOT EXISTS total_completions integer NOT NULL DEFAULT 0;

-- 3. Rename legacy badge categories
UPDATE public.badge_progress SET category = 'champion'  WHERE category = 'chores';
UPDATE public.badge_progress SET category = 'athlete'   WHERE category = 'physical';
UPDATE public.badge_progress SET category = 'musician'  WHERE category = 'music';
UPDATE public.badge_progress SET category = 'self_care' WHERE category = 'hygiene';
UPDATE public.badge_progress SET category = 'explorer'  WHERE category = 'mindfulness';
UPDATE public.badge_progress SET category = 'scholar'   WHERE category = 'learning';

-- 4. Backfill bronze_earned_at for existing rows that already passed bronze threshold
--    (rough backfill — just mark it as now for existing earners)
UPDATE public.badge_progress bp
SET bronze_earned_at = now()
WHERE bronze_earned_at IS NULL
  AND completion_count >= CASE bp.category
    WHEN 'champion'  THEN 7   WHEN 'athlete'   THEN 7   WHEN 'self_care' THEN 7
    WHEN 'musician'  THEN 5   WHEN 'explorer'  THEN 5   WHEN 'scholar'   THEN 5
    WHEN 'streak'    THEN 3
    WHEN 'star_collector' THEN 50
    WHEN 'task_titan'     THEN 25
    ELSE 10
  END;

UPDATE public.badge_progress bp
SET silver_earned_at = now()
WHERE silver_earned_at IS NULL
  AND completion_count >= CASE bp.category
    WHEN 'champion'  THEN 30  WHEN 'athlete'   THEN 30  WHEN 'self_care' THEN 30
    WHEN 'musician'  THEN 20  WHEN 'explorer'  THEN 20  WHEN 'scholar'   THEN 25
    WHEN 'streak'    THEN 7
    WHEN 'star_collector' THEN 250
    WHEN 'task_titan'     THEN 100
    ELSE 50
  END;

UPDATE public.badge_progress bp
SET gold_earned_at = now()
WHERE gold_earned_at IS NULL
  AND completion_count >= CASE bp.category
    WHEN 'champion'  THEN 75  WHEN 'athlete'   THEN 75  WHEN 'self_care' THEN 75
    WHEN 'musician'  THEN 60  WHEN 'explorer'  THEN 60  WHEN 'scholar'   THEN 60
    WHEN 'streak'    THEN 30
    WHEN 'star_collector' THEN 1000
    WHEN 'task_titan'     THEN 500
    ELSE 100
  END;

-- 5. Update increment_badge_progress to return newly reached tier (or NULL)
CREATE OR REPLACE FUNCTION public.increment_badge_progress(
  p_kid_id   uuid,
  p_category text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_count integer := 0;
  v_new_count integer;
  v_bronze    integer;
  v_silver    integer;
  v_gold      integer;
  v_new_tier  text := NULL;
BEGIN
  SELECT
    CASE p_category
      WHEN 'champion'       THEN 7    WHEN 'athlete'   THEN 7    WHEN 'self_care' THEN 7
      WHEN 'musician'       THEN 5    WHEN 'explorer'  THEN 5    WHEN 'scholar'   THEN 5
      WHEN 'streak'         THEN 3
      WHEN 'star_collector' THEN 50
      WHEN 'task_titan'     THEN 25
      ELSE 10
    END,
    CASE p_category
      WHEN 'champion'       THEN 30   WHEN 'athlete'   THEN 30   WHEN 'self_care' THEN 30
      WHEN 'musician'       THEN 20   WHEN 'explorer'  THEN 20   WHEN 'scholar'   THEN 25
      WHEN 'streak'         THEN 7
      WHEN 'star_collector' THEN 250
      WHEN 'task_titan'     THEN 100
      ELSE 50
    END,
    CASE p_category
      WHEN 'champion'       THEN 75   WHEN 'athlete'   THEN 75   WHEN 'self_care' THEN 75
      WHEN 'musician'       THEN 60   WHEN 'explorer'  THEN 60   WHEN 'scholar'   THEN 60
      WHEN 'streak'         THEN 30
      WHEN 'star_collector' THEN 1000
      WHEN 'task_titan'     THEN 500
      ELSE 100
    END
  INTO v_bronze, v_silver, v_gold;

  SELECT COALESCE(completion_count, 0) INTO v_old_count
  FROM public.badge_progress
  WHERE kid_id = p_kid_id AND category = p_category;

  INSERT INTO public.badge_progress (kid_id, category, completion_count)
  VALUES (p_kid_id, p_category, 1)
  ON CONFLICT (kid_id, category) DO UPDATE
    SET completion_count = badge_progress.completion_count + 1
  RETURNING completion_count INTO v_new_count;

  -- Detect newly crossed tier (only once — gold takes priority)
  IF v_new_count >= v_gold AND v_old_count < v_gold THEN
    UPDATE public.badge_progress
    SET gold_earned_at = now()
    WHERE kid_id = p_kid_id AND category = p_category AND gold_earned_at IS NULL;
    v_new_tier := 'gold';
  ELSIF v_new_count >= v_silver AND v_old_count < v_silver THEN
    UPDATE public.badge_progress
    SET silver_earned_at = now()
    WHERE kid_id = p_kid_id AND category = p_category AND silver_earned_at IS NULL;
    v_new_tier := 'silver';
  ELSIF v_new_count >= v_bronze AND v_old_count < v_bronze THEN
    UPDATE public.badge_progress
    SET bronze_earned_at = now()
    WHERE kid_id = p_kid_id AND category = p_category AND bronze_earned_at IS NULL;
    v_new_tier := 'bronze';
  END IF;

  RETURN v_new_tier;
END;
$$;

-- 6. Upsert badge rows for streak / star_collector / task_titan for all kids
--    (ensures rows exist; counts will be set by server-action checks going forward)
INSERT INTO public.badge_progress (kid_id, category, completion_count)
SELECT id, 'streak', current_streak
FROM public.kids
ON CONFLICT (kid_id, category) DO NOTHING;

INSERT INTO public.badge_progress (kid_id, category, completion_count)
SELECT id, 'star_collector', total_stars_earned
FROM public.kids
ON CONFLICT (kid_id, category) DO NOTHING;

INSERT INTO public.badge_progress (kid_id, category, completion_count)
SELECT id, 'task_titan', (SELECT COUNT(*) FROM public.task_completions WHERE kid_id = kids.id)
FROM public.kids
ON CONFLICT (kid_id, category) DO NOTHING;

-- 7. Helper function to atomically increment total_completions on kids
CREATE OR REPLACE FUNCTION public.increment_kid_total_completions(p_kid_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.kids
  SET total_completions = total_completions + 1
  WHERE id = p_kid_id;
$$;
