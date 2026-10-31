ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK(kind IN('analysis','report','professional','fulltext','source-update','material-ocr','research'));
CREATE TABLE research_tasks(
 id text PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
 organization_id text NOT NULL,project_id text NOT NULL,actor_id text NOT NULL REFERENCES users(id),
 input jsonb NOT NULL,title text NOT NULL,status text NOT NULL CHECK(status IN('queued','running','awaiting_outline','paused','completed','failed')),
 outline jsonb NOT NULL DEFAULT '[]',outline_confirmed boolean NOT NULL DEFAULT false,
 feedback jsonb NOT NULL DEFAULT '[]',error text NOT NULL DEFAULT '',report_id text REFERENCES reports(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX research_tasks_project ON research_tasks(project_id,updated_at DESC);
ALTER TABLE research_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_task_read ON research_tasks FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
CREATE POLICY research_task_insert ON research_tasks FOR INSERT WITH CHECK(atlas_project_access(organization_id,project_id,true) AND actor_id=nullif(current_setting('app.user_id',true),'') AND EXISTS(SELECT 1 FROM runs r WHERE r.id=research_tasks.id AND r.project_id=research_tasks.project_id AND r.organization_id=research_tasks.organization_id));
CREATE POLICY research_task_update ON research_tasks FOR UPDATE USING(atlas_project_access(organization_id,project_id,true)) WITH CHECK(atlas_project_access(organization_id,project_id,true));
CREATE TABLE research_chapters(
 task_id text NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,id text NOT NULL,
 body text NOT NULL,findings text NOT NULL,evidence_ids jsonb NOT NULL,revision integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(task_id,id)
);
CREATE TABLE research_chapter_versions(
 task_id text NOT NULL,chapter_id text NOT NULL,revision integer NOT NULL,body text NOT NULL,findings text NOT NULL,evidence_ids jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(task_id,chapter_id,revision),
 FOREIGN KEY(task_id,chapter_id) REFERENCES research_chapters(task_id,id) ON DELETE CASCADE
);
CREATE TABLE research_evidence(
 task_id text NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,id text NOT NULL,payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(task_id,id)
);
CREATE TABLE research_checkpoints(
 task_id text NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,namespace text NOT NULL,id text NOT NULL,parent_id text,
 value_type text NOT NULL,value bytea NOT NULL,metadata jsonb NOT NULL,PRIMARY KEY(task_id,namespace,id)
);
CREATE TABLE research_checkpoint_writes(
 task_id text NOT NULL REFERENCES research_tasks(id) ON DELETE CASCADE,namespace text NOT NULL,checkpoint_id text NOT NULL,
 writer_id text NOT NULL,idx integer NOT NULL,channel text NOT NULL,value_type text NOT NULL,value bytea NOT NULL,task_path text NOT NULL DEFAULT '',
 PRIMARY KEY(task_id,namespace,checkpoint_id,writer_id,idx)
);
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['research_chapters','research_chapter_versions','research_evidence','research_checkpoints','research_checkpoint_writes'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
 EXECUTE format('CREATE POLICY research_read ON %I FOR SELECT USING(EXISTS(SELECT 1 FROM research_tasks t WHERE t.id=task_id))',table_name);
 EXECUTE format('CREATE POLICY research_write ON %I FOR ALL USING(EXISTS(SELECT 1 FROM research_tasks t WHERE t.id=task_id AND atlas_project_access(t.organization_id,t.project_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM research_tasks t WHERE t.id=task_id AND atlas_project_access(t.organization_id,t.project_id,true)))',table_name);
 END LOOP;
END $$;
