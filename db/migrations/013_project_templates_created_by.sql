-- Migration 013: add created_by to project_templates

ALTER TABLE project_templates
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
