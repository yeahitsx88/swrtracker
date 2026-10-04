# SWRTracker development and verification

SWRTracker is a modular monolith for construction Survey work requests. Next.js App Router serves React UI and HTTP routes; TypeScript application/domain modules use PostgreSQL repositories. Private attachments are served through parent-authorized APIs. Ticket and administrative evidence accompany mutations in the same transaction. Workers dispatch notification and encrypted password-reset outboxes.

## Read first

- [AGENTS.md](AGENTS.md): safe work and authority order.
- [Approved requirements](REQUIREMENTS_ADCQ-260923-001.md) and [decision log](worklogs/LEAD_DECISION_LOG.md), including Decisions 44–50: current product rules.
- [CLAUDE.md](CLAUDE.md): architecture and unaffected historical specification.
- [CODEX.md](CODEX.md): implementation history and restart point.
- [DEPLOYMENT.md](DEPLOYMENT.md): migration, attachment, ingress and worker contracts.
- [Alpha 1 report](../audits/alpha1/REPORT.md): audit register and verification.
- [Alpha 1 design reference](design/alpha1/README.md): complete design change inventory, checkpoints and future Alpha 2 integration with continuing hardening work.

## Toolchain and local setup

Use **Node 22.23.3**, **pnpm 11.19.0** and **PostgreSQL 15**. Docker pins Node; packageManager pins pnpm. A newer host Node does not establish pinned runtime compatibility.

~~~sh
corepack enable
pnpm install --frozen-lockfile
~~~

Provision a dedicated development database with a generated password and loopback binding. Supply POSTGRES_PASSWORD in the shell before:

~~~sh
docker run --name swr-dev-db -e POSTGRES_PASSWORD -e POSTGRES_DB=survey_dev -p 127.0.0.1:5432:5432 -d postgres:15
~~~

Copy .env.example to .env (PowerShell: Copy-Item .env.example .env), set DATABASE_URL and a generated JWT_SECRET, then:

~~~sh
pnpm db:migrate
pnpm dev
~~~

Migrations do not bootstrap an administrator. Self-registration is closed; use approved operator bootstrap/seed procedures only in a newly owned disposable database. Never replay beta seed/reset scripts against retained customer data. Device-local procedures and boundaries: [AMELIA_PRIVATE_BETA.md](AMELIA_PRIVATE_BETA.md).

## Verification

~~~sh
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod --audit-level=high
docker build -t swrtracker:alpha1 .
~~~

pnpm test discovers *.test.ts with Node's test runner and tsx; opt-in PostgreSQL/HTTP/browser acceptance is separate. No lint tool is configured. Type checking also checks unused locals/parameters.

For PostgreSQL acceptance, provision a **disposable** database named **swr_team_isolated**, bound to **127.0.0.1:15489**. Set DATABASE_URL to that exact location and SWR_TEAM_POSTGRES=1, then:

~~~sh
pnpm test:postgres
~~~

The runner initializes only an entirely empty public schema, then runs 28 suites in owned schemas, including authenticated project employee provisioning. It never upgrades retained public schemas. Explicit historical migration assertions remain historical; runtime fixtures apply current migrations. [Test standards](skills/test-standards.md) describe real database and negative-case evidence.

HTTP/browser acceptance requires a separate fixture and production runtime wired to its generated schema. tests/beta/scoped-offboarding-acceptance.mjs setup creates the schema and private .local-runtime.env; it requires .local-test.env. Supply SWR_ACCEPTANCE_ORIGIN as a loopback URL, that runtime's JWT_SECRET, and SWR_PLAYWRIGHT_MODULE pointing to an existing Playwright ESM module. Run scoped-offboarding-case-matrix.mjs external, then report: all 55 named cases require the same current source/migration digest. The acceptance cleanup mode removes only the fixture's owned schema. Keep credentials and runtime files ignored.

The additional `tests/beta/admin-workflows-http.mjs` and `admin-workflows-browser.mjs` runners require the explicitly owned custom restoration fixture/runtime, `SWR_ADMIN_RESTORATION=1`, its fixture manifest and a local retained-demo manifest proving different schemas. Their recorded database guard is task-specific (`127.0.0.1:15493/swr_team_isolated`); generic acceptance setup alone does not provision the restoration fixture fields. Follow [restoration verification boundaries](design/alpha1/administration-restoration.md#verification-and-limitations) before running them. Use fresh owned mutation fixtures, matching runtime/JWT settings and the existing Playwright/Edge installation; these are not generic clean-clone commands or permission to reuse retained demo data.

## Repository map

| Path | Purpose |
|---|---|
| src/app/ | App Router pages and HTTP adapters |
| src/components/, src/lib/ | UI, session/request/transaction utilities |
| src/modules/ | Identity, Tenancy, Ticket, Workflow, Attachment, Notification, Reporting, Audit |
| src/workers/ | Notification and administrative outbox entry points |
| db/migrations/ | Sequential schema changes; db/migrate.ts records applied files |
| tests/ | Module tests and opt-in beta acceptance |
| scripts/ | Test discovery, guarded acceptance, local beta tools |
| docs/, audits/ | Decisions, operator guidance, historical evidence |

JWT sessions revalidate account/session version and current membership. Independent Project Admin grants do not replace operational roles; Central/Tenant IT does not gain request visibility merely through TENANT_ADMIN. Domain reads apply tenant/project/company/actor scope. Lifecycle writers take the tenant barrier before domain/idempotency locks and revalidate authority before replay.

Keep .env*, .local*, .data/, build caches, stores and new screenshots ignored. Prior reports are historical evidence; current verification writes ignored output or a newly named artifact.
