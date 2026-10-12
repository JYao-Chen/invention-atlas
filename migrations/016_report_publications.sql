CREATE TABLE report_publications(
 report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
 edition integer NOT NULL CHECK(edition>0),revision integer NOT NULL CHECK(revision>=0),
 organization_id text NOT NULL,project_id text NOT NULL,
 publisher_id text NOT NULL REFERENCES users(id),published_at timestamptz NOT NULL DEFAULT now(),
 snapshot jsonb NOT NULL,
 PRIMARY KEY(report_id,edition),UNIQUE(report_id,revision),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE report_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_publication_read ON report_publications FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY report_publication_insert ON report_publications FOR INSERT WITH CHECK(
 publisher_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM reports r WHERE r.id=report_id AND r.organization_id=report_publications.organization_id AND r.project_id=report_publications.project_id)
);
