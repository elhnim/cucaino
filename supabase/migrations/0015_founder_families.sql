alter table public.families add column if not exists is_founder boolean not null default false;

comment on column public.families.is_founder is 'True for the first 20 families to sign up — free forever.';
