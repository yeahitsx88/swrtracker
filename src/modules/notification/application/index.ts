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

export interface INotificationRepository {
  listApproverTimeoutCandidates(
    db: DbClient,
    now: Date,
  ): Promise<ApproverTimeoutCandidate[]>;
  listVacancyEscalationCandidates(
    db: DbClient,
    now: Date,
  ): Promise<VacancyEscalationCandidate[]>;
}

export type NotificationKind =
  | 'approver.timeout_warning'
  | 'approver.timeout_unlocked'
  | 'vacancy.daily_admin_alert';

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
