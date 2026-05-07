-- ============================================================================
-- Cucaino — initial schema
--
-- One Supabase auth user = one parent. A `families` row binds the auth user
-- to a household; everything else is keyed off `family_id` and protected
-- by RLS so each family only ever sees their own rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Families
-- ----------------------------------------------------------------------------

create table public.families (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  family_points_balance integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index families_owner_user_id_idx on public.families (owner_user_id);

-- ----------------------------------------------------------------------------
-- 2. Themes (seeded reference data — no family_id)
-- ----------------------------------------------------------------------------

create table public.themes (
  id text primary key,
  name text not null,
  description text,
  header_gradient text not null,
  page_gradient text not null,
  accent text not null,
  accent_soft text not null,
  heading_text text not null,
  decoration text not null,
  flavor text not null
);

insert into public.themes (id, name, description, header_gradient, page_gradient, accent, accent_soft, heading_text, decoration, flavor) values
  ('adventure',  'Adventure', 'Warm orange & amber, fox/forest vibes',          'from-orange-500 to-amber-500',                        'from-orange-50 to-amber-50',           '#f97316', '#fed7aa', 'text-orange-700',  '🦊', 'adventure'),
  ('magical',    'Magical',   'Purple, pink & mint with sparkle accents',       'from-fuchsia-600 via-pink-500 to-teal-500',           'from-fuchsia-50 via-pink-50 to-teal-50','#c026d3', '#f5d0fe', 'text-fuchsia-700', '✨', 'magic'),
  ('galactic',   'Galactic',  'Deep blue & cyan with starry gold',              'from-indigo-700 to-cyan-500',                         'from-indigo-50 to-cyan-50',            '#4f46e5', '#c7d2fe', 'text-indigo-700',  '🚀', 'mission'),
  ('ocean',      'Ocean',     'Cool teal & blue, dolphin energy',               'from-teal-500 to-sky-500',                            'from-teal-50 to-sky-50',               '#0ea5e9', '#bae6fd', 'text-sky-700',     '🐬', 'voyage'),
  ('dino',       'Dino',      'Earthy green & rust, prehistoric fun',           'from-emerald-600 to-amber-600',                       'from-emerald-50 to-amber-50',          '#059669', '#a7f3d0', 'text-emerald-700', '🦕', 'expedition'),
  ('garden',     'Garden',    'Soft green & rose, flower power',                'from-rose-400 to-lime-500',                           'from-rose-50 to-lime-50',              '#e11d48', '#fecdd3', 'text-rose-700',    '🌸', 'bloom');

-- ----------------------------------------------------------------------------
-- 3. Kids
-- ----------------------------------------------------------------------------

create table public.kids (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  age integer,
  avatar text not null default '🦊',
  theme_id text not null references public.themes (id) default 'adventure',
  date_of_birth date,
  pin_hash text,                               -- bcrypt hash; null = no PIN
  points_balance integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date,
  created_at timestamptz not null default now()
);

create index kids_family_id_idx on public.kids (family_id);

-- ----------------------------------------------------------------------------
-- 4. Tasks (chores, exercise, music, activities, personal goals)
-- ----------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid references public.kids (id) on delete cascade,        -- null = both kids
  name text not null,
  category text not null check (category in ('chore','exercise','music','activity','personal')),
  icon text not null default '⭐',
  schedule_type text not null default 'daily' check (schedule_type in ('daily','weekdays','weekends','specific_days')),
  days_of_week smallint[] not null default '{1,2,3,4,5,6,7}',
  time_block text not null default 'anytime' check (time_block in ('before_school','morning','afternoon','after_school','evening','anytime')),
  start_time text,
  duration_minutes integer,
  points integer not null default 0,
  family_points_contribution integer not null default 0,
  requires_timer boolean not null default false,
  requires_completion boolean not null default true,
  location text,
  packing_list text[],
  default_bpm integer,
  default_time_signature text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tasks_family_id_idx on public.tasks (family_id);
create index tasks_kid_id_idx on public.tasks (kid_id);

-- ----------------------------------------------------------------------------
-- 5. Task completions (audit log)
-- ----------------------------------------------------------------------------

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  kid_id uuid not null references public.kids (id) on delete cascade,
  date date not null default current_date,
  completed_at timestamptz not null default now(),
  duration_actual_seconds integer,
  points_awarded integer not null default 0,
  family_points_awarded integer not null default 0,
  unique (task_id, kid_id, date)
);

create index task_completions_kid_date_idx on public.task_completions (kid_id, date);

-- ----------------------------------------------------------------------------
-- 6. School items (per-day "what to bring to school")
-- ----------------------------------------------------------------------------

