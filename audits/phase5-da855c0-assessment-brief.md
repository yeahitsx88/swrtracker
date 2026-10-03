# Phase 5 security and UX assessment — da855c0

Date: September 30, 2026 (America/Chicago). Decision: **do not approve production use yet**. No production fixes or redesigns were made.

## 1. Executive summary

The tested requester tenant and project boundaries held server-side. User A could not read or mutate A-Project-2 or any Company B project; User B could not read or mutate B-Project-3 or any Company A project. Known request/file UUIDs did not bypass these boundaries. Same-tenant subcontractor-company checks also held. All five baseline files denied unauthenticated download and metadata access with 401.

Authorization is nevertheless incomplete. Four confirmed findings require attention:

| ID | User classification | Result |
|---|---|---|
| FILE-001 | **CRITICAL** | Inactive crew links still authorize teammate request metadata and file downloads (200). |
| AUTH-001 | **HIGH** | A Superintendent can create assigned work in an unauthorized Area (201). |
| REQ-001 | **HIGH** | An Instrument Man can initiate cancellation of a teammate's delayed request (200). |
| AUTH-002 | **MEDIUM** | 403 versus 404 confirms same-tenant unassigned request existence. |

FILE-001 is an inherited crew-access failure within an assigned project, not demonstrated cross-project or cross-tenant exposure. Its critical classification follows the requested rubric for unauthorized attachment retrieval. Revocation was applied to a synthetic roster row through controlled SQL; this checkpoint lacks a supported roster-removal operation. The missing inactive-state predicate is reproducible independently of that missing administrative workflow.

Ordinary project-membership removal, company-view revocation, account deactivation/session-version changes, logout, and idempotency replay after project removal denied access. Attachment bytes survived edits, submission, cancellation, archived-project reads, a completed-state fixture, and same-filename uploads without overwrite. Production deployment persistence remains unverified; generic Compose does not define a durable attachment volume.

Requester gaps: no safe partial-submission recovery or explicit Save Draft; correction fields omit Area/Type; resubmission can ignore unsaved changes; date/history presentation is unreliable. IT/Admin gaps: central-admin discovery, complete membership/user lifecycle management, permission summaries, invite cancellation/history, and access audit UI.

### Environment and preservation

| Item | Evidence |
|---|---|
| Duplicate branch | `codex/phase5-isolation-assessment` |
| Worktree | `C:\Users\xwall\.codex\worktrees\phase5-isolation-assessment\SWRTracker` |
| Exact source HEAD | `da855c0123d003585d83a11323282998e94a339c` throughout testing |
| Initial source state | Clean; no tracked source diff from checkpoint. Final diff also empty; only `.assessment/` untracked. |
| Local web | `http://127.0.0.1:3115`, exact lockfile Next 15.5.12 / React 19.2.4 |
| Isolated DB | Container `swr-phase5-isolation-db`, database `swr_phase5_isolation`, loopback port 15495 |
| Isolated files | Duplicate `.assessment/attachments`; not the original attachment root |
| Delivery | No notification worker; webhook environment cleared. Synthetic `.invalid` users only. |
| Original active checkout | Started and ended on `Phase5-RedTeam` at `d8fe20e2f3e93d9c50e05556daad863368ac3c86`; existing changes not edited by this assessment. |
| Original Phase 5 ref | Initially `phase5` pointed to da855c0. During assessment it moved to `0803d5eb8da8d529560ec82316cac2d8fcc8b128` through concurrent activity outside this assessment. This assessment did not issue any command to move it and did not restore it. Therefore **unchanged original branch cannot be certified**. The original da855c0 commit object remains available and the duplicate stayed pinned. |

TypeScript passed and all **356 baseline tests passed with exact locked dependencies**. Initial dependency junction testing was replaced with an independent frozen-lockfile installation after a Windows cross-drive resolution error. Fixture setup errors were corrected only in the synthetic harness/database before evidence collection. No containment change was needed.

