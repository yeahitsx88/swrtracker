# SKILL: Test Standards, Fixtures, and Audit Coverage

> Load this skill when writing or reviewing tests for swrtracker.
> Use alongside CLAUDE.md Section 16 and the test setup in `tests/setup/`.

---

## Required Test Matrix

Every use-case or workflow change must have tests for all applicable rows:

| # | Scenario | Always Required |
|---|---|---|
| 1 | Happy path — correct actor, correct state, succeeds | ✅ |
| 2 | Invalid state transition — `ConflictError` thrown | ✅ |
| 3 | Unauthorized actor (wrong role) — `ForbiddenError` thrown | ✅ |
| 4 | Tenant isolation — actor in different tenant cannot see/act | ✅ |
| 5 | Visibility scoping — correct role sees exactly what the spec says, nothing more | ✅ |
| 6 | Cancellation path correctness — correct terminal state, correct approver chain | When cancellation is involved |

Every new bug fix requires a regression test.

---

## Test File Structure

```
tests/
  setup/
    db.ts           ← test DB connection and reset utilities
    migrate.ts      ← migration runner for test environment
    fixtures.ts     ← entity factories (see Section below)
  workflow/
    transitions.test.ts
  ticket/
    visibility.test.ts
    cancellation.test.ts
  tenancy/
    admin-authorization.test.ts
  lib/
    api-error.test.ts
    get-tenant-role.test.ts
```

Mirror the module structure under `tests/<module>/`.

---

## Fixture Standards

All test entities are created via factory functions in `tests/setup/fixtures.ts`.
Do not inline `INSERT` statements in test files — always use fixtures.

### What Every Fixture Function Must Do

```typescript
// ✅ Correct fixture pattern
export async function createTenant(db: Pool, overrides: Partial<Tenant> = {}): Promise<Tenant> {
  const defaults = {
    id: randomUUID(),
    name: 'Test Tenant',
    created_at: new Date(),
  };
  const tenant = { ...defaults, ...overrides };
  await db.query(
    'INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)',
    [tenant.id, tenant.name, tenant.created_at]
  );
  return tenant;
}

// ✅ Fixtures must return the created entity
// ✅ Fixtures must accept overrides for the fields that vary per test
// ✅ Fixtures must use randomUUID() for IDs — no hardcoded UUIDs
// ❌ Never use hardcoded email addresses that could collide across tests
// ❌ Never rely on ordering (test 1 creates, test 2 reads) — each test is self-contained
```

### Standard Fixtures Required

All test files that test multi-tenant behavior must set up these entities:

```typescript
const tenantA = await createTenant(db);
const tenantB = await createTenant(db); // isolation — actors from B cannot touch A's data

const projectA = await createProject(db, { tenant_id: tenantA.id });

const gcCompany = await createCompany(db, { tenant_id: tenantA.id, type: 'GC' });
const subCompany = await createCompany(db, { tenant_id: tenantA.id, type: 'SUBCONTRACTOR' });

const approver = await createUser(db, { tenant_id: tenantA.id, company_id: gcCompany.id });
await assignProjectRole(db, { user_id: approver.id, project_id: projectA.id, role: 'APPROVER' });

const requester = await createUser(db, { tenant_id: tenantA.id, company_id: gcCompany.id });
await assignProjectRole(db, { user_id: requester.id, project_id: projectA.id, role: 'REQUESTER' });

const subRequester = await createUser(db, { tenant_id: tenantA.id, company_id: subCompany.id });
await assignProjectRole(db, { user_id: subRequester.id, project_id: projectA.id, role: 'REQUESTER' });
```

---

## Isolation Test Pattern

The most important test category. Every visibility or access control change needs this.

```typescript
describe('tenant isolation', () => {
  it('actor from tenantB cannot read tenantA ticket', async () => {
    const tenantA = await createTenant(db);
    const tenantB = await createTenant(db);

    const ticket = await createTicket(db, { tenant_id: tenantA.id, status: 'SUBMITTED' });
    const actorB = await createUser(db, { tenant_id: tenantB.id });

    await expect(
      getTicket({ ticketId: ticket.id, actor: actorB })
    ).rejects.toMatchObject({ name: 'NotFoundError' }); // not ForbiddenError — they shouldn't know it exists
  });
});
```

