# CLAUDE.md — Field Survey Support Ticketing Platform

> This file is the source of truth for all AI-assisted development on this project.
> Read it in full before making any changes. Do not deviate from these decisions without explicit instruction.

---

## 1. What This Project Is

A multi-tenant, enterprise ticketing platform for field survey support on construction projects. It replaces email and spreadsheets with structured intake, assignment, approval, and traceability workflows — built specifically for the energy sector GC environment.

This is not a generic helpdesk tool. Domain context matters. Every decision should be evaluated against how work actually happens on a large industrial construction site.

---

## 2. Locked Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js (React) | Best AI agent support, mobile browser capable |
| Backend | Node.js + TypeScript | Consistent with frontend, strongly typed |
| Database | PostgreSQL | Relational, battle-tested, Railway-native |
| Hosting | Railway | Zero DevOps overhead for MVP |
| Auth | Email + password (bcrypt) | Simplest secure option for v1 — see SSO note in Section 8 |
| File Storage | Railway volume or S3-compatible | Attachments stored outside DB |
| Background Jobs | In-process worker (same codebase) | Email notifications, daily reports, attachment validation |

Redis is explicitly omitted from v1. Add only if cache pressure becomes measurable.

**Do not introduce new languages, frameworks, or services without explicit approval.**

---

## 3. Architecture — Modular Monolith

Single deployable application. Strict internal module boundaries.

### Dependency Direction

```
web → application → domain
infrastructure → application (via interfaces)
```

### Module Boundaries (Non-Negotiable)

- **Domain** — pure business logic, no I/O, fully deterministic
- **Application** — orchestration, permissions, workflow state transitions
- **Infrastructure** — DB, file storage, email, queues
- **Web/API** — routing, auth middleware, request/response mapping

**Domain must never import Infrastructure. Web must never contain business logic.**

### Internal Modules

| Module | Responsibility |
|---|---|
| Identity | Users, auth, password hashing, sessions |
| Tenancy | Tenants, projects, companies, role assignments, crew rosters |
| Ticket | Ticket creation, state machine, assignment, cancellation |
| Workflow | Fixed state transition enforcement, variant selection |
| Attachment | File metadata, upload URLs, access control |
| Notification | Email dispatch (async, in-process worker) |
| Reporting | Aggregated queries, daily summaries |
| Audit | Append-only event log, state change tracking |

Modules communicate via the application service layer only. No direct cross-module table access.

---

## 4. Domain Context (Read This Carefully)

### Who Uses This

- **General Contractor (GC)** — primary tenant owner, manages projects
- **Subcontractors** — submit requests under their company name
- **Survey crew** — Party Chief, Instrument Man — execute field work
- **Survey Lead** — assigns crew, manages scheduling, oversees production
- **Approvers** — review and approve/reject requests
- **Project controls / PM** — use request data for schedule validation and manpower tracking
- **Engineering / CAD Technicians** — use request data to ensure linework and survey files are ready for deployment

### How Work is Organized

- Projects are organized by **Unit/System** (e.g., Unit 1, Unit 2, Cooling Tower, Pipe Rack)
- Each Unit contains **Subareas**
- Area → Subarea is structured data, never free text

### The 48-Hour Rule

Workflow Variant 1 (Standard Approval) enforces a **minimum 48-hour notice** between submission and requested execution date. This is a hard business rule encoded in the domain layer, not a configuration setting.

### Priority Flag — Two Paths Only. No submission field. No self-service.

Priority is an internal operational flag. Requesters cannot set it. It is assigned by the system or by authorized personnel only. If every ticket is priority, no ticket is priority.

**Path A — Whitelist (Automatic)**
A project-level whitelist of senior management email addresses, maintained exclusively by `TENANT_ADMIN`. When a whitelisted user submits a ticket, the system automatically sets `is_priority = true` on the ticket at submission. The 48-hour rule still applies — priority does not bypass the approval workflow. It signals to the Approver that this request carries executive weight. No user action required. No field shown at submission.

