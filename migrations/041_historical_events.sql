-- Legacy SQLite retained events after deleting their runs. Preserve their original
-- IDs and payloads during import. RLS still hides detached events and requires a
-- writable, existing run for every runtime insertion; normal deletion cleans them.
ALTER TABLE events DROP CONSTRAINT events_run_id_fkey;
