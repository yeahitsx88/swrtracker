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

### Decision 22 — true partial requester drafts
- Provenance: owner answered “Go with both” to full partial-draft schema/API support and recoverable delete/restore approvals.
- Approved: explicit Save Draft may persist incomplete Area, Type, contact, date and details on one durable ticket. Required intake is checked at Submit. Preserve submitted records, public numbering, first submission and ordered return/resubmission history. Failed uploads or submit attempts must retain the existing draft identity and editable progress rather than creating another ticket.
- Boundary: supplied values still require safe types, valid project references and valid calendar dates. Missing draft fields are null/empty, not fabricated defaults. Existing direct-assignment entry remains complete. No autosave or new operational permissions.

### Decision 23 — recoverable requester deletion, no expiry or purge
- Provenance: the same owner answer approves recoverable requester soft-delete and project-scoped IT restore, while deferring automatic expiry and permanent draft/attachment purge until retention policy approval.
- Approved: requester deletes only their own DRAFT. Normal request/history/file/list access hides it immediately. Existing PROJECT_ADMIN-only recovery rules remain: current project scope, 30-day recovery window and a written reason of at least 10 characters. Preserve draft ID, files and append-only audit history.
- Boundary: TENANT_ADMIN alone gains no direct draft-recovery authority. No automatic expiry, permanent deletion, file purge or orphan sweep is implemented. Older §20 expiry/purge passages are deferred, not active requirements. Protected-grant cleanup contracts remain separate pending decisions.


### Decision 24 - responsibility-only protected-resolution first slice (written design pending)
- Provenance: on2026-10-01, the owner replied "Continue" to the recommended first slice: only SURVEY_REVIEWER resolution, an already-authorized replacement covering the same Area, and atomic append-only evidence of prior grant, replacement, coverage, confirmer and time. The alternative was to settle the complete acting/department/replacement contracts before any implementation.
- Approved scope: advance that responsibility-only design under Decision20's existing central/project IT boundary; Survey Manager remains read-only for protected blockers. Resolve one existing obligation, never infer or issue replacement authority, change roles or rewrite requests/history.
- Remaining gates: acting/FIELD_COORDINATOR/department resolution and whether department membership newly blocks role removal remain unresolved. The proposed exact same-node grant plus individual Area-visibility witness, active-subject/top-level-Area restriction, API/UI/audit/locking details are in docs/superpowers/specs/2026-10-01-survey-reviewer-resolution-design.md for written-spec review; they are not silently promoted to accepted implementation requirements. Architectural implementation-plan review follows spec approval.
- No production code, migration, account/grant/staffing data or Sabine preview change is authorized by this documentation checkpoint itself. Existing tested phase5 behavior remains atfb45827 until a separately verified implementation checkpoint.


### Decision 25 - Survey Manager authority for the responsibility-only resolution slice
- Provenance: on 2026-10-01, after reading the written design summary remotely, the owner said: "I actually want to modify it so that the survey manager also has this authority. The survey manager may fire or demote a superintendent, so they would be the appropriate party to make this call as well."
- Approved direction: the current project's Survey Manager may resolve the supported SURVEY_REVIEWER obligation alongside existing central/project IT. Apply the same deliberate confirmation, already-authorized replacement coverage and retained atomic audit evidence. Manager may make this decision directly before the existing separate role-change command.
- Supersedes Decision20 and Decision24's IT-only/Manager-read-only restriction only for this responsibility-only first slice. Acting, FIELD_COORDINATOR and department contracts remain unresolved. No broad Manager access-administration, invitation, account deletion/deactivation, bulk cleanup, inferred replacement, title-derived authority or ticket/history rewriting is implied.
- Revised written design: docs/superpowers/specs/2026-10-01-survey-reviewer-resolution-design.md. It proposes a purpose-specific authorization branch, existing editable-personnel scope, shared resolution controls and recorded authority evidence. Written-spec review and subsequent implementation-plan review/execution selection remain pending; this direction does not certify implementation or authorize a Sabine cutover.


