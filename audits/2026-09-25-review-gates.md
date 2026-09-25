# Remaining review gates — closure brief

Reviewed checkpoint: `ca3503f642126268b5acfc5bb516cf3567725273`. This brief covers the uncommitted remediation working tree as of 2026-09-25. The prior [remediation brief](2026-09-25-remediation-brief.md) remains the historical record of the initial audit.

| Gate | Evidence | Result |
| --- | --- | --- |
| Migration 006 on the local application database | `survey-db` / `survey_dev` had no tenant, project, user, or ticket rows before application. Migrations 005–008 were applied transactionally and recorded in `_migrations`. Migration 006 had already passed fresh and representative legacy-data upgrade tests, including a rerun. Migration 008 passed a fresh PostgreSQL 15 application and rerun. | Closed for the local development database. |
| Application database integration | PostgreSQL tests cover company-domain binding, cross-tenant creation rejection, subcontractor and GC visibility, requester cancellation, append-only events, Full Build activation, field and survey cancellation chains, and department setup. All run inside rollback transactions. | Closed for exercised paths. |
| Project activation/readiness | Project creation records FULL/MEDIUM/SLIM crew build. Setup APIs create arbitrary-depth AOR levels/nodes and assign Superintendents. Activation checks AOR, Survey Manager, and Full Build Superintendent requirements; warnings require acknowledgement. Activation and its tenant event share a transaction. | Closed. |
| Field and survey cancellation approval chains | IM field status moves to `PENDING_PC_APPROVAL`. The assigned Party Chief, ticket Superintendent, or Survey Manager can resolve it; the first row-locked responder wins. Path B reaches `FIELD_CANCELED`. Path C enforces PC → Superintendent/Manager, Superintendent → Manager, or direct Manager cancellation, with a reason and duplicate-initiation guard. Requester cancellation clears pending work. State changes and ticket events share route transactions. | Approval-chain gate closed. |
| AOR, departments, and crew-build schema | Migration 007 adds AOR tree/assignments, departments, memberships/titles, acting grants, templates, and ticket workflow fields. Owner-approved role names are `DEPARTMENT_MANAGER` and `DEPARTMENT_LEAD`. Tickets bind to AOR nodes and departments, with title priority or a manually selected department for a requester without membership. Department setup and delegated title assignment are exposed through tenant-scoped APIs. Migration 008 adds the four-level priority. | Schema and core setup gate closed. |
| Tenant-admin provisioning | `pnpm db:bootstrap-admin` creates an initial tenant, GC company, local user, and TENANT_ADMIN membership atomically. It was exercised against a disposable PostgreSQL instance; password preservation has a regression test. It was not run against `survey_dev`, so that development database remains empty of customer records. | Closed for initial provisioning. |
| Dependency verification | Live `pnpm audit --audit-level=low` returned `No known vulnerabilities found`. | Closed as of this run. |

Verification: `pnpm tsc --noEmit`, `pnpm test` with `DATABASE_URL` (32 passed, 0 skipped), `pnpm build`, `git diff --check`, and live `pnpm audit --audit-level=low` passed. The database integration suite used `postgresql://postgres:localdev@localhost:5433/survey_dev`. No integration fixture was committed to that database. The disposable migration container was stopped.

## Remaining Phase 2 work outside these gates

- The notification module is still skeletal. Cancellation approval events are persisted, but outbound requester/crew emails and stop-work notifications are not dispatched.
- Draft numbering still occurs at creation; CLAUDE.md requires a number at `DRAFT → SUBMITTED`. Draft recovery and the full user lifecycle are also not implemented.
- Department reassignment/removal, independent AOR reassignment, role vacancy handling, and some title/list surfaces remain future work. Legacy area and cancellation compatibility endpoints remain for historical rows.
- The running `swrtracker-web-1` image was not rebuilt or deployed from this working tree. Review this patch and update the app image before UI/API acceptance testing.
