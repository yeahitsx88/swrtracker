# Alpha 1 Audit and Hardening Report

Date: 2026-10-03. Branch: `alpha 1-audit-hardening`.

## Executive summary

SWRTracker now has a passing stabilization baseline, current repository instructions, bounded login-key retention, bounded webhook delivery, diagnosable API failures, enforced ticket-event integrity and reliable administrative retries after lost responses. Fixed operational roles, independent Project Admin grants, request visibility and approved workflows are preserved.

The practical verification gate passes. No new unexplained regression remains. Hosted operational approval is still gated on ingress/source limiting, backup/restore, real email and support/recovery evidence. Open product questions below were recorded without changing policy.

The [audit register](REGISTER.md) contains 24 material observations with evidence, dispositions, changes, verification and remaining risks. [Structured evidence](evidence.json) records counts, source identity and local evidence hashes.

## Baseline

- Source branch: `codex/customer-lifecycle-rehearsal`.
- Pushed checkpoint: `dafa89ea316fcedca3409e49bfe765c70e155405`.
- Alpha 1 branch was created from that checkpoint in the reconciliation worktree. The original dirty `Phase5-RedTeam` checkout, prior branch, retained customer schemas and Northbank runtimes were preserved. Northbank remains ARCHIVED; no customer simulation was restarted or reopened.
- Host Node 24.13.1 was distinguished from the pinned Linux Node 22.23.3 runtime; pnpm 11.19.0 and PostgreSQL 15 were used.

| Gate | Pre-audit | Final |
|---|---|---|
| Unit/domain/route tests | 552/554; two stale assertions | **559/559**, no failures/skips |
| Strict types | Pass | **Pass**, including unused locals/parameters |
| Normal Docker production build | Failed at the two-test gate | **Pass** on pinned Linux |
| Separate production compilation | Passed; existing CSS warnings | **Pass**; same CSS warnings |
| Existing PostgreSQL matrix | 18/23; five outdated migration fixtures | **27/27** including four added/current gates |
| Cold empty database | Not previously certified | **All migrations through 034 and27 suites pass** in fresh Linux PostgreSQL |
| Current appearance/recommissioning/create negatives | Prior manual evidence, no current full fault/concurrency gate | **25** actual-route PostgreSQL checks |
| Production HTTP | Prior historical evidence | **52** fresh checks, including stored file bytes/digests |
| Production browser | Prior125 role/system checks were historical, not rerun baseline proof | **24** existing and **26** new lost-response checks |
| Named lifecycle cases | Pre-audit current gate incomplete | **55/55**, one current source/migration digest |
| Production dependency audit | Zero advisories | **Zero**,87 dependency entries |
| Full dependency audit | Production-only baseline | **One Low** development esbuild advisory; no High/Critical |
| Lint | Not configured | **Not configured**; Next build status is not a standalone lint pass |
| Query comparator | Initial fixture lacked draft column; then four comparisons pass | **Four content comparisons pass**, no production query change |

Baseline failures were recorded before fixing them. Intentional authorization/conflict/audit-failure errors are negative-path evidence. During development, an SQL parameter-type conflict and test-variable shadowing were corrected; neither survives the final gate. Sandbox socket permissions were an environment limitation, resolved for authorized loopback tests. The final cold-start check exposed an empty-table statistic assumption; a temporary synthetic incumbent now makes that test independent of retained public data.

## Repository and agent interaction

Root README/AGENTS files provide concise entry points. Existing documentation now identifies current toolchain, commands, architecture, approval precedence, retained-state protections and actual test layout. Obsolete Phase2/first-agent tasks and fictional Jest/global-reset fixtures were removed from current guidance. Historical CLAUDE passages are explicitly subordinate to approved requirements and later decisions, including Decisions 44–50.

`pnpm typecheck` and `pnpm test:postgres` expose repeatable gates. TypeScript excludes ignored runtime/generated directories. Environment/store/build/capture ignore rules are stronger; the incremental cache was already untracked and remains ignored. No private credentials or runtime manifests were committed. Device-local beta seed/reset scripts remain guarded operational tools, with clear warnings against retained-state use.

## Code quality, architecture and API/frontend consistency

Compiler-confirmed dead imports, an unused company-authority handler, obsolete history styling helper and unused administration state were removed. Synchronous command ownership/ref guards remain intact. No wholesale abstraction, module or UI rewrite was warranted by the reviewed evidence.