### Decision 26 - temporary additional-Area Superintendent coverage
- Provenance: on 2026-10-01 the owner corrected the existing-coverage-only design: "the survey manager may need to temporarily assign another Superintendent an additional Area." Example: John D. is removed as Super1; Jason, Super2, temporarily covers Super1's Area until a permanent Super1 is identified.
- Approved direction: permit the current project Survey Manager to explicitly establish additional-Area coverage for another current Superintendent rather than requiring that person already cover the Area. Retain the replacement's existing Areas. This supersedes Decision24/25's existing-replacement-coverage-only restriction for the responsibility-only handover; it does not approve arbitrary standalone grant creation, new roles or generalized Area administration.
- Revised proposal: same confirmed exact-Area handover for Manager/IT, reuse complete coverage or create only the missing SURVEY_REVIEWER grant/individual Area assignment, then revoke the selected departing grant atomically with retained creation/reuse evidence and the retry ledger. API/confirmation/audit/race details and temporary coverage lasting until a confirmed manual handover are proposed in the written specification, not settled by inference. No automatic expiry or successor assignment.
- Remaining gates: written-spec review, implementation-plan review/execution selection, and complete Superintendent departure/individual Area cleanup/reporting transfer contracts. This handover alone does not remove remaining role blockers. Acting/FIELD_COORDINATOR/department and account lifecycle remain separate. The example is workflow evidence, not authorization to import or mutate Sabine people.


### Decision 27 - revised written Survey Reviewer handover design approved
- Provenance: on 2026-10-01, the owner replied "Approved" after the b4548e5 written-design checkpoint and remote-readable summary, including additional-Area coverage and temporary coverage ending through confirmed manual handover.
- Approved specification: docs/superpowers/specs/2026-10-01-survey-reviewer-resolution-design.md as atb4548e5. Current project Survey Manager and existing central/project IT may reuse complete coverage or explicitly create missing exact-Area review/individual assignment coverage for another eligible current Superintendent, preserving other Areas. Coverage creation, selected revocation, truthful TEMPORARY/PERMANENT provenance, audit and retry are atomic.
- Boundary accepted: remaining departing individual Area/reporting/crew obligations and separate guarded role changes remain outside this first slice. No automatic expiry, acting/FIELD_COORDINATOR/department/general grant/account lifecycle expansion or Sabine mutation/cutover. Full Superintendent departure cleanup requires its own contract.
- Next stage: writing-plans is authorized for the approved written spec. New implementation-plan review and execution method selection remain required; this approval is not treated as approval of an unseen plan or production implementation.


### Decision 28 - approved plan, native execution
- Provenance: on 2026-10-01 the owner said "Native execution approved" after the e1568f2 implementation-plan checkpoint.
- Approval: execute docs/superpowers/plans/2026-10-01-survey-reviewer-handover.md against the Decision27 design, as one native implementer with independent read-only review at each verified API/UI checkpoint and ordinary pushes to origin/phase5.
- Limits: approval does not cross full Superintendent departure cleanup, acting/FIELD_COORDINATOR/department, account lifecycle or retention-policy gates, and does not authorize Sabine mutation or deployment.


### Decision 29 - narrow Superintendent Area-unlink design direction
- Provenance: on2026-10-01, after pushed final reviewer handover checkpoint0f3ab1e, the owner replied "Approve option 1" to the recommendation: explicit Manager Area unlink after replacement coverage is complete and dependent reporting links are deliberately resolved. Alternatives were combined Area/reporting handover or leaving departure gated for another separately scoped capability.
- Approved direction: prepare the narrow written cleanup design. Retain separate reporting resolution through existing tools, other Areas, roles/accounts/crews/teams/history and the guarded separate role-change command. No automatic bulk cleanup, reporting transfer, account firing/deactivation or Sabine mutation is approved.
- Proposed specification: docs/superpowers/specs/2026-10-01-superintendent-area-unlink-design.md makes exact-row eligibility, explicit current complete replacement coverage, Manager staffing authorization, protected dependency refusal, displayed state, atomic retained staffing audit/replay, locks and UI acceptance concrete. These proposed details are for written-spec review, not settled by inference from the option selection.
- Gates: written-spec review/approval, then implementation-plan review and execution selection. Decision27's full-departure exclusion is narrowed only to the selected next-design scope; other protected/lifecycle/retention/deployment contracts remain unresolved. Production remains verified0f3ab1e until an independently verified approved implementation checkpoint.


