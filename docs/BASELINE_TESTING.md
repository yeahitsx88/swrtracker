# Baseline testing for ADCQ-260923-001

Gate A checkpoint: 2026-09-24. This verifies the selected `phase5` code baseline and the existing migration chain. It does not verify the newly approved Amelia workflow or pilot readiness.

## Supported local toolchain

- Node.js 22.23.3 (`.node-version`; Docker uses the Node 22 major line)
- pnpm 11.19.0 (`package.json` `packageManager`)
- PostgreSQL 15 for the disposable database replay

`pnpm-workspace.yaml` explicitly permits install scripts for the three declared native/binary dependencies. The old `package.json` `pnpm.onlyBuiltDependencies` key was ignored by pnpm 11. `pnpm test` now loads the existing test files in one process under Node 22; the prior `--test-isolation=none` flag is unsupported there.

From a clean checkout with those tool versions:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

## Disposable PostgreSQL replay

Use a separate temporary cluster; never point the smoke test at an operational database. On macOS with PostgreSQL 15 binaries on `PATH`, one example is:

```sh
SWR_TEST_CLUSTER_DIR=$(mktemp -d /private/tmp/swr-smoke-pg.XXXXXX)
initdb -D "$SWR_TEST_CLUSTER_DIR/data" -A trust --no-instructions
pg_ctl -D "$SWR_TEST_CLUSTER_DIR/data" -l "$SWR_TEST_CLUSTER_DIR/server.log" \
  -o "-c listen_addresses='' -c unix_socket_directories=$SWR_TEST_CLUSTER_DIR -p 55483" start
createdb -h "$SWR_TEST_CLUSTER_DIR" -p 55483 swr_smoke_test_local
export DATABASE_URL="postgresql://$(id -un)@localhost:55483/swr_smoke_test_local?host=$SWR_TEST_CLUSTER_DIR"
export JWT_SECRET="$(openssl rand -hex 64)"
pnpm exec tsx db/migrate.ts
SWR_SMOKE_DISPOSABLE_DB=1 SWR_SMOKE_DATA_DIR="$SWR_TEST_CLUSTER_DIR/data" pnpm smoke:ticket
pg_ctl -D "$SWR_TEST_CLUSTER_DIR/data" stop
```

Choose an unused port if 55483 is taken. The socket-only cluster is the test environment; its data directory may be deleted after the server stops. The smoke command refuses to run unless the database name begins `swr_smoke_test_`, `SWR_SMOKE_DISPOSABLE_DB=1` is set, and the server's data directory matches `SWR_SMOKE_DATA_DIR`. It does not delete rows; dispose of the whole temporary cluster after use.

## Observed Gate A results

| Check | Observed |
|---|---|
| Fresh install on Node 22.23.3 / pnpm 11.19.0 | Pass, including bcrypt, esbuild, and sharp install scripts |
| TypeScript | Pass |
| Existing test suite | 216 passed, 0 failed |
| Next.js production build | Pass |
| PostgreSQL 15.19 empty database | Migrations 001–021 applied; 21 records in `_migrations`; second run skipped all 21 |
| Contained route smoke | Create → submit → approve → assign passed; persisted `ASSIGNED` state and four ordered audit events observed |
| Smoke guard | Run without explicit disposable flag failed before fixture mutation |

The route smoke exercises the older `phase5` workflow only through assignment. It does not cover field completion, return/resubmission, cancellation, external company identity, email delivery, attachment bytes, reporting, or the one-month Amelia pilot. No deployed database or SharePoint process was inspected. Docker image build was not run because Docker is unavailable on this machine; the Dockerfile now copies the pnpm build allowlist for its dependency stage.

## Gate B1 access foundation

Migration 022 adds company-bound invitations, project-scoped company authority and responsibility grants, and additive workflow history fields. The new access smoke requires a separate disposable PostgreSQL 15 cluster with migrations 001–022 applied. Its database name must be exactly `swr_b1_test`; it checks both `SWR_B1_DISPOSABLE_DB=1` and the cluster data directory before adding fixtures. After creating and migrating that database, run:

```sh
export DATABASE_URL="postgresql://$(id -un)@localhost:55484/swr_b1_test?host=$SWR_TEST_CLUSTER_DIR"
SWR_B1_DISPOSABLE_DB=1 SWR_B1_DATA_DIR="$SWR_TEST_CLUSTER_DIR/data" pnpm smoke:access
```

