# Field Survey Support Ticketing Platform
## Project Vision & Architecture — v2 (Living Document)

> This document supersedes the original PDF vision document (v1).
> CLAUDE.md is the implementation source of truth. This document provides the product/business narrative.
> When the two conflict, CLAUDE.md wins.

---

## Executive Vision

### Purpose

Build a multi-tenant, enterprise-capable ticketing platform specifically designed for Field Survey Support operations on construction projects.

The platform will replace email, spreadsheets, and ad hoc communication with structured intake, assignment, and execution workflows — creating defensible audit trails and delivering operational insight by project, area, and survey crew.

This is the system-of-record for survey support activity on industrial construction sites.

### Product Philosophy (Guardrails)

- Workflows are opinionated and fixed in v1
- State transitions are deterministic
- Reporting is operational, not BI-grade
- Multi-tenancy isolation is non-negotiable
- Architecture must support enterprise evolution without premature complexity
- Anything outside these principles is locked behind future phases

---

## Core Problem Statement

Construction projects generate high volumes of survey-related requests that must be approved before execution, assigned to field crews, produce verifiable completion artifacts, and remain traceable for legal and audit defensibility.

Existing systems (email, Excel, generic ticket tools) lack domain alignment (areas, crafts, survey crew hierarchy), proper audit history, field-oriented assignment dashboards, structured cancellation controls, and production load visibility.

---

## v1 Scope

### Multi-Tenant Model

- Each Tenant may contain multiple Projects
- Each Project contains tickets, users, AOR nodes, discipline groups, and crew rosters
- Tenants are strictly isolated — no cross-tenant visibility

### User Roles

Roles are fixed for v1 implementation but the role model is intentionally extensible. See CLAUDE.md Section 7 for the full role list and Section 7A for the visibility model.

**Tenant-level:**

| Role | Description |
|---|---|
| `TENANT_ADMIN` | Full tenant management — users, projects, domains, whitelists, discipline title defaults. Read access to all projects within tenant. |
| `BILLING_VIEWER` | Read-only billing and admin access. No ticket visibility. |

**Project-level:**

| Role | Description |
|---|---|
| `PROJECT_ADMIN` | Project-level configuration: AOR tree, discipline groups, title mappings, priority defaults, memberships, whitelists. No ticket approval authority. |
| `APPROVER` | Approve, reject, override-reject, sign off on Path C pre-field cancellations, manual priority elevation. |
| `SURVEY_MANAGER` | Project-wide survey authority. Assigns Superintendents to AORs. Manages crew rosters. Manual priority elevation and downgrade. Reassigns tickets. Escalates help flags. Initiates or approves all cancellation paths. |
| `SURVEY_SUPERINTENDENT` | AOR-scoped survey admin. Assigned by Survey Manager. Assigns Party Chiefs within their AOR. Approves field status changes when Party Chief is unavailable. Initiates or approves cancellation paths within their AOR. |
| `PARTY_CHIEF` | Executes assigned work. Approves Instrument Man field status submissions (PENDING_PC_APPROVAL). Raises Level 2 help flags. Voluntarily claims flagged tickets. Initiates Path C cancellations (requires Superintendent or Survey Manager approval). |
| `INSTRUMENT_MAN` | Executes assigned work. Marks field statuses. Raises Level 1 help flags. Initiates field cancellations (Path B). |
| `CAD_LEAD` | QA sign-off on CAD sub-track — sees all tickets across all types and AORs. |
| `CAD_TECHNICIAN` | CAD support work — sees all tickets across all types and AORs. |
| `DISCIPLINE_MANAGER` | Site-wide read access for their assigned discipline group only. No approval authority. |
| `DISCIPLINE_LEAD` | AOR-scoped read access for their assigned discipline group only. |
| `REQUESTER` | Submit and track own requests only. All field titles that do not have an elevated role are REQUESTER. Title drives priority default and discipline tagging — not role. |
| `VIEWER` | Full project read-only access — all tickets, all AORs. |
| `AREA_VIEWER` | Read-only access scoped to assigned AOR node(s) and descendants. Used for Area Construction Manager. |
| `SUBCONTRACTS_COORDINATOR` | Internal GC role. Read access to all subcontractor company tickets across the project. No approval authority. |

