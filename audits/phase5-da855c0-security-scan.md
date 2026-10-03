# Security Review: SWRTracker

## Scope

Controlled local authorization and requester/admin workflow assessment of exact Phase 5 checkpoint.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_c34cee825c6767e0adc0d0e881b4a03a4f6731a56b9dd0963a8d0f625f7d2bc4
- Revision: da855c0123d003585d83a11323282998e94a339c
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none

Limitations and exclusions:
- Partial repository-wide source coverage, focused on requested boundaries.
- No production/static proxy/ACL or concurrent revocation verification.
- No implemented request deletion/move lifecycle.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 4 |
| Severity mix | critical: 1, high: 2, medium: 1 |
| Confidence mix | high: 4 |
| Coverage | partial |
| Validation mode | local synthetic HTTP/PostgreSQL and independent source/browser reviews |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Exact da855c0 SWRTracker is Next.js UI/API, PostgreSQL tenancy/ticket/workflow/audit data, filesystem attachments and optional notification worker (package.json:7-11; src/lib/db.ts:8-15). Assessment used independent synthetic loopback database 15495, web 3115 and duplicate .assessment/attachments, no delivery worker.

### Assets

- Tenant/project/company identity and memberships (001_initial_schema.sql:19-49; 012_tenant_memberships.sql:4-10; 021_identity_tenant_boundary_hardening.sql:14-16).
- Request contents, operational state, assignments, audit histories and notification payloads.
- Private bytes and metadata stored under configured root/\<tenant\>/\<ticket\>/\<generated object\> (attachment/infrastructure/index.ts:76-101).
- JWT_SECRET signing authority, user session_version and per-token revocation hash (src/lib/auth.ts:35-79,106-128).

### Trust Boundaries

- Unauthenticated credentials to tenant-scoped bcrypt authentication; HttpOnly/Strict cookie with Secure in production (auth/login/handler.ts:35-86).
- Signed identity to active session, tenant/project membership and DB-derived scope; middleware presence is UX only (src/lib/auth.ts:65-128; get-project-role.ts:25-43; middleware.ts:17-25).
- Project role to requester/department/Area/crew visibility; current database links define inherited capabilities (resolve-visibility.ts:38-79; ticket-visibility-clause.ts:14-69).
- Visible work to role/state/exact-assignee mutation authority; transaction and row version protect state/audit integrity (workflow/application/kernel.ts:54-75).
- Visible ticket to attachment lookup binding tenant+ticket+attachment, server private storage read and audited private/no-store download (attachments/handler.ts:205-281).
- Access administrator to scoped Company View grant/revoke: tenant admin or project IT; transaction stores grant and event (access-administrator.ts:11-33; company-authority/route.ts:35-52).
- Operator configured DB pool consumes DATABASE_URL; generic compose web/worker load .env; no actual production credential or endpoint inspected (src/lib/db.ts:8-15; docker-compose.yml:7-23).
- Local filesystem consumer root differs by deployment: generic image /app/.data/attachments without override (Dockerfile:18,26; storage index.ts:76); native beta .data/beta/attachments via beta.env (beta-runtime.ts:9-13,110-120); Sabine explicitly /var/lib/swr/attachments on named volume (sabine-runtime.mjs:93-103).
- Email transport selects operator EMAIL_WEBHOOK_URL and optional bearer credential; console rejects password reset delivery. Synthetic test cleared webhook and did not launch worker (src/lib/email.ts:15-25,35-79).

### Attacker Capabilities

- Unauthenticated client can submit login/bootstrap inputs; cannot sign identities.
- Authenticated actor controls URL/query/body UUIDs, uploads and captured URLs, but has no assumed tenant/project/admin privileges.
- Crew member can read shared Chief work while link active; read capability must not become teammate mutation or persist after link inactive.
- Project Superintendent has current Area scope; project membership must not authorize other Area creation.
- Operator filesystem/Docker/database authority trusted; direct SQL changed only synthetic fixture to test modeled inactive relationship.

