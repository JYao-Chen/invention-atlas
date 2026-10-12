-- Comparison keys contain the original proposal and may exceed PostgreSQL's
-- B-tree entry limit. Index a fixed-size lookup key, retaining the full original.
ALTER TABLE comparison_checkpoints DROP CONSTRAINT comparison_checkpoints_pkey;
ALTER TABLE comparison_checkpoints ADD COLUMN key_hash text GENERATED ALWAYS AS (md5(key)) STORED;
ALTER TABLE comparison_checkpoints ADD PRIMARY KEY(key_hash);
