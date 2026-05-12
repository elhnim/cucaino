ALTER TABLE families
  ADD COLUMN IF NOT EXISTS weather_city text,
  ADD COLUMN IF NOT EXISTS weather_lat  double precision,
  ADD COLUMN IF NOT EXISTS weather_lon  double precision;
