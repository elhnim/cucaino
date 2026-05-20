CREATE TABLE IF NOT EXISTS public.trading_portfolios (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kid_id                uuid        NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  nuggets_balance       bigint      NOT NULL DEFAULT 0,
  total_deposited_stars integer     NOT NULL DEFAULT 0,
  total_withdrawn_stars integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trading_portfolios_kid_id_key UNIQUE (kid_id)
);

CREATE TABLE IF NOT EXISTS public.trading_holdings (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid    NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kid_id           uuid    NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  asset_symbol     text    NOT NULL,
  quantity         numeric NOT NULL DEFAULT 0,
  avg_cost_nuggets numeric NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trading_holdings_kid_asset_key UNIQUE (kid_id, asset_symbol)
);

CREATE TABLE IF NOT EXISTS public.trading_transactions (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid    NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kid_id         uuid    NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  type           text    NOT NULL CHECK (type IN ('buy', 'sell', 'deposit', 'withdraw', 'dividend')),
  asset_symbol   text,
  quantity       numeric,
  price_nuggets  numeric,
  total_nuggets  bigint  NOT NULL,
  fee_nuggets    integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trading_asset_prices (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol         text    NOT NULL,
  price_nuggets  integer NOT NULL,
  price_date     date    NOT NULL DEFAULT CURRENT_DATE,
  news_headline  text,
  news_impact    text,
  event_pct      numeric,
  generated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trading_asset_prices_symbol_date_key UNIQUE (symbol, price_date)
);

CREATE INDEX IF NOT EXISTS trading_portfolios_kid_idx      ON public.trading_portfolios (kid_id);
CREATE INDEX IF NOT EXISTS trading_holdings_kid_idx        ON public.trading_holdings (kid_id);
CREATE INDEX IF NOT EXISTS trading_transactions_kid_idx    ON public.trading_transactions (kid_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trading_asset_prices_symbol_idx ON public.trading_asset_prices (symbol, price_date DESC);

ALTER TABLE public.trading_portfolios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_holdings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_asset_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.trading_portfolios
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "family_scope" ON public.trading_holdings
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "family_scope" ON public.trading_transactions
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

CREATE POLICY "public_read" ON public.trading_asset_prices
  FOR SELECT USING (true);
