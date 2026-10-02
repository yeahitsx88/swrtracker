# Phase 5 review brief — deficiencies, security/authority gaps and recommendations

Date: 2026-10-01. Branch `phase5-261001-review`, created from `phase5` at `92e5b45` (equal to `origin/phase5`, clean worktree).

**Status:** read-only assessment. This brief changes no code, authorizes no implementation, and does not supersede approved requirements or owner decisions. Like the [Path Forward brief](PHASE5_PATH_FORWARD_BRIEF_20261001.md), it is a dated index for the next owner decision.

**Authority used:** [REQUIREMENTS_ADCQ-260923-001.md](REQUIREMENTS_ADCQ-260923-001.md) (R01–R11), [LEAD_DECISION_LOG.md](worklogs/LEAD_DECISION_LOG.md) through Decision 31, [PRODUCT.md](../PRODUCT.md), and [docs/CLAUDE.md](CLAUDE.md) where it doesn't conflict with them.

**Baseline:**

| Check | Result |
|---|---|
| `pnpm tsc --noEmit --incremental false` | Pass |
| `pnpm test` | 441 / 441 pass (0 fail, 0 skip, 0 cancelled) |
| `pnpm audit --prod` | **54 advisories: 3 critical, 31 high, 18 moderate, 2 low** (see A0) |
| Builds, browser, HTTP and PostgreSQL suites | Not rerun for this brief |

**Method:** I read the auth, middleware, visibility, workflow kernel, ticket use cases, attachment, notification/worker, registration/invite, membership and migration code. "Verified" means the behavior was reproduced with a script. Every other finding comes from reading the code path end to end.

---

## 1. Executive summary

The Phase 5 staffing, handover and Area-unlink work is careful and well tested within its bounded scope. The main risks are **outside** those bounded slices:

1. **Dependencies are behind on security patches.** The pinned Next.js version has published critical RCE and middleware-bypass advisories. This is the only item that should be fixed right away, independent of any other decision.
2. **One workflow dead end.** A direct-assignment SWR that is returned and resubmitted can never leave `SUBMITTED`.
3. **Two paths bypass the Phase 5 protections.** A tenant-admin membership endpoint silently overwrites roles. A dormant worker job auto-reassigns field work to an arbitrary Project Admin; it will switch on as soon as account deactivation exists.
4. **Requirement gaps that matter for a pilot:** Party Chiefs can't see approved-but-unassigned work (R05). Requester cancellation sends no stop-work notice to the crew. Notifications are never delivered. The lead-time rule is evaluated in UTC.
5. **Standard hardening is missing:** HTTP security headers, database-enforced audit immutability, per-source rate limiting, account lifecycle and retention.

Section 3 maps these to common industry practice for a multi-tenant workflow and audit system. Section 4 proposes an order.

---

## 2. Findings

### A. Fix before pilot or Phase 5 close

