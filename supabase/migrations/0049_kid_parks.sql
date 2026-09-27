-- Cucaino Park: each kid's own "Dream Park" they build with tickets earned from chores.
-- Additive only — a new table + helper function; nothing existing is altered.
-- Tickets are a park-only currency (1 per completed quest + ride bonuses) and never touch
-- stars, cash or rewards.

CREATE TABLE IF NOT EXISTS public.kid_parks (
  kid_id          uuid        PRIMARY KEY REFERENCES public.kids(id) ON DELETE CASCADE,
  family_id       uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  tickets         integer     NOT NULL DEFAULT 0 CHECK (tickets >= 0),
  tickets_earned  integer     NOT NULL DEFAULT 0,
  -- placed pieces: [{ "uid": "...", "piece": "lollipop-tree", "gx": 3, "gz": 5, "r": 1 }]
  layout          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kid_parks_family_idx ON public.kid_parks (family_id);

ALTER TABLE public.kid_parks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.kid_parks
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- Add (or, with a negative amount, remove) tickets atomically, creating the park row on first
-- use. SECURITY INVOKER: runs as the caller, so the family_scope policy still applies.
CREATE OR REPLACE FUNCTION public.increment_kid_tickets(p_kid_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_family uuid;
  v_tickets integer;
BEGIN
  SELECT family_id INTO v_family FROM public.kids WHERE id = p_kid_id;
  IF v_family IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.kid_parks (kid_id, family_id, tickets, tickets_earned)
  VALUES (p_kid_id, v_family, GREATEST(p_amount, 0), GREATEST(p_amount, 0))
  ON CONFLICT (kid_id) DO UPDATE
    SET tickets = GREATEST(public.kid_parks.tickets + p_amount, 0),
        tickets_earned = public.kid_parks.tickets_earned + GREATEST(p_amount, 0),
        updated_at = now()
  RETURNING tickets INTO v_tickets;
  RETURN v_tickets;
END;
$$;