**Path B — Manual Elevation (Post-Submission)**
After a ticket is submitted, only a `SURVEY_LEAD` or `APPROVER` may elevate it to priority. This happens after the requester contacts them directly (phone call, in-person). The elevation requires a written reason and is logged as a `ticket.priority_elevated` audit event recording who elevated it, when, and why. The requester is not notified — this is an internal operational action.

**Whitelist Management**
- Stored in a `priority_whitelist` table scoped to `tenant_id` and `project_id`
- `TENANT_ADMIN` is the only role that can add or remove entries
- Changes are audit logged as `whitelist.entry_added` / `whitelist.entry_removed`

### Ticket Types (Request Categories)

All tickets are classified by request type. The defined types are:

- `LAYOUT` — field layout work
- `CHECK_OUT` — instrument/equipment check-out
- `AS_BUILT` — as-built survey capture
- `TOPO` — topographic survey
- `PERMIT` — permit-related survey work

This list may be extended in future phases. It is structured data — never free text.

**CAD visibility applies to all ticket types.** CAD staff need awareness of all incoming work regardless of type so they can anticipate data needs and coordinate proactively.

### Subcontractor Isolation

Subcontractor users can only see requests submitted by their own company. They cannot see requests from other subcontractors. This is enforced at the data access layer.

### GC User Isolation

Users within the GC's own company are also subject to visibility scoping. A standard GC employee (Requester role) can only see tickets they submitted themselves. Full-project visibility is granted only to specific elevated roles — see Section 7A (Visibility Model).

### Rejection and Resubmission

When a ticket is rejected, the Approver must provide a written rejection reason before the transition completes. The Requester may then resubmit after verbal negotiation. The resubmission creates a new ticket linked to the rejected one. The written reason is the paper trail replacing the verbal conversation.

---

## 5. Data Model

### Core Tables

```
tenants
  id, name, created_at

projects
  id, tenant_id, name, status, created_at

companies
  id, tenant_id, name, type (GC | SUBCONTRACTOR | OWNER_REP), created_at

users
  id, tenant_id, company_id, email, password_hash (nullable — null for SSO users),
  auth_method (LOCAL | SSO), name, created_at

crew_rosters
  id, project_id, tenant_id, party_chief_id (user_id), instrument_man_id (user_id), created_at
  — Survey Lead manages roster entries
  — One Party Chief may have multiple Instrument Men
  — An Instrument Man belongs to one Party Chief per project
  — Changeable by SURVEY_LEAD; change is audit logged as crew.roster_changed

project_memberships
  id, project_id, user_id, role, created_at

area_memberships
  id, project_id, user_id, area_id, created_at
  — Used for AREA_VIEWER (ACM) role scoping only
  — A user with AREA_VIEWER role may have one or more area_memberships
  — Enforced at data access layer: AREA_VIEWER queries filtered by their assigned area_ids

priority_whitelist
  id, tenant_id, project_id, email, added_by (user_id), created_at
  — TENANT_ADMIN only may insert/delete rows
  — checked at ticket submission against requester email

allowed_domains
  id, tenant_id, domain (e.g. "zachrygroup.com"), added_by (user_id), created_at
  — TENANT_ADMIN only may insert/delete rows
  — checked at self-registration: if email domain matches, registration proceeds
    automatically and user is granted REQUESTER role
  — if no domain match, registration blocked unless a valid invite token exists
  — audit logged: domain.added / domain.removed

invites
  id, tenant_id, project_id, email, role, token (UUID), invited_by (user_id),
  accepted_at (nullable), expires_at, created_at
  — created by TENANT_ADMIN for users whose email domain is not in allowed_domains
  — token is single-use; expires_at enforced at registration
  — once accepted, accepted_at is stamped and token cannot be reused
  — audit logged: invite.sent / invite.accepted / invite.expired

areas
  id, project_id, tenant_id, name (Unit/System label), code (short slug e.g. "U1"), created_at

subareas
  id, area_id, project_id, tenant_id, name, created_at

tickets
  id (UUID), tenant_id, project_id, area_id, subarea_id, company_id
  ticket_number (human-readable, e.g. FSS-U1-00247 — project-scoped sequential, immutable)
  ticket_type (LAYOUT | CHECK_OUT | AS_BUILT | TOPO | PERMIT)
  requester_id, assigned_party_chief_id, assigned_instrument_man_id (nullable), survey_lead_id
  workflow_variant (STANDARD_APPROVAL | DIRECT_ASSIGNMENT)
  status, craft, description
  cad_status (nullable — set when ticket enters CAD sub-track)
  cad_assigned_to (user_id, nullable), cad_reviewed_by (user_id, nullable)
  cad_completed_at (nullable)
  requested_date, submitted_at, approved_at, assigned_at, started_at, completed_at, closed_at
  rejection_reason (required when status → REJECTED)
  parent_ticket_id (foreign key to tickets.id — set on resubmission after rejection)
  is_priority (boolean, default false — set by whitelist match or manual elevation only)
  priority_elevated_by (user_id, nullable — set only on Path B manual elevation)
  priority_elevated_reason (text, nullable — required when priority_elevated_by is set)
  created_at, updated_at

ticket_events (append-only — no updates, no deletes, ever)
  id, ticket_id, tenant_id, actor_id, event_type, payload (jsonb), created_at

attachments
  id, ticket_id, tenant_id, uploaded_by, filename, mime_type,
  storage_key, size_bytes, created_at

help_flags
  id, tenant_id, project_id
  raised_by (user_id), level (1 | 2), reason (optional text)
  status (ACTIVE | CLEARED)
  escalated_from (help_flag.id, nullable — set when a Level 1 is escalated to Level 2)
  cleared_at (nullable), cleared_reason (TICKETS_REASSIGNED | MANUALLY_CLEARED)
  created_at, updated_at
  — Level 1: scoped to a single Instrument Man; visible within their Party Chief's crew only
  — Level 2: project-wide signal; visible to SURVEY_LEAD and all PARTY_CHIEFs
  — A Level 2 flag need not be tied to a specific ticket — it signals general overload
  — Cleared automatically when all affected tickets are reassigned, or manually by the raiser
```