### Authentication

- Email/password (bcrypt) for v1
- Self-registration via company email domain matching (`allowed_domains` table)
- Invite-based onboarding for external parties without a matching domain
- SSO (Microsoft Entra ID, Google Workspace) deferred to post-v1 — schema is future-proofed

### Access Flow

All entry points — including the request submission URL — go through standard authentication. No anonymous submission. No QR-specific logic. The URL itself is the access point; auth handles the rest.

---

## Workflow Variants (v1 — Strictly Limited)

Only two workflow variants exist in v1. No dynamic workflow builder. No custom state creation.

### Complete Status Enum

```
DRAFT
SUBMITTED
APPROVED
REJECTED
ASSIGNED
IN_PROGRESS
PENDING_PC_APPROVAL
DELAYED
COMPLETED
REQUESTER_CANCELED
FIELD_CANCELED
SURVEY_CANCELED
```

`COMPLETED` is the terminal success state. `REQUESTER_CANCELED`, `FIELD_CANCELED`, and `SURVEY_CANCELED` are the three terminal cancellation states. There is no `CLOSED` state.

### Variant 1 — Standard Approval

Used for planned survey work requiring review before field execution.

```
DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → PENDING_PC_APPROVAL → COMPLETED
                  ↘ REJECTED

PENDING_PC_APPROVAL → COMPLETED       (Party Chief approves)
                    → IN_PROGRESS      (Party Chief rejects — reverts; reason optional)
                    → DELAYED          (Party Chief approves delayed status)
                    → FIELD_CANCELED   (Path B — first responder approves)

DELAYED → IN_PROGRESS                 (Party Chief or above restarts when blocker clears)
DELAYED → PENDING_PC_APPROVAL         (field cancel initiated from delayed state)

Any active status → REQUESTER_CANCELED  (Path A — requester, immediate, no approval)
Any active status → SURVEY_CANCELED     (Path C — survey-side, approval chain applies)
```

- 48-hour minimum notice enforced at SUBMITTED transition — hard business rule, not configurable
- REJECTED requires written rejection reason before transition completes
- Resubmission after rejection creates a new ticket linked via `parent_ticket_id`
- `REJECTED → APPROVED` override available to `APPROVER` only, with written reason

### Variant 2 — Direct Assignment

Used for urgent or pre-authorized work.

```
CREATED → ASSIGNED → IN_PROGRESS → PENDING_PC_APPROVAL → COMPLETED

PENDING_PC_APPROVAL → COMPLETED       (Party Chief approves)
                    → IN_PROGRESS      (Party Chief rejects — reverts; reason optional)
                    → DELAYED          (Party Chief approves delayed status)
                    → FIELD_CANCELED   (Path B — first responder approves)

DELAYED → IN_PROGRESS                 (Party Chief or above restarts)
DELAYED → PENDING_PC_APPROVAL         (field cancel initiated from delayed state)

Any active status → REQUESTER_CANCELED  (Path A — requester, immediate)
Any active status → SURVEY_CANCELED     (Path C — survey-side, approval chain applies)
```

- No approval gate — auto-proceeds to ASSIGNED immediately
- Survey Manager or Survey Superintendent assigns crew immediately

### Cancellation — Four Distinct Paths

Cancellations are permanent. All paths produce an immutable audit event. There is no un-cancel.

**Path A — Requester-Initiated:** Requester cancels immediately, no approval required. Valid from any active status. Result: `REQUESTER_CANCELED`. Survey team notified.

**Path B — Field-Initiated:** Instrument Man on site; work cannot proceed. IM initiates → ticket enters `PENDING_PC_APPROVAL` → first of (assigned Party Chief, their Superintendent, Survey Manager) to act approves. Result: `FIELD_CANCELED`. Valid from `IN_PROGRESS` or `DELAYED` only.

**Path C — Survey-Side Initiated:** Survey-side knowledge (RFI, scope change, stop-work) requires pulling the ticket. Written reason required. Approval chain: Party Chief initiates → Superintendent or Survey Manager approves; Superintendent initiates → Survey Manager approves; Survey Manager initiates → immediate. If ticket is `IN_PROGRESS`, Instrument Man is notified to stop work. Result: `SURVEY_CANCELED`.

