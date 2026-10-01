# Lead Decision Log

## 2026-03-05

### Decision 1
- Decision: Execute the 6-agent plan as one integrated branch with explicit phase-owned sections and close-out entries.
- Why: Single-workspace execution still requires phase boundaries and handoffs.
- Citations:
  - `docs/CLAUDE.md` Section 3 (strict layering + module boundaries)
  - `docs/AGENTS.md` Section 3/4 (ownership boundaries and sequencing)

### Decision 2
- Decision: Add project-level lead-time config in `projects` instead of introducing a new table.
- Why: Configuration is project-scoped, low cardinality, and read-hot at submit time.
- Citations:
  - `docs/CLAUDE.md` Section 5 (project-scoped operational configuration belongs in project model)
  - `docs/AGENTS.md` Section 7 (minimize migration complexity and keep logical change in one migration)

### Decision 3
- Decision: Keep server as source of truth for lead-time and field validation; UI mirrors but does not replace enforcement.
- Why: Prevent bypass via direct API calls.
- Citations:
  - `docs/CLAUDE.md` Section 3 (web layer must not hold business rules)
  - `docs/CLAUDE.md` Section 20 (submission-time validation is backend authoritative)

### Decision 4
- Decision: Treat attachment verification as explicit QA close-out gate and do not alter attachment permissions logic unless regression appears.
- Why: Gap G6 is confirmation and non-regression, not a redesign.
- Citations:
  - `docs/CLAUDE.md` Attachment Permissions
  - `docs/PHASE4_STATUS.md` test baseline expectations

## Gate Log
- None raised yet.

## 2026-03-05 - Integration Close Decisions

### Decision 5
- Decision: Keep lead-time bounds at `1..30` days and default to `2` days.
- Why: Meets request examples (2/5/10), keeps rule bounded, and avoids unbounded config drift.
- Citations:
  - `docs/AGENTS.md` Section 8 (defensible validation and tests)
  - `docs/CLAUDE.md` Section 20 (submission validation rigor)

### Decision 6
- Decision: Add `field_contact` and `field_channel` as nullable ticket columns while enforcing non-empty input on create routes.
- Why: Preserves compatibility for historical tickets while ensuring new requests capture coordination context.
- Citations:
  - `docs/CLAUDE.md` Section 3 (web/API mapping + backend validation)
  - `docs/CLAUDE.md` requester submission constraints (Section 20 flow)

### Decision 7
- Decision: Allow request-config read for any project member, but restrict update to `PROJECT_ADMIN`/`TENANT_ADMIN`.
- Why: Requester UI needs read access for date picker constraints; mutation remains administrative.
- Citations:
  - `docs/CLAUDE.md` Section 7 role model and project admin authority
  - `docs/CLAUDE.md` Section 3 permission orchestration in application layer

### Decision 8
- Decision: Verify migration execution with `pnpm db:migrate` and keep note of sandbox spawn restrictions.
- Why: Finalization checklist requires migration cleanliness.
- Citations:
  - `docs/AGENTS.md` Section 7 (migration discipline)
  - Lead finalization checklist (user prompt)

## Gate Log (Final)
- No cross-phase blocking gates were raised during execution.

## 2026-09-24 — ADCQ-260923-001 product realignment

### Decision 9 — approved product-rule replacement and continuation baseline
- Decision: The user approved the ADCQ-260923-001 directive as the replacement for conflicting older SWRTracker product rules and selected `phase5` at `3b28834cbf3eb16afc465b8c0af5305f8ac90421` as the continuation code baseline. The canonical approved rules and open design questions are recorded in `docs/REQUIREMENTS_ADCQ-260923-001.md`.
- Why: Discovery and repository review found material conflicts in return/resubmission, successful completion, field inability, responsibility mapping, intake, dates, and priority. The existing code remains valuable as a continuation base.
- Scope: Requirements and documentation authority only. No product behavior, historical data, deployment, or release is approved by this entry. Preserve unaffected security, isolation, audit, and architecture controls.
- Provenance: ADCQ-260923-001 intake, user approval of replacement rules, and user selection of `phase5` on 2026-09-24. Local project evidence: the ADCQ-260923-001 Discovery/requirements reconciliation and remediation plan in the SWR Tracker project space.
- Open: Named owners and pilot value, cancellation boundary, detailed permission/state model, date/priority policy, notification and metrics definitions, deployed-data compatibility, and isolated database verification.

