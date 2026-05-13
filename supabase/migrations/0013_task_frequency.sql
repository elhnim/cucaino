alter table public.tasks
  add column if not exists frequency_per_day integer not null default 1;