### Indexes Required

```sql
(tenant_id, project_id, status)                         -- ticket queries
(tenant_id, project_id, assigned_party_chief_id)        -- crew workload queries
(tenant_id, project_id, created_at)                     -- time-based reporting
(tenant_id, company_id)                                  -- subcontractor isolation
(tenant_id) on allowed_domains                           -- domain lookup at registration
(tenant_id, project_id) on invites where accepted_at is null  -- pending invite lookup
(tenant_id, project_id) on crew_rosters                 -- roster lookup
(project_id, party_chief_id) on crew_rosters            -- crew visibility queries
(project_id, user_id) on area_memberships               -- ACM scoping
(tenant_id, project_id, status) on help_flags           -- active flag queries
```

### Rules

- Every domain table includes `tenant_id`
- Every query that returns domain data must be scoped by `tenant_id`
- `ticket_events` is append-only — no updates, no deletes, ever
- Attachments are stored in object storage; DB stores metadata and storage key only
- `password_hash` is nullable — do not assume it is always set

---

## 6. Workflow State Machines

### Variant 1 — Standard Approval

```
DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
                  ↘ REJECTED
ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED
                                        → CANCEL_REJECTED
```

- 48-hour minimum notice enforced at SUBMITTED transition
- REJECTED requires rejection_reason before transition completes
- Cancellation requires Approver or Survey Lead sign-off
- CLOSED is the terminal state after COMPLETED — no further transitions permitted

### Variant 2 — Direct Assignment

```
CREATED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED
                                        → CANCEL_REJECTED
```

- No approval gate
- Auto-proceeds to ASSIGNED immediately
- CLOSED is the terminal state after COMPLETED

### Transition Rules

- All transitions validated in a single central function in the Workflow module
- Invalid transitions throw a `ConflictError` immediately
- No silent state changes anywhere

### Permitted Non-Standard Transition

`REJECTED → APPROVED` is a permitted transition, available to `APPROVER` role only. Covers the case where a requester contacts an Approver directly after rejection and the Approver determines the request should proceed. Logged as `ticket.rejection_overridden`. Written reason required before transition completes.

