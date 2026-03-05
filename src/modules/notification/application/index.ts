/**
 * Notification application layer — background dispatch and operational signals.
 * Do not import from infrastructure here.
 */
import { appendAuditEvent } from '@/modules/audit/application';
import type { DbClient, UUID } from '@/shared/types';

export interface NotificationRecipient {
  userId: UUID;
  email: string;
  name: string | null;
}

export interface ApproverTimeoutCandidate {
  tenantId: UUID;
  projectId: UUID;
  ticketId: UUID;
  ticketNumber: string | null;
  submittedAt: Date;
  recipients: NotificationRecipient[];
  hasWarningSent: boolean;
  hasUnlockedSent: boolean;
}

export type VacancyEscalationRole =
  | 'SURVEY_MANAGER'
  | 'PARTY_CHIEF'
  | 'INSTRUMENT_MAN';

export interface VacancyEscalationCandidate {
  grantId: UUID;
  tenantId: UUID;
  projectId: UUID;
  projectName: string;
  role: VacancyEscalationRole;
  grantedReason: string;
  createdAt: Date;
  recipients: NotificationRecipient[];
}

export interface OrphanWorkflowCandidate {
  tenantId: UUID;
  projectId: UUID;
  ticketId: UUID;
  ticketNumber: string | null;
  rowVersion: number;
  orphanedAt: Date;
  assignedPartyChiefId: UUID | null;
  assignedInstrumentManId: UUID | null;
  surveyLeadId: UUID | null;
  assignedPartyChiefOrphaned: boolean;
  assignedInstrumentManOrphaned: boolean;
  surveyLeadOrphaned: boolean;
  fallbackProjectAdminId: UUID | null;
  escalationRecipients: NotificationRecipient[];
  hasEscalationSignal: boolean;
}

export interface INotificationRepository {
  listApproverTimeoutCandidates(
    db: DbClient,
    now: Date,
  ): Promise<ApproverTimeoutCandidate[]>;
  listVacancyEscalationCandidates(
    db: DbClient,
    now: Date,
  ): Promise<VacancyEscalationCandidate[]>;
  listOrphanWorkflowCandidates(
    db: DbClient,
  ): Promise<OrphanWorkflowCandidate[]>;
  reassignOrphanWorkflowTicket(
    db: DbClient,
    params: {
      tenantId: UUID;
      ticketId: UUID;
      expectedRowVersion: number;
      fallbackProjectAdminId: UUID;
      assignedPartyChiefOrphaned: boolean;
      assignedInstrumentManOrphaned: boolean;
      surveyLeadOrphaned: boolean;
    },
  ): Promise<boolean>;
}

export type NotificationKind =
  | 'approver.timeout_warning'
  | 'approver.timeout_unlocked'
  | 'vacancy.daily_admin_alert'
  | 'workflow.orphan_escalation';

export interface NotificationMessage {
  kind: NotificationKind;
  tenantId: UUID;
  projectId: UUID;
  ticketId?: UUID;
  recipients: NotificationRecipient[];
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
}

export interface INotificationTransport {
  send(message: NotificationMessage): Promise<void>;
}

export interface ApproverTimeoutDispatchSummary {
  warningCount: number;
  unlockedCount: number;
}

const APPROVER_TIMEOUT_WARNING_HOURS = 18;
const APPROVER_TIMEOUT_UNLOCKED_HOURS = 24;
const ORPHAN_REASSIGNMENT_SLA_HOURS = 4;

const VACANCY_ESCALATION_HOURS: Record<VacancyEscalationRole, number> = {
  SURVEY_MANAGER: 24,
  PARTY_CHIEF: 48,
  INSTRUMENT_MAN: 48,
};

