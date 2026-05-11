-- Add tags array to quiz_questions2 for precise quiz set filtering
ALTER TABLE quiz_questions2 ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Index for tag lookups
CREATE INDEX IF NOT EXISTS quiz_questions2_tags_idx ON quiz_questions2 USING gin(tags);
