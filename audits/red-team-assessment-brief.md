# Red Team Security Assessment Brief

**Date:** 2026-09-30  
**Repository:** SWRTracker  
**Branch:** `Phase5-RedTeam`  
**Assessed snapshot:** `d8fe20e2f3e93d9c50e05556daad863368ac3c86`  
**Assessment type:** Source and configuration review with focused, bounded local checks

## Executive summary

The assessment recorded **11 findings** in the assessed snapshot: **1 high, 5 medium, and 5 low**. Several straightforward issues were fixed in the working tree during the review. The most consequential remaining concern is that the password-reset handler still returns a debug token whenever `NODE_ENV` is not `production`; Compose now forces production mode, but other deployment configurations must do the same or disable token disclosure.

The outstanding medium findings are excessive resource use during attachment uploads and the lack of throttling on password-reset requests. Lower-severity items cover global notification-worker details in tenant diagnostics, replay of a copied session token after logout, and timing-based account enumeration.

## Findings and disposition

| Severity | Finding | Disposition |
|---|---|---|
| High | Password-reset tokens can be returned when the application runs outside production mode. | **Partially mitigated:** Compose explicitly sets `NODE_ENV=production`; other deployment targets still need a safe setting or an explicit local-only token opt-in. |
| Medium | Attachment uploads are fully parsed, buffered, and written before the 30 MiB limit and upload checks complete. | **Open:** enforce a streaming/request byte cap and confirm any ingress limit. |
| Medium | Password-reset requests are not throttled and each request can invalidate existing active reset links. | **Open:** add source/account throttling and a cooldown that preserves a usable link. |
| Medium | Priority elevation could overwrite a concurrent workflow transition with stale status. | **Fixed:** elevation now supplies expected status and row version; focused regression passes. |
| Medium | AOR lookup allowed a node from another project in the same tenant. | **Fixed:** lookups now include project scope and creation validates the node. |
| Medium | Console email fallback logged password-reset bearer URLs. | **Fixed:** reset URLs are no longer included in logged metadata; regression passes. |
| Low | Tenant-admin diagnostics included global notification-worker job details. | **Open:** decide whether global rows should be hidden or exposed through a separately authorized platform view. |
| Low | Logout clears the browser cookie but does not revoke a copied JWT before its eight-hour expiry. | **Open:** choose per-session or all-session revocation behavior. |
| Low | Forgot-password response timing can distinguish known accounts when email delivery is delayed. | **Open:** reduce response timing dependence on email dispatch. |
| Low | Login accepted an unvalidated `returnTo` destination after sign-in. | **Fixed:** navigation now accepts only same-origin local paths; regression passes. |
| Low | Compose published port 3000 on all host interfaces, contrary to the private-beta loopback boundary. | **Fixed:** the host port now binds to `127.0.0.1`. |

## Changes made

- Added same-origin validation for post-login destinations in `src/lib/safe-return-path.ts` and used it from the login page.
- Added optimistic concurrency guards to priority elevation.
- Scoped AOR-node lookup and ticket creation to the selected project.
- Removed password-reset links from console email metadata.
- Configured the Compose web service to use production mode and loopback-only port publication.
- Added the changes and validation notes to `docs/CODEX.md`.

## Verification

- Focused redirect, AOR, priority-elevation, submission, and direct-assignment regressions: **15/15 passed**.
- Full local test suite: **293/294 passed**. The sole failure is the existing Windows file-mode assertion for attachment storage (expected `0600`/384, observed 438); repository documentation identifies Linux container runtime as the supported environment for this permission check.
- `pnpm tsc --noEmit` aborted because pnpm attempted to reconcile `node_modules` in a noninteractive shell. Direct TypeScript checking is blocked by stale generated `.next` references and errors in an untracked nested `swrtracker/` legacy tree; it reported no diagnostics in the changed source and test files.
- Local checks used mocks and a test-only JWT secret. No production service, external target, real user data, or destructive action was used.

## Coverage limits and follow-up

This is a source/configuration assessment with focused independent review passes, not a live deployment test. Provider-side TLS, proxy headers, CORS, firewall rules, database network policy, actual ingress upload limits, and current dependency advisories remain unverified. No offline dependency-advisory feed was available.

Recommended next actions:

1. Ensure every production deployment forces `NODE_ENV=production` and remove or explicitly gate reset-token response disclosure.
2. Add upload byte limits before multipart buffering and storage.
3. Add password-reset throttling and a token-preserving cooldown.
4. Decide logout revocation semantics and tenant visibility for global job diagnostics.
5. Run dependency advisory and deployment-boundary checks in the intended production environment.
