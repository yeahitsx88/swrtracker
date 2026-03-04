import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '@/shared/errors';
import { createDepartment } from '@/modules/tenancy/application/create-department';
import { listDepartments } from '@/modules/tenancy/application/list-departments';
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
const actorId = 'user-admin' as UUID;

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
    findAorNodeById: async () => null,
    saveAorAssignment: async (_db: DbClient, _assignment: AorAssignment) => undefined,
    findAorAssignmentById: async () => null,
    deactivateAorAssignment: async () => undefined,
    findDepartmentById: async () => null,
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

test('createDepartment saves the department and seeds its manager title catalog row', async () => {
  const savedDepartments: Department[] = [];
  const savedTitles: DepartmentTitle[] = [];
  const repo = makeRepo({
    saveDepartment: async (_db, department) => {
      savedDepartments.push(department);
    },
    saveDepartmentTitle: async (_db, title) => {
      savedTitles.push(title);
    },
  });

  const department = await createDepartment(repo, db, {
    tenantId,
    projectId,
    name: 'QA/QC',
    managerTitle: 'QA/QC Manager',
    actorId,
    actorRole: 'PROJECT_ADMIN',
  });

  assert.equal(department.name, 'QA/QC');
  assert.equal(savedDepartments.length, 1);
  assert.equal(savedTitles.length, 1);
  assert.equal(savedTitles[0]?.departmentId, department.id);
  assert.equal(savedTitles[0]?.title, 'QA/QC Manager');
  assert.equal(savedTitles[0]?.assignmentLayer, 'MANAGER');
  assert.equal(savedTitles[0]?.defaultPriority, 'MED_HIGH');
});

test('listDepartments returns the project department list for setup admins', async () => {
  const repo = makeRepo({
    listDepartments: async () => ([
      {
        id: 'department-1' as UUID,
        projectId,
        tenantId,
        name: 'Controls',
        managerTitle: 'Controls Manager',
        createdBy: actorId,
        createdAt: new Date('2026-03-04T12:00:00Z'),
      },
      {
        id: 'department-2' as UUID,
        projectId,
        tenantId,
        name: 'Safety',
        managerTitle: 'Safety Manager',
        createdBy: actorId,
        createdAt: new Date('2026-03-04T12:00:00Z'),
      },
    ]),
  });

  const departments = await listDepartments(repo, db, {
    tenantId,
    projectId,
    actorRole: 'TENANT_ADMIN',
  });

  assert.equal(departments.length, 2);
  assert.equal(departments[0]?.name, 'Controls');
  assert.equal(departments[1]?.name, 'Safety');
});

test('createDepartment rejects non-setup actors', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => createDepartment(repo, db, {
      tenantId,
      projectId,
      name: 'Safety',
      managerTitle: 'Safety Manager',
      actorId,
      actorRole: 'REQUESTER' as never,
    }),
    ForbiddenError,
  );
});
