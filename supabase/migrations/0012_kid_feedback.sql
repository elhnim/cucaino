-- Allow kids to submit feedback: add kid_id to feature_requests
alter table public.feature_requests
  add column if not exists kid_id uuid references public.kids (id) on delete set null;