## 2026-09-29 — Sabine Area-delegated review

### Decision 10 — owner selected Area-delegated review
- Provenance: owner response, "Area delegated", to the manager-only versus Area-delegated review gate.
- Approved: Survey Manager retains project-wide review; explicitly granted Survey Superintendents may review within their covered Areas. Titles alone do not confer delegated review authority. Use existing responsibility-grant storage, preserve historical actions, and do not transfer captured field-inability reviewers implicitly.
- Implementation boundary: initial wiring covers approval and pre-assignment review returns, checking active Area grants and recording the grant snapshot in existing transition audit payloads. No new stop-work, cancellation, priority, or date-revision powers are inferred. Sabine's five fictional Superintendents use their existing Area coverage; historical simulation permissions remain unchanged.
- Follow-up: coordinator unassigned queues, assignment eligibility, grant-administration UX, and coverage changes remain separate implementation work; no extra grants are inferred for chiefs from their source-data home Areas.

### Decision 11 — Sabine reporting hierarchy confirmed
- Provenance: owner clarification: "Survey Manager > Survey Superintendent > Party Chief > Instrument Man", specifically for this project; the source dataset does not clearly demonstrate the hierarchy.
- Confirmed structure: represent Sabine's management-to-crew reporting chain explicitly. Existing Party Chief-to-Instrument Man rosters remain useful; Area overlap or ticket history alone is not proof of a Party Chief's supervising Superintendent.
- Boundary: this confirms hierarchy, not individual supervisor assignments, unrestricted cross-Area access, or new workflow powers. Preserve Decision 10 and existing tenant/project/Area isolation. Do not make this hierarchy mandatory for every project.
- Still open: person-level Superintendent/Party Chief mapping and whether the crew-scoped authority dashboard includes a separate authorized-Area unassigned-work population. Do not fabricate source-derived mappings.

### Decision 12 — owner requests Survey Manager team-management menu
- Provenance: owner requests a Main Survey Authority menu (Survey Manager in Sabine) to create a Party Chief role, assign an individual and an Area, and create/assign Instrument Man roles under that Party Chief.
- Scope approved for development: a focused project Survey Team staffing workflow using the existing PARTY_CHIEF and INSTRUMENT_MAN types, not an arbitrary permission-role builder. This explicitly brings this limited crew-management surface into scope despite the older deferred-roster-UI guidance.
- Explicit deferral resolution: on 2026-09-30 the owner answered “Yes—allow the narrow staffing flow” to the question about amending CLAUDE.md §15. The general-purpose admin/role-builder deferral remains in force.
- Existing implementation gap: project-member mutations currently require TENANT_ADMIN; Area assignment mutations require PROJECT_ADMIN/TENANT_ADMIN; the Survey Manager can list members but lacks the requested management surface. Implement a narrowly authorized staffing use case rather than granting general administrative permissions or relaxing every membership endpoint.
- Integrity requirements: validate project/tenant membership, active individual and Area, compatible existing roles and reporting relationships; preserve historical ticket assignments/actions; make staffing and audit changes atomic. Authority and selected Area must be server-enforced. Do not infer missing Superintendent assignments from Area overlap.
- Clarification pending: whether creating/assigning Instrument Man or Party Chief positions also authorizes the Survey Manager to invite new people/create accounts, or only select existing registered people. Account onboarding is a separate authority decision; do not silently extend invitation powers.
- Clarification resolved on 2026-09-30: the owner selected existing project members only. Survey Manager staffing may replace a compatible existing project role with the fixed Party Chief or Instrument Man role after explicit confirmation; it must not invite or create accounts. IT-admin invitation authority remains unchanged.