#### A0. Dependency advisories, including critical Next.js issues: patch now
- **Current state:** `next` 15.5.12 (lockfile), `bcrypt` 5.1.1. `pnpm audit --prod` on 2026-10-01 reports, among others:
  - **next:** 2 critical ("Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used"; "…on windows-hosted servers"). There are also several **middleware/proxy bypass**, SSRF and DoS advisories. Patched in the 15.5.x line; the highest patched floor listed is `>=15.5.24`.
  - **sharp, postcss, nanoid** (through next), and **tar, brace-expansion** (through `bcrypt`'s install-time `node-pre-gyp` chain).
- **Exposure in this app:** `next/image` is used ([product-brand.tsx](../src/components/ui/product-brand.tsx)), so the image-optimization endpoint is live. The local Sabine preview runs on Windows. Route handlers enforce authentication themselves, which limits the impact of a middleware bypass to page redirects, but treat that as luck rather than design.
- **Recommendation:** Upgrade `next` to the latest patched 15.5.x and re-run the full acceptance set. Upgrade `bcrypt` to 6.x, which drops the `node-pre-gyp`/`tar` chain; confirm hash compatibility, since existing `$2b$` hashes remain valid. Add an automated audit gate (Section 3.1).

#### A1. Direct-assignment SWRs get stuck after a return and resubmission (verified)
- **Where:** [transitions.ts:79](../src/modules/workflow/domain/transitions.ts). The `DIRECT_ASSIGNMENT` map allows `… → RETURNED_FOR_CORRECTION → SUBMITTED` but has **no entry for `SUBMITTED`**.
- **Failure:** After a survey return, or a validated field-inability return, the requester resubmits. Every outgoing action then throws `ConflictError`: approve, assign, return, requester cancel and survey cancel. No test covers this path.
- **Recommendation:** The owner decides the post-resubmission route: review, or direct reassignment. Add the transitions plus a regression test and the liveness test in Section 3.5. Check retained data for affected tickets.

#### A2. The membership endpoint silently overwrites roles and skips every protected-obligation gate
- **Where:** `POST /api/projects/:id/members` ([members/route.ts:56](../src/app/api/projects/[projectId]/members/route.ts)) → `saveMembership` ([tenancy.repository.ts:1049](../src/modules/tenancy/infrastructure/tenancy.repository.ts)): `ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`.
- **Failure:** A tenant admin "adding" an existing member replaces their role. The endpoint:
  - skips the crew, reporting, Area, responsibility, acting and team obligation checks that `changeSurveyRole` enforces;
  - can demote the project's only Survey Manager;
  - writes no audit event (`user.role_changed` is defined but never emitted) and doesn't bump `role_version`;
  - runs its two writes outside a single transaction.
- **Recommendation:** Make the endpoint insert-only (409 on an existing membership) and send role changes through the gated use case. Or retire it until the central IT lifecycle design defines it.

#### A3. A dormant worker job auto-reassigns field work to an arbitrary Project Admin
- **Where:** `dispatchOrphanWorkflowRecovery` → `reassignOrphanWorkflowTicket`. See [notification/infrastructure/index.ts:240, 295](../src/modules/notification/infrastructure/index.ts); the admin is picked with `ORDER BY pm.user_id LIMIT 1`.
- **Behavior:** When an assigned Party Chief or Survey Lead is deactivated, the worker writes a Project Admin into `assigned_party_chief_id` and `survey_lead_id` and clears an orphaned Instrument Man. It bypasses the workflow kernel, writes no `ticket_assignment_history` row and logs the change as `ticket.assigned`.
- **Consequences:** This contradicts "no automatic reassignment / no inferred replacement" (Path Forward brief, PRODUCT.md, docs/CLAUDE.md §22). A Project Admin can't see or act on tickets, so the work becomes unactionable at field level. It also breaks R10 assignment history.
- **Why now:** Nothing sets `users.deactivated_at` today, so the job hasn't fired. The recommended next design (central IT lifecycle) would very likely add deactivation and switch it on.
- **Recommendation:** Remove the job, or change it to escalate only, before or within that work.

#### A4. R05 gap: approved, unassigned SWRs aren't visible to any Party Chief
- **Where:** [ticket-visibility-clause.ts:56](../src/lib/ticket-visibility-clause.ts). `PARTY_CHIEF` sees only `assigned_party_chief_id = self`, and approval doesn't set a Chief.
- **Gap:** R05 requires approved SWRs to stay "visibly actionable to the responsible Area Party Chief or field coordinator". Individual Chief Area assignments exist in staffing but don't feed visibility. `FIELD_COORDINATOR` grants exist in the schema but nothing reads them. The docs don't track this gap.
- **Recommendation:** The owner decides how a Chief's Area responsibility exposes the approved-unassigned queue. It is not a new authority, only visibility plus the existing IM-assignment action.

#### A5. Requester cancellation of active field work sends no stop-work notice
- **Where:** [requester-cancel.ts:33](../src/modules/ticket/application/requester-cancel.ts). It clears the PC/IM assignment but notifies only the requester. Survey cancel and return both send `STOP_WORK_*` to the field.
- **Failure:** A requester cancels an `IN_PROGRESS` SWR, and the Instrument Man may keep working.
- **Recommendation:** Reuse `enqueueAssignedFieldNotifications` and add a regression test.

#### A6. Unauthenticated tenant creation
- **Where:** [tenants/route.ts:14](../src/app/api/tenants/route.ts) ("Bootstrap endpoint — no auth required").
- **Failure:** Anyone who can reach the host can create unlimited tenant rows.
- **Recommendation:** Remove it, restrict it to non-production builds, or require an operator bootstrap secret.

#### A7. Some filenames upload fine but can never be downloaded; the audit records the failed download (verified)
- **Where:** [attachments/handler.ts:280, 289](../src/app/api/tickets/[ticketId]/attachments/handler.ts). `Content-Disposition` is built from the raw filename.
- **Repro:** On Node 24, a header with `filename="Survey – Plan.pdf"` throws `TypeError: Cannot convert argument to a ByteString`. En-dashes, accents and CJK all trigger it. The 500 happens after `attachment.downloaded` has been committed.
- **Recommendation:** Send an ASCII `filename=` fallback plus `filename*=UTF-8''…` (RFC 6266 / RFC 8187). Write the audit event only once the response can be built.

### B. Medium: authority, visibility and workflow edge cases

| # | Finding | Where | Scenario / impact |
|---|---|---|---|
| B1 | Other requesters' drafts are readable by broad-visibility roles | `isolate()` in [ticket-visibility-clause.ts:16](../src/lib/ticket-visibility-clause.ts) | Survey Manager, VIEWER, CAD, AREA_VIEWER, Superintendent and department roles can list (no `queue`, or `status=DRAFT`) or open another requester's unsubmitted partial draft and its files. Reporting queries exclude drafts; the list and detail endpoints don't. |
| B2 | Direct-assignment `requesterId` isn't validated | [create-direct-assignment-ticket.ts:58](../src/modules/ticket/application/create-direct-assignment-ticket.ts) | Any tenant user can be named requester: a non-member, a deactivated user, or a subcontractor (which mis-attributes company and leaks the ticket into that company's view). |
| B3 | Field-inability review has a single captured reviewer and no fallback | [field-inability.ts:29](../src/modules/ticket/application/field-inability.ts) | If that Chief changes role, leaves or is reassigned, nobody can validate or reject. Assignment changes aren't allowed in that state, so only cancellation exits. |
| B4 | A stop-work flag can't be declined and lingers | [request-survey-cancel.ts:99](../src/modules/ticket/application/request-survey-cancel.ts) | The flag stays pending across return and resubmit cycles and blocks new flags. The Survey Manager can later approve a stale flag carrying an old reason. |
| B5 | Clearing the Instrument Man on active work leaves an orphaned state | [assign-ticket.ts:64](../src/modules/ticket/application/assign-ticket.ts) | `ASSIGNED`/`IN_PROGRESS` with no IM: nobody can start, complete or report inability. |
| B6 | Resubmission overwrites Survey's priority decision | [submit-ticket.ts:109-142](../src/modules/ticket/application/submit-ticket.ts) | Priority resets to the title or whitelist default. Title and whitelist auto-priority are listed as superseded, yet remain active. This contradicts R07. |
| B7 | Ticket notifications are never delivered | [local-preview.ts](../src/modules/notification/application/local-preview.ts) | The outbox is preview only. R05, R07, R08 and R09 require requester notification. This is a pilot gate. |
| B8 | Lead time is checked in UTC, and the result depends on submission time | [lead-time-policy.ts:36](../src/modules/ticket/domain/lead-time-policy.ts); [tickets/route.ts:104](../src/app/api/tickets/route.ts) | In US Central with a 2-day rule, a Wednesday need-by is accepted only if submitted before **Sunday 7 pm**. `POST` parses with `new Date()` while `PATCH` uses `parseNeedBy`, so offset timestamps shift the date by a day. This is edge-case register item #1, still open. |
| B9 | Login lockout is per account only | [login-rate-limit.ts:43](../src/modules/identity/application/login-rate-limit.ts) | Anyone who knows the tenant ID and an email can keep that user locked out indefinitely. Per-source limiting depends on an ingress that isn't provisioned. |
| B10 | No HTTP security headers | [next.config.ts](../next.config.ts), [middleware.ts](../src/middleware.ts) | No `frame-ancestors`/`X-Frame-Options`, so approve, cancel and role controls could be clickjacked. No CSP, HSTS or Referrer-Policy. |
| B11 | Audit gaps, and immutability is a convention only | register, invites and members routes; migrations | No `invite.sent`, `invite.accepted`, `user.self_registered` or role-change events. `ticket_events` has no trigger and no privilege boundary preventing UPDATE or DELETE. |