The architecture remains a modular monolith: HTTP/UI adapters, application policy, domain rules, scoped PostgreSQL repositories, private attachment storage and separate workers. Server authorization controls access; client controls are not a security boundary. Fresh sessions, current memberships/grants, tenant lifecycle barriers and authority-before-replay paths were reviewed and exercised. Cross-module lifecycle dependencies are deliberate approved coordination, not an excuse to remove safeguards.

Team and staffing editors now retain an uncertain original command rather than creating a new key for changed input. Workforce reload cannot discard an uncertain transfer. Fields and replacement actions freeze while exact retry remains available; every definitive 409 requires deliberate reload. Project creation now supplies a frozen key and uses the existing transaction ledger, with current Tenant Admin authority checked before replay. Keys are optional for compatibility: legacy unkeyed callers keep their prior behavior and can still duplicate creations.

Malformed JSON is reported as400 in the changed login, appearance, recommissioning and project-create adapters. Login UUID/empty credential validation is explicit. This does not claim universal cleanup of every legacy JSON parser.

## Security and authorization

Completed baseline scan: `248a03b5-6d45-4bac-8655-bd30e4c58e99`, targeting checkpoint `dafa89e`. Its manifest SHA-256 is `98b604b842e507de5b339a470c3c5a65f32250aff3fff32d3d8695264566ee94`; all six referenced artifact hashes were verified. The canonical completed baseline remains unchanged.

**Coverage is partial:**453 tracked paths were fully reviewed for security, including every runtime source/API/module/worker and migration;391 remaining tracked documentation/evidence/tests/operator/support paths were not fully security audited. Engineering archaeology and selected test/config inspection do not inflate those counts. Generated/private runtime state, external ingress, actual database roles/TLS/backups and real mail/recovery were outside source validation. Daybreak advisory access was not granted; source review continued and that limitation remains explicit.

The scan reported **one Medium vulnerability**: anonymous arbitrary tenant/email pairs could accumulate permanent login limiter keys. The fix restricts inserts to existing password accounts, canonicalizes tenant UUIDs and prunes inactive counters through the existing worker while preserving live blocks. Actual PostgreSQL tests prove unknown pairs create zero rows and known accounts still enforce five-attempt lockout. Anonymous request CPU/volume remains an ingress concern; no timing-equality claim is made.

Representative negative cases cover foreign tenant/project/subject resources, local versus tenant administration, actual operational roles, disabled/revoked access, stale sessions, current authority before replay, protected duties, company scope and parent-authorized attachments. Existing request/workforce/history behaviors are retained. These results do not certify every possible attack or hosted deployment.

New API500 logs contain a safe error classification, selected database codes and the public correlation ID; raw messages, SQL, body, causes and stack content are excluded from that new path. Attachment cleanup now suppresses only missing-file errors. Webhook delivery aborts after ten seconds and releases response bodies. Existing operator logging/delivery policies remain relevant; external delivery can succeed before an abort or database rollback and requires receiver deduplication.

The structural hardening assessment found no qualifying architecture project: the allocation flaw has one repository owner and a proportionate local correction. Generalized RBAC, new services and stack changes were not justified. The dummy-bcrypt fast-reject suspicion was a false positive after native source inspection; that is not a measured constant-time guarantee.

## Data integrity

Migration034 enforces the existing append-only ticket-event contract for UPDATE, DELETE and TRUNCATE, binds event tenant to its parent ticket, and preflights inconsistent history. It refuses rather than silently repairs/deletes old evidence. Repeat application, actual constraint failures and legacy preflight refusal are covered.

The existing actor foreign key is preserved. Workers use one configured service actor across tenants; adding a tenant-bound actor FK would change that attribution contract. A draft version of034 was narrowed before deployment, and the decision is recorded. Database owners/superusers remain trusted and can bypass triggers. Apply migrations through 034 before the new runtime; do not resume an old runtime against a recommissioning preparation.

Actual-route tests verify appearance/recommissioning/create audit failure rollback, same-key concurrency, authority loss before replay, stale exact readiness, ordinary-work preparation gates, immutable period evidence and unchanged ticket/event history. Disposable tests compare retained public ticket witnesses before/after; retained operational databases were not upgraded by this audit.

## Performance

The existing rollback-only comparator used50,000 synthetic requests and105,000 events. Four visibility/content comparisons remain equal. Three samples of the current all-project query were347.4–349.7ms before and348.8–349.6ms after; the current scoped Area query was121.0–121.9ms before and119.3–119.8ms after. Each current plan has one event scan. Temporary fixtures rolled back and retained witnesses stayed unchanged.

