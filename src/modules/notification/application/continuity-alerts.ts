import type { UUID } from '@/shared/types';
import type { EmailMessage, EmailTransport } from './index';

export type ContinuityAlertKind = 'ACTING_CONFIRMATION_OVERDUE' | 'CREW_VACANCY_OVERDUE';

export interface PendingContinuityAlert {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  kind: ContinuityAlertKind;
  sourceId: UUID;
  reminderDay: number;
  recipientEmail: string;
  projectName: string;
  vacancyRole: 'PARTY_CHIEF' | 'INSTRUMENT_MAN' | null;
}

export interface ContinuityAlertRepository {
  ingestDueAlerts(limit: number, now: Date): Promise<number>;
  claimDeliveries(limit: number, now: Date): Promise<PendingContinuityAlert[]>;
  markSent(id: UUID): Promise<void>;
  markFailed(id: UUID, error: string): Promise<void>;
}

export function composeContinuityAlert(alert: PendingContinuityAlert): EmailMessage {
  const projectName = alert.projectName.replace(/[\r\n]/g, ' ').slice(0, 200);
  if (alert.kind === 'ACTING_CONFIRMATION_OVERDUE') {
    return {
      to: alert.recipientEmail,
      subject: `Acting Survey Manager confirmation overdue - ${projectName}`,
      text: `An acting Survey Manager grant for ${projectName} is past its 24-hour confirmation window. ` +
        `This is escalation day ${alert.reminderDay}. Open project continuity health to confirm or override the grant.`,
      deliveryId: alert.id,
    };
  }
  if (!alert.vacancyRole) throw new Error('Crew vacancy role is missing');
  const role = alert.vacancyRole === 'PARTY_CHIEF' ? 'Party Chief' : 'Instrument Man';
  return {
    to: alert.recipientEmail,
    subject: `${role} vacancy unresolved - ${projectName}`,
    text: `A ${role} vacancy in ${projectName} remains unresolved after the 48-hour window. ` +
      `This is escalation day ${alert.reminderDay}. Open project continuity health and resolve affected tickets or crew coverage.`,
    deliveryId: alert.id,
  };
}

export async function runContinuityAlertCycle(repository: ContinuityAlertRepository,
  transport: EmailTransport, limit = 50, now = new Date()): Promise<{
    ingested: number; sent: number; failed: number;
  }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Continuity alert cycle limit must be an integer from 1 to 500');
  }
  const ingested = await repository.ingestDueAlerts(limit, now);
  const pending = await repository.claimDeliveries(limit, now);
  let sent = 0;
  let failed = 0;
  for (const alert of pending) {
    try {
      await transport.send(composeContinuityAlert(alert));
      await repository.markSent(alert.id);
      sent += 1;
    } catch (error) {
      await repository.markFailed(alert.id,
        error instanceof Error ? error.message.slice(0, 500) : 'Email transport failed');
      failed += 1;
    }
  }
  return { ingested, sent, failed };
}
