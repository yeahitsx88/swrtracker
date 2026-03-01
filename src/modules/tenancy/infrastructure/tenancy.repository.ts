/**
 * TenancyRepository — pg implementation of ITenancyRepository.
 * All queries are scoped by tenant_id where applicable.
 */
import type { DbClient, UUID } from '@/shared/types';
import type {
  Tenant,
  Project,
  Company,
  Area,
  Subarea,
  PriorityWhitelistEntry,
} from '../domain/types';
import type { ITenancyRepository } from '../application/ports';

export class TenancyRepository implements ITenancyRepository {
  async saveTenant(db: DbClient, tenant: Tenant): Promise<void> {
    await db.query(
      `INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)`,
      [tenant.id, tenant.name, tenant.createdAt],
    );
  }

  async saveCompany(db: DbClient, company: Company): Promise<void> {
    await db.query(
      `INSERT INTO companies (id, tenant_id, name, type, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [company.id, company.tenantId, company.name, company.type, company.createdAt],
    );
  }

  async saveProject(db: DbClient, project: Project): Promise<void> {
    await db.query(
      `INSERT INTO projects (id, tenant_id, name, status, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [project.id, project.tenantId, project.name, project.status, project.createdAt],
    );
  }

  async findProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null> {
    const { rows } = await db.query<{
      id: string; tenant_id: string; name: string; status: string; created_at: Date;
    }>(
      `SELECT id, tenant_id, name, status, created_at
       FROM projects
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [projectId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:        r.id as UUID,
      tenantId:  r.tenant_id as UUID,
      name:      r.name,
      status:    r.status as 'ACTIVE' | 'ARCHIVED',
      createdAt: r.created_at,
    };
  }

  async saveArea(db: DbClient, area: Area): Promise<void> {
    await db.query(
      `INSERT INTO areas (id, project_id, tenant_id, name, code, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [area.id, area.projectId, area.tenantId, area.name, area.code, area.createdAt],
    );
  }

  async findAreaById(db: DbClient, tenantId: UUID, areaId: UUID): Promise<Area | null> {
    const { rows } = await db.query<{
      id: string; project_id: string; tenant_id: string; name: string; code: string; created_at: Date;
    }>(
      `SELECT id, project_id, tenant_id, name, code, created_at
       FROM areas
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [areaId, tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id:        r.id as UUID,
      projectId: r.project_id as UUID,
      tenantId:  r.tenant_id as UUID,
      name:      r.name,
      code:      r.code,
      createdAt: r.created_at,
    };
  }

  async saveSubarea(db: DbClient, subarea: Subarea): Promise<void> {
    await db.query(
      `INSERT INTO subareas (id, area_id, project_id, tenant_id, name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [subarea.id, subarea.areaId, subarea.projectId, subarea.tenantId, subarea.name, subarea.createdAt],
    );
  }

  async saveMembership(
    db: DbClient,
    membership: { id: UUID; projectId: UUID; userId: UUID; role: string; createdAt: Date },
  ): Promise<void> {
    await db.query(
      `INSERT INTO project_memberships (id, project_id, user_id, role, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [membership.id, membership.projectId, membership.userId, membership.role, membership.createdAt],
    );
  }

  async saveWhitelistEntry(db: DbClient, entry: PriorityWhitelistEntry): Promise<void> {
    await db.query(
      `INSERT INTO priority_whitelist (id, tenant_id, project_id, email, added_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, project_id, email) DO NOTHING`,
      [entry.id, entry.tenantId, entry.projectId, entry.email, entry.addedBy, entry.createdAt],
    );
  }

  async deleteWhitelistEntry(
    db: DbClient, tenantId: UUID, projectId: UUID, email: string,
  ): Promise<void> {
    await db.query(
      `DELETE FROM priority_whitelist
       WHERE tenant_id = $1 AND project_id = $2 AND email = $3`,
      [tenantId, projectId, email],
    );
  }

  async isEmailWhitelisted(
    db: DbClient, tenantId: UUID, projectId: UUID, email: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM priority_whitelist
         WHERE tenant_id = $1 AND project_id = $2 AND email = $3
       ) AS exists`,
      [tenantId, projectId, email.toLowerCase()],
    );
    return rows[0]?.exists === true;
  }
}