### Decision 30 - written Superintendent individual Area-unlink specification approved
- Provenance: on2026-10-01, the owner replied "Approved" after the f9560f5607f9b58345cb8ef5689446c4727fa18a written-spec checkpoint and remote-readable summary. This is approval of that concrete specification, not merely a repeated option selection.
- Approved contract: docs/superpowers/specs/2026-10-01-superintendent-area-unlink-design.md as atf9560f5. Current project Survey Manager explicitly unlinks one eligible Superintendent individual top-level Area row only after current distinct exact-Area review+individual replacement coverage and deliberate reporting resolution. Existing Chief tools resolve reporting; no coverage creation/reporting move/auto-demotion in the cleanup action. Current authority, original displayed evidence, retained versioned staffing audit, conditional deactivation and historical retry remain atomic.
- Boundaries: Manager plus IT qualifies by actual Manager membership; IT-only cleanup is excluded. Unsupported protected grants, inactive/former lifecycle, other Areas/obligations, complete departure, account/retention/deployment and Sabine mutation remain outside this slice.
- Next stage: writing-plans authorized. docs/superpowers/plans/2026-10-01-superintendent-area-unlink.md is prepared for review; wait for that concrete plan review before implementation. Preserve the owner's supplied Native execution preference without asking them to choose again. No source/API/schema/runtime change in this approval checkpoint.


### Decision 31 - Superintendent Area-unlink implementation plan approved, native execution
- Provenance: on2026-10-01 the owner replied "Approved" after the deb74eff6652327bdea5ddea748b9b3d765e86b3 implementation-plan checkpoint and remote summary. Preserve the already selected Native execution method.
- Approval: execute docs/superpowers/plans/2026-10-01-superintendent-area-unlink.md as one native implementer, with independent read-only review at the verified API and Manager UI checkpoints, ordinary pushes to origin/phase5, then final whole-range review. Do not ask again between the approved tasks.
- Boundaries remain Decision30's exact-row Manager cleanup, reuse-only complete replacement coverage, deliberately resolved reporting and separate guarded role changes. IT-only cleanup, broader protected/lifecycle/retention contracts, fabricated personnel and retained Sabine mutation/cutover remain excluded.


### Decision 32 - project administrative parity and scoped offboarding direction
- Provenance: owner approved account-offboarding policy decisions 2–5 and revised decision1 to “central IT and project admin (if not the same person).” They requested review of every Central IT-only permission and noted that a Survey Manager may hold all three roles in a smaller company. After confirming understanding, the owner said “Proceed.”
- Scope clarification: owner selected “Own projects; if the tenant has a central IT, the disabling flags central IT for review and any tenant wide disabling that may be needed.”
- Approved direction: Project Admin exercises administrative powers within their own administered projects, including independently disabling selected-project access and flagging existing Central IT for subsequent wider review. Central IT separately performs tenant-wide account disablement when authorized and needed. No requirement for different people/two approvals; one person may hold Central IT, Project Admin and actual Survey Manager authority. Survey Manager alone gains no administrative powers.
- Preserve policies2–5: prior live-duty resolution within action scope; preserved drafts/memberships/company/history, no self-disable/last-tenant-admin loss and actual Manager continuity; reactivation separately designed; atomic audit/revocation/retry and concurrent-writer integration.
- Assessment artifacts: audits/central-it-project-admin-permission-review-20261001.md inventories eight exclusive capability families plus discovery; audits/central-it-account-offboarding-design-20261001.md revises local versus tenant commands, same-person/absent Central IT review, proposed separate project admin/access storage, and40 acceptance cases. Tenant role grants/project creation/shared template mutation do not become tenant-wide Project Admin powers merely by changing a role comparison.
- Gate: this records policy/direction approval, not approval of proposed new schema, access metadata, review outbox, archived access exception or an implementation plan. Revised written-design review precedes separate implementation planning. No production/API/type/schema/data changes, retained Sabine mutation or deployment.

