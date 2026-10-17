import { withTenantNotificationTransaction } from '@/lib/notification-worker-transaction';
import { pool } from '@/lib/db';
import { createEmailTransportFromEnv } from '@/lib/email';
import { logError, logInfo } from '@/lib/observability';
import { runNotificationWorkerCycle } from '@/modules/notification/application/worker';
import { NotificationRepository, EmailNotificationTransport } from '@/modules/notification/infrastructure';
import { PgBackgroundJobRunRepository } from '@/modules/notification/infrastructure/job-run.repository';
import { dispatchPasswordResetEmails, pruneExpiredAuthSecurityRecords } from '@/modules/identity/infrastructure/password-reset-email-outbox';
import { dispatchAdministrativeNotifications } from '@/modules/identity/infrastructure/administrative-notification-outbox';
import { withTransaction } from '@/lib/with-transaction';
import {SYSTEM_AUDIT_ACTOR} from '@/modules/audit/domain/types';
import {pruneExpiredRequestObservations} from '@/modules/support/infrastructure/observation-retention';

const intervalSeconds = Number(process.env.NOTIFICATION_WORKER_INTERVAL_SECONDS || 300);
const intervalMs = Number.isFinite(intervalSeconds) && intervalSeconds > 0
  ? Math.floor(intervalSeconds * 1000)
  : 300000;

let isRunning = false;
let resetEmailRunning = false;

async function runResetEmailCycle(): Promise<void> {
  if (resetEmailRunning) return;
  resetEmailRunning = true;
  try {
    await dispatchPasswordResetEmails(pool);
    await dispatchAdministrativeNotifications(pool, withTransaction, createEmailTransportFromEnv());
  } catch (err) {
    logError('Password reset email worker cycle failed', {
      eventType: 'auth.password_reset.worker.failed', tenantId: null,
      ticketId: null, actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
    }, err);
  } finally {
    resetEmailRunning = false;
  }
}

async function runCycle(): Promise<void> {
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    await pruneExpiredRequestObservations(pool);
    await pruneExpiredAuthSecurityRecords(pool);
    await runNotificationWorkerCycle({
      repo: new NotificationRepository(),
      transport: new EmailNotificationTransport(createEmailTransportFromEnv()),
      db: pool,
      runRepo: new PgBackgroundJobRunRepository(),
      withTenantLifecycle: withTenantNotificationTransaction,
    });
  } catch (err) {
    logError('Notification worker loop cycle failed', {
      eventType: 'job.notification.loop.failed',
      tenantId: null,
      ticketId: null,
      actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
    }, err);
  } finally {
    isRunning = false;
  }
}

logInfo('Notification worker loop started', {
  eventType: 'job.notification.loop.started',
  tenantId: null,
  ticketId: null,
  actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
  interval_ms: intervalMs,
});

void runCycle();
void runResetEmailCycle();
setInterval(() => {
  void runCycle();
}, intervalMs);
setInterval(() => { void runResetEmailCycle(); }, 10_000);

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
