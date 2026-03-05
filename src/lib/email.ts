import { logInfo } from '@/lib/observability';
import type { UUID } from '@/shared/types';

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface IEmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailTransport implements IEmailTransport {
  async send(message: EmailMessage): Promise<void> {
    logInfo('Email dispatched via console transport', {
      eventType: 'email.sent.console',
      actorId: null,
      tenantId: null,
      ticketId: null,
      recipients: message.to,
      subject: message.subject,
      metadata: message.metadata ?? {},
    });
  }
}

export class WebhookEmailTransport implements IEmailTransport {
  constructor(
    private readonly webhookUrl: string,
    private readonly apiKey?: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      throw new Error(`Email webhook transport failed with status ${response.status}`);
    }
  }
}

export function createEmailTransportFromEnv(): IEmailTransport {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    return new WebhookEmailTransport(webhookUrl, process.env.EMAIL_WEBHOOK_API_KEY?.trim());
  }
  return new ConsoleEmailTransport();
}

export async function sendPasswordResetEmail(
  transport: IEmailTransport,
  params: {
    tenantId: UUID;
    recipientEmail: string;
    resetToken: string;
    appBaseUrl: string;
  },
): Promise<void> {
  const resetLink = `${params.appBaseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(params.resetToken)}`;
  await transport.send({
    to: [params.recipientEmail],
    subject: 'Reset your SWR Tracker password',
    text: `Use this link to reset your password: ${resetLink}`,
    metadata: {
      tenantId: params.tenantId,
      resetLink,
    },
  });
}
