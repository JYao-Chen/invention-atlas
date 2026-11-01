ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX sessions_id ON sessions(id);
ALTER TABLE sessions ADD COLUMN user_agent text NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN ip_address text NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN created_at bigint;
ALTER TABLE sessions ADD COLUMN last_active_at bigint;