Use the actual socket directory and unused port selected for that cluster. The smoke adds randomized tenants, companies, projects, users, and tickets; dispose of the whole temporary cluster afterward. It checks invite company binding and single use, central versus project IT scope, subcontractor role restrictions, own-only versus granted company visibility, project isolation, mutation denial on a coworker's SWR, and immediate revocation. This is an access foundation check; it does not validate the later workflow, attachment-byte, notification, or private-beta screens.

## Gate B2 Amelia workflow

Migration 023 adds the captured reviewer for field-inability validation. The B2 workflow smoke uses a separate disposable PostgreSQL 15 database named exactly `swr_b2_test`, verifies the server data directory, and requires an explicit opt-in:

```sh
export DATABASE_URL="postgresql://$(id -un)@localhost:55485/swr_b2_test?host=$SWR_TEST_CLUSTER_DIR"
SWR_B2_DISPOSABLE_DB=1 SWR_B2_DATA_DIR="$SWR_TEST_CLUSTER_DIR/data" pnpm smoke:workflow
```

The smoke creates randomized Amelia fixtures and exercises submit, approval, optional Party Chief assignment, Party Chief assignment of an Instrument Man, start, inability validation, same-record return, requester correction, resubmission, independent priority and Need-By revision, direct Instrument Man assignment, and direct completion. It proves the SWR number and first-submitted timestamp survive a return, and checks one return cycle, three assignment-history rows, one Need-By revision, and twelve requester or field-team outbox records. Dispose of the whole temporary cluster after the run.

Observed B2 checks on Node 22.23.3: TypeScript passed; 222 tests passed; the workflow smoke passed against migrations 001–023; and the Next production build passed. This gate validates backend workflow and durable local notification inputs. Attachment bytes, message-preview UI, operational queues, KPI screens, private-beta packaging, and a representative historical-data replay remain outside B2.

## Gate B3 local capabilities

The B3 capability smoke uses a disposable database named exactly `swr_b3_test` and a separate disposable file root. It verifies both paths before creating fixtures:

```sh
export DATABASE_URL="postgresql://$(id -un)@localhost:55486/swr_b3_test?host=$SWR_TEST_CLUSTER_DIR"
export SWR_ATTACHMENT_ROOT="$SWR_TEST_FILE_DIR"
SWR_B3_DISPOSABLE_DB=1 \
SWR_B3_DATA_DIR="$SWR_TEST_CLUSTER_DIR/data" \
SWR_B3_STORAGE_DIR="$SWR_TEST_FILE_DIR" \
pnpm smoke:capabilities
```

The smoke creates a sample Amelia request with an urgent reason, writes and hashes a PDF instruction, seals instruction uploads at submission, approves and assigns the SWR, writes JPEG field evidence as the assigned Instrument Man, completes the work, reads both stored files byte for byte, reconciles the project measures, renders four requester message previews, and captures their durable outbox state. The guard run without `SWR_B3_DISPOSABLE_DB=1` fails before fixture creation.

Observed B3 checks on Node 22.23.3: TypeScript passed; 223 tests passed; migrations 001–023 applied and then skipped cleanly on rerun; the guarded capability smoke passed; and the Next production build passed. Local storage and message capture are private-beta implementations. Organization-owned storage, backup and restore, malware policy, real email delivery, representative historical-data replay, and pilot acceptance remain separate gates.

## Gate B4 device-local private beta

`pnpm beta:setup` creates a dedicated PostgreSQL cluster, attachment root, generated JWT secret, and seed data under `.data/beta/`. It applies migrations 001–023 and creates six sample identities plus five representative Amelia SWRs. A second setup run must skip every applied migration and the existing seed without replacing the beta dataset. `pnpm beta:start` starts the local database and Next server on `127.0.0.1:3000`; `Ctrl-C` or `pnpm beta:stop` stops the database.

Observed B4 checks:

| Check | Observed |
|---|---|
| First setup | PostgreSQL 15 cluster initialized; migrations 001–023 applied; six users and five SWRs seeded |
| Setup rerun | All 23 migrations skipped; existing Amelia seed skipped; database stopped cleanly |
| Health and authentication | Health returned `db: connected`; Lead, requester, company authority, and Project IT logins succeeded |
| Seeded workflow | Five visible statuses: submitted, approved, in progress, completed, and returned for correction |
| Access boundaries | Requester saw three own SWRs; company authority saw all five company SWRs; cross-requester read returned 404 and edit returned 403 |
| Project IT | Initial B4 validation exposed all five SWRs; Gate B6 identified that as over-broad and corrected Project IT to configuration access with zero inherent SWR visibility |
| Measures | Four open, one approved without Instrument Man, one overdue Need-By, one completed; Area/status groups reconciled |
| Local messages | Twelve queued messages captured through the preview API |
| Shutdown | Next stopped and `pg_ctl status` confirmed no beta server running |
| Regression gate | Node 22.23.3 TypeScript passed; 224 tests passed; Next production build passed |