### C. Known gaps that constrain the next work

- **Account lifecycle barely exists.** The only way to create accounts is registering through a subcontractor REQUESTER invite ([company-access.repository.ts:100](../src/modules/identity/infrastructure/company-access.repository.ts)). GC, survey and admin accounts come from seed scripts only. There's no deactivation, admin reset or reactivation. An existing user can't accept an invite to another project (`createUser` → 409). Invite tokens come back in the API response for manual delivery.
- **One role per user per project** (`UNIQUE (project_id, user_id)`). R04 allows multiple Survey responsibilities per person. `docs/CLAUDE.md` still expects PROJECT_ADMIN plus a second visible role, which the schema can't represent.
- **No retention is implemented:** no draft expiry or purge, no attachment purge or orphan sweep. `api_idempotency` stores full response bodies, including ticket data, indefinitely.
- **Attachments:** checked by extension plus client-declared MIME only; no content sniffing or malware scanning; uploads are buffered in memory twice (about 31 MB cap).
- **Survey Superintendents can't initiate stop-work or survey cancel**, although the error text says "survey leadership". Confirm whether that's intended.

### D. Low / hygiene

- `POST /api/tickets`, the notifications route and login don't UUID-validate IDs, so bad input returns 500 instead of 400.
- No maximum lengths on description, contact, craft or filename.
- `DRAFT → REQUESTER_CANCELED` is allowed; the spec says drafts are deleted, not canceled.
- The migration runner has no advisory lock or checksum. The runtime image doesn't include `db/`. The Docker image uses Node 22 while local development uses Node 24.
- `JWT_SECRET` isn't checked for strength (the `.env.example` placeholder would pass). `tsconfig.tsbuildinfo` is committed.
- **Docs drift:** `main` still carries the superseded **root `CLAUDE.md`**, which AI sessions auto-load; this review session loaded it before switching branches. `docs/CLAUDE.md` requires `SELECT FOR UPDATE` on every transition, but most transitions use row-version compare-and-set. The decision log skips Decision 21.

