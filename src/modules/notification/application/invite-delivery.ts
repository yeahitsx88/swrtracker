import type { UUID } from '@/shared/types';
import type { EmailMessage, EmailTransport } from './index';

export interface PendingInviteDelivery {
  id: UUID;
  tenantId: UUID;
  inviteId: UUID;
  recipientEmail: string;
  token: UUID;
  projectName: string;
  expiresAt: Date;
  attempts: number;
}

export interface InviteDeliveryRepository {
  ingestEvents(limit: number): Promise<number>;
  claimDeliveries(limit: number): Promise<PendingInviteDelivery[]>;
  markSent(id: UUID): Promise<void>;
  markFailed(id: UUID, error: string): Promise<void>;
}

export function inviteBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): URL {
  const value = env.INVITE_BASE_URL;
  if (!value) throw new Error('INVITE_BASE_URL is required for email invitations');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INVITE_BASE_URL must be an absolute URL');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('INVITE_BASE_URL must be HTTPS and cannot contain credentials or a query');
  }
  return url;
}

export function composeInviteEmail(delivery: PendingInviteDelivery, baseUrl: URL): EmailMessage {
  const acceptUrl = new URL(baseUrl);
  acceptUrl.searchParams.set('token', delivery.token);
  const projectName = delivery.projectName.replace(/[\r\n]/g, ' ').slice(0, 200);
  return {
    to: delivery.recipientEmail,
    subject: `Invitation to ${projectName}`,
    text: `You have been invited to ${projectName} on SWRTracker.\n\n` +
      `Open this link to accept your invitation:\n${acceptUrl.toString()}\n\n` +
      `This link expires on ${delivery.expiresAt.toISOString()}. If you did not expect this invitation, ignore this email.`,
    deliveryId: delivery.id,
  };
}

export async function runInviteDeliveryCycle(repository: InviteDeliveryRepository,
  transport: EmailTransport, baseUrl: URL, limit = 50): Promise<{
    ingested: number; sent: number; failed: number;
  }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Invite cycle limit must be an integer from 1 to 500');
  }
  const ingested = await repository.ingestEvents(limit);
  const pending = await repository.claimDeliveries(limit);
  let sent = 0;
  let failed = 0;
  for (const delivery of pending) {
    try {
      await transport.send(composeInviteEmail(delivery, baseUrl));
      await repository.markSent(delivery.id);
      sent += 1;
    } catch (error) {
      await repository.markFailed(delivery.id,
        error instanceof Error ? error.message.slice(0, 500) : 'Email transport failed');
      failed += 1;
    }
  }
  return { ingested, sent, failed };
}
