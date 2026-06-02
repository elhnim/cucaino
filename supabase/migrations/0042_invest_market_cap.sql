-- Add market cap (in app-cash whole dollars) to the daily real price cache.
-- Nullable: not every source provides it (ASX may be null); UI hides it when absent.
alter table public.real_asset_prices
  add column if not exists market_cap bigint;
