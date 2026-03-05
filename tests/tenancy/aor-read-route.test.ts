import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/shared/errors';
import {
  handleGetAor,
  type AorReadRouteDeps,
} from '@/app/api/projects/[projectId]/aor/read-handler';
import type { UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const actorId = 'user-1' as UUID;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/projects/project-1/aor', {
    method: 'GET',
  });
}

function makeDeps(overrides?: Partial<AorReadRouteDeps>): AorReadRouteDeps {
  return {
    requireAuth: () => ({
      tenantId,
      userId: actorId,
    }),
    getProjectRole: async () => 'REQUESTER',
    queryLevels: async () => ([
      { id: 'level-1', depth: 0, label: 'UNIT' },
      { id: 'level-2', depth: 1, label: 'CWA' },
    ]),
    queryNodes: async () => ([
      { id: 'node-2', level_id: 'level-2', parent_id: 'node-1', name: 'CWA 1100', code: 'CWA1100' },
      { id: 'node-1', level_id: 'level-1', parent_id: null, name: 'Unit 1', code: 'U1' },
    ]),
    ...overrides,
  };
}

test('handleGetAor returns mapped AOR levels and active nodes', async () => {
  const response = await handleGetAor(
    makeRequest(),
    { params: Promise.resolve({ projectId }) },
    makeDeps(),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as {
    levels: Array<{ id: string; depth: number; label: string }>;
    nodes: Array<{ id: string; levelId: string; parentId: string | null; name: string; code: string }>;
  };

  assert.equal(json.levels.length, 2);
  assert.equal(json.levels[0]?.label, 'UNIT');
  assert.equal(json.nodes.length, 2);
  assert.equal(json.nodes[0]?.levelId, 'level-2');
  assert.equal(json.nodes[1]?.parentId, null);
});

test('handleGetAor returns 403 when project membership gate fails', async () => {
  const response = await handleGetAor(
    makeRequest(),
    { params: Promise.resolve({ projectId }) },
    makeDeps({
      getProjectRole: async () => {
        throw new ForbiddenError('User is not a project member');
      },
    }),
  );

  assert.equal(response.status, 403);
});
