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
| Tenancy | Tenants, projects, companies, role assignments, crew rosters, AOR tree, departments, acting grants, project templates |
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

**Survey Hierarchy (execute and manage field survey work)**
- **Survey Manager** — project-wide authority; assigns Superintendents to AORs; final approval authority on all cancellations and escalations
- **Survey Superintendent** — AOR-scoped survey admin; assigns Party Chiefs within their AOR; approves field status changes when Party Chief is unavailable
- **Party Chief** — executes assigned work; approves Instrument Man field status submissions; initiates survey-side cancellations (requires Superintendent or Survey Manager approval)
- **Instrument Man** — executes assigned tasks; marks field statuses; initiates field cancellations (requires Party Chief or above approval)

**Approval / Admin**
- **Survey Manager** — sole approval authority for all tickets; override-rejects; sign-off on pre-work cancellations; priority elevation and downgrade
- **Account Admin (TENANT_ADMIN)** — full tenant management across all projects; manages project templates; confirms acting grants
- **Project Admin** — project-level configuration: AOR tree, departments, title catalog, whitelists, memberships

**Department / Functional Groups (view and submit only)**
- **Department Manager** — site-wide read access for their department (e.g., Site QA/QC Manager sees all QA/QC tickets project-wide); assigns Superintendent-level titles to free agents within their department
- **Department Lead (Superintendent)** — AOR-scoped read access for their department; assigns working-level titles to team members within their department
- **Functional Group Member** — submits requests; sees own submissions only; department auto-tagged from their title

**Other Requesters**
- **General Contractor employees** — submit requests; see own submissions only
- **Subcontractors** — submit requests under their company name; see own company's submissions only
- **Area Construction Manager (AREA_VIEWER)** — read-only access scoped to their assigned AOR(s)
- **Subcontracts Coordinator** — internal GC; reads all subcontractor requests project-wide; no approval authority

**CAD**
- **CAD Lead** — QA sign-off on CAD sub-track; sees all tickets project-wide
- **CAD Technician** — CAD support work; sees all tickets project-wide

### How Work is Organized — AOR (Area of Responsibility)

AOR is the project-configured geographic and scope hierarchy. It is an **arbitrary-depth tree** defined per project by Project Admin. The depth and level labels are configured per project — there is no fixed two-level structure.

Examples:
- Project A: `GENERAL AREA → UNIT → CWA → IWP` (4 levels)
- Project B: `UNIT → CWA` (2 levels)
- Project C: `OSBL → CWA`, `ISBL → CWA`, `FLARE UNIT → CWA` (branching at depth 0)

AOR nodes are structured data — never free text. Project Admin defines the level labels and populates the node tree before tickets can be filed. Tickets reference a single AOR node (leaf preferred, but any level is valid). AOR-scoped roles see all tickets at their assigned node and all descendant nodes.

### Department Model and Title Mapping

**Replaces:** the prior `discipline_groups` / `discipline_titles` two-tier flat structure. All references to `discipline_group_id`, `discipline_groups`, `discipline_titles`, `DISCIPLINE_MANAGER`, and `DISCIPLINE_LEAD` are superseded by the department model.

Each project has departments defined by Project Admin (e.g., "Train 1 Civil", "QA/QC", "Safety", "Controls"). A department is simultaneously a discipline container, an AOR-scoped entity (assigned one or more AOR nodes — scope includes all descendants), and a personnel container. Users belong to exactly one department per project.

Each department has a title catalog (`department_titles`) — titles carry a default priority level and an `assignment_layer` (MANAGER or SUPERINTENDENT) controlling which delegation layer can assign that title.

**Title Assignment Delegation Chain:**
- **Layer 1 — Project Admin:** assigns Manager-level titles only (department heads)
- **Layer 2 — Department Manager:** assigns Superintendent-level titles within their department from the free-agent pool
- **Layer 3 — Superintendent:** assigns working-level titles to claimed free agents within their department

**Free-Agent Pool:** A user assigned to a department but without a title is a free agent. Free agents may submit tickets immediately as REQUESTER with NORMAL priority. Title is only needed for priority derivation and auto-tagging — neither blocks submission.

When a user submits a ticket, the system **auto-tags the ticket with their `department_id`** from `department_memberships.department_id`. If a user has no department membership, they select their department manually at submission time (ticket-scoped only — does not update their profile).

Department-scoped roles see only tickets tagged with their own department. The department's AOR node assignment is the visibility scope filter — no separate discipline-based filter is needed.

### The 48-Hour Rule

Workflow Variant 1 (Standard Approval) enforces a **minimum 48-hour notice** between submission and requested execution date. This is a hard business rule encoded in the domain layer, not a configuration setting.

### Priority System — Multi-Tier, Title-Driven

Priority is an internal operational signal. Requesters cannot set it directly. It is determined by the system at submission based on the submitter's title, and may be adjusted post-submission by authorized personnel only.

**Four priority levels:**
- `HIGH` — Project Executives, Survey Manager, Area Construction Manager
- `MED_HIGH` — Project Functional Group members (Discipline Manager, Discipline Lead), Survey Superintendent
- `MEDIUM` — Party Chief, Instrument Man, Craft Superintendent
- `NORMAL` — Subcontractors, General Foreman, unclassified requesters

**Default priority at submission:** determined by the submitter's title as configured in `department_titles.default_priority`. If no title is assigned, defaults to `NORMAL`.

**Post-submission adjustment:**
- `SURVEY_MANAGER` may elevate any ticket's priority at any active status. Requires written reason. Logged as `ticket.priority_elevated`.
- `SURVEY_MANAGER` may lower any ticket's priority. If lowering a `HIGH` ticket, an additional confirmation modal fires before the reason field appears. Confirmation is logged as `ticket.priority_downgrade_confirmed` with reason.
- `PROJECT_ADMIN` or `TENANT_ADMIN` may adjust the default priority for any title in the `department_titles` table — affects new submissions only.

Priority does not bypass the approval workflow. It signals operational weight to the Survey Manager.

**Priority whitelist (legacy path — preserved for explicit senior management override):**
A project-level whitelist of email addresses maintained by `TENANT_ADMIN`. Any whitelisted user's submission auto-sets priority to `HIGH` regardless of their title's default. Stored in `priority_whitelist`. Changes audit logged as `whitelist.entry_added` / `whitelist.entry_removed`.

### Ticket Types (Request Categories)

All tickets are classified by request type:

- `LAYOUT` — field layout work
- `CHECK_OUT` — instrument/equipment check-out
- `AS_BUILT` — as-built survey capture
- `TOPO` — topographic survey
- `PERMIT` — permit-related survey work

This list may be extended in future phases. It is structured data — never free text.

**CAD visibility applies to all ticket types.** CAD staff need awareness of all incoming work regardless of type so they can anticipate data needs and coordinate proactively.

### Cancellation — Four Distinct Paths

Cancellations are permanent. All paths produce an immutable audit event. There is no un-cancel.

**Path A — Requester-Initiated**
Requester determines they no longer need the work. Immediate. No approval required. Valid from any status except COMPLETED and any \*_CANCELED state. Result: `REQUESTER_CANCELED`. Survey team notified.

**Path B — Field-Initiated**
Instrument Man is on site; work cannot proceed or will not be performed in a reasonable timeframe. IM initiates → ticket enters `PENDING_PC_APPROVAL` → first of (assigned Party Chief, their Superintendent, Survey Manager) to act approves. Result: `FIELD_CANCELED`. Requester notified. Valid from `IN_PROGRESS` or `DELAYED` only.

**Path C — Survey-Side Initiated**
Survey-side knowledge (RFI, scope change, design revision, stop-work directive) requires pulling a ticket regardless of whether the requester is aware. Reason required — this is the paper trail replacing the verbal conversation.

Approval chain:
- Party Chief initiates → Superintendent or Survey Manager must approve
- Superintendent initiates → Survey Manager must approve
- Survey Manager initiates → immediate, no approval required

Valid from any status except COMPLETED and any \*_CANCELED state. If ticket is `IN_PROGRESS`, Instrument Man is notified to stop work in addition to Requester being notified. Result: `SURVEY_CANCELED`.

**Path D — Pre-work (RETIRED)**
The former `CANCEL_REQUESTED → CANCEL_APPROVED/REJECTED` path is retired. Path A covers requester-side cancellation. Path C covers survey-side pre-field cancellation. `CANCEL_REQUESTED` state is removed from the enum.

### Attachment Permissions

Requesters may attach files to their own tickets at any point while the ticket is active (any status except COMPLETED and any \*_CANCELED state). Attachment upload is not restricted to submission time only. Logged as `attachment.uploaded` with ticket status at time of upload captured in the audit payload.

### Subcontractor Isolation

Subcontractor users can only see requests submitted by their own company. This is enforced at the data access layer.

### GC User Isolation

Standard GC employees (REQUESTER role) see only tickets they submitted. Full-project visibility is granted only to specific elevated roles — see Section 7A.

### Rejection and Resubmission

When a ticket is rejected, the Survey Manager must provide a written rejection reason before the transition completes. The Requester may resubmit after verbal negotiation. The resubmission creates a new DRAFT pre-populated with eligible fields (aor_node_id, ticket_type, department_id, craft, description) linked to the rejected ticket via `parent_ticket_id`. Fields NOT carried over: requested_date, attachments, priority. The written reason is the paper trail replacing the verbal conversation.

