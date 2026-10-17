import { randomUUID } from 'crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type {
  DepartmentTitle,
  DepartmentTitleAssignmentLayer,
  TicketPriority,
} from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

const VALID_PRIORITIES: TicketPriority[] = ['HIGH', 'MED_HIGH', 'MEDIUM', 'NORMAL'];
const VALID_ASSIGNMENT_LAYERS: DepartmentTitleAssignmentLayer[] = ['MANAGER', 'SUPERINTENDENT'];

export interface UpsertDepartmentTitleParams {
  tenantId: UUID;
  projectId: UUID;
  departmentId: UUID;
  title: string;
  defaultPriority: TicketPriority;
  assignmentLayer: DepartmentTitleAssignmentLayer;
  actorRole: SetupActorRole;
}

function assertSetupActorRole(actorRole: SetupActorRole): void {
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage department titles');
  }
}

export async function upsertDepartmentTitle(
  repo: ITenancyRepository,
  db: DbClient,
  params: UpsertDepartmentTitleParams,
): Promise<DepartmentTitle> {
  assertSetupActorRole(params.actorRole);

  const title = params.title.trim();
  if (!title) throw new ValidationError('title is required');
  if (!VALID_PRIORITIES.includes(params.defaultPriority)) {
    throw new ValidationError(`defaultPriority must be one of ${VALID_PRIORITIES.join(', ')}`);
  }
  if (!VALID_ASSIGNMENT_LAYERS.includes(params.assignmentLayer)) {
    throw new ValidationError(`assignmentLayer must be one of ${VALID_ASSIGNMENT_LAYERS.join(', ')}`);
  }

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const department = await repo.findDepartmentById(db, params.tenantId, params.departmentId);
  if (!department || department.projectId !== params.projectId) {
    throw new NotFoundError('Department not found');
  }

  const departmentTitle: DepartmentTitle = {
    id: randomUUID() as UUID,
    tenantId: params.tenantId,
    departmentId: params.departmentId,
    title,
    defaultPriority: params.defaultPriority,
    assignmentLayer: params.assignmentLayer,
    createdAt: new Date(),
  };
  await repo.upsertDepartmentTitle(db, departmentTitle);
  return departmentTitle;
}
