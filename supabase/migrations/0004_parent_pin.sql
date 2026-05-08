-- Add parent PIN column to families (was missing from initial schema)
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS parent_pin text;
