CREATE TABLE users(
 id text PRIMARY KEY, username text NOT NULL UNIQUE, display_name text NOT NULL,
 password_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 platform_role text NOT NULL DEFAULT 'member' CHECK(platform_role IN ('admin','member')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organizations(id text PRIMARY KEY,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE organization_members(
 organization_id text NOT NULL REFERENCES organizations(id),user_id text NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK(role IN ('admin','member')),PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE projects(
 id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),name text NOT NULL,
 description text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,id)
);
CREATE TABLE project_members(
 organization_id text NOT NULL,project_id text NOT NULL,user_id text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','analyst','reader')),PRIMARY KEY(project_id,user_id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_members(organization_id,user_id)
);
CREATE TABLE invites(
 token text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),
 created_by text NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL,
 consumed_by text REFERENCES users(id),consumed_at timestamptz
);
ALTER TABLE sessions ADD COLUMN user_id text REFERENCES users(id);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE activity_logs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id text REFERENCES users(id),
 organization_id text REFERENCES organizations(id),action text NOT NULL,subject_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
