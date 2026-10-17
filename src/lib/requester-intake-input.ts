import { ValidationError } from '@/shared/errors';
import { requireResourceUuid } from './resource-uuid';
import type { UUID } from '@/shared/types';
import type { RequesterTicketChanges } from '@/modules/ticket/application/update-requester-ticket';
import type { TicketType } from '@/modules/ticket/domain/types';

const types: readonly string[] = ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'];

/** A Need-By is a calendar date. Reject rollover dates; normalize legacy ISO inputs to UTC. */
export function parseNeedBy(value: unknown): Date | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    throw new ValidationError('Need-By must be a valid calendar date');
  }
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ||
      (value.length > 10 && Number.isNaN(new Date(value).getTime()))) {
    throw new ValidationError('Need-By must be a valid calendar date');
  }
  return date;
}

export function parseRequesterIntake(body: unknown): { changes: RequesterTicketChanges; expectedVersion?: number } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('An intake object is required');
  const b = body as Record<string, unknown>;
  const changes: RequesterTicketChanges = {};
  if (b.aorNodeId !== undefined) {
    if (b.aorNodeId !== null) {
      if (typeof b.aorNodeId !== 'string') throw new ValidationError('aorNodeId must be an identifier or null');
      requireResourceUuid(b.aorNodeId, 'aorNodeId');
    }
    changes.aorNodeId = b.aorNodeId as UUID | null;
  }
  if (b.ticketType !== undefined) {
    if (b.ticketType !== null && (typeof b.ticketType !== 'string' || !types.includes(b.ticketType))) {
      throw new ValidationError('Request Type is invalid');
    }
    changes.ticketType = b.ticketType as TicketType | null;
  }
  for (const field of ['craft', 'fieldContact', 'fieldChannel', 'description'] as const) {
    if (b[field] !== undefined) {
      if (typeof b[field] !== 'string') throw new ValidationError(`${field} must be text`);
      changes[field] = b[field].trim();
    }
  }
  if (b.requestedDate !== undefined) changes.requestedDate = parseNeedBy(b.requestedDate);
  if (b.expectedVersion !== undefined && (!Number.isSafeInteger(b.expectedVersion) || (b.expectedVersion as number) < 0)) {
    throw new ValidationError('expectedVersion must be a nonnegative integer');
  }
  return { changes, expectedVersion: b.expectedVersion as number | undefined };
}
