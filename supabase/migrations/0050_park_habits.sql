-- Cucaino Park habit loop: the daily all-quests-done mystery chest and streak milestone rewards.
-- Additive only: two columns on kid_parks (RLS family_scope already covers them).
ALTER TABLE public.kid_parks
  ADD COLUMN IF NOT EXISTS chest_day date,
  ADD COLUMN IF NOT EXISTS streak_claims jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.kid_parks.chest_day IS 'Family-local date the kid last opened the all-quests-done mystery chest';
COMMENT ON COLUMN public.kid_parks.streak_claims IS 'Streak milestones (days) whose reward has been claimed, e.g. [3, 7]';
