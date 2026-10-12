-- Conversations are historical artifacts and may outlive their source dataset.
ALTER TABLE conversations DROP CONSTRAINT conversations_dataset_id_fkey;
