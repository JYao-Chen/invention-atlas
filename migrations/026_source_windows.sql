ALTER TABLE source_update_batches ADD COLUMN source_windows jsonb NOT NULL DEFAULT '[]'::jsonb;
