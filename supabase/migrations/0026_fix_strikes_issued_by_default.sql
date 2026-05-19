-- issued_by_parent_name was created NOT NULL with no default in 0003_redesign.sql.
-- issued_by (added in 0023) is the field we use; set a default on the old column so inserts don't break.
ALTER TABLE public.strikes ALTER COLUMN issued_by_parent_name SET DEFAULT '';