### Ticket Numbering

Every ticket has two identifiers:

**Internal ID** — UUID, used in the database and all API calls. Never displayed to users.

**Human-Readable Number** — sequential, project-scoped, formatted as:
```
FSS-[AREA_CODE]-[ZERO_PADDED_SEQUENCE]
Example: FSS-U1-00247
```
- `AREA_CODE` is the short slug on the `areas` table (e.g. `U1`, `CT`, `PR`)
- Sequence is per-project, increments on every ticket creation regardless of status
- Assigned at creation and is immutable — rejected tickets keep their number permanently
- Resubmissions after rejection receive a **new number** but carry `parent_ticket_id`
- The ticket number is what users reference in conversations, emails, and on site

---

## 7. Roles

> **This section is intentionally fluid.** Roles and permissions will expand as the platform is built out. New roles must be documented here before being implemented. Do not add roles to code without updating this file first.

### Tenant-Level Roles

| Role | Description |
|---|---|
| `TENANT_ADMIN` | Full tenant management — users, projects, domains, whitelists. Read access to all projects within tenant. |
| `BILLING_VIEWER` | Read-only billing and admin access. No ticket visibility. |

### Project-Level Roles

| Role | Description |
|---|---|
| `APPROVER` | Approve, reject, override-reject, cancel sign-off, manual priority elevation |
| `SURVEY_LEAD` | Assign crew, manage crew roster, manual priority elevation, reassign tickets, escalate help flags |
| `PARTY_CHIEF` | Execute assigned work, raise Level 2 help flags, escalate crew Level 1 flags, voluntarily claim flagged tickets |
| `INSTRUMENT_MAN` | Execute assigned work, raise Level 1 help flags |
| `CAD_LEAD` | QA sign-off on CAD sub-track — sees all tickets across all types |
| `CAD_TECHNICIAN` | CAD support work — sees all tickets across all types |
| `REQUESTER` | Submit and track own requests only |
| `VIEWER` | Full project read-only access |
| `AREA_VIEWER` | Read-only access scoped to assigned areas (used for Area Construction Manager) |

RBAC is enforced at the **application/use-case layer**, not just the route.

---

## 7A. Visibility Model

Defines exactly what each role can see. Enforced at the data access layer — not in UI logic.

### Full Visibility — all tickets and statuses across the project

| Role | Scope |
|---|---|
| `TENANT_ADMIN` | All projects within tenant (read) |
| `SURVEY_LEAD` | All tickets within their project |
| `CAD_LEAD` | All tickets within their project |
| `CAD_TECHNICIAN` | All tickets within their project (all types) |
| `APPROVER` | All tickets within their project |
| `VIEWER` | All tickets within their project (read-only) |

**CAD note:** CAD staff see all ticket types regardless of whether a CAD task is currently attached. Intentional — CAD needs full awareness to anticipate data needs proactively.

**BILLING_VIEWER** has no ticket visibility. Billing/admin surfaces only.

### Partial Visibility — scoped by assignment or area

| Role | Sees |
|---|---|
| `AREA_VIEWER` | All tickets in their assigned area(s) — defined by `area_memberships` |
| `PARTY_CHIEF` | All tickets where `assigned_party_chief_id = their user_id` + Level 2 help flags from other Party Chiefs |
| `INSTRUMENT_MAN` | All tickets where their Party Chief is assigned + tickets where they are `assigned_instrument_man_id` + Level 1 flags within their crew |

### General Visibility — own submissions only

| Role | Sees |
|---|---|
| `REQUESTER` | Only tickets where `requester_id = their user_id` |

**This applies to all requesters regardless of company.** A GC employee with REQUESTER role cannot see another GC employee's tickets. Domain or company affiliation does not grant broader visibility.

### Subcontractor Isolation

Subcontractor users are additionally filtered to tickets submitted by their own `company_id`. This is a second filter applied on top of role scoping, always enforced at the data access layer.

---

## 8. Authentication

### v1 — Email + Password

Standard email/password login with bcrypt. JWT issued in an `httpOnly` cookie (`swr_session`), 8h TTL, no refresh token in v1.

