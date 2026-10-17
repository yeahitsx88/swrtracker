import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runLifecycleSchemaAcceptance } from './account-offboarding-postgres';
import { enqueueNotification } from '../../src/modules/ticket/application/amelia-notifications';
import type { UUID } from '../../src/shared/types';

runLifecycleSchemaAcceptance(async (db, fixture) => {
  const ticket = (await db.query('SELECT id FROM tickets WHERE tenant_id=$1 LIMIT 1', [fixture.tenant])).rows[0].id as UUID;
  const enqueue = () => enqueueNotification(db, { tenantId: fixture.tenant as UUID, ticketId: ticket,
    recipientUserId: fixture.subject as UUID, eventType: 'SUBMITTED', idempotencyKey: randomUUID() });
  const count = async () => (await db.query('SELECT count(*)::int AS n FROM notification_outbox')).rows[0].n;
  await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1', [fixture.subject]);
  await db.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE user_id=$1', [fixture.subject]);
  const before = await count();
  await enqueue(); assert.equal(await count(), before+1);
  await db.query('UPDATE project_memberships SET access_disabled_at=NOW(),access_disabled_by=$2 WHERE user_id=$1', [fixture.subject,fixture.actor]);
  await enqueue(); assert.equal(await count(), before+1, 'locally disabled recipients cannot receive new notification state');
  await db.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE user_id=$1', [fixture.subject]);
  await db.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=$2 WHERE id=$1', [fixture.subject,fixture.actor]);
  await enqueue(); assert.equal(await count(), before+1, 'globally disabled recipients cannot receive new notification state');
  await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1', [fixture.subject]);
  await enqueue(); assert.equal(await count(), before+2);
  console.log('Notification recipient lifecycle PostgreSQL checks passed: 4');
}).catch(error => { console.error(error); process.exitCode=1; });
