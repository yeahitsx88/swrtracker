import { randomUUID } from 'crypto';
import { logError, logInfo } from '@/lib/observability';
import { runWithCorrelationId } from '@/lib/correlation';
import type { DbClient, UUID } from '@/shared/types';
import {
  dispatchApproverTimeoutNotifications,
  dispatchDailyVacancyNotifications,
  dispatchOrphanWorkflowRecovery,
  type INotificationRepository,
  type INotificationTransport,
} from './index';

export interface BackgroundJobRunRepository {
  startRun(
    db: DbClient,
    params: {
      runId: UUID;
      tenantId?: UUID | null;
      jobName: string;
      details: Record<string, unknown>;
    },
  ): Promise<void>;
  finishRunSuccess(
    db: DbClient,
    params: {
      runId: UUID;
      details: Record<string, unknown>;
    },
  ): Promise<void>;
  finishRunFailure(
    db: DbClient,
    params: {
      runId: UUID;
      errorMessage: string;
      details: Record<string, unknown>;
    },
  ): Promise<void>;
}

export interface NotificationWorkerResult {
  runId: UUID;
  warningCount: number;
  unlockedCount: number;
  vacancyCount: number;
  orphanReassignedCount: number;
  orphanEscalatedCount: number;
  orphanUnresolvedCount: number;
}

export async function runNotificationWorkerCycle(
  deps: {
    repo: INotificationRepository;
    transport: INotificationTransport;
    db: DbClient;
    runRepo: BackgroundJobRunRepository;
    actorId: UUID;
    now?: Date;
  },
): Promise<NotificationWorkerResult> {
  const runId = randomUUID() as UUID;
  return runWithCorrelationId(runId, async () => {
    const now = deps.now ?? new Date();
    const jobName = 'notification.dispatch';
    await deps.runRepo.startRun(deps.db, {
      runId,
      tenantId: null,
      jobName,
      details: { startedAt: now.toISOString() },
    });
    logInfo('Notification worker cycle started', {
      eventType: 'job.notification.started',
      actorId: deps.actorId,
      tenantId: null,
      ticketId: null,
      run_id: runId,
      job_name: jobName,
    });

    try {
      const approver = await dispatchApproverTimeoutNotifications(
        deps.repo,
        deps.transport,
        deps.db,
        { actorId: deps.actorId, now },
      );
      const vacancy = await dispatchDailyVacancyNotifications(
        deps.repo,
        deps.transport,
        deps.db,
        { now },
      );
      const orphanRecovery = await dispatchOrphanWorkflowRecovery(
        deps.repo,
        deps.transport,
        deps.db,
        { actorId: deps.actorId, now },
      );
      const result: NotificationWorkerResult = {
        runId,
        warningCount: approver.warningCount,
        unlockedCount: approver.unlockedCount,
        vacancyCount: vacancy.sentCount,
        orphanReassignedCount: orphanRecovery.reassignedCount,
        orphanEscalatedCount: orphanRecovery.escalatedCount,
        orphanUnresolvedCount: orphanRecovery.unresolvedCount,
      };
      await deps.runRepo.finishRunSuccess(deps.db, {
        runId,
        details: {
          finishedAt: new Date().toISOString(),
          warningCount: result.warningCount,
          unlockedCount: result.unlockedCount,
          vacancyCount: result.vacancyCount,
          orphanReassignedCount: result.orphanReassignedCount,
          orphanEscalatedCount: result.orphanEscalatedCount,
          orphanUnresolvedCount: result.orphanUnresolvedCount,
        },
      });
      logInfo('Notification worker cycle completed', {
        eventType: 'job.notification.succeeded',
        actorId: deps.actorId,
        tenantId: null,
        ticketId: null,
        run_id: runId,
        warning_count: result.warningCount,
        unlocked_count: result.unlockedCount,
        vacancy_count: result.vacancyCount,
        orphan_reassigned_count: result.orphanReassignedCount,
        orphan_escalated_count: result.orphanEscalatedCount,
        orphan_unresolved_count: result.orphanUnresolvedCount,
      });
      return result;
    } catch (err) {
      await deps.runRepo.finishRunFailure(deps.db, {
        runId,
        errorMessage: err instanceof Error ? err.message : 'Unknown notification worker error',
        details: {
          failedAt: new Date().toISOString(),
        },
      });
      logError(
        'Notification worker cycle failed',
        {
          eventType: 'job.notification.failed',
          actorId: deps.actorId,
          tenantId: null,
          ticketId: null,
          run_id: runId,
        },
        err,
      );
      throw err;
    }
  });
}
