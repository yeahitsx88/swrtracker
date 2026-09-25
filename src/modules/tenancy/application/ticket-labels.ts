import { NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export interface TicketLabelContext {
  tenantId: UUID; projectId: UUID; aorNodeId: UUID | null; departmentId: UUID | null;
}
export interface TicketLabels {
  projectName: string; locationName: string | null; departmentName: string | null;
}
export interface TicketLabelsPort {
  find(db: DbClient, context: TicketLabelContext): Promise<TicketLabels | null>;
}

/** Called only after the caller has authorized access to the underlying ticket. */
export async function getTicketLabels(repo: TicketLabelsPort, db: DbClient,
  context: TicketLabelContext): Promise<TicketLabels> {
  const labels = await repo.find(db, context);
  if (!labels || (context.aorNodeId && !labels.locationName) ||
      (context.departmentId && !labels.departmentName)) {
    throw new NotFoundError('Request location or department not found in this project');
  }
  return labels;
}