### Login and Access Flow

```
User hits /project/:id/request
  ↓
Logged in? → proceed to request form
Not logged in?
  ↓
Standard login page
  ↓
Post-authentication domain check:
  - Email domain in allowed_domains? → access granted, REQUESTER role assigned automatically
  - No domain match + valid invite token? → access granted, role from invite
  - No domain match + no invite → pending TENANT_ADMIN approval
```

No anonymous submission. No QR-specific code path. The submission URL is a standard protected route. This auth flow handles all entry points uniformly.

### SSO — Deferred to Post-v1, Schema Future-Proofed Now

SSO (OAuth 2.0 / OIDC — Microsoft Entra ID, Google Workspace) is explicitly deferred. Enterprise GC clients will require SSO before broad workforce adoption — this is a known requirement for second-tenant onboarding.

**Schema is future-proofed now:**
- `users.password_hash` is **nullable** — SSO users have no local password
- `users.auth_method` column: `LOCAL | SSO` — set at registration, never changed
- Session issuance logic lives behind a single interface so swapping the credential mechanism does not ripple into application or domain layers

**When SSO is implemented:**
- Login flow gains a branch: does this tenant use SSO? → redirect to IdP → callback → session issued
- Domain/role/scoping logic is identical after session issuance
- MFA is handled by the IdP in SSO mode — not by this application
- Per-tenant IdP configuration will require a future admin surface

### Auth Routes (v1)

- `POST /api/auth/login` — email + password, issues session cookie
- `POST /api/auth/register` — self-registration (domain-validated or invite-token)
- `POST /api/auth/logout` — clears session cookie
- `GET /api/auth/invite/:token` — validate invite token before registration form
- All other routes require a valid session

---

## 9. Crew Model

### Project-Level Roster

Each project has a crew roster managed by the `SURVEY_LEAD`. The roster defines which Instrument Men belong to which Party Chief.

- One Party Chief may have multiple Instrument Men
- An Instrument Man is assigned to exactly one Party Chief per project
- Survey Lead may reassign an Instrument Man to a different Party Chief — audit logged as `crew.roster_changed`
- **Roster management UI/admin surface: parked — revisit before Phase 3**

### Ticket Assignment

Survey Lead assigns tickets:
1. **Party Chief** — required. One Party Chief per ticket.
2. **Instrument Man** — optional. Survey Lead may explicitly assign any Instrument Man in the project — not constrained to the assigned Party Chief's roster.

### Visibility Follows Assignment

- `PARTY_CHIEF` sees all tickets where they are `assigned_party_chief_id`
- `INSTRUMENT_MAN` sees all tickets where their Party Chief is assigned + any tickets where they are `assigned_instrument_man_id`

---

## 10. Production Load Balancing — Help Flag System

Field crews are often assigned across multiple projects and can fall behind on production. This system provides a structured, two-level signal mechanism for surfacing overload conditions and enabling voluntary or directed reassignment — without requiring Survey Lead intervention for every rebalancing event.

### Two-Level Escalation Model