---

## 5. Data Model

### Core Tables

```
tenants
  id, name, created_at

projects
  id, tenant_id, name
  status           (SETUP | ACTIVE | ARCHIVED — default SETUP on creation)
  crew_build       (FULL | MEDIUM | SLIM — set at project creation or template selection;
                    drives readiness gate and workflow gate resolution)
  template_id      (fk → project_templates.id, nullable — null = built from scratch)
  activated_at     (nullable — stamped on SETUP → ACTIVE transition)
  activated_by     (user_id, nullable)
  archived_at      (nullable — stamped on ACTIVE → ARCHIVED transition)
  archived_by      (user_id, nullable)
  created_at

companies
  id, tenant_id, name, type (GC | SUBCONTRACTOR | OWNER_REP), created_at

users
  id, tenant_id, company_id, email, password_hash (nullable — null for SSO users),
  auth_method (LOCAL | SSO), name, title (nullable — fk display value; set by admin),
  deactivated_at   (nullable — null = active user)
  deactivated_by   (user_id, nullable — TENANT_ADMIN who performed deactivation)
  created_at
  — title drives default priority at submission and department auto-tagging
  — title is a free-text label matching department_titles.title; not a FK to allow flexibility

crew_rosters
  id, project_id, tenant_id, party_chief_id (user_id), instrument_man_id (user_id),
  deactivated_at   (nullable — set when either roster member is deactivated;
                    active roster queries filter WHERE deactivated_at IS NULL)
  created_at
  — Survey Manager or Survey Superintendent manages roster entries within their AOR
  — One Party Chief may have multiple Instrument Men
  — An Instrument Man belongs to one Party Chief per project
  — Changeable by SURVEY_MANAGER or SURVEY_SUPERINTENDENT; change audit logged as crew.roster_changed

project_memberships
  id, project_id, user_id, role,
  designated_acting_for  (role enum, nullable — this member is the named acting designee
                           if the specified role is vacated. Set by TENANT_ADMIN or PROJECT_ADMIN.
                           One designation per role per project.
                           Surfaces as a readiness warning if not configured before activation.)
  created_at

aor_levels
  id, project_id, tenant_id
  depth (integer, 0 = top level)
  label (e.g. "GENERAL AREA", "UNIT", "CWA", "IWP")
  created_at
  — defines the named levels of the AOR hierarchy for this project
  — managed by PROJECT_ADMIN or TENANT_ADMIN
  — audit logged: aor.level_created

aor_nodes
  id, project_id, tenant_id
  level_id (fk → aor_levels)
  parent_id (nullable — null = top-level node)
  name (e.g. "ISBL", "Unit 1", "CWA-1100")
  code (short slug, e.g. "ISBL", "U1", "CWA1100" — used in ticket numbers)
  retired_at       (nullable — set by Project Admin to soft-retire a node; retired nodes excluded
                    from AOR picker on new ticket creation but remain fully queryable for
                    historical tickets. Emits aor.node_retired audit event.)
  created_at
  — populates the AOR tree under the defined levels
  — managed by PROJECT_ADMIN or TENANT_ADMIN
  — audit logged: aor.node_created
  — a project may have multiple independent top-level branches (multi-root); parent_id = null
    on multiple nodes is valid and expected on large projects

aor_assignments
  id, project_id, tenant_id, user_id
  aor_node_id (fk → aor_nodes — assignment at this node implies all descendant nodes)
  department_id    (fk → departments, nullable — null = individual user assignment,
                    non-null = department-level AOR scope)
  deactivated_at   (nullable — set when the assigned user is deactivated;
                    active AOR scope queries filter WHERE deactivated_at IS NULL)
  created_at
  — replaces area_memberships
  — used for: AREA_VIEWER (ACM), SURVEY_SUPERINTENDENT, PARTY_CHIEF, DEPARTMENT_LEAD
  — a user may have multiple aor_assignments (assigned to multiple AOR nodes)
  — a department may have multiple aor_assignments (multi-root department scope)
  — enforced at data access layer: queries filtered to assigned node(s) and all descendants
  — audit logged: aor.node_assigned

departments
  id, project_id, tenant_id
  name             (e.g. "Train 1 Civil", "QA/QC", "Safety", "Controls")
  manager_title    (the canonical Manager-level title string for this department,
                    e.g. "Train 1 Construction Manager". Set by Project Admin at creation.
                    Auto-added to department_titles catalog with assignment_layer = MANAGER.)
  created_by       (fk → users — Project Admin who created the department)
  created_at
  — replaces discipline_groups
  — a department is AOR-scoped: assigned one or more AOR nodes via aor_assignments;
    scope includes those nodes and all descendants
  — audit logged: department.created

department_memberships
  id, project_id, tenant_id, user_id, department_id
  title            (assigned title string, e.g. "Civil Engineer". Null = free agent.)
  assigned_by      (fk → users — Project Admin, Department Manager, or Superintendent)
  assigned_at      (nullable — null if still a free agent)
  superintendent_id (fk → users, nullable — Superintendent this member reports to;
                     null = free agent or Manager-level)
  deactivated_at   (nullable — set when user is deactivated)
  created_at       (when user entered the department pool)
  — replaces implicit discipline group membership
  — one row per user per project (one-department-per-user constraint at application layer)
  — attempting to assign a user to a second department returns ConflictError
  — audit logged: department.member_added, department.title_assigned

department_titles
  id, tenant_id, department_id
  title            (e.g. "Civil Engineer", "QA/QC Inspector")
  default_priority (HIGH | MED_HIGH | MEDIUM | NORMAL)
  assignment_layer (MANAGER | SUPERINTENDENT — which delegation layer can assign this title)
  created_at
  — replaces discipline_titles
  — managed by PROJECT_ADMIN or Department Manager
  — used at ticket submission to auto-tag department_id and set default priority
  — audit logged: department.title_catalog_updated

priority_whitelist
  id, tenant_id, project_id, email, added_by (user_id), created_at
  UNIQUE (tenant_id, project_id, email)  — duplicate entry returns ConflictError; no silent dedup
  — TENANT_ADMIN only may insert/delete rows
  — checked at ticket submission: matching email overrides title default to HIGH
  — audit logged: whitelist.entry_added / whitelist.entry_removed

acting_grants
  id, tenant_id, project_id
  user_id          (user receiving the acting authority)
  role             (role enum value being temporarily granted)
  scope            (jsonb — permitted actions list and AOR node constraints)
  trigger          (VACANCY | CASCADE)
  cascade_level    (integer, nullable — how many levels down cascade reached)
  granted_by       (user_id or literal SYSTEM)
  granted_reason   (text — description of vacancy trigger)
  confirmed_by     (user_id, nullable — TENANT_ADMIN or PROJECT_ADMIN confirmation)
  confirmed_at     (nullable)
  revoked_at       (nullable — set when permanent replacement is assigned)
  revoked_by       (user_id, nullable)
  created_at
  — acting authority is always temporary, always scoped, always visible, always audited
  — scope is minimum actions needed to keep workflow moving (approve, assign_crew, etc.)
  — audit logged: acting_grant.issued, acting_grant.confirmed, acting_grant.revoked

project_templates
  id, tenant_id
  name             (e.g. "Large Energy — 4-Level AOR", "Commercial Lot — Slim")
  crew_build       (FULL | MEDIUM | SLIM)
  aor_depth        (integer — number of levels in the AOR hierarchy)
  aor_level_labels (jsonb array — level label names in order, e.g. ["GENERAL AREA","UNIT","CWA","IWP"])
  discipline_groups (jsonb array — default department names, e.g. ["Engineering","QA/QC","Safety"])
  created_by       (user_id)
  created_at, updated_at
  — defined at tenant level by TENANT_ADMIN
  — templates define structure (depth, labels, department names) — not content (node names, titles)
  — may not be deleted if any project.template_id references this template (ConflictError)
  — audit logged: template.created, template.updated, template.deleted

allowed_domains
  id, tenant_id, domain (e.g. "zachrygroup.com"), added_by (user_id), created_at
  — TENANT_ADMIN only may insert/delete rows
  — checked at self-registration: if email domain matches, registration proceeds
    automatically and user is granted REQUESTER role
  — if no domain match, registration blocked unless a valid invite token exists
  — audit logged: domain.added / domain.removed

invites
  id, tenant_id, project_id, email, role, token (UUID), invited_by (user_id),
  accepted_at (nullable), expires_at,
  canceled_at      (nullable — set when TENANT_ADMIN explicitly cancels invite)
  canceled_by      (user_id, nullable)
  created_at
  — created by TENANT_ADMIN for users whose email domain is not in allowed_domains
  — token is single-use; expires_at enforced at registration
  — once accepted, accepted_at is stamped and token cannot be reused
  — audit logged: invite.sent / invite.accepted / invite.expired

tickets
  id (UUID), tenant_id, project_id, aor_node_id (fk → aor_nodes), company_id
  ticket_number (human-readable, e.g. FSS-U1-00247 — project-scoped sequential, immutable)
  ticket_type (LAYOUT | CHECK_OUT | AS_BUILT | TOPO | PERMIT)
  department_id    (fk → departments — replaces discipline_group_id; auto-set at submission
                    from submitter's department_memberships.department_id;
                    requester selects manually if no department membership exists)
  requester_id, assigned_party_chief_id, assigned_instrument_man_id (nullable)
  survey_superintendent_id (nullable — snapshot of Superintendent responsible for this ticket's
                             AOR at assignment time; not a live FK resolution)
  survey_manager_id
  workflow_variant (STANDARD_APPROVAL | DIRECT_ASSIGNMENT)
  status (see Section 6 for full enum)
  craft, description
  priority (HIGH | MED_HIGH | MEDIUM | NORMAL, default NORMAL)
  priority_set_by (user_id, nullable — null = system default from title)
  priority_set_reason (text, nullable — required only on Survey Manager downgrade of HIGH ticket)
  cad_status (nullable — set when ticket enters CAD sub-track)
  cad_assigned_to (user_id, nullable), cad_reviewed_by (user_id, nullable)
  cad_completed_at (nullable)
  requested_date, submitted_at, approved_at, assigned_at, started_at, completed_at, canceled_at
  rejected_at      (nullable — stamped at SUBMITTED → REJECTED transition; required for
                    sorting Rejected surface and time-to-rejection reporting)
  rejection_reason (required when status → REJECTED)
  cancel_reason (required for Path C survey-side cancellation; optional for Path B field cancellation)
  cancel_initiated_by (user_id, nullable — set on Path B and Path C initiation)
  cancel_initiated_at (nullable timestamptz — set on Path C initiation; cleared if ticket is
                        preempted by another terminal transition; enables O(1) duplicate-initiation
                        guard: if non-null, reject duplicate Path C with ConflictError)
  cancel_approved_by (user_id, nullable — set when Path B or Path C approval completes)
  parent_ticket_id (fk → tickets.id — set on resubmission after rejection; single-level FK)
  draft_last_saved_at (nullable — updated on every explicit Save Draft action; null for non-draft tickets)
  draft_deleted_at (nullable — set when soft-deleted; non-null means inaccessible to requester)
  draft_deleted_reason (REQUESTER_DELETED | USER_DEACTIVATED | AUTO_EXPIRED, nullable)
  created_at, updated_at

ticket_events (append-only — no updates, no deletes, ever)
  id, ticket_id, tenant_id, actor_id, event_type, payload (jsonb), created_at

attachments
  id, ticket_id, tenant_id, uploaded_by, filename, mime_type,
  storage_key, size_bytes, ticket_status_at_upload (captured for audit context), created_at

help_flags
  id, tenant_id, project_id
  raised_by (user_id), level (1 | 2), reason (optional text)
  status (ACTIVE | CLEARED)
  escalated_from (help_flag.id, nullable — set when a Level 1 is escalated to Level 2)
  affected_ticket_ids (jsonb — array of ticket IDs assigned to the Party Chief at Level 2 raise time;
                        populated at raise; auto-clear evaluates against this fixed snapshot only;
                        tickets arriving after the flag is raised do not count toward auto-clear)
  cleared_at (nullable), cleared_reason (TICKETS_REASSIGNED | MANUALLY_CLEARED)
  created_at, updated_at
  — Level 1: scoped to a single Instrument Man; visible within their Party Chief's crew only
  — Level 2: project-wide signal; visible to SURVEY_MANAGER, SURVEY_SUPERINTENDENT, and all PARTY_CHIEFs
  — Superintendents see all Level 2 flags project-wide but may only act (reassign) within their own AOR
  — A Level 2 flag need not be tied to a specific ticket — it signals general overload
  — Cleared automatically when all tickets in affected_ticket_ids snapshot are reassigned,
    or manually by the raiser
```

