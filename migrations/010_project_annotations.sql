CREATE TABLE project_labels(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 name text NOT NULL CHECK(length(trim(name))>0),parent_id text,
 created_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 FOREIGN KEY(organization_id,project_id,parent_id) REFERENCES project_labels(organization_id,project_id,id),
 CHECK(parent_id IS DISTINCT FROM id)
);
CREATE TABLE patent_annotations(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 dataset_id text NOT NULL,patent_id text NOT NULL,label_id text,
 body text NOT NULL DEFAULT '',origin text NOT NULL CHECK(origin IN('manual','ai-suggestion')),
 status text NOT NULL CHECK(status IN('proposed','confirmed')),
 created_by text NOT NULL REFERENCES users(id),confirmed_by text REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 FOREIGN KEY(dataset_id,patent_id) REFERENCES patents(dataset_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,project_id,label_id) REFERENCES project_labels(organization_id,project_id,id),
 CHECK(label_id IS NOT NULL OR length(trim(body))>0)
);
CREATE INDEX project_labels_project ON project_labels(project_id,parent_id);
CREATE INDEX patent_annotations_patent ON patent_annotations(project_id,dataset_id,patent_id,created_at);
DO $$ DECLARE resource text; BEGIN
 FOREACH resource IN ARRAY ARRAY['project_labels','patent_annotations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',resource);
  EXECUTE format('CREATE POLICY annotation_read ON %I FOR SELECT USING(atlas_project_access(organization_id,project_id,false))',resource);
  EXECUTE format('CREATE POLICY annotation_insert ON %I FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true) AND created_by=nullif(current_setting(''app.user_id'',true),''''))',resource);
  EXECUTE format('CREATE POLICY annotation_update ON %I FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true))',resource);
  EXECUTE format('CREATE POLICY annotation_delete ON %I FOR DELETE USING(atlas_project_access(organization_id,project_id,true))',resource);
 END LOOP;
END $$;
