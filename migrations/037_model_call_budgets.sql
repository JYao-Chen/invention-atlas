CREATE TABLE model_call_budgets(
 run_id text PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
 organization_id text NOT NULL,project_id text NOT NULL,
 max_calls integer NOT NULL CHECK(max_calls>0),started_calls integer NOT NULL DEFAULT 0 CHECK(started_calls>=0),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE model_call_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_read ON model_call_budgets FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY budget_write ON model_call_budgets FOR ALL USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.organization_id=model_call_budgets.organization_id AND r.project_id=model_call_budgets.project_id)
);
