CREATE TABLE monitor_subscriptions(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 subscriber_id text NOT NULL REFERENCES users(id),dataset_id text NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
 name text NOT NULL,params jsonb NOT NULL,interval_hours integer NOT NULL CHECK(interval_hours BETWEEN 1 AND 8760),
 enabled boolean NOT NULL DEFAULT true,next_run_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX monitor_subscription_due ON monitor_subscriptions(next_run_at) WHERE enabled;
ALTER TABLE monitor_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY monitor_subscription_read ON monitor_subscriptions FOR SELECT USING(subscriber_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,false));
CREATE POLICY monitor_subscription_insert ON monitor_subscriptions FOR INSERT WITH CHECK(subscriber_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true) AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND d.organization_id=monitor_subscriptions.organization_id AND d.project_id=monitor_subscriptions.project_id));
CREATE POLICY monitor_subscription_update ON monitor_subscriptions FOR UPDATE USING(subscriber_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)) WITH CHECK(subscriber_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true));
CREATE POLICY monitor_subscription_delete ON monitor_subscriptions FOR DELETE USING(subscriber_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true));