**Level 1 — Crew Help Flag** (internal to Party Chief's crew)

- **Raised by:** `INSTRUMENT_MAN` on their own workload
- **Visible to:** their assigned Party Chief + all Instrument Men under that same Party Chief
- **Does not surface** to other Party Chiefs or Survey Lead unless escalated
- **Cleared:** automatically when the flagging Instrument Man's tickets are reassigned, or manually by the raiser
- **Escalation path:** Party Chief may escalate a specific crew member's Level 1 flag to Level 2

**Level 2 — Party Chief Help Flag** (department-wide)

- **Raised by:** Party Chief — self-initiated, or by escalating a crew member's Level 1 flag
- **Visible to:** Survey Lead + all Party Chiefs on the project
- **Actions available once raised:**
  - Survey Lead may reassign any of the flagged Party Chief's tickets to another Party Chief
  - Another Party Chief may voluntarily claim a ticket directly — no Survey Lead approval required; Survey Lead is notified automatically
- **Cleared:** automatically when all affected tickets are reassigned, or manually by the raiser

### Voluntary Pickup (v1 Default)

When a Level 2 flag is active, any other Party Chief on the project may claim a flagged ticket and assign it to one of their own crews. This does not require Survey Lead approval. The Survey Lead receives a notification that the pickup occurred.

> **TODO (post-v1):** per-project configuration for whether voluntary pickup requires Survey Lead approval before the reassignment completes.

### Requester Notification on Reassignment

Whenever a ticket's assigned Party Chief or crew changes — whether driven by a help flag, direct Survey Lead reassignment, or voluntary pickup — the original requester is notified of the new Party Chief as their point of contact. This applies to all reassignment paths.

---

## 11. Error Handling

Fail fast. No silent failures. No fallback branches.

| Error Type | When to Use |
|---|---|
| `ValidationError` | Bad input at trust boundary |
| `UnauthorizedError` | Not authenticated |
| `ForbiddenError` | Authenticated but lacks permission |
| `NotFoundError` | Resource doesn't exist (within tenant scope) |
| `ConflictError` | Invalid state transition or concurrency issue |
| `InternalError` | Unexpected failure |

All errors return a consistent JSON shape:
```json
{ "error": { "type": "ConflictError", "message": "Cannot approve a ticket in DRAFT status" } }
```

---

## 12. Audit Logging

Log at every meaningful state transition. Structured format only.

```json
{ "event": "ticket.approved", "ticketId": "...", "tenantId": "...", "actorId": "...", "timestamp": "..." }
```

**Required audit events:**

*Ticket lifecycle*
- `ticket.created`, `ticket.submitted`, `ticket.approved`, `ticket.rejected`
- `ticket.rejection_overridden` (REJECTED → APPROVED, actor and reason recorded)
- `ticket.assigned`, `ticket.unassigned`
- `ticket.in_progress`, `ticket.completed`, `ticket.closed`
- `ticket.cancel_requested`, `ticket.cancel_approved`, `ticket.cancel_rejected`
- `ticket.voluntarily_claimed` (claiming Party Chief, original Party Chief, Survey Lead notified)

*Priority*
- `ticket.priority_set_by_whitelist` (at submission when requester email matches whitelist)
- `ticket.priority_elevated` (SURVEY_LEAD or APPROVER manual elevation, reason required)

*CAD sub-track*
- `cad.status_changed` (any cad_status transition, actor recorded)
- `cad.qa_signed_off` (CAD_LEAD signs off, cad_reviewed_by and cad_completed_at stamped)

*Attachments*
- `attachment.uploaded`, `attachment.downloaded`

*User and access management*
- `user.role_changed`
- `user.self_registered` (domain recorded in payload)
- `whitelist.entry_added`, `whitelist.entry_removed`
- `domain.added`, `domain.removed`
- `invite.sent`, `invite.accepted`, `invite.expired`

*Crew*
- `crew.roster_changed` (Survey Lead reassigns Instrument Man to different Party Chief)

*Help flags*
- `help_flag.raised` (level, raised_by, project recorded)
- `help_flag.escalated` (Level 1 → Level 2, escalated_by, original flag id recorded)
- `help_flag.cleared` (cleared_reason, reassignment id recorded if applicable)

Do not log attachment content, passwords, or tokens.

---

## 13. API Conventions

- REST endpoints, explicit and stable
- Commands (mutate) and Queries (read) are clearly separated
- All responses are JSON
- All list endpoints are paginated
- Input validation at HTTP handler only — do not re-validate in deeper layers
- Tenant scoping applied automatically in data access layer

---

## 14. Key Differentiators (Never Deprioritize These)

1. **Field-First Authenticated Submission** — the submission URL is a standard protected route. Field workers with a company email domain self-register in seconds via domain validation. Subcontractors and external users are onboarded via invite. No anonymous submission. No IT provisioning required for company email holders.
2. **Field-First Mobile UI** — build mobile before desktop. If it works in the field, it works everywhere.
3. **As-Built Traceability** — every ticket captures who requested, who executed, what revision of drawings was active, and when. This answers legal and audit questions after the fact.
4. **Company Attribution** — subcontractor requests are attributed to their company, not just a person. Non-negotiable for accountability.
5. **48-Hour Rule Enforcement** — the system enforces the notice period, creating a paper trail of compliance or violation.
6. **Rejection Paper Trail** — verbal negotiation outcomes are captured as written rejection reasons. The system does not model the negotiation but it captures the result.
7. **Production Load Balancing** — the help flag system enables field crews to signal overload and self-organize reassignment with Survey Lead visibility, keeping field operations moving without bottlenecking through a single coordinator.

---

## 15. What is Explicitly Deferred (Do Not Build in v1)

- SSO / SCIM (schema is future-proofed; implementation is not v1)
- Custom workflow builder
- Configurable states or roles
- Cross-project or cross-tenant analytics
- SLA enforcement engine
- In-browser DWG viewer
- External integrations (Procore, Autodesk, Teams, Primavera)
- Multi-step conditional approval trees
- Admin configuration panels
- Dig permit dependency/sequencing model
- Scheduling model beyond basic assignment
- Crew roster management UI (parked — needed before Phase 3)
- Per-project voluntary pickup approval configuration (parked — post-v1)
- Redis caching layer (add only if measurable cache pressure emerges)

If a task touches any of the above, stop and confirm with the project owner before proceeding.

---

## 16. Development Rules

- Make the smallest possible diff that solves the issue
- Do not refactor nearby code unless it blocks the fix
- No fallback branches — one correct path
- No backup flows or shadow writes
- Prefer TypeScript types over runtime defensive checks
- Runtime validation only at trust boundaries (HTTP handlers, job ingestion)
- Every new bug fix requires a regression test

### Testing Requirements for Any Workflow Change
- Happy path
- Invalid state transition
- Unauthorized actor
- Tenant isolation
- Visibility scoping (correct role sees correct tickets, nothing more)

---

## 17. Performance Targets

- Design target: 1,000–50,000 tickets per project
- Low-latency operational dashboards (sub-second for paginated list views)
- Mitigation: proper indexing, paginated API responses, pre-aggregated daily rollups if needed
- Do not optimize prematurely — measure first

### Success Criteria (v1)

- Multi-tenant isolation is airtight
- Both workflow variants operate deterministically
- Audit trail is complete and immutable
- Operational reports are accurate and performant
- System handles 10,000+ tickets in a project without degradation

---

## 18. Build Phases (Reference)

| Phase | Focus | Status |
|---|---|---|
| 0 | Stack, hosting, first tenant decisions | ✅ Complete |
| 1 | Data model + core backend | ✅ Complete |
| 2 | Workflow variants, end-to-end via API | 🔄 In Progress |
| 3 | Field-first mobile UI + public request submission | Pending |
| 4 | Traceability, reporting, audit surfaces | Pending |
| 5 | Integrations, scheduling, manpower data | Pending |

---

## 19. Local Development Setup (Sandbox — Zero Cloud Cost)

All development runs locally. No Railway deployment until staging is needed.

```bash
# Prerequisites
node >= 20
postgresql (local install or Docker)
pnpm

# Start local DB
docker run --name survey-db -e POSTGRES_PASSWORD=localdev -p 5432:5432 -d postgres

# Environment
cp .env.example .env
# Set DATABASE_URL=postgresql://postgres:localdev@localhost:5432/survey_dev

# Install and run
pnpm install
pnpm dev
```

Railway is used only for staging/demo. Production deployment follows only when a real tenant is actively onboarding.

---

*Last updated: Phase 2 in progress. Changelog: QR codes removed; SSO deferred, schema future-proofed; visibility model formalized (Full/Partial/General); GC user isolation clarified; AREA_VIEWER added for ACM; crew model defined; ticket_type added; CAD visibility broadened; help flag system added (Section 10); cad_status fields added to tickets table; CLOSED terminal state added to both workflow variants; BILLING_VIEWER visibility clarified; help flag audit events merged into Section 12; help_flags table and indexes added to Section 5; Redis explicitly deferred; background worker noted in tech stack; performance targets and success criteria added (Section 17); roles section marked fluid; Phase 2 status corrected to In Progress.*