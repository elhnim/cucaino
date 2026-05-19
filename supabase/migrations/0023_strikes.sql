-- Strikes v1: create table (applied in prior session without family_id)
-- Strikes v2: add family_id, issued_by, penalty_cash_cents + RLS

ALTER TABLE public.strikes
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.families (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS issued_by text NOT NULL DEFAULT 'Parent',
  ADD COLUMN IF NOT EXISTS penalty_cash_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS strikes_kid_id_idx ON public.strikes (kid_id);
CREATE INDEX IF NOT EXISTS strikes_family_id_idx ON public.strikes (family_id);

ALTER TABLE public.strikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_scope" ON public.strikes;
CREATE POLICY "family_scope" ON public.strikes
  USING (
    kid_id IN (SELECT id FROM public.kids WHERE family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()))
  );
