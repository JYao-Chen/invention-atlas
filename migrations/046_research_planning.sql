ALTER TABLE research_tasks ADD COLUMN brief jsonb;
ALTER TABLE research_tasks ADD COLUMN planning_history jsonb NOT NULL DEFAULT '[]';