---

## 3. Recommendations from standard industry practice

This system is a **multi-tenant, role-based workflow and record-keeping application** whose outputs may later answer legal or audit questions (as-built traceability). The practices below are the ones commonly expected of that class of system. Each row names the reference practice, where SWRTracker stands today, and a proportionate recommendation.

Recommendations that would add a **new service or vendor** (email provider, malware scanner, managed secrets, identity provider) are marked **owner decision**, per the locked-stack rule in `docs/CLAUDE.md` §2.

Priority key:
- **P0:** now
- **P1:** before a pilot with real requesters
- **P2:** before a second tenant or broad rollout

### 3.1 Dependency and supply-chain hygiene
*Reference: OWASP Top 10 "Vulnerable and Outdated Components"; OWASP ASVS (v5.0) dependency requirements; SLSA / OpenSSF Scorecard practices.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Patch known-vulnerable components promptly | `pnpm audit` shows 3 critical, 31 high | Upgrade `next` and `bcrypt` (A0). Define patch SLAs, e.g. critical within 7 days and high within 30. | P0 |
| Automated dependency monitoring | None configured | Enable Dependabot or Renovate with grouped weekly PRs. Add `pnpm audit --prod --audit-level=high` as a CI and Docker build gate, with an explicit, dated allowlist for accepted risks. | P0 |
| Reproducible, minimal images | Lockfile and frozen install used; base image pinned by tag; dev dependencies shipped in runtime | Pin the base image by digest. Build a production-only runtime layer, with the worker compiled or bundled rather than run through `tsx`. Scan images (e.g. Trivy) in CI. | P1 |
| Static analysis | None | Add CodeQL or Semgrep (TypeScript, SQL-injection and authz rules) to PR checks. | P1 |