### Decision 33 - revised scoped offboarding design accepted for implementation planning
- Provenance: after the revised offboarding design and project-wide permission inventory were presented, the owner resumed the goal: "Great. Now let's continue development for phase5." Treat this as acceptance of the concrete revised design for planning; preserve Decision32's own-project scope and Central IT review direction.
- Planning: docs/superpowers/plans/2026-10-01-scoped-account-offboarding.md proposes seven testable tasks covering independent admin/access storage, combined-role enforcement, all participating lifecycle writers, separate local/tenant commands, durable review/outbox, project administrative parity, UI and integrated acceptance.
- Review boundary: the concrete implementation plan needs owner review before code/schema execution. Native execution remains the owner's selected method; no new method selection is needed. Approval of this document has not been inferred from resumption.
- Preservation: no product source/tests/API/type/schema/data changes or production/Sabine mutation. Existing dirty original checkout and prior assessment artifacts retained.
### Decision 34 - scoped offboarding implementation plan approved, Native execution
- Provenance: owner requested the saved plan in chat while remote, reviewed the full seven-task plain-language scope and replied "Approved."
- Approval: execute docs/superpowers/plans/2026-10-01-scoped-account-offboarding.md, retaining Native execution, independent final read-only review and ordinary verified phase5 checkpoints.
- Scope: independent admin/access storage, combined authority and all access consumers, lifecycle writer/session integration, separate local/tenant offboarding, durable Central IT review, project administrative parity, UI and integrated acceptance.
- Limits: no production deployment/Sabine mutation, reactivation, emergency bypass, SSO, purge or billing changes. No repeated approval requests between approved tasks.
### Decision 35 - review reconciliation and direct correction fresh review
- Provenance: owner requested reading docs/PHASE5_REVIEW_BRIEF_20261001.md from phase5-261001-review, assessing/reconciling each recommendation, then continuing Phase5 development.
- Source: review commit1b9b61aabda4a20a85e01584446da1524016502e, baseline92e5b45; newer approved checkpoints030a654/917f2b7 and Decisions32–34 take precedence.
- Owner explicitly selected “Fresh Survey review and approval” after direct-assignment return/resubmission. Preserve durable record/reference/history; no direct reassign bypass.
- Reconciliation: docs/PHASE5_REVIEW_RECONCILIATION_20261001.md records every A–D finding and standard-practice recommendation, bounded corrections, existing lifecycle integrations, pilot gates and remaining owner decisions. Generic recommendations do not override stacked independent actors, no auto reassignment/expiry, retention deferral or reactivation exclusion.
- Continue Native approved development after reconciling the review. No production/Sabine deployment, external services, purge or retained data repair inferred.

### Decision 36 - owner resumes the approved bounded Phase5 plan (2026-10-02)
- Provenance: owner supplied the current assessment, requested a reconciliation plan, selected the authoritative phase5 track despite the dirty local review branch, then said "Implement the plan."
- Authority: resumes Decision34's approved seven-task plan from d45ad0c, with Native execution and independent final review. The earlier owner pause is superseded; implementation uses an isolated worktree and preserves the original dirty Phase5-RedTeam checkout.
- Outcome: Tasks3-7 now have current local implementation/acceptance evidence and a compatible release runbook. Whole-range review covers the approved92e5b45 baseline through d45ad0c and this increment, with material replay/eligibility/wait findings corrected. Exact evidence and limits are in audits/phase5-scoped-offboarding-completion-20261002.md.
- Preserved boundaries: ordinary verified phase5 checkpoints remain authorized. No production/Sabine deployment, retained-data repair, automatic cleanup/reactivation, external service purchase, purge, SSO or new pilot-policy approval is inferred. Pilot/Owner/Rollout concerns remain separately classified by the reconciliation review.


