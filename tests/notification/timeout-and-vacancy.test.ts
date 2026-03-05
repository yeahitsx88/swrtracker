import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchApproverTimeoutNotifications,
  dispatchDailyVacancyNotifications,
  dispatchOrphanWorkflowRecovery,
  type ApproverTimeoutCandidate,
  type INotificationRepository,
  type INotificationTransport,
  type NotificationMessage,
  type OrphanWorkflowCandidate,
  type VacancyEscalationCandidate,
} from '@/modules/notification/application';
import {
  CallbackNotificationTransport,
  NotificationRepository,
} from '@/modules/notification/infrastructure';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const workerActorId = 'worker-1' as UUID;

function makeApproverCandidate(
  overrides?: Partial<ApproverTimeoutCandidate>,
): ApproverTimeoutCandidate {
  return {
    tenantId,
    projectId,
    ticketId,
    ticketNumber: 'U1-0007',
    submittedAt: new Date('2026-03-03T18:00:00Z'),
    recipients: [
      {
        userId: 'manager-1' as UUID,
        email: 'manager@example.com',
        name: 'Survey Manager',
      },
    ],
    hasWarningSent: false,
    hasUnlockedSent: false,
    ...overrides,
  };
}

function makeVacancyCandidate(
  overrides?: Partial<VacancyEscalationCandidate>,
): VacancyEscalationCandidate {
  return {
    grantId: 'grant-1' as UUID,
    tenantId,
    projectId,
    projectName: 'Alpha Build',
    role: 'SURVEY_MANAGER',
    grantedReason: 'Survey Manager deactivated',
    createdAt: new Date('2026-03-03T18:00:00Z'),
    recipients: [
      {
        userId: 'tenant-admin-1' as UUID,
        email: 'tenant-admin@example.com',
        name: 'Tenant Admin',
      },
      {
        userId: 'project-admin-1' as UUID,
        email: 'project-admin@example.com',
        name: 'Project Admin',
      },
    ],
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<INotificationRepository>): INotificationRepository {
  return {
    listApproverTimeoutCandidates: async () => [],
    listVacancyEscalationCandidates: async () => [],
    listOrphanWorkflowCandidates: async () => [],
    reassignOrphanWorkflowTicket: async () => false,
    ...overrides,
  };
}

function makeTransport(sent: NotificationMessage[]): INotificationTransport {
  return {
    send: async (message) => {
      sent.push(message);
    },
  };
}

function makeDb(onQuery?: (sql: string, params?: unknown[]) => void): DbClient {
  return {
    query: async (sql: string, params?: unknown[]) => {
      onQuery?.(sql, params);
      return { rows: [] };
    },
  };
}

function makeOrphanCandidate(overrides?: Partial<OrphanWorkflowCandidate>): OrphanWorkflowCandidate {
  return {
    tenantId,
    projectId,
    ticketId,
    ticketNumber: 'U1-0007',
    rowVersion: 3,
    orphanedAt: new Date('2026-03-04T00:00:00Z'),
    assignedPartyChiefId: 'pc-1' as UUID,
    assignedInstrumentManId: null,
    surveyLeadId: 'lead-1' as UUID,
    assignedPartyChiefOrphaned: true,
    assignedInstrumentManOrphaned: false,
    surveyLeadOrphaned: true,
    fallbackProjectAdminId: 'project-admin-1' as UUID,
    escalationRecipients: [
      {
        userId: 'tenant-admin-1' as UUID,
        email: 'tenant-admin@example.com',
        name: 'Tenant Admin',
      },
    ],
    hasEscalationSignal: false,
    ...overrides,
  };
}

test('dispatchApproverTimeoutNotifications sends the 18-hour warning and appends an audit event', async () => {
  const sent: NotificationMessage[] = [];
  const auditEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const db = makeDb((sql, params) => {
    if (/INSERT INTO ticket_events/.test(sql)) {
      auditEvents.push({
        eventType: String(params?.[4]),
        payload: JSON.parse(String(params?.[5])) as Record<string, unknown>,
      });
    }
  });

  const summary = await dispatchApproverTimeoutNotifications(
    makeRepo({
      listApproverTimeoutCandidates: async () => [
        makeApproverCandidate({
          submittedAt: new Date('2026-03-03T18:30:00Z'),
        }),
      ],
    }),
    makeTransport(sent),
    db,
    {
      actorId: workerActorId,
      now: new Date('2026-03-04T12:45:00Z'),
    },
  );

  assert.equal(summary.warningCount, 1);
  assert.equal(summary.unlockedCount, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.kind, 'approver.timeout_warning');
  assert.match(sent[0]?.subject ?? '', /Approval pending/);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.eventType, 'approver.timeout_warning_sent');
  assert.equal(auditEvents[0]?.payload.hoursElapsed, 18);
});

