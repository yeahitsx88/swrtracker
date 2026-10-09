/**
 * Read-only choices for the direct-assignment form: current requesters (and
 * whether they already belong to a department), Party Chiefs, Instrument Men and
 * department names. Survey Manager and Superintendent only; the create command
 * re-validates every choice, including Superintendent Area authority.
 */
import { ForbiddenError } from '@/shared/errors';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';

export interface DirectAssignmentPerson { id: string; name: string; email: string }
export interface DirectAssignmentOptions {
  requesters: Array<DirectAssignmentPerson & { departmentId: string | null }>;
  partyChiefs: DirectAssignmentPerson[];
  instrumentMen: DirectAssignmentPerson[];
  departments: Array<{ id: string; name: string }>;
}

export async function readDirectAssignmentOptions(db: DbClient, actor: { tenantId: UUID; projectId: UUID; actorRole: ProjectRole }): Promise<DirectAssignmentOptions> {
  if (actor.actorRole !== 'SURVEY_MANAGER' && actor.actorRole !== 'SURVEY_SUPERINTENDENT') {
    throw new ForbiddenError('Direct assignment is available to the Survey Manager and Superintendents.');
  }
  const { rows: people } = await db.query<DirectAssignmentPerson & { role: ProjectRole; departmentId: string | null }>(
    `SELECT u.id, u.name, u.email, pm.role,
            (SELECT dm.department_id FROM department_memberships dm
             WHERE dm.tenant_id = $1 AND dm.project_id = $2 AND dm.user_id = u.id AND dm.deactivated_at IS NULL LIMIT 1) AS "departmentId"
     FROM project_memberships pm
     JOIN users u ON u.id = pm.user_id AND u.tenant_id = $1
     JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id
     WHERE pm.project_id = $2 AND pm.role IN ('REQUESTER', 'PARTY_CHIEF', 'INSTRUMENT_MAN')
       AND pm.access_disabled_at IS NULL AND u.deactivated_at IS NULL
       AND (c.type <> 'SUBCONTRACTOR' OR pm.role = 'REQUESTER')
     ORDER BY u.name, u.id
     LIMIT 2000`,
    [actor.tenantId, actor.projectId],
  );
  const { rows: departments } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM departments WHERE tenant_id = $1 AND project_id = $2 ORDER BY name, id`,
    [actor.tenantId, actor.projectId],
  );
  const pick = (role: ProjectRole) => people.filter(person => person.role === role).map(({ id, name, email }) => ({ id, name, email }));
  return {
    requesters: people.filter(person => person.role === 'REQUESTER').map(({ id, name, email, departmentId }) => ({ id, name, email, departmentId })),
    partyChiefs: pick('PARTY_CHIEF'),
    instrumentMen: pick('INSTRUMENT_MAN'),
    departments,
  };
}
