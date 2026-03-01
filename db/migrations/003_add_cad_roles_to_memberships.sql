-- Migration 003: Add CAD_TECHNICIAN and CAD_LEAD to the project_memberships role constraint.
-- The TypeScript types were updated in the Phase 1 correction; this aligns the DB CHECK constraint.

ALTER TABLE project_memberships
  DROP CONSTRAINT IF EXISTS project_memberships_role_check;

ALTER TABLE project_memberships
  ADD CONSTRAINT project_memberships_role_check
  CHECK (role IN (
    'REQUESTER',
    'APPROVER',
    'SURVEY_LEAD',
    'PARTY_CHIEF',
    'INSTRUMENT_MAN',
    'CAD_TECHNICIAN',
    'CAD_LEAD',
    'VIEWER'
  ));
