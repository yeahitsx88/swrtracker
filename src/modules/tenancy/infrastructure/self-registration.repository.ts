import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { SelfRegistrationAccessPort } from '../application/self-registration';

export class SelfRegistrationAccessRepository implements SelfRegistrationAccessPort {
  async lockActiveProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<boolean> {
    const { rows } = await db.query(`SELECT id FROM projects
      WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE' FOR SHARE`, [tenantId, projectId]);
    return rows.length === 1;
  }

  async lockDomainCompanies(db: DbClient, tenantId: UUID, domain: string): Promise<UUID[]> {
    const { rows } = await db.query<{ company_id: UUID }>(`SELECT ad.company_id
      FROM allowed_domains ad JOIN companies c ON c.id=ad.company_id AND c.tenant_id=ad.tenant_id
      WHERE ad.tenant_id=$1 AND LOWER(ad.domain)=$2 FOR SHARE OF ad,c`, [tenantId, domain]);
    return rows.map(row => row.company_id);
  }

  async enrollRequester(db: DbClient, params: {
    tenantId: UUID; projectId: UUID; companyId: UUID; userId: UUID;
  }): Promise<void> {
    const { rows } = await db.query(`INSERT INTO project_memberships(project_id,user_id,role)
      SELECT p.id,u.id,'REQUESTER' FROM projects p
      JOIN users u ON u.id=$4 AND u.tenant_id=p.tenant_id AND u.company_id=$3
        AND u.deactivated_at IS NULL
      WHERE p.tenant_id=$1 AND p.id=$2 AND p.status='ACTIVE' RETURNING id`,
      [params.tenantId, params.projectId, params.companyId, params.userId]);
    if (rows.length !== 1) throw new ForbiddenError('Project membership could not be created');
  }
}