Evidence totals: **522 HTTP assertions**, 14 state/integrity records; 507 raw PASS, 25 raw FAIL and four observations. Raw failures include disproven or input-shape expectations as explained below. The [hardening review](phase5-da855c0-evidence/hardening.md) recommends local remediation; its [structured analysis](phase5-da855c0-evidence/hardening.json) records that no broad architecture rewrite is justified. Evidence hashes are in `phase5-da855c0-evidence/evidence-sha256.json`.

The four harnesses retain 536 records, including HTTP assertions, database state observations, and integrity checks. Raw `FAIL` is an assertion result, not automatically a vulnerability: the first harness expected 404 for a static-file URL that intentionally redirected 307; secondary APIs rejected incomplete query shapes with 400; duplicated project parameters used the first authorized value without leaking denied data. These are distinguished below. Two earlier supplemental file-denial assertions ran after a failed staffing call and **do not prove revocation**; the final explicit inactive-roster test does.

### Current authorization architecture

Tenant and company are different concepts. `tenants` own projects and companies; users have tenant/company identity. A project has `tenant_id`, not an intrinsic company-owner column. Tenant roles and project memberships are separate. The A/B matrix uses separate tenants to represent the requested company boundary; Company C additionally tests two subcontractor companies within one tenant. Intentional GC operational roles may see subcontractor work in their authorized project; arbitrary company secrecy from authorized GC staff is not an implemented invariant.

Authentication uses bcrypt and an eight-hour signed JWT in `swr_session` (HttpOnly, SameSite Strict, Secure in production). `requireActiveAuth` checks per-token logout revocation; current-user session checks enforce deactivation and session version. `getProjectRole` joins project, user, company, and tenant identity. Subcontractor operational roles other than REQUESTER are rejected. `resolveVisibility` derives requester ownership/company authority, departments, Areas, and crew relations from the database. Shared SQL predicates scope details, lists, metrics, and review populations. Mutation use cases additionally check role, ownership, allowed workflow state, and row version. Tenant-admin access is capability-specific and does not imply project membership or ticket workflow authority.

Middleware checks cookie presence for navigation and lets API requests through; it is not the authorization control. Protected APIs perform the actual checks. Browser project/request routes can return an empty 200 shell to a denied user, but their API calls deny data. No server-action/RPC alternative was identified in the inspected entrypoints.

Source anchors beneath the duplicate: `src/lib/auth.ts:65`, `src/lib/get-project-role.ts:25`, `src/lib/ticket-route-helpers.ts:32`, `src/lib/resolve-visibility.ts:38`, `src/lib/ticket-visibility-clause.ts:14`, `src/modules/workflow/application/kernel.ts:54`, `src/middleware.ts:17`.

## 2. Test matrix

User A1 in the single-company scenario is User A below; Project A1/A2 are A-Project-1/2. User A is assigned A1; User B is assigned B1/B2. Each allowed combination has positive create/detail/upload/download controls. Each denied combination includes listings/search/pagination/filter/query manipulation, project APIs, direct request/history/file URLs, create attempts, PATCH, available workflow POSTs, member/role escalation attempts, and browser-route shells.

