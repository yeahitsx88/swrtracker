# GAP Closure Implementation Spine (Lead)
Date: 2026-03-05
Lead Agent: Agent 0 (Integrator)

## Scope
- G1/G2/G3: Add per-project lead-time policy (`enabled`, `days`) and enforce it server-side at `DRAFT -> SUBMITTED`.
- G4/G7: Ensure craft/discipline capture persists and add `field_contact` + `field_channel`.
- G5: Tighten description/contact/channel validation at API/application boundaries.
- G6: Verify attachment flow still works and remains authorized.

## Target Data Model Changes
- `projects`: add `lead_time_enforcement_enabled` (bool, default true), `lead_time_days` (int, default 2, bounded).
- `tickets`: add `field_contact`, `field_channel` persisted fields.

## Target Endpoints
- `GET /api/projects/[projectId]/request-config`
- `PATCH /api/projects/[projectId]/request-config` (PROJECT_ADMIN/TENANT_ADMIN only)
- Ticket submission path uses project config in application layer and repository read.

## UI Surfaces
- Requester: `/projects/[projectId]/request/new`
  - Date picker min-date from project config when enforcement enabled.
  - Add Field Contact + Channel inputs.
  - Keep craft capture as explicit selector/field and persist to ticket.
- Admin: `/projects/[projectId]/admin`
  - Toggle lead-time enforcement.
  - Configure lead-time days.

## Test Strategy
- Domain/unit: lead-time invariant function tests.
- Application/service: config update authz + bounds; submit-ticket policy enforcement.
- API: project request-config GET/PATCH contract and authz.
- UI-adjacent: request-config client/date utility behavior under policy.
- Regression: attachment upload/list flows continue passing existing tests.

## /docs alignment references
- `docs/CLAUDE.md` Section 3 (layering), Section 4 (request fields + submission rules), Section 6/20 (submit-time validation).
- `docs/AGENTS.md` Sections 1, 6, 7, 8 (baseline gates, audit/event rigor, migration rules, DoD).
- `docs/PHASE4_STATUS.md` (maintain green typecheck/test baseline after change batches).