### Security Objectives

- No unauthorized tenant/project/request/file/metadata access through identifiers or UI alternatives.
- Current relationships and logout/session revocation enforced server-side.
- Separate company and tenant policies, inherited read scope and mutation authority.
- Attachment persistence, correct request association, unique keys and integrity.
- Preserve original source; no fixes, real users or external system testing.

### Assumptions

- Company is not tenant; A/B separate-tenant matrix and Company C same-tenant subcontractor test used.
- Generic Compose lacks attachment volume/root configuration, whereas Sabine mounts named durable root; deployment durability not runtime tested.
- Native beta merges inherited environment; its Unix socket setup is not directly Windows compatible. Assessment used separate Docker database and explicit env.
- POSIX storage modes do not establish Windows ACL guarantees; production ACL/static proxy mounts unverified.
- Historical audit claim of missing Superintendent review wiring is stale; current explicit SURVEY_REVIEWER transaction guards exist (survey-review-authority.ts:11-44).
- No request delete/move or signed URLs to test. Every repository file, concurrent revocation race, real production deployment and full assistive-technology UX not audited.
- Original phase5 ref moved concurrently from da855c0 to 0803d5e; assessment duplicate stayed pinned and did not alter original.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [FILE-001: Inactive crew links retain request and attachment access](#finding-1) | critical | high | inline below |
| [AUTH-001: Superintendent creates work outside authorized Area](#finding-2) | high | high | inline below |
| [REQ-001: Crew member cancels a teammate's delayed work](#finding-3) | high | high | inline below |
| [AUTH-002: Denial responses reveal unassigned request existence](#finding-4) | medium | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] FILE-001: Inactive crew links retain request and attachment access

| Field | Value |
| --- | --- |
| Severity | critical |
| Confidence | high |
| Confidence rationale | Parent local HTTP and database reproduction plus source trace at exact da855c0. |
| Category | authorization |
| CWE | CWE-863 |
| Affected lines | src/modules/ticket/infrastructure/ticket.repository.ts:479-482 |

#### Summary

After a synthetic roster link is deactivated, the former crew member still receives the teammate request, filenames and attachment bytes with HTTP 200. The account assignment API simultaneously reports an empty crew.

#### Root Cause

resolveVisibility obtains the former Party Chief from findPartyChiefForInstrumentMan, which ignores crew_rosters.deactivated_at. The resulting SQL grants Party-Chief crew visibility and attachment download trusts that visible-ticket result.

**Missing or inconsistent authorization control** — `src/modules/ticket/infrastructure/ticket.repository.ts:479-482`

resolveVisibility obtains the former Party Chief from findPartyChiefForInstrumentMan, which ignores crew_rosters.deactivated_at. The resulting SQL grants Party-Chief crew visibility and attachment download trusts that visible-ticket result.

```typescript
`SELECT party_chief_id FROM crew_rosters
       WHERE tenant_id = $1 AND project_id = $2 AND instrument_man_id = $3
       LIMIT 1`,
      [tenantId, projectId, instrumentManId],
```

#### Validation

After a synthetic roster link is deactivated, the former crew member still receives the teammate request, filenames and attachment bytes with HTTP 200. The account assignment API simultaneously reports an empty crew.

Validation method: local HTTP and PostgreSQL synthetic fixtures plus source trace

**Missing or inconsistent authorization control** — `src/modules/ticket/infrastructure/ticket.repository.ts:479-482`

resolveVisibility obtains the former Party Chief from findPartyChiefForInstrumentMan, which ignores crew_rosters.deactivated_at. The resulting SQL grants Party-Chief crew visibility and attachment download trusts that visible-ticket result.

```typescript
`SELECT party_chief_id FROM crew_rosters
       WHERE tenant_id = $1 AND project_id = $2 AND instrument_man_id = $3
       LIMIT 1`,
      [tenantId, projectId, instrumentManId],
```

Limitations:
- Revocation was a controlled SQL fixture change because this checkpoint lacks roster removal. No cross-project or cross-tenant file exposure was observed. User rubric classifies unauthorized attachment retrieval critical.

#### Dataflow

resolveVisibility obtains the former Party Chief from findPartyChiefForInstrumentMan, which ignores crew_rosters.deactivated_at. The resulting SQL grants Party-Chief crew visibility and attachment download trusts that visible-ticket result.

#### Reachability

Give IM1 a current roster link to a Party Chief, obtain a teammate attachment URL, then mark that synthetic roster row inactive while retaining the account's Instrument Man membership. Replay the URL: bytes are still returned.

#### Severity

**Critical** — Revocation was a controlled SQL fixture change because this checkpoint lacks roster removal. No cross-project or cross-tenant file exposure was observed. User rubric classifies unauthorized attachment retrieval critical.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Exclude inactive roster links when resolving all inherited request visibility; preserve exact-own assignment separately. Recheck every membership-derived file control after revocation and add a supported audited roster removal workflow.

Tests:
- Give IM1 a current roster link to a Party Chief, obtain a teammate attachment URL, then mark that synthetic roster row inactive while retaining the account's Instrument Man membership. Replay the URL: bytes are still returned. Expected: deny before unauthorized reads or writes.

<a id="finding-2"></a>

### [2] AUTH-001: Superintendent creates work outside authorized Area

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Parent local HTTP and database reproduction plus source trace at exact da855c0. |
| Category | authorization |
| CWE | CWE-863 |
| Affected lines | src/modules/ticket/application/create-direct-assignment-ticket.ts:68-71 |

#### Summary

A project Superintendent assigned only Area A can POST a direct assignment in Area B. The API returns 201 and persists ASSIGNED work, even though the same actor's subsequent detail GET returns 404.

#### Root Cause

The creation route resolves project role and accepts the client-selected AOR. The use case verifies project ownership of that AOR and active field roles, then creates work without checking the Superintendent's current authorized Area population.

**Missing or inconsistent authorization control** — `src/modules/ticket/application/create-direct-assignment-ticket.ts:68-71`

The creation route resolves project role and accepts the client-selected AOR. The use case verifies project ownership of that AOR and active field roles, then creates work without checking the Superintendent's current authorized Area population.

```typescript
const aorNodeCode = await repo.findAorNodeCode(db, params.tenantId, params.projectId, params.aorNodeId);
  if (!aorNodeCode) {
    throw new NotFoundError('AOR node not found');
  }
```

#### Validation

A project Superintendent assigned only Area A can POST a direct assignment in Area B. The API returns 201 and persists ASSIGNED work, even though the same actor's subsequent detail GET returns 404.

Validation method: local HTTP and PostgreSQL synthetic fixtures plus source trace

**Missing or inconsistent authorization control** — `src/modules/ticket/application/create-direct-assignment-ticket.ts:68-71`

The creation route resolves project role and accepts the client-selected AOR. The use case verifies project ownership of that AOR and active field roles, then creates work without checking the Superintendent's current authorized Area population.

```typescript
const aorNodeCode = await repo.findAorNodeCode(db, params.tenantId, params.projectId, params.aorNodeId);
  if (!aorNodeCode) {
    throw new NotFoundError('AOR node not found');
  }
```

Limitations:
- Same project only; tenant/project and crew eligibility controls remain effective.

#### Dataflow

The creation route resolves project role and accepts the client-selected AOR. The use case verifies project ownership of that AOR and active field roles, then creates work without checking the Superintendent's current authorized Area population.

#### Reachability

Log in as an Area-A Superintendent. POST /api/tickets with DIRECT_ASSIGNMENT, the Area-B UUID, an active requester and active project crew. Receive 201 and an assigned request outside the actor's visible population.

#### Severity

**High** — Same project only; tenant/project and crew eligibility controls remain effective.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Check current Superintendent Area authorization inside the direct-creation transaction before numbering, saving or returning work.

Tests:
- Log in as an Area-A Superintendent. POST /api/tickets with DIRECT_ASSIGNMENT, the Area-B UUID, an active requester and active project crew. Receive 201 and an assigned request outside the actor's visible population. Expected: deny before unauthorized reads or writes.

<a id="finding-3"></a>

### [3] REQ-001: Crew member cancels a teammate's delayed work

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Parent local HTTP and database reproduction plus source trace at exact da855c0. |
| Category | authorization |
| CWE | CWE-863 |
| Affected lines | src/modules/ticket/application/request-field-cancel.ts:19-31 |

#### Summary

IM1 sharing a Party Chief with IM2 can POST field-cancel on IM2's DELAYED request. The API returns 200 and the database becomes PENDING_PC_APPROVAL with FIELD_CANCELED.

#### Root Cause

Crew visibility permits reading a teammate's request. The field-cancel use case forwards that visibility to a role/state transition without requiring the Instrument Man to be the exact assigned operator.

**Missing or inconsistent authorization control** — `src/modules/ticket/application/request-field-cancel.ts:19-31`

Crew visibility permits reading a teammate's request. The field-cancel use case forwards that visibility to a role/state transition without requiring the Instrument Man to be the exact assigned operator.

```typescript
return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['PARTY_CHIEF', 'INSTRUMENT_MAN', 'SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to:             'PENDING_PC_APPROVAL',
    patch:          {
      pendingPcOutcome: 'FIELD_CANCELED',
      pendingPcReason: params.reason ?? null,
    },
```

#### Validation

IM1 sharing a Party Chief with IM2 can POST field-cancel on IM2's DELAYED request. The API returns 200 and the database becomes PENDING_PC_APPROVAL with FIELD_CANCELED.

Validation method: local HTTP and PostgreSQL synthetic fixtures plus source trace

**Missing or inconsistent authorization control** — `src/modules/ticket/application/request-field-cancel.ts:19-31`

Crew visibility permits reading a teammate's request. The field-cancel use case forwards that visibility to a role/state transition without requiring the Instrument Man to be the exact assigned operator.

```typescript
return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['PARTY_CHIEF', 'INSTRUMENT_MAN', 'SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to:             'PENDING_PC_APPROVAL',
    patch:          {
      pendingPcOutcome: 'FIELD_CANCELED',
      pendingPcReason: params.reason ?? null,
    },
```

Limitations:
- Requires shared crew and DELAYED state; terminal cancellation still needs approval.

#### Dataflow

Crew visibility permits reading a teammate's request. The field-cancel use case forwards that visibility to a role/state transition without requiring the Instrument Man to be the exact assigned operator.

#### Reachability

Create two Instrument Men under one Party Chief, assign a delayed request only to IM2, then POST its field-cancel endpoint as IM1.

#### Severity

**High** — Requires shared crew and DELAYED state; terminal cancellation still needs approval.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Require Instrument Man actor ID to match assignedInstrumentManId for field disposition, or retire the legacy route under the approved workflow compatibility policy.

Tests:
- Create two Instrument Men under one Party Chief, assign a delayed request only to IM2, then POST its field-cancel endpoint as IM1. Expected: deny before unauthorized reads or writes.

<a id="finding-4"></a>

### [4] AUTH-002: Denial responses reveal unassigned request existence

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Parent local HTTP and database reproduction plus source trace at exact da855c0. |
| Category | information-disclosure |
| CWE | CWE-203 |
| Affected lines | src/lib/ticket-route-helpers.ts:34-45 |

#### Summary

A requester receives 403 for an existing request in an unassigned project but 404 for a nonexistent request. This confirms same-tenant request existence without revealing its title or content.

#### Root Cause

The route looks up the tenant-scoped request before resolving membership. Existing unassigned requests fail membership with ForbiddenError, while absent requests fail NotFoundError.

**Missing or inconsistent authorization control** — `src/lib/ticket-route-helpers.ts:34-45`

The route looks up the tenant-scoped request before resolving membership. Existing unassigned requests fail membership with ForbiddenError, while absent requests fail NotFoundError.

```typescript
const { rows } = await pool.query<{ project_id: string }>(
    `SELECT project_id FROM tickets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [ticketId, auth.tenantId],
  );
  if (!rows[0]) throw new NotFoundError(`Ticket ${ticketId} not found`);
  const projectId = rows[0].project_id as UUID;

  const actorRole = await getProjectRole(
    pool, auth.tenantId, projectId, auth.userId, auth.sessionVersion,
  );
```

#### Validation

A requester receives 403 for an existing request in an unassigned project but 404 for a nonexistent request. This confirms same-tenant request existence without revealing its title or content.

Validation method: local HTTP and PostgreSQL synthetic fixtures plus source trace

**Missing or inconsistent authorization control** — `src/lib/ticket-route-helpers.ts:34-45`

The route looks up the tenant-scoped request before resolving membership. Existing unassigned requests fail membership with ForbiddenError, while absent requests fail NotFoundError.

```typescript
const { rows } = await pool.query<{ project_id: string }>(
    `SELECT project_id FROM tickets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [ticketId, auth.tenantId],
  );
  if (!rows[0]) throw new NotFoundError(`Ticket ${ticketId} not found`);
  const projectId = rows[0].project_id as UUID;

  const actorRole = await getProjectRole(
    pool, auth.tenantId, projectId, auth.userId, auth.sessionVersion,
  );
```

Limitations:
- Limited to same-tenant existence with identifiers; UUIDs are not sequential and other-tenant IDs remain 404.

#### Dataflow

The route looks up the tenant-scoped request before resolving membership. Existing unassigned requests fail membership with ForbiddenError, while absent requests fail NotFoundError.

#### Reachability

As User A, GET the known A-Project-2 request UUID and then a nonexistent UUID. Observe 403 versus 404; both are otherwise unauthorized.

#### Severity

**Medium** — Limited to same-tenant existence with identifiers; UUIDs are not sequential and other-tenant IDs remain 404.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Use one intentional not-visible response for request metadata, details, history and attachment routes without returning existence signals to unauthorized members.

Tests:
- As User A, GET the known A-Project-2 request UUID and then a nonexistent UUID. Observe 403 versus 404; both are otherwise unauthorized. Expected: deny before unauthorized reads or writes.

## Structural Hardening

The scan also produced derived, unsealed design guidance based on the complete finding collection. These proposals describe options and tradeoffs; they do not indicate that any finding has been remediated.

[Open the structural hardening portfolio](hardening/hardening.md)

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Tenant/project/request guards, direct APIs and role mutations | not recorded | Reported | Local synthetic matrix plus independent static review. AUTH-001 and REQ-001 reproduce unauthorized writes; AUTH-002 existence oracle. Tenant/project requester isolation held. |
| File upload/download, metadata and revocation | not recorded | Reported | FILE-001 reproduced inactive crew file access. Cross-tenant/project identifiers and unauthenticated URLs denied; current membership/company-view/logout revocation passed. |
| Requester and IT/admin workflows | not recorded | Needs follow-up | Independent source and browser/detector reviews; missing lifecycle and audit surfaces documented in requested brief. |

## Open Questions And Follow Up

- Not all 503 repository files fully audited; focus is requested authorization boundaries.
- No request move/delete or signed-URL implementations to exercise.
- Concurrent permission-revocation races, deployment proxy/static mappings, Windows ACLs and durable production storage were not verified.
- PROJECT_ADMIN notification payload policy conflicts with stated lack of ticket visibility; requires policy decision.