### Decision 37 - synthetic whole-customer lifecycle rehearsal (2026-10-02)
- Provenance: owner selected synthetic rehearsal before hosting/outside testers, then supplied the complete customer-lifecycle rehearsal request.
- Authorized: new branch from verified phase5, isolated synthetic fixtures/support tools, automated scenarios and personal guided role walkthroughs, durable evidence and classified findings.
- Branch: codex/customer-lifecycle-rehearsal from 6becd3bd541f58271e70cafd6a5da82162b44051. Reuse clean isolated checkout; preserve original dirty review checkout.
- Governing rule: Rehearse -> Observe -> Record -> Classify -> Review -> Authorize. Findings do not authorize product fixes, architecture changes, CRM, commercialization, hosting, or organizational tenant disablement. Proposed onboarding experience is assessed rather than adopted as architecture.
- Record: audits/customer-lifecycle-rehearsal/README.md. Initial automated onboarding wave and browser login complete; all personal steps and later lifecycle stages remain pending. Assisted bootstrap is not successful application onboarding.


### Decision 38 - project-specific enrollment access (2026-10-02)
- Provenance: during the customer-lifecycle rehearsal, owner proposed bulk invitations or domain allowance, then selected "Project specific access" when asked whether verified employees should access all company projects or receive project-specific access.
- Approved boundary: company/domain eligibility does not grant every project; project access requires an explicit scoped invitation or grant. Operational/administrative authority remains separately assigned.
- Scope: policy decision only; choice and design of bulk/domain enrollment and implementation remain pending under Decision37. No product changes or live domain configuration authorized.


### Decision 39 - employee project access requests require administrator approval (2026-10-02)
- Provenance: owner answered "yes, request access to a project for admin approval" when offered administrator-approved employee requests versus invitation-only enrollment.
- Approved direction: verified employees may request specific project access; pending requests grant no access; administrator approval precedes membership/access grant. Preserve Decision38 project scope.
- Remaining design: project discovery, administrator authority/routing, approved role/company binding and request lifecycle. This policy decision does not authorize automatic implementation or broaden existing administrator authority.


### Decision 40 - project link/code access-request entry point (2026-10-02)
- Provenance: owner selected "Project link/code" over a browsable tenant project directory.
- Approved direction: organization-shared project link/code identifies the specific project for a verified employee access request. Link/code possession grants no access; Decision39 administrator approval remains required. Avoid requiring ordinary users to supply internal Project UUIDs.
- Design and implementation remain pending under Decision37; no product change or live domain/access configuration authorized by this selection.


### Decision 41 - access-request approvers and Requester default (2026-10-02)
- Provenance: owner replied "That fits the model" to approval by the project's Project Admin or tenant Central IT, granting Requester by default with Survey/administrative roles assigned separately.
- Approved: either scoped Project Admin or tenant Central IT may approve the project access request; no dual approval requirement. Default approved access is REQUESTER. Other authority requires separate explicit assignment.
- Completes the current policy chain with Decisions38-40; does not authorize implementation, restore disabled access, or broaden administrative scope. Concrete enrollment design remains pending under Decision37.


### Decision 42 - clarified human Project Admin delegation (2026-10-02)
- Owner clarifies Alex creates/opens Northbank, invites Jordan by name/company email as its Project Admin; Jordan opens assigned projects and cannot create projects. Desired project administration includes company-category enrollment lists, Survey Manager setup and project customization.
- Correct rehearsal cast: human Jordan is local Project Admin; previously seeded same-name foreign tenant admin is only an isolation control, not the human persona. Existing fixtures remain unchanged pending deliberate setup.
- Preserve project scope and independent capabilities; custom role/permission creation versus assigning fixed roles requires clarification. No tenant-wide enrollment authority, custom RBAC or implementation authorization inferred. Walkthrough paused for clarification.


