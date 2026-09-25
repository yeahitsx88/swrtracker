import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  handleGetProjects,
  type ProjectListRouteDeps,
} from '@/app/api/projects/get-handler';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const userId = 'user-1' as UUID;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/projects');
}

test('GET /api/projects returns active tenant-scoped memberships for the signed-in user', async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  let sessionChecked = false;
  const db: DbClient = {
    query: async <T extends object>(text: string, params?: unknown[]) => {
      queries.push({ text, params });
      return {
        rows: [
          { id: 'project-1', name: 'Amelia', status: 'ACTIVE', role: 'SURVEY_MANAGER' },
        ] as T[],
      };
    },
  };
  const deps: ProjectListRouteDeps = {
    requireAuth: () => ({ tenantId, userId, sessionVersion: 3 }),
    assertActiveSession: async (_db, auth) => {
      sessionChecked = auth.sessionVersion === 3;
    },
    db,
  };

  const response = await handleGetProjects(makeRequest(), deps);

  assert.equal(response.status, 200);
  assert.equal(sessionChecked, true);
  assert.deepEqual(await response.json(), {
    projects: [
      { id: 'project-1', name: 'Amelia', status: 'ACTIVE', role: 'SURVEY_MANAGER' },
    ],
  });
  assert.deepEqual(queries[0]?.params, [tenantId, userId]);
  assert.match(queries[0]?.text ?? '', /p\.tenant_id = \$1/);
  assert.match(queries[0]?.text ?? '', /pm\.user_id = \$2/);
  assert.match(queries[0]?.text ?? '', /p\.status = 'ACTIVE'/);
  assert.match(queries[0]?.text ?? '', /c\.type <> 'SUBCONTRACTOR' OR pm\.role = 'REQUESTER'/);
});

test('GET /api/projects returns an empty list when the user has no active memberships', async () => {
  const deps: ProjectListRouteDeps = {
    requireAuth: () => ({ tenantId, userId, sessionVersion: 1 }),
    assertActiveSession: async () => undefined,
    db: { query: async <T extends object>() => ({ rows: [] as T[] }) },
  };

  const response = await handleGetProjects(makeRequest(), deps);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projects: [] });
});
