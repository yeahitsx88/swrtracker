import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import {
  getProjectRequestConfig,
  updateProjectRequestConfig,
} from '@/modules/tenancy/application/project-request-config';
import type { Project, ProjectRequestConfig } from '@/modules/tenancy/domain/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

interface RepoMock {
  findProjectById: (db: DbClient, tenantId: UUID, projectId: UUID) => Promise<Project | null>;
  findProjectRequestConfig: (db: DbClient, tenantId: UUID, projectId: UUID) => Promise<ProjectRequestConfig | null>;
  updateProjectRequestConfig: (
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    config: ProjectRequestConfig,
  ) => Promise<void>;
}

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: projectId,
    tenantId,
    name: 'Project',
    status: 'ACTIVE',
    crewBuild: 'FULL',
    templateId: null,
    createdAt: new Date('2026-03-05T12:00:00Z'),
    activatedAt: new Date('2026-03-05T12:00:00Z'),
    activatedBy: 'user-1' as UUID,
    archivedAt: null,
    archivedBy: null,
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<RepoMock>): RepoMock {
  return {
    findProjectById: async () => makeProject(),
    findProjectRequestConfig: async () => ({
      leadTimeEnforcementEnabled: true,
      leadTimeDays: 2,
    }),
    updateProjectRequestConfig: async () => undefined,
    ...overrides,
  };
}

test('getProjectRequestConfig returns stored project config', async () => {
  const repo = makeRepo({
    findProjectRequestConfig: async () => ({
      leadTimeEnforcementEnabled: false,
      leadTimeDays: 10,
    }),
  });

  const config = await getProjectRequestConfig(repo, db, {
    tenantId,
    projectId,
  });

  assert.equal(config.leadTimeEnforcementEnabled, false);
  assert.equal(config.leadTimeDays, 10);
});

test('getProjectRequestConfig rejects unknown projects', async () => {
  const repo = makeRepo({
    findProjectById: async () => null,
  });

  await assert.rejects(
    () => getProjectRequestConfig(repo, db, { tenantId, projectId }),
    NotFoundError,
  );
});

test('updateProjectRequestConfig rejects non-admin actors', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => updateProjectRequestConfig(repo, db, {
      tenantId,
      projectId,
      actorProjectRole: 'REQUESTER',
      actorTenantRole: null,
      leadTimeEnforcementEnabled: true,
      leadTimeDays: 5,
    }),
    ForbiddenError,
  );
});

test('updateProjectRequestConfig validates leadTimeDays bounds', async () => {
  const repo = makeRepo();

  await assert.rejects(
    () => updateProjectRequestConfig(repo, db, {
      tenantId,
      projectId,
      actorProjectRole: 'PROJECT_ADMIN',
      actorTenantRole: null,
      leadTimeEnforcementEnabled: true,
      leadTimeDays: 0,
    }),
    ValidationError,
  );
});

test('updateProjectRequestConfig persists config for project admin', async () => {
  const updates: ProjectRequestConfig[] = [];
  const repo = makeRepo({
    updateProjectRequestConfig: async (_db, _tenantId, _projectId, config) => {
      updates.push(config);
    },
  });

  const config = await updateProjectRequestConfig(repo, db, {
    tenantId,
    projectId,
    actorProjectRole: 'PROJECT_ADMIN',
    actorTenantRole: null,
    leadTimeEnforcementEnabled: false,
    leadTimeDays: 10,
  });

  assert.equal(config.leadTimeEnforcementEnabled, false);
  assert.equal(config.leadTimeDays, 10);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.leadTimeDays, 10);
});

