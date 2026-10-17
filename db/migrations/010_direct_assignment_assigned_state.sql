-- Migration 010: remove legacy CREATED state from direct-assignment tickets

UPDATE tickets
SET
  status = 'ASSIGNED',
  assigned_at = COALESCE(assigned_at, created_at)
WHERE workflow_variant = 'DIRECT_ASSIGNMENT'
  AND status = 'CREATED';
