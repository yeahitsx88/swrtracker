import test from 'node:test';
import { runLifecycleSchemaAcceptance } from '../beta/account-offboarding-postgres';

// Real PostgreSQL only: opt-in cases are separately counted from normal tests.
if(process.env.SWR_TEAM_POSTGRES==='1') {
  test('scoped offboarding migration enforces isolation, paired access, immutable audit and retained history',
    async()=>runLifecycleSchemaAcceptance());
}
