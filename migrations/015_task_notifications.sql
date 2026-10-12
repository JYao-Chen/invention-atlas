CREATE TABLE task_notifications(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 recipient_id text NOT NULL REFERENCES users(id),actor_id text NOT NULL REFERENCES users(id),
 task_id text NOT NULL REFERENCES report_tasks(id) ON DELETE CASCADE,report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
 revision integer NOT NULL,kind text NOT NULL CHECK(kind IN('assigned','reassigned','start','complete','reopen','cancel')),
 title text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX task_notifications_inbox ON task_notifications(recipient_id,project_id,created_at);
ALTER TABLE task_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_notification_read ON task_notifications FOR SELECT USING(recipient_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,false));
CREATE POLICY task_notification_insert ON task_notifications FOR INSERT WITH CHECK(
 actor_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM report_tasks t WHERE t.id=task_id AND t.report_id=task_notifications.report_id AND t.organization_id=task_notifications.organization_id AND t.project_id=task_notifications.project_id AND t.revision=task_notifications.revision)
 AND EXISTS(SELECT 1 FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=task_notifications.project_id AND m.organization_id=task_notifications.organization_id AND m.user_id=recipient_id AND u.enabled)
);
CREATE POLICY task_notification_update ON task_notifications FOR UPDATE USING(recipient_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,false)) WITH CHECK(recipient_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,false));
