# Published-checkpoint audit remediation brief

Baseline reviewed: `ca3503f642126268b5acfc5bb516cf3567725273`.
Working-tree remediation date: 2026-09-25. Changes are uncommitted. Migration 006 was tested in disposable PostgreSQL 15 databases and has not been applied to `survey-db`.

| Audit item | Source remediation | Status |
| --- | --- | --- |
| Dependency verification | Updated Next.js, bcrypt, tsx, and PostCSS lockfile resolution; full live `pnpm audit --audit-level=low` returned no known vulnerabilities. | Verified against npm audit. |
| Ticket creation trusts caller ownership and related IDs | Creation checks active project, area, subarea, requester membership, company, and tenant in one repository query before sequence allocation; composite foreign keys in migration 006 protect new writes. | Source, unit test, and isolated DB constraint verification passed. |
| Workflow actions lack actor-to-ticket checks | Assigned crew IDs are checked against project memberships; start and completion require assignment; requester cancellation requires ownership; Survey Manager approval rejects self-conflict; IM completion now enters Party Chief approval. Ticket row is locked during transitions. | Source and unit tests verified; application DB integration pending. |
| Administrative create routes lack role gates | Tenant admin and project admin boundaries are resolved at routes and enforced in use cases. Archived project configuration writes are rejected. | Source and unit tests verified. |
| Subcontractor company isolation absent from ticket queries | Company scope is combined with role scope in the repository list and detail queries. | Source and unit tests verified. |
| Retired roles and cancellation states retain authority | Legacy roles are mapped by migration 006; current use cases use Survey Manager authority. Requester cancellation is immediate and terminal; legacy pending cancellations resolve to current terminal states. | Source, unit tests, and isolated legacy-data upgrade passed. |
| Registration input and company binding | Registration body, IDs, email, name, and password are bounded and validated. Email domain is bound to the selected company; tenant admins can assign domains with tenant audit events. | Source, unit tests, and isolated DB domain binding verification passed. |

Additional work: whitelist changes now create append-only tenant audit events in the same transaction. Migration 006 adds append-only triggers for ticket and tenant event tables and composite tenant relationship constraints for new writes.

Verification: `pnpm tsc --noEmit`, `pnpm test` (15 passing), `pnpm build`, `git diff --check`, and live `pnpm audit --audit-level=low` passed. Type checking was rerun after the build because parallel runs can race on generated `.next/types` files. Migrations 001–006 applied cleanly in a fresh disposable PostgreSQL 15 database. A second database seeded from migrations 001–005 with [legacy fixture](../tests/db/006_upgrade_fixture.sql) applied 006, passed [post-upgrade assertions](../tests/db/006_post_assertions.sql) for roles, domain binding, cross-tenant foreign keys, and append-only event triggers, and accepted a rerun of 006. The disposable container was stopped and removed.

Remaining review gates:

1. Review and apply migration 006 to `survey-db` when ready. The live application database was intentionally left untouched; its existing data may reveal upgrade issues that representative fixtures did not cover. Run application database integration tests after applying it.
2. Complete current-spec project activation/readiness. Newly created projects remain in SETUP and cannot accept tickets until activation exists.
3. Implement full current-spec survey and field cancellation approval chains, AOR/crew-build schema, and operational tenant-admin provisioning. The current cancellation compatibility route only resolves legacy pending requests.
