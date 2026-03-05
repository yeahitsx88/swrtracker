import { pool } from '@/lib/db';
import { createEmailTransportFromEnv } from '@/lib/email';
import { logError, logInfo } from '@/lib/observability';
import { runNotificationWorkerCycle } from '@/modules/notification/application/worker';
import { NotificationRepository, EmailNotificationTransport } from '@/modules/notification/infrastructure';
import { PgBackgroundJobRunRepository } from '@/modules/notification/infrastructure/job-run.repository';
import type { UUID } from '@/shared/types';

const SYSTEM_ACTOR_ID = (process.env.SYSTEM_ACTOR_ID || '00000000-0000-0000-0000-000000000001') as UUID;
const intervalSeconds = Number(process.env.NOTIFICATION_WORKER_INTERVAL_SECONDS || 300);
const intervalMs = Number.isFinite(intervalSeconds) && intervalSeconds > 0
  ? Math.floor(intervalSeconds * 1000)
  : 300000;

let isRunning = false;

async function runCycle(): Promise<void> {
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
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
setInterval(() => {
  void runCycle();
}, intervalMs);

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