### Decision 43 - predefined roles; individual permission configuration deferred (2026-10-02)
- Provenance: owner selected predefined roles and deferred individual permissions as more mature configuration.
- Resolves Decision42: assign existing Project Admin capability and Survey Manager role to eligible people; do not create custom roles or per-person permission sets. Preserve independent administrative/operational authority and project scope.
- Custom role definitions and individual permission configuration are deferred. Missing invitation/enrollment implementation remains subject to Decision37 review/authorization.


### Decision 44 - sustained synthetic operation and personnel departures (2026-10-02)
- Owner authorized Jordan-led synthetic operation with64 Survey personnel,100 requesters, sustained workflow/permission/KPI observations and a reconstructable ledger. Reuse isolated rehearsal infrastructure; account provisioning assistance must be labeled.
- Owner added Jordan resignation with Central IT replacement, then500 additional internal tenant requesters and50 individual subcontractor requesters across companies. These are individual accounts, not50 companies.
- Findings remain observations; only blocking defects permit the smallest correction. No production-data mutation, permission bypass, external mail, hosting or automatic recommendation implementation.

### Decision 45 - guarded Survey Manager succession (2026-10-02)
- Owner added firing of the Survey Manager and promotion of an existing Superintendent. After authenticated attempts revealed the unsupported existing-member transition and LAST_SURVEY_MANAGER continuity blocker, owner explicitly selected "Implement the guarded handover".
- Approved bounded implementation: current project administration or Central IT appoints one current eligible Superintendent on an editable FULL project. An explicitly selected different Superintendent receives their individual Area coverage and reporting crews. Current preview, reason and confirmation bind the command; protected/acting/department/team/roster obligations require existing resolution.
- Promotion retains outgoing access until separately confirmed offboarding. Actual new Manager continuity must exist first. Tenant disable remains a separate Central IT operation; no custom role, inferred manager, historical ticket reassignment or authority from a Project Manager title.
- New mutation uses EXCLUSIVE lifecycle coordination, current authority before replay, immutable administrative evidence, session invalidation and atomic rollback.

### Decision 46 - Manager-directed crew rebalance (2026-10-02)
- Owner directs the promoted manager to inspect disproportionate allocation and reorganize teams fairly. Authorized normal synthetic operations through existing guarded staffing, reporting, Area cleanup, named-team and ticket assignment APIs.
- Rehearsal choice: retain15 intact four-person crews; move3 to match observed demand with8 Structures/4 Utilities/3 Civil crews. Resolve active work before changing coverage. Dispatch new requests across eligible crews within each Area; measure the new cohort separately from retained history.
- No automatic balancing feature, new organizational permission, historical rewrite or unrelated product improvement is authorized.

### Decision 47 - continuity investigation and administration review (2026-10-02)
- Owner reported Taylor unable to find project history and supplied scoped UI comments and a continuity/recovery investigation directive. Approved narrow investigation/correction, departure and manpower movement verification, existing secure password recovery reuse, synthetic evidence and a report; owner decisions remain required for tenancy ownership and recovery authority.
- Requested order: add member, current members, independent administration. Those and subcontractor requester records use collapsible/filterable/sortable tables and named multiple-action review; protected Survey obligations collapse. No historical rewrite, custom roles or unarchive inferred.
- Root discovery defect: Casey archived Northbank during review; Taylor's active Survey Manager membership remains. Archived permitted history is discoverable, with current authorization preserved. Approved bounded coordinated Manager movement uses existing staffing/team operations, active-work blockers, snapshot/reason/confirmation, atomic audit and exact retry.

### Decision 48 - internal capture and emergency recovery authority (2026-10-02)
- Owner chose local email capture for internal testing; verified external password-recovery delivery is a closed-beta gate.
- Owner approved a tenant-designated organizational recovery contact registered at onboarding and approval by two independent provider recovery officers. Fallback entry is Axiom customer support, which must be established before beta rollout. Contact with support does not itself confer tenant ownership or bypass verification.
- Recorded reviewable policy in audits/customer-lifecycle-rehearsal/continuity/EMERGENCY-RECOVERY-POLICY.md. Contacts/operator designation, verified support channel, controlled evidence storage/retention, disputed ownership procedure, executable scoped recovery and independently witnessed rehearsal remain pending beta gates. No support takeover privilege or endpoint implemented.


