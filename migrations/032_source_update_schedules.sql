CREATE TABLE source_update_schedules(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 dataset_id text NOT NULL UNIQUE REFERENCES datasets(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES users(id),params jsonb NOT NULL,
 interval_hours integer NOT NULL CHECK(interval_hours BETWEEN 1 AND 8760),
 enabled boolean NOT NULL DEFAULT true,next_run_at timestamptz NOT NULL DEFAULT now(),
 last_run_id text REFERENCES runs(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE source_update_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_schedule_read ON source_update_schedules FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY source_schedule_write ON source_update_schedules FOR ALL USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND actor_id=nullif(current_setting('app.user_id',true),'')
 AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND d.organization_id=source_update_schedules.organization_id AND d.project_id=source_update_schedules.project_id)
);