**Path D — Pre-work (RETIRED):** The former `CANCEL_REQUESTED → CANCEL_APPROVED/REJECTED` path is retired. `CANCEL_REQUESTED` state is removed from the enum. Path A covers requester-side cancellation; Path C covers survey-side pre-field cancellation.

---

## Ticket Requirements

### Fields

Each ticket captures:

- **Identifiers:** UUID (internal, API use only), human-readable ticket number (`FSS-[NODE_CODE]-[SEQUENCE]`, e.g. `FSS-U1-00247`, immutable)
- **Classification:** Project, AOR node, Ticket Type, Discipline Group, Workflow Variant
- **Ticket Types:** `LAYOUT`, `CHECK_OUT`, `AS_BUILT`, `TOPO`, `PERMIT`
- **People:** Requester, Assigned Party Chief, Assigned Instrument Man (optional), Survey Superintendent (AOR-responsible), Survey Manager
- **Priority:** `HIGH`, `MED_HIGH`, `MEDIUM`, `NORMAL` — system-set at submission from submitter title; adjustable post-submission by authorized personnel only (see Priority System)
- **Status:** one of the enum values defined above
- **CAD sub-track:** `cad_status`, `cad_assigned_to`, `cad_reviewed_by`, `cad_completed_at`
- **Timestamps:** `requested_date`, `submitted_at`, `approved_at`, `assigned_at`, `started_at`, `completed_at`, `canceled_at`
- **Cancellation fields:** `cancel_reason`, `cancel_initiated_by`, `cancel_approved_by`
- **Rejection:** `rejection_reason` (required when status → REJECTED)
- **Lineage:** `parent_ticket_id` (set on resubmission after rejection; resubmissions get a new ticket number)
- **Attachments:** `.dwg`, `.dxf`, `.csv`, photos — stored in object storage; DB holds metadata and storage key
- **Comment thread** and **immutable event history**

### Ticket Numbering

Human-readable numbers follow `FSS-[NODE_CODE]-[ZERO_PADDED_SEQUENCE]`. The node code is the `code` slug from `aor_nodes` for the node the ticket is filed against. Sequence is project-scoped and increments on every creation. Assigned at creation and immutable — rejected and canceled tickets keep their number permanently. Resubmissions receive a new number.

### Attachment Permissions

Requesters may attach files to their own tickets at any point while the ticket is active (any status except COMPLETED and any `*_CANCELED` state). Attachment upload is not restricted to submission time only. Logged as `attachment.uploaded` with ticket status at time of upload captured in the audit payload.

---

## How Work is Organized — AOR (Area of Responsibility)

AOR is an arbitrary-depth tree defined per project by Project Admin. The depth and level labels are configured per project — there is no fixed two-level structure.

Examples:
- Project A: `GENERAL AREA → UNIT → CWA → IWP` (4 levels)
- Project B: `UNIT → CWA` (2 levels)
- Project C: `OSBL → CWA`, `ISBL → CWA`, `FLARE UNIT → CWA` (branching at depth 0)

AOR nodes are structured data — never free text. Tickets reference a single AOR node (leaf preferred, but any level is valid). AOR-scoped roles see all tickets at their assigned node and all descendant nodes.

---

## Priority System

Priority is an internal operational signal — requesters cannot set it directly.

### Four Priority Levels

| Level | Who it applies to |
|---|---|
| `HIGH` | Project Executives, Survey Manager, Area Construction Manager |
| `MED_HIGH` | Discipline Manager, Discipline Lead, Survey Superintendent |
| `MEDIUM` | Party Chief, Instrument Man, Craft Superintendent |
| `NORMAL` | Subcontractors, General Foreman, unclassified requesters |

### Setting Priority

**At submission:** determined automatically from the submitter's title as configured in `discipline_titles.default_priority`. If no title is assigned, defaults to `NORMAL`.

**Priority whitelist:** A project-level whitelist of email addresses maintained by `TENANT_ADMIN`. Any whitelisted user's submission auto-sets priority to `HIGH` regardless of their title's default.

