# Phase 5 offboarding release boundary

This runbook covers the approved scoped offboarding increment. It does not authorize production deployment. Read the [acceptance record](../audits/phase5-scoped-offboarding-acceptance-20261002.md) and [writer manifest](../audits/phase5-lifecycle-enforcement-manifest-20261001.md) before rollout.

## Before deployment

1. Pin the reviewed commit and locked dependency/build artifact. Record the database migration ledger, image digest, running web/worker revisions and deployment owner.
2. Schedule a maintenance interval. Stop admission of administrative and ordinary mutations, drain outstanding requests, and stop every old web and worker process. Inventory standalone notification, reset-mail and maintenance jobs as well as the loop worker. There is no application feature flag that makes a mixed deployment safe.
3. Take an encrypted PostgreSQL custom-format backup and a consistent attachment-store snapshot. Preserve the encryption keys and object metadata separately with restricted access. Record timestamps, hashes, migration ledger and image revision. Check that the dump can be listed and that the designated restore procedure can restore the database and matching attachment objects together. Production restore/RPO/RTO certification remains a separate pilot gate; this increment did not run a production restore.
4. Check for cross-tenant membership/company references, half-paired deactivation stamps, duplicate active grants and missing historical identity references. Migration031 deliberately refuses inconsistent incumbent rows; investigate rather than disabling constraints or deleting history. Preserve legacy `PROJECT_ADMIN` scalar roles; its independent grant backfill does not invent Manager membership.
5. Run the repository's `pnpm db:migrate` with the designated migration credentials and explicit intended environment. Apply additive031 and032 after earlier migrations, using the existing migration ledger. Do not run a test fixture/seed against production. Retain migration outputs and verify paired stamps, same-tenant FKs, active-grant uniqueness, append-only events, review/outbox constraints and explicit project-company associations.
6. Verify the runtime identity can perform supported commands and cannot update/delete/truncate immutable lifecycle and administrative events. Separate runtime/migration privilege redesign and production migration locking/checksums are later owner decisions; the existing migration runner is not claimed to provide them.

## Compatible rollout ordering

Deploy the complete lifecycle-aware version to **all** web and worker processes before opening ingress. Every duty/authority writer must acquire the tenant barrier first. Ordinary protected mutations and notification workers use SHARED; revocation/session/authority writers use EXCLUSIVE. Choose the mode before acquisition and never upgrade SHARED to EXCLUSIVE.

Verify each process is on the pinned revision; check readiness, database connectivity, production JWT secret, attachment mount and configured worker actor. Start the existing `pnpm worker:notifications` loop; it includes reset-mail and administrative-review delivery. The standalone `pnpm worker:administrative-notifications:once` uses the same durable outbox when scheduled separately. Avoid accidentally configuring duplicate schedulers; database leases still protect concurrent claim attempts.

Before opening ingress, use synthetic designated identities to check project preview, tenant preview, current-authority denial, old-cookie rejection, one local disable, independently confirmed tenant disable and review resolution. Confirm other-project access remains available after renewed local sessions. Check no old binary or uncoordinated direct SQL writer remains. Then open traffic and record the exact enablement time.

## Worker restart and recovery

- Reviews are durable database work items; notification delivery does not determine whether access was disabled or whether a review exists.
- Administrative delivery claims at most10 rows per tenant with two-minute leases. Restarted workers reclaim expired leases; they recheck the current recipient's eligible Central IT authority before dispatch.
- Failure stores a bounded diagnostic code, clears the held lease and delays retry exponentially up to one hour. Automatic attempts stop at8. Inspect delayed/exhausted rows and current recipient eligibility; operators can still process the authenticated review queue. An exhausted message must not trigger a second offboarding command.
- A provider may deliver before database bookkeeping commits. Delivery is at least once, with stable outbox identity supplied as transport metadata. Confirm provider deduplication independently if needed; do not claim database transactions guarantee exactly-once email.
- Unknown command response: retain the exact endpoint, displayed scope, body and idempotency key. Retry only that intent. Every409 requires deliberate evidence reload and fresh confirmation. Authority/session loss is enforced before cached replay. A replay is historical evidence, not certification of today's account state.
- Resolving a review with `NO_FURTHER_ACTION` does not change the account. `TENANT_ACCOUNT_DISABLED` links the same subject's separately confirmed tenant event; a failed wider action leaves review pending.

## Rollback boundary

Before any access transition, a rollback is possible only to a version compatible with the installed additive schema and its governance rules. After the first transition, **never** restore a pre-lifecycle binary: it ignores retained disablement metadata and can expose disabled access or recreate duties.

Use a previously verified lifecycle-aware artifact or a forward correction. Stop admission and drain processes before replacing versions. Keep disablement metadata, immutable events, completed idempotency rows, review resolutions and outbox records intact. Do not clear stamps, decrement session versions, delete events or replay migrations to reactivate a person.

A full database/storage restore is a distinct owner-authorized recovery operation with an outage, consistent restore point and explicit treatment of transitions after that point. This runbook does not authorize it or define a reactivation workflow. Retain the reviewed artifact and backup until the owner accepts the deployment.

## Reproduce local acceptance

Use only the disposable `127.0.0.1:15489/swr_team_isolated` fixture. Supply credentials through a local ignored environment file; never commit secrets.

1. Run `node --env-file=.local-test.env tests/beta/scoped-offboarding-case-matrix.mjs pg`. It creates and removes owned schemas and runs the implicated PostgreSQL regressions.
2. Run `node --env-file=.local-test.env tests/beta/scoped-offboarding-acceptance.mjs setup`. Wire a freshly built production runtime to the generated owned schema and secret in `.local-runtime.env`; a Docker runtime uses the same URL with the host reachable from its network. Bind runtime ingress to loopback.
3. Set `SWR_ACCEPTANCE_ORIGIN` to that loopback runtime and `SWR_PLAYWRIGHT_MODULE` to the installed Playwright module. Run `node --env-file=.local-runtime.env tests/beta/scoped-offboarding-case-matrix.mjs external` exactly once against the fresh fixture. The browser harness currently targets the Windows Edge installation; use that documented host for browser acceptance.
4. Run `node --env-file=.local-test.env tests/beta/scoped-offboarding-case-matrix.mjs report`. All A01–A40/P01–P15 groups must pass at the same source digest. Inspect the named assertion sources, not just counts.
5. Stop the owned runtime, then run the acceptance script's `cleanup` mode. It refuses any schema name outside its owned prefix. Keep the sanitized audit record; do not archive local credentials or synthetic token files.

The first real external pilot still needs an explicit owner decision on the separately classified pilot gates. No CI result, production migration or deployment is inferred from this local acceptance.
