CREATE TABLE source_record_observations(
 batch_id text NOT NULL REFERENCES source_update_batches(id) ON DELETE CASCADE,
 patent_id text NOT NULL,PRIMARY KEY(batch_id,patent_id)
);
ALTER TABLE source_record_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_observation_read ON source_record_observations FOR SELECT USING(EXISTS(SELECT 1 FROM source_update_batches b WHERE b.id=batch_id));
CREATE POLICY source_observation_insert ON source_record_observations FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM source_update_batches b WHERE b.id=batch_id AND b.created_by=nullif(current_setting('app.user_id',true),'') AND atlas_project_access(b.organization_id,b.project_id,true)));