### 3.2 Authentication and sessions
*Reference: NIST SP 800-63B (Rev. 4); OWASP ASVS authentication and session chapters; OWASP Session Management and Authentication cheat sheets.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Password policy: length over complexity, blocklist screening, no forced rotation | Minimum 8 characters; no blocklist; no maximum | Screen new passwords against a breached or common-password list, e.g. a local k-anonymity range check or a bundled list. Rev. 4 expects **15+ characters when a password is the only factor** (8+ only with MFA). Decide which applies. Note that bcrypt only uses the first 72 bytes: cap input or pre-hash consistently. | P1 |
| MFA for privileged roles | None (SSO deferred) | **Owner decision.** TOTP or WebAuthn for TENANT_ADMIN, PROJECT_ADMIN and SURVEY_MANAGER at minimum; SSO/IdP-enforced MFA once SSO lands. Industry norm for admin consoles. | P2 |
| Rate limiting on account and source | Per-account lockout only (B9) | Add per-source limits at the ingress or app, and replace hard lockout with progressive delay so attackers can't lock out real users. Alert on spikes. | P1 |
| Session revocation | Session version and token revocation implemented (good) | Keep. Add "sign out everywhere" for users and admins. Ensure deactivation bumps `session_version` when lifecycle work lands. | P2 |
| Signing-key management | Single `JWT_SECRET`; no strength check; no rotation | Refuse to start with a short or placeholder secret. Add a key ID (`kid`) to support rotation without forcing everyone to log out. Keep secrets out of images; **owner decision** on a managed secret store. | P1 |
| Pin JWT algorithm | Library defaults | Pass `algorithms: ['HS256']` to `jwt.verify` explicitly (defense in depth). | P1 |

### 3.3 Authorization and tenant isolation
*Reference: OWASP Top 10 "Broken Access Control"; OWASP ASVS access-control chapter; deny by default and least privilege (NIST SP 800-53 AC-3, AC-6).*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Deny by default with one decision point per action | Strong in workflow use cases; bypassed by A2 and A3; drafts leak (B1) | Fix A2, A3 and B1. Add a lint or test rule that every route handler resolves actor and visibility through the shared helpers. | P0–P1 |
| **Authorization matrix tests** | Many targeted tests; no exhaustive matrix | Generate a table-driven test of role × endpoint × ticket status × relationship (own, assigned, Area, company) with expected allow, 403 or 404. It is the most effective guard against regressions in this design. | P1 |
| Database-level tenant isolation (defense in depth) | Query-level `tenant_id` scoping only | Evaluate PostgreSQL Row-Level Security keyed by a per-transaction `app.tenant_id`, at least for `tickets`, `attachments` and `ticket_events`. Measure performance first; a meaningful architecture change. | P2 |
| Least-privilege database roles | One app role with full DDL and DML | Separate a **migration role** (DDL) from the **app role** (DML only). Give the app role `INSERT`/`SELECT` only on audit tables. | P1 |
| Tenant identifier not trusted from the client | Login and register accept `tenantId` in the body | Acceptable for v1. Plan host- or slug-based tenant resolution before a second tenant, so users don't handle UUIDs and tenant probing is harder. | P2 |

### 3.4 Identity lifecycle and access governance
*Reference: joiner-mover-leaver (JML) process; periodic access reviews (SOC 2 CC6, ISO/IEC 27001 Annex A access control); separation of duties.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Defined joiner, mover and leaver flows | Joiner: subcontractor invite only. Mover: Team Management (good). Leaver: none. | Scope this in the central IT lifecycle design: GC/survey onboarding, existing user joining another project, deactivation (session kill, grant review, **no** auto-reassignment), reactivation and admin-initiated reset. Fix A2 and A3 first. | P1 |
| Periodic access recertification | None | A quarterly per-project report of who holds which role, grants, temporary coverage and age, with an attestation record. Cheap and expected by enterprise customers. | P2 |
| Time-bound elevated access | Temporary coverage has no expiry (owner decision) | Keep the no-auto-expiry decision. Surface **stale temporary grants** (e.g. older than 14 days) on the Manager and IT dashboards and in the recertification report. | P2 |
| Four-eyes on high-impact admin actions | Single actor with confirmation | For Survey Manager replacement, tenant-admin changes and bulk role changes, consider requiring a second approver or at least out-of-band notice to the affected person and other admins. | P2 |
| Break-glass access | Not defined | Document an audited emergency-admin procedure (sealed credential, mandatory audit review). | P2 |

