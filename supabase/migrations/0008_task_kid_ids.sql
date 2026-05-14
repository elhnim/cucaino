-- supabase/migrations/0008_task_kid_ids.sql
ALTER TABLE tasks ADD COLUMN kid_ids uuid[];
UPDATE tasks SET kid_ids = ARRAY[kid_id] WHERE kid_id IS NOT NULL;
ALTER TABLE tasks DROP COLUMN kid_id;
