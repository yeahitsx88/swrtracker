import { pool } from '@/lib/db';
import { createEmailTransportFromEnv } from '@/lib/email';
import { logError, logInfo } from '@/lib/observability';
import { runNotificationWorkerCycle } from '@/modules/notification/application/worker';
import { NotificationRepository, EmailNotificationTransport } from '@/modules/notification/infrastructure';
import { PgBackgroundJobRunRepository } from '@/modules/notification/infrastructure/job-run.repository';
import { dispatchPasswordResetEmails, pruneExpiredAuthSecurityRecords } from '@/modules/identity/infrastructure/password-reset-email-outbox';
import type { UUID } from '@/shared/types';

const SYSTEM_ACTOR_ID = (process.env.SYSTEM_ACTOR_ID || '00000000-0000-0000-0000-000000000001') as UUID;
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
  } catch (err) {
    logError('Password reset email worker cycle failed', {
      eventType: 'auth.password_reset.worker.failed', tenantId: null,
      ticketId: null, actorId: SYSTEM_ACTOR_ID,
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
    await pruneExpiredAuthSecurityRecords(pool);
    await runNotificationWorkerCycle({
      repo: new NotificationRepository(),
      transport: new EmailNotificationTransport(createEmailTransportFromEnv()),
      db: pool,
      runRepo: new PgBackgroundJobRunRepository(),
      actorId: SYSTEM_ACTOR_ID,
    });
  } catch (err) {
    logError('Notification worker loop cycle failed', {
      eventType: 'job.notification.loop.failed',
      tenantId: null,
      ticketId: null,
      actorId: SYSTEM_ACTOR_ID,
    }, err);
  } finally {
    isRunning = false;
  }
}

logInfo('Notification worker loop started', {
  eventType: 'job.notification.loop.started',
  tenantId: null,
  ticketId: null,
  actorId: SYSTEM_ACTOR_ID,
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
