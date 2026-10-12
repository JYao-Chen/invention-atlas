CREATE TABLE report_versions(
 report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0),source_revision integer NOT NULL CHECK(source_revision>=0),
 organization_id text NOT NULL,project_id text NOT NULL,
 title text NOT NULL,answer text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 citation_review text NOT NULL CHECK(citation_review IN('unchanged','needs_review')),
 author_id text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(report_id,revision),CHECK(revision=source_revision+1),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE report_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_version_read ON report_versions FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY report_version_insert ON report_versions FOR INSERT WITH CHECK(author_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM reports r WHERE r.id=report_id AND r.organization_id=report_versions.organization_id AND r.project_id=report_versions.project_id AND atlas_project_access(r.organization_id,r.project_id,true)));
