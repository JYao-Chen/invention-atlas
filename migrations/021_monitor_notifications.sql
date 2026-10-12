CREATE TABLE monitor_notifications(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 recipient_id text NOT NULL REFERENCES users(id),subscription_id text REFERENCES monitor_subscriptions(id) ON DELETE SET NULL,
 run_id text NOT NULL UNIQUE,name text NOT NULL,snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE monitor_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY monitor_notice_read ON monitor_notifications FOR SELECT USING(recipient_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,false));
CREATE POLICY monitor_notice_insert ON monitor_notifications FOR INSERT WITH CHECK(recipient_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true));
CREATE POLICY monitor_notice_readmark ON monitor_notifications FOR UPDATE USING(recipient_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,false)) WITH CHECK(recipient_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,false));
REVOKE UPDATE ON monitor_notifications FROM PUBLIC;
