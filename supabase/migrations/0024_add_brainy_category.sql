ALTER TABLE public.tasks DROP CONSTRAINT tasks_category_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_category_check
  CHECK (category = ANY (ARRAY['chore','exercise','music','activity','personal','school_subject','brainy']));

UPDATE public.tasks SET category = 'brainy' WHERE is_builtin = true AND category = 'activity';
