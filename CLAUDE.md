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
| Auth | Email + password (bcrypt) | Simplest secure option for v1 |
| File Storage | Railway volume or S3-compatible | Attachments stored outside DB |

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
| Tenancy | Tenants, projects, companies, role assignments |
| Ticket | Ticket creation, state machine, assignment, cancellation |
| Workflow | Fixed state transition enforcement, variant selection |
| Attachment | File metadata, upload URLs, access control |
| Notification | Email dispatch (async) |
| Reporting | Aggregated queries, daily summaries |
| Audit | Append-only event log, state change tracking |

Modules communicate via the application service layer only. No direct cross-module table access.

---

## 4. Domain Context (Read This Carefully)

### Who Uses This

- **General Contractor (GC)** — primary tenant owner, manages projects
- **Subcontractors** — submit requests under their company name
- **Survey crew** — Party Chief, Instrument Man — execute field work
- **Survey Lead** — assigns crew, manages scheduling
- **Approvers** — review and approve/reject requests
- **Project controls / PM** — use request data for schedule validation and manpower tracking
- **Engineering / CAD Technicians** — use request data to ensure linework and other survey files are ready for deployment.

### How Work is Organized

- Projects are organized by **Unit/System** (e.g., Unit 1, Unit 2, Cooling Tower, Pipe Rack)
- Each Unit contains **Subareas**
- Area → Subarea is structured data, never free text

### The 48-Hour Rule

Workflow Variant 1 (Standard Approval) enforces a **minimum 48-hour notice** between submission and requested execution date. This is a hard business rule encoded in the domain layer, not a configuration setting.

**Priority Flag — Two Paths Only. No submission field. No self-service.**

Priority is an internal operational flag. Requesters cannot set it. It is assigned by the system or by authorized personnel only. If every ticket is priority, no ticket is priority.

**Path A — Whitelist (Automatic)**
A project-level whitelist of senior management email addresses, maintained exclusively by `TENANT_ADMIN`. When a whitelisted user submits a ticket, the system automatically sets `is_priority = true` on the ticket at submission. The 48-hour rule still applies — priority does not bypass the approval workflow. It signals to the Approver that this request carries executive weight. No user action required. No field shown at submission.

**Path B — Manual Elevation (Post-Submission)**
After a ticket is submitted, only a `SURVEY_LEAD` or `APPROVER` may elevate it to priority. This happens after the requester contacts them directly (phone call, in-person). The elevation requires a written reason and is logged as a `ticket.priority_elevated` audit event recording who elevated it, when, and why. The requester is not notified — this is an internal operational action.

**Whitelist Management**
- Stored in a `priority_whitelist` table scoped to `tenant_id` and `project_id`
- `TENANT_ADMIN` is the only role that can add or remove entries
- Changes are audit logged as `whitelist.entry_added` / `whitelist.entry_removed`

### Subcontractor Isolation

Subcontractor users can only see requests submitted by their own company. They cannot see requests from other subcontractors. This is enforced at the data access layer.

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
  id, tenant_id, company_id, email, password_hash, name, created_at

project_memberships
  id, project_id, user_id, role, created_at

priority_whitelist
  id, tenant_id, project_id, email, added_by (user_id), created_at
  — TENANT_ADMIN only may insert/delete rows
  — checked at ticket submission against requester email

areas
  id, project_id, tenant_id, name (Unit/System label), code (short slug e.g. "U1"), created_at

subareas
  id, area_id, project_id, tenant_id, name, created_at

tickets
  id (UUID), tenant_id, project_id, area_id, subarea_id, company_id
  ticket_number (human-readable, e.g. FSS-U1-00247 — project-scoped sequential, immutable)
  requester_id, assigned_crew_id, survey_lead_id
  workflow_variant (STANDARD_APPROVAL | DIRECT_ASSIGNMENT)
  status, craft, description
  requested_date, submitted_at, approved_at, assigned_at, completed_at
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
```

### Indexes Required

```sql
(tenant_id, project_id, status)
(tenant_id, project_id, assigned_crew_id)
(tenant_id, project_id, created_at)
(tenant_id, company_id)
```

### Rules

- Every domain table includes `tenant_id`
- Every query that returns domain data must be scoped by `tenant_id`
- `ticket_events` is append-only — no updates, no deletes, ever
- Attachments are stored in object storage; DB stores metadata and storage key only

---

## 6. Workflow State Machines

### Variant 1 — Standard Approval

```
DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED
                  ↘ REJECTED
ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED
                                        → CANCEL_REJECTED
```

- 48-hour minimum notice enforced at SUBMITTED transition
- REJECTED requires rejection_reason before transition completes
- Cancellation requires Approver or Survey Lead sign-off

### Variant 2 — Direct Assignment

```
CREATED → ASSIGNED → IN_PROGRESS → COMPLETED
ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED
                                        → CANCEL_REJECTED
