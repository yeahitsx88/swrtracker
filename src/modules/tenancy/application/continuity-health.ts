import { NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';
import { assertProjectConfigAdmin } from './shared';

const HOUR = 60 * 60 * 1000;

export interface CrewVacancySignal {
  eventId: UUID; userId: UUID; role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN';
  detectedAt: Date; openTicketCount: number; uncoveredCrewCount: number;
}

export interface ContinuityHealthRepositoryPort {
  listUnresolvedCrewVacancies(db: DbClient, tenantId: UUID,
    projectId: UUID): Promise<CrewVacancySignal[]>;
}

export interface ContinuityHealth {
  projectId: UUID;
  activeGrants: Array<{ grantId: UUID; userId: UUID; role: 'SURVEY_MANAGER';
    ageHours: number; confirmed: boolean; confirmationDueAt: Date;
    confirmationOverdue: boolean; reminderDay: number | null;
    reminderKey: string | null }>;
  crewVacancies: Array<CrewVacancySignal & { ageHours: number;
    notificationWindowEndsAt: Date; escalationDue: boolean;
    reminderDay: number | null; reminderKey: string | null }>;
}

export async function getProjectContinuityHealth(
  repo: ITenancyRepository, health: ContinuityHealthRepositoryPort,
  db: DbClient, params: { tenantId: UUID; projectId: UUID;
    actorRole: ProjectRole | TenantRole }, now = new Date(),
): Promise<ContinuityHealth> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status !== 'ACTIVE') {
    return { projectId: params.projectId, activeGrants: [], crewVacancies: [] };
  }
  const [grants, vacancies] = await Promise.all([
    repo.listActiveActingGrants(db, params.tenantId, params.projectId),
    health.listUnresolvedCrewVacancies(db, params.tenantId, params.projectId),
  ]);
  return {
    projectId: params.projectId,
    activeGrants: grants.filter((grant) =>
      grant.role === 'SURVEY_MANAGER' &&
      grant.scope.projectId === params.projectId &&
      Array.isArray(grant.scope.actions) &&
      grant.scope.actions.includes('manage_workflow'))
      .map((grant) => {
        const confirmationDueAt = new Date(grant.createdAt.getTime() + 24 * HOUR);
        const confirmationOverdue = grant.confirmedAt === null && now >= confirmationDueAt;
        const reminderDay = confirmationOverdue
          ? Math.floor((now.getTime() - confirmationDueAt.getTime()) / (24 * HOUR)) + 1
          : null;
        return { grantId: grant.id, userId: grant.userId, role: grant.role,
          ageHours: Math.max(0, Math.floor((now.getTime() - grant.createdAt.getTime()) / HOUR)),
          confirmed: grant.confirmedAt !== null, confirmationDueAt,
          confirmationOverdue, reminderDay,
          reminderKey: reminderDay === null ? null
            : `${grant.id}:${params.projectId}:confirmation:${reminderDay}` };
      }),
    crewVacancies: vacancies.map((vacancy) => {
      const notificationWindowEndsAt = new Date(vacancy.detectedAt.getTime() + 48 * HOUR);
      const escalationDue = now >= notificationWindowEndsAt;
      const reminderDay = escalationDue
        ? Math.floor((now.getTime() - notificationWindowEndsAt.getTime()) / (24 * HOUR)) + 1
        : null;
      return { ...vacancy,
        ageHours: Math.max(0, Math.floor((now.getTime() - vacancy.detectedAt.getTime()) / HOUR)),
        notificationWindowEndsAt, escalationDue, reminderDay,
        reminderKey: reminderDay === null ? null
          : `${vacancy.eventId}:${params.projectId}:${vacancy.userId}:${vacancy.role}:${reminderDay}` };
    }),
  };
}
