-- Adds a globally-unique, case-insensitive username to kids (future messaging feature)
alter table public.kids
  add column if not exists username text
    check (username ~ '^[a-zA-Z0-9_]{3,20}$');

create unique index if not exists kids_username_lower_idx
  on public.kids (lower(username));
