-- Add personalities array to kid_pets (set once at adoption, immutable)
ALTER TABLE kid_pets ADD COLUMN IF NOT EXISTS personalities JSONB NOT NULL DEFAULT '[]';