### Removed Tables

- `areas` — replaced by `aor_nodes`
- `subareas` — replaced by `aor_nodes` (depth handled by tree structure)
- `area_memberships` — replaced by `aor_assignments`
- `discipline_groups` — replaced by `departments`
- `discipline_titles` — replaced by `department_titles`

### Schema Additions Required (Phase 3 Migration)

- `companies.status` (ACTIVE | INACTIVE) — required for formal company lifecycle management; column must be added in Phase 3 migration even if feature UI is deferred
- `project_companies` table — required alongside `companies.status` for company lifecycle; Phase 3 migration

### Indexes Required

```sql
(tenant_id, project_id, status)                              -- ticket queries
(tenant_id, project_id, assigned_party_chief_id)             -- crew workload queries
(tenant_id, project_id, created_at)                          -- time-based reporting
(tenant_id, company_id)                                       -- subcontractor isolation
(tenant_id, project_id, department_id)                        -- department visibility queries (replaces discipline_group_id index)
(tenant_id, project_id, aor_node_id)                         -- AOR-scoped queries
(tenant_id) on allowed_domains                                -- domain lookup at registration
(tenant_id, project_id) on invites where accepted_at is null  -- pending invite lookup
(tenant_id, project_id) on crew_rosters                       -- roster lookup
(project_id, party_chief_id) on crew_rosters                  -- crew visibility queries
(project_id, user_id) on aor_assignments                      -- AOR scoping
(project_id, aor_node_id) on aor_assignments                  -- node membership lookups
(tenant_id, project_id, status) on help_flags                 -- active flag queries
(project_id) on aor_nodes where parent_id is null             -- top-level node queries
(parent_id) on aor_nodes                                      -- tree traversal
(requester_id, status) on tickets where draft_deleted_at is null  -- requester draft queries
-- Department model indexes
(tenant_id, project_id) on departments                        -- department list queries
(project_id, user_id) on department_memberships               -- user department lookup (one-dept rule)
(project_id, department_id) on department_memberships where title is null  -- free agent pool queries
(project_id, department_id) on department_memberships where superintendent_id is not null  -- team member queries
(project_id, department_id) on department_titles              -- title catalog per department
(department_id) on aor_assignments where department_id is not null  -- department AOR scope queries
-- Acting grants and vacancy
(tenant_id, project_id) on acting_grants where revoked_at is null  -- active acting grant lookups
(user_id) on acting_grants where revoked_at is null           -- user acting grant lookups
(project_id, designated_acting_for) on project_memberships    -- acting designee lookup
-- Templates
(tenant_id) on project_templates                              -- template lookup
-- Crew deactivation
(tenant_id) on users where deactivated_at is null             -- active user queries
-- Whitelist duplicate check
UNIQUE (tenant_id, project_id, email) on priority_whitelist
```

### Rules

- Every domain table includes `tenant_id`
- Every query that returns domain data must be scoped by `tenant_id`
- `ticket_events` is append-only — no updates, no deletes, ever
- Attachments are stored in object storage; DB stores metadata and storage key only
- `password_hash` is nullable — do not assume it is always set
- AOR visibility queries must traverse the node tree downward from the assigned node — a user assigned to a parent node sees all tickets at that node and all descendants
- `closed_at` timestamp column is removed; `canceled_at` covers all cancellation paths; `completed_at` is the terminal success timestamp
- Draft tickets are soft-deleted, never hard-deleted — `draft_deleted_at` is set, `draft_deleted_reason` records why
- All draft queries must filter `draft_deleted_at IS NULL` unless the caller is `PROJECT_ADMIN` performing a recovery operation (draft recovery is PROJECT_ADMIN, not TENANT_ADMIN)
- `ticket_number` is **not** assigned until `DRAFT → SUBMITTED` transition — drafts have no human-readable number
- `survey_superintendent_id` on the ticket is a snapshot, not a live FK resolution — it is the Superintendent responsible at assignment time; corrections require Survey Manager manual update
- The one-department-per-user constraint is enforced at the application layer, not via a DB unique constraint, so it can be relaxed without a migration in future phases
- All ticket status transitions use `SELECT FOR UPDATE` on the ticket row within the transaction to prevent race conditions

---

## 6. Workflow State Machines

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

`COMPLETED` is the terminal success state. `REQUESTER_CANCELED`, `FIELD_CANCELED`, and `SURVEY_CANCELED` are the three terminal cancellation states. No `CLOSED` state exists.

### Variant 1 — Standard Approval

```
DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → PENDING_PC_APPROVAL → COMPLETED
                  ↘ REJECTED

PENDING_PC_APPROVAL → COMPLETED          (Party Chief approves completion)
                    → IN_PROGRESS         (Party Chief rejects — reverts; reason optional)
                    → DELAYED             (Party Chief approves delayed status)
                    → FIELD_CANCELED      (Path B — first responder approves field cancel)

DELAYED → IN_PROGRESS                    (Party Chief or above restarts when blocker clears)
DELAYED → PENDING_PC_APPROVAL            (field cancel initiated from delayed state)

Any active status → REQUESTER_CANCELED   (Path A — requester, immediate, no approval)
Any active status → SURVEY_CANCELED      (Path C — survey-side, approval chain applies)
```

- 48-hour minimum notice enforced at the `DRAFT → SUBMITTED` transition; the clock starts at submit time, not draft creation time
- DRAFT is only valid in Variant 1 — Variant 2 starts at ASSIGNED (no requester-facing draft step)
- `ticket_number` is assigned at the `DRAFT → SUBMITTED` transition, not at draft creation
- REJECTED requires rejection_reason before transition completes
- "Active status" for cancellation purposes means any status except COMPLETED, REQUESTER_CANCELED, FIELD_CANCELED, SURVEY_CANCELED
- DRAFT is not an "active status" — cancellation paths do not apply to drafts; requester deletes the draft instead

### Variant 2 — Direct Assignment

