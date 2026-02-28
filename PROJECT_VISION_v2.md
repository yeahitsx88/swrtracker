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
- Each Project contains tickets, users, areas, crafts, and crew rosters
- Tenants are strictly isolated — no cross-tenant visibility

### User Roles

Roles are fixed for v1 implementation but the role model is intentionally extensible. See CLAUDE.md Section 7 for the full role list and Section 7A for the visibility model.

**Tenant-level:** Tenant Admin, Billing Viewer

**Project-level:** Approver, Survey Lead, Party Chief, Instrument Man, CAD Lead, CAD Technician, Requester, Viewer, Area Viewer (Area Construction Manager)

### Authentication

- Email/password (bcrypt) for v1
- Self-registration via company email domain matching (allowed_domains table)
- Invite-based onboarding for external parties without a matching domain
- SSO (Microsoft Entra ID, Google Workspace) deferred to post-v1 — schema is future-proofed

### Access Flow

All entry points — including the request submission URL — go through standard authentication. No anonymous submission. No QR-specific logic. The URL itself is the access point; auth handles the rest.

---

## Workflow Variants (v1 — Strictly Limited)

Only two workflow variants exist in v1. No dynamic workflow builder. No custom state creation.

### Variant 1 — Standard Approval

Used for planned survey work requiring review before field execution.

```
DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
                  ↘ REJECTED (with written reason, resubmission creates new linked ticket)
ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED / CANCEL_REJECTED
```

- 48-hour minimum notice enforced at submission (hard business rule, not configurable)
- Rejection requires written reason; resubmission links back via parent_ticket_id
- Rejection override (REJECTED → APPROVED) available to Approver with written reason
- Cancellation requires Approver or Survey Lead sign-off

### Variant 2 — Direct Assignment

Used for urgent or pre-authorized work.

```
CREATED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED / CANCEL_REJECTED
```

- No approval gate — auto-proceeds to ASSIGNED
- Survey Lead assigns crew immediately

---

## Ticket Requirements

Each ticket supports: Project, Area, Subarea, Ticket Type (Layout / Check-Out / As-Built / Topo / Permit), Craft, Requester, Assigned Party Chief, Assigned Instrument Man (optional), Status, Timestamps (created, approved, assigned, started, completed, closed), Attachments (.dwg, .dxf, .csv, photos), Comment thread, Immutable event history.

Human-readable ticket numbers follow the format `FSS-[AREA_CODE]-[SEQUENCE]` (e.g. FSS-U1-00247).

---

## Priority System

Priority is an internal operational flag — requesters cannot set it.

- **Automatic:** senior management whitelist maintained by Tenant Admin; matching submission auto-sets priority
- **Manual:** Survey Lead or Approver may elevate post-submission with written reason

---

## Production Load Balancing — Help Flag System

Field crews can fall behind on production. A two-level help flag system enables overload signaling and self-organized reassignment.

- **Level 1 (crew-internal):** Instrument Man flags overload → visible to their Party Chief and crew only
- **Level 2 (department-wide):** Party Chief flags overload (or escalates a Level 1) → visible to Survey Lead and all Party Chiefs
- Any Party Chief may voluntarily claim a Level 2 flagged ticket directly (Survey Lead notified)
- Requester is notified whenever their ticket's assigned Party Chief changes

---

## Visibility Model

- **Full:** Tenant Admin, Survey Lead, Approver, CAD Lead, CAD Technician, Viewer
- **Area-scoped:** Area Viewer (Area Construction Manager) — sees only their assigned areas
- **Assignment-scoped:** Party Chief (own tickets), Instrument Man (Party Chief's tickets + own explicit assignments)
- **Own only:** Requester — sees only tickets they submitted, regardless of company

Subcontractor users are additionally filtered to their own company's tickets.

---

## Reporting (Operational Only)

v1 includes: Open vs Closed by Project, Requests by Area, Requests by Craft, Crew workload, Daily summary report per project.

v1 does NOT include: Custom report builders, cross-tenant analytics, predictive modeling, SLA enforcement engine.

---

## Security & Isolation

- Authentication: email/password (v1), SSO future-proofed
- Authorization: RBAC enforced at application/use-case layer
- All queries scoped by tenant_id
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

SSO/SCIM, custom workflow builder, configurable states/roles, cross-project analytics, SLA engine, in-browser DWG viewer, Procore/Autodesk/Teams/Primavera integrations, multi-step approval trees, admin config panels, dig permit sequencing, scheduling beyond basic assignment, crew roster management UI, per-project pickup approval config, Redis.

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

*v2 supersedes the original PDF. Key changes from v1: QR scan removed (standard auth handles all entry points); roles model made extensible; visibility model formalized; crew roster model defined; priority flag system added; help flag / load balancing system added; ticket types defined; CAD sub-track documented; SSO deferred but schema future-proofed; CLOSED terminal state added; Redis deferred; performance targets carried forward from original.*
