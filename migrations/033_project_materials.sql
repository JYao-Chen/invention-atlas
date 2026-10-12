CREATE TABLE project_materials(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 filename text NOT NULL,format text NOT NULL,byte_size bigint NOT NULL,
 storage_name text NOT NULL,extraction jsonb NOT NULL,
 created_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 removed_at timestamptz,
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE project_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_read ON project_materials FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY material_insert ON project_materials FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true) AND created_by=nullif(current_setting('app.user_id',true),''));
CREATE POLICY material_update ON project_materials FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true));
CREATE INDEX project_materials_project ON project_materials(project_id,created_at DESC);
