import type { DbClient, UUID } from '@/shared/types';

export async function enqueueNotification(
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    recipientUserId: UUID;
    eventType: string;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO notification_outbox
       (tenant_id, ticket_id, recipient_user_id, event_type, payload, idempotency_key)
     SELECT $1, t.id, u.id, $4, $5, $6
     FROM tickets t
     JOIN users u ON u.id=$3 AND u.tenant_id=t.tenant_id
     JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
     JOIN project_memberships pm ON pm.project_id=t.project_id AND pm.user_id=u.id
     WHERE t.tenant_id=$1 AND t.id=$2
       AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL
       AND (c.type<>'SUBCONTRACTOR' OR pm.role='REQUESTER')
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
    [
      params.tenantId,
      params.ticketId,
      params.recipientUserId,
      params.eventType,
      JSON.stringify(params.payload ?? {}),
      params.idempotencyKey,
    ],
  );
}

export async function enqueueRequesterNotification(
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    requesterId: UUID;
    eventType: string;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
  },
): Promise<void> {
  return enqueueNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    recipientUserId: params.requesterId,
    eventType: params.eventType,
    payload: params.payload,
    idempotencyKey: params.idempotencyKey,
  });
}

export async function enqueueAssignedFieldNotifications(
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    assignedPartyChiefId: UUID | null;
    assignedInstrumentManId: UUID | null;
    eventType: string;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
  },
): Promise<void> {
  const recipients = [
    ['party-chief', params.assignedPartyChiefId],
    ['instrument-man', params.assignedInstrumentManId],
  ] as const;
  for (const [role, recipientUserId] of recipients) {
    if (!recipientUserId) continue;
    await enqueueNotification(db, {
      tenantId: params.tenantId,
      ticketId: params.ticketId,
      recipientUserId,
      eventType: params.eventType,
      payload: params.payload,
      idempotencyKey: `${params.idempotencyKey}:${role}`,
    });
  }
}
