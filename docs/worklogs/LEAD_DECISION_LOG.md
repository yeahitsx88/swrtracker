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
- Existing implementation gap: project-member mutations currently require TENANT_ADMIN; Area assignment mutations require PROJECT_ADMIN/TENANT_ADMIN; the Survey Manager can list members but lacks the requested management surface. Implement a narrowly authorized staffing use case rather than granting general administrative permissions or relaxing every membership endpoint.
- Integrity requirements: validate project/tenant membership, active individual and Area, compatible existing roles and reporting relationships; preserve historical ticket assignments/actions; make staffing and audit changes atomic. Authority and selected Area must be server-enforced. Do not infer missing Superintendent assignments from Area overlap.
- Clarification pending: whether creating/assigning Instrument Man or Party Chief positions also authorizes the Survey Manager to invite new people/create accounts, or only select existing registered people. Account onboarding is a separate authority decision; do not silently extend invitation powers.
