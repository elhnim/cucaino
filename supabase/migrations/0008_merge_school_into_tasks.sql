-- Migration 0008: merge school_classes / school_items into tasks
-- Adds 5 nullable columns to tasks used exclusively by category = 'school_subject'

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS subject       text,        -- enum value from subject-registry (math, english, …)
  ADD COLUMN IF NOT EXISTS custom_label  text,        -- optional override of subject display name
  ADD COLUMN IF NOT EXISTS end_time      text,        -- "HH:MM" — paired with existing start_time
  ADD COLUMN IF NOT EXISTS room          text,        -- e.g. "4A"
  ADD COLUMN IF NOT EXISTS teacher       text;        -- e.g. "Ms Lee"