```
CREATED → ASSIGNED → IN_PROGRESS → PENDING_PC_APPROVAL → COMPLETED

PENDING_PC_APPROVAL → COMPLETED          (Party Chief approves completion)
                    → IN_PROGRESS         (Party Chief rejects — reverts; reason optional)
                    → DELAYED             (Party Chief approves delayed status)
                    → FIELD_CANCELED      (Path B — first responder approves field cancel)

DELAYED → IN_PROGRESS                    (Party Chief or above restarts)
DELAYED → PENDING_PC_APPROVAL            (field cancel initiated from delayed state)

Any active status → REQUESTER_CANCELED   (Path A — requester, immediate)
Any active status → SURVEY_CANCELED      (Path C — survey-side, approval chain applies)
```

- No approval gate — auto-proceeds to ASSIGNED immediately
- Survey Manager assigns crew immediately

### Transition Rules

- All transitions validated in a single central function in the Workflow module
- Invalid transitions throw a `ConflictError` immediately
- No silent state changes anywhere

### Cancellation Approval Chains (enforced at use-case layer)

**Path B (Field-Initiated) — PENDING_PC_APPROVAL → FIELD_CANCELED:**
First of the following actors to act completes the transition:
1. Assigned Party Chief
2. That Party Chief's Survey Superintendent
3. Survey Manager

No sequential waiting. First responder wins. Others are notified when the action is taken.

**Path C (Survey-Side) — any active status → SURVEY_CANCELED:**
- Party Chief initiates → requires Superintendent or Survey Manager approval
- Superintendent initiates → requires Survey Manager approval
- Survey Manager initiates → immediate, no approval required
- Cancel reason is required in all cases — this is the paper trail
- If status is IN_PROGRESS at time of Survey-Side cancel: Instrument Man is notified to stop work

### Permitted Non-Standard Transition

`REJECTED → APPROVED` is a permitted transition, available to `SURVEY_MANAGER` only. Covers the case where a requester contacts the Survey Manager directly after rejection and the Survey Manager determines the request should proceed. Logged as `ticket.rejection_overridden`. Written override reason required before transition completes. The original rejection_reason is preserved in the audit trail. Requester notification is identical to a standard approval notification — the override is not disclosed.

Self-conflict constraint: Survey Manager may not approve, reject, or override-approve a ticket where `survey_manager_id = their own user_id`. Enforced at the use-case layer — `ForbiddenError` returned if violated.

### Party Chief Approval — PENDING_PC_APPROVAL Detail

When an Instrument Man submits a field status of COMPLETED, DELAYED, or initiates a field cancel, the ticket enters `PENDING_PC_APPROVAL`. The Party Chief (or Superintendent/Survey Manager if Party Chief is unreachable) must act before the status finalizes and the requester is notified.

- **COMPLETED**: Party Chief approves → COMPLETED (requester notified). Party Chief rejects → IN_PROGRESS (reason optional; Instrument Man notified).
- **DELAYED**: Party Chief approves → DELAYED (requester notified with reason). Reason for delay is captured at IM initiation.
- **Field Cancel**: First responder in approval chain approves → FIELD_CANCELED (requester notified).
- **Override**: If Party Chief is unreachable, Superintendent or Survey Manager may act on any PENDING_PC_APPROVAL. Logged as `ticket.pc_approval_overridden`. Party Chief notified that their approval was bypassed.

### Ticket Numbering

Every ticket has two identifiers:

**Internal ID** — UUID, used in the database and all API calls. Never displayed to users.

**Human-Readable Number** — sequential, project-scoped, formatted as:
```
FSS-[NODE_CODE]-[ZERO_PADDED_SEQUENCE]
Example: FSS-U1-00247
```
- `NODE_CODE` is the `code` slug on the `aor_nodes` table for the node the ticket is filed against
- Sequence is per-project, increments on every ticket creation regardless of status
- Assigned at creation and is immutable — rejected and canceled tickets keep their number permanently
- Resubmissions after rejection receive a **new number** but carry `parent_ticket_id`
- The ticket number is what users reference in conversations, emails, and on site

---

## 7. Roles

> **This section is intentionally fluid.** Roles and permissions will expand as the platform is built out. New roles must be documented here before being implemented. Do not add roles to code without updating this file first.

### Tenant-Level Roles

| Role | Description |
|---|---|
| `TENANT_ADMIN` | Full tenant management — users, projects, domains, whitelists, project templates, acting grant confirmation. Read access to all tickets across all projects within tenant. Creates project records. Manages invite lifecycle. Does not perform ticket approvals, field assignments, or survey operations. |
| `BILLING_VIEWER` | Read-only billing and admin access. No ticket visibility. |

### Project-Level Roles

| Role | Description |
|---|---|
| `PROJECT_ADMIN` | Project-level configuration: AOR tree, departments, title catalog, priority defaults, memberships, whitelists. No ticket approval authority and no inherent ticket visibility — must hold a second ticket-visible role (e.g. VIEWER). Draft recovery within their projects (30-day window). |
| `SURVEY_MANAGER` | Primary approval authority for all ticket workflow. Approves, rejects, and override-approves tickets. Assigns Superintendents to AOR nodes (Full Build). Manages crew rosters. Manual priority elevation and downgrade (confirmation modal required on HIGH downgrade). Reassigns tickets. Escalates help flags. Initiates or approves all cancellation paths. On Slim Build projects, sole survey department member and direct crew lead. |
| `SURVEY_SUPERINTENDENT` | AOR-scoped survey admin. Assigned by Survey Manager. Assigns Party Chiefs within their AOR. Approves field status changes when Party Chief is unavailable. Initiates Path C cancellations (requires Survey Manager approval). Approves Path B and Path C cancellations initiated by Party Chief. |
| `PARTY_CHIEF` | Executes assigned work. Approves Instrument Man field status submissions (PENDING_PC_APPROVAL). Raises Level 2 help flags. Escalates crew Level 1 flags. Voluntarily claims flagged tickets. Initiates Path C cancellations (requires Superintendent or Survey Manager approval). May reassign IM on their own tickets. |
| `INSTRUMENT_MAN` | Executes assigned work. Marks field statuses (IN_PROGRESS, COMPLETED, DELAYED, field cancel initiation). Raises Level 1 help flags. |
| `CAD_LEAD` | QA sign-off on CAD sub-track — sees all tickets across all types and all AORs |
| `CAD_TECHNICIAN` | CAD support work — sees all tickets across all types and all AORs |
| `DEPARTMENT_MANAGER` | (Renamed from DISCIPLINE_MANAGER) Site-wide read access for their assigned department only. No approval authority. Assigns Superintendent-level titles to free agents within their department. |
| `DEPARTMENT_LEAD` | (Renamed from DISCIPLINE_LEAD) AOR-scoped read access for their assigned department only. Assigned AOR node(s) within their department determines visibility. Assigns working-level titles to team members. |
| `REQUESTER` | Submit and track own requests only. All field titles that do not have an elevated role are REQUESTER. Title drives priority default and department auto-tagging — not role. Free agents (department assigned, no title) submit immediately as REQUESTER with NORMAL priority. |
| `VIEWER` | Full project read-only access — all tickets, all AORs |
| `AREA_VIEWER` | Read-only access scoped to assigned AOR node(s) and descendants. Used for Area Construction Manager. |
| `SUBCONTRACTS_COORDINATOR` | Internal GC role. Read access to all subcontractor company tickets across the project. No approval authority. May be divided in future phases if multiple coordinators are needed. |

RBAC is enforced at the **application/use-case layer**, not just the route.

> **Pending Owner Decision:** Role enum rename — `DISCIPLINE_MANAGER` → `DEPARTMENT_MANAGER` and `DISCIPLINE_LEAD` → `DEPARTMENT_LEAD`. Recommendation: rename since the codebase is pre-v1 and no external consumers exist. Requires explicit owner decision before migration.

**Crew Build Configurations:** Three staffing configurations determine which survey hierarchy tiers are present and which workflow gates apply. Set at project creation and stored on `projects.crew_build`. Locked after SETUP → ACTIVE.

| Build | Roles Present | Notes |
|---|---|---|
| `FULL` | Survey Manager + Superintendent(s) + Party Chief(s) + Instrument Man/Men | Large-scale energy projects with multiple AORs. All workflow gates apply. |
| `MEDIUM` | Survey Manager + Party Chief(s) + Instrument Man/Men | No Superintendent tier. Survey Manager covers Superintendent-level gates directly. |
| `SLIM` | Survey Manager + Instrument Man/Men | No Party Chief tier. Survey Manager is sole approval authority and direct crew lead. PENDING_PC_APPROVAL routes to Survey Manager. |

**Note on Department Roles:** `DEPARTMENT_MANAGER` and `DEPARTMENT_LEAD` roles are assigned in `project_memberships`. The department they belong to is stored as a separate attribute on the membership record — not encoded in the role enum value. This keeps the role enum from exploding as department counts grow.

---

## 7A. Visibility Model

Defines exactly what each role can see. Enforced at the data access layer — not in UI logic.

### Full Visibility — all tickets across all AORs and disciplines

| Role | Scope |
|---|---|
| `TENANT_ADMIN` | All projects within tenant (read) |
| `SURVEY_MANAGER` | All tickets within their project (read + full workflow authority) |
| `CAD_LEAD` | All tickets within their project (all types) |
| `CAD_TECHNICIAN` | All tickets within their project (all types) |
| `VIEWER` | All tickets within their project (read-only) |

