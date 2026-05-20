ALTER TABLE public.kids
  ADD COLUMN IF NOT EXISTS sparks_balance integer NOT NULL DEFAULT 0;
