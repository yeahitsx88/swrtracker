-- Phase 2 lookup indexes from CLAUDE.md Section 5.
-- department_titles has no project_id; its department_id identifies the project
-- through departments, so index the tenant-scoped department lookup instead.

CREATE INDEX IF NOT EXISTS tickets_tenant_project_department_idx
  ON tickets(tenant_id, project_id, department_id);
CREATE INDEX IF NOT EXISTS tickets_tenant_project_aor_node_idx
  ON tickets(tenant_id, project_id, aor_node_id);
CREATE INDEX IF NOT EXISTS tickets_requester_status_active_draft_idx
  ON tickets(requester_id, status) WHERE draft_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS aor_assignments_project_user_all_idx
  ON aor_assignments(project_id, user_id);
CREATE INDEX IF NOT EXISTS aor_assignments_project_node_idx
  ON aor_assignments(project_id, aor_node_id);
CREATE INDEX IF NOT EXISTS aor_assignments_department_idx
  ON aor_assignments(department_id) WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS departments_tenant_project_idx
  ON departments(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS department_memberships_free_agent_idx
  ON department_memberships(project_id, department_id) WHERE title IS NULL;
CREATE INDEX IF NOT EXISTS department_memberships_superintendent_idx
  ON department_memberships(project_id, department_id)
  WHERE superintendent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS department_titles_tenant_department_idx
  ON department_titles(tenant_id, department_id);

CREATE INDEX IF NOT EXISTS acting_grants_active_tenant_project_idx
  ON acting_grants(tenant_id, project_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS acting_grants_active_user_idx
  ON acting_grants(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS project_memberships_designated_acting_idx
  ON project_memberships(project_id, designated_acting_for);

CREATE INDEX IF NOT EXISTS project_templates_tenant_idx
  ON project_templates(tenant_id);
CREATE INDEX IF NOT EXISTS users_active_tenant_idx
  ON users(tenant_id) WHERE deactivated_at IS NULL;
