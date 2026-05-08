-- Speed up quiz_banks ORDER BY is_builtin DESC, name
CREATE INDEX IF NOT EXISTS quiz_banks_sort_idx ON quiz_banks(is_builtin DESC, name);
