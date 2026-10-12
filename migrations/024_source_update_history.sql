CREATE TABLE source_update_batches(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 dataset_id text NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
 source_name text NOT NULL,source_url text NOT NULL,observed_at timestamptz NOT NULL,
 created_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 counts jsonb NOT NULL,
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE source_record_versions(
 id text PRIMARY KEY,batch_id text NOT NULL REFERENCES source_update_batches(id) ON DELETE CASCADE,
 organization_id text NOT NULL,project_id text NOT NULL,dataset_id text NOT NULL,
 patent_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
 before_record jsonb,after_record jsonb NOT NULL,
 UNIQUE(dataset_id,patent_id,revision),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
DO $$ DECLARE resource text; BEGIN
 FOREACH resource IN ARRAY ARRAY['source_update_batches','source_record_versions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',resource);
  EXECUTE format('CREATE POLICY source_history_read ON %I FOR SELECT USING(atlas_project_access(organization_id,project_id,false))',resource);
  EXECUTE format('CREATE POLICY source_history_insert ON %I FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true))',resource);
 END LOOP;
END $$;
