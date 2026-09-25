import type { DbClient, UUID } from '@/shared/types';
import type { DirectoryProject, ProjectDirectoryPort } from '../application/project-directory';

export class ProjectDirectoryRepository implements ProjectDirectoryPort {
  async list(db: DbClient, params: {
    tenantId: UUID; userId: UUID; limit: number; offset: number;
  }): Promise<DirectoryProject[]> {
    const { rows } = await db.query<DirectoryProject>(`SELECT p.id,p.name,p.status,
      ARRAY(SELECT DISTINCT pm.role::text FROM project_memberships pm
        WHERE pm.project_id=p.id AND pm.user_id=u.id ORDER BY pm.role::text) AS roles
      FROM projects p JOIN users u ON u.tenant_id=p.tenant_id AND u.id=$2
      WHERE p.tenant_id=$1 AND u.deactivated_at IS NULL AND (
        EXISTS (SELECT 1 FROM project_memberships pm WHERE pm.project_id=p.id AND pm.user_id=u.id)
        OR EXISTS (SELECT 1 FROM tenant_memberships tm
          WHERE tm.tenant_id=p.tenant_id AND tm.user_id=u.id AND tm.role='TENANT_ADMIN'))
      ORDER BY p.name,p.id LIMIT $3 OFFSET $4`,
      [params.tenantId, params.userId, params.limit, params.offset]);
    return rows;
  }
}
