CREATE TABLE report_tasks(
 id text PRIMARY KEY,report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,revision integer NOT NULL CHECK(revision>=0),
 organization_id text NOT NULL,project_id text NOT NULL,created_by text NOT NULL REFERENCES users(id),assignee_id text NOT NULL REFERENCES users(id),
 title text NOT NULL,body text NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','completed','cancelled')),
 updated_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX report_tasks_version ON report_tasks(report_id,revision,created_at);
ALTER TABLE report_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_task_read ON report_tasks FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY report_task_insert ON report_tasks FOR INSERT WITH CHECK(
 created_by=nullif(current_setting('app.user_id',true),'') AND updated_by=created_by AND atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM reports r WHERE r.id=report_id AND r.organization_id=report_tasks.organization_id AND r.project_id=report_tasks.project_id)
 AND EXISTS(SELECT 1 FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=report_tasks.project_id AND m.organization_id=report_tasks.organization_id AND m.user_id=assignee_id AND m.role IN('owner','analyst') AND u.enabled)
 AND (revision=0 OR EXISTS(SELECT 1 FROM report_versions v WHERE v.report_id=report_tasks.report_id AND v.revision=report_tasks.revision))
);
CREATE POLICY report_task_update ON report_tasks FOR UPDATE USING(
 atlas_project_access(organization_id,project_id,true) AND nullif(current_setting('app.user_id',true),'') IN(created_by,assignee_id)
) WITH CHECK(atlas_project_access(organization_id,project_id,true) AND updated_by=nullif(current_setting('app.user_id',true),'') AND updated_by IN(created_by,assignee_id));
