import test from 'node:test';
import { runLifecycleSchemaAcceptance } from '../beta/account-offboarding-postgres';

// This is an opt-in real PostgreSQL suite, never a mock certification.
// Normal pnpm test does not report these SQL cases as passed or skipped.
if (process.env.SWR_TEAM_POSTGRES === '1') {
  test('scoped offboarding migration enforces isolation, paired access, immutable audit and retained history',
    runLifecycleSchemaAcceptance);
}
