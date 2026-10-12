ALTER TABLE jobs ALTER COLUMN run_id DROP NOT NULL;
ALTER TABLE jobs ADD COLUMN material_id text REFERENCES project_materials(id);
ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK(kind IN('analysis','report','professional','fulltext','source-update','material-ocr'));
ALTER TABLE jobs ADD CONSTRAINT jobs_target_check CHECK(
 (kind='material-ocr' AND run_id IS NULL AND material_id IS NOT NULL)
 OR (kind<>'material-ocr' AND run_id IS NOT NULL AND material_id IS NULL)
);
DROP POLICY job_insert ON jobs;
CREATE POLICY job_insert ON jobs FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND actor_id=nullif(current_setting('app.user_id',true),'')
 AND (
  (kind<>'material-ocr' AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.organization_id=jobs.organization_id AND r.project_id=jobs.project_id))
  OR (kind='material-ocr' AND EXISTS(SELECT 1 FROM project_materials m WHERE m.id=material_id AND m.removed_at IS NULL AND m.organization_id=jobs.organization_id AND m.project_id=jobs.project_id))
 )
);
CREATE UNIQUE INDEX material_ocr_active ON jobs(material_id) WHERE kind='material-ocr' AND state IN('queued','running');
CREATE TABLE material_ocr_pages(
 job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,page integer NOT NULL CHECK(page>0),
 organization_id text NOT NULL,project_id text NOT NULL,payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(job_id,page),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE material_ocr_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_ocr_page_read ON material_ocr_pages FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY material_ocr_page_insert ON material_ocr_pages FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=job_id AND j.kind='material-ocr' AND j.organization_id=material_ocr_pages.organization_id AND j.project_id=material_ocr_pages.project_id AND j.payload->'pages' @> to_jsonb(ARRAY[page]))
);
