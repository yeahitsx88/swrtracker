-- Migration 002: CAD sub-track and CLOSED terminal state
-- Adds missing timestamp columns to tickets and introduces the cad_work table.

-- Add missing timestamp columns to tickets
ALTER TABLE tickets
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN closed_at  TIMESTAMPTZ;

-- Add cad_work table
CREATE TABLE cad_work (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        UUID        NOT NULL REFERENCES tickets(id),
  tenant_id        UUID        NOT NULL,
  cad_status       TEXT        NOT NULL DEFAULT 'NOT_REQUIRED'
                               CHECK (cad_status IN (
                                 'NOT_REQUIRED', 'NOT_STARTED', 'IN_PROGRESS', 'QA_PENDING', 'COMPLETE'
                               )),
  cad_assigned_to  UUID        REFERENCES users(id),
  cad_reviewed_by  UUID        REFERENCES users(id),
  cad_completed_at TIMESTAMPTZ
);

CREATE INDEX ON cad_work (tenant_id, ticket_id);
