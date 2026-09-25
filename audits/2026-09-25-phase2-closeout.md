# Phase 2 closeout audit — 2026-09-25

Reviewed checkpoint: `ca3503f642126268b5acfc5bb516cf3567725273` and the uncommitted Phase 2 working tree. This brief supersedes the open-gate sections of the earlier [review-gate](2026-09-25-review-gates.md), [remediation](2026-09-25-remediation-brief.md), and [gap-matrix](phase2-gap-matrix.md) notes. It is a local development review, not a production deployment attestation.

## Outcome

The Phase 2 backend and migration work is ready for review. The owner confirmed `DEPARTMENT_MANAGER`/`DEPARTMENT_LEAD`, direct-ticket `CREATED` until crew assignment, 30-day hard deletion after draft soft deletion, and tenant-wide domain changes reserved for `TENANT_ADMIN`. The last decision resolves the conflict between CLAUDE.md §§5 and 21: SETUP `PROJECT_ADMIN` uses project-scoped invitations and cannot configure a tenant-wide allowed domain.

| Review gate | Evidence and result |
| --- | --- |
| Schema and migrations | Migrations 001–021 are recorded on local `survey_dev`; the latest is `021_legacy_area_aor_backfill.sql`. Fresh, legacy-upgrade, fail-closed, and rerun fixtures cover the new schema. `survey_dev` has zero ticket rows, so its migration run did not exercise live customer data. Historical location tables and columns remain as read-only evidence. |
| Workflow and authorization | Automated cases cover tenant/company boundaries, role and AOR scoping, direct and draft flows, approval/cancellation, crew assignment, acting authority, archival, and same-transaction ticket events. Retired close/cancel approval routes and the unauthenticated tenant-creation route are absent from the production build. |
| Dependency verification | Live `pnpm audit --audit-level=low` reported no known vulnerabilities after dependency and lockfile updates. This is the registry advisory check at review time. |
| Input validation and errors | Route body limits, UUID and enum parsing, validated registration/invite fields, and bounded attachment writes were reviewed. Invalid actor, company, project, and transition cases reject before state changes in focused tests. Database and SMTP errors remain visible/retryable rather than being treated as successful writes. |
| Static security review | Codex Security reviewed 151 changed source items, including deleted files, against the checkpoint. Four original-snapshot findings were validated and fixed in this working tree: invite token returned to inviter; subcontractor cross-company help-flag visibility/claim; subcontractor cross-company deleted-draft listing/recovery; and queued ticket email after project-access removal. No additional credible candidate was found in the reviewed tenancy, migration, attachment, identity, or shared-library paths. |
| Regression and build | `pnpm build`, `pnpm tsc --noEmit`, and `git diff --check` pass. The full `pnpm test` run with `DATABASE_URL=survey_dev` passes 130 tests, with two cases intentionally skipped because they require separate database URLs. Both skipped cases passed separately in a fresh disposable PostgreSQL database migrated through 021, which was then removed. No fixture rows were committed to `survey_dev`. |

## Security fixes from the final review

1. `POST /api/invites` no longer returns the bearer token to the inviting administrator. The durable mail outbox continues to deliver it to the invitee; acceptance remains single-use.
2. Level 2 help-flag listing and claim now add subcontractor company isolation on top of role and crew scoping. A live two-company PostgreSQL case verifies that a second company's Party Chief cannot list or claim the flag or change the assignment.
3. Deleted-draft listing and recovery now apply subcontractor company scoping to `PROJECT_ADMIN`; GC Project Admin behavior remains project-wide. Focused tests verify recovery rejection and both page queries.
4. Notification delivery rechecks current ticket read visibility after claiming a queued row. A revoked recipient is skipped; transient visibility lookup failures remain retryable. A PostgreSQL case exercises membership removal before retry.

The completed Codex Security scan (`6dca9ed4-1b7a-4f54-8b2b-baf0f3ab7d00`) is the detailed evidence record for the four original-snapshot findings. Its report is at `C:\Users\xwall\.codex\state\plugins\codex-security\scans\SWRTracker\ca3503f642126268b5acfc5bb516cf3567725273_20260925T143154Z_lshqtnc5\report.md`. Its findings describe the vulnerable pre-fix snapshot; the local working tree contains the fixes above. The security review does not establish that a deployed application image has been updated.

## Before deployment or the next development session

- Review this large, uncommitted patch and migration sequence against any nonempty target database. Migration 019 or 021 intentionally aborts on ambiguous historical status or AOR mappings; resolve those rows through an audited owner decision before retrying. No destructive column drop was made.
- Configure SMTP, an HTTPS invitation base URL, a persistent attachment volume, and the notification, draft-maintenance, and timeout-signal workers. Build and deploy the application image, then perform staging API acceptance and worker delivery checks.
- Run a representative load test for the 10,000-ticket target. Current indexes are present, but no load measurement is recorded.
- Phase 3 owns the mobile/public UI and remaining role-specific presentation; Phase 4 owns reporting, CSV audit surfaces, and lineage views. These were not treated as Phase 2 backend blockers.

No production deployment or customer-data migration was performed during this review.

## Local Docker verification — 2026-09-25

The local `compose.yaml` in `D:\Programming\SWRTracker` now runs `swrtracker:phase2` as web, notification, draft-maintenance, and timeout-signal containers beside `survey-db`. The notification container targets `host.docker.internal:5433/survey_dev`; that database records all 21 migrations, including `006_security_boundaries.sql` and `021_legacy_area_aor_backfill.sql`. SHA-256 hashes of the image's invitation route, notification repository, and migration 021 match this checkout. The earlier container from `C:\Users\xwall\ProjectPrograms\SWRTracker`, which targeted a different `postgres` database and older worker, is no longer the running SWRTracker stack.

The web health endpoint returned HTTP 200 with a connected database. Web and draft workers both have write access to the shared `swrtracker_attachments` volume at `/app/attachments`. All three worker processes started without reported errors, and the notification worker reached its configured SMTP TCP port. The rollback-based database security integration suite passed 3/3 from inside the web image. Host checks against the same `survey_dev` database passed `pnpm tsc --noEmit` and `pnpm test` (130 passed, two separately verified special-URL cases skipped in the default run).

Local Docker readiness is established. An authenticated SMTP delivery was not sent by this smoke test. The current invitation link uses `http://localhost:3000`, which is allowed by the local-only URL validator; a reachable HTTPS base URL is still needed before external invitation delivery. The Compose file has no worker health checks or restart policy, so container process status alone does not prove continued job progress.
