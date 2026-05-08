-- ============================================================================
-- Cucaino — gamification helpers
--
-- Adds update_kid_gamification() which increments total_stars_earned and
-- maintains current_streak / longest_streak in a single atomic call.
-- Called from the completeTask server action after inserting a completion.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_kid_gamification(
  p_kid_id  uuid,
  p_points  integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today                date := current_date;
  v_yesterday            date := current_date - 1;
  v_completions_today    integer;
  v_had_yesterday        boolean;
  v_new_streak           integer;
BEGIN
  -- 1. Always increment total stars earned
  UPDATE public.kids
     SET total_stars_earned = total_stars_earned + p_points
   WHERE id = p_kid_id;

  -- 2. Count completions today (this call happens AFTER the insert, so >= 1)
  SELECT COUNT(*)
    INTO v_completions_today
    FROM public.task_completions
   WHERE kid_id = p_kid_id
     AND date   = v_today;

  -- 3. Only update streak on the FIRST completion of the day
  IF v_completions_today = 1 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.task_completions
       WHERE kid_id = p_kid_id
         AND date   = v_yesterday
    ) INTO v_had_yesterday;

    UPDATE public.kids
       SET current_streak  = CASE WHEN v_had_yesterday THEN current_streak + 1 ELSE 1 END,
           longest_streak  = GREATEST(
                               longest_streak,
                               CASE WHEN v_had_yesterday THEN current_streak + 1 ELSE 1 END
                             )
     WHERE id = p_kid_id;
  END IF;
END;
$$;

-- Upsert badge progress for a given category
CREATE OR REPLACE FUNCTION public.increment_badge_progress(
  p_kid_id  uuid,
  p_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.badge_progress (kid_id, category, completion_count)
  VALUES (p_kid_id, p_category, 1)
  ON CONFLICT (kid_id, category) DO UPDATE
    SET completion_count = badge_progress.completion_count + 1;
END;
$$;

-- Decrement total_stars_earned when a completion is removed
CREATE OR REPLACE FUNCTION public.decrement_kid_stars(
  p_kid_id uuid,
  p_amount  integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.kids
     SET total_stars_earned = GREATEST(0, total_stars_earned - p_amount)
   WHERE id = p_kid_id;
END;
$$;
