ALTER TABLE monitor_subscriptions ADD COLUMN last_run_id text REFERENCES runs(id) ON DELETE SET NULL;
