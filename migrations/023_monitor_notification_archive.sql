ALTER TABLE monitor_notifications ADD COLUMN archived_at timestamptz;
CREATE INDEX monitor_notice_archive_page ON monitor_notifications(recipient_id,project_id,created_at DESC,id) WHERE archived_at IS NULL;