### Decision 13 — bounded Team Management expansion and named-team rules
- Provenance: owner's Team Management brief in attachment `c9e3ea04-6caf-4df2-9672-f969d815db2e/Pasted text.txt` and three direct clarification answers on 2026-09-30.
- Approved: after the next clean checkpoint, prioritize a Manager-only project Team Management menu/page. Existing project users may receive/change/remove fixed Superintendent, Party Chief and Instrument Man roles; named teams have a name, existing project Area, a lead selected from members, and editable membership. Safe deletion must retain history. The acceptance matrix is in `TEAM_MANAGEMENT_INCREMENT.md`.
- Confirmed model: one active named team per person per project. Teams are organizational groups only; existing Area authorization and explicit Superintendent→Chief→IM reporting remain separately managed. Removing a survey role retains membership as Requester, not Viewer.
- Boundary: no account creation/invitation, tenant role edits, unrelated elevated-role editing, general RBAC builder, cross-project discovery, scheduling or productivity feature is authorized. Existing project role values control operational permissions; role changes are not cosmetic titles and require confirmation/session invalidation. Historical ticket responsibility remains unchanged.
- Validation guard: reject lead removal without replacement, out-of-project people/Areas, duplicate people, stale writes, incompatible project crew builds, unresolved active reporting obligations and archived-project mutations. No hierarchy is inferred from team membership.
- Checkpoint sequence: `5025e2d` recorded the verified source baseline and confirmed decisions before named-team implementation began. The broader KPI/performance goal remains active.

### Decision 14 — separate Superintendent workload and linked-crew analytics
- Provenance: owner response on 2026-09-30, "Let's go with the Separate Area-Wide workload and linked-cre KPIs", to the two-population versus crew-only dashboard question.
- Approved: preserve Area-wide workload, including unassigned and unlinked Area demand, separately from linked-crew KPIs. The latter requires explicit current Superintendent → Party Chief reporting links intersected with authorized Areas. Counts, all chart forms, filters and matching-request drilldowns use the same selected population; Area-wide workload exposes no personnel comparisons.
- Boundary: this resolves population presentation, not person-level Sabine reporting assignments, account invitations, named-team authority, role/Area grants, or additional review/assignment powers. No existing historical request or reporting link is rewritten or inferred.

### Decision 15 — authenticated navigation and compact historical charts
- Provenance: owner's four annotated browser comments and supplied GitHub structural reference on 2026-09-30.
- Approved: replace the logged-in SWRTracker header label with the authenticated user's name greeting; replace the floating account menu with a full-height right navigation column that pushes the desktop working page inward. Responsive phone behavior uses a focus-protected drawer to preserve usable content space. Keep the Axiom identity, destinations, project context and session policy.
- Approved: historical charts default to one row with horizontal scrolling and an optional full-grid expansion. Chart drill-downs, shared filters, read-only data and bounded pages remain unchanged.
- Lower priority: report/print exports for KPI windows and filtered populations, including meeting lists of open requests. Future exports must respect the same server authorization/filter population and disclose generated/imported data; do not silently export only the current page. This refinement does not implement that backlog or replace the broader active development objective.

### Decision 16 — owner-approved recorded menu behavior
- Provenance: owner's GitHub menu recording `20260930-2116-55.5291109.mp4` and direct answer, "I'll go with your recommendation", to the overlay-versus-push clarification.
- Approved: a right-side full-height overlay on desktop and mobile, keeping the underlying page stationary, dimming the background and closing through Close, Escape or a backdrop click. Preserve Axiom rather than copying GitHub's dark identity or moving the menu to the left. A quick slide communicates opening/closing; retain native modal focus protection, scroll locking and a reduced-motion path.
- Supersedes only Decision 15's desktop push-column behavior. Greeting, destinations, project context, chart lane/grid, existing permissions and per-session logout remain unchanged. No staffing policy, schema, reporting assignment or export scope is changed.

