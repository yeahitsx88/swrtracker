# PROJECT_MAP.md — SWR Tracker Navigation Index

> **Navigation aid only.** This file does not define requirements, architecture, business rules, or implementation authority. If this map conflicts with an authoritative project source, the authoritative source wins.

## 1. Start Here

| Need | Go To |
|---|---|
| Implementation rules / design basis | `CLAUDE.md` |
| Agent coordination / safe work boundaries | `AGENTS.md` |
| Product and business intent | `PROJECT_VISION_v2.md` |
| High-level project status / setup | `README.md` |
| Prior Codex implementation batches / known gaps | `CODEX.md` |
| Database evolution | `db/migrations/` |
| Tests and fixtures | `tests/` |

### Authority

- `CLAUDE.md` is the implementation source of truth.
- `AGENTS.md` governs agent coordination and explicitly defers to `CLAUDE.md` when the two conflict.
- `PROJECT_MAP.md` provides navigation only.

## 2. Application Structure

```text
src/
├── app/        — Next.js web/API boundary
├── lib/        — shared infrastructure/utilities
├── modules/    — domain-oriented application modules
└── shared/     — shared application code
```

Architecture direction defined by the project:

```text
web → application → domain
infrastructure → application (via interfaces)
```

Domain must not depend on infrastructure. Web/API must not contain business logic. Consult `CLAUDE.md` for governing architecture details.

## 3. Domain Modules

```text
src/modules/
├── identity/       — users, authentication, sessions
├── tenancy/        — tenants, projects, companies, roles, AOR structure
├── ticket/         — ticket lifecycle, assignment, cancellation
├── workflow/       — state-transition enforcement
├── attachment/     — file metadata and access control
├── notification/   — notification dispatch
├── reporting/      — aggregated queries and reporting
└── audit/          — append-only event history
```

For module-specific authority, ownership, and dependencies:

1. consult the applicable sections of `CLAUDE.md`;
2. consult `AGENTS.md` Section 3 for module ownership and safe parallelization boundaries.

## 4. Common Navigation Paths

### Changing ticket behavior

1. `CLAUDE.md` — applicable ticket/workflow rules
2. `src/modules/ticket/`
3. `src/modules/workflow/` if state transitions are affected
4. `tests/ticket/`
5. `db/migrations/` if persistence changes
6. `CODEX.md` after verified implementation, according to project rules

### Changing roles, companies, projects, or AOR behavior

1. `CLAUDE.md`
2. `src/modules/tenancy/`
3. `src/modules/identity/` if identity/authentication is affected
4. relevant tests
5. `db/migrations/` if schema changes

### Changing workflow/state transitions

1. `CLAUDE.md`
2. `src/modules/workflow/`
3. `src/modules/ticket/`
4. `src/modules/audit/`
5. workflow tests

### Changing UI/API behavior

1. applicable rules in `CLAUDE.md`
2. `src/app/`
3. relevant domain/application module
4. relevant tests

Business logic belongs in the applicable module rather than the web layer.

### Investigating previous Codex work or known gaps

→ `CODEX.md`

### Understanding why the product exists

→ `PROJECT_VISION_v2.md`

### Determining safe parallel agent boundaries

→ `AGENTS.md`

## 5. Shared / High-Coordination Areas

Treat these as coordination-sensitive and consult `AGENTS.md` before modification:

- `db/migrations/`
- `src/lib/`
- `src/app/api/`
- shared test fixtures
- `CODEX.md`

## 6. Before Modifying Code

1. Read `CLAUDE.md` as required by project instructions.
2. Identify the affected module or workflow boundary.
3. Read the applicable governing sections.
4. Check `AGENTS.md` for modification and coordination boundaries.
5. Inspect the existing implementation and relevant tests.
6. Establish the required test/type-check baseline.
7. Make the smallest coherent change.
8. Verify changed behavior and relevant regressions.
9. Record completed work according to project rules.

Do not use this map as a substitute for reading the governing source.

## 7. Maintenance Rule

Update this map only when a meaningful navigation boundary changes, such as:

- an authoritative entry point changes;
- a major module is added, removed, or materially repurposed;
- a common workflow moves to a different repository area;
- a new coordination-sensitive area becomes important.

Do not update this map merely because individual files are added, renamed, or modified when the semantic navigation remains unchanged.
