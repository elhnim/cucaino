-- Adds kid_friendships table for cross-family friend relationships
alter table public.kids enable row level security;

create table public.kid_friendships (
  id         uuid        primary key default gen_random_uuid(),
  kid_id     uuid        not null references public.kids(id) on delete cascade,
  friend_id  uuid        not null references public.kids(id) on delete cascade,
  status     text        not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (kid_id, friend_id)
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

-- Allow reading basic kid info for accepted friends across families
create policy "kids: friend read" on public.kids
  for select using (
    id in (
      select friend_id from public.kid_friendships
      where kid_id in (select id from public.kids where family_id = public.current_family_id())
        and status = 'accepted'
    )
    or family_id = public.current_family_id()
  );
