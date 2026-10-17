# Alpha1 audit reconciliation

Completed local reconciliation of the owner-approved plan, 2026-10-09. Original
external audit, historical receipts, pinned manifests and original CODEX/decision
history are preserved. New proof is recorded separately in this directory.

The controlled no-fast-forward merge is `7c039ecafe8b84cfbe7271ad930028d24b5fa061`,
with parents `b8ff81494c6701bb7f84550b40c247f4588b28cb` and
`68ce7a48bc4a70450ab36b05c4257ab3dafbc83f`. Subsequent dependency, telemetry,
runner and production-chart increments are reviewed on
`codex/alpha1-audit-reconciliation`. Hardening is advanced through the clean
`D:/Programming/SWRTracker` checkout. Main, publication, deployment and Alpha2
remain separate.

## Finding dispositions

| Audit item | Final disposition | Implementation and verification |
|---|---|---|
| H1 branch scope/integration | **Fixed and verified** | Full baseline/modules/migrations035-044 documented in design/development guides; stale two-line recipe replaced by selected no-ff merge. Fresh refs and actual parents/gates in `controlled-merge.json`. |
| M1 custom-role authority | **Fixed and verified** | Decision55 supersedes43 only for tenant-wide Requester/Viewer aliases; A5 explicitly includes them. Ten-role HTTP catalog matrix, real Viewer deployment wizard, current PostgreSQL alias/authority cases pass. General permission builders remain deferred. |
| M3 diagnostic visibility | **Approved and preserved** | Decision55 records project-scoped UUID/prior status/actor exception. HTTP/telemetry prove ordinary draft denial alongside administrator metadata access, and foreign/revoked/non-administrator refusal. No body/cookie/SQL/stack disclosure or workflow grant. |
| H2 forward-only schema | **Fixed and verified** | Deployment guidance covers034 through045, migration-before-runtime, quiesced writes, paired database/attachment backup, isolated restore and compatible forward fixes. Code-only merge revert does not reverse schema. Populated upgrade22 checks pass; no customer restore attempted. |
| L3 historical042 transaction | **Approved and preserved** |042 unchanged. Future migration guidance assigns transaction and bookkeeping ownership to runner. Injected042 bookkeeping fault demonstrates its early COMMIT and repeatable actual-runner recovery.045 leaves transaction ownership to runner. |
| M2 telemetry/retention | **Fixed and verified** | Shared wrapper schedules bounded recorder through Next after(), sets correlation before response, preserves verified pre-handler context and fresh-authority checks. Both workers prune seven-day observations in tenant-scoped1000-row batches; additive045 index.13 actual HTTP and13 retention checks,34 PostgreSQL suites and before/after performance receipts pass. |
| L1/E6 production prototype | **Fixed and verified** | Production model preserves types/move rules; project/organization inputs required. Synthetic people/projections moved to test fixtures; local demo mutations and prototype routes removed after real Team Management replacement acceptance.48 live browser checks pass; original prototype instructions pinned in archive. |
| E2/H.3 runner portability | **Fixed and verified** | Current criteria/dependency reachability conservatively retains active runners;20 superseded runners archived with former paths/checkpoints/receipt/prerequisite/command index. Required Playwright module preflight replaces executable machine paths. Import resolution/preflight and291-module CI syntax gate pass; actual browser proof separate. |
| H.3 inherited dependency advisory | **Fixed and verified** | Separate narrow postcss>source-map-js1.2.2 override/lock increment; Next15.5.27 retained. Fresh production audit clean, final pinned build/Docker gates pass, image smoke contains only patched1.2.2. Historical merge-stage advisory remains explicitly failing in its receipt. |
| Build flex warnings | **Fixed and verified** | Warned Operations/Review end declarations changed to flex-end. Third named stylesheet actually warned on start; only that Home flex heading changed to flex-start. Warning-free build;12 loaded Light/Dark1440/390 layouts and live chart visually inspected. |
| L7/E9 file-local exports | **Retained with explicit rationale** | Negligible runtime risk; unnecessary exports removed only where material model/prototype changes required it. Broad cleanup would add unrelated diff. |
| I1 dense source style | **Retained with explicit rationale** | Established convention preserved; general component splitting outside this reconciliation. |
| E1 historical acceptance receipts | **Approved and preserved** | Original acceptance receipt tree unchanged; no old receipt relabelled as current execution. |
| E3 CODEX history | **Approved and preserved** | Original45af79a prefix verified unchanged; batches286-292 append implementation, verification and limitations. |
| E4 acceptance contracts | **Approved and preserved** | Original contracts retained; current A5 governance/evidence mapping appended. New proof lives here. |
| E5 pinned Git manifests | **Approved and preserved** | All four design/role-access manifests unchanged; hub distinguishes historical checkpoints from current proof. |
| E7 design briefs | **Approved and preserved** | Existing Impeccable surface briefs unchanged. Bounded alignment inspection adds no design contract. |
| E8 duplicate Decision52 | **Approved and preserved** | Both original entries and resolving follow-up retained; narrow Decision55 appended. |
| E10 dependencies/no finding | **Approved and preserved** | Audited absence of dependency drift retained historically; new advisory patch isolated and explicitly verified. No unrelated dependency upgrade. |
| E11 artifacts/credentials/no finding | **Approved and preserved** | Generated output, logs, TLS material, fixture manifests, tokens and screenshots remain ignored. Final tracked-file inspection excludes private artifacts. Sanitized receipts contain case names/digests only. |
| E12 compatibility paths | **Approved and preserved** | Retained-record/older-caller compatibility preserved. Existing707 units and34 PostgreSQL suites, including established compatibility cases, pass unchanged in outcome. |
| H.2 brittle test patterns | **Retained with explicit rationale** | Established SQL-coupled tests preserved. New acceptance asserts effects, row identities/history/hashes, authority and rollback contracts; Next scheduling scope supplied only to direct-handler harnesses. |
| F.1/D other checks/H.4 no regression | **Approved and preserved** | Existing domain/tenant/history contracts retained; current strict types707 units34 PostgreSQL suites and211 HTTP checks pass. No speculative refactor or new general security certificate. |
| F.3 authorization uncertainty | **Fixed and verified** | Inventory101 route files/74 observed/147 exported methods traces authentication, authority, scope, lifecycle/replay and evidence. Shared-family manual review plus every non-public-method refusal probes, ten-role matrix and scoped/revoked/stale/atomic SQL witnesses close the named verification gap. Trace reachability is not proof of every possible branch. |
| F.3/H.5 browser uncertainty | **Fixed and verified** | Fresh owned fixture on matching shipping production runtime: core role credential/navigation, live Team Management48 cases, administration/identity12 cases, loaded visual12 cases. Connected lifecycle/exact retries/stale reviews/actual fault rollback included across HTTP/browser/SQL. Historical additional journeys remain source-bound; no blanket browser certificate. |
| G.3 populated034 upgrade | **Fixed and verified** | New synthetic034 schema includes memberships/requests/events/notifications/files/lifecycle records; actual runner through045/backfills/constraints/bookkeeping and retained identity/history/hash metadata22 checks pass. Actual file bytes independently verified through authenticated30MiB attachment acceptance. |
| G.3 query scaling | **Fixed and verified** | Before/after pg_stat_statements at26/126/1026 tickets: fixed9 list,51 detail including telemetry,16 diagnostic statements;25/50/50 returned list rows.137 sanitized analyzed plans retained. Blocked persistence latency sample147.1ms to38.5ms; finite local samples establish no production SLO. |
| H.3 pinned runtime/image | **Fixed and verified** | Node22.23.3/pnpm11.19.0/PostgreSQL15.19. Baseline and controlled merge gates pass; final strict types707 units34 PostgreSQL suites, clean audit, warning-free production/Docker build and patched-image smoke pass. Environment failures recorded separately. |
| I experimental upload flag | **Approved and preserved** | Existing32MiB experimental flag retained.10 actual shipping attachment cases prove authenticated30MiB multipart boundary, >30MiB refusal, exact retry, foreign refusal, SHA256 bytes and atomic downloaded evidence. |
| B.2/I hardening inventory | **Approved and preserved** | Accessible clones/worktrees/refs inspected and origin refreshed;0 hardening-only/120 redesign-only at starting SHAs. Owner's none-known confirmation recorded; discovered010a changes explicitly left separate, integrated via clean D checkout. No files/index in010a written; shared ref advancement changes its visible HEAD. |

## Current evidence

[Final verification](final-verification.json) names source/migration/runtime digests,
image identities, toolchain, fixture kinds, named checks and private execution-log
hashes. [Route review](ROUTE_REVIEW.md) explains guard families and trace limits.
`controlled-merge.json` records both parents and the merge-stage gates/advisory.
Other JSON receipts provide the named current HTTP, browser, identity,
attachment, upgrade, retention, telemetry, query-plan and performance cases.

The final rebuilt image and HTTP acceptance image match on all production code
and runtime configurations. Their only inclusive src difference is the chart
README; runtime-source comparison excludes Markdown. The rebuilt image includes
that README and independently reruns audit/types/units/build.

## Execution boundaries and remaining limits

Only new labelled reconciliation containers and owned synthetic schemas were
mutated. No customer/beta reset, retained seed/truncation, customer volume change,
main update, publication or deployment.010a corrective work remains separate.

The controlled merge and this plan's local post-merge hosting blockers are
closed. Real hosted backup rehearsal, external email delivery, pilot/deployment,
production load/SLOs, physical devices and other browser engines remain outside
these local receipts. Identity reset uses captured encrypted owned outbox data;
no external email was sent. These limits do not turn historical receipts into
current verification or grant additional feature/policy authority.
