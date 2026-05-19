-- Fix current_family_id() to be deterministic under LIMIT 1
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
  ORDER BY id
  LIMIT 1;
$$;

-- Enforce lowercase on invited_email
ALTER TABLE public.family_invites
  ADD CONSTRAINT invited_email_lowercase CHECK (invited_email = lower(invited_email));
