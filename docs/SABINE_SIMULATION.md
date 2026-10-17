# Sabine local simulation

This is a device-local demonstration using an anonymized SharePoint-list snapshot, not an operational migration or an account of actual employee performance. It does not send email. Original exports are unchanged and not checked into Git.

## Start and verify

From the Phase 5 worktree, with Docker running and the anonymized `.data/sabine/snapshot.json` already prepared:

```sh
node scripts/sabine-runtime.mjs setup
docker build -t swrtracker:sabine-linux .
node scripts/sabine-runtime.mjs start
```

Open http://127.0.0.1:3106/login. The tenant ID and randomly generated demo password are in `.data/sabine/ACCESS.md`. Begin with `manager@sabine.example`.

```sh
node scripts/verify-sabine.mjs
```

The verifier compares exact live-request IDs for six representative accounts, then checks all 84 live detail URLs for each account (504 allowed/denied checks). Out-of-scope detail reads must return 404 without a ticket or capability payload. It also verifies that a sampled historical detail exposes no edit, submit, cancel, follow-up, or upload capabilities for each account. These are read-access checks against this flat-AOR seed, not proof of HTTP mutation enforcement, cross-tenant isolation, descendant-AOR coverage, or every account's access.

For a database-backed lifecycle check that leaves the practice cases unchanged, run in PowerShell:

```powershell
$env:SWR_SABINE_ROLLBACK_SMOKE = '1'
node --import tsx tests/beta/sabine-workflow-smoke.ts
```

This explicitly guarded check creates its own requests inside one transaction, verifies same-record correction/resubmission, captured inability reviewer, direct Instrument Man completion, requester cancellation, wrong-role/owner/tenant rejection, and rollback after an injected audit-write failure. It then rolls everything back and checks that no test tickets, audit events, or outbox messages remain. It is application/database validation, not a browser or HTTP mutation test.

Setup is atomic and refuses a nonempty unrelated database. Rerunning setup preserves the seeded tenant, edits, password, and JWT. It does not reset the demo. The verifier checks the initial seed; expected counts may change after manual practice.

The web server runs in the background as the non-root Linux container `swrtracker-sabine-web`, using Node 22.23.3. The image build runs TypeScript, the full test suite, and the production build before producing the image. Windows is only the launcher host; native Windows attachment storage is not the supported runtime.

Run `node scripts/sabine-runtime.mjs stop` to stop both simulation containers. PostgreSQL data remains in Docker volume `swrtracker-sabine-simulation-data`; attachment bytes remain in `swrtracker-sabine-attachments`. Starting again preserves both. No automatic deletion or reset is supplied.

After rebuilding an image, the launcher refuses to reuse a container with an older image. Verify the existing web container's `swrtracker.simulation=sabine` label, stop and remove only that web container (never its volumes), then run `start` again. The database does not need to be recreated. The launcher also refuses migration when the old native attachment directory is nonempty: transfer and verify those bytes first.

## Separate live HTTP acceptance

The opt-in HTTP test uses the existing fictional Amelia fixtures in a newly created database, not Sabine's snapshot or credentials. Build both images from the same checkout before running it; leave loopback port 3107 free:

```powershell
docker build -t swrtracker:sabine-linux .
docker build --target builder -t swrtracker:sabine-checks .
$env:SWR_LINUX_HTTP_SMOKE = '1'
node tests/beta/linux-http-smoke.mjs
```

It exercises real HTTP create/retry/mismatched retry, owner-only correction, upload, submit, return/resubmit, approval replay, assignment, start, direct completion, sealed-upload rejection, and download. It reconciles audit counts and attachment metadata against stored files. It does not test browser mutations, all roles, cross-tenant attacks, field-inability HTTP paths, concurrency, or crash durability.

Each run uses uniquely named `swr-http-…` resources labeled `swrtracker.validation=linux-http`, random infrastructure secrets, a non-public database, and a loopback-only web server. It stops only its own containers on exit. Containers, network, and PostgreSQL/attachment volumes are retained for diagnosis and consume disk until explicitly cleaned up; no reset or deletion is performed. The fixed fictional beta login is confined to this local test. No workers or email transport are started.

## Isolation and staffing

