CREATE TABLE technical_disclosures(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 creator_id text NOT NULL REFERENCES users(id),title text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE technical_disclosure_versions(
 disclosure_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
 organization_id text NOT NULL,project_id text NOT NULL,author_id text NOT NULL REFERENCES users(id),
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(disclosure_id,revision),
 FOREIGN KEY(organization_id,project_id,disclosure_id) REFERENCES technical_disclosures(organization_id,project_id,id) ON DELETE CASCADE
);
ALTER TABLE technical_disclosures ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_disclosure_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY disclosure_read ON technical_disclosures FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY disclosure_insert ON technical_disclosures FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true) AND creator_id=nullif(current_setting('app.user_id',true),''));
CREATE POLICY disclosure_update ON technical_disclosures FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true));
CREATE POLICY disclosure_delete ON technical_disclosures FOR DELETE USING(atlas_project_access(organization_id,project_id,true));
CREATE POLICY disclosure_version_read ON technical_disclosure_versions FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY disclosure_version_insert ON technical_disclosure_versions FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true) AND author_id=nullif(current_setting('app.user_id',true),''));
