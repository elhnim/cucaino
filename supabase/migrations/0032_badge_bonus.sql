ALTER TABLE public.custom_badges
  ADD COLUMN IF NOT EXISTS bronze_bonus_stars    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS silver_bonus_stars    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_bonus_stars      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bronze_bonus_cash_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS silver_bonus_cash_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_bonus_cash_cents   integer NOT NULL DEFAULT 0;

ALTER TABLE public.badge_config_overrides
  ADD COLUMN IF NOT EXISTS bronze_bonus_stars    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS silver_bonus_stars    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_bonus_stars      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bronze_bonus_cash_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS silver_bonus_cash_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_bonus_cash_cents   integer NOT NULL DEFAULT 0;