| User | Company/tenant | Project | Expected | Actual | UI result | API/direct result | Isolation |
|---|---|---|---|---|---|---|---|
| A/A1 | A | A-Project-1 | Allow own requests | Allowed | Listed; requester wizard usable | List 200; own create/upload 201; own detail/file 200 | PASS |
| A/A1 | A | A-Project-2 | Deny | Denied content/actions | Not listed; direct shell 200 without authorized data | Project/list 403; known request/history/file 403 | PASS content; AUTH-002 metadata FAIL |
| A/A1 | A | B-Project-1 | Deny | Denied | Not listed | Project/list 403; request/file 404 | PASS |
| A/A1 | A | B-Project-2 | Deny | Denied | Not listed | Project/list 403; request/file 404 | PASS |
| A/A1 | A | B-Project-3 | Deny | Denied | Not listed | Project/list 403; request/file 404 | PASS |
| B | B | A-Project-1 | Deny | Denied | Not listed | Project/list 403; request/file 404 | PASS |
| B | B | A-Project-2 | Deny | Denied | Not listed | Project/list 403; request/file 404 | PASS |
| B | B | B-Project-1 | Allow own requests | Allowed | Authorized list/route shell | Own create/upload 201; detail/file 200 | PASS |
| B | B | B-Project-2 | Allow own requests | Allowed | Authorized list/route shell | Own create/upload 201; detail/file 200 | PASS |
| B | B | B-Project-3 | Deny | Denied content/actions | Not listed | Project/list 403; request/file 403 | PASS content; existence behavior same as AUTH-002 |
| A | A | Company C request in A1 | Deny | Denied | Not in scoped population | Request/file 404 even with Company View | PASS |
| A + Company View | A | Coworker request in A1 | Read only | Allowed read, denied edit | Explicit scoped company view | Detail/file 200, PATCH 403; revoked file 404 | PASS |
| IM1 active roster | A IT | Chief's IM2 request in A1 | Read | Allowed | Crew visibility intended | Detail/file 200 | PASS |
| IM1 inactive roster | A IT | Former Chief's IM2 request in A1 | Deny inherited access | Still allowed | Account says crew empty | Detail/metadata/file 200 | **FAIL FILE-001** |
| Superintendent Area A | A IT | Area B request in A1 | Deny action | Create succeeds | No UI action required | Direct create 201; subsequent detail 404 | **FAIL AUTH-001** |
| IM1 | A IT | IM2 delayed request in A1 | Deny cancellation | Mutates request | No UI action required | field-cancel 200; persisted pending cancellation | **FAIL REQ-001** |
| Tenant Admin A | A IT | A1 / B1 | Tenant-scoped administration | A config permitted; B denied | No membership-based launcher entry; direct admin works | Foreign config 404; foreign member assignments denied | PASS security; UX gap |
| Project IT A | A IT | A1 | Scoped access administration | Permitted | Config/access page readable desktop/mobile | Company View grant/revoke succeeds; ticket detail 404 | PASS with notification-policy question |
| Unauthenticated | None | All five baseline files | Deny | Denied | Protected routes redirect to login | File + metadata 401 | PASS |

Known valid unassigned requests return 403; absent or other-tenant requests return 404. Wrong attachment-to-request substitution returns 404. Nonexistent endpoint methods return 405. Some input validators return 400 before membership checks; these responses expose no domain data and are not successful authorization tests by themselves. No denied action returned successful mutation in the A/B project matrix. Request DELETE is not implemented.

Full request-level evidence: `phase5-da855c0-evidence/results.json`, `adversarial-results.json`, `revocation-results.json`, `final-controls.json`, and the consolidated `test-records.csv`. Fixtures include exact synthetic UUIDs.

## 3. Security findings

### FILE-001 — CRITICAL — inactive crew retains attachment access

Affected: crew visibility resolver and every consumer of it, including file download. Root control: `src/modules/ticket/infrastructure/ticket.repository.ts:479`; propagation: `src/lib/resolve-visibility.ts:53`, `src/lib/ticket-visibility-clause.ts:56`; file sink: attachment `handler.ts:233`.

Reproduce: create IM1/IM2 under the same Party Chief; assign the synthetic request only to IM2. Verify IM1 can read its attachment while the roster is active. Set only IM1's synthetic `crew_rosters.deactivated_at` to NOW, leaving the user and project role active. GET that request, its attachment list, and the copied file URL as IM1.

Expected: no inherited request/file access (404). Actual: all three return 200, including synthetic proprietary bytes and filenames; `/api/account?projectId=...` reports `crew: []` concurrently. Final evidence is in `revocation-results.json`, not the earlier unsuccessful staffing-removal attempt.

Impact: stale permissions disclose request contents and attachments. Tenant/project membership remains enforced. Likely root cause: `findPartyChiefForInstrumentMan` ignores inactive roster state; download correctly checks visibility but trusts the faulty scope. This is a shared authorization defect rather than a public-storage bypass. Smallest robust remediation: require active crew links in the resolver, preserve exact direct-assignee reads separately, and test details/lists/history/metadata/download after revocation. Add an audited removal path so operations can reliably express this state.