### Decision 49 - administration annotation corrections and restart exploration (2026-10-02)
- Owner requested table typography, visible selected-member actions, cancellation, company presentation, status-appropriate configuration and reviewer personnel role filtering. Implemented within existing authority and exact retry contracts. Template controls show only in SETUP; Project Admin setup permission remains approved pending the explicit Central-IT-only question. Archived live request/whitelist/archive forms are omitted; diagnostics and permitted historical records remain.
- Owner asked to explore a year-long shutdown and entirely new cast. Current states are SETUP/ACTIVE/ARCHIVED; archive is terminal in v1 (CLAUDE Sections15/21), and new project access does not grant predecessor access. No pause/reactivation/migration or authority expansion is implemented.
- Pending design alternatives: distinct PAUSED with controlled resume; guarded archived-project recommissioning preserving identity/history; successor project linked to an independently authorized read-only predecessor. Recommended for discussion: PAUSED for temporary shutdown and guarded recommissioning with a new operating period when the same job returns, including explicit new staffing/access and disposition of unresolved work. A new contract/scope may justify a separate successor. These are proposals, not approved capability changes.


### Decision 50 - guarded recommissioning and system records/appearance (2026-10-02)
- Owner explicitly approves the proposed recommissioning, generalizes reconciled annotation principles across all user types, and authorizes personal dark mode plus Central/Tenant IT tenant branding colors.
- Guarded Central IT ARCHIVED-to-SETUP preparation-to-ACTIVE reopening retains project identity and immutable prior-period evidence. Replacement administration, retained access/company review, Survey readiness and unfinished-work disposition are explicit; existing offboarding/staffing/workflow controls remain authoritative. Disabled access is never restored, and ordinary activation/template changes cannot bypass preparation.
- Record collections use tables with filtering, sorting, selection and useful authorized export or existing guarded bulk actions; secondary sections collapse where appropriate. Loaded-page scope is explicit. Native navigation/options and charts retain appropriate forms, with chart values available as tables.
- All authenticated roles have personal LIGHT/DARK/SYSTEM preferences. Only current eligible TENANT_ADMIN may change tenant primary/accent colors; derived readable actions and safety status meanings are preserved. No custom per-person permission model is introduced.
- Supersedes terminal-archive prohibition solely for the guarded approved workflow. Existing Project Admin setup capability remains approved; a Central-IT-only template restriction was not selected. Synthetic isolated implementation/verification is authorized; whole-release acceptance and beta gates remain separate.


### Decision 51 - Alpha local finalization and blocking workflow choices (2026-10-07)
- Owner approved the Alpha 1 finalization plan: all authenticated roles, Survey first, local Alpha acceptance; complete still-valid approved gaps and preserve the incumbent Axiom interface. Push/deploy/Alpha2/release remediation remain separate. Routine UX choices use existing patterns; new material business/authorization/persistence ambiguities stop the affected increment only.
- Submitted-request recovery returns eligible cancelled/rejected submitted requests to Returned for Correction on the same record with retained identity/files/history, fresh scoped authorization, reviewed state/reason/consent, exact retry and atomic evidence. The owner explicitly permits the verified last recorded Party Chief assignment to establish Chief recovery ownership only while the Chief still has the correct current role and Area coverage. This does not expand draft-recovery authority or imply automatic reinstatement of prior staffing.
- Broader Manager intact-crew transfers require an explicit destination named team and atomic reporting/crew membership reconciliation. Preserve destination complete Area coverage; block unresolved active-work, coverage, lead-vacancy and membership conflicts. Preserve verified same-Area reporting-only movement. No history rewrite, inferred team/reporting authority or Org Chart mutation.
- Org Chart dedicated refinements, live writes, provenance/relationship/headcount expansion and scale work remain deferred. Inherited source-map-js release-image advisory remains separate from passing production compilation.
