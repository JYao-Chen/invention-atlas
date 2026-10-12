ALTER TABLE model_usage ADD COLUMN run_id text REFERENCES runs(id) ON DELETE SET NULL;
CREATE INDEX model_usage_run ON model_usage(run_id) WHERE run_id IS NOT NULL;
DROP POLICY usage_insert ON model_usage;
CREATE POLICY usage_insert ON model_usage FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,false)
 AND actor_id=nullif(current_setting('app.user_id',true),'')
 AND (run_id IS NULL OR EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.organization_id=model_usage.organization_id AND r.project_id=model_usage.project_id))
);
