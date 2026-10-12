CREATE TABLE report_shares(
 id text PRIMARY KEY,report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,revision integer NOT NULL CHECK(revision>=0),
 organization_id text NOT NULL,project_id text NOT NULL,recipient_id text NOT NULL REFERENCES users(id),created_by text NOT NULL REFERENCES users(id),
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX report_shares_recipient ON report_shares(recipient_id,created_at);
ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_share_read ON report_shares FOR SELECT USING(
 atlas_project_access(organization_id,project_id,false)
 OR (recipient_id=nullif(current_setting('app.user_id',true),'') AND revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=report_shares.organization_id AND m.user_id=report_shares.recipient_id AND u.enabled))
);
CREATE POLICY report_share_insert ON report_shares FOR INSERT WITH CHECK(
 created_by=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)
 AND EXISTS(SELECT 1 FROM reports r WHERE r.id=report_id AND r.organization_id=report_shares.organization_id AND r.project_id=report_shares.project_id)
 AND EXISTS(SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=report_shares.organization_id AND m.user_id=recipient_id AND u.enabled)
);
CREATE POLICY report_share_revoke ON report_shares FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true));
