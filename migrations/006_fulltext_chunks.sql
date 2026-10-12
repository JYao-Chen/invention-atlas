CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE patent_documents(
 dataset_id text NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
 patent_id text NOT NULL,version text NOT NULL,
 source_url text NOT NULL,source_name text NOT NULL,
 source_fields jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(dataset_id,patent_id,version)
);
CREATE TABLE patent_chunks(
 dataset_id text NOT NULL,patent_id text NOT NULL,document_version text NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>=0),section text NOT NULL CHECK(section IN('abstract','description','claim')),
 source_start integer NOT NULL CHECK(source_start>=0),source_end integer NOT NULL,
 text text NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(dataset_id,patent_id,document_version,ordinal),
 CHECK(source_end>source_start),
 FOREIGN KEY(dataset_id,patent_id,document_version) REFERENCES patent_documents(dataset_id,patent_id,version) ON DELETE CASCADE
);
CREATE TABLE chunk_embeddings(
 dataset_id text NOT NULL,patent_id text NOT NULL,document_version text NOT NULL,ordinal integer NOT NULL,
 model text NOT NULL,dimensions integer NOT NULL CHECK(dimensions>0),embedding public.vector NOT NULL,
 PRIMARY KEY(dataset_id,patent_id,document_version,ordinal,model,dimensions),
 CHECK(public.vector_dims(embedding)=dimensions),
 FOREIGN KEY(dataset_id,patent_id,document_version,ordinal) REFERENCES patent_chunks(dataset_id,patent_id,document_version,ordinal) ON DELETE CASCADE
);
CREATE INDEX patent_chunks_section ON patent_chunks(dataset_id,section);

DO $$ DECLARE resource text; BEGIN
 FOREACH resource IN ARRAY ARRAY['patent_documents','patent_chunks','chunk_embeddings'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',resource);
  EXECUTE format('CREATE POLICY document_read ON %I FOR SELECT USING(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id))',resource);
  EXECUTE format('CREATE POLICY document_insert ON %I FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND atlas_project_access(d.organization_id,d.project_id,true)))',resource);
  EXECUTE format('CREATE POLICY document_update ON %I FOR UPDATE USING(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND atlas_project_access(d.organization_id,d.project_id,true))) WITH CHECK(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND atlas_project_access(d.organization_id,d.project_id,true)))',resource);
  EXECUTE format('CREATE POLICY document_delete ON %I FOR DELETE USING(EXISTS(SELECT 1 FROM datasets d WHERE d.id=dataset_id AND atlas_project_access(d.organization_id,d.project_id,true)))',resource);
 END LOOP;
END $$;
