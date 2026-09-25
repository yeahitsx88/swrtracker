-- Capture the affected workload at raise time. Existing flags retain a snapshot
-- of tickets still assigned to their raiser at migration time.
ALTER TABLE help_flags
  ADD COLUMN IF NOT EXISTS affected_ticket_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];

UPDATE help_flags h
SET affected_ticket_ids = ARRAY(
  SELECT t.id FROM tickets t
  WHERE t.tenant_id=h.tenant_id AND t.project_id=h.project_id
    AND t.status IN ('ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL')
    AND ((h.level=1 AND t.assigned_instrument_man_id=h.raised_by)
      OR (h.level=2 AND t.assigned_party_chief_id=h.raised_by))
)
WHERE cardinality(h.affected_ticket_ids)=0;

CREATE UNIQUE INDEX IF NOT EXISTS help_flags_id_tenant_project_uq
  ON help_flags (id, tenant_id, project_id);
CREATE INDEX IF NOT EXISTS help_flags_active_actor_idx
  ON help_flags (tenant_id, project_id, raised_by, level)
  WHERE status='ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS help_flags_one_active_per_actor_uq
  ON help_flags (tenant_id, project_id, raised_by, level)
  WHERE status='ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS help_flags_one_escalation_uq
  ON help_flags (escalated_from) WHERE escalated_from IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='help_flags_project_tenant_fk') THEN
    ALTER TABLE help_flags ADD CONSTRAINT help_flags_project_tenant_fk
      FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='help_flags_raiser_tenant_fk') THEN
    ALTER TABLE help_flags ADD CONSTRAINT help_flags_raiser_tenant_fk
      FOREIGN KEY (raised_by, tenant_id) REFERENCES users(id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='help_flags_source_scope_fk') THEN
    ALTER TABLE help_flags ADD CONSTRAINT help_flags_source_scope_fk
      FOREIGN KEY (escalated_from, tenant_id, project_id)
      REFERENCES help_flags(id, tenant_id, project_id) NOT VALID;
  END IF;
END $$;
