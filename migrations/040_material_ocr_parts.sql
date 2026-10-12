CREATE TABLE material_ocr_parts(
 job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 part integer NOT NULL CHECK(part>0),organization_id text NOT NULL,project_id text NOT NULL,
 payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(job_id,part),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE material_ocr_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_ocr_part_read ON material_ocr_parts FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY material_ocr_part_write ON material_ocr_parts FOR ALL USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=job_id AND j.kind='material-ocr' AND j.organization_id=material_ocr_parts.organization_id AND j.project_id=material_ocr_parts.project_id)
);