### AUTH-001 — HIGH — direct assignment bypasses Superintendent Area

Affected: `POST /api/tickets` DIRECT_ASSIGNMENT. Root: `src/modules/ticket/application/create-direct-assignment-ticket.ts:68`; route permits Superintendent at `src/app/api/tickets/route.ts:122`.

Reproduce: grant Superintendent only Area A in A1; create Area B; POST a direct assignment selecting Area B and valid project requester/crew IDs. Expected: deny before numbering/writes. Actual: 201 with ASSIGNED ticket `91b78a46-5a75-415e-9b56-7494c4c84c2b`; subsequent GET by that Superintendent returns 404.

Impact: unauthorized work creation and assignment inside another operational Area. Tenant/project/target-role controls still hold. Root cause: creation validates that Area belongs to project, not that actor is authorized there. Smallest robust fix: derive and check current Area authority inside creation transaction before sequence allocation and persistence. Evidence: `adversarial-results.json` and `adversarial-fixtures.json`.

### REQ-001 — HIGH — teammate delayed-request cancellation

Affected: `POST /api/tickets/[ticketId]/field-cancel`; root `src/modules/ticket/application/request-field-cancel.ts:20`.

Reproduce: IM1/IM2 share a Chief; delayed request is assigned only to IM2. POST its field-cancel endpoint as IM1 with a reason. Expected: 403, no state change. Actual: 200; database records `PENDING_PC_APPROVAL` / `FIELD_CANCELED` for `e529e186-eb37-412a-a9c5-42b7e66d138c`.

Impact: a read-authorized crew member can interfere with teammate work. Terminal cancellation still requires approval; current IN_PROGRESS state does not permit this legacy transition. Root cause: role and visibility substitute for exact Instrument Man assignment, unlike sibling complete/delay/inability use cases. Smallest robust fix: exact-assignee check for Instrument Man field disposition, or approved retirement of the legacy route. Evidence: `adversarial-results.json` includes HTTP and persisted state.

### AUTH-002 — MEDIUM — request existence oracle

Affected: shared ticket context (`src/lib/ticket-route-helpers.ts:34`). Reproduce: User A GETs the known A2 request then a nonexistent UUID. Expected: indistinguishable not-visible responses. Actual: 403 for existing unassigned request, 404 for absent request. Impact is existence confirmation, not exposed titles, project names, or bytes; random UUID guessing remains impractical. Root cause: lookup precedes membership resolution with different error types. Fix: normalize inaccessible resource responses consistently across request/history/file paths. Evidence: `revocation-results.json`.

### Additional security-relevant observations

- **LOW / input hardening:** malformed request UUID and sequential attachment identifiers return generic 500, not a deliberate 400/404. No stack trace/data leakage was returned. Add boundary UUID validation. Repeated projectId values select the first value; observed results remained authorized, but reject ambiguous duplicates consistently as `/api/account` already does.
- **ADMIN-001 / MEDIUM policy inconsistency, unresolved vulnerability classification:** Project IT receives project notification request IDs/numbers, recipients, event times and potentially reason/urgentReason payloads, despite its direct ticket detail being 404 and documented lack of inherent ticket visibility. `src/modules/notification/application/local-preview.ts:40,70` explicitly grants IT preview access. Decide and document the allowed support-data policy; minimize/redact payloads if full operational content is not authorized. Do not claim an admin compromise or cross-tenant leak.
- Server-side auth uses pre-transaction membership checks on several paths. Concurrent revocation races were not exercised; transaction-time fencing should be reviewed when implementing fixes. This is an open verification item, not a reproduced bypass.

## 4. Attachment security report

