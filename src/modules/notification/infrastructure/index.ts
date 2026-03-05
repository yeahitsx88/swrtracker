/**
 * Notification infrastructure — candidate queries and transport adapter.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { IEmailTransport } from '@/lib/email';
import type {
  ApproverTimeoutCandidate,
  OrphanWorkflowCandidate,
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

interface OrphanWorkflowRow {
  tenant_id: UUID;
  project_id: UUID;
  ticket_id: UUID;
  ticket_number: string | null;
  row_version: number | null;
  orphaned_at: Date | string;
  assigned_party_chief_id: UUID | null;
  assigned_instrument_man_id: UUID | null;
  survey_lead_id: UUID | null;
  assigned_party_chief_orphaned: boolean;
  assigned_instrument_man_orphaned: boolean;
  survey_lead_orphaned: boolean;
  fallback_project_admin_id: UUID | null;
  escalation_recipients: unknown;
  has_escalation_signal: boolean;
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

  async listOrphanWorkflowCandidates(
    db: DbClient,
  ): Promise<OrphanWorkflowCandidate[]> {
    const { rows } = await db.query<OrphanWorkflowRow>(
      `SELECT
         t.tenant_id,
         t.project_id,
         t.id AS ticket_id,
         t.ticket_number,
         COALESCE(t.row_version, 0) AS row_version,
         COALESCE(
           LEAST(
             COALESCE(pc.deactivated_at, 'infinity'::timestamptz),
             COALESCE(im.deactivated_at, 'infinity'::timestamptz),
             COALESCE(sl.deactivated_at, 'infinity'::timestamptz)
           ),
           t.updated_at
         ) AS orphaned_at,
         t.assigned_party_chief_id,
         t.assigned_instrument_man_id,
         t.survey_lead_id,
         (t.assigned_party_chief_id IS NOT NULL AND pc.deactivated_at IS NOT NULL) AS assigned_party_chief_orphaned,
         (t.assigned_instrument_man_id IS NOT NULL AND im.deactivated_at IS NOT NULL) AS assigned_instrument_man_orphaned,
         (t.survey_lead_id IS NOT NULL AND sl.deactivated_at IS NOT NULL) AS survey_lead_orphaned,
         fallback_admin.user_id AS fallback_project_admin_id,
         COALESCE(escalation_recipients.recipients, '[]'::jsonb) AS escalation_recipients,
         EXISTS (
           SELECT 1
           FROM ticket_events te
           WHERE te.ticket_id = t.id
             AND te.tenant_id = t.tenant_id
             AND te.event_type = 'ticket.unassigned'
         ) AS has_escalation_signal
       FROM tickets t
       JOIN projects p
         ON p.id = t.project_id
        AND p.tenant_id = t.tenant_id
       LEFT JOIN users pc
         ON pc.id = t.assigned_party_chief_id
        AND pc.tenant_id = t.tenant_id
       LEFT JOIN users im
         ON im.id = t.assigned_instrument_man_id
        AND im.tenant_id = t.tenant_id
       LEFT JOIN users sl
         ON sl.id = t.survey_lead_id
        AND sl.tenant_id = t.tenant_id
       LEFT JOIN LATERAL (
         SELECT pm.user_id
         FROM project_memberships pm
         JOIN users u
           ON u.id = pm.user_id
          AND u.tenant_id = t.tenant_id
          AND u.deactivated_at IS NULL
         WHERE pm.project_id = t.project_id
           AND pm.role = 'PROJECT_ADMIN'
         ORDER BY pm.user_id
         LIMIT 1
       ) AS fallback_admin ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           DISTINCT jsonb_build_object('userId', recipients.user_id, 'email', recipients.email, 'name', recipients.name)
         ) AS recipients
         FROM (
           SELECT u.id AS user_id, u.email, u.name
           FROM tenant_memberships tm
           JOIN users u
             ON u.id = tm.user_id
            AND u.tenant_id = t.tenant_id
            AND u.deactivated_at IS NULL
           WHERE tm.tenant_id = t.tenant_id
             AND tm.role = 'TENANT_ADMIN'
           UNION
           SELECT u.id AS user_id, u.email, u.name
           FROM project_memberships pm
           JOIN users u
             ON u.id = pm.user_id
            AND u.tenant_id = t.tenant_id
            AND u.deactivated_at IS NULL
           WHERE pm.project_id = t.project_id
             AND pm.role = 'PROJECT_ADMIN'
         ) AS recipients
       ) AS escalation_recipients ON TRUE
       WHERE p.status = 'ACTIVE'
         AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED')
         AND (
           (t.assigned_party_chief_id IS NOT NULL AND pc.deactivated_at IS NOT NULL) OR
           (t.assigned_instrument_man_id IS NOT NULL AND im.deactivated_at IS NOT NULL) OR
           (t.survey_lead_id IS NOT NULL AND sl.deactivated_at IS NOT NULL)
         )`,
    );

    return rows.map((row) => ({
      tenantId: row.tenant_id,
      projectId: row.project_id,
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      rowVersion: row.row_version ?? 0,
      orphanedAt: toDate(row.orphaned_at),
      assignedPartyChiefId: row.assigned_party_chief_id,
      assignedInstrumentManId: row.assigned_instrument_man_id,
      surveyLeadId: row.survey_lead_id,
      assignedPartyChiefOrphaned: row.assigned_party_chief_orphaned,
      assignedInstrumentManOrphaned: row.assigned_instrument_man_orphaned,
      surveyLeadOrphaned: row.survey_lead_orphaned,
      fallbackProjectAdminId: row.fallback_project_admin_id,
      escalationRecipients: parseRecipients(row.escalation_recipients),
      hasEscalationSignal: row.has_escalation_signal,
    }));
  }

  async reassignOrphanWorkflowTicket(
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
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE tickets
       SET assigned_party_chief_id = CASE
             WHEN $4::boolean THEN $1
             ELSE assigned_party_chief_id
           END,
           assigned_instrument_man_id = CASE
             WHEN $5::boolean THEN NULL
             ELSE assigned_instrument_man_id
           END,
           survey_lead_id = CASE
             WHEN $4::boolean OR $6::boolean THEN $1
             ELSE survey_lead_id
           END,
           row_version = COALESCE(row_version, 0) + 1,
           updated_at = NOW()
       WHERE tenant_id = $2
         AND id = $3
         AND COALESCE(row_version, 0) = $7
       RETURNING id`,
      [
        params.fallbackProjectAdminId,
        params.tenantId,
        params.ticketId,
        params.assignedPartyChiefOrphaned,
        params.assignedInstrumentManOrphaned,
        params.surveyLeadOrphaned,
        params.expectedRowVersion,
      ],
    );

    return !!rows[0];
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
