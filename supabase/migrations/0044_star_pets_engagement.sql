-- Star Pets long-term engagement: daily care streaks, learnable tricks,
-- and a once-a-day surprise gift.

ALTER TABLE public.kid_pets
  ADD COLUMN IF NOT EXISTS care_streak    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_care_date date,
  ADD COLUMN IF NOT EXISTS tricks         jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_gift_date date;
