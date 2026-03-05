# Deployment Guide (Phase 4)

## Runtime Contracts

Required:
- `DATABASE_URL`
- `JWT_SECRET`

Recommended:
- `APP_BASE_URL` (used for password reset link generation)
- `SYSTEM_ACTOR_ID` (worker actor for audit events; defaults to static UUID)
- `NOTIFICATION_WORKER_INTERVAL_SECONDS` (default `300`)
- `EMAIL_WEBHOOK_URL` (if omitted, email dispatch falls back to structured console logs)
- `EMAIL_WEBHOOK_API_KEY` (optional bearer token for webhook transport)

## Single Command Startup

The full platform (API/UI + background notification worker) can be launched with:

```bash
docker compose up --build
```

## Service Layout

- `web`: Next.js API + UI process (`pnpm start`)
- `notification-worker`: stateless notification worker loop (`pnpm worker:notifications`)

## Operational Notes

- Worker cycles are idempotent through existing timeout-event dedupe and threshold checks.
- Worker run outcomes are persisted in `background_job_runs` for diagnostics.
