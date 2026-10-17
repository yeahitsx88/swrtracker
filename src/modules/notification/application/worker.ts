import { randomUUID } from 'crypto';
import {SYSTEM_AUDIT_ACTOR} from '@/modules/audit/domain/types';
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

export type TenantNotificationTransaction = <T>(tenantId: UUID, fn: (db: DbClient) => Promise<T>) => Promise<T>;

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
    withTenantLifecycle: TenantNotificationTransaction;
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
      actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
      tenantId: null,
      ticketId: null,
      run_id: runId,
      job_name: jobName,
    });

    try {
      // Discovery supplies tenant IDs only. Never dispatch from these cached candidates.
      const discovered = [
        ...await deps.repo.listApproverTimeoutCandidates(deps.db, now),
        ...await deps.repo.listVacancyEscalationCandidates(deps.db, now),
        ...await deps.repo.listOrphanWorkflowCandidates(deps.db),
      ];
      const tenants = [...new Set(discovered.map(candidate => candidate.tenantId))].sort();
      const result: NotificationWorkerResult = {
        runId, warningCount: 0, unlockedCount: 0, vacancyCount: 0,
        orphanReassignedCount: 0, orphanEscalatedCount: 0, orphanUnresolvedCount: 0,
      };
      for (const tenantId of tenants) {
        const current = await deps.withTenantLifecycle(tenantId, async db => {
          const approver = await dispatchApproverTimeoutNotifications(
            deps.repo, deps.transport, db, { tenantId, now });
          const vacancy = await dispatchDailyVacancyNotifications(
            deps.repo, deps.transport, db, { tenantId, now });
          const orphan = await dispatchOrphanWorkflowRecovery(
            deps.repo, deps.transport, db, { tenantId, now });
          return { approver, vacancy, orphan };
        });
        result.warningCount += current.approver.warningCount;
        result.unlockedCount += current.approver.unlockedCount;
        result.vacancyCount += current.vacancy.sentCount;
        result.orphanReassignedCount += current.orphan.reassignedCount;
        result.orphanEscalatedCount += current.orphan.escalatedCount;
        result.orphanUnresolvedCount += current.orphan.unresolvedCount;
      }
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
        actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
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
          actorId: null, actorKind: 'SYSTEM', actorName: SYSTEM_AUDIT_ACTOR,
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
