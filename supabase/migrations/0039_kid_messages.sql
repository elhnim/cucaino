-- Kid messaging: messages + conversation_read_state

-- Main messages table
create table public.messages (
  id           uuid        primary key default gen_random_uuid(),
  sender_id    uuid        not null references public.kids(id) on delete cascade,
  recipient_id uuid        not null references public.kids(id) on delete cascade,
  body         text        not null check (char_length(body) >= 1 and char_length(body) <= 200),
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists messages_recipient_created_idx on public.messages (recipient_id, created_at desc);
create index if not exists messages_sender_created_idx    on public.messages (sender_id,    created_at desc);
-- Composite index for count_unread_messages efficiency (recipient + sender + time)
create index if not exists messages_recipient_sender_created_idx
  on public.messages (recipient_id, sender_id, created_at desc);

alter table public.messages enable row level security;

-- Both sender's family and recipient's family can read message bodies (cross-family design).
-- The app layer only queries this in the context of an established friendship.
create policy "messages: family read" on public.messages
  for select using (
    sender_id    = any(array(select public.get_current_family_kid_ids()))
    or recipient_id = any(array(select public.get_current_family_kid_ids()))
  );

-- Only insert if sender is in your family AND a confirmed friendship exists (symmetric check)
create policy "messages: family insert" on public.messages
  for insert with check (
    sender_id = any(array(select public.get_current_family_kid_ids()))
    and exists (
      select 1 from public.kid_friendships
      where status = 'accepted'
        and ((kid_id = sender_id and friend_id = recipient_id)
          or (kid_id = recipient_id and friend_id = sender_id))
    )
  );

-- Tracks when each kid last read each conversation
create table public.conversation_read_state (
  kid_id       uuid        not null references public.kids(id) on delete cascade,
  other_kid_id uuid        not null references public.kids(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (kid_id, other_kid_id)
);

alter table public.conversation_read_state enable row level security;

create policy "conversation_read_state: family" on public.conversation_read_state
  for all
  using (kid_id = any(array(select public.get_current_family_kid_ids())))
  with check (kid_id = any(array(select public.get_current_family_kid_ids())));

-- Efficient unread count across all conversations for a kid
create or replace function public.count_unread_messages(p_kid_id uuid)
returns bigint
language sql
security invoker
stable
as $$
  select count(*)::bigint
  from public.messages m
  left join public.conversation_read_state crs
    on (crs.kid_id = p_kid_id and crs.other_kid_id = m.sender_id)
  where m.recipient_id = p_kid_id
    and (crs.last_read_at is null or m.created_at > crs.last_read_at)
$$;

-- 30-day cleanup via pg_cron (idempotent: unschedule first, safe no-op if pg_cron not enabled)
do $$
begin
  perform cron.unschedule('delete-old-messages');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'delete-old-messages',
    '0 3 * * *',
    'delete from public.messages where created_at < now() - interval ''30 days'''
  );
exception when others then
  null;
end $$;
