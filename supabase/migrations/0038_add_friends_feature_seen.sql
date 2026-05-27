alter table public.kids
  add column if not exists friends_feature_seen boolean not null default false;
