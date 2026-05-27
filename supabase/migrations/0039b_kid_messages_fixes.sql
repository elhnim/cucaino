-- Patch: symmetric friendship check, composite index, idempotent cron
-- Fixes code-review issues C2, I1, I2, m1, m3 on 0039_kid_messages.sql

-- C2: Drop and recreate INSERT policy with symmetric friendship check
drop policy if exists "messages: family insert" on public.messages;

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

-- I1/m1: Composite index for count_unread_messages efficiency (idempotent)
create index if not exists messages_recipient_sender_created_idx
  on public.messages (recipient_id, sender_id, created_at desc);

-- I2: Idempotent pg_cron job — unschedule before scheduling to prevent duplicates
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
