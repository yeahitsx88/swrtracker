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
    listOrphanWorkflowCandidates: async () => [],
    reassignOrphanWorkflowTicket: async () => false,
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
    withTenantLifecycle: async (_tenant,fn)=>fn(db),
    now: new Date('2026-03-04T12:00:00Z'),
  });

  assert.ok(result.runId);
  assert.equal(result.warningCount, 0);
  assert.equal(result.unlockedCount, 0);
  assert.equal(result.vacancyCount, 0);
  assert.equal(result.orphanReassignedCount, 0);
  assert.equal(result.orphanEscalatedCount, 0);
  assert.equal(result.orphanUnresolvedCount, 0);
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
    listOrphanWorkflowCandidates: async () => [],
    reassignOrphanWorkflowTicket: async () => false,
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
        withTenantLifecycle: async (_tenant,fn)=>fn(db),
        now: new Date('2026-03-04T12:00:00Z'),
      }),
    /transport failure/,
  );

  assert.equal(runRepo.starts, 1);
  assert.equal(runRepo.successes, 0);
  assert.equal(runRepo.failures, 1);
});


test('worker rereads candidates and recipient eligibility on its held tenant client',async()=>{
 const tenant='tenant-worker' as UUID;
 let held=false,coordinated=0,sends=0,audits=0;
 const heldDb:DbClient={query:async()=>{assert.equal(held,true);audits++;return{rows:[]};}};
 const candidate={tenantId:tenant,projectId:'project-worker' as UUID,ticketId:'ticket-worker' as UUID,
  ticketNumber:'SYN-1',submittedAt:new Date('2026-03-01'),recipients:[{userId:'manager' as UUID,email:'manager@example.invalid',name:null}],
  hasWarningSent:false,hasUnlockedSent:false};
 const repo:INotificationRepository={
  listApproverTimeoutCandidates:async(client,_now,scope)=>{
   if(client===db)return[candidate];
   assert.equal(client,heldDb);assert.equal(held,true);assert.equal(scope,tenant);
   // Manager lost account access while the worker waited for tenant coordination.
   return[{...candidate,recipients:[]}];
  },
  listVacancyEscalationCandidates:async(client,_now,scope)=>{if(client===heldDb){assert.equal(held,true);assert.equal(scope,tenant);}return[];},
  listOrphanWorkflowCandidates:async(client,scope)=>{if(client===heldDb){assert.equal(held,true);assert.equal(scope,tenant);}return[];},
  reassignOrphanWorkflowTicket:async()=>{throw Error('Must never reassign');},
 };
 const result=await runNotificationWorkerCycle({repo,db,actorId,runRepo:new InMemoryRunRepo(),
  transport:{send:async()=>{sends++;}},now:new Date('2026-03-04'),
  withTenantLifecycle:async(_tenant,fn)=>{assert.equal(_tenant,tenant);coordinated++;held=true;try{return await fn(heldDb);}finally{held=false;}},
 });
 assert.equal(coordinated,1);assert.equal(sends,0);assert.equal(audits,0);assert.equal(result.unlockedCount,0);
});
