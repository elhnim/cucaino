-- Fix RLS on trading_portfolios
DROP POLICY IF EXISTS "family_scope" ON public.trading_portfolios;
CREATE POLICY "family_scope" ON public.trading_portfolios
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- Fix RLS on trading_holdings
DROP POLICY IF EXISTS "family_scope" ON public.trading_holdings;
CREATE POLICY "family_scope" ON public.trading_holdings
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- Fix RLS on trading_transactions
DROP POLICY IF EXISTS "family_scope" ON public.trading_transactions;
CREATE POLICY "family_scope" ON public.trading_transactions
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- Remove dangerous write policy on trading_asset_prices
DROP POLICY IF EXISTS "authenticated_write" ON public.trading_asset_prices;

-- Add type CHECK constraint
ALTER TABLE public.trading_transactions
  ADD CONSTRAINT trading_transactions_type_check
  CHECK (type IN ('buy', 'sell', 'deposit', 'withdraw', 'dividend'));

-- Add missing portfolio index
CREATE INDEX IF NOT EXISTS trading_portfolios_kid_idx ON public.trading_portfolios (kid_id);
