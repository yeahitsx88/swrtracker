import { pool } from '@/lib/db';
import { createEmailTransportFromEnv } from '@/lib/email';
import { logError, logInfo } from '@/lib/observability';
import { runNotificationWorkerCycle } from '@/modules/notification/application/worker';
import { NotificationRepository, EmailNotificationTransport } from '@/modules/notification/infrastructure';
import { PgBackgroundJobRunRepository } from '@/modules/notification/infrastructure/job-run.repository';
import type { UUID } from '@/shared/types';

const SYSTEM_ACTOR_ID = (process.env.SYSTEM_ACTOR_ID || '00000000-0000-0000-0000-000000000001') as UUID;

async function main(): Promise<void> {
  const result = await runNotificationWorkerCycle({
    repo: new NotificationRepository(),
    transport: new EmailNotificationTransport(createEmailTransportFromEnv()),
    db: pool,
    runRepo: new PgBackgroundJobRunRepository(),
    actorId: SYSTEM_ACTOR_ID,
  });

  logInfo('Notification worker run completed', {
    eventType: 'job.notification.once.completed',
    tenantId: null,
    ticketId: null,
    actorId: SYSTEM_ACTOR_ID,
    run_id: result.runId,
    warning_count: result.warningCount,
    unlocked_count: result.unlockedCount,
    vacancy_count: result.vacancyCount,
    orphan_reassigned_count: result.orphanReassignedCount,
    orphan_escalated_count: result.orphanEscalatedCount,
    orphan_unresolved_count: result.orphanUnresolvedCount,
  });
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    logError('Notification worker run failed', {
      eventType: 'job.notification.once.failed',
      tenantId: null,
      ticketId: null,
      actorId: SYSTEM_ACTOR_ID,
    }, err);
    await pool.end();
    process.exitCode = 1;
  });
