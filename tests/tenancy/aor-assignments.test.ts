import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '@/shared/errors';
import { assignAorDepartment, deactivateAorDepartmentAssignment } from '@/modules/tenancy/application/assign-aor-department';
import { assignAorUser, deactivateAorUserAssignment } from '@/modules/tenancy/application/assign-aor-user';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type {
  AorAssignment,
  AorLevel,
  AorNode,
  Area,
  Department,
  DepartmentTitle,
  PriorityWhitelistEntry,
  Project,
  ProjectTemplate,
  Subarea,
  TenantMembership,
} from '@/modules/tenancy/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const aorNodeId = 'node-1' as UUID;
const userId = 'user-1' as UUID;
const departmentId = 'department-1' as UUID;

function makeProject(): Project {
  return {
    id: projectId,
    tenantId,
    name: 'Project',
    status: 'SETUP',
    crewBuild: 'FULL',
    templateId: null,
    createdAt: new Date('2026-03-04T12:00:00Z'),
  };
}

function makeNode(): AorNode {
  return {
    id: aorNodeId,
    projectId,
    tenantId,
    levelId: 'level-1' as UUID,
    parentId: null,
    name: 'Unit 1',
    code: 'U1',
    createdAt: new Date('2026-03-04T12:00:00Z'),
  };
}

function makeRepo(overrides?: Partial<ITenancyRepository>): ITenancyRepository {
  return {
    saveTenant: async () => undefined,
    saveCompany: async () => undefined,
    saveProject: async () => undefined,
    findProjectById: async () => makeProject(),
    getProjectActivationReadiness: async () => ({
      aorLevelsCount: 0,
      aorNodesCount: 0,
      surveyManagerCount: 0,
      superintendentAorAssignmentCount: 0,
      departmentsCount: 0,
      actingSurveyManagerCount: 0,
      allowedDomainsCount: 0,
    }),
    markProjectActive: async () => undefined,
    markProjectArchived: async () => undefined,
    listProjectTemplates: async () => [],
    findProjectTemplateById: async () => null,
    saveProjectTemplate: async (_db: DbClient, _template: ProjectTemplate) => undefined,
    updateProjectTemplate: async (_db: DbClient, _template: ProjectTemplate) => undefined,
    findProjectsUsingTemplate: async () => [],
    deleteProjectTemplate: async () => undefined,
    saveTenantMembership: async (_db: DbClient, _membership: TenantMembership) => undefined,
    deleteTenantMembership: async () => undefined,
    saveAorLevel: async (_db: DbClient, _level: AorLevel) => undefined,
    findAorLevelById: async () => null,
    findAorLevelByDepth: async () => null,
    saveAorNode: async (_db: DbClient, _node: AorNode) => undefined,
    findAorNodeById: async () => makeNode(),
    saveAorAssignment: async (_db: DbClient, _assignment: AorAssignment) => undefined,
    findAorAssignmentById: async () => null,
    deactivateAorAssignment: async () => undefined,
    findDepartmentById: async () => ({
      id: departmentId,
      projectId,
      tenantId,
      name: 'QA/QC',
      managerTitle: 'QA/QC Manager',
      createdBy: 'user-admin' as UUID,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    saveDepartment: async (_db: DbClient, _department: Department) => undefined,
    listDepartments: async () => [],
    saveDepartmentTitle: async (_db: DbClient, _title: DepartmentTitle) => undefined,
    upsertDepartmentTitle: async (_db: DbClient, _title: DepartmentTitle) => undefined,
    listDepartmentTitles: async () => [],
    findDepartmentTitleByName: async () => null,
    saveDepartmentMembership: async () => undefined,
    findDepartmentMembershipByUser: async () => null,
    updateDepartmentMembership: async () => undefined,
    saveArea: async (_db: DbClient, _area: Area) => undefined,
    findAreaById: async () => null,
    saveSubarea: async (_db: DbClient, _subarea: Subarea) => undefined,
    saveMembership: async () => undefined,
    saveWhitelistEntry: async (_db: DbClient, _entry: PriorityWhitelistEntry) => undefined,
    deleteWhitelistEntry: async () => undefined,
    isEmailWhitelisted: async () => false,
    ...overrides,
  };
}

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

test('assignAorUser creates a new assignment and deactivates replaced user scopes', async () => {
  const saved: AorAssignment[] = [];
  const deactivated: UUID[] = [];
  const oldAssignmentId = 'assignment-old' as UUID;
  const repo = makeRepo({
    findAorAssignmentById: async (_db, _tenantId, assignmentId) => ({
      id: assignmentId,
      projectId,
      tenantId,
      userId,
      aorNodeId: 'node-old' as UUID,
      departmentId: null,
      deactivatedAt: null,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    saveAorAssignment: async (_db, assignment) => {
      saved.push(assignment);
    },
    deactivateAorAssignment: async (_db, _tenantId, assignmentId) => {
      deactivated.push(assignmentId);
    },
  });

  const assignment = await assignAorUser(repo, db, {
    tenantId,
    projectId,
    userId,
    aorNodeId,
    actorRole: 'PROJECT_ADMIN',
    deactivateAssignmentIds: [oldAssignmentId],
  });

  assert.equal(assignment.userId, userId);
  assert.equal(assignment.departmentId, null);
  assert.deepEqual(deactivated, [oldAssignmentId]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.aorNodeId, aorNodeId);
});

test('deactivateAorUserAssignment deactivates an active user assignment', async () => {
  const deactivated: UUID[] = [];
  const assignmentId = 'assignment-user' as UUID;
  const repo = makeRepo({
    findAorAssignmentById: async () => ({
      id: assignmentId,
      projectId,
      tenantId,
      userId,
      aorNodeId,
      departmentId: null,
      deactivatedAt: null,
      createdAt: new Date('2026-03-04T12:00:00Z'),
    }),
    deactivateAorAssignment: async (_db, _tenantId, targetId) => {
      deactivated.push(targetId);
    },
  });

  const assignment = await deactivateAorUserAssignment(repo, db, {
    tenantId,
    projectId,
    assignmentId,
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(assignment.id, assignmentId);
  assert.ok(assignment.deactivatedAt instanceof Date);
  assert.deepEqual(deactivated, [assignmentId]);
});

test('assignAorDepartment creates a department-scoped assignment', async () => {
  const saved: AorAssignment[] = [];
  const repo = makeRepo({
    saveAorAssignment: async (_db, assignment) => {
      saved.push(assignment);
    },
  });

  const assignment = await assignAorDepartment(repo, db, {
    tenantId,
    projectId,
    departmentId,
    aorNodeId,
    actorRole: 'PROJECT_ADMIN',
  });

  assert.equal(assignment.userId, null);
  assert.equal(assignment.departmentId, departmentId);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.departmentId, departmentId);
});

test('deactivateAorDepartmentAssignment rejects non-setup actors', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => deactivateAorDepartmentAssignment(repo, db, {
      tenantId,
      projectId,
      assignmentId: 'assignment-department' as UUID,
      actorRole: 'REQUESTER' as never,
    }),
    ForbiddenError,
  );
});