- Dedicated labeled PostgreSQL 15 container `swrtracker-sabine-simulation`, bound only to `127.0.0.1:15488`; web bound only to `127.0.0.1:3106`.
- Existing `survey-db` and other app containers are not changed.
- Web and database communicate through the dedicated labeled `swrtracker-sabine-network`. The image excludes `.data`, local environment files, and workspace metadata; credentials are supplied at container creation, not baked into image layers. Axiom artwork and fonts are included as public assets.
- 1 Survey Manager, 5 Survey Superintendents, 42 Party Chiefs, and 126 fictional Instrument Men (3 per chief). The user approved interpreting the 42 distinct AssignedtoId accounts as Party Chiefs.
- 459 requester identities, including an explicit unknown-source requester, plus Project IT.
- Superintendent coverage: Train 1, Train 2, Train 3, Utilities/Flare/Offsite, Brownfield. Laydown and unclassified areas are assigned to Utilities/Offsite as a simulation assumption. Chief home areas are inferred from their most frequent source area; they are not verified historical reporting lines.
- All staff accounts use the reserved `sabine.example` domain. Source names, emails, phones, free-text notes, descriptions, source links, and attachment metadata are not copied. Source request IDs remain for local reconciliation; this is not a claim of irreversible anonymization suitable for public release.
- `.data/` is Git-ignored. Windows files are restricted to the current OS user by ACL; Docker administrators still control database volumes. Do not share `runtime.json`.

## Projects and source fidelity

**Sabine — historical simulation (read-only):** 20,025 supported list rows, one per unique SharePoint list ID. All memberships are VIEWER; the project remains ACTIVE solely so the existing launcher lists it. Historical records have a single clearly labeled import-creation audit event, not invented approval or assignment histories. Source field and CAD statuses remain in the description and event metadata.

The complete sanitized snapshot contains 20,199 rows. The 174 rows with Levee Work, CAD Support, Machine Control, or unknown types remain there rather than being silently coerced to an unrelated supported category. No production enum/schema was changed. Forms responses are not merged: their reference formats and duplicate references do not establish safe one-to-one matches.

Historical Canceled maps to SURVEY_CANCELED only for display; cancellation actor/path is unknown and explicitly labeled. Unsupported CAD states (Canceled, Delayed, Unknown) are retained in snapshot metadata and descriptions without fabricated CAD rows. Historical Instrument Man assignments are deterministic simulations. Missing or invalid completion dates are generated deterministically around Need-By with a 5% long-delay branch, never before the request date. Original timestamps are treated as calendar dates; exact source time zones are not inferred. Metrics involving these dates are demonstration metrics only.

**Sabine — live simulation:** 84 practice cases (14 each: submitted, returned for correction, approved, assigned, in progress, completed). These are based on supported source area/type combinations but use current dates, synthetic prose, and real application use-cases that create atomic audit, assignment, return, and notification-outbox records. Roles retain existing permissions. No notification worker or external transport is launched.

The live project can be explored using `super1@sabine.example` through `super5@sabine.example`, `chief1@sabine.example` through `chief42@sabine.example`, `im1.1@sabine.example` through `im42.3@sabine.example`, and `requester0@sabine.example`. Project IT (`admin@sabine.example`) has no inherent live-ticket visibility.

## Area-delegated review

The owner approved Area-delegated review. Sabine's five Superintendents have 11 explicit `SURVEY_REVIEWER` grants matching their existing live-project Area coverage. The Survey Manager retains project-wide review. An active grant is required for Superintendent approval and pre-assignment returns; title alone is insufficient. The grant is locked during the transaction and its identity/scope is captured in the transition audit payload. Existing field-inability reviewer snapshots are unchanged.

The one-time, opt-in grant command is:

```powershell
$env:SWR_GRANT_SABINE_REVIEW = '1'
node scripts/grant-sabine-review.mjs
```

It audits new grants, skips existing active grants, and refuses to recreate previously revoked grants. It does not change the historical project. It is not a general grant-administration UI. Chief coordinator queues/eligibility remain follow-up work; no chief grant is inferred from historical source assignments.

## Current boundaries

This is fixture tooling, not a production import service. No attachments are imported. Source-specific extraction was performed with a local read-only workbook analysis script outside the repository; the sanitized snapshot is required to reproduce this particular seed. All 248 tests, including unchanged file/directory permission assertions, pass in Linux Node 22.23.3. The native Windows permission limitation remains; Linux validation does not establish a Windows ACL contract or complete production-release acceptance.
