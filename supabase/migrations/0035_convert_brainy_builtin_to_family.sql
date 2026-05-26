-- Convert builtin brainy tasks to family-owned so parents can edit them.
-- Builtin brainy tasks were seeded as shared templates (family_id = NULL, is_builtin = true)
-- but the RLS UPDATE policy blocked editing them. Assign them to the family and clear the flag.
UPDATE public.tasks
SET
  is_builtin = false,
  family_id  = (SELECT id FROM public.families ORDER BY created_at LIMIT 1)
WHERE is_builtin = true
  AND category = 'brainy';
