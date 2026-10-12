ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK(kind IN('analysis','report','professional'));
ALTER TABLE professional_tasks DROP CONSTRAINT professional_tasks_status_check;
ALTER TABLE professional_tasks ADD CONSTRAINT professional_tasks_status_check CHECK(status IN('ready','queued','running','awaiting_confirmation','completed','cancelled','failed'));
ALTER TABLE professional_tasks ADD COLUMN execution_run_id text REFERENCES runs(id) ON DELETE SET NULL;
