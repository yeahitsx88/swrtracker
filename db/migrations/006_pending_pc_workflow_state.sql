-- Migration 006: persist pending Party Chief approval context for workflow alignment
-- Needed to support PENDING_PC_APPROVAL -> { COMPLETED | DELAYED | FIELD_CANCELED }
-- across separate requests without relying on client-supplied final status.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS pending_pc_outcome TEXT
  CHECK (pending_pc_outcome IS NULL OR pending_pc_outcome IN ('COMPLETED', 'DELAYED', 'FIELD_CANCELED'));

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS pending_pc_reason TEXT;