**CAD note:** CAD staff see all ticket types regardless of whether a CAD task is currently attached. Intentional — CAD needs full awareness to anticipate data needs proactively.

**BILLING_VIEWER** has no ticket visibility. Billing/admin surfaces only.
**PROJECT_ADMIN** has project configuration access but no inherent ticket visibility unless also assigned a ticket-visible role (e.g. VIEWER). If a user's only project role is PROJECT_ADMIN, the ticket list surface must not appear in their navigation.

> **APPROVER role eliminated.** All prior references to APPROVER in visibility rules are superseded by SURVEY_MANAGER.

### Partial Visibility — scoped by assignment, AOR, or department

| Role | Sees |
|---|---|
| `SURVEY_SUPERINTENDENT` | All tickets within their assigned AOR node(s) and all descendant nodes |
| `AREA_VIEWER` | All tickets within their assigned AOR node(s) and all descendant nodes (read-only) |
| `DEPARTMENT_MANAGER` | All tickets tagged with their `department_id`, project-wide |
| `DEPARTMENT_LEAD` | All tickets tagged with their `department_id`, within their assigned AOR node(s) and descendants |
| `SUBCONTRACTS_COORDINATOR` | All tickets where `company.type = SUBCONTRACTOR`, project-wide |
| `PARTY_CHIEF` | All tickets where `assigned_party_chief_id = their user_id` + Level 2 help flags from other Party Chiefs |
| `INSTRUMENT_MAN` | All tickets where their Party Chief is assigned + tickets where they are `assigned_instrument_man_id` + Level 1 flags within their crew |

### General Visibility — own submissions only

| Role | Sees |
|---|---|
| `REQUESTER` | Only tickets where `requester_id = their user_id` |

**This applies to all requesters regardless of company or title.** A GC employee with REQUESTER role cannot see another GC employee's tickets. Title and company affiliation do not grant broader visibility beyond what the role permits.

**Draft visibility:** Requesters see their own DRAFT tickets in a dedicated Drafts section, separate from their submitted ticket list. Soft-deleted drafts (`draft_deleted_at IS NOT NULL`) are not visible to the requester. `PROJECT_ADMIN` can view and recover soft-deleted drafts within their project within 30 days of deletion. TENANT_ADMIN has no direct draft recovery capability.

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

### Survey Hierarchy

```
Survey Manager (project-wide)
  └── Survey Superintendent(s) (AOR-scoped, assigned by Survey Manager)
        └── Party Chief(s) (AOR-scoped, assigned by Superintendent)
              └── Instrument Man/Men (assigned to Party Chief per project)
```

### Project-Level Roster

Each project has a crew roster. Survey Manager manages Superintendent AOR assignments. Survey Superintendent manages Party Chief assignments within their AOR and can assign Instrument Men to Party Chiefs.

- One Party Chief may have multiple Instrument Men
- An Instrument Man is assigned to exactly one Party Chief per project
- Reassignment of Instrument Man to a different Party Chief is audit logged as `crew.roster_changed`
- **Roster management UI/admin surface: parked — revisit before Phase 3**

### Ticket Assignment

Survey Manager or Survey Superintendent assigns tickets:
1. **Party Chief** — required. One Party Chief per ticket.
2. **Instrument Man** — optional. May be any Instrument Man in the project — not constrained to the assigned Party Chief's roster.

`survey_superintendent_id` on the ticket is a **snapshot** — set to the Superintendent responsible for the AOR at assignment time, not a live FK resolution. If a Superintendent rotation occurs mid-project, existing tickets retain the old `survey_superintendent_id`. Survey Manager must manually update via the "Reassign Superintendent" action on the ticket detail. Logged as `ticket.superintendent_reassigned`.

When a Superintendent is removed from a project, the use-case layer surfaces a warning: "This user is the Superintendent of record on [N] active tickets. Reassign before removing?" This is a use-case layer validation, not a DB constraint.

**IM reassignment authority:** Party Chief may reassign the Instrument Man on their own tickets. Survey Manager and Superintendent may also reassign. Logged as `ticket.im_reassigned`. When reassigning IM on a PENDING_PC_APPROVAL ticket, the IM swap does not disrupt the pending approval — the approval is of the field status report, not the IM's continued assignment.

### Visibility Follows Assignment

- `SURVEY_SUPERINTENDENT` sees all tickets within their assigned AOR node(s) and descendants
- `PARTY_CHIEF` sees all tickets where they are `assigned_party_chief_id`
- `INSTRUMENT_MAN` sees all tickets where their Party Chief is assigned + any tickets where they are `assigned_instrument_man_id`

---

## 10. Production Load Balancing — Help Flag System

Field crews can fall behind on production. This system provides a structured, two-level signal mechanism for surfacing overload conditions and enabling voluntary or directed reassignment — without requiring Survey Manager intervention for every rebalancing event.

### Two-Level Escalation Model

