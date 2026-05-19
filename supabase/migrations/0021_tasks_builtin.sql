-- Allow family_id to be NULL for builtin tasks
ALTER TABLE public.tasks ALTER COLUMN family_id DROP NOT NULL;

-- Add is_builtin flag
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT false;

-- Update RLS: drop old policy, add separate read/write policies
DROP POLICY IF EXISTS "tasks: family scope" ON public.tasks;

CREATE POLICY "tasks: select family or builtin" ON public.tasks
  FOR SELECT USING (is_builtin = true OR family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));

CREATE POLICY "tasks: insert family scope" ON public.tasks
  FOR INSERT WITH CHECK (is_builtin = false AND family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));

CREATE POLICY "tasks: update family scope" ON public.tasks
  FOR UPDATE USING (is_builtin = false AND family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));

CREATE POLICY "tasks: delete family scope" ON public.tasks
  FOR DELETE USING (is_builtin = false AND family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));
