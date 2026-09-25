import type { DbClient, UUID } from '@/shared/types';

export interface CompanyAuthorityGrant {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  companyId: UUID;
  userId: UUID;
}

export class CompanyAccessRepository {
  async createRequesterInvite(
    db: DbClient,
    params: { tenantId: UUID; projectId: UUID; companyId: UUID; email: string; invitedBy: UUID; expiresAt: Date },
  ): Promise<{ token: UUID } | null> {
    const { rows } = await db.query<{ token: string }>(
      `INSERT INTO invites (tenant_id, project_id, company_id, email, role, invited_by, expires_at)
       SELECT $1, p.id, c.id, $4, 'REQUESTER', $5, $6
       FROM projects p JOIN companies c ON c.tenant_id = p.tenant_id
       WHERE p.id = $2 AND p.tenant_id = $1 AND p.status <> 'ARCHIVED'
         AND c.id = $3 AND c.type = 'SUBCONTRACTOR'
       RETURNING token`,
      [params.tenantId, params.projectId, params.companyId, params.email, params.invitedBy, params.expiresAt],
    );
    return rows[0] ? { token: rows[0].token as UUID } : null;
  }

  async grantCompanyAuthority(
    db: DbClient,
    params: { tenantId: UUID; projectId: UUID; userId: UUID; actorId: UUID },
  ): Promise<CompanyAuthorityGrant | null> {
    const { rows } = await db.query<{
      id: string; tenant_id: string; project_id: string; company_id: string; user_id: string;
    }>(
      `INSERT INTO company_authority_grants
         (tenant_id, project_id, company_id, user_id, granted_by)
       SELECT $1, p.id, u.company_id, u.id, $4
       FROM projects p
       JOIN users u ON u.tenant_id = p.tenant_id
       JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id
       JOIN project_memberships pm ON pm.project_id = p.id AND pm.user_id = u.id
       WHERE p.tenant_id = $1 AND p.id = $2 AND p.status <> 'ARCHIVED'
         AND u.id = $3 AND u.deactivated_at IS NULL
         AND c.type = 'SUBCONTRACTOR' AND pm.role = 'REQUESTER'
       ON CONFLICT DO NOTHING
       RETURNING id, tenant_id, project_id, company_id, user_id`,
      [params.tenantId, params.projectId, params.userId, params.actorId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id as UUID,
      tenantId: row.tenant_id as UUID,
      projectId: row.project_id as UUID,
      companyId: row.company_id as UUID,
      userId: row.user_id as UUID,
    };
  }

  async revokeCompanyAuthority(
    db: DbClient,
    params: { tenantId: UUID; projectId: UUID; grantId: UUID; actorId: UUID },
  ): Promise<CompanyAuthorityGrant | null> {
    const { rows } = await db.query<{
      id: string; tenant_id: string; project_id: string; company_id: string; user_id: string;
    }>(
      `UPDATE company_authority_grants
       SET revoked_by = $4, revoked_at = NOW()
       WHERE tenant_id = $1 AND project_id = $2 AND id = $3 AND revoked_at IS NULL
       RETURNING id, tenant_id, project_id, company_id, user_id`,
      [params.tenantId, params.projectId, params.grantId, params.actorId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id as UUID,
      tenantId: row.tenant_id as UUID,
      projectId: row.project_id as UUID,
      companyId: row.company_id as UUID,
      userId: row.user_id as UUID,
    };
  }

  async appendEvent(
    db: DbClient,
    grant: CompanyAuthorityGrant,
    actorId: UUID,
    action: 'COMPANY_AUTHORITY_GRANTED' | 'COMPANY_AUTHORITY_REVOKED',
  ): Promise<void> {
    await db.query(
      `INSERT INTO access_grant_events
         (tenant_id, project_id, company_id, subject_user_id, actor_id, action, grant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [grant.tenantId, grant.projectId, grant.companyId, grant.userId, actorId, action, grant.id],
    );
  }
}
