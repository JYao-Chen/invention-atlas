CREATE TABLE user_preferences(user_id text NOT NULL REFERENCES users(id),key text NOT NULL,value text NOT NULL,PRIMARY KEY(user_id,key));

ALTER TABLE datasets ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE datasets ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE conversations ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE conversations ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE runs ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE runs ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE reports ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE reports ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE results ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE results ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE settings ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE settings ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE monitors ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE monitors ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE claim_checkpoints ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE claim_checkpoints ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE effect_checkpoints ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE effect_checkpoints ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');
ALTER TABLE comparison_checkpoints ADD COLUMN organization_id text DEFAULT nullif(current_setting('app.organization_id',true),'');
ALTER TABLE comparison_checkpoints ADD COLUMN project_id text DEFAULT nullif(current_setting('app.project_id',true),'');

CREATE FUNCTION atlas_project_access(org text,project text,writing boolean) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT org=nullif(current_setting('app.organization_id',true),'')
 AND project=nullif(current_setting('app.project_id',true),'')
 AND EXISTS(
  SELECT 1 FROM project_members p JOIN organization_members m ON m.organization_id=p.organization_id AND m.user_id=p.user_id JOIN users u ON u.id=p.user_id
  WHERE p.organization_id=org AND p.project_id=project AND p.user_id=nullif(current_setting('app.user_id',true),'') AND u.enabled
  AND (NOT writing OR p.role IN ('owner','analyst'))
 )
$$;

DO $$ DECLARE resource text; BEGIN
 FOREACH resource IN ARRAY ARRAY['datasets','conversations','runs','reports','results','settings','monitors','claim_checkpoints','effect_checkpoints','comparison_checkpoints'] LOOP
  EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)',resource);
  EXECUTE format('CREATE INDEX %I ON %I(organization_id,project_id)',resource||'_project',resource);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',resource);
  EXECUTE format('CREATE POLICY project_read ON %I FOR SELECT USING(atlas_project_access(organization_id,project_id,false))',resource);
  EXECUTE format('CREATE POLICY project_insert ON %I FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true))',resource);
  EXECUTE format('CREATE POLICY project_update ON %I FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true))',resource);
  EXECUTE format('CREATE POLICY project_delete ON %I FOR DELETE USING(atlas_project_access(organization_id,project_id,true))',resource);
 END LOOP;
END $$;

DROP POLICY project_insert ON conversations;
CREATE POLICY project_insert ON conversations FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND d.organization_id=conversations.organization_id AND d.project_id=conversations.project_id)
);
DROP POLICY project_insert ON runs;
CREATE POLICY project_insert ON runs FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM conversations c WHERE c.id=conversation_id AND c.organization_id=runs.organization_id AND c.project_id=runs.project_id AND c.dataset_id=runs.payload->>'datasetId')
);
DROP POLICY project_insert ON reports;
CREATE POLICY project_insert ON reports FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.organization_id=reports.organization_id AND r.project_id=reports.project_id)
);
DROP POLICY project_insert ON results;
CREATE POLICY project_insert ON results FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=results.payload->>'datasetId' AND d.organization_id=results.organization_id AND d.project_id=results.project_id)
);

DROP POLICY project_insert ON claim_checkpoints;
CREATE POLICY project_insert ON claim_checkpoints FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND d.organization_id=claim_checkpoints.organization_id AND d.project_id=claim_checkpoints.project_id)
);
DROP POLICY project_insert ON effect_checkpoints;
CREATE POLICY project_insert ON effect_checkpoints FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND d.organization_id=effect_checkpoints.organization_id AND d.project_id=effect_checkpoints.project_id)
);
DROP POLICY project_insert ON comparison_checkpoints;
CREATE POLICY project_insert ON comparison_checkpoints FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=(comparison_checkpoints.key::jsonb->>1) AND d.organization_id=comparison_checkpoints.organization_id AND d.project_id=comparison_checkpoints.project_id)
);
DROP POLICY project_insert ON monitors;
CREATE POLICY project_insert ON monitors FOR INSERT WITH CHECK(
 atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=(monitors.key::jsonb->>0) AND d.organization_id=monitors.organization_id AND d.project_id=monitors.project_id)
);

ALTER TABLE patents ENABLE ROW LEVEL SECURITY;
CREATE POLICY patent_read ON patents FOR SELECT USING(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id));
CREATE POLICY patent_write ON patents FOR ALL USING(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND atlas_project_access(d.organization_id,d.project_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND atlas_project_access(d.organization_id,d.project_id,true)));
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_read ON events FOR SELECT USING(EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id));
CREATE POLICY event_write ON events FOR ALL USING(EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND atlas_project_access(r.organization_id,r.project_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND atlas_project_access(r.organization_id,r.project_id,true)));
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_preferences ON user_preferences FOR ALL USING(user_id=nullif(current_setting('app.user_id',true),'')) WITH CHECK(user_id=nullif(current_setting('app.user_id',true),''));
