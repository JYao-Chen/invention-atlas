CREATE TABLE model_usage(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 actor_id text NOT NULL REFERENCES users(id),kind text NOT NULL CHECK(kind IN('chat','embedding')),
 model text NOT NULL,provider text NOT NULL,status text NOT NULL CHECK(status IN('completed','failed','cancelled')),
 input_tokens bigint CHECK(input_tokens>=0),output_tokens bigint CHECK(output_tokens>=0),total_tokens bigint CHECK(total_tokens>=0),
 duration_ms bigint NOT NULL CHECK(duration_ms>=0),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
ALTER TABLE model_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_read ON model_usage FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY usage_insert ON model_usage FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,false) AND actor_id=nullif(current_setting('app.user_id',true),''));
CREATE INDEX model_usage_project_time ON model_usage(project_id,created_at DESC);
