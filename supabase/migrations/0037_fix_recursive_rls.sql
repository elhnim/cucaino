-- Break recursive RLS: the kids: friend read policy subquery reads kids,
-- which triggers itself. Fix by using a SECURITY DEFINER function that
-- queries kids without RLS for the family-scoped lookup.

create or replace function public.get_current_family_kid_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from kids where family_id = current_family_id();
$$;

-- Rebuild kid_friendships policy to use the security definer function
drop policy if exists "kid_friendships: family scope" on public.kid_friendships;

create policy "kid_friendships: family scope" on public.kid_friendships
  for all using (
    kid_id   = any(array(select get_current_family_kid_ids()))
    or friend_id = any(array(select get_current_family_kid_ids()))
  )
  with check (
    kid_id = any(array(select get_current_family_kid_ids()))
  );

-- Rebuild kids: friend read policy to use the security definer function
drop policy if exists "kids: friend read" on public.kids;

create policy "kids: friend read" on public.kids
  for select using (
    family_id = public.current_family_id()
    or id in (
      select friend_id from public.kid_friendships
      where kid_id = any(array(select get_current_family_kid_ids()))
        and status = 'accepted'
    )
  );