Storage is `LocalAttachmentStorage`, not a public object bucket. Server-generated keys are `<tenant UUID>/<request UUID>/<random object UUID>`. Exclusive `wx` creation avoids overwrite; SHA-256 binds stored bytes. Key format/path containment is enforced. No original filenames are used in disk paths. Upload route bounds multipart input, allows approved MIME/extensions and a 30 MiB per-file maximum, then checks ticket visibility/owner/purpose/status within a transaction. Failed metadata commits remove staged bytes.

Retrieval is `/api/tickets/{ticketId}/attachments/{attachmentId}`. The enforcing point is visible-ticket resolution followed by a tenant+request+attachment lookup. Responses force download, use nosniff, and `Cache-Control: private, no-store`; downloads create audit events. Client metadata exposes attachment/request/tenant UUIDs, filename, uploader, cycle, hash, time and the authenticated download route. Storage keys are omitted. No signed URLs exist, so expiration is **not applicable**; copied routes reauthorize on every call.

| Test | Evidence/result |
|---|---|
| Cross-user own/coworker | Normal requester 404; authorized Company View 200; owner-only edit 403 for colleague |
| Cross-project | Unassigned same-tenant project file 403; wrong request/attachment pairing 404 |
| Cross-company/tenant | Known file URLs 404; denied cross-tenant uploads 404; Company C same-tenant file 404 |
| Unauthenticated | All five baseline files and metadata endpoints 401 |
| Membership removal | Previously valid file URL 403; detail 403; same idempotency mutation replay 403 |
| Company View revoke | Copied coworker URL immediately 404 |
| Logout replay | Saved old cookie rejects file and project list with 401 |
| Account disabled/version changed | Existing cookie rejects project and file access with 401 |
| Inactive crew | **FAIL FILE-001:** metadata and bytes 200 after link inactive |
| Storage path guess | No public bytes: application/static guesses 404 or login redirect 307 |
| File integrity | Seven first-pass objects matched stored SHA-256; identical filename second upload got a distinct object and first bytes stayed unchanged |
| Lifecycle | Edits/submission/cancel/archive reads preserved attachment; COMPLETED state fixture retained file |
| Move/delete/orphan cleanup | No request move/delete API or operational cleanup implementation available; not runtime-verifiable. No public retrieval path discovered. Do not certify future deletion semantics. |
| Browser caching | Download headers verified; physical browser cache eviction/previously downloaded local copies not tested. Already downloaded bytes cannot be retroactively revoked. |

Production persistence: generic `docker-compose.yml` has no attachment volume/root override, while `Dockerfile:26` prepares `/var/lib/swr/attachments` and default storage resolves `/app/.data/attachments`. Without explicit deployment configuration, container replacement can lose files. Sabine launcher separately mounts a durable attachment volume. Windows POSIX mode arguments do not prove host ACL protection; actual production ACL/proxy/static-serving configuration requires verification.

## 5. Requester experience report

Independent Assessment A reviewed source; Assessment B used a fresh local browser tab and desktop/mobile inspection. Combined source heuristic score is provisional **19/40**; it is not an end-to-end usability certification. The Axiom visual foundation, native labels, readable statuses, role navigation, capability-driven actions and focus styling are strengths.

| Category | Finding / minimal improvement |
|---|---|
| Security | Preserve own-request editing, Company View read-only scope, current membership checks and file reauthorization. Explain revocation without weakening denial. |
| Required workflow gap, P1 | New Request creates draft, uploads sequentially, submits; failure does not retain/link the created ID. Retry creates another draft with a fresh key. Retain ID, show successful/failed attachments, resume same record (`request/new/page.tsx:133`). |
| Required workflow gap, P1 | No explicit Save Draft/partial-draft/delete/recovery workflow as documented in CLAUDE §20. Stage form state is lost on navigation. Implement approved lifecycle before relying on it operationally. |
| Required workflow gap, P1 | Correction editor omits Area/Type; Resubmit precedes the editor and sends persisted data without dirty-state protection. Save/review/resubmit must operate on the same saved revision (`tickets/[ticketId]/page.tsx:78,150`). |
| Required workflow gap, P1 | Need-By date-only input converts through UTC; local formatting can shift dates in Chicago. History discards before/after date and cycle fields. Standardize calendar-date semantics and render traceable revisions. |
| Usability, P2 | Raw AOR IDs/fallback entry, technical implementation copy, vague empty queues, weak permission-failure recovery and missing discoverable assistance. Use named project/Area context and Projects/Sign In/admin help paths. |
| Usability, P2 | Failed detail upload clears file selection because errors are caught by parent; staging lacks removal/count-limit guidance. Retain failed selection and state exactly what is stored. |
| Optional | Scoped requester search/status/date filters and Area/description card summaries; no redesign needed. |

