# Phase 3 Status

Date started: 2026-03-04  
Current branch: `phase3`  
Current milestone: Milestone 5 (Crew work surfaces)  
Last successful build: 2026-03-04 (`pnpm tsc --noEmit` pass, `pnpm test` pass: 150/150)

## Milestone 0 - UI skeleton and API client
Completed items
- Added mobile-first app shell, shared visual system, and route-group scaffolding.
- Added authentication middleware gate for all non-auth entry routes.
- Added typed UI data-access layer: `lib/apiClient.ts`, `lib/contracts/*`, `lib/errors.ts`.
- Added backend read endpoints needed by UI integration: invite token validation, AOR tree read, attachment list read.

In progress items
- None.

Blocking issues
- None.

## Milestone 1 - Authentication
Completed items
- Implemented `/login`, `/register`, `/invite/:token`, and `/forgot-password` pages.
- Wired login/logout/register/invite validation flows through API client.
- Enforced authenticated access to platform routes via middleware.
- Hardened invite registration UX by carrying invite context into `/register` and locking invite-prefilled tenant/email fields.
- Added backend password-reset API endpoints:
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
- Added public `/reset-password` UI and replaced `/forgot-password` placeholder with a working request form.
- Added password reset token persistence (`password_reset_tokens`) with one-time use + expiry handling.

In progress items
- None.

Blocking issues
- None.

## Milestone 2 - Request submission
Completed items
- Implemented `/projects/[projectId]/request/new` mobile stepper flow:
  1. AOR node selection (tree picker)
  2. Ticket type
  3. Requested date
  4. Craft and description
  5. Optional attachments staging
  6. Review and submit
- Submission uses backend APIs only (`POST /api/tickets`, optional attachment uploads, then `POST /api/tickets/[ticketId]/submit`).

In progress items
- None.

Blocking issues
- None.

## Milestone 3 - Requester dashboards
Completed items
- Implemented `/projects/[projectId]/my-requests`.
- Implemented `/projects/[projectId]/drafts`.
- Added requester ticket detail surface at `/projects/[projectId]/tickets/[ticketId]`.
- Added server-driven pagination calls (`limit`/`offset`) through the backend ticket list API.

In progress items
- None.

Blocking issues
- None.

## Milestone 4 - Attachment system
Completed items
- Added reusable attachment uploader component.
- Added reusable attachment list component.
- Integrated attachment UX in request submission flow and requester ticket detail.
- UI disables uploads for terminal statuses (with backend still authoritative).
- Added attachment list API support to enable ticket detail rendering.

In progress items
- None.

Blocking issues
- None.

## Milestone 5 - Crew work surfaces
Completed items
- Implemented `/projects/[projectId]/crew/work` with transition actions:
  - `ASSIGNED -> IN_PROGRESS`
  - `IN_PROGRESS -> PENDING_PC_APPROVAL` (complete)
  - delayed and field-cancel requests
- Implemented `/projects/[projectId]/crew/approvals` for `PENDING_PC_APPROVAL` queue:
  - approve to backend-defined final state (completed/delayed/field-canceled)
  - reject back to `IN_PROGRESS`
- Conflict and authorization errors are surfaced in-page from backend responses.
- Hardening pass complete:
  - normalized UI error handling through shared client error-message helper
  - improved mobile tap targets and horizontal project tab navigation
  - added active-tab highlighting and `/projects/[projectId]` default redirect
  - restricted requester quick-cancel controls to cancellable statuses with busy-state and confirmation

In progress items
- None.

Blocking issues
- None.
