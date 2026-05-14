CREATE INDEX tasks_kid_ids_gin_idx ON public.tasks USING GIN (kid_ids);