export async function dispatchApproverTimeoutNotifications(
  repo: INotificationRepository,
  transport: INotificationTransport,
  db: DbClient,
  params: {
    actorId: UUID;
    now?: Date;
  },
): Promise<ApproverTimeoutDispatchSummary> {
  const now = params.now ?? new Date();
  const candidates = await repo.listApproverTimeoutCandidates(db, now);
  const summary: ApproverTimeoutDispatchSummary = {
    warningCount: 0,
    unlockedCount: 0,
  };

  for (const candidate of candidates) {
    const recipients = dedupeRecipients(candidate.recipients);
    if (recipients.length === 0) {
      continue;
    }

    const hoursElapsed = getElapsedHours(now, candidate.submittedAt);
    if (hoursElapsed < APPROVER_TIMEOUT_WARNING_HOURS) {
      continue;
    }

    if (hoursElapsed >= APPROVER_TIMEOUT_UNLOCKED_HOURS) {
      if (candidate.hasUnlockedSent) {
        continue;
      }

      await transport.send({
        kind: 'approver.timeout_unlocked',
        tenantId: candidate.tenantId,
        projectId: candidate.projectId,
        ticketId: candidate.ticketId,
        recipients,
        subject: `Approval timeout escalation for ${describeTicket(candidate)}`,
        body: `${describeTicket(candidate)} has been in SUBMITTED for ${hoursElapsed} hours without Survey Manager action.`,
        metadata: {
          ticketId: candidate.ticketId,
          ticketNumber: candidate.ticketNumber,
          hoursElapsed,
        },
      });

      await appendAuditEvent(db, {
        ticketId: candidate.ticketId,
        tenantId: candidate.tenantId,
        actorId: params.actorId,
        eventType: 'approver.timeout_unlocked',
        payload: {
          ticketId: candidate.ticketId,
          hoursElapsed,
        },
      });

      summary.unlockedCount += 1;
      continue;
    }

    if (candidate.hasWarningSent) {
      continue;
    }

    await transport.send({
      kind: 'approver.timeout_warning',
      tenantId: candidate.tenantId,
      projectId: candidate.projectId,
      ticketId: candidate.ticketId,
      recipients,
      subject: `Approval pending for ${describeTicket(candidate)}`,
      body: `${describeTicket(candidate)} has been waiting ${hoursElapsed} hours for Survey Manager review.`,
      metadata: {
        ticketId: candidate.ticketId,
        ticketNumber: candidate.ticketNumber,
        hoursElapsed,
      },
    });

    await appendAuditEvent(db, {
      ticketId: candidate.ticketId,
      tenantId: candidate.tenantId,
      actorId: params.actorId,
      eventType: 'approver.timeout_warning_sent',
      payload: {
        ticketId: candidate.ticketId,
        hoursElapsed,
      },
    });

    summary.warningCount += 1;
  }

  return summary;
}

export async function dispatchDailyVacancyNotifications(
  repo: INotificationRepository,
  transport: INotificationTransport,
  db: DbClient,
  params?: {
    now?: Date;
  },
): Promise<{ sentCount: number }> {
  const now = params?.now ?? new Date();
  const candidates = await repo.listVacancyEscalationCandidates(db, now);
  let sentCount = 0;

  for (const candidate of candidates) {
    const thresholdHours = VACANCY_ESCALATION_HOURS[candidate.role];
    const hoursElapsed = getElapsedHours(now, candidate.createdAt);
    if (hoursElapsed < thresholdHours) {
      continue;
    }

    const recipients = dedupeRecipients(candidate.recipients);
    if (recipients.length === 0) {
      continue;
    }

    await transport.send({
      kind: 'vacancy.daily_admin_alert',
      tenantId: candidate.tenantId,
      projectId: candidate.projectId,
      recipients,
      subject: `Daily vacancy escalation for ${candidate.projectName}`,
      body: `${candidate.role} vacancy remains unresolved after ${hoursElapsed} hours on project ${candidate.projectName}.`,
      metadata: {
        grantId: candidate.grantId,
        role: candidate.role,
        grantedReason: candidate.grantedReason,
        hoursElapsed,
        thresholdHours,
      },
    });

    sentCount += 1;
  }

  return { sentCount };
}

export interface OrphanWorkflowRecoverySummary {
  reassignedCount: number;
  escalatedCount: number;
  unresolvedCount: number;
}

