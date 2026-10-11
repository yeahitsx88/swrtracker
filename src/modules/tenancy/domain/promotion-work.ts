/**
 * Decision 57 / D8: when a person's survey role changes, each of their open requests is
 * reviewed: keep it (only where the new role can still see and complete it) or reassign it
 * to someone holding the old role. Work waiting on a field-report decision cannot move and
 * must be resolved first. Pure rules; the transaction applies them.
 */
import { ConflictError, ValidationError } from '@/shared/errors';

export type WorkPart = 'CHIEF' | 'INSTRUMENT' | 'REVIEWER';
export type WorkAction = 'KEEP' | 'REASSIGN';
export interface PromotionWorkItem {
  ticketId: string; ticketNumber: string | null; description: string | null;
  status: string; rowVersion: number; part: WorkPart;
}
export interface PlannedWorkItem extends PromotionWorkItem { keepAllowed: boolean; reassignable: boolean; note: string }
export interface WorkDecision { ticketId: string; part: WorkPart; action: WorkAction; replacementId?: string; expectedRowVersion: number }

/** Statuses where the crew may change (the existing assignment rule). */
const REASSIGNABLE = ['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED'];
const PART_ROLE: Record<Exclude<WorkPart, 'REVIEWER'>, string> = { CHIEF: 'Party Chief', INSTRUMENT: 'Instrument Man' };

/**
 * Whether the new role may still finish this part. A recorded field-report reviewer keeps the
 * decision only as Survey Manager, the one survey role that sees every request; crew parts
 * belong to the old role.
 */
export function newRoleCanComplete(part: WorkPart, newRole: string): boolean {
  return part === 'REVIEWER' && newRole === 'SURVEY_MANAGER';
}

export function planPromotionWork(items: PromotionWorkItem[], newRole: string): PlannedWorkItem[] {
  return items.map(item => {
    const keepAllowed = newRoleCanComplete(item.part, newRole);
    const reassignable = item.part !== 'REVIEWER' && REASSIGNABLE.includes(item.status);
    const note = keepAllowed ? 'The new role can complete this.'
      : reassignable ? `Choose another ${PART_ROLE[item.part as Exclude<WorkPart, 'REVIEWER'>]} for this request.`
      : item.part === 'REVIEWER' ? 'Decide this field report in Field Report Review before changing the role.'
      : 'This request is waiting for a field-report decision. Resolve it before changing the role.';
    return { ...item, keepAllowed, reassignable, note };
  });
}

/** Every open item needs one valid decision made against its current version. */
export function validateWorkDecisions(planned: PlannedWorkItem[], decisions: WorkDecision[], subjectId: string): void {
  const key = (value: { ticketId: string; part: WorkPart }) => `${value.ticketId}:${value.part}`;
  const byKey = new Map(planned.map(item => [key(item), item]));
  const seen = new Set<string>();
  for (const decision of decisions) {
    const item = byKey.get(key(decision));
    if (!item) throw new ConflictError('The open work changed since your review. Reload and review it again.', 'PROMOTION_WORK_CHANGED');
    if (seen.has(key(decision))) throw new ValidationError('Choose one action per request');
    seen.add(key(decision));
    if (item.rowVersion !== decision.expectedRowVersion) throw new ConflictError(`${item.ticketNumber ?? 'A request'} changed since your review. Reload and review it again.`, 'PROMOTION_WORK_CHANGED');
    if (decision.action === 'KEEP' && !item.keepAllowed) throw new ValidationError(`${item.ticketNumber ?? 'This request'} can’t stay with the new role. ${item.note}`);
    if (decision.action === 'REASSIGN') {
      if (!item.reassignable) throw new ValidationError(`${item.ticketNumber ?? 'This request'} can’t be reassigned now. ${item.note}`);
      if (!decision.replacementId || decision.replacementId === subjectId) throw new ValidationError(`Choose who takes over ${item.ticketNumber ?? 'this request'}`);
    }
  }
  const missing = planned.filter(item => !seen.has(key(item)));
  if (missing.length) throw new ConflictError('The open work changed since your review. Reload and review it again.', 'PROMOTION_WORK_CHANGED');
}
