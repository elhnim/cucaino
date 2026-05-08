ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS parent_display_name text,
  ADD COLUMN IF NOT EXISTS parent_avatar text DEFAULT '🧙';
