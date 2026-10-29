CREATE TABLE IF NOT EXISTS report_conclusion_reviews(
 id text PRIMARY KEY,report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0),conclusion_id text NOT NULL,conclusion jsonb NOT NULL,
 organization_id text NOT NULL,project_id text NOT NULL,reviewer_id text NOT NULL REFERENCES users(id),
 started_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz,
 decision text CHECK(decision IN('accept','modify','reject')),reason text NOT NULL DEFAULT '',
 modified_text text,evidence jsonb NOT NULL DEFAULT '{"patentNumbers":[],"resultIds":[]}',
 CHECK(submitted_at IS NULL OR submitted_at>=started_at),
 CHECK((submitted_at IS NULL AND decision IS NULL) OR (submitted_at IS NOT NULL AND decision IS NOT NULL)),
 CHECK(decision IS NULL OR decision='accept' OR length(trim(reason))>0),
 CHECK((decision='modify' AND modified_text IS NOT NULL AND length(trim(modified_text))>0) OR (decision IS DISTINCT FROM 'modify' AND modified_text IS NULL)),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX IF NOT EXISTS conclusion_reviews_report ON report_conclusion_reviews(report_id,revision,conclusion_id,reviewer_id,submitted_at);
ALTER TABLE report_conclusion_reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename='report_conclusion_reviews' AND policyname='conclusion_review_read') THEN
 CREATE POLICY conclusion_review_read ON report_conclusion_reviews FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
 CREATE POLICY conclusion_review_insert ON report_conclusion_reviews FOR INSERT WITH CHECK(
  reviewer_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)
  AND EXISTS(SELECT 1 FROM reports r WHERE r.id=report_id AND r.organization_id=report_conclusion_reviews.organization_id AND r.project_id=report_conclusion_reviews.project_id)
  AND (revision=0 OR EXISTS(SELECT 1 FROM report_versions v WHERE v.report_id=report_conclusion_reviews.report_id AND v.revision=report_conclusion_reviews.revision))
 );
 CREATE POLICY conclusion_review_submit ON report_conclusion_reviews FOR UPDATE USING(
  submitted_at IS NULL AND reviewer_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)
 ) WITH CHECK(reviewer_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true));
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS retrieval_experiments(
 id text PRIMARY KEY,organization_id text NOT NULL,project_id text NOT NULL,
 -- Historical experiments survive dataset removal, like saved report snapshots.
 -- The INSERT policy still requires an existing dataset in this exact project.
 dataset_id text NOT NULL,operator_id text NOT NULL REFERENCES users(id),
 method text NOT NULL CHECK(method IN('ai','manual_boolean')),query text NOT NULL CHECK(length(trim(query))>0),
 started_at timestamptz NOT NULL,ended_at timestamptz NOT NULL CHECK(ended_at>=started_at),
 patent_numbers jsonb NOT NULL CHECK(jsonb_typeof(patent_numbers)='array'),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX IF NOT EXISTS retrieval_experiments_project ON retrieval_experiments(project_id,created_at,id);
ALTER TABLE retrieval_experiments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename='retrieval_experiments' AND policyname='retrieval_experiment_read') THEN
 CREATE POLICY retrieval_experiment_read ON retrieval_experiments FOR SELECT USING(atlas_project_access(organization_id,project_id,false));
 CREATE POLICY retrieval_experiment_insert ON retrieval_experiments FOR INSERT WITH CHECK(
  operator_id=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(organization_id,project_id,true)
  AND EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND d.organization_id=retrieval_experiments.organization_id AND d.project_id=retrieval_experiments.project_id)
 );
 END IF;
END $$;
