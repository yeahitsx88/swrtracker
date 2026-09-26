import { NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export interface TicketLabelContext {
  tenantId: UUID; projectId: UUID; aorNodeId: UUID | null; departmentId: UUID | null;
  partyChiefId?: UUID | null; instrumentManId?: UUID | null;
  superintendentId?: UUID | null;
  cadAssigneeId?: UUID | null; cadReviewerId?: UUID | null;
}
export interface TicketLabels {
  projectName: string; locationName: string | null; departmentName: string | null;
  partyChiefName: string | null; instrumentManName: string | null;
  superintendentName: string | null;
  cadAssigneeName: string | null; cadReviewerName: string | null;
}
export interface TicketLabelsPort {
  find(db: DbClient, context: TicketLabelContext): Promise<TicketLabels | null>;
}

/** Called only after the caller has authorized access to the underlying ticket. */
export async function getTicketLabels(repo: TicketLabelsPort, db: DbClient,
  context: TicketLabelContext): Promise<TicketLabels> {
  const labels = await repo.find(db, context);
  if (!labels || (context.aorNodeId && !labels.locationName) ||
      (context.departmentId && !labels.departmentName) ||
      (context.partyChiefId && !labels.partyChiefName) ||
      (context.instrumentManId && !labels.instrumentManName) ||
      (context.superintendentId && !labels.superintendentName) ||
      (context.cadAssigneeId && !labels.cadAssigneeName) ||
      (context.cadReviewerId && !labels.cadReviewerName)) {
    throw new NotFoundError('Request project, location, department or crew details were not found');
  }
  return labels;
}