**Post-submission adjustments:**
- `SURVEY_MANAGER` or `APPROVER` may elevate any ticket's priority. Written reason required. Logged as `ticket.priority_elevated`.
- `SURVEY_MANAGER` may lower any ticket's priority. Lowering a `HIGH` ticket requires a confirmation prompt before the change applies. Logged as `ticket.priority_downgrade_confirmed` with reason.
- `PROJECT_ADMIN` or `TENANT_ADMIN` may adjust the default priority for any title in `discipline_titles`.

Priority does not bypass the approval workflow. It signals operational weight to the Approver and Survey team.

---

## Discipline Groups and Title Mapping

Each project has discipline groups defined by Project Admin (e.g., Engineering, QA/QC, Safety, Controls). Each group contains one or more titles (e.g., "Civil Engineer", "QA/QC Inspector"). Titles carry a default priority level.

Users are assigned a title by Account Admin or Project Admin. When a user submits a ticket, the system auto-tags the ticket with their discipline group. If a user has no title assigned at submission time, they select their discipline manually.

Discipline-scoped roles (`DISCIPLINE_MANAGER`, `DISCIPLINE_LEAD`, `REQUESTER` in a discipline group) see only tickets tagged with their own discipline group.

---

## Crew Hierarchy

```
Survey Manager (project-wide)
  └── Survey Superintendent(s) (AOR-scoped, assigned by Survey Manager)
        └── Party Chief(s) (AOR-scoped, assigned by Superintendent)
              └── Instrument Man/Men (assigned to Party Chief per project)
```

- One Party Chief may have multiple Instrument Men
- An Instrument Man is assigned to exactly one Party Chief per project
- Roster reassignments are audit logged as `crew.roster_changed`

---

## Production Load Balancing — Help Flag System

Field crews can fall behind on production. A two-level help flag system enables overload signaling and self-organized reassignment.

