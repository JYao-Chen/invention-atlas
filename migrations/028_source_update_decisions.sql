ALTER TABLE source_update_batches ADD COLUMN decisions jsonb NOT NULL DEFAULT '[]'::jsonb;
