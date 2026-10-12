CREATE TABLE jobs(
 id text PRIMARY KEY,run_id text NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES users(id),organization_id text NOT NULL,project_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('analysis','report')),
 payload jsonb NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','completed','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,worker_id text,lease_until timestamptz,
 cancel_requested boolean NOT NULL DEFAULT false,error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX jobs_claim ON jobs(state,created_at) WHERE state IN('queued','running');
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_read ON jobs FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY job_insert ON jobs FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND actor_id=nullif(current_setting('app.user_id',true),'')
 AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.organization_id=jobs.organization_id AND r.project_id=jobs.project_id)
);
CREATE POLICY job_update ON jobs FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true));
