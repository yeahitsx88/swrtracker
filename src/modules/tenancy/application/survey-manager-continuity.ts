import { ConflictError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { acquireTenantLifecycleLock } from '@/lib/tenant-lifecycle-lock';

/** Actual operational Managers are the continuity witnesses; grants cannot substitute. */
export async function assertSurveyManagerRemovalSafe(db: DbClient, tenantId: UUID, subjectUserId: UUID, projectId?: UUID): Promise<void> {
  await acquireTenantLifecycleLock(db, tenantId, 'EXCLUSIVE');
  const { rows } = await db.query<{ id: UUID }>(
    `SELECT p.id FROM projects p
     JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$2
     JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
     JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
     WHERE p.tenant_id=$1 AND ($3::uuid IS NULL OR p.id=$3) AND p.status<>'ARCHIVED'
       AND pm.role='SURVEY_MANAGER' AND pm.access_disabled_at IS NULL
       AND u.deactivated_at IS NULL AND c.type IN ('GC','OWNER_REP')
       AND NOT EXISTS (
         SELECT 1 FROM project_memberships replacement
         JOIN users candidate ON candidate.id=replacement.user_id AND candidate.tenant_id=p.tenant_id
         JOIN companies eligible ON eligible.id=candidate.company_id AND eligible.tenant_id=candidate.tenant_id
         WHERE replacement.project_id=p.id AND replacement.user_id<>$2
           AND replacement.role='SURVEY_MANAGER' AND replacement.access_disabled_at IS NULL
           AND candidate.deactivated_at IS NULL AND eligible.type IN ('GC','OWNER_REP')
       )`, [tenantId, subjectUserId, projectId ?? null],
  );
  if (rows.length) throw new ConflictError('A distinct active Survey Manager must remain on each open project', 'LAST_SURVEY_MANAGER');
}