Browser confirmed requester sign-in, A1-only launcher, six-step Area intake, requests empty state, profile/company identity, assignment details, context-preserving menu, and Escape/focus behavior. Complete create/edit/submit/cancel/file lifecycle was executed over HTTP; not every requester interaction was clicked. Full screen-reader, slow-network and interruption tests remain open.

## 6. IT/Admin experience report

| Category | Finding / requirement |
|---|---|
| Security | Fix FILE-001/AUTH-001/REQ-001; resolve notification-data policy. Show Company View as scoped read authority, not all-access removal. |
| Permission-management gap, P1 | Tenant-only admin sees no projects in membership launcher despite authorized direct admin APIs. Provide central IT entry separate from operational project membership. Browser reproduced empty launcher and direct admin page access. |
| Permission-management gap, P1 | Admin page supports request config and subcontractor invitations/company authority, but not complete company creation/general user creation, project membership removal, account disable or correction of all assignments. Some create/add APIs exist; full lifecycle is absent. Do not mistake missing UI for backend enforcement. |
| Permission-management gap, P1 | Staffing POST adds selected Instrument Men; omitting one does not remove it. There is no supported roster removal in this checkpoint. Explicit removal and permission consequences are required before operational reliance. |
| Auditability gap, P1 | No usable consolidated permission summary, user-to-project view, project-to-user lifecycle view, grant history/export, denied-access investigation or full admin audit UI. Database grant/download/workflow events exist, but events are not an operational investigation tool alone. |
| Operational friction, P2 | Pending invites lack cancellation and accepted/expired history. Company View grant/revoke applies immediately; show named consequence and appropriate confirmation. Initial access-load failure can leave both error and perpetual loading without Retry. |
| Attachment operations | No file cleanup/recovery tool or proven durable generic deployment. Add only the approved retention/recovery capability after defining semantics. |
| Optional/deferred | Searchable rosters and carefully scoped bulk operations. Company deactivation UI is explicitly deferred in older specification; do not expand scope without a requirement. |

Browser directly inspected admin configuration and subcontractor access, including Company A/Company C rows, at desktop and 390×844 without visible horizontal overflow. Privileged UI buttons were not clicked by the browser reviewer; HTTP tests independently exercised authorized grant/revoke, denied privilege escalation and foreign-tenant member assignment.

Detector: 36 signals (one border warning, 28 font-size advisories, six color advisories, one radius advisory); most are documented-style false positives. No deterministic findings in subcontractor-access itself. Do not prioritize these over authorization/recovery. Live overlay injection was unavailable because browser evaluation is read-only; no overlay server was started.

## 7. Prioritized remediation backlog

