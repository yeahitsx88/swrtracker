# Test standards

Commands/toolchain: [README](../README.md). Approved requirements/decisions control expectations. Historical proposed roles and workflows do not define fixtures.

## Existing suites

scripts/run-tests.ts discovers tests/**/*.test.ts using Node node:test, strict assertions and tsx. Tests live by module. Actual PostgreSQL and production HTTP/browser acceptance live in tests/beta/ and require explicit opt-in. There is no Jest or tests/setup framework.

Reuse scoped helpers such as account-offboarding-postgres.ts. Parameterized synthetic inserts in owned schemas are appropriate. Use unique identities and no real email delivery; clean up only state owned by the test. Keep historical migration assertions separate from fixtures testing current runtime. Do not skip newer migrations to make runtime tests pass.

## Applicable evidence

| Case | Required evidence |
|---|---|
| Correct actor/state | Response, state and corresponding atomic audit |
| Invalid/stale state | Conflict and no unintended effect |
| Wrong role/grant | Server denial with fixed-role and independent-admin semantics |
| Foreign tenant/project/company UUID | Established non-disclosure denial and unchanged data |
| Ownership/visibility | Current list/detail/attachment role/company/actor parity |
| Disabled/revoked/stale access | Current checks before mutation and recorded replay |
| Cancellation/handover | Approved chain, explicit scope, duties and retained history |
| Concurrency/replay | Separate connections; stable body/key; one transition; mismatch rejection |
| Fault injection | State, audit/outbox and idempotency rollback |
| Lost browser response | Frozen original body/key; replacement blocked; exact retry recovery |
| Definitive409 | Deliberate reload and renewed confirmation |

Respect authority ordering: unauthorized actors may receive 403 before lookup; authorized foreign lookup should not disclose resource existence. Do not bypass session checks to fabricate authorization evidence.

## Retained data and interpretation

Never reset/truncate retained public data. PostgreSQL gates require SWR_TEAM_POSTGRES=1, 127.0.0.1:15489/swr_team_isolated, and owned schemas. Compare retained witnesses where available. File acceptance verifies actual stored bytes/digests and parent authorization.

Prefer contract/content assertions over whitespace, option positions and incidental SQL layout. Mocks cannot certify real locks, constraints, scope, file persistence or cookie enforcement. Expected negative errors are evidence, not suite failures. Counts supplement named cases: record mode, source/migration digest and limits. No arbitrary coverage target is required.
