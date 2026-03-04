-- Migration 007: align project role values with Phase 2 survey role model
-- Replaces legacy APPROVER / SURVEY_LEAD values with SURVEY_MANAGER / SURVEY_SUPERINTENDENT.

UPDATE project_memberships
SET role = 'SURVEY_MANAGER'
WHERE role = 'APPROVER';

UPDATE project_memberships
SET role = 'SURVEY_SUPERINTENDENT'
WHERE role = 'SURVEY_LEAD';

ALTER TABLE project_memberships
  DROP CONSTRAINT IF EXISTS project_memberships_role_check;

ALTER TABLE project_memberships
  ADD CONSTRAINT project_memberships_role_check
  CHECK (role IN (
    'REQUESTER',
    'SURVEY_MANAGER',
    'SURVEY_SUPERINTENDENT',
    'PARTY_CHIEF',
    'INSTRUMENT_MAN',
    'CAD_TECHNICIAN',
    'CAD_LEAD',
    'VIEWER',
    'AREA_VIEWER'
  ));