### Decision 17 — protected existing staffing API
- Provenance: on 2026-09-30 the owner answered "Proceed" to extending the existing Manager staffing API to reject stale edits and safely handle retries while preserving additive roster behavior.
- Approved: the existing staffing POST requires a server-issued expected snapshot and idempotency key. A current Manager authorization check precedes replay. Successful state, session changes, audit and retry ledger commit atomically; failed commands leave no replay entry. Existing snapshot reads remain bounded and tenant/project scoped.
- Boundary: this is not permission to replace a roster from an incomplete page, remove omitted people, reassign an already staffed Chief across Areas, infer Sabine reporting links, create accounts or automatically clear responsibility/acting grants. The existing staffing editor consumes this protected command; obligation cleanup remains distinct unfinished work.

### Decision 18 — explicit staffing unlink commands
- Provenance: owner answered "Yes, I approve" on 2026-09-30 after the checkpoint and `audits/staffing-cleanup-gate-20260930.md` recommendation.
- Approved: Manager-only targeted soft deactivation of one current Chief→Instrument Man roster link, Superintendent→Chief reporting link, or individual Chief Area assignment within the existing staffing resource. Require the displayed snapshot, stable retry key and deliberate confirmation; audit and mutation commit atomically. Refuse Area unlink while dependent reporting remains. Role removal is a separate confirmed operation after obligations are resolved.
- Protected: account/project membership, role, named teams, ticket assignments/history, department-level scope, responsibility and acting grants. No automatic demotion, inferred replacement, bulk cleanup, invitation, cross-Area reassignment or Sabine person mapping.
- Additional evidence: the owner supplied three sample org charts and directed exclusion of the CAD-Technician group. Charts contain Lead Superintendent/Lead Chief and surveyor/support sublayers, multiple work-scope codes and variable crew sizes. Treat these as sample structure, not authority to import real identities or extend fixed permissions. Additional reporting-tier interpretation requires a separate owner decision.
- Owner clarification: survey assistants generally have no email access and do not need authorization or the request log. Do not generate assistant accounts or count supporting headcount as authorized app users. This does not automatically classify every Surveyor, Rodman, clerk or expediter as an Instrument Man or grant access by title.

### Decision 19 — sample org-chart titles are display-only
- Provenance: owner's direct structured answer on 2026-09-30: "Display-only titles for now; keep existing authority roles" for Lead Superintendent, Lead Party Chief and Surveyor/Assistant levels.
- Approved: retain the existing four survey authority roles and explicitly managed reporting/Area relationships. Additional chart levels are organizational display titles only, not persisted authority tiers or automatic role mappings. A Lead Superintendent is not automatically a Survey Manager; a Surveyor/support title does not automatically become Instrument Man access.
- Boundary: no permission, priority, workflow, reporting-link or Area grant changes; no new role enum, title-derived access, real-name import, assistant accounts or CAD-group modeling. Assistants without email remain supporting headcount outside the assumed app-user population. This does not approve a new editable title API/schema or reuse of priority-bearing department titles for decorative survey labels.
- Supersedes only the chart-tier decision gate in Decision18 and the Batch59 audit. Protected-grant administration, individual Sabine mapping, scoped exports and performance/deployment acceptance remain separate work.

### Decision 20 — narrow IT-admin protected-obligation resolution
- Provenance: owner's direct structured answer on 2026-09-30: "Yes—IT-admin-only resolution" to the protected responsibility/acting/department-grant flow question.
- Approved: a narrow IT-admin-only resolution flow for role-removal blockers involving existing protected responsibility, acting-authority and department grants. Survey Manager sees blockers and handoff guidance only, with no new grant-removal powers. Each individual resolution requires explicit confirmation and coverage checks; preserve historical records and current authority boundaries.
- Boundary: no automatic bulk cleanup, Manager permission expansion, account/invitation changes, inferred replacement/coverage, real Sabine mapping, or ticket/history rewriting. Inspect existing project-versus-tenant IT authority and coverage invariants before specifying commands. Cross-Area staffing reassignment and display-title editing remain distinct, not inferred from this approval.
