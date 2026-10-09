import { withTenantNotificationTransaction } from '@/lib/notification-worker-transaction';
import { pool } from '@/lib/db';
import { createEmailTransportFromEnv } from '@/lib/email';
import { logError, logInfo } from '@/lib/observability';
import { runNotificationWorkerCycle } from '@/modules/notification/application/worker';
import { NotificationRepository, EmailNotificationTransport } from '@/modules/notification/infrastructure';
import { PgBackgroundJobRunRepository } from '@/modules/notification/infrastructure/job-run.repository';
import { dispatchPasswordResetEmails, pruneExpiredAuthSecurityRecords } from '@/modules/identity/infrastructure/password-reset-email-outbox';
import {SYSTEM_AUDIT_ACTOR} from '@/modules/audit/domain/types';


async function main(): Promise<void> {
  await pruneExpiredAuthSecurityRecords(pool);
  await dispatchPasswordResetEmails(pool);
  const result = await runNotificationWorkerCycle({
    repo: new NotificationRepository(),
    transport: new EmailNotificationTransport(createEmailTransportFromEnv()),
    db: pool,
    runRepo: new PgBackgroundJobRunRepository(),
    withTenantLifecycle: withTenantNotificationTransaction,
  });

  logInfo('Notification worker run completed', {
    eventType: 'job.notification.once.completed',
    tenantId: null,
    ticketId: null,
    actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
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
      actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
    }, err);
    await pool.end();
    process.exitCode = 1;
  });
