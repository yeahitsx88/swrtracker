import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { CrewBuild, Project } from '../domain/types';
import type { ITenancyRepository, ProjectActivationReadinessSnapshot } from './ports';

export type ProjectActivationActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export type ProjectActivationCheckCode =
  | 'AOR_LEVELS'
  | 'AOR_NODES'
  | 'SURVEY_MANAGER'
  | 'SURVEY_SUPERINTENDENT_AOR_ASSIGNMENT'
  | 'DEPARTMENTS'
  | 'ACTING_SURVEY_MANAGER'
  | 'ALLOWED_DOMAINS';

export interface ProjectActivationCheck {
  code: ProjectActivationCheckCode;
  severity: 'HARD' | 'SOFT';
  passed: boolean;
  count: number;
}

export interface ProjectActivationReadiness {
  checks: ProjectActivationCheck[];
  hardFailures: ProjectActivationCheck[];
  warnings: ProjectActivationCheck[];
}

export type ActivateProjectResult =
  | {
      outcome: 'ACTIVATED';
      project: Project;
      readiness: ProjectActivationReadiness;
      warningsAcknowledged: boolean;
    }
  | {
      outcome: 'BLOCKED';
      reason: 'HARD_FAILURES' | 'WARNINGS_ACK_REQUIRED';
      readiness: ProjectActivationReadiness;
    };

export interface ActivateProjectParams {
  tenantId: UUID;
  projectId: UUID;
  actorId: UUID;
  actorRole: ProjectActivationActorRole;
  acknowledgeWarnings?: boolean;
}

function buildChecks(
  crewBuild: CrewBuild,
  snapshot: ProjectActivationReadinessSnapshot,
): ProjectActivationCheck[] {
  const checks: ProjectActivationCheck[] = [
    {
      code: 'AOR_LEVELS',
      severity: 'HARD',
      passed: snapshot.aorLevelsCount >= 1,
      count: snapshot.aorLevelsCount,
    },
    {
      code: 'AOR_NODES',
      severity: 'HARD',
      passed: snapshot.aorNodesCount >= 1,
      count: snapshot.aorNodesCount,
    },
    {
      code: 'SURVEY_MANAGER',
      severity: 'HARD',
      passed: snapshot.surveyManagerCount >= 1,
      count: snapshot.surveyManagerCount,
    },
  ];

  if (crewBuild === 'FULL') {
    checks.push({
      code: 'SURVEY_SUPERINTENDENT_AOR_ASSIGNMENT',
      severity: 'HARD',
      passed: snapshot.superintendentAorAssignmentCount >= 1,
      count: snapshot.superintendentAorAssignmentCount,
    });
  }

  checks.push(
    {
      code: 'DEPARTMENTS',
      severity: 'SOFT',
      passed: snapshot.departmentsCount >= 1,
      count: snapshot.departmentsCount,
    },
    {
      code: 'ACTING_SURVEY_MANAGER',
      severity: 'SOFT',
      passed: snapshot.actingSurveyManagerCount >= 1,
      count: snapshot.actingSurveyManagerCount,
    },
    {
      code: 'ALLOWED_DOMAINS',
      severity: 'SOFT',
      passed: snapshot.allowedDomainsCount >= 1,
      count: snapshot.allowedDomainsCount,
    },
  );

  return checks;
}

function buildReadiness(
  crewBuild: CrewBuild,
  snapshot: ProjectActivationReadinessSnapshot,
): ProjectActivationReadiness {
  const checks = buildChecks(crewBuild, snapshot);
  return {
    checks,
    hardFailures: checks.filter((check) => check.severity === 'HARD' && !check.passed),
    warnings: checks.filter((check) => check.severity === 'SOFT' && !check.passed),
  };
}

export async function activateProject(
  repo: ITenancyRepository,
  db: DbClient,
  params: ActivateProjectParams,
): Promise<ActivateProjectResult> {
  if (params.actorRole !== 'PROJECT_ADMIN' && params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN can activate projects');
  }

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.status !== 'SETUP') {
    throw new ConflictError('Only SETUP projects can be activated');
  }

  const readiness = buildReadiness(
    project.crewBuild,
    await repo.getProjectActivationReadiness(db, params.tenantId, params.projectId),
  );

  if (readiness.hardFailures.length > 0) {
    return {
      outcome: 'BLOCKED',
      reason: 'HARD_FAILURES',
      readiness,
    };
  }

  if (readiness.warnings.length > 0 && params.acknowledgeWarnings !== true) {
    return {
      outcome: 'BLOCKED',
      reason: 'WARNINGS_ACK_REQUIRED',
      readiness,
    };
  }

  const activatedAt = new Date();
  await repo.markProjectActive(
    db,
    params.tenantId,
    params.projectId,
    activatedAt,
    params.actorId,
  );

  return {
    outcome: 'ACTIVATED',
    project: {
      ...project,
      status: 'ACTIVE',
      activatedAt,
      activatedBy: params.actorId,
    },
    readiness,
    warningsAcknowledged: readiness.warnings.length > 0,
  };
}
