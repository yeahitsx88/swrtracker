# swrtracker

Field Survey Support Ticketing Platform — multi-tenant, enterprise-grade work request management for industrial construction projects.

## What This Is

A structured ticketing system purpose-built for survey support operations on large construction sites. Replaces email and spreadsheets with auditable intake, approval, crew assignment, and completion workflows.

Built for the energy sector GC environment. Not a generic helpdesk tool.

## Tech Stack

- **Frontend:** Next.js (React)
- **Backend:** Node.js + TypeScript
- **Database:** PostgreSQL
- **Hosting:** Railway
- **Auth:** Email + password (bcrypt), SSO-ready schema

## Quick Start (Local Development)

```bash
# Prerequisites: node >= 20, Docker or local PostgreSQL, pnpm

# Start database
docker run --name survey-db -e POSTGRES_PASSWORD=localdev -p 5432:5432 -d postgres

# Environment
cp .env.example .env
# Set DATABASE_URL=postgresql://postgres:localdev@localhost:5432/survey_dev

# Install and run
pnpm install
pnpm dev
```

## Architecture

Modular monolith. Single deployable application with strict internal module boundaries.

```
web → application → domain
infrastructure → application (via interfaces)
```

Modules: Identity, Tenancy, Ticket, Workflow, Attachment, Notification, Reporting, Audit.

## Current Status

| Phase | Focus | Status |
|---|---|---|
| 0 | Stack, hosting, first tenant | ✅ Complete |
| 1 | Data model + core backend | ✅ Complete |
| 2 | Workflow variants, API | 🔄 In Progress |
| 3 | Field-first mobile UI | Pending |
| 4 | Traceability + reporting | Pending |
| 5 | Integrations + scheduling | Pending |

## Documentation

- **CLAUDE.md** — implementation source of truth, architecture decisions, data model, workflow rules
- **PROJECT_VISION_v2.md** — product and business narrative