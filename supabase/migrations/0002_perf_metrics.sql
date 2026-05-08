create table perf_metrics (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  metric_name text not null,
  value       float8 not null,
  rating      text,
  page        text,
  kid_id      uuid references kids(id) on delete set null,
  app_version text,
  query_name  text,
  device_type text
);