test('dispatchApproverTimeoutNotifications sends only the 24-hour escalation when the higher threshold is overdue', async () => {
  const sent: NotificationMessage[] = [];
  const auditEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const db = makeDb((sql, params) => {
    if (/INSERT INTO ticket_events/.test(sql)) {
      auditEvents.push({
        eventType: String(params?.[4]),
        payload: JSON.parse(String(params?.[5])) as Record<string, unknown>,
      });
    }
  });

  const summary = await dispatchApproverTimeoutNotifications(
    makeRepo({
      listApproverTimeoutCandidates: async () => [
        makeApproverCandidate({
          submittedAt: new Date('2026-03-03T08:00:00Z'),
        }),
      ],
    }),
    makeTransport(sent),
    db,
    {
      actorId: workerActorId,
      now: new Date('2026-03-04T09:15:00Z'),
    },
  );

  assert.equal(summary.warningCount, 0);
  assert.equal(summary.unlockedCount, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.kind, 'approver.timeout_unlocked');
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.eventType, 'approver.timeout_unlocked');
  assert.equal(auditEvents[0]?.payload.hoursElapsed, 25);
});

test('dispatchApproverTimeoutNotifications skips tickets that already emitted the required timeout signal', async () => {
  const sent: NotificationMessage[] = [];

  const summary = await dispatchApproverTimeoutNotifications(
    makeRepo({
      listApproverTimeoutCandidates: async () => [
        makeApproverCandidate({
          submittedAt: new Date('2026-03-03T08:00:00Z'),
          hasUnlockedSent: true,
        }),
      ],
    }),
    makeTransport(sent),
    makeDb(),
    {
      actorId: workerActorId,
      now: new Date('2026-03-04T09:15:00Z'),
    },
  );

  assert.equal(summary.warningCount, 0);
  assert.equal(summary.unlockedCount, 0);
  assert.equal(sent.length, 0);
});

test('dispatchDailyVacancyNotifications sends daily admin alerts for unresolved vacancy grants past threshold', async () => {
  const sent: NotificationMessage[] = [];

  const summary = await dispatchDailyVacancyNotifications(
    makeRepo({
      listVacancyEscalationCandidates: async () => [
        makeVacancyCandidate({
          createdAt: new Date('2026-03-03T10:00:00Z'),
        }),
      ],
    }),
    makeTransport(sent),
    makeDb(),
    {
      now: new Date('2026-03-04T11:30:00Z'),
    },
  );

  assert.equal(summary.sentCount, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.kind, 'vacancy.daily_admin_alert');
  assert.match(sent[0]?.subject ?? '', /Daily vacancy escalation/);
  assert.equal(sent[0]?.recipients.length, 2);
});

test('dispatchDailyVacancyNotifications does not send before the role threshold is met', async () => {
  const sent: NotificationMessage[] = [];

  const summary = await dispatchDailyVacancyNotifications(
    makeRepo({
      listVacancyEscalationCandidates: async () => [
        makeVacancyCandidate({
          role: 'PARTY_CHIEF',
          createdAt: new Date('2026-03-03T12:00:00Z'),
        }),
      ],
    }),
    makeTransport(sent),
    makeDb(),
    {
      now: new Date('2026-03-05T11:00:00Z'),
    },
  );

  assert.equal(summary.sentCount, 0);
  assert.equal(sent.length, 0);
});

