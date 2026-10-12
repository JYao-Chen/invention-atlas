CREATE TABLE source_update_proposals(
 run_id text PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
 organization_id text NOT NULL,project_id text NOT NULL,
 dataset_id text NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
 created_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 input jsonb NOT NULL,
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE source_update_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_proposal_read ON source_update_proposals FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY source_proposal_insert ON source_update_proposals FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true));
