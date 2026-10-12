CREATE TABLE organization_models(
 organization_id text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 model text NOT NULL,base text NOT NULL,encrypted_key text NOT NULL,
 updated_by text NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE organization_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_model_read ON organization_models FOR SELECT USING(
 organization_id=nullif(current_setting('app.organization_id',true),'')
 AND EXISTS(SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=organization_models.organization_id AND m.user_id=nullif(current_setting('app.user_id',true),'') AND u.enabled)
);
CREATE POLICY organization_model_write ON organization_models FOR ALL USING(
 organization_id=nullif(current_setting('app.organization_id',true),'')
 AND EXISTS(SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=organization_models.organization_id AND m.user_id=nullif(current_setting('app.user_id',true),'') AND m.role='admin' AND u.enabled)
) WITH CHECK(
 organization_id=nullif(current_setting('app.organization_id',true),'')
 AND EXISTS(SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=organization_models.organization_id AND m.user_id=nullif(current_setting('app.user_id',true),'') AND m.role='admin' AND u.enabled)
);
