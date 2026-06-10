-- Star Pets — Tamagotchi-style virtual pet, one per kid.
-- Stats decay over real time (computed at read; no cron needed) and are
-- topped up with care actions paid for in stars (decrement_kid_points).

CREATE TABLE IF NOT EXISTS public.kid_pets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kid_id            uuid        NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  species           text        NOT NULL,
  hunger            integer     NOT NULL DEFAULT 80 CHECK (hunger BETWEEN 0 AND 100),
  happiness         integer     NOT NULL DEFAULT 80 CHECK (happiness BETWEEN 0 AND 100),
  energy            integer     NOT NULL DEFAULT 80 CHECK (energy BETWEEN 0 AND 100),
  cleanliness       integer     NOT NULL DEFAULT 80 CHECK (cleanliness BETWEEN 0 AND 100),
  xp                integer     NOT NULL DEFAULT 0,
  accessories       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_sleeping       boolean     NOT NULL DEFAULT false,
  total_stars_spent integer     NOT NULL DEFAULT 0,
  last_tick_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kid_pets_kid_id_key UNIQUE (kid_id)
);

CREATE INDEX IF NOT EXISTS kid_pets_kid_idx ON public.kid_pets (kid_id);

ALTER TABLE public.kid_pets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.kid_pets
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());