test('dispatchOrphanWorkflowRecovery reassigns orphaned tickets to project-admin fallback and appends audit event', async () => {
  const sent: NotificationMessage[] = [];
  const auditEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  let reassignCalls = 0;
  const db = makeDb((sql, params) => {
    if (/INSERT INTO ticket_events/.test(sql)) {
      auditEvents.push({
        eventType: String(params?.[4]),
        payload: JSON.parse(String(params?.[5])) as Record<string, unknown>,
      });
    }
  });

  const summary = await dispatchOrphanWorkflowRecovery(
    makeRepo({
      listOrphanWorkflowCandidates: async () => [makeOrphanCandidate()],
      reassignOrphanWorkflowTicket: async () => {
        reassignCalls += 1;
        return true;
      },
    }),
    makeTransport(sent),
    db,
    {
      actorId: workerActorId,
      now: new Date('2026-03-04T12:00:00Z'),
    },
  );

  assert.equal(reassignCalls, 1);
  assert.equal(summary.reassignedCount, 1);
  assert.equal(summary.escalatedCount, 0);
  assert.equal(summary.unresolvedCount, 0);
  assert.equal(sent.length, 0);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.eventType, 'ticket.assigned');
  assert.equal(auditEvents[0]?.payload.reason, 'OFFBOARDING_ORPHAN_RECOVERY');
});

test('dispatchOrphanWorkflowRecovery escalates unresolved orphaned tickets after SLA', async () => {
  const sent: NotificationMessage[] = [];
  const auditEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const db = makeDb((sql, params) => {
    if (/INSERT INTO ticket_events/.test(sql)) {
      auditEvents.push({
        eventType: String(params?.[4]),
        payload: JSON.parse(String(params?.[5])) as Record<string, unknown>,
      });
    }
  });

  const summary = await dispatchOrphanWorkflowRecovery(
    makeRepo({
      listOrphanWorkflowCandidates: async () => [
        makeOrphanCandidate({
          fallbackProjectAdminId: null,
          orphanedAt: new Date('2026-03-04T02:00:00Z'),
          hasEscalationSignal: false,
        }),
      ],
    }),
    makeTransport(sent),
    db,
    {
      actorId: workerActorId,
      now: new Date('2026-03-04T08:30:00Z'),
    },
  );

  assert.equal(summary.reassignedCount, 0);
  assert.equal(summary.unresolvedCount, 1);
  assert.equal(summary.escalatedCount, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.kind, 'workflow.orphan_escalation');
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.eventType, 'ticket.unassigned');
});

test('dispatchOrphanWorkflowRecovery does not escalate unresolved orphaned tickets before SLA', async () => {
  const sent: NotificationMessage[] = [];

  const summary = await dispatchOrphanWorkflowRecovery(
    makeRepo({
      listOrphanWorkflowCandidates: async () => [
        makeOrphanCandidate({
          fallbackProjectAdminId: null,
          orphanedAt: new Date('2026-03-04T07:00:00Z'),
          hasEscalationSignal: false,
        }),
      ],
    }),
    makeTransport(sent),
    makeDb(),
    {
      actorId: workerActorId,
      now: new Date('2026-03-04T08:30:00Z'),
    },
  );

  assert.equal(summary.reassignedCount, 0);
  assert.equal(summary.unresolvedCount, 1);
  assert.equal(summary.escalatedCount, 0);
  assert.equal(sent.length, 0);
});

