-- Authentication precedes project context, like sessions; service queries bind user/project.
CREATE TABLE project_api_credentials(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),
 organization_id text NOT NULL,project_id text NOT NULL,
 name text NOT NULL,access text NOT NULL CHECK(access IN('read','write')),
 token_hash text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 FOREIGN KEY(project_id,user_id) REFERENCES project_members(project_id,user_id) ON DELETE CASCADE
);
