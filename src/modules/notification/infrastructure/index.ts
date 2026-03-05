/**
 * Notification infrastructure — candidate queries and transport adapter.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { IEmailTransport } from '@/lib/email';
import type {
  ApproverTimeoutCandidate,
  INotificationRepository,
  INotificationTransport,
  NotificationMessage,
  NotificationRecipient,
  VacancyEscalationCandidate,
} from '../application';

interface ApproverTimeoutRow {
  tenant_id: UUID;
  project_id: UUID;
  ticket_id: UUID;
  ticket_number: string | null;
  submitted_at: Date | string;
  has_warning_sent: boolean;
  has_unlocked_sent: boolean;
  recipients: unknown;
}

interface VacancyEscalationRow {
  grant_id: UUID;
  tenant_id: UUID;
  project_id: UUID;
  project_name: string;
  role: VacancyEscalationCandidate['role'];
  granted_reason: string;
  created_at: Date | string;
  recipients: unknown;
}

export class NotificationRepository implements INotificationRepository {
  async listApproverTimeoutCandidates(
    db: DbClient,
    now: Date,
  ): Promise<ApproverTimeoutCandidate[]> {
    const { rows } = await db.query<ApproverTimeoutRow>(
      `SELECT
         t.tenant_id,
         t.project_id,
         t.id AS ticket_id,
         t.ticket_number,
         t.submitted_at,
         EXISTS (
           SELECT 1
           FROM ticket_events te
           WHERE te.ticket_id = t.id
             AND te.tenant_id = t.tenant_id
             AND te.event_type = 'approver.timeout_warning_sent'
         ) AS has_warning_sent,
         EXISTS (
           SELECT 1
           FROM ticket_events te
           WHERE te.ticket_id = t.id
             AND te.tenant_id = t.tenant_id
             AND te.event_type = 'approver.timeout_unlocked'
         ) AS has_unlocked_sent,
         COALESCE(
           jsonb_agg(DISTINCT jsonb_build_object('userId', u.id, 'email', u.email, 'name', u.name))
             FILTER (WHERE u.id IS NOT NULL),
           '[]'::jsonb
         ) AS recipients
       FROM tickets t
       JOIN projects p
         ON p.id = t.project_id
        AND p.tenant_id = t.tenant_id
       LEFT JOIN project_memberships pm
         ON pm.project_id = t.project_id
        AND pm.role = 'SURVEY_MANAGER'
       LEFT JOIN users u
         ON u.id = pm.user_id
        AND u.tenant_id = t.tenant_id
       WHERE t.status = 'SUBMITTED'
         AND t.submitted_at IS NOT NULL
         AND p.status = 'ACTIVE'
         AND $1::timestamptz - t.submitted_at >= interval '18 hours'
       GROUP BY
         t.tenant_id,
         t.project_id,
         t.id,
         t.ticket_number,
         t.submitted_at`,
      [now],
    );

    return rows.map((row) => ({
      tenantId: row.tenant_id,
      projectId: row.project_id,
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      submittedAt: toDate(row.submitted_at),
      recipients: parseRecipients(row.recipients),
      hasWarningSent: row.has_warning_sent,
      hasUnlockedSent: row.has_unlocked_sent,
    }));
  }

  async listVacancyEscalationCandidates(
    db: DbClient,
    now: Date,
  ): Promise<VacancyEscalationCandidate[]> {
    const { rows } = await db.query<VacancyEscalationRow>(
      `SELECT
         ag.id AS grant_id,
         ag.tenant_id,
         ag.project_id,
         p.name AS project_name,
         ag.role,
         ag.granted_reason,
         ag.created_at,
         COALESCE(tenant_admins.recipients, '[]'::jsonb) ||
         COALESCE(project_admins.recipients, '[]'::jsonb) AS recipients
       FROM acting_grants ag
       JOIN projects p
         ON p.id = ag.project_id
        AND p.tenant_id = ag.tenant_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           DISTINCT jsonb_build_object('userId', u.id, 'email', u.email, 'name', u.name)
         ) AS recipients
         FROM tenant_memberships tm
         JOIN users u
           ON u.id = tm.user_id
          AND u.tenant_id = ag.tenant_id
         WHERE tm.tenant_id = ag.tenant_id
           AND tm.role = 'TENANT_ADMIN'
       ) AS tenant_admins ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           DISTINCT jsonb_build_object('userId', u.id, 'email', u.email, 'name', u.name)
         ) AS recipients
         FROM project_memberships pm
         JOIN users u
           ON u.id = pm.user_id
          AND u.tenant_id = ag.tenant_id
         WHERE pm.project_id = ag.project_id
           AND pm.role = 'PROJECT_ADMIN'
       ) AS project_admins ON TRUE
       WHERE ag.revoked_at IS NULL
         AND p.status = 'ACTIVE'
         AND ag.role IN ('SURVEY_MANAGER', 'PARTY_CHIEF', 'INSTRUMENT_MAN')
         AND $1::timestamptz - ag.created_at >= CASE
           WHEN ag.role = 'SURVEY_MANAGER' THEN interval '24 hours'
           ELSE interval '48 hours'
         END`,
      [now],
    );

    return rows.map((row) => ({
      grantId: row.grant_id,
      tenantId: row.tenant_id,
      projectId: row.project_id,
      projectName: row.project_name,
      role: row.role,
      grantedReason: row.granted_reason,
      createdAt: toDate(row.created_at),
      recipients: parseRecipients(row.recipients),
    }));
  }
}

export class CallbackNotificationTransport implements INotificationTransport {
  constructor(
    private readonly callback: (message: NotificationMessage) => Promise<void> | void,
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    await this.callback(message);
  }
}

export class EmailNotificationTransport implements INotificationTransport {
  constructor(private readonly emailTransport: IEmailTransport) {}

  async send(message: NotificationMessage): Promise<void> {
    const recipients = message.recipients
      .map((recipient) => recipient.email)
      .filter((email, index, all) => all.indexOf(email) === index);

    if (recipients.length === 0) {
      return;
    }

    await this.emailTransport.send({
      to: recipients,
      subject: message.subject,
      text: message.body,
      metadata: {
        kind: message.kind,
        tenantId: message.tenantId,
        projectId: message.projectId,
        ticketId: message.ticketId ?? null,
        ...message.metadata,
      },
    });
  }
}

function parseRecipients(raw: unknown): NotificationRecipient[] {
  const parsed = typeof raw === 'string'
    ? JSON.parse(raw) as unknown
    : raw;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
    .map((recipient) => ({
      userId: String(recipient.userId) as UUID,
      email: String(recipient.email),
      name: recipient.name == null ? null : String(recipient.name),
    }));
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