| Priority | Work | Dependencies / acceptance |
|---|---|---|
| P0 | FILE-001 active relationship enforcement | Shared visibility fix first; former crew loses request/list/history/file access, exact direct assignments remain valid. Add supported audited revoke flow. |
| P0 verification | Re-run cross-company/project/file matrix after scope changes | No cross-company exposure observed; keep this gate before release. Verify deployment static serving and production ACLs. |
| P1 | AUTH-001 transactional Area check on direct assignment | Server-resolved current Area scope; deny before sequence/write. Preserve tenant/project checks. |
| P1 | REQ-001 exact Instrument Man disposition authority | Keep read visibility separate from mutation authority; test teammate delayed request and authorized owner. |
| P1 | Define IT notification visibility and privilege summaries | Agree authorized support fields, then enforce minimal payloads; no automatic broad admin access. |
| P1 | AUTH-002 normalize not-visible responses | Across shared ticket/history/file routes; no existence oracle. |
| P1 | Durable attachment configuration and lifecycle retention | Explicit private durable root, backup/restore, defined delete/move behavior; prove container replacement persistence. |
| P1 | Requester draft/recovery/correction/date/history gaps | Depend on approved lifecycle semantics and safe same-record persistence, not visual redesign. |
| P1 | Central IT + audited membership/user/invite lifecycle | Current authorization invariants first; explain and verify each grant/revoke consequence. |
| P2 | Intentional UUID/query validation and helpful errors | 400/404 for malformed IDs; reject duplicate selectors; no data leakage. |
| P2 / later | Contextual help, scoped search/roster filtering, staged-file controls | Can follow security and required workflow fixes. Bulk administration, cosmetic detector cleanup and charts can be deferred. |

### Completion questions and evidence limits

| Question | Answer |
|---|---|
| 1. Unassigned project UUID grants access? | No in requester matrix; API 403. |
| 2. Another company's project identifiers? | No across tenants; 403/404. Same-tenant subcontractor-request isolation also held. |
| 3. Another project's direct requests? | Content denied; same-tenant existence oracle remains. |
| 4. Another project's files? | Denied. Former teammate files in the same project remain exposed through FILE-001. |
| 5. Unauthenticated files? | Denied 401 for all five files. |
| 6. Stale links bypass revoked permission? | Membership/company-view/logout deny; inactive crew links fail. |
| 7. Metadata leakage? | Request existence confirmed; admin notification scope policy unresolved. Denied tenant/project names, request titles, file names and counts were not returned in the matrix. |
| 8. Company boundaries server-side? | Tenant and subcontractor request/company scopes enforced on tested paths; GC project roles intentionally differ. |
| 9. Project boundaries server-side? | Enforced on tested requester paths; Area-level direct creation fails. |
| 10. Attachment boundaries server-side? | Yes structurally, but depend on faulty inactive-crew visibility. |
| 11. Requester operationally usable? | Basic intake/status/cancel works; recovery/correction/date gaps prevent robust operational acceptance. |
| 12. IT/Admin operationally usable? | Limited project setup/access tasks work; complete permission lifecycle/investigation does not. |
| 13. Before production? | P0/P1 authorization, durable files, required recovery and permission lifecycle; rerun matrix. |
| 14. Deferrable? | Cosmetic detector cleanup, optional search/filter/bulk convenience, decorative analytics and unapproved redesign. |

This is a completed assessment of the requested observable boundaries with explicit gaps, **not a claim that every repository file or every deployment was audited**. Independent baseline plus focused review covered authorization, storage, configuration, staffing/team, templates, metrics/review and account consumers. Remaining limitations: concurrent revocation races; production reverse proxy/static mounts and ACLs; restart/container replacement durability; unimplemented delete/move/cleanup; every workflow state/role combination; assistive-technology and full browser failure recovery. No real users/files, original application database, original attachment root or external application system was tested.

The duplicate and synthetic database are retained for follow-up. The assessment server/database were stopped after testing. Harnesses and evidence are retained under `audits`; app source remains unchanged. Questions skipped: the user requested findings and a remediation backlog before any implementation, so no redesign-choice question is needed.

The [completed security scan](phase5-da855c0-security-scan.md) was validated and indexed as `faa776a4-c471-4091-ae1c-0dfe9ba8659f`, with four findings (1 critical, 2 high, 1 medium). Canonical manifest/findings/coverage copies accompany the evidence. Finalization warned that working-tree contents changed: untracked assessment fixtures/dependencies/evidence were created during testing; no tracked application-source patch was made. Plugin-reported aggregate usage was 18,920,430 total tokens across six threads (18,855,857 input, including 18,252,800 cached; 64,573 output). This is the plugin's rollout aggregate, not a separately measured harness or per-request cost.
