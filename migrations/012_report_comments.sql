CREATE TABLE report_comments(
 id text PRIMARY KEY,report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0),organization_id text NOT NULL,project_id text NOT NULL,
 author_id text NOT NULL REFERENCES users(id),body text NOT NULL CHECK(length(body)>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX report_comments_version ON report_comments(report_id,revision,created_at);
ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_comment_read ON report_comments FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY report_comment_insert ON report_comments FOR INSERT WITH CHECK(
 author_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM reports r WHERE r.id=report_id AND r.organization_id=report_comments.organization_id AND r.project_id=report_comments.project_id)
 AND (revision=0 OR EXISTS(SELECT 1 FROM report_versions v WHERE v.report_id=report_comments.report_id AND v.revision=report_comments.revision))
);
CREATE POLICY report_comment_update ON report_comments FOR UPDATE USING(author_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)) WITH CHECK(author_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true));
CREATE POLICY report_comment_delete ON report_comments FOR DELETE USING(author_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true));