These small samples show no demonstrated query regression in this workload. The comparator also contrasts a historical former correlated query; its gain belongs to prior work. **No Alpha 1 SQL optimization or hosted latency improvement is claimed.** Bounded webhook waiting is a reliability/resource correction, not a query benchmark.

Full administrative inventories, client filtering/selection and large-population payloads remain a measured-workload follow-up. Changing approved all-loaded selection/export semantics without a scaling benchmark was not justified. Existing bounded/truncated operational lists report their scope explicitly.

## Testing and configuration

Five additional unit tests cover safe error logging, JSON classification, real stalled webhook abortion, actual filesystem failures and invalid login input. Fixture fixes preserve historical migration assertions while current runtime fixtures apply current migrations. The cold-start test now also verifies an entirely empty database without borrowing retained rows.

The27-suite PostgreSQL runner requires explicit `SWR_TEAM_POSTGRES=1` and `127.0.0.1:15489/swr_team_isolated`. It initializes only an entirely empty public schema; existing retained public schemas are not migrated. Actual fixture writes use owned rollback/session-local or uniquely named schemas. HTTP/browser acceptance remains a separate gate and verifies real production responses, cookies, files and UI recovery.

New browser tests commit operations, drop their responses and prove exact key/body recovery and single side effects for creation, team update, staffing additions and workforce transfer. Existing browser selectors were corrected for current table/disclosure semantics without removing the substantive assertions. Both desktop and390 px mobile checks pass with no browser runtime errors.

Docker now runs types including unused-symbol checks and unit tests before compiling. CI adds current unit/type/PostgreSQL/build gates beside production dependency audit. Local pinned Linux equivalents passed; remote GitHub Actions execution has not yet been observed.

## Dependencies

No dependency upgrade or removal was justified by production use; all production dependencies remain in use. Production audit reports zero advisories. The full audit identifies [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) through `tsx → esbuild 0.27.3`: a Low Windows development-server traversal issue, patched in0.28.1. This repository uses tsx transformation rather than esbuild's `serve/servedir`; no such server call was found. A narrow transitive patch update is deferred. The advisory must be reconsidered before exposing that development server.

## Audit register summary

| Disposition | Count |
|---|---:|
| FIXED | 14 |
| ACCEPTED | 1 |
| DEFERRED | 4 |
| OPEN / PENDING | 3 |
| FALSE POSITIVE | 1 |
| REJECTED / NOT JUSTIFIED | 1 |

Engineering/operational severity totals:11 Medium,9 Low,4 Info. No High/Critical issue was confirmed. These totals include decisions and engineering risks; the security scan's finding count is separately one Medium.

## Decision state and remaining risks

### FIXED / ESTABLISHED

Current verification fixtures, login retention, bounded delivery, safe API diagnostics, surfaced file cleanup failures, event integrity, exact retries, keyed creation, current regression coverage, repository guidance and reproducible gates are established by the evidence above.

### OPEN / PENDING

- Preparation cancellation chains may need ordinary approval that is currently gated. The owner must decide allowed completion behavior; no preparation cancellation/bypass feature was added.
- Restricting Setup templates to Central IT remains unapproved. Current Project Admin capability is preserved.
- Multi-tenant service-actor attribution and default actor validity need an operator/product contract. The existing configured-actor model is preserved; no automatic account is seeded.

### DEFERRED

- Hosted ingress/source limiting, actual database privileges/TLS, backup plus attachment restore, real email, and support/dual-officer recovery.
- Large administrative population benchmarks and subsequent pagination/selection work.
- Narrow development esbuild patch update and a deliberate lint-rule selection.

### REJECTED / NOT JUSTIFIED

Broad RBAC/architecture/stack changes, aesthetic redesign, indiscriminate dependency updates and speculative query optimization. Existing safe-return-path, scoped parameterized SQL, parent-authorized files and fresh-policy replay protections were retained. The bcrypt suspicion was disproved rather than patched speculatively.

## Git state

Pre-audit SHA: `dafa89ea316fcedca3409e49bfe765c70e155405`. Final verified implementation SHA is in [evidence.json](evidence.json). The report is committed afterward; the final Alpha 1 HEAD is the report commit containing this file, obtained with `git rev-parse HEAD` and reported in the delivery receipt. This avoids a self-referential commit hash inside its own contents.

Remote branch: `origin/alpha 1-audit-hardening`. Push and clean-status confirmation are recorded in the final delivery receipt after this report is committed. No merge into the prior development branch is performed. Ignored local logs/captures are verification state; the durable report/register/evidence contain no credentials. Owned disposable HTTP/browser and cold-start resources are removed after evidence collection; retained customer state is preserved.