### 3.5 Workflow integrity
*Reference: finite-state-machine design practice (explicit transitions, liveness and safety invariants); BPM and ticketing practice (every state has an owner, an SLA and an escalation path; delegation and out-of-office cover).*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| **Liveness:** every non-terminal state has an exit for some actor | Violated by A1; weak in B3 and B5 | Add a table-driven test over both transition maps: every reachable non-terminal state has at least one exit **and** a cancel or return path, and every terminal state has none. | P0 |
| Every waiting state has a named owner plus a fallback | Single captured reviewer (B3); stop-work flag has no decline (B4) | Adopt one rule: the named actor first, then Area Superintendent or Survey Manager as override, each logged. Add a "decline stop-work flag" action with a reason. | P1 |
| SLA timers and escalation | Approver timeout and stuck-state queries exist | Extend to `PENDING_FIELD_VALIDATION`, pending stop-work flags and approved-unassigned (A4). Show age on queues. | P1 |
| Consistent state invariants | IM can be cleared on active work (B5) | Enforce in the use case (and optionally a DB `CHECK`): `ASSIGNED`/`IN_PROGRESS` require an assigned IM. | P1 |
| Optimistic concurrency and idempotency | Row versions plus idempotency keys (good) | Keep. Add a **retention window** for idempotency records (24–72 hours is typical) and store only status and a minimal body. | P1 |
| Single source of truth for transitions | Centralized kernel (good); doc says `SELECT FOR UPDATE` | Update `docs/CLAUDE.md` to record compare-and-set as the approved concurrency model. | P1 |

### 3.6 Audit trail and traceability
*Reference: tamper-evident logging (NIST SP 800-92; OWASP Logging Cheat Sheet); SOC 2 CC7 monitoring; records-management practice for evidentiary use.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Append-only enforced by the database, not convention | Convention only | Add a trigger that rejects `UPDATE`/`DELETE` on `ticket_events` and `access_grant_events`, plus privilege separation (3.3). | P1 |
| Tamper evidence | None | Optional but common for evidentiary records: hash-chain events per ticket (`prev_hash`, `hash`) and periodically anchor a project digest. Low cost at this scale. | P2 |
| Complete event catalog | Gaps in identity and admin events (B11) | Emit invite, registration, membership and role-change and admin-config events. Maintain a test that each mutating route emits its expected event. | P1 |
| Audit only on success | Download audited before the response is built (A7) | Write audit events in the same transaction as the effect, after validation. | P0 |
| Trusted time | Application `new Date()` mixed with DB `NOW()` | Prefer DB `NOW()`/`clock_timestamp()` for event timestamps and run NTP on hosts. Edge-case register already flags clock skew. | P2 |

