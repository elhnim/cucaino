CREATE TABLE kid_daily_task_additions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  kid_id uuid NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(kid_id, task_id, date)
);

ALTER TABLE kid_daily_task_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON kid_daily_task_additions
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());
