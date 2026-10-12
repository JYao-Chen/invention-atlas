-- Track started requests even before a limit is configured.
ALTER TABLE model_call_budgets ALTER COLUMN max_calls DROP NOT NULL;