test('CallbackNotificationTransport delegates to the provided callback', async () => {
  const sent: NotificationMessage[] = [];
  const transport = new CallbackNotificationTransport(async (message) => {
    sent.push(message);
  });

  await transport.send({
    kind: 'vacancy.daily_admin_alert',
    tenantId,
    projectId,
    recipients: [],
    subject: 'subject',
    body: 'body',
    metadata: {},
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.subject, 'subject');
});

test('NotificationRepository maps approver timeout query rows into candidates', async () => {
  const repo = new NotificationRepository();
  let queryCount = 0;
  const db: DbClient = {
    query: async <T extends object>(sql: string) => {
      queryCount += 1;
      assert.match(sql, /FROM tickets t/);
      return {
        rows: [
          {
            tenant_id: tenantId,
            project_id: projectId,
            ticket_id: ticketId,
            ticket_number: 'U1-0007',
            submitted_at: '2026-03-03T18:00:00Z',
            has_warning_sent: false,
            has_unlocked_sent: true,
            recipients: JSON.stringify([
              {
                userId: 'manager-1',
                email: 'manager@example.com',
                name: 'Survey Manager',
              },
            ]),
          },
        ] as T[],
      };
    },
  };

  const candidates = await repo.listApproverTimeoutCandidates(
    db,
    new Date('2026-03-04T12:00:00Z'),
  );

  assert.equal(queryCount, 1);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.ticketId, ticketId);
  assert.equal(candidates[0]?.hasUnlockedSent, true);
  assert.equal(candidates[0]?.recipients[0]?.email, 'manager@example.com');
});

test('NotificationRepository maps vacancy escalation rows into candidates', async () => {
  const repo = new NotificationRepository();
  const db: DbClient = {
    query: async <T extends object>(sql: string) => {
      assert.match(sql, /FROM acting_grants ag/);
      return {
        rows: [
          {
            grant_id: 'grant-1' as UUID,
            tenant_id: tenantId,
            project_id: projectId,
            project_name: 'Alpha Build',
            role: 'SURVEY_MANAGER' as const,
            granted_reason: 'Survey Manager deactivated',
            created_at: '2026-03-03T08:00:00Z',
            recipients: [
              {
                userId: 'tenant-admin-1',
                email: 'tenant-admin@example.com',
                name: 'Tenant Admin',
              },
              {
                userId: 'project-admin-1',
                email: 'project-admin@example.com',
                name: 'Project Admin',
              },
            ],
          },
        ] as T[],
      };
    },
  };

  const candidates = await repo.listVacancyEscalationCandidates(
    db,
    new Date('2026-03-04T12:00:00Z'),
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.projectName, 'Alpha Build');
  assert.equal(candidates[0]?.role, 'SURVEY_MANAGER');
  assert.equal(candidates[0]?.recipients.length, 2);
});

test('NotificationRepository maps orphan workflow rows into candidates', async () => {
  const repo = new NotificationRepository();
  const db: DbClient = {
    query: async <T extends object>(sql: string) => {
      assert.match(sql, /FROM tickets t/);
      return {
        rows: [
          {
            tenant_id: tenantId,
            project_id: projectId,
            ticket_id: ticketId,
            ticket_number: 'U1-0007',
            row_version: 4,
            orphaned_at: '2026-03-04T00:00:00Z',
            assigned_party_chief_id: 'pc-1',
            assigned_instrument_man_id: null,
            survey_lead_id: 'lead-1',
            assigned_party_chief_orphaned: true,
            assigned_instrument_man_orphaned: false,
            survey_lead_orphaned: true,
            fallback_project_admin_id: 'project-admin-1',
            escalation_recipients: [
              {
                userId: 'tenant-admin-1',
                email: 'tenant-admin@example.com',
                name: 'Tenant Admin',
              },
            ],
            has_escalation_signal: false,
          },
        ] as T[],
      };
    },
  };

  const candidates = await repo.listOrphanWorkflowCandidates(db);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.rowVersion, 4);
  assert.equal(candidates[0]?.assignedPartyChiefOrphaned, true);
  assert.equal(candidates[0]?.fallbackProjectAdminId, 'project-admin-1');
  assert.equal(candidates[0]?.escalationRecipients.length, 1);
});
