ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK(kind IN('analysis','report','professional','fulltext','source-update'));
ALTER TABLE source_update_batches ADD COLUMN run_id text UNIQUE REFERENCES runs(id) ON DELETE SET NULL;
