create or replace function public.founder_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from public.families where is_founder = true;
$$;
