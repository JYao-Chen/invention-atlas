ALTER TABLE sessions ADD COLUMN project_id text REFERENCES projects(id);
