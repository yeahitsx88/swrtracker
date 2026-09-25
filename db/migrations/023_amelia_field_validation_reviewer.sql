-- Capture the reviewer selected when an Instrument Man reports that work
-- cannot be performed. The assigned Party Chief is used when present;
-- otherwise the Survey Lead is captured.

ALTER TABLE tickets
  ADD COLUMN field_validation_reviewer_id UUID;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_field_validation_reviewer_fkey
  FOREIGN KEY (tenant_id, field_validation_reviewer_id) REFERENCES users(tenant_id, id);
