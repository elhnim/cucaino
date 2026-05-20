-- Allow authenticated users to INSERT price rows.
-- UPDATE is intentionally excluded: once a price is written for a given (symbol, date), it cannot be changed.
-- The ensureDailyPrices() function uses ignoreDuplicates:true upsert, so only the first writer wins.
CREATE POLICY "authenticated_insert" ON public.trading_asset_prices
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
