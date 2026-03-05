import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/shared/errors';
import { handleGetOpsDiagnostics, type OpsDiagnosticsDeps } from '@/app/api/ops/diagnostics/handler';
import type { UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const actorId = 'user-1' as UUID;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ops/diagnostics', { method: 'GET' });
}

function makeDeps(overrides?: Partial<OpsDiagnosticsDeps>): OpsDiagnosticsDeps {
  return {
    requireAuth: () => ({ tenantId, userId: actorId, sessionVersion: 1 }),
    getTenantRole: async () => 'TENANT_ADMIN',
    countStaleSubmitted: async () => 3,
    countStalePcApproval: async () => 2,
    countDelayedActive: async () => 1,
    countApproverTimeoutCandidates: async () => 4,
    countVacancyEscalations: async () => 5,
    countOrphanWorkflowCandidates: async () => 2,
    countIdempotencyLedger24h: async () => 7,
    listRecentJobRuns: async () => [],
    listRecentJobFailures: async () => [],
    ...overrides,
  };
}

test('handleGetOpsDiagnostics returns workflow and worker diagnostics for tenant admin', async () => {
  const response = await handleGetOpsDiagnostics(makeRequest(), makeDeps());
  assert.equal(response.status, 200);
  const json = await response.json() as {
    workflowHealth: { staleSubmittedCount: number };
    notificationBacklog: { vacancyEscalations: number };
    hardeningMetrics: { orphanWorkflowCandidates: number; idempotencyLedger24h: number };
  };
  assert.equal(json.workflowHealth.staleSubmittedCount, 3);
  assert.equal(json.notificationBacklog.vacancyEscalations, 5);
  assert.equal(json.hardeningMetrics.orphanWorkflowCandidates, 2);
  assert.equal(json.hardeningMetrics.idempotencyLedger24h, 7);
});

test('handleGetOpsDiagnostics rejects non-tenant-admin actors', async () => {
  const response = await handleGetOpsDiagnostics(
    makeRequest(),
    makeDeps({
      getTenantRole: async () => null,
    }),
  );
  assert.equal(response.status, 403);
});

test('handleGetOpsDiagnostics maps dependency errors', async () => {
  const response = await handleGetOpsDiagnostics(
    makeRequest(),
    makeDeps({
      countStaleSubmitted: async () => {
        throw new ForbiddenError('blocked');
      },
    }),
  );
  assert.equal(response.status, 403);
});
