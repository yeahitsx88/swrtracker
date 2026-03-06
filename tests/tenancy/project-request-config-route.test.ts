import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/shared/errors';
import {
  handleGetProjectRequestConfig,
  handlePatchProjectRequestConfig,
  type ProjectRequestConfigRouteDeps,
} from '@/app/api/projects/[projectId]/request-config/handler';
import type { DbClient, UUID } from '@/shared/types';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRequestConfig } from '@/modules/tenancy/domain/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const userId = 'user-1' as UUID;

function makeDeps(
  overrides?: Partial<ProjectRequestConfigRouteDeps>,
): ProjectRequestConfigRouteDeps {
  const repo = {
    findProjectById: async () => ({
      id: projectId,
      tenantId,
      name: 'Project',
      status: 'ACTIVE',
      crewBuild: 'FULL',
      templateId: null,
      createdAt: new Date('2026-03-05T12:00:00Z'),
      activatedAt: new Date('2026-03-05T12:00:00Z'),
      activatedBy: userId,
      archivedAt: null,
      archivedBy: null,
    }),
    findProjectRequestConfig: async () => ({
      leadTimeEnforcementEnabled: true,
      leadTimeDays: 2,
    }),
    updateProjectRequestConfig: async () => undefined,
  } as unknown as TenancyRepository;

  return {
    requireAuth: () => ({
      tenantId,
      userId,
      sessionVersion: 1,
    }),
    getProjectRole: async () => 'PROJECT_ADMIN',
    getTenantRole: async () => null,
    createRepo: () => repo,
    withTransaction: async (fn) =>
      fn({
        query: async () => ({ rows: [] }),
      }),
    ...overrides,
  };
}

test('handleGetProjectRequestConfig returns current config for project members', async () => {
  const req = new NextRequest(`http://localhost/api/projects/${projectId}/request-config`, {
    method: 'GET',
  });
  const response = await handleGetProjectRequestConfig(
    req,
    { params: Promise.resolve({ projectId }) },
    makeDeps(),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as {
    config: {
      leadTimeEnforcementEnabled: boolean;
      leadTimeDays: number;
    };
  };
  assert.equal(json.config.leadTimeEnforcementEnabled, true);
  assert.equal(json.config.leadTimeDays, 2);
});

test('handlePatchProjectRequestConfig returns 403 for non-admin actor', async () => {
  const req = new NextRequest(`http://localhost/api/projects/${projectId}/request-config`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      leadTimeEnforcementEnabled: true,
      leadTimeDays: 5,
    }),
  });

  const response = await handlePatchProjectRequestConfig(
    req,
    { params: Promise.resolve({ projectId }) },
    makeDeps({
      getProjectRole: async () => 'REQUESTER',
      getTenantRole: async () => null,
    }),
  );

  assert.equal(response.status, 403);
});

test('handlePatchProjectRequestConfig updates config for project admin', async () => {
  const updates: Array<{ leadTimeEnforcementEnabled: boolean; leadTimeDays: number }> = [];
  const req = new NextRequest(`http://localhost/api/projects/${projectId}/request-config`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      leadTimeEnforcementEnabled: false,
      leadTimeDays: 10,
    }),
  });

  const response = await handlePatchProjectRequestConfig(
    req,
    { params: Promise.resolve({ projectId }) },
    makeDeps({
      createRepo: () =>
        ({
          findProjectById: async () => ({
            id: projectId,
            tenantId,
            name: 'Project',
            status: 'ACTIVE',
            crewBuild: 'FULL',
            templateId: null,
            createdAt: new Date('2026-03-05T12:00:00Z'),
            activatedAt: new Date('2026-03-05T12:00:00Z'),
            activatedBy: userId,
            archivedAt: null,
            archivedBy: null,
          }),
          findProjectRequestConfig: async () => ({
            leadTimeEnforcementEnabled: true,
            leadTimeDays: 2,
          }),
          updateProjectRequestConfig: async (
            _db: DbClient,
            _tenantId: UUID,
            _projectId: UUID,
            config: ProjectRequestConfig,
          ) => {
            updates.push(config);
          },
        }) as unknown as TenancyRepository,
    }),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as {
    config: {
      leadTimeEnforcementEnabled: boolean;
      leadTimeDays: number;
    };
  };
  assert.equal(json.config.leadTimeEnforcementEnabled, false);
  assert.equal(json.config.leadTimeDays, 10);
  assert.equal(updates.length, 1);
});

test('handlePatchProjectRequestConfig validates payload', async () => {
  const req = new NextRequest(`http://localhost/api/projects/${projectId}/request-config`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      leadTimeEnforcementEnabled: true,
      leadTimeDays: 0,
    }),
  });

  const response = await handlePatchProjectRequestConfig(
    req,
    { params: Promise.resolve({ projectId }) },
    makeDeps(),
  );

  assert.equal(response.status, 400);
});

test('handleGetProjectRequestConfig returns 403 when project membership check fails', async () => {
  const req = new NextRequest(`http://localhost/api/projects/${projectId}/request-config`, {
    method: 'GET',
  });
  const response = await handleGetProjectRequestConfig(
    req,
    { params: Promise.resolve({ projectId }) },
    makeDeps({
      getProjectRole: async () => {
        throw new ForbiddenError('You are not a member of this project');
      },
    }),
  );

  assert.equal(response.status, 403);
});
