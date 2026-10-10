# Workflow audit, functional validation and UX refinement (2026-10-10)

Branch `alpha1-audit-hardening`. Owner-authorized scope: end-to-end workflow validation by role, plain-language errors, menu/control logic, and direct drag-and-drop on the main dashboard. No business rules, roles or tenancy rules were changed.

## How it was tested

- **Environment.** Real browser (Chrome via Playwright, headless) against the dev server on port 3210. It used the **disposable** review database (127.0.0.1:15491). Retained databases were not touched.
- **Isolation fixture.** A second tenant ("Isolation Test Tenant": one project, a Tenant Admin, a requester) was added to that disposable DB for isolation testing.
- **Assertions.** Each workflow was driven through the UI and checked against persisted state, via the API (`/api/tickets/:id`) and/or SQL on the disposable DB.
- **Labels.** "Browser" below means the step was driven in the browser. "API" means a direct HTTP probe.

## Coverage inventory

| Area | Controls and workflows exercised | Result |
|---|---|---|
| Request lifecycle (Requester → Survey Manager → Party Chief → Instrument Man) | New Request wizard (6 steps, Next/Back, Save Draft, Submit, incomplete submit), review dialog (approve, reject with reason), assignment link → Survey Operations, Choose a Crew, Start Work, Mark Delayed (with/without reason, Keep Request Unchanged), Restart Delayed Work, Complete Work, Report Unable to Perform → Field Report Review → Validate and Return → requester correction → Resubmit (same record), Flag Stop Work → Approve Stop-Work Cancellation, Create Follow-Up from Completed | Browser, all pass on fresh requests FSS-EAST-00032…00037 |
| Requester request page | Draft submit with missing fields, Show me, Delete Draft (confirmation, soft delete, confirmation on Drafts), Cancel My Request, conversation (empty/post/clear), upload availability | Browser, pass |
| Notifications | Requester inbox shows approval/completion; badge clears on visit | Browser, pass |
| Account | Profile name (empty/unchanged/changed → greeting), password (wrong current, mismatch, inputs kept), Appearance (dark/system), Help Desk (empty/create) | Browser, pass |
| Dashboard | Drag between columns, placeholder, follow-pointer, persistence on reload, keyboard Space/arrows/Enter/Escape, focus retention, title-bar links still navigate, reset, narrow single column, no overlap/off-screen | Browser (15 checks), pass |
| Team Management | Create team (blocked reasons, Show me, create 201), per-person Add reasons, Party Chief Staffing (blocked reasons, Area + covered Superintendent save), Superintendent Area coverage grant, crew-move preview after staffing (no blockers), Visual Editor open/close | Browser + API, pass |
| Administration (Project) | Request settings (lead time change persists, invalid value refused and not persisted), company registration review → confirm → listed, Setup project: add level, Area, department | Browser, pass |
| Administration sweep | 15 project/tenant admin pages + 9 Survey Manager pages + 10 pages × 5 other roles: silently disabled controls, error banners, stuck loading | Browser; all findings fixed and re-swept clean |
| Navigation | Every requester sidebar link loads without errors; sign-in (wrong password, email kept, success), sign-out, API refused after sign-out, signed-out page → sign-in | Browser, pass |
| Role and tenant boundaries | 23 API probes: cross-tenant read/write (request, attachments, comments, inbox, coverage review), other Tenant Admin audit log (no tenant-1 rows), requester approve/reject/assign/audit/direct-assignment/coverage, Instrument Man approve/audit, Party Chief coverage grant, Survey Manager audit, signed-out | API, all refused (401/403/404), no internals in errors |
| Unauthorized pages | 8 page visits across roles and tenants | Browser; all show a plain message, no data |

## Defects found and fixed (each re-tested in the browser)

