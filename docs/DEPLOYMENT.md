# Deployment Guide

## Alpha 1 migration and release gate

Apply pending migrations through034 before the Alpha1 application starts. Migration033 gates recommissioning; an older runtime must not resume against a preparing project. Migration034 refuses inconsistent ticket/event tenant ownership without repair. Investigate and obtain an explicit operational resolution; never delete evidence to force success. It adds immutable update/delete/truncate protection and a tenant-bound ticket FK while preserving existing worker actor attribution.

Run one migration operator at a time. Database owners/superusers can bypass triggers; application roles should not own tables. Use current [verification commands](README.md) and the [Alpha1 report](../audits/alpha1/REPORT.md). Hosted backup/restore, ingress/source limiting, mail and support recovery remain separate beta gates.

Login counters are stored only for existing local-password accounts. The worker prunes inactive counters older than one day while preserving active lockouts. Webhook calls abort after ten seconds; uncertain delivery may have succeeded remotely, so receivers must deduplicate using existing message identifiers. External delivery is not transactionally atomic with PostgreSQL.

## Runtime Contracts

Required:
- `DATABASE_URL`
- `JWT_SECRET`

Recommended:
- `APP_BASE_URL` (used for password reset link generation)
- `SYSTEM_ACTOR_ID` (worker actor for audit events; defaults to static UUID)
- `NOTIFICATION_WORKER_INTERVAL_SECONDS` (default `300`)
- `EMAIL_WEBHOOK_URL` (required for usable password reset email; without it, encrypted reset messages stay queued and retry until they expire)
- `EMAIL_WEBHOOK_API_KEY` (optional bearer token for webhook transport)
- `TRUST_PROXY_IP_HEADERS=true` only when a trusted ingress overwrites `X-Real-IP`. Public deployments must provide that ingress and its own source-level request limiting; without it, the app enforces per-account limits but cannot reliably identify or throttle anonymous sources. Do not trust caller-supplied forwarding headers.

## Single Command Startup

The full platform (API/UI + background notification worker) can be launched with:

```bash
docker compose up --build
```

Apply all pending migrations through034 before starting the new build. The
025–027 authentication migrations add per-session logout revocation, reset-request
throttling and an encrypted reset email outbox; later migrations add current
administrative/lifecycle storage. With local `.env`, run `pnpm db:migrate` before
`docker compose up --build`.

## Service Layout

- `web`: Next.js API + UI process (`pnpm start`)
- `notification-worker`: stateless notification worker loop (`pnpm worker:notifications`), including reset-email dispatch every 10 seconds

## Operational Notes

### Private attachment persistence

The web image and Compose service use `SWR_ATTACHMENT_ROOT=/var/lib/swr/attachments`.
Compose mounts the named `swr-attachments` volume there; files are not under
`public` and must only be served through the authenticated attachment API.
The image initializes that directory for the non-root `node` user with mode 0700;
stored files use mode 0600. Verify actual host ACLs and reverse-proxy/static
mounts separately before production use.

Keep the same Compose project name and named volume when replacing containers.
Do not run `docker compose down --volumes`, prune this volume, or change its
mount/root as an ordinary upgrade. Existing deployments using another root must
back up and copy their files with ownership preserved before changing roots;
configuration alone does not migrate old bytes. Sabine's separately managed
volume is unchanged by this Compose configuration.

Back up the database and attachment volume together while writes are quiesced.
Restore both to an isolated environment, preserving the `node` user's ownership
and private permissions, then verify recorded SHA-256 hashes and authenticated
download/denial controls before cutover. Container replacement is supported;
request/file deletion, movement and orphan cleanup remain undefined and must not
be inferred from volume retention. No destructive cleanup is implemented here.

- Worker cycles are idempotent through existing timeout-event dedupe and threshold checks.
- Worker run outcomes are persisted in `background_job_runs` for diagnostics.
- Compose forces production cookie settings and binds the web port to loopback.
- Reset links are never returned by the API or written to console logs. The queued bearer payload is AES-GCM encrypted and cleared after delivery or expiry. Configure the webhook and monitor worker errors before relying on self-service password reset.
- Logout denies only the presented token; other logins for the same account remain valid. Expired revocation and rate-limit records are pruned by the worker.