export async function dispatchOrphanWorkflowRecovery(
  repo: INotificationRepository,
  transport: INotificationTransport,
  db: DbClient,
  params: {
    actorId: UUID;
    now?: Date;
  },
): Promise<OrphanWorkflowRecoverySummary> {
  const now = params.now ?? new Date();
  const candidates = await repo.listOrphanWorkflowCandidates(db);
  const summary: OrphanWorkflowRecoverySummary = {
    reassignedCount: 0,
    escalatedCount: 0,
    unresolvedCount: 0,
  };

  for (const candidate of candidates) {
    if (candidate.fallbackProjectAdminId) {
      const reassigned = await repo.reassignOrphanWorkflowTicket(db, {
        tenantId: candidate.tenantId,
        ticketId: candidate.ticketId,
        expectedRowVersion: candidate.rowVersion,
        fallbackProjectAdminId: candidate.fallbackProjectAdminId,
        assignedPartyChiefOrphaned: candidate.assignedPartyChiefOrphaned,
        assignedInstrumentManOrphaned: candidate.assignedInstrumentManOrphaned,
        surveyLeadOrphaned: candidate.surveyLeadOrphaned,
      });

      if (!reassigned) {
        continue;
      }

      await appendAuditEvent(db, {
        ticketId: candidate.ticketId,
        tenantId: candidate.tenantId,
        actorId: params.actorId,
        eventType: 'ticket.assigned',
        payload: {
          reason: 'OFFBOARDING_ORPHAN_RECOVERY',
          fallbackProjectAdminId: candidate.fallbackProjectAdminId,
          previousAssignedPartyChiefId: candidate.assignedPartyChiefId,
          previousAssignedInstrumentManId: candidate.assignedInstrumentManId,
          previousSurveyLeadId: candidate.surveyLeadId,
          assignedPartyChiefOrphaned: candidate.assignedPartyChiefOrphaned,
          assignedInstrumentManOrphaned: candidate.assignedInstrumentManOrphaned,
          surveyLeadOrphaned: candidate.surveyLeadOrphaned,
        },
      });

      summary.reassignedCount += 1;
      continue;
    }

    summary.unresolvedCount += 1;
    const hoursElapsed = getElapsedHours(now, candidate.orphanedAt);
    if (hoursElapsed < ORPHAN_REASSIGNMENT_SLA_HOURS || candidate.hasEscalationSignal) {
      continue;
    }

    const recipients = dedupeRecipients(candidate.escalationRecipients);
    if (recipients.length === 0) {
      continue;
    }

    await transport.send({
      kind: 'workflow.orphan_escalation',
      tenantId: candidate.tenantId,
      projectId: candidate.projectId,
      ticketId: candidate.ticketId,
      recipients,
      subject: `Orphaned workflow escalation for ${describeTicket(candidate)}`,
      body: `${describeTicket(candidate)} remains orphaned for ${hoursElapsed} hours with no active project-admin fallback.`,
      metadata: {
        ticketId: candidate.ticketId,
        ticketNumber: candidate.ticketNumber,
        hoursElapsed,
        slaHours: ORPHAN_REASSIGNMENT_SLA_HOURS,
      },
    });

    await appendAuditEvent(db, {
      ticketId: candidate.ticketId,
      tenantId: candidate.tenantId,
      actorId: params.actorId,
      eventType: 'ticket.unassigned',
      payload: {
        reason: 'OFFBOARDING_ORPHAN_ESCALATION',
        hoursElapsed,
      },
    });

    summary.escalatedCount += 1;
  }

  return summary;
}

function getElapsedHours(now: Date, startedAt: Date): number {
  return Math.floor((now.getTime() - startedAt.getTime()) / (60 * 60 * 1000));
}

function dedupeRecipients(recipients: NotificationRecipient[]): NotificationRecipient[] {
  const seen = new Set<string>();
  const deduped: NotificationRecipient[] = [];

  for (const recipient of recipients) {
    const key = `${recipient.userId}:${recipient.email.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(recipient);
  }

  return deduped;
}

function describeTicket(candidate: Pick<ApproverTimeoutCandidate, 'ticketId' | 'ticketNumber'>): string {
  return candidate.ticketNumber
    ? `ticket ${candidate.ticketNumber}`
    : `ticket ${candidate.ticketId}`;
}
