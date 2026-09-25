import type { DbClient, UUID } from '@/shared/types';

export interface OrphanedTicket {
  id: UUID;
  roleOnTicket: string;
  status: string;
}

export class UserLifecycleRepository {
  async lockProjectMembership(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID): Promise<{ role: string; projectStatus: string } | null> {
    const { rows } = await db.query<{ role: string; project_status: string }>(
      `SELECT pm.role, p.status AS project_status FROM project_memberships pm
       JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
       WHERE pm.project_id=$2 AND pm.user_id=$3 FOR UPDATE OF pm`,
      [tenantId, projectId, userId]);
    return rows[0] ? { role: rows[0].role,
      projectStatus: rows[0].project_status } : null;
  }

  async changeProjectRole(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID, role: string): Promise<void> {
    await db.query(`UPDATE project_memberships SET role=$4
      WHERE project_id=$2 AND user_id=$3
        AND EXISTS (SELECT 1 FROM projects WHERE id=$2 AND tenant_id=$1)`,
    [tenantId, projectId, userId, role]);
  }

  async removeProjectMember(db: DbClient, tenantId: UUID, projectId: UUID,
    userId: UUID): Promise<void> {
    await db.query(`DELETE FROM project_memberships
      WHERE project_id=$2 AND user_id=$3
        AND EXISTS (SELECT 1 FROM projects WHERE id=$2 AND tenant_id=$1)`,
    [tenantId, projectId, userId]);
  }

  async softDeleteProjectDrafts(db: DbClient, tenantId: UUID,
    projectId: UUID, userId: UUID): Promise<UUID[]> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE tickets SET draft_deleted_at=NOW(),
        draft_deleted_reason='USER_DEACTIVATED', updated_at=NOW()
       WHERE tenant_id=$1 AND project_id=$2 AND requester_id=$3
         AND status='DRAFT' AND draft_deleted_at IS NULL RETURNING id`,
      [tenantId, projectId, userId]);
    return rows.map(row => row.id);
  }

  async lockUser(db: DbClient, tenantId: UUID, userId: UUID): Promise<{
    deactivatedAt: Date | null;
  } | null> {
    const { rows } = await db.query<{ deactivated_at: Date | null }>(
      `SELECT deactivated_at FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
      [userId, tenantId]);
    return rows[0] ? { deactivatedAt: rows[0].deactivated_at } : null;
  }

  async affectedRoles(db: DbClient, tenantId: UUID, userId: UUID): Promise<string[]> {
    const { rows } = await db.query<{ role: string }>(
      `SELECT DISTINCT pm.role FROM project_memberships pm
       JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
       WHERE pm.user_id=$2 AND p.status='ACTIVE' ORDER BY pm.role`,
      [tenantId, userId]);
    return rows.map(row => row.role);
  }

  async orphanedTickets(db: DbClient, tenantId: UUID,
    userId: UUID): Promise<OrphanedTicket[]> {
    const { rows } = await db.query<{ id: UUID; role_on_ticket: string; status: string }>(
      `SELECT t.id, t.status,
         CASE WHEN t.assigned_party_chief_id=$2 THEN 'PARTY_CHIEF'
              WHEN t.assigned_instrument_man_id=$2 THEN 'INSTRUMENT_MAN'
              WHEN t.survey_superintendent_id=$2 THEN 'SURVEY_SUPERINTENDENT'
              WHEN t.survey_manager_id=$2 THEN 'SURVEY_MANAGER'
              ELSE 'SURVEY_LEAD' END AS role_on_ticket
       FROM tickets t JOIN projects p ON p.id=t.project_id AND p.tenant_id=t.tenant_id
       WHERE t.tenant_id=$1 AND p.status='ACTIVE'
         AND t.status IN ('SUBMITTED','APPROVED','CREATED','ASSIGNED',
           'IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED')
         AND ($2 IN (t.assigned_party_chief_id,t.assigned_instrument_man_id,
           t.survey_superintendent_id,t.survey_manager_id,t.survey_lead_id))
       ORDER BY t.id FOR UPDATE OF t`, [tenantId, userId]);
    return rows.map(row => ({ id: row.id, roleOnTicket: row.role_on_ticket,
      status: row.status }));
  }

  async softDeleteDrafts(db: DbClient, tenantId: UUID, userId: UUID): Promise<UUID[]> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE tickets SET draft_deleted_at=NOW(),
         draft_deleted_reason='USER_DEACTIVATED', updated_at=NOW()
       WHERE tenant_id=$1 AND requester_id=$2 AND status='DRAFT'
         AND draft_deleted_at IS NULL RETURNING id`, [tenantId, userId]);
    return rows.map(row => row.id);
  }

  async deactivateDependencies(db: DbClient, tenantId: UUID, userId: UUID): Promise<void> {
    await db.query(`UPDATE aor_assignments SET deactivated_at=NOW()
      WHERE tenant_id=$1 AND user_id=$2 AND deactivated_at IS NULL`, [tenantId, userId]);
    await db.query(`UPDATE crew_rosters SET deactivated_at=NOW()
      WHERE tenant_id=$1 AND (instrument_man_id=$2 OR party_chief_id=$2)
        AND deactivated_at IS NULL`, [tenantId, userId]);
  }

  async setDeactivated(db: DbClient, tenantId: UUID, userId: UUID,
    actorId: UUID): Promise<void> {
    await db.query(`UPDATE users SET deactivated_at=NOW(), deactivated_by=$3,
      session_version=session_version+1 WHERE id=$1 AND tenant_id=$2`,
    [userId, tenantId, actorId]);
  }

  async setReactivated(db: DbClient, tenantId: UUID, userId: UUID): Promise<void> {
    await db.query(`UPDATE users SET deactivated_at=NULL, deactivated_by=NULL,
      session_version=session_version+1 WHERE id=$1 AND tenant_id=$2`,
    [userId, tenantId]);
  }

  async appendTenantEvent(db: DbClient, tenantId: UUID, actorId: UUID,
    eventType: 'user.deactivated' | 'user.reactivated',
    payload: Record<string, unknown>): Promise<void> {
    await db.query(`INSERT INTO tenant_events (tenant_id,actor_id,event_type,payload)
      VALUES($1,$2,$3,$4)`, [tenantId, actorId, eventType,
      JSON.stringify(payload)]);
  }
}
