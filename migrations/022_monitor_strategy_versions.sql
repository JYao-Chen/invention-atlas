ALTER TABLE monitor_subscriptions ADD COLUMN strategy_revision integer NOT NULL DEFAULT 1 CHECK(strategy_revision>0);
CREATE TABLE monitor_subscription_versions(
 subscription_id text NOT NULL REFERENCES monitor_subscriptions(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0),params jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(subscription_id,revision)
);
INSERT INTO monitor_subscription_versions(subscription_id,revision,params,created_at)
 SELECT id,1,params,created_at FROM monitor_subscriptions;
ALTER TABLE monitor_subscription_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY monitor_version_read ON monitor_subscription_versions FOR SELECT USING(
 EXISTS(SELECT 1 FROM monitor_subscriptions s WHERE s.id=subscription_id)
);
CREATE POLICY monitor_version_insert ON monitor_subscription_versions FOR INSERT WITH CHECK(
 EXISTS(SELECT 1 FROM monitor_subscriptions s WHERE s.id=subscription_id AND s.strategy_revision=revision
  AND s.params=monitor_subscription_versions.params AND atlas_project_access(s.organization_id,s.project_id,true))
);
