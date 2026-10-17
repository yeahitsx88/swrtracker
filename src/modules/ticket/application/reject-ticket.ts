/**
 * RejectTicket — SUBMITTED → REJECTED.
 * Requires a written rejection reason before the transition completes.
 * Permitted actor: Survey Manager or responsible Survey Superintendent.
 */
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';
import { requireSurveyReviewAuthority } from '@/lib/survey-review-authority';
import {resolveRejectionProposal} from './rejection-proposal';

export async function rejectTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:        UUID;
    ticketId:        UUID;
    actorId:         UUID;
    actorRole:       ProjectRole;
    rejectionReason: string;
    visibility?:     VisibilityScope;
  },
): Promise<Ticket> {
  if (!params.rejectionReason.trim()) {
    throw new ValidationError('rejectionReason is required when rejecting a ticket');
  }

  const rejected=await performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT'],
    to:             'REJECTED',
    patch:          { rejectionReason: params.rejectionReason },
    eventType:      'ticket.rejected',
    eventPayload:   { rejectionReason: params.rejectionReason },
    visibility:     params.visibility,
    authorizeTicket: ticket=>requireSurveyReviewAuthority(db,ticket,params),
  });
  await resolveRejectionProposal(db,params,'CONFIRMED');
  return rejected;
}
