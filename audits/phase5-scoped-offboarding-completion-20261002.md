# Phase 5 scoped offboarding completion audit — 2026-10-02

## Authority and state

The owner resumed Decision34's approved seven-task plan with “Implement the plan.” Authoritative starting HEAD is `d45ad0ca18a21240c489143ba2c50499492ff1ee`. Work is isolated on `codex/phase5-scoped-offboarding`; the unrelated dirty `Phase5-RedTeam` checkout is preserved. Feature checkpoint: `2b1ec3d1a08cc7f36eb40f10cc0ad8dcf1f2ce31`; the following reviewed correction/documentation checkpoint completes the range.

| Task | Final bounded outcome | Evidence |
|---|---|---|
| 1–2 | Existing storage and independent capabilities retained | Schema28 and capability29 assertions plus integrated regressions |
| 3 | Complete application writer classification, immediate sessions, effective subjects/continuity and action replay gates |39 SQL paths; writer322, subjects57, primitive33, identity32, member13, notification40; ticket replay16, assignee13 and observed ticket-wait5 |
| 4 | Separate project/tenant commands, preview/blockers, immutable events, retries, Central IT review/outbox and resolution | Commands76, policy44, blocker9 live families plus broader HTTP cases; schema assertions repeated separately |
| 5 | Own-project administrative parity with preserved operational roles and tenant fences | Administration56, capabilities29, department delegation/current membership branches |
| 6 | Explicit scoped controls, combined navigation, blockers, review queue and frozen recovery | Browser24; fresh desktop/mobile project/accounts captures; independent finish review |
| 7 | Integrated synthetic acceptance, implicated regressions, Linux runtime and release boundary |55 suite-backed A/P groups;544 unit, strict TypeScript, Linux production build, HTTP52 and browser24 |

These counts overlap and are not summed as unique tests. A suite-backed scenario group is a dependency gate, not an exhaustive enumeration of every possible variant. Detailed case-to-source mapping is in [acceptance](phase5-scoped-offboarding-acceptance-20261002.md). Final source/migration SHA256 is `655fe0141ab6518e9fa86bfebff12d3d391e6a5f8906259065108b093509189b`.

## Independent review and disposition

Independent read-only review covered the approved range `92e5b45894a949448aaf58200f8bddebec52c371 → d45ad0c`, the feature checkpoint and corrections. It inspected identity, schema, access/lifecycle, notifications, ticket flows, administration/offboarding and the four desktop/mobile captures. The reviewer executed no tests and accessed no secrets; verification below is the implementer's fresh evidence.

| Finding | Correction and verification |
|---|---|
| Same-person sibling editors shared a logical owner | Per-mounted `useId` with synchronous shared ownership; actual mounted browser exclusion |
| Lifecycle evidence lacked explicit bounded authority witnesses | Current authority branch, grant provenance, distinct Manager witness counts/sample/digest stored atomically |
| Department title delegation could be overwritten by administrative capability | Nullable actual operational context preserves Manager/Lead powers; explicit Central IT branch without local membership tested |
| Completed ticket replay skipped action-specific authority |16 routes use current action roles/relationships before ledger; original Viewer replay reproduced RED and now403; legitimate later-state replay retained |
| Retained subcontractor Chief/IM rows qualified for new assignments | Same-tenant company-role fence; regular/direct assignment rejects, subcontractor Requesters remain valid; original eligibility defect reproduced RED |
| New action helper admitted Superintendent survey cancellation and rejected uppercase UUID URLs | Use-case role split and case-compatible parsing; supplementary explicit unit coverage |
| Pre-lock visibility could survive SHARED reassignment while waiting | Fresh visibility resolved and queried under the acquired ticket lock before action/replay; observed two-client Chief retry denies404 after reassignment |

Final independent disposition: **ship for reviewed source corrections and UI fixes; no unresolved material source findings from this review**. This is not certification of deployment or every production risk. Documenter preserved shared DESIGN.md/design.json and recorded pre-existing greeting/phone-panel documentation drift in the surface brief; no unrelated visual refactor.

## Exact verification and preservation

- `node --import tsx --test scripts/run-tests.ts`:544/544, no failures/skips.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit0.
- `docker build -t swrtracker:phase5-reconcile-20261002 .`: locked Linux Node22.23.3/Next15.5.27, production audit gate,544 tests, TypeScript and production build exit0.
- `node --env-file=.local-test.env tests/beta/scoped-offboarding-case-matrix.mjs pg`: all named PostgreSQL suites and nine implicated incumbent regressions exit0. Every schema is uniquely owned on loopback15489/swr_team_isolated and removed afterward. A nondeterministic cross-actor winner required explicit synthetic session normalization for downstream staffing; production behavior was not changed to satisfy that fixture.
- `node --env-file=.local-runtime.env tests/beta/scoped-offboarding-case-matrix.mjs external`: fresh Linux runtime on loopback3114; two tenants, several projects, archived access, stacked roles and live Survey duties. HTTP52 and browser24 exit0.
- `node --env-file=.local-test.env tests/beta/scoped-offboarding-case-matrix.mjs report`:55/55 at the above implementation digest.
- `node --env-file=.local-runtime.env tests/beta/scoped-offboarding-browser.mjs capture`: fresh Edge contexts at1440×1000 and390×844 for project/accounts.

HTTP now uploads a real file through the production handler, downloads it before and after local plus tenant disablement, and compares SHA256 with the original bytes and stored digest. The legacy fixture also retains metadata/history; it alone would not establish physical-byte preservation. Actual attachment writer/download/rollback and draft storage retention are separate harness evidence. No real email was sent; outbox tests use fake transport. Retained public/Sabine data is untouched. Only this task's runtime and schemas are cleaned up.

## Procedure deviations and release limits

Tests were consolidated into the actual named scripts rather than every prospective filename in the plan. Genuine RED evidence exists for the two source findings and several writer/subject regressions; the historical recipe's every exact RED command was not executed and is not claimed. Those recipe checkboxes remain distinguishable from completed functional acceptance criteria.

The [release runbook](../docs/PHASE5_OFFBOARDING_RELEASE.md) specifies migration preflight/backup, all-process compatible deployment, worker recovery and access-aware rollback. No down migration discards evidence or reactivates access. Ordinary verified phase5 checkpoint push/fetch is authorized by Decision34/36; production deployment and live migration are not.

Pilot/Owner/Rollout concerns remain separately classified: actual message transport, ingress/rate limits, deployment CSP/HSTS, file scanning/quotas/streaming, retention/legal hold, migration locking/checksums and privilege separation, timezone policy, formal accessibility, restore/RPO/RTO, production topology, penetration testing, MFA/SSO and RLS. Application barriers do not constrain unrestricted database-owner SQL. External delivery remains at least once. No remote full-regression CI green is inferred from this local evidence.
