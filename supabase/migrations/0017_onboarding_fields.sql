-- supabase/migrations/0017_onboarding_fields.sql
alter table public.families
  add column if not exists parent_tour_seen boolean not null default false,
  add column if not exists parent_goals text[] not null default '{}',
  add column if not exists parent_goals_other text;

alter table public.kids
  add column if not exists tour_seen boolean not null default false,
  add column if not exists goals text[] not null default '{}',
  add column if not exists goals_other text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists interests_other text;