**Level 1 — Crew Help Flag** (internal to Party Chief's crew):
- Raised by: `INSTRUMENT_MAN` on their own workload
- Visible to: their assigned Party Chief and all Instrument Men under that Party Chief only
- Does not surface to other Party Chiefs, Superintendents, or Survey Manager unless escalated
- Party Chief may escalate a Level 1 to Level 2

**Level 2 — Party Chief Help Flag** (department-wide):
- Raised by: Party Chief (self-initiated or by escalating a crew Level 1)
- Visible to: Survey Manager, all Survey Superintendents, and all Party Chiefs on the project
- Any Party Chief may voluntarily claim a Level 2 flagged ticket directly — no approval required; Survey Manager notified automatically
- Survey Manager or Superintendent may also directly reassign affected tickets

Requester is notified whenever their ticket's assigned Party Chief changes, regardless of what drove the reassignment.

---

## Visibility Model

Enforced at the data access layer — not in UI logic.

### Full Visibility — all tickets across all AORs and disciplines

| Role | Scope |
|---|---|
| `TENANT_ADMIN` | All projects within tenant (read) |
| `SURVEY_MANAGER` | All tickets within their project |
| `APPROVER` | All tickets within their project |
| `CAD_LEAD` | All tickets within their project (all types) |
| `CAD_TECHNICIAN` | All tickets within their project (all types) |
| `VIEWER` | All tickets within their project (read-only) |

CAD staff see all ticket types regardless of whether a CAD task is currently attached — intentional, so CAD can anticipate data needs proactively.

`BILLING_VIEWER` has no ticket visibility. `PROJECT_ADMIN` has project configuration access but no inherent ticket visibility unless also assigned a ticket-visible role.

### Partial Visibility — scoped by AOR, assignment, or discipline

| Role | Sees |
|---|---|
| `SURVEY_SUPERINTENDENT` | All tickets within their assigned AOR node(s) and all descendant nodes |
| `AREA_VIEWER` | All tickets within their assigned AOR node(s) and all descendant nodes (read-only) |
| `DISCIPLINE_MANAGER` | All tickets tagged with their discipline group, project-wide |
| `DISCIPLINE_LEAD` | All tickets tagged with their discipline group, within their assigned AOR node(s) and descendants |
| `SUBCONTRACTS_COORDINATOR` | All tickets where `company.type = SUBCONTRACTOR`, project-wide |
| `PARTY_CHIEF` | All tickets where `assigned_party_chief_id = their user_id` + Level 2 help flags from other Party Chiefs |
| `INSTRUMENT_MAN` | All tickets where their Party Chief is assigned + tickets where they are `assigned_instrument_man_id` + Level 1 flags within their crew |

### General Visibility — own submissions only

| Role | Sees |
|---|---|
| `REQUESTER` | Only tickets where `requester_id = their user_id` |

This applies to all requesters regardless of company or title. Title and company affiliation do not grant broader visibility beyond what the role permits.

### Subcontractor Isolation

Subcontractor users are additionally filtered to tickets submitted by their own `company_id`. This is a second filter applied on top of role scoping, always enforced at the data access layer.

---

## Reporting (Operational Only)

v1 includes: Open vs Closed by Project, Requests by Area, Requests by Craft, Crew workload, Daily summary report per project.

v1 does NOT include: Custom report builders, cross-tenant analytics, predictive modeling, SLA enforcement engine.

---

## Security & Isolation

- Authentication: email/password (v1), SSO future-proofed
- Authorization: RBAC enforced at application/use-case layer
- All queries scoped by `tenant_id`
- TLS in transit, encrypted storage at rest
- Object storage for attachments with size/type validation
- Append-only audit event log per ticket

---

## Architecture

Single deployable modular monolith. No microservices in v1.

**Components:** Next.js frontend, REST API, Node.js + TypeScript application core, PostgreSQL, Object storage (attachments), In-process background worker (notifications, daily reports, attachment validation).

Redis is explicitly omitted from v1.

**Module boundaries:** Identity, Tenancy, Ticket, Workflow, Attachment, Notification, Reporting, Audit — communicating via application service layer only.

---

## Performance Targets

- Design target: 1,000–50,000 tickets per project
- Low-latency operational dashboards
- Proper indexing, paginated responses, pre-aggregated rollups if needed
- System must handle 10,000+ tickets per project without degradation

---

## Explicitly Deferred

SSO/SCIM, custom workflow builder, configurable states/roles, cross-project analytics, SLA engine, in-browser DWG viewer, Procore/Autodesk/Teams/Primavera integrations, multi-step approval trees, admin config panels, dig permit sequencing, scheduling beyond basic assignment, crew roster management UI, per-project voluntary pickup approval configuration, Redis.

---

## Build Phases

| Phase | Focus | Status |
|---|---|---|
| 0 | Stack, hosting, first tenant decisions | ✅ Complete |
| 1 | Data model + core backend | ✅ Complete |
| 2 | Workflow variants, end-to-end via API | 🔄 In Progress |
| 3 | Field-first mobile UI + public request submission | Pending |
| 4 | Traceability, reporting, audit surfaces | Pending |
| 5 | Integrations, scheduling, manpower data | Pending |

---

*v2 supersedes the original PDF. Key changes from v1: QR scan removed (standard auth handles all entry points); roles model made extensible; SURVEY_LEAD renamed to SURVEY_MANAGER; SURVEY_SUPERINTENDENT added as AOR-scoped middle tier; DISCIPLINE_MANAGER, DISCIPLINE_LEAD, SUBCONTRACTS_COORDINATOR, PROJECT_ADMIN roles added; areas/subareas replaced by AOR node tree (aor_levels + aor_nodes + aor_assignments); discipline groups and title mapping system added; REQUESTER clarified as title-agnostic catch-all for field submitters; priority system expanded from binary flag to four-tier enum (HIGH / MED_HIGH / MEDIUM / NORMAL) driven by title defaults; CLOSED state removed; cancellation paths refactored into four distinct paths (Requester, Field-Initiated, Survey-Side, retired pre-work path); PENDING_PC_APPROVAL, DELAYED, REQUESTER_CANCELED, FIELD_CANCELED, SURVEY_CANCELED states added; Party Chief approval workflow for field statuses defined; requester attachment permissions expanded to post-submission; help flag visibility updated to include SURVEY_SUPERINTENDENT; visibility model formalized and expanded; crew roster model defined.*
