import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { parseRequesterIntake } from '@/lib/requester-intake-input';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { lockDraftActor, lockRequesterTicket } from '@/modules/ticket/application/draft-access';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

/** Explicit partial Save Draft; legacy complete/direct creation contracts stay intact. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireActiveAuth(req);
    const { projectId } = await params;
    requireResourceUuid(projectId, 'projectId');
    const key = requireIdempotencyKey(req);
    const body: unknown = await req.json();
    const { changes } = parseRequesterIntake(body);
    const result = await withTransaction(async db => {
      const scope = { tenantId: auth.tenantId, projectId: projectId as UUID,
        actorId: auth.userId, sessionVersion: auth.sessionVersion };
      const actor = await lockDraftActor(db, scope, 'REQUESTER');
      const saved = await executeIdempotentHttpMutation(db, { tenantId: auth.tenantId, actorId: auth.userId,
        endpoint: `POST:/api/projects/${projectId}/drafts`, idempotencyKey: key }, body,
        async () => ({ status: 201, body: { ticket: await createTicket(new TicketRepository(), db, {
          tenantId: auth.tenantId, projectId: projectId as UUID, requesterId: auth.userId,
          companyId: actor.companyId, workflowVariant: 'STANDARD_APPROVAL',
          aorNodeId: changes.aorNodeId ?? null, ticketType: changes.ticketType ?? null,
          requestedDate: changes.requestedDate ?? null, description: changes.description ?? '',
          fieldContact: changes.fieldContact ?? '', fieldChannel: changes.fieldChannel ?? '',
          craft: changes.craft ?? '', explicitDraftSave: true,
        }) } }));
      if (saved.replayed) await lockRequesterTicket(db, { ...scope, ticketId: saved.body.ticket.id });
      return saved;
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