| # | Defect | Fix | Commit |
|---|---|---|---|
| D1 | Dropped connections showed "Failed to fetch"; proxy/HTML error bodies showed raw HTML/"Request failed with status 500"; session ends showed "Current active session is required" | Plain wording by status with the next step; `NetworkError` keeps exact-retry intent; support reference on 5xx | 4e34c33 |
| D2 | Dashboard reordering needed a mode plus Move/Earlier/Later buttons | Direct drag with column snapping, keyboard alternative, persistence | 6732df2 |
| D3 | Incomplete New Request said only "Complete all required fields" | Lists each missing field; Show me opens its step | c85b2df |
| D4 | Review dialog showed only number and description; Confirm silently disabled | Area/type/Need-By/requester/contact shown; Confirm explains reason/confirmation | c85b2df |
| D5 | Approved request told the Survey Manager "No actions are available" | Link to Survey Operations → Need Assignment filtered to the request (`?tab=&q=`) | c85b2df |
| D6 | Choose a Crew and all field workflow dialogs silently disabled Confirm | Reasons with Show me | c85b2df |
| D7 | Assignment/delegation in Survey Operations gave no confirmation | Success message | c85b2df |
| D8 | Incomplete saved draft: generic server sentence listing fields already filled | Submit Draft names exactly the missing saved fields | 96d1010 |
| D9 | Drafts offered both Delete Draft and Cancel My Request | Cancel hidden for drafts (server rule unchanged) | 96d1010 |
| D10 | Deleting a draft from its page gave no confirmation | Drafts confirms it with the 30-day restore note | 96d1010 |
| D11 | Requester could open Survey Operations (toolbar, own counts) | Role message consistent with navigation | 8116d83 |
| D12 | "Ticket <uuid> not found" and other internal ids in messages | Ids removed; "This request was not found" | 8116d83, 0ec72f0 |
| D13 | Save name, Change password, Help Desk submit/reply silently disabled | Reasons with Show me | d570e58 |
| D14 | Preparation-cancellation and invitation-cancellation panels could stay "Loading…" forever (superseded read left the latch set: dev remount, or switching projects mid-load) | Cleanup releases the latch; only the current read clears it | 9afd823 |
| D15 | 13 admin actions silently disabled (company register/associate, invitations, whitelist, bulk reviews, Setup Areas/Departments) | Reasons with Show me | 9afd823 |
| D16 | Request settings errors named fields ("leadTimeDays must be…"); 69 server messages start with internal field names | Plain server wording for request settings; displayed errors translate field names; version conflicts → reload instruction | 9afd823 |
| D17 | Preview Manpower Move (the reported screen) and Change role (Survey Manager row) silently disabled; movement facts printed ids | Reasons (including where Superintendent coverage is given); ids hidden | 0ec72f0 |
| D18 | Sign-in requires an internal Tenant ID that sign-out and session redirects never prefill | Remembered on the device after sign-in; prefilled on Sign In and Forgot Password; field explains it | 468f43b |

## Open items needing a decision or more work

1. **Rejection notifies no one.** Approval queues a requester notice; rejection queues none. Notification recipients are an open requirement (REQUIREMENTS item 5), so this was not changed.
2. **Requester uploads after submission.** No upload is offered to the requester once submitted. Attachment behavior is an open requirement; not changed.
3. **Sign-in by organization.** Users must know the tenant id unless their link carries it. Looking it up from the email address would remove this, but it trades off account enumeration. Product and security decision.
4. **Sign-in redirect origin (dev).** In the dev server, the middleware redirect for a signed-out visit switches `127.0.0.1` to `localhost` (absolute URL from `req.url`). A relative redirect is rejected by Next middleware ("Invalid URL"), and header-derived hosts risk open redirects, so this was reverted unchanged. Verify on a production build and proxy before changing.
5. **Remaining governed evidence ids.** The Superintendent cleanup flow intentionally shows exact assignment and grant ids as evidence; left as is.

## Not tested in this session (and why)

- **PostgreSQL acceptance suites** (`test:postgres`) and the maintained browser runners: they need the retained containers or fixtures that this session must not touch.
- **Invitation registration, password-reset email, recommissioning, project creation, templates, custom roles, Central IT reviews and diagnostics actions.** Their pages were swept (no silent or stuck controls), but the workflows were not executed: they need invitation/outbox tokens or would change shared tenant configuration.
- **Visual Editor drag moves** (only open and close were checked), KPI "Explore charts", CSV exports beyond the audit log (verified in an earlier batch), and phone-width layouts beyond the dashboard and Team editor.
