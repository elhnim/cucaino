-- Invest (real-money, real-price) simulator. Sibling to trading_* (Nugget Market).

-- 0. Per-kid enable flag
alter table public.kids
  add column if not exists investing_enabled boolean not null default false;

-- 1. Invest accounts (one per kid)
create table if not exists public.invest_accounts (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  cash_cents bigint not null default 0,
  total_deposited_cents bigint not null default 0,
  total_withdrawn_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kid_id)
);

-- 2. Holdings (one per kid+asset)
create table if not exists public.invest_holdings (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  asset_symbol text not null,
  quantity numeric(30,12) not null default 0,
  avg_cost_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kid_id, asset_symbol)
);

-- 3. Transactions (ledger)
create table if not exists public.invest_transactions (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  type text not null check (type in ('deposit','withdraw','buy','sell')),
  asset_symbol text,
  quantity numeric(30,12),
  price_cents bigint,
  total_cents bigint not null,
  created_at timestamptz not null default now()
);

-- 4. Daily real prices (global cache)
create table if not exists public.real_asset_prices (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  asset_type text not null check (asset_type in ('stock','crypto')),
  price_cents bigint not null,
  prev_close_cents bigint not null,
  change_pct numeric(10,4) not null default 0,
  quote_currency text not null default 'USD',
  fx_rate_to_cash numeric(18,8) not null default 1,
  news_headline text,
  news_body text,
  news_url text,
  news_impact text,
  price_date date not null,
  created_at timestamptz not null default now(),
  unique (symbol, price_date)
);

-- 5. Investor licences (one per kid)
create table if not exists public.invest_licences (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  lessons_completed jsonb not null default '[]'::jsonb,
  best_score int not null default 0,
  attempts int not null default 0,
  passed_at timestamptz,
  rewarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kid_id)
);

create index if not exists invest_accounts_kid_idx on public.invest_accounts (kid_id);
create index if not exists invest_holdings_kid_idx on public.invest_holdings (kid_id);
create index if not exists invest_transactions_kid_idx on public.invest_transactions (kid_id, created_at desc);
create index if not exists invest_licences_kid_idx on public.invest_licences (kid_id);
create index if not exists real_asset_prices_symbol_date_idx
  on public.real_asset_prices (symbol, price_date desc);

-- RLS
alter table public.invest_accounts enable row level security;
alter table public.invest_holdings enable row level security;
alter table public.invest_transactions enable row level security;
alter table public.invest_licences enable row level security;
alter table public.real_asset_prices enable row level security;

-- Family-scoped policies matching trading_*.
create policy "family_scope" on public.invest_accounts
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
create policy "family_scope" on public.invest_holdings
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
create policy "family_scope" on public.invest_transactions
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
create policy "family_scope" on public.invest_licences
  for all using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());

-- real_asset_prices: readable by all authenticated users; INSERT-only writes.
create policy "authenticated_read" on public.real_asset_prices
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert" on public.real_asset_prices
  for insert with check (auth.uid() is not null);