create table public.school_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid not null references public.kids (id) on delete cascade,
  name text not null,
  icon text not null default '🎒',
  days_of_week smallint[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index school_items_kid_id_idx on public.school_items (kid_id);

-- ----------------------------------------------------------------------------
-- 7. School classes (weekly timetable)
-- ----------------------------------------------------------------------------

create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid not null references public.kids (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  subject text not null check (subject in (
    'math','english','science','history','geography','art',
    'pe','music','library','computing','language','religion',
    'lunch','recess','other'
  )),
  custom_label text,
  start_time text not null,
  end_time text not null,
  room text,
  teacher text,
  created_at timestamptz not null default now()
);

create index school_classes_kid_day_idx on public.school_classes (kid_id, day_of_week);

-- ----------------------------------------------------------------------------
-- 8. Rewards + reward requests
-- ----------------------------------------------------------------------------

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid references public.kids (id) on delete cascade,        -- null = any kid / family
  name text not null,
  description text,
  icon text not null default '🎁',
  cost_points integer not null,
  type text not null check (type in ('individual','family')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index rewards_family_id_idx on public.rewards (family_id);

create table public.reward_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete cascade,
  kid_id uuid not null references public.kids (id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','denied','delivered')),
  parent_note text,
  resolved_at timestamptz,
  points_deducted_at timestamptz
);

create index reward_requests_status_idx on public.reward_requests (family_id, status);

-- ----------------------------------------------------------------------------
-- 9. Badges + kid_badges
-- ----------------------------------------------------------------------------

create table public.badges (
  id text primary key,
  name text not null,
  description text,
  icon text not null,
  criteria jsonb not null
);

insert into public.badges (id, name, description, icon, criteria) values
  ('first-star',    'First Star',    'Complete your very first task',          '🌟', '{"type":"first_completion"}'::jsonb),
  ('streak-3',      '3-Day Streak',  'Keep your streak alive for 3 days',      '🔥', '{"type":"streak","days":3}'::jsonb),
  ('streak-7',      '7-Day Streak',  'A whole week — every day counted',       '🏆', '{"type":"streak","days":7}'::jsonb),
  ('music-maker',   'Music Maker',   'Practice music 5 times',                 '🎹', '{"type":"category_count","category":"music","count":5}'::jsonb),
  ('move-it',       'Move It!',      'Five exercise sessions in the bag',      '🏃', '{"type":"category_count","category":"exercise","count":5}'::jsonb),
  ('birthday-star', 'Birthday Star', 'Visit Cucaino on your birthday',         '🎂', '{"type":"birthday"}'::jsonb);

create table public.kid_badges (
  kid_id uuid not null references public.kids (id) on delete cascade,
  badge_id text not null references public.badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (kid_id, badge_id)
);

-- ----------------------------------------------------------------------------
-- 10. Quiz banks + questions + sessions
-- ----------------------------------------------------------------------------

create table public.quiz_banks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade,    -- null = built-in
  name text not null,
  category text not null check (category in ('maths','spelling','geography','science','silly','custom')),
  min_age integer not null default 6,
  max_age integer not null default 99,
  is_builtin boolean not null default false
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.quiz_banks (id) on delete cascade,
  prompt text not null,
  choices jsonb not null,                       -- [{label, isCorrect}]
  time_limit_seconds integer not null default 10,
  explanation text
);

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  bank_id uuid not null references public.quiz_banks (id) on delete cascade,
  mode text not null check (mode in ('solo','turns','live')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  winner_kid_id uuid references public.kids (id) on delete set null,
  final_scores jsonb
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  kid_id uuid not null references public.kids (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  chosen_index smallint,
  is_correct boolean not null,
  time_taken_ms integer
);

-- ----------------------------------------------------------------------------
-- 11. Feature requests (in-app feedback)
-- ----------------------------------------------------------------------------

create table public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null,
  description text,
  category text not null check (category in ('kid_view','parent_view','quiz','rewards','music','other')),
  status text not null default 'new' check (status in ('new','considering','in_progress','shipped','wont_do')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 12. RLS — every table is locked down to the owning family
-- ----------------------------------------------------------------------------

alter table public.families enable row level security;
alter table public.kids enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.school_items enable row level security;
alter table public.school_classes enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_requests enable row level security;
alter table public.kid_badges enable row level security;
alter table public.quiz_banks enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.feature_requests enable row level security;

-- Public read of seeded reference tables
alter table public.themes enable row level security;
alter table public.badges enable row level security;
create policy "themes are public" on public.themes for select using (true);
create policy "badges are public" on public.badges for select using (true);

-- Helper: a SECURITY DEFINER function to fetch the current user's family id.
-- Avoids re-querying families repeatedly inside policies.
create or replace function public.current_family_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from public.families where owner_user_id = auth.uid() limit 1;
$$;

-- families: parent can read/insert/update their own row
create policy "families: own row" on public.families
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- generic family-scoped table policy template (applied to every other table)
create policy "kids: family scope" on public.kids
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "tasks: family scope" on public.tasks
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "task_completions: family scope" on public.task_completions
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "school_items: family scope" on public.school_items
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "school_classes: family scope" on public.school_classes
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "rewards: family scope" on public.rewards
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "reward_requests: family scope" on public.reward_requests
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "kid_badges: family scope" on public.kid_badges
  for all using (
    kid_id in (select id from public.kids where family_id = public.current_family_id())
  )
  with check (
    kid_id in (select id from public.kids where family_id = public.current_family_id())
  );

create policy "quiz_banks: family or builtin" on public.quiz_banks
  for select using (is_builtin or family_id = public.current_family_id());
create policy "quiz_banks: family writes" on public.quiz_banks
  for insert with check (family_id = public.current_family_id());
create policy "quiz_banks: family updates" on public.quiz_banks
  for update using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
create policy "quiz_banks: family deletes" on public.quiz_banks
  for delete using (family_id = public.current_family_id());

create policy "quiz_questions: bank scope" on public.quiz_questions
  for all using (
    bank_id in (
      select id from public.quiz_banks
      where is_builtin or family_id = public.current_family_id()
    )
  )
  with check (
    bank_id in (
      select id from public.quiz_banks
      where family_id = public.current_family_id()
    )
  );

create policy "quiz_sessions: family scope" on public.quiz_sessions
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

create policy "quiz_answers: session scope" on public.quiz_answers
  for all using (
    session_id in (
      select id from public.quiz_sessions where family_id = public.current_family_id()
    )
  )
  with check (
    session_id in (
      select id from public.quiz_sessions where family_id = public.current_family_id()
    )
  );

create policy "feature_requests: family scope" on public.feature_requests
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
