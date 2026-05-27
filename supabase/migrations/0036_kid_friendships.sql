-- Adds kid_friendships table for cross-family friend relationships

create table public.kid_friendships (
  id         uuid        primary key default gen_random_uuid(),
  kid_id     uuid        not null references public.kids(id) on delete cascade,
  friend_id  uuid        not null references public.kids(id) on delete cascade,
  status     text        not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (kid_id, friend_id),
  check (kid_id <> friend_id)
);

create index if not exists kid_friendships_kid_id_idx    on public.kid_friendships (kid_id);
create index if not exists kid_friendships_friend_id_idx on public.kid_friendships (friend_id);

alter table public.kid_friendships enable row level security;

-- Family can manage friendship rows for their own kids (both sides)
create policy "kid_friendships: family scope" on public.kid_friendships
  for all using (
    kid_id    in (select id from public.kids where family_id = public.current_family_id())
    or friend_id in (select id from public.kids where family_id = public.current_family_id())
  )
  with check (
    kid_id in (select id from public.kids where family_id = public.current_family_id())
  );

-- NOTE: This policy grants SELECT on the full kids row to accepted friends across families.
-- Postgres does not support column-level RLS natively. The app layer only ever selects
-- (id, name, avatar, username) from cross-family reads. Sensitive columns (pin_hash,
-- date_of_birth) are never queried for friends — enforced by application code, not the DB.
create policy "kids: friend read" on public.kids
  for select using (
    id in (
      select friend_id from public.kid_friendships
      where kid_id in (select id from public.kids where family_id = public.current_family_id())
        and status = 'accepted'
    )
    or family_id = public.current_family_id()
  );