```

- No approval gate
- Auto-proceeds to ASSIGNED immediately

### Transition Rules

- All transitions validated in a single central function in the Workflow module
- Invalid transitions throw a `ConflictError` immediately
- No silent state changes anywhere

### Permitted Non-Standard Transition

`REJECTED → APPROVED` is a permitted transition, available to `APPROVER` role only. This covers the case where a requester contacts an Approver directly after rejection (referencing their ticket number) and the Approver determines the request should proceed. The transition is logged as a `ticket.rejection_overridden` audit event with the actor recorded. A written reason is required before the transition completes.

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
- Resubmissions after rejection receive a **new number** but carry `parent_ticket_id` linking back to the original
- The ticket number is what users reference in conversations, emails, and on site

---

## 7. Roles (Fixed — Not Configurable in v1)

### Tenant-Level
- `TENANT_ADMIN` — full tenant management
- `BILLING_VIEWER` — read-only billing/admin access

### Project-Level
- `REQUESTER` — submit and track own requests
- `APPROVER` — approve, reject, cancel sign-off
- `SURVEY_LEAD` — assign crew, manage scheduling
- `PARTY_CHIEF` — execute assigned work
- `INSTRUMENT_MAN` — execute assigned work
- `VIEWER` — read-only project access

RBAC is enforced at the **application/use-case layer**, not just the route.

---

## 8. Error Handling

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

## 9. Audit Logging

Log at every meaningful state transition. Structured format only.

```json
{ "event": "ticket.approved", "ticketId": "...", "tenantId": "...", "actorId": "...", "timestamp": "..." }
```

**Required audit events:**
- `ticket.created`, `ticket.submitted`, `ticket.approved`, `ticket.rejected`
- `ticket.rejection_overridden` (REJECTED → APPROVED transition, actor and reason recorded)
- `ticket.priority_set_by_whitelist` (logged at submission when requester email matches whitelist)
- `ticket.priority_elevated` (logged when SURVEY_LEAD or APPROVER manually elevates, reason required)
- `ticket.assigned`, `ticket.unassigned`
- `ticket.in_progress`, `ticket.completed`
- `ticket.cancel_requested`, `ticket.cancel_approved`, `ticket.cancel_rejected`
- `attachment.uploaded`, `attachment.downloaded`
- `user.role_changed`
- `whitelist.entry_added`, `whitelist.entry_removed` (TENANT_ADMIN actions on priority whitelist)

Do not log attachment content, passwords, or tokens.

---

## 10. API Conventions

- REST endpoints, explicit and stable
- Commands (mutate) and Queries (read) are clearly separated
- All responses are JSON
- All list endpoints are paginated
- Input validation at HTTP handler only — do not re-validate in deeper layers

### Auth
- Session-based or JWT — decide before Phase 1 and do not change
- All routes except login/register require authentication
- Tenant scoping applied automatically in data access layer

---

## 11. Key Differentiators (Never Deprioritize These)

These are what make this product valuable in the construction space. They are not features to add later — they shape architectural decisions now.

1. **QR Scan to Create Request** — field workers submit via phone camera. No account setup friction for basic submission. This is a Phase 3 priority.
2. **Field-First Mobile UI** — build mobile before desktop. If it works in the field, it works everywhere.
3. **As-Built Traceability** — every ticket captures who requested, who executed, what revision of drawings was active, and when. This answers legal and audit questions after the fact.
4. **Company Attribution** — subcontractor requests are attributed to their company, not just a person. Non-negotiable for accountability.
5. **48-Hour Rule Enforcement** — the system enforces the notice period, creating a paper trail of compliance or violation.
6. **Rejection Paper Trail** — verbal negotiation outcomes are captured as written rejection reasons. The system does not model the negotiation but it captures the result.

---

## 12. What is Explicitly Deferred (Do Not Build in v1)

- Custom workflow builder
- Configurable states or roles
- SSO / SCIM
- Cross-project or cross-tenant analytics
- SLA enforcement engine
- In-browser DWG viewer
- External integrations (Procore, Autodesk, Teams, Primavera)
- Multi-step conditional approval trees
- Admin configuration panels
- Dig permit dependency/sequencing model
- Scheduling model beyond basic assignment

If a task touches any of the above, stop and confirm with the project owner before proceeding.

---

## 13. Development Rules

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

---

## 14. Build Phases (Reference)

| Phase | Focus | Status |
|---|---|---|
| 0 | Stack, hosting, first tenant decisions | ✅ Complete |
| 1 | Data model + core backend | 🔜 Next |
| 2 | Workflow variants, end-to-end via API | Pending |
| 3 | Field-first mobile UI + QR scan | Pending |
| 4 | Traceability, reporting, audit surfaces | Pending |
| 5 | Integrations, scheduling, manpower data | Pending |

---

## 15. Local Development Setup (Sandbox — Zero Cloud Cost)

All development runs locally. No Railway deployment until staging is needed.

```bash
# Prerequisites
node >= 20
postgresql (local install or Docker)
npm or pnpm

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

*Last updated: Phase 0 complete — priority system, ticket numbering, and rejection override finalized. Next: Phase 1 — Data model and core backend.*