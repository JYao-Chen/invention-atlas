CREATE TABLE professional_tasks(
 id text PRIMARY KEY,
 organization_id text NOT NULL,project_id text NOT NULL,
 actor_id text NOT NULL REFERENCES users(id),
 workflow text NOT NULL,workflow_version text NOT NULL,
 input jsonb NOT NULL,current_stage text NOT NULL,
 status text NOT NULL CHECK(status IN('ready','awaiting_confirmation','completed','cancelled','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE professional_artifacts(
 task_id text NOT NULL REFERENCES professional_tasks(id) ON DELETE CASCADE,
 stage text NOT NULL,revision integer NOT NULL CHECK(revision>0),
 data jsonb NOT NULL,status text NOT NULL CHECK(status IN('proposed','confirmed','stale')),
 author_id text NOT NULL REFERENCES users(id),confirmed_by text REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),confirmed_at timestamptz,
 PRIMARY KEY(task_id,stage,revision)
);
CREATE INDEX professional_tasks_project ON professional_tasks(project_id,updated_at DESC);
ALTER TABLE professional_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY professional_task_read ON professional_tasks FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY professional_task_insert ON professional_tasks FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true) AND actor_id=nullif(current_setting('app.user_id',true),''));
CREATE POLICY professional_task_update ON professional_tasks FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true));
ALTER TABLE professional_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY professional_artifact_read ON professional_artifacts FOR SELECT USING(EXISTS(SELECT 1 FROM professional_tasks t WHERE t.id=task_id));
CREATE POLICY professional_artifact_insert ON professional_artifacts FOR INSERT WITH CHECK(author_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM professional_tasks t WHERE t.id=task_id AND atlas_project_access(t.organization_id,t.project_id,true)));
CREATE POLICY professional_artifact_update ON professional_artifacts FOR UPDATE USING(EXISTS(SELECT 1 FROM professional_tasks t WHERE t.id=task_id AND atlas_project_access(t.organization_id,t.project_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM professional_tasks t WHERE t.id=task_id AND atlas_project_access(t.organization_id,t.project_id,true)));
