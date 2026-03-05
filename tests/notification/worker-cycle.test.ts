import test from 'node:test';
import assert from 'node:assert/strict';
import { runNotificationWorkerCycle, type BackgroundJobRunRepository } from '@/modules/notification/application/worker';
import type { INotificationRepository, INotificationTransport } from '@/modules/notification/application';
import type { DbClient, UUID } from '@/shared/types';

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

const actorId = '00000000-0000-0000-0000-000000000099' as UUID;

class InMemoryRunRepo implements BackgroundJobRunRepository {
  public starts = 0;
  public successes = 0;
  public failures = 0;

  async startRun(_db: DbClient, _params: { runId: UUID; jobName: string; details: Record<string, unknown> }): Promise<void> {
    this.starts += 1;
  }

  async finishRunSuccess(_db: DbClient, _params: { runId: UUID; details: Record<string, unknown> }): Promise<void> {
    this.successes += 1;
  }

  async finishRunFailure(_db: DbClient, _params: { runId: UUID; errorMessage: string; details: Record<string, unknown> }): Promise<void> {
    this.failures += 1;
  }
}

test('runNotificationWorkerCycle records a successful worker run', async () => {
  const runRepo = new InMemoryRunRepo();
  const repo: INotificationRepository = {
    listApproverTimeoutCandidates: async () => [],
    listVacancyEscalationCandidates: async () => [],
  };
  const transport: INotificationTransport = {
    send: async () => undefined,
  };

  const result = await runNotificationWorkerCycle({
    repo,
    transport,
    db,
    runRepo,
    actorId,
    now: new Date('2026-03-04T12:00:00Z'),
  });

  assert.ok(result.runId);
  assert.equal(result.warningCount, 0);
  assert.equal(result.unlockedCount, 0);
  assert.equal(result.vacancyCount, 0);
  assert.equal(runRepo.starts, 1);
  assert.equal(runRepo.successes, 1);
  assert.equal(runRepo.failures, 0);
});

test('runNotificationWorkerCycle records a failed worker run', async () => {
  const runRepo = new InMemoryRunRepo();
  const repo: INotificationRepository = {
    listApproverTimeoutCandidates: async () => [
      {
        tenantId: 'tenant-1' as UUID,
        projectId: 'project-1' as UUID,
        ticketId: 'ticket-1' as UUID,
        ticketNumber: 'FSS-U1-0001',
        submittedAt: new Date('2026-03-03T12:00:00Z'),
        recipients: [{ userId: 'user-1' as UUID, email: 'survey@example.com', name: null }],
        hasWarningSent: false,
        hasUnlockedSent: false,
      },
    ],
    listVacancyEscalationCandidates: async () => [],
  };
  const transport: INotificationTransport = {
    send: async () => {
      throw new Error('transport failure');
    },
  };

  await assert.rejects(
    () =>
      runNotificationWorkerCycle({
        repo,
        transport,
        db,
        runRepo,
        actorId,
        now: new Date('2026-03-04T12:00:00Z'),
      }),
    /transport failure/,
  );

  assert.equal(runRepo.starts, 1);
  assert.equal(runRepo.successes, 0);
  assert.equal(runRepo.failures, 1);
});
