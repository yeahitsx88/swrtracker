# Deployment Guide (Phase 4)

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

Apply migrations 025–027 before starting the new application build. They add
per-session logout revocation, reset-request throttling, and an encrypted reset
email outbox. A running web process will reject protected API calls until the
revocation table exists. With local `.env`, run `pnpm db:migrate` before
`docker compose up --build`.

## Service Layout

- `web`: Next.js API + UI process (`pnpm start`)
- `notification-worker`: stateless notification worker loop (`pnpm worker:notifications`), including reset-email dispatch every 10 seconds

## Operational Notes

- Worker cycles are idempotent through existing timeout-event dedupe and threshold checks.
- Worker run outcomes are persisted in `background_job_runs` for diagnostics.
- Compose forces production cookie settings and binds the web port to loopback.
- Reset links are never returned by the API or written to console logs. The queued bearer payload is AES-GCM encrypted and cleared after delivery or expiry. Configure the webhook and monitor worker errors before relying on self-service password reset.
- Logout denies only the presented token; other logins for the same account remain valid. Expired revocation and rate-limit records are pruned by the worker.
