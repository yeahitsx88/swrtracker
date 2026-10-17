/**
 * ApproveTicket — SUBMITTED → APPROVED.
 * Survey Manager, responsible Superintendent or covered-team Party Chief.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';
import { enqueueRequesterNotification } from './amelia-notifications';
import { requireSurveyReviewAuthority } from '@/lib/survey-review-authority';
import {assertProposalDecision,resolveRejectionProposal} from './rejection-proposal';

export async function approveTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  const approved = await performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'PARTY_CHIEF'],
    to:             'APPROVED',
    patch:          { approvedAt: new Date() },
    eventType:      'ticket.approved',
    visibility:     params.visibility,
    authorizeTicket: async ticket => {
      const authority=await requireSurveyReviewAuthority(db,ticket,params);
      await assertProposalDecision(db,params);
      return authority;
    },
  });
  await resolveRejectionProposal(db,params,'DECLINED');
  await enqueueRequesterNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    requesterId: approved.requesterId,
    eventType: 'APPROVED',
    idempotencyKey: `${params.ticketId}:approved:${approved.returnCycle ?? 0}`,
  });
  return approved;
}