**Cross-tenant access must return `NotFoundError`**, not `ForbiddenError`.
Returning `ForbiddenError` would reveal that the resource exists, which is itself an information leak.

---

## Subcontractor Visibility Test Pattern

```typescript
describe('subcontractor isolation', () => {
  it('subcontractor sees only own company tickets', async () => {
    const ticket1 = await createTicket(db, { company_id: subCompanyA.id, tenant_id: tenantA.id });
    const ticket2 = await createTicket(db, { company_id: subCompanyB.id, tenant_id: tenantA.id });

    const results = await listTickets({ actor: subUserA, projectId: project.id });

    expect(results.map(t => t.id)).toContain(ticket1.id);
    expect(results.map(t => t.id)).not.toContain(ticket2.id);
  });

  it('GC user with same role sees all tickets regardless of company', async () => {
    const results = await listTickets({ actor: gcUser, projectId: project.id });
    expect(results.map(t => t.id)).toContain(ticket1.id);
    expect(results.map(t => t.id)).toContain(ticket2.id);
  });
});
```

---

## State Transition Test Pattern

```typescript
describe('approve ticket', () => {
  it('approver can approve a SUBMITTED ticket', async () => {
    const ticket = await createTicket(db, { status: 'SUBMITTED', tenant_id: tenantA.id });
    await approveTicket({ ticketId: ticket.id, actor: approverUser, reason: 'Looks good' });
    const updated = await getTicket({ ticketId: ticket.id, actor: approverUser });
    expect(updated.status).toBe('APPROVED');
  });

  it('throws ConflictError when approving a DRAFT ticket', async () => {
    const ticket = await createTicket(db, { status: 'DRAFT', tenant_id: tenantA.id });
    await expect(
      approveTicket({ ticketId: ticket.id, actor: approverUser, reason: 'test' })
    ).rejects.toMatchObject({ name: 'ConflictError' });
  });

  it('throws ForbiddenError when REQUESTER tries to approve', async () => {
    const ticket = await createTicket(db, { status: 'SUBMITTED', tenant_id: tenantA.id });
    await expect(
      approveTicket({ ticketId: ticket.id, actor: requesterUser, reason: 'test' })
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});
```

---

## Audit Event Test Pattern

Every state transition test must verify the audit event was written.

```typescript
it('emits ticket.approved audit event on successful approval', async () => {
  const ticket = await createTicket(db, { status: 'SUBMITTED', tenant_id: tenantA.id });
  await approveTicket({ ticketId: ticket.id, actor: approverUser, reason: 'Looks good' });

  const events = await db.query(
    'SELECT * FROM ticket_events WHERE ticket_id = $1 AND event_type = $2',
    [ticket.id, 'ticket.approved']
  );
  expect(events.rows).toHaveLength(1);
  expect(events.rows[0].actor_id).toBe(approverUser.id);
});
```

If you're writing a state transition test and you haven't checked for the audit event, the test is incomplete.

---

## DB Reset Between Tests

Use the reset utility from `tests/setup/db.ts` before each test or describe block.

```typescript
beforeEach(async () => {
  await resetDatabase(db); // truncates all domain tables in dependency order
});
```

Never share state between tests. Each test creates its own fixtures from scratch.

---

## What Makes a Test "Done"

- [ ] Happy path passes
- [ ] Invalid transition is tested (expects `ConflictError`)
- [ ] Wrong actor is tested (expects `ForbiddenError`)
- [ ] Cross-tenant access is tested (expects `NotFoundError`)
- [ ] Audit event emission is verified for every state transition
- [ ] Subcontractor isolation is verified if tickets are involved
- [ ] No hardcoded UUIDs or email addresses
- [ ] Each test is self-contained (does not depend on other tests running first)
- [ ] `pnpm test` passes with no regressions
