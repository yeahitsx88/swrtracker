# Phase 5 responsibility and intake gap audit

Date: 2026-09-29. Role: AUDITOR. Scope: approved R03–R05 and submission priority; not an exhaustive release audit. No production, test, schema, or permission changes.

## Authoritative target

`docs/REQUIREMENTS_ADCQ-260923-001.md` overrides conflicting older rules. R03 defines the five minimum requester fields; R04 requires configurable Project/Area responsibilities and multiple responsibilities per person; R05 requires approved but unassigned work to remain actionable to its responsible coordinator. The same document explicitly leaves detailed permissions, coverage/absence handling, and responsibility snapshots open for design.

## Evidence and gaps

1. **Responsibility storage exists, but runtime wiring is absent.** Migration `022_amelia_access_and_workflow_foundation.sql` creates `project_responsibility_grants` with `SURVEY_REVIEWER` and `FIELD_COORDINATOR`, project/optional AOR scope, grant/revocation actors and timestamps, and tenant-scoped foreign keys. Searching `src/`, `tests/`, and `scripts/` finds no use of that table or those responsibility identifiers. This is an unfinished foundation, not a need to invent a new permission framework.
2. **Review remains role-only.** `src/modules/ticket/application/approve-ticket.ts` permits only `SURVEY_MANAGER`. `src/lib/get-project-role.ts` resolves one project membership role. A grant cannot currently authorize a different reviewer for an Area.
3. **Coordinator queue access still depends on ticket assignment.** The `PARTY_CHIEF` clause in `src/modules/ticket/infrastructure/ticket.repository.ts` selects only `assigned_party_chief_id = actorId`. An approved request with no chief assigned cannot be discovered by an Area coordinator through that clause. Grant-aware visibility and assignment authority must be designed together; widening list visibility alone would not implement R05.
4. **The new-request path can still require a hidden department.** `src/modules/ticket/application/submit-ticket.ts` throws when neither department membership nor a ticket/manual department exists. The requester new page creates and submits without supplying `departmentId`. The API permits creating such a draft. Therefore a requester without department membership can create a draft through the UI but cannot submit it with just the approved five fields. This is a source-proven gap; a fresh browser reproduction has not been performed in this audit.
5. **Legacy title/whitelist priority remains.** Submission still calls `findDepartmentTitlePriority` and `isEmailWhitelisted` and derives priority automatically. The approved requirements supersede title/whitelist-derived priority as a substitute for Survey sequencing. Exact replacement/default/resubmission behavior must be made explicit before changing existing priority behavior.

## What the passing tests do and do not prove

- Current Linux Node 22 TypeScript and 256 tests pass. This does not prove requirement alignment.
- The new live HTTP acceptance supplies `departmentId` in its create payload, so it did not exercise the five-field-only UI path. Existing seeds similarly supply department context.
- The 504 Sabine read checks prove agreement with the current role/assignment implementation for six accounts. They do not prove grant-based responsibility behavior; no such grants are exercised.
- Prior same-record lifecycle, storage, and HTTP results remain valid within their documented scope.

## Owner decision required next

Choose the operational review authority for Sabine before implementing grant-aware access:

- **Area-delegated review (recommended):** Survey Manager retains project-wide review; an explicitly granted Superintendent may review requests in their covered Areas. Explicit Field Coordinator grants let the responsible Party Chief discover approved/unassigned work and assign eligible Instrument Men. A person may hold both responsibilities. No automatic expansion based only on a title or inferred source-data home Area.
- **Central review:** Survey Manager remains the only reviewer; Area coordinators gain the approved/unassigned queue and assignment responsibility, but Superintendents do not gain approval authority.

Both options need explicit coverage, allowed assignment-pool, absence, grant administration, and historical snapshot rules. A suggested initial boundary is explicit grants only, no implicit emergency authority, retain existing captured reviewers/history, and report missing coverage rather than silently choosing a replacement. This is a proposal, not an approved change.

Consequences: the choice affects authorization, query visibility, navigation/capabilities, grant administration, and regression fixtures. Existing additive grant storage may be reusable, but no schema or public API commitment is made by this audit. No user/data migration or permission widening has been performed.

Stop at this permission decision per the autonomous-development instructions. The intake and priority gaps remain queued and must not be hidden by fixture-specific department values or green legacy tests.
