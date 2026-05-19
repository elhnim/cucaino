-- 1. Add co_parent_user_ids to families
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS co_parent_user_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. family_invites table
CREATE TABLE IF NOT EXISTS public.family_invites (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid        NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  invited_email  text        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS family_invites_family_status_idx ON public.family_invites (family_id, status);
CREATE INDEX IF NOT EXISTS family_invites_email_status_idx ON public.family_invites (invited_email, status);

ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.family_invites
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- 3. Update current_family_id() to include co-parents
CREATE OR REPLACE FUNCTION public.current_family_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id FROM public.families
  WHERE owner_user_id = auth.uid()
     OR auth.uid() = ANY(co_parent_user_ids)
  LIMIT 1;
$$;

-- 4. Allow co-parents to SELECT the family row (needed for getFamily() calls)
CREATE POLICY "families: co-parent read" ON public.families
  FOR SELECT USING (auth.uid() = ANY(co_parent_user_ids));

-- 5. Fix strikes inline policy → use current_family_id()
DROP POLICY IF EXISTS "family_scope" ON public.strikes;
CREATE POLICY "family_scope" ON public.strikes
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- 6. Fix mood_entries inline policy → use current_family_id()
DROP POLICY IF EXISTS "family_scope" ON public.mood_entries;
CREATE POLICY "family_scope" ON public.mood_entries
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());
