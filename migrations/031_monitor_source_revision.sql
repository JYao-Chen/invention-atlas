ALTER TABLE datasets ADD COLUMN source_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE monitor_subscriptions ADD COLUMN submitted_source_revision bigint NOT NULL DEFAULT 0;
