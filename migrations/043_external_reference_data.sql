-- Global reference data: no organization ownership; only table owners/maintenance
-- roles bypass RLS. Runtime roles receive SELECT policy only, even with broad grants.
CREATE TABLE IF NOT EXISTS external_sources(
 id text PRIMARY KEY,name text NOT NULL,version text NOT NULL,url text NOT NULL,
 license text NOT NULL,retrieved_at timestamptz NOT NULL,sha256 text,
 row_count bigint NOT NULL DEFAULT 0,bytes bigint NOT NULL DEFAULT 0,
 subset_rule text NOT NULL,notes jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS ext_patents(
 patent_number text NOT NULL,patent_type text NOT NULL,application_date date,grant_date date,
 cpc jsonb NOT NULL DEFAULT '[]',assignees jsonb NOT NULL DEFAULT '[]',
 assignee_countries jsonb NOT NULL DEFAULT '[]',claims_count integer CHECK(claims_count>=0),
 source_id text NOT NULL REFERENCES external_sources(id),PRIMARY KEY(patent_number,source_id)
);
CREATE TABLE IF NOT EXISTS ext_patent_citations(
 citing_patent text NOT NULL,cited_patent text NOT NULL,category text NOT NULL DEFAULT '',
 purpose text NOT NULL CHECK(purpose IN ('D1','D2')),source_id text NOT NULL REFERENCES external_sources(id),
 PRIMARY KEY(citing_patent,cited_patent,category,purpose,source_id)
);
CREATE INDEX IF NOT EXISTS ext_citations_cited ON ext_patent_citations(cited_patent);
CREATE TABLE IF NOT EXISTS ext_maintenance_events(
 patent_number text NOT NULL,event_date date NOT NULL,event_code text NOT NULL,
 entity_type text NOT NULL DEFAULT '',source_id text NOT NULL REFERENCES external_sources(id),
 PRIMARY KEY(patent_number,event_date,event_code,entity_type,source_id)
);
CREATE TABLE IF NOT EXISTS ext_patent_paper_links(
 patent_number text NOT NULL,work_id text NOT NULL,confidence double precision,
 reference_type text NOT NULL DEFAULT '',self_citation boolean,where_found text NOT NULL DEFAULT '',
 source_id text NOT NULL REFERENCES external_sources(id),
 PRIMARY KEY(patent_number,work_id,reference_type,where_found,source_id)
);
CREATE INDEX IF NOT EXISTS ext_paper_links_work ON ext_patent_paper_links(work_id);
CREATE TABLE IF NOT EXISTS ext_papers(
 work_id text NOT NULL,doi text,title text,year integer,venue text,type text,cited_by_count bigint,
 primary_topic jsonb,topics jsonb NOT NULL DEFAULT '[]',retrieved_at timestamptz NOT NULL,
 source_id text NOT NULL REFERENCES external_sources(id),PRIMARY KEY(work_id,source_id)
);
-- Distinguishes a completed scan with zero matches from a source never scanned.
CREATE TABLE IF NOT EXISTS external_source_seeds(
 source_id text NOT NULL REFERENCES external_sources(id),patent_number text NOT NULL,
 purpose text NOT NULL,PRIMARY KEY(source_id,patent_number,purpose)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['external_sources','ext_patents','ext_patent_citations','ext_maintenance_events','ext_patent_paper_links','ext_papers','external_source_seeds'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='atlas_runtime') THEN
   EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON %I FROM atlas_runtime',t);
   EXECUTE format('GRANT SELECT ON %I TO atlas_runtime',t);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename=t AND policyname='external_reference_read') THEN
   EXECUTE format('CREATE POLICY external_reference_read ON %I FOR SELECT USING(true)',t);
  END IF;
 END LOOP;
END $$;