The persistent `.data/beta/` dataset remains on the device for the user's private walkthrough and is ignored by Git. The runbook is `docs/AMELIA_PRIVATE_BETA.md`. These checks do not establish hosted operations, real mail, organization-owned file recovery, real-user onboarding, SharePoint import, or Amelia field-pilot acceptance.

## Gate B5 private-beta usability and traceability

The first real-browser walkthrough exercised Survey Lead and subcontractor company-authority sessions against the persistent Amelia sample dataset. It replaced manual project UUID entry with an authenticated active-project list, displays **Entergy Amelia** in the project shell, exposes linked follow-up creation only to the original requester of a completed SWR, and renders a visibility-gated ticket history from workflow events, returns, assignments, Need-By revisions, attachment activity, and local notifications.

Observed B5 checks: the launcher opened Amelia from a project card; the Survey Operations measures, assignment queue, and local message preview rendered; the completed company-authority SWR showed the follow-up action; its history returned ten ordered records without storage, recipient, email, or idempotency fields; a direct hidden-ticket check remained covered by the route tests. Node 22.23.3 TypeScript passed, 235 tests passed, and the Next production build passed. The browser and beta PostgreSQL server were closed after the walkthrough.

## Gate B6 access correction, role navigation, and compatibility

Review of the private-beta changes found that Project IT had been given ticket visibility beyond its approved access/configuration responsibility. Gate B6 removes that visibility and makes project navigation role-aware. Live verification showed the Project Administrator can list Entergy Amelia and read request configuration, receives zero tickets, and receives 404 for a ticket history. Requester, Survey Lead, Party Chief, and Instrument Man navigation now opens only their relevant beta surfaces; other existing roles retain their scoped read or work entry point. Direct routes continue to enforce server-side authorization.

Local beta storage was tightened to owner-only directories and attachment files. Fresh beta clusters use peer authentication for Unix-socket access and reject host connections; a disposable `initdb` check confirmed those `pg_hba.conf` rules. Existing beta setup applied directory permissions and stopped cleanly.

The guarded `smoke:historical-compatibility` command verifies representative pre-Amelia records without modifying them. It requires an empty disposable database named exactly `swr_history_compat_test`, a declared matching cluster directory, and explicit `SWR_HISTORY_COMPAT_DISPOSABLE_DB=1`. The smoke applies migrations 001–021, inserts legacy `REJECTED`, `FIELD_CANCELED`, linked `parent_ticket_id`, and attachment records, then applies 022–023. It proves historical fields remain unchanged, additive defaults are correct, no synthetic histories are invented, and current requester/Survey visibility can still read the records. The fresh PostgreSQL 15 run passed; a repeat against the nonempty database was refused.

Ticket history now refreshes after detail refresh, submit/resubmit, requester save, and attachment upload. Follow-up children link back to their completed parent, and parent history records and links to the created child in the same transaction.

Final Gate B6 validation used Node 22.23.3: TypeScript passed, all 238 tests passed, the Next production build passed, and `git diff --check` reported no whitespace errors.

## Gate B7 role-safe project entry

Project cards, direct project-root links, and the troubleshooting project-ID form now resolve through the same active-membership role map. Survey, field, requester, and Project IT users land on their first relevant workspace; a project ID absent from the authenticated active-membership list is refused before navigation. Direct page APIs remain responsible for resource authorization.

Node 22.23.3 TypeScript passed, all 239 tests passed, and the Next production build passed.

## Gate B8 reversible beta reset

`pnpm beta:reset` provides a deliberate way to restore the original five-case walkthrough baseline. It accepts only the fixed `.data/beta/` workspace path, rejects a symbolic-link beta root, stops PostgreSQL, moves the complete prior dataset to an owner-only timestamped `.data/beta-backups/` directory, and then performs normal setup and seeding. The existing device dataset was not reset during implementation.

Node 22.23.3 TypeScript passed, the two reset-policy tests passed, and all 241 tests passed.