**Level 1 — Crew Help Flag** (internal to Party Chief's crew)

- **Raised by:** `INSTRUMENT_MAN` on their own workload
- **Visible to:** their assigned Party Chief + all Instrument Men under that same Party Chief
- **Does not surface** to other Party Chiefs, Superintendents, or Survey Manager unless escalated
- **Cleared:** automatically when the flagging Instrument Man's tickets are reassigned, or manually by the raiser
- **Escalation path:** Party Chief may escalate a crew member's Level 1 flag to Level 2

**Level 2 — Party Chief Help Flag** (department-wide)

- **Raised by:** Party Chief — self-initiated, or by escalating a crew member's Level 1 flag
- **Visible to:** Survey Manager, all Survey Superintendents, and all Party Chiefs on the project
- **Superintendent scope:** Superintendents see all Level 2 flags project-wide but may only act (reassign) within their own AOR. They cannot reach into another Superintendent's AOR.
- **Actions available once raised:**
  - Survey Manager or Superintendent may reassign any of the flagged Party Chief's tickets (within scope rules above)
  - Another Party Chief may voluntarily claim a ticket directly — no approval required; Survey Manager notified automatically
- **Auto-clear:** evaluates against the `affected_ticket_ids` snapshot captured at raise time — only tickets that were assigned to the Party Chief when the flag was raised count toward auto-clear. Tickets arriving after the flag was raised do not count.
- **Cleared:** automatically when all tickets in the snapshot are reassigned, or manually by the raiser

### Voluntary Pickup (v1 Default)

When a Level 2 flag is active, any other Party Chief on the project may claim a flagged ticket and assign it to one of their own crews. This does not require Survey Manager approval. The Survey Manager receives a notification that the pickup occurred.

> **TODO (post-v1):** per-project configuration for whether voluntary pickup requires Survey Manager approval before the reassignment completes.

### Requester Notification on Reassignment

Whenever a ticket's assigned Party Chief or crew changes — whether driven by a help flag, direct reassignment, or voluntary pickup — the original requester is notified of the new Party Chief as their point of contact.

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
- `ticket.draft_saved` (requester explicitly saved a draft; `draft_last_saved_at` updated)
- `ticket.draft_deleted` (requester deleted their own draft; reason = REQUESTER_DELETED)
- `ticket.draft_expired` (background job soft-deleted draft after 7 days of inactivity; reason = AUTO_EXPIRED)
- `ticket.draft_recovered` (PROJECT_ADMIN recovered a soft-deleted draft; recovery_reason min 10 chars required)
- `ticket.draft_hard_deleted` (background job permanently deleted draft after 30-day window; unrecoverable)
- `ticket.created`, `ticket.submitted`, `ticket.approved`, `ticket.rejected`
- `ticket.rejection_overridden` (REJECTED → APPROVED, actor and reason recorded)
- `ticket.assigned`, `ticket.unassigned`
- `ticket.in_progress`
- `ticket.pending_pc_approval` (IM submitted field status, awaiting Party Chief sign-off)
- `ticket.pc_approval_given` (Party Chief approved; final status recorded in payload)
- `ticket.pc_approval_rejected` (Party Chief rejected IM status; ticket reverts to IN_PROGRESS; reason optional)
- `ticket.pc_approval_overridden` (Superintendent or Survey Manager acted on stuck PENDING_PC_APPROVAL; Party Chief notified)
- `ticket.completed`
- `ticket.delayed` (Party Chief approved DELAYED status; delay reason recorded)
- `ticket.delay_restarted` (Party Chief or above restarted a DELAYED ticket)

*Cancellations*
- `ticket.requester_canceled` (Path A — requester self-canceled; no approval; survey team notified)
- `ticket.field_cancel_requested` (Path B — Instrument Man initiated field cancel)
- `ticket.field_canceled` (Path B — first responder approved; responder identity recorded)
- `ticket.survey_cancel_requested` (Path C — Party Chief or Superintendent initiated; reason recorded)
- `ticket.survey_canceled` (Path C — approval obtained or Survey Manager direct action; approver recorded)
- `ticket.im_stop_work_notified` (Path C when IN_PROGRESS — Instrument Man notified to stop)

*Priority*
- `ticket.priority_set_by_whitelist` (at submission when requester email matches whitelist)
- `ticket.priority_set_by_title` (at submission from title default)
- `ticket.priority_elevated` (SURVEY_MANAGER manual elevation; actor, old_priority, new_priority, reason required)
- `approver.timeout_warning_sent` (18-hour nudge sent to Survey Manager; ticket_id, hours_elapsed in payload)
- `approver.timeout_unlocked` (24-hour escalation sent to Survey Manager; ticket_id, hours_elapsed in payload)
- `ticket.priority_downgrade_confirmed` (SURVEY_MANAGER lowered a HIGH ticket; confirmation recorded; reason required)

*CAD sub-track*
- `cad.status_changed` (any cad_status transition, actor recorded)
- `cad.qa_signed_off` (CAD_LEAD signs off; cad_reviewed_by and cad_completed_at stamped)

*Attachments*
- `attachment.uploaded` (uploaded_by, ticket_status_at_upload recorded)
- `attachment.downloaded`

*User and access management*
- `user.role_changed`
- `user.title_assigned` (admin assigned or changed user title; new title and department recorded)
- `user.self_registered` (domain recorded in payload)
- `user.deactivated` (deactivated_by, affected_open_ticket_count, affected_roles in payload)
- `user.reactivated` (reactivated_by)
- `user.removal_blocked` (user_id, role, reason: SURVEY_MANAGER_NO_REPLACEMENT)
- `whitelist.entry_added`, `whitelist.entry_removed`
- `domain.added`, `domain.removed`
- `domain.removed` includes active_user_count_under_domain in payload
- `invite.sent`, `invite.accepted`, `invite.expired`
- `invite.canceled` (canceled_by, original_role, original_email)

*AOR management*
- `aor.level_created` (Project Admin defined a hierarchy level)
- `aor.node_created` (Project Admin added a node to the tree)
- `aor.node_assigned` (user assigned to an AOR node)
- `aor.node_retired` (Project Admin soft-retired a node; node_id, node_code, retired_by in payload)

*Department management (replaces discipline management)*
- `department.created` (department_name, aor_node_ids, manager_title in payload)
- `department.aor_assigned` (AOR node assigned to a department)
- `department.member_added` (user added to department free-agent pool)
- `department.title_assigned` (title assigned to a free agent; assignment_layer in payload)
- `department.title_reassigned` (existing title changed; old_title, new_title in payload)
- `department.superintendent_assigned` (team member assigned to a Superintendent)
- `department.member_removed` (reason required if user had a title)
- `department.title_catalog_updated` (Project Admin or Manager added/modified a title entry)

*Ticket assignment integrity*
- `ticket.assignment_orphaned` (deactivated_user_id, role_on_ticket, ticket_status)
- `ticket.superintendent_orphaned` (deactivated_user_id, aor_node_ids, open_ticket_count)
- `ticket.superintendent_reassigned` (Survey Manager manually updated survey_superintendent_id; old/new IDs, reason)
- `ticket.im_reassigned` (IM-level swap on active ticket; distinct from full ticket.assigned)
- `ticket.pc_approval_stuck` (background job detected 4+ hours in PENDING_PC_APPROVAL)

*Acting grants and vacancy*
- `acting_grant.issued` (user_id, role, trigger, cascade_level, scope)
- `acting_grant.confirmed` (confirmed_by, acting_user_id)
- `acting_grant.overridden` (overridden_by, replacement_user_id)
- `acting_grant.revoked` (revoked_by, permanent_replacement_id)
- `vacancy.no_survey_personnel` (CRITICAL — cascade exhausted; TENANT_ADMIN must act)

*Project lifecycle*
- `project.activated` (activated_by, readiness_check_results in payload)
- `project.archived` (archived_by, open_ticket_count at archival)
- `project.template_applied` (template_id, template_name, applying_user_id)

*Template management*
- `template.created` (created_by, template_name, crew_build)
- `template.updated` (updated_by, fields_changed in payload)
- `template.deleted` (deleted_by — only if no projects reference the template)

*Crew*
- `crew.roster_changed` (Survey Manager or Superintendent reassigns Instrument Man to different Party Chief)

*Help flags*
- `help_flag.raised` (level, raised_by, project recorded)
- `help_flag.escalated` (Level 1 → Level 2; escalated_by and original flag id recorded)
- `help_flag.cleared` (cleared_reason; reassignment id recorded if applicable)
- `help_flag.ticket_claimed` (Party Chief voluntarily claimed a ticket via Level 2 flag pickup)

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
7. **Cancellation Paper Trail** — all three survey-relevant cancellation paths (field-initiated, survey-side, requester-initiated) produce immutable audit records with actors, reasons, and timestamps.
8. **Production Load Balancing** — the help flag system enables field crews to signal overload and self-organize reassignment with Survey Manager visibility, keeping field operations moving without bottlenecking through a single coordinator.

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
- Per-project voluntary pickup approval configuration (parked — post-v1)
- Dig permit dependency/sequencing model
- Scheduling model beyond basic assignment
- Crew roster management UI (parked — needed before Phase 3)
- Admin configuration panels beyond AOR tree and department management
- Redis caching layer (add only if measurable cache pressure emerges)
- Subcontracts Coordinator role subdivision (single role covers v1; divide if multiple coordinators needed in future)
- Attachment deletion (deferred to Phase 4; TENANT_ADMIN-only action when implemented)
- crew_build upgrade path (e.g. Medium → Full post-activation; requires future spec addition; lock is explicit at activation)
- Un-archive project (no un-archive in v1; reactivation requires future spec addition)
- Multi-department membership per user (schema supports it; application layer constraint can be relaxed without migration)
- Hierarchical department structure (sub-departments; add parent_id to departments in future migration)
- Construction Manager pre-assignment of free agents to Superintendents (additive nullable field on department_memberships; no migration required when built)
- Outlook / directory pairing for batch user assignment name pre-population
- Resubmission thread / lineage view (deferred to Phase 4; parent_ticket_id FK is in place)
- Draft expiry email notification at 5 days inactivity (in-app banner covers v1)
- Formal company deactivation UI (schema addition planned for Phase 3 migration; feature UI deferred)

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
- All ticket status transitions must use `SELECT FOR UPDATE` on the ticket row within the transaction — no optimistic locking exceptions
- Cancel initiation guard: if `cancel_initiated_at IS NOT NULL` when a Path C initiation is attempted, return `ConflictError` immediately — do not allow two concurrent cancel chains on the same ticket
- PC reassignment on a `PENDING_PC_APPROVAL` ticket resets the stuck-timer clock (`updated_at` is touched by the reassignment write)

### Testing Requirements for Any Workflow Change
- Happy path
- Invalid state transition
- Unauthorized actor
- Tenant isolation
- Visibility scoping (correct role sees correct tickets, nothing more)
- Cancellation path correctness (correct path taken, correct approver required, correct terminal state reached)

---

## 17. Performance Targets

- Design target: 1,000–50,000 tickets per project
- Low-latency operational dashboards (sub-second for paginated list views)
- AOR tree traversal queries must use recursive CTEs or materialized path — do not traverse in application code
- Mitigation: proper indexing, paginated API responses, pre-aggregated daily rollups if needed
- Do not optimize prematurely — measure first

### Success Criteria (v1)

- Multi-tenant isolation is airtight
- Both workflow variants operate deterministically
- All four cancellation paths produce correct terminal states and audit records
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

**Phase 2 must include before closing:**
- Migration replacing `areas`/`subareas`/`area_memberships` with `aor_levels`/`aor_nodes`/`aor_assignments`
- `SURVEY_LEAD` → `SURVEY_MANAGER` rename in role enum and all use-cases
- `is_priority` boolean → `priority` enum column on tickets
- Full status enum updated to include: `PENDING_PC_APPROVAL`, `DELAYED`, `REQUESTER_CANCELED`, `FIELD_CANCELED`, `SURVEY_CANCELED`; remove `CLOSED` and `CANCEL_REQUESTED`/`CANCEL_APPROVED`/`CANCEL_REJECTED`
- `SURVEY_SUPERINTENDENT`, `DEPARTMENT_MANAGER`, `DEPARTMENT_LEAD`, `SUBCONTRACTS_COORDINATOR`, `PROJECT_ADMIN` added to role enum (visibility scoping logic can land in Phase 3)
- **Pending owner decision before Phase 2 migration:** role enum rename `DISCIPLINE_MANAGER` → `DEPARTMENT_MANAGER` and `DISCIPLINE_LEAD` → `DEPARTMENT_LEAD` (see §7 note)
- `departments`, `department_memberships`, `department_titles` tables added in Phase 2 migration (replaces discipline system entirely — single batch migration)
- `acting_grants` and `project_templates` tables added in Phase 2 migration
- `APPROVER` role enum value removed

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

## 20. Draft Behavior (Requester UX)

Drafts allow a requester to begin a ticket submission, save their progress, and return later to complete and submit it. This section is the definitive specification for all draft-related behavior.

### Saving

- Drafts are saved **only** via an explicit "Save Draft" button — no auto-save.
- Each save updates `draft_last_saved_at` on the ticket row and emits a `ticket.draft_saved` audit event.
- Partial drafts are valid — no field validation is enforced until the requester clicks Submit.
- Full field validation (including the 48-hour rule) runs only at the `DRAFT → SUBMITTED` transition.

### Finding Drafts

- Drafts appear in a **dedicated "Drafts" section** in the requester's UI, separate from their submitted ticket list.
- The submitted ticket list shows all tickets where `status != DRAFT` and `requester_id = their user_id`.
- Drafts and submitted tickets are never mixed in the same list view.

### Draft Cap

- No cap in v1. A requester may have unlimited drafts simultaneously.

### 48-Hour Rule

- The 48-hour minimum notice window is evaluated at **submit time** (`DRAFT → SUBMITTED` transition), not at draft creation.
- The `requested_date` on the draft is validated against the timestamp when the requester clicks Submit.
- If the requester saved a draft with a valid future date but waits too long to submit, the submission will be rejected with a `ValidationError` and they must update `requested_date` before resubmitting.

### Deleting Drafts

- A requester may delete any of their own drafts at any time — no confirmation prompt, no approval required.
- Deletion is a **soft-delete**: sets `draft_deleted_at = now()` and `draft_deleted_reason = REQUESTER_DELETED`.
- Emits `ticket.draft_deleted` audit event.
- The deleted draft is immediately removed from the requester's Drafts section.

### Auto-Expiry

- A background job runs daily and soft-deletes any DRAFT ticket where `draft_last_saved_at < now() - 7 days`.
- Sets `draft_deleted_at = now()`, `draft_deleted_reason = AUTO_EXPIRED`.
- Emits `ticket.draft_expired` audit event.
- No notification is sent to the requester on auto-expiry in v1.
  - **TODO (post-v1):** consider a warning notification at 5 days of inactivity before auto-expiry fires.

### Requester Deactivation or Project Removal

- If a requester is deactivated or removed from a project, all their DRAFT tickets for that project are soft-deleted.
- Sets `draft_deleted_at = now()`, `draft_deleted_reason = USER_DEACTIVATED`.
- Emits `ticket.draft_deleted` audit event with reason recorded in payload.

### PROJECT_ADMIN Recovery

- `PROJECT_ADMIN` can view all soft-deleted drafts within their project (filtered by `draft_deleted_at IS NOT NULL AND draft_deleted_at > now() - 30 days`).
- `PROJECT_ADMIN` may recover a soft-deleted draft within **30 days of soft-deletion** by clearing `draft_deleted_at` and `draft_deleted_reason`. Recovery requires a written reason (min 10 characters).
- Recovery emits `ticket.draft_recovered` audit event with actor and reason recorded.
- `TENANT_ADMIN` has **no** direct draft recovery capability. Draft recovery is a project-level concern.

### 30-Day Hard-Delete Window

- A background job runs daily. Any soft-deleted draft where `draft_deleted_at < now() - 30 days` is **permanently hard-deleted** from the database.
- Hard deletion is irreversible. No recovery path exists after this point.
- Emits `ticket.draft_hard_deleted` audit event with `ticket_id` and `draft_deleted_reason` in payload before deletion.
- Attachments on hard-deleted drafts are also purged from object storage by the same job pass.

### Orphaned Attachment Cleanup

The daily background job also sweeps for orphaned attachment objects in storage — storage objects whose `storage_key` no longer has a corresponding row in the `attachments` table (created by failed mid-upload sessions or hard-deleted draft purges). These are deleted from object storage silently. No audit event is required for orphan cleanup.

### Requester Visibility of Submitted Tickets

- Requesters can see all their own tickets at any status — SUBMITTED, APPROVED, REJECTED, ASSIGNED, IN_PROGRESS, etc.
- There is no status filter that hides tickets from the requester once submitted. A requester always knows the current status of their own requests.

---

## 21. Project Lifecycle, Resubmission, and Status Display

### Project States

Projects have three states stored in `projects.status`:

| State | Description |
|---|---|
| `SETUP` | Default on creation. Configuration in progress. Tickets cannot be submitted. |
| `ACTIVE` | Operational. Tickets can be submitted, approved, and executed. |
| `ARCHIVED` | Terminal in v1. Read-only for ticket operations. No new tickets, no role changes, no AOR or roster modifications. Reports remain generatable. All history, audit logs, and attachments remain accessible. No un-archive in v1. |

Transition `SETUP → ACTIVE` is triggered by TENANT_ADMIN or PROJECT_ADMIN. Transition `ACTIVE → ARCHIVED` is TENANT_ADMIN only.

### SETUP → ACTIVE Readiness Gate

The activation gate is **build-aware** — requirements differ by `projects.crew_build`. All hard requirements must pass before the transition is allowed. Soft requirements produce warnings that must be acknowledged before activation proceeds. No partial activation.

**Hard requirements (blocking — all builds):**
- At least one `aor_level` exists for the project.
- At least one `aor_node` exists for the project.
- At least one user with role `SURVEY_MANAGER` is an active project member.

**Hard requirements (blocking — Full Build only):**
- At least one Survey Superintendent is assigned to at least one AOR node.

**Soft requirements (warned, not blocking — all builds):**
- At least one department exists for the project.
- `designated_acting_for = SURVEY_MANAGER` is set on at least one project membership.
- At least one `allowed_domain` is configured (warn if absent — all users will require manual invites).

The `project.activated` audit event includes `readiness_check_results` (summary of warnings acknowledged) in payload.

### Setup Ownership — TENANT_ADMIN vs PROJECT_ADMIN

| Step | Owner | Action | Prerequisite |
|---|---|---|---|
| 1 | TENANT_ADMIN | Creates project record, selects template or blank, sets crew_build | None |
| 2 | Project Admin | Creates AOR hierarchy (levels + nodes) | Step 1 complete |
| 3 | Project Admin | Creates departments | Step 2 complete |
| 4 | Project Admin | Builds title catalog per department | Step 3 complete |
| 5 | Project Admin | Assigns Department Managers | Step 4 complete |
| 6 | Project Admin | Invites and bulk-assigns users; free agents placed in department pool | Step 5 complete |
| 7 | Project Admin | Configures priority whitelist | Step 6 complete |
| 8 | Project Admin | Assigns Survey Manager to project | Step 6 complete |
| 8a | Project Admin / Survey Manager | Assigns Survey Superintendents to AOR nodes (Full Build only) | Step 8 complete |
| 9 | Survey Manager | Seeds crew roster | Step 8a (Full Build) or Step 8 (other builds) |
| 10 | Project Admin / Survey Manager | Configures acting designees | Step 8 complete |
| 11 | TENANT_ADMIN or Project Admin | Activates project (readiness gate runs) | All hard requirements met |

**Note:** During SETUP, PROJECT_ADMIN may exercise TENANT_ADMIN setup functions for that project (template selection, domain configuration, user invitations). This elevated authority expires when the project transitions to ACTIVE.

### Resubmission Flow (Rejected Tickets)

When a requester submits a new ticket in response to a rejection:

1. A new ticket is created with `status = DRAFT`.
2. `parent_ticket_id` is set to the rejected ticket's UUID. This is a single-level FK — chain resolution is a Phase 4 concern.
3. The following fields are pre-populated from the rejected ticket: `aor_node_id`, `ticket_type`, `department_id`, `craft`, `description`.
4. The following fields are **not** carried over: `requested_date`, attachments, `priority`.
5. The requester must set a new `requested_date` and re-attach files if needed.
6. The resubmission creates a new `ticket_number` at `DRAFT → SUBMITTED` transition.

**AOR retired case:** If the original ticket's `aor_node_id` points to a node where `retired_at IS NOT NULL`, the resubmission draft still pre-populates `aor_node_id` with the retired node. A banner informs the requester that the selected AOR area may have changed and they should confirm the location before submitting. The requester may proceed with the retired node or select a different active node.

### Status Display Map

Status codes are never displayed raw. All statuses are communicated using plain-language labels.

| Internal Status | Display Label |
|---|---|
| `DRAFT` | Draft |
| `SUBMITTED` | Pending Review |
| `APPROVED` | Approved — Awaiting Assignment |
| `REJECTED` | Not Approved |
| `ASSIGNED` | Scheduled |
| `IN_PROGRESS` | In Progress |
| `PENDING_PC_APPROVAL` | Under Review by Survey Lead |
| `DELAYED` | Delayed |
| `COMPLETED` | Completed |
| `REQUESTER_CANCELED` | Canceled by You |
| `FIELD_CANCELED` | Canceled — Field Conditions |
| `SURVEY_CANCELED` | Canceled by Survey Team |

**Rule:** `PENDING_PC_APPROVAL` is never displayed to Requesters by this label. The display label "Under Review by Survey Lead" is the only string that reaches the Requester surface. The internal status name must not leak into notification copy, email subjects, or UI text visible to Requesters.

---

## 22. User Lifecycle

### Deactivation Cascade

When a user is deactivated (by TENANT_ADMIN):

**Synchronous effects (same operation, before response is returned):**
- All active sessions for the user are invalidated.
- All DRAFT tickets owned by the user across all projects are soft-deleted. `draft_deleted_reason = USER_DEACTIVATED`. Emits `ticket.draft_deleted` per draft.
- All `aor_assignments` rows for the user have `deactivated_at = now()` set.
- All `crew_rosters` rows where the user appears have `deactivated_at = now()` set.
- Sets `users.deactivated_at = now()` and `users.deactivated_by = actor_id`.

**Asynchronous effects (notification worker, immediate queue after synchronous completes):**
- Vacancy detection fires for each critical role the user held on each active project.
- Orphaned assignment notifications sent to relevant supervisors (`ticket.assignment_orphaned` per affected ticket).
- `user.deactivated` audit event emitted with `affected_open_ticket_count` and `affected_roles` in payload.

**What deactivation does not do:**
- Project membership rows are not deleted — they are historical record.
- Whitelist entries for the user's email are not automatically removed. TENANT_ADMIN removes them manually if appropriate.
- Active ticket assignments are not automatically reassigned — flagged as orphaned and surfaced to the relevant supervisor.

### Survey Manager Removal — Hard Gate

When the current Survey Manager on an active project is deactivated, demoted, or removed, the system **blocks the action** until a replacement or acting Survey Manager is designated.

The block applies to: user deactivation where the user holds `SURVEY_MANAGER` on any active project; role change away from `SURVEY_MANAGER` on an active project; project membership removal where the user holds `SURVEY_MANAGER`.

In each case the system returns `ForbiddenError` listing affected projects and requiring replacement designation before proceeding. Emits `user.removal_blocked` audit event.

Once a permanent replacement or acting grant is in place, the original action proceeds.

### Reactivation

Reactivation restores login access. It does **not** restore cascaded effects:
- Soft-deleted drafts remain soft-deleted. PROJECT_ADMIN recovers individually within the 30-day window.
- Orphaned ticket assignments remain unassigned — re-establish manually.
- Inactivated AOR assignments and crew roster entries remain inactive — re-establish by Survey Manager or Superintendent.
- Emits `user.reactivated` audit event.

### Role Changes

Role changes affect only future permission checks. Existing ticket assignments are not automatically changed. The Survey Manager hard gate applies to any role change away from `SURVEY_MANAGER` on an active project.

---

## 23. TENANT_ADMIN Surfaces

TENANT_ADMIN is not a ticket operator. Their surfaces are health monitoring, configuration, and user management — not day-to-day ticket management.

### Tenant Dashboard

One row per project within the tenant.

**Per-project row displays:**
- Project identity: name, `crew_build`, status (SETUP / ACTIVE / ARCHIVED), activation date or creation date if still in SETUP.
- Ticket health snapshot (ACTIVE projects only): open ticket counts by status bucket — Submitted, Approved, Assigned+In-Progress, Pending PC Approval, Delayed, combined canceled count.
- Stale ticket alerts: counts of tickets exceeding hard-coded thresholds — SUBMITTED > 24 hours; APPROVED > 48 hours; PENDING_PC_APPROVAL > 4 hours. Non-zero renders as a visual alert on the project row.
- Active help flags: count of active Level 2 flags. Level 1 flags are crew-internal and not surfaced here.
- Vacancy and acting grant alerts: active acting grants labeled with person, role, and age (time since granted).

### Audit Log Surface

TENANT_ADMIN can view the full audit log across all projects within their tenant. Filterable by: project, event type, actor, date range. All `ticket_events` rows are accessible. Export to CSV in v1. No redaction — TENANT_ADMIN sees full payloads.

### Ticket Access

TENANT_ADMIN has read-only access to all tickets across all tenant projects for audit and support purposes. They may not approve, reject, assign, or take any workflow action. Ticket detail view is read-only.

### Invite Management

TENANT_ADMIN may: send invites, view pending invites (accepted_at IS NULL AND canceled_at IS NULL AND expires_at > now()), cancel pending invites (sets `canceled_at`, emits `invite.canceled`), and view accepted and expired invite history. Canceling an invite does not affect users who already accepted — it only prevents future use of the token.

### Template Management

TENANT_ADMIN creates, edits, and deletes project templates. Templates may not be deleted if any project references them (`template_id IS NOT NULL`). Deletion of referenced templates returns `ConflictError` listing referencing projects.

Template management surface shows: template name, crew build, AOR depth, number of AOR levels, number of discipline groups, number of projects using this template, created date.

---

## 24. Role Vacancy and Operational Continuity

### Design Principle

Work cannot stop because of one person. When a critical role is vacated, the system acts immediately to keep in-flight work moving, then requires human confirmation to correct or formalize the interim arrangement. Acting grants are always temporary, always scoped, always visible, and always audited. No permanent decisions are made automatically.

### Three-Layer Response Model

**Layer 1 — Automatic Immediate Action** (fires on vacancy detection, no human required)
- Acting authority granted to the next person in the survey hierarchy cascade via `acting_grants`.
- Pending gate actions requiring the vacated role are rerouted to the next authority.
- Orphaned assignment notifications sent to relevant supervisors.
- `acting_grant.issued` and vacancy audit events emitted.

**Layer 2 — Supervised Resolution Window** (human must confirm or override)
- Tier 1 vacancies (Survey Manager): TENANT_ADMIN or PROJECT_ADMIN must confirm or override within 24 hours.
- Tier 2 vacancies (Party Chief, Instrument Man): 48-hour notification window. No hard deadline — daily escalating notifications fire if unresolved.
- Acting authority from Layer 1 continues during this window. Work does not stop.

**Layer 3 — Escalation** (window expired, vacancy unresolved)
- Daily notifications to TENANT_ADMIN and PROJECT_ADMIN.
- Acting arrangements from Layer 1 continue indefinitely.
- No automatic further action.

### Survey Hierarchy Cascade

`designated_acting_for` takes priority over tenure regardless of join date. Seniority = earliest `project_memberships.created_at` for the relevant role.

```
SURVEY_MANAGER vacant:
  1. Designated acting SM (project_memberships.designated_acting_for = SURVEY_MANAGER)
  2. Most senior Survey Superintendent by project tenure  [Full Build only]
  3. Most senior Party Chief by project tenure
  4. Most senior Instrument Man by project tenure
  5. CRITICAL ALERT → TENANT_ADMIN and PROJECT_ADMIN
     vacancy.no_survey_personnel emitted — workflow gates have no actor

SURVEY_SUPERINTENDENT vacant (per AOR) [Full Build only]:
  1. Designated acting Superintendent for that AOR (if configured)
  2. Survey Manager absorbs Superintendent gates directly (no new grant needed)
  3. Most senior Party Chief within that AOR by project tenure
  4. Notification to TENANT_ADMIN / PROJECT_ADMIN — AOR has no coverage below SM level
```

### Survey Manager Approval Authority

**Trigger 1 — Normal path.** Survey Manager approves and rejects tickets directly. This is their primary authority, not a fallback.

**Trigger 2 — 24-hour timeout.** A ticket in SUBMITTED status > 24 hours without action triggers escalating notifications to the Survey Manager. Not a second approver — a production health signal.
- At 18 hours: nudge notification fires. Audit event: `approver.timeout_warning_sent`.
- At 24 hours: second notification fires with higher urgency. Audit event: `approver.timeout_unlocked`.
- Threshold checks run at query time against `submitted_at`. No background job, no state change on the ticket.

**Self-conflict constraint:** Survey Manager may not approve, reject, or override-approve a ticket where `survey_manager_id = their own user_id`. Returns `ForbiddenError`.

### Party Chief Vacancy

**Layer 1 — Automatic:**
- All `PENDING_PC_APPROVAL` tickets where this Party Chief is the designated approver immediately route to the Survey Superintendent (or Survey Manager if no Superintendent / Slim Build). Uses existing `ticket.pc_approval_overridden` mechanism.
- All ASSIGNED and IN_PROGRESS tickets with this Party Chief as `assigned_party_chief_id` are flagged orphaned. `ticket.assignment_orphaned` emitted per ticket.
- Instrument Men under this Party Chief are notified their crew lead has changed.

**Layer 2 — Human resolution:** Survey Manager or Superintendent reassigns orphaned tickets and designates a new Party Chief. No automated reassignment.

### PENDING_PC_APPROVAL Stuck State

A ticket stuck in `PENDING_PC_APPROVAL` for more than **4 hours** is surfaced as a production health signal (hard-coded; not configurable).

- Background job runs every **30 minutes** and emits `ticket.pc_approval_stuck` for each ticket exceeding the threshold.
- Survey Manager dashboard shows a stale alert badge on stuck tickets.
- Override path: Survey Manager or Superintendent may act directly on any stuck `PENDING_PC_APPROVAL` ticket. Logged as `ticket.pc_approval_overridden`.
- PC reassignment on a `PENDING_PC_APPROVAL` ticket resets the stuck-timer clock (`updated_at` is touched by the reassignment write).

---

*Last updated: Experience_Specs.md integration complete. Changes in this revision: APPROVER role eliminated (Survey Manager is sole approval authority); discipline model replaced by unified department model (departments, department_memberships, department_titles); draft recovery moved from TENANT_ADMIN to PROJECT_ADMIN with 30-day hard-delete window; crew build configurations added (FULL/MEDIUM/SLIM); acting_grants and project_templates tables added; project lifecycle states defined (SETUP/ACTIVE/ARCHIVED); resubmission flow specified; status display map added; user lifecycle deactivation cascade specified; TENANT_ADMIN surfaces specified; role vacancy and operational continuity model specified (Sections 21–24). Schema additions for Phase 2 migration: departments, department_memberships, department_titles, acting_grants, project_templates, priority_whitelist unique constraint, projects.crew_build/template_id/status enum/activated_at/archived_at, users.deactivated_at, crew_rosters.deactivated_at, aor_assignments.deactivated_at/department_id, project_memberships.designated_acting_for, invites.canceled_at, tickets.department_id/rejected_at/cancel_initiated_at, help_flags.affected_ticket_ids, aor_nodes.retired_at.*
