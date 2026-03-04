import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const actorId = 'actor-1' as UUID;
const companyId = 'company-1' as UUID;
const departmentId = 'department-1' as UUID;

function rowsResult<T extends object>(rows: T[]): Promise<{ rows: T[] }> {
  return Promise.resolve({ rows });
}

test('TicketRepository.list adds subcontractor company isolation on top of requester scoping', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new TicketRepository();

  const db: DbClient = {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });

      if (/COUNT\(\*\)/.test(sql)) {
        return rowsResult([{ total: '0' }] as unknown as T[]);
      }

      return rowsResult([] as T[]);
    },
  };

  await repo.list(db, tenantId, {
    projectId,
    visibility: {
      actorId,
      actorRole: 'REQUESTER',
      companyId,
      companyType: 'SUBCONTRACTOR',
    },
    limit: 25,
    offset: 0,
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]?.sql ?? '', /t\.requester_id = \$3/);
  assert.match(queries[0]?.sql ?? '', /t\.company_id = \$4/);
  assert.deepEqual(queries[0]?.params, [tenantId, projectId, actorId, companyId]);
  assert.match(queries[1]?.sql ?? '', /t\.requester_id = \$3/);
  assert.match(queries[1]?.sql ?? '', /t\.company_id = \$4/);
  assert.deepEqual(queries[1]?.params, [tenantId, projectId, actorId, companyId, 25, 0]);
});

test('TicketRepository.list does not add company isolation for non-subcontractor requesters', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new TicketRepository();

  const db: DbClient = {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });

      if (/COUNT\(\*\)/.test(sql)) {
        return rowsResult([{ total: '0' }] as unknown as T[]);
      }

      return rowsResult([] as T[]);
    },
  };

  await repo.list(db, tenantId, {
    projectId,
    visibility: {
      actorId,
      actorRole: 'REQUESTER',
      companyId,
      companyType: 'GC',
    },
    limit: 25,
    offset: 0,
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]?.sql ?? '', /t\.requester_id = \$3/);
  assert.doesNotMatch(queries[0]?.sql ?? '', /t\.company_id/);
  assert.deepEqual(queries[0]?.params, [tenantId, projectId, actorId]);
  assert.match(queries[1]?.sql ?? '', /t\.requester_id = \$3/);
  assert.doesNotMatch(queries[1]?.sql ?? '', /t\.company_id/);
  assert.deepEqual(queries[1]?.params, [tenantId, projectId, actorId, 25, 0]);
});

test('resolveVisibility adds department and AOR scope for DEPARTMENT_LEAD', async () => {
  const originalFindUserCompanyInfo = TicketRepository.prototype.findUserCompanyInfo;
  const originalFindRequesterDepartmentMembership = TicketRepository.prototype.findRequesterDepartmentMembership;
  const originalFindAorNodeIdsForUser = TicketRepository.prototype.findAorNodeIdsForUser;

  TicketRepository.prototype.findUserCompanyInfo = async () => ({
    companyId,
    companyType: 'GC',
  });
  TicketRepository.prototype.findRequesterDepartmentMembership = async () => ({
    departmentId,
    title: 'QA Lead',
  });
  TicketRepository.prototype.findAorNodeIdsForUser = async () => [
    'aor-node-1' as UUID,
    'aor-node-2' as UUID,
  ];

  try {
    const db: DbClient = {
      query: async () => ({ rows: [] }),
    };

    const visibility = await resolveVisibility(
      db,
      tenantId,
      projectId,
      actorId,
      'DEPARTMENT_LEAD',
    );

    assert.equal(visibility.departmentId, departmentId);
    assert.deepEqual(visibility.aorNodeIds, ['aor-node-1', 'aor-node-2']);
    assert.equal(visibility.companyId, companyId);
  } finally {
    TicketRepository.prototype.findUserCompanyInfo = originalFindUserCompanyInfo;
    TicketRepository.prototype.findRequesterDepartmentMembership = originalFindRequesterDepartmentMembership;
    TicketRepository.prototype.findAorNodeIdsForUser = originalFindAorNodeIdsForUser;
  }
});

test('TicketRepository.list scopes DEPARTMENT_MANAGER to its department only', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new TicketRepository();

  const db: DbClient = {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });

      if (/COUNT\(\*\)/.test(sql)) {
        return rowsResult([{ total: '0' }] as unknown as T[]);
      }

      return rowsResult([] as T[]);
    },
  };

  await repo.list(db, tenantId, {
    projectId,
    visibility: {
      actorId,
      actorRole: 'DEPARTMENT_MANAGER',
      departmentId,
      companyId,
      companyType: 'GC',
    },
    limit: 25,
    offset: 0,
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]?.sql ?? '', /t\.department_id = \$3/);
  assert.doesNotMatch(queries[0]?.sql ?? '', /t\.aor_node_id IN/);
  assert.deepEqual(queries[0]?.params, [tenantId, projectId, departmentId]);
  assert.match(queries[1]?.sql ?? '', /t\.department_id = \$3/);
  assert.deepEqual(queries[1]?.params, [tenantId, projectId, departmentId, 25, 0]);
});

test('TicketRepository.list scopes DEPARTMENT_LEAD to its department and assigned AOR nodes', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new TicketRepository();

  const db: DbClient = {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });

      if (/COUNT\(\*\)/.test(sql)) {
        return rowsResult([{ total: '0' }] as unknown as T[]);
      }

      return rowsResult([] as T[]);
    },
  };

  await repo.list(db, tenantId, {
    projectId,
    visibility: {
      actorId,
      actorRole: 'DEPARTMENT_LEAD',
      departmentId,
      aorNodeIds: ['aor-node-1' as UUID, 'aor-node-2' as UUID],
      companyId,
      companyType: 'GC',
    },
    limit: 25,
    offset: 0,
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]?.sql ?? '', /t\.department_id = \$3/);
  assert.match(queries[0]?.sql ?? '', /t\.aor_node_id IN \(\$4, \$5\)/);
  assert.deepEqual(queries[0]?.params, [tenantId, projectId, departmentId, 'aor-node-1', 'aor-node-2']);
  assert.match(queries[1]?.sql ?? '', /t\.department_id = \$3/);
  assert.match(queries[1]?.sql ?? '', /t\.aor_node_id IN \(\$4, \$5\)/);
  assert.deepEqual(queries[1]?.params, [tenantId, projectId, departmentId, 'aor-node-1', 'aor-node-2', 25, 0]);
});

test('TicketRepository.list returns no rows for DEPARTMENT_LEAD without AOR scope', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = new TicketRepository();

  const db: DbClient = {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });

      if (/COUNT\(\*\)/.test(sql)) {
        return rowsResult([{ total: '0' }] as unknown as T[]);
      }

      return rowsResult([] as T[]);
    },
  };

  await repo.list(db, tenantId, {
    projectId,
    visibility: {
      actorId,
      actorRole: 'DEPARTMENT_LEAD',
      departmentId,
      companyId,
      companyType: 'GC',
    },
    limit: 25,
    offset: 0,
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0]?.sql ?? '', /1 = 0/);
  assert.deepEqual(queries[0]?.params, [tenantId, projectId]);
  assert.match(queries[1]?.sql ?? '', /1 = 0/);
  assert.deepEqual(queries[1]?.params, [tenantId, projectId, 25, 0]);
});
