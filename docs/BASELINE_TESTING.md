# Baseline testing for ADCQ-260923-001

Gate A checkpoint: 2026-09-24. This verifies the selected `phase5` code baseline and the existing migration chain. It does not verify the newly approved Amelia workflow or pilot readiness.

## Supported local toolchain

- Node.js 22.23.3 (`.node-version`; Docker uses the Node 22 major line)
- pnpm 11.19.0 (`package.json` `packageManager`)
- PostgreSQL 15 for the disposable database replay

`pnpm-workspace.yaml` explicitly permits install scripts for the three declared native/binary dependencies. The old `package.json` `pnpm.onlyBuiltDependencies` key was ignored by pnpm 11. `pnpm test` now loads the existing test files in one process under Node 22; the prior `--test-isolation=none` flag is unsupported there.

From a clean checkout with those tool versions:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

## Disposable PostgreSQL replay

Use a separate temporary cluster; never point the smoke test at an operational database. On macOS with PostgreSQL 15 binaries on `PATH`, one example is:

```sh
SWR_TEST_CLUSTER_DIR=$(mktemp -d /private/tmp/swr-smoke-pg.XXXXXX)
initdb -D "$SWR_TEST_CLUSTER_DIR/data" -A trust --no-instructions
pg_ctl -D "$SWR_TEST_CLUSTER_DIR/data" -l "$SWR_TEST_CLUSTER_DIR/server.log" \
  -o "-c listen_addresses='' -c unix_socket_directories=$SWR_TEST_CLUSTER_DIR -p 55483" start
createdb -h "$SWR_TEST_CLUSTER_DIR" -p 55483 swr_smoke_test_local
export DATABASE_URL="postgresql://$(id -un)@localhost:55483/swr_smoke_test_local?host=$SWR_TEST_CLUSTER_DIR"
export JWT_SECRET="$(openssl rand -hex 64)"
pnpm exec tsx db/migrate.ts
SWR_SMOKE_DISPOSABLE_DB=1 SWR_SMOKE_DATA_DIR="$SWR_TEST_CLUSTER_DIR/data" pnpm smoke:ticket
pg_ctl -D "$SWR_TEST_CLUSTER_DIR/data" stop
```

Choose an unused port if 55483 is taken. The socket-only cluster is the test environment; its data directory may be deleted after the server stops. The smoke command refuses to run unless the database name begins `swr_smoke_test_`, `SWR_SMOKE_DISPOSABLE_DB=1` is set, and the server's data directory matches `SWR_SMOKE_DATA_DIR`. It does not delete rows; dispose of the whole temporary cluster after use.

## Observed Gate A results

| Check | Observed |
|---|---|
| Fresh install on Node 22.23.3 / pnpm 11.19.0 | Pass, including bcrypt, esbuild, and sharp install scripts |
| TypeScript | Pass |
| Existing test suite | 216 passed, 0 failed |
| Next.js production build | Pass |
| PostgreSQL 15.19 empty database | Migrations 001–021 applied; 21 records in `_migrations`; second run skipped all 21 |
| Contained route smoke | Create → submit → approve → assign passed; persisted `ASSIGNED` state and four ordered audit events observed |
| Smoke guard | Run without explicit disposable flag failed before fixture mutation |

The route smoke exercises the older `phase5` workflow only through assignment. It does not cover field completion, return/resubmission, cancellation, external company identity, email delivery, attachment bytes, reporting, or the one-month Amelia pilot. No deployed database or SharePoint process was inspected. Docker image build was not run because Docker is unavailable on this machine; the Dockerfile now copies the pnpm build allowlist for its dependency stage.