### 3.7 Web application hardening
*Reference: OWASP Secure Headers Project; OWASP ASVS configuration and validation chapters; OWASP CSRF Prevention Cheat Sheet.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Security headers | None (B10) | Add through `next.config.ts` headers or middleware: CSP (start in report-only), `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and HSTS at the TLS edge. | P1 |
| CSRF defense in depth | `SameSite=Strict` cookie plus custom idempotency header on most mutations (good) | Add an `Origin`/`Sec-Fetch-Site` check for all state-changing requests, including the few without idempotency keys (logout, notifications POST, attachments without a key). | P1 |
| Input validation at the boundary | Types checked; IDs and lengths inconsistently validated (D) | Shared validators: UUID format, max lengths (description, contact, filename), consistent 400s. Consider a schema library only if the owner approves a new dependency. | P1 |
| Remove unauthenticated or legacy surfaces | `POST /api/tenants` (A6); retired `areas` stubs | Remove or gate. Keep an inventory of public routes with a test that asserts it. | P0 |

### 3.8 File handling
*Reference: OWASP File Upload Cheat Sheet; RFC 6266 / RFC 8187.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Allowlist plus content verification | Extension and declared MIME only | Add magic-byte checks for the allowed types (PDF, PNG, JPEG, OOXML zip signature). | P1 |
| Malware scanning | None | **Owner decision.** Scan before files become downloadable (ClamAV sidecar or provider scanning). Common for files shared across companies. | P2 |
| Safe download headers | Good (`attachment`, `nosniff`, `no-store`) except non-ASCII names (A7) | Add RFC 8187 `filename*` support (A7). | P0 |
| Streaming and quotas | Fully buffered, roughly twice per upload | Stream to disk with a running hash. Add a per-ticket and per-project byte quota alongside the count limit. | P2 |
| Storage durability | Local volume, documented backup procedure | Before production, decide between the volume with backups and S3-compatible storage (already allowed by the stack). Retain the SHA-256 verification on restore. | P1 |

### 3.9 Notifications
*Reference: transactional outbox pattern; email deliverability standards (SPF, DKIM, DMARC); notification UX practice.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Durable outbox with a real transport | Outbox exists; preview only (B7) | Reuse the existing webhook transport used for password reset to deliver ticket notifications. Add retries with backoff, a dead-letter state and an operator view (partly present). **Owner decision** on provider. | P1 |
| Sender authentication | n/a | Configure SPF, DKIM and DMARC for the sending domain before go-live. | P1 |
| Field-reachable fallback | None | In-app notification inbox and badge for field users with unreliable email. Stop-work notices should be prominent in Crew Work. | P1 |
| No internal-state leakage | Status display map exists | Keep notification copy on the display map and add a test that requester-facing templates never contain internal status names. | P1 |

### 3.10 Dates, time zones and lead time
*Reference: store instants in UTC and calendar dates as dates; evaluate business rules in the location's time zone (IANA tz).*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Location-aware deadline evaluation | UTC midnight (B8) | **Owner decision:** add `projects.time_zone` (IANA, e.g. `America/Chicago`). Evaluate "need-by day at local start of day minus N days" in that zone. Decide whether lead time counts calendar or working days. | P1 |
| One parser for calendar dates | `POST` and `PATCH` differ (B8) | Use `parseNeedBy` everywhere and reject timestamp inputs for need-by. | P0 |
| Server-provided minimum date | Client computes | Expose the earliest valid need-by from the server so the UI and enforcement can't disagree (edge-case register "stale config"). | P1 |

### 3.11 Data protection, retention and legal hold
*Reference: records-retention schedules; legal hold; data minimization (privacy-by-design).*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Written retention schedule | None; expiry and purge deferred by decision | **Owner decision:** define retention per record class (SWRs, events, attachments, drafts, idempotency, logs), aligned with contract and legal requirements for construction records. Implement purge jobs only after approval. | P1 |
| Legal hold | None | Add a project- or ticket-level hold flag that blocks any future purge. Cheap now, hard to add after data exists. | P2 |
| Minimize secondary copies of personal data | Idempotency ledger stores full bodies indefinitely; logs include IDs only (good) | Trim the ledger body and add TTL pruning (3.5). Review log fields for emails or names. | P1 |
| Encryption at rest and in transit | TLS assumed at ingress; DB and volume encryption undefined | Require TLS to the database and encrypted volumes or backups in the deployment checklist. | P1 |

### 3.12 Reliability and operations
*Reference: SRE practice (SLOs, alerting, runbooks); backup 3-2-1 rule and restore testing; expand/contract database migrations.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Backups with tested restores | Procedure documented; not exercised in a controlled environment | Agree RPO and RTO with the owner. Enable PostgreSQL point-in-time recovery (WAL archiving) and run a scheduled restore drill that verifies DB **and** attachment hashes together. | P1 |
| Safe migrations | Manual runner; no lock; image lacks `db/` | Run migrations as a separate release step with `pg_advisory_lock` and file checksums. Use expand/contract for breaking changes (add column, dual-write, backfill, switch reads, drop later). | P1 |
| Health, readiness and alerting | `/api/health`; job runs recorded | Alert on worker failure or staleness, outbox backlog age, 5xx rate and DB connection saturation. Define a small SLO set (availability, p95 list latency under 1 s per docs/CLAUDE.md §17). | P1 |
| Runbooks | Partial (DEPLOYMENT.md) | Add incident, restore, key-rotation and "user locked out or compromised" runbooks, plus a security contact. | P2 |

### 3.13 Testing and assurance
*Reference: OWASP ASVS Level 2 as the verification target for business applications handling sensitive data; OWASP Testing Guide; independent penetration testing before external customers.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Verification standard | Ad-hoc, well-documented acceptance batches | Adopt **ASVS L2** as the checklist and record a self-assessment in `audits/`. | P2 |
| Automated security testing | None | Run OWASP ZAP baseline (DAST) against a disposable environment in CI or nightly. | P1 |
| Property and model tests for workflow | Unit tests per transition | Liveness test (3.5) plus randomized sequences of actions per role, checking invariants (no orphan states, history rows match current assignment). | P1 |
| Independent penetration test | None | Before a second tenant or any internet-exposed pilot. | P2 |

### 3.14 Field usability and accessibility
*Reference: WCAG 2.2 AA; mobile-first field software practice.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| Accessibility conformance | Design standards and keyboard/reduced-motion work done; assistive-technology checks pending | Run an automated axe pass in browser tests, then one manual screen-reader pass of intake, Crew Work and approvals. | P1 |
| Poor-connectivity tolerance | Idempotent retries and uncertain-state handling (good) | Keep. Test on throttled and offline-flapping profiles; make sure stop-work and return notices are visible after reconnect. | P1 |

### 3.15 Documentation and decision governance
*Reference: architecture decision records (ADRs); single source of truth for requirements.*

| Practice | Today | Recommendation | P |
|---|---|---|---|
| One authoritative spec per concern | Requirements doc plus a partially superseded `docs/CLAUDE.md`; stale root `CLAUDE.md` on `main` | When `phase5` merges, remove or replace root `CLAUDE.md`. Progressively edit superseded sections of `docs/CLAUDE.md` rather than relying on a preamble. | P1 |
| Decision log integrity | Decision 21 missing | Add a placeholder or explanation for Decision 21. Link each decision to its implementing commits and audits. | P2 |

---

## 4. Suggested sequencing

**Now (independent of the next design selection):**
1. A0: upgrade Next.js and bcrypt, then rerun acceptance. Add the audit CI gate.
2. Remove or gate `POST /api/tenants` (A6). Fix the RFC 8187 download headers and audit ordering (A7). Unify need-by parsing.
3. Add the workflow liveness test, which will fail on A1, and fix A1 after the owner chooses the route.

**Before the central IT lifecycle design is approved:**

4. Decide the fate of the orphan-recovery job (A3) and the membership upsert (A2). The lifecycle specification should state both explicitly.
5. Include in that design: deactivation semantics, existing-user invites, audit events for every identity change, and DB-enforced audit immutability.

**Before a pilot with real requesters:**

6. A4 (Chief visibility of approved-unassigned work), A5 (requester-cancel stop-work), B1 (draft visibility), B2, B3/B4 (fallback reviewers, flag decline), B5 and B6.
7. Notification delivery (B7), the project time zone (B8), security headers (B10) and per-source rate limiting (B9).
8. Backups with a restore drill, migration hardening, alerting, and the authorization matrix test.

**Before a second tenant or broad rollout:** MFA or SSO for privileged roles, the retention schedule and legal hold, RLS evaluation, malware scanning, an ASVS L2 self-assessment and an independent penetration test.

---

## Appendix: verification notes

- **A1:** `assertValidTransition('DIRECT_ASSIGNMENT', …)` allows `ASSIGNED→RETURNED_FOR_CORRECTION`, `IN_PROGRESS→PENDING_FIELD_VALIDATION→RETURNED_FOR_CORRECTION` and `RETURNED_FOR_CORRECTION→SUBMITTED`. It blocks `SUBMITTED→{APPROVED, ASSIGNED, RETURNED_FOR_CORRECTION, REQUESTER_CANCELED, SURVEY_CANCELED}`. Run with `node --import tsx` against `src/modules/workflow/domain/transitions.ts`.
- **A7:** `new Response(…, { headers: { 'Content-Disposition': 'attachment; filename="Survey – Plan.pdf"' } })` on Node v24.13.1 throws `TypeError: Cannot convert argument to a ByteString because the character at index 29 has a value of 8211`.
- **A0:** `pnpm audit --prod` on 2026-10-01 against the committed lockfile. Installed `next` 15.5.12, `bcrypt` 5.1.1. Advisory counts change over time; rerun before acting.
- **Login timing:** the dummy bcrypt hash in `authenticate.ts` is 64 characters (non-standard), but comparisons took the same time as a real cost-12 hash (about 162–166 ms). No enumeration timing issue was found.
