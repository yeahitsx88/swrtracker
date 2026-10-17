'use client';
/**
 * Request operations shared by the dedicated work screens (Crew Work, Field Report Review,
 * Survey Operations) and Request Details, so an action appears in the same circumstances
 * wherever a request is viewed. Eligibility lives in request-operation-rules; every operation
 * is the existing endpoint with its own server authorization.
 */
import type { ReactNode } from 'react';
import type { TicketRecord } from '@/lib/contracts';
import type { TicketWorkflowAction } from '@/lib/ticket-workflow-review';
import type { CommandOwner } from '@/lib/frozen-command';
import { Button } from '@/components/ui';
import { CrewAssignment } from '@/components/ui/crew-assignment';
import { TeamDelegation } from '@/components/ui/team-delegation';
import { ApprovalActions } from './approval-actions';
import { CrewWorkActions } from './crew-work-actions';
import { crewPart, fieldReportPart } from '@/lib/request-operation-rules';

export { needsAssignment, OPEN_STATUSES } from '@/lib/request-operation-rules';

export interface RequestWorkflow { active: boolean; owner: CommandOwner; open: (ticket: TicketRecord, action: TicketWorkflowAction) => void }
interface Context { ticket: TicketRecord; role: string | null | undefined; actorId: string | undefined; projectStatus: string | undefined; workflow: RequestWorkflow }

/** Field actions stay available during an open preparation cancellation only for its witnessed work. */
const fieldBlocked = ({ ticket, projectStatus, workflow }: Context) =>
  workflow.active || (projectStatus !== 'ACTIVE' && !(projectStatus === 'SETUP' && ticket.preparationCleanupAllowed));

/** Crew Work: the assigned Party Chief arranges the crew; the assigned Instrument Man records field progress. */
export function crewActions(context: Context & { onSaved: () => void }): ReactNode | null {
  const { ticket, role, actorId, projectStatus, workflow, onSaved } = context;
  const disabled = workflow.active || projectStatus !== 'ACTIVE';
  const part = crewPart(ticket, role, actorId);
  if (part === 'chief' && actorId) {
    return <div className="row">
      {['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED'].includes(ticket.status) ? <CrewAssignment disabled={disabled} ticket={ticket} owner={workflow.owner} fixedChiefId={actorId} onSaved={onSaved} /> : null}
      {ticket.status === 'DELAYED' ? <Button disabled={disabled} onClick={() => workflow.open(ticket, 'restart')}>Restart Delayed Work</Button> : null}
      {['IN_PROGRESS', 'DELAYED'].includes(ticket.status) ? <Button variant="danger" disabled={fieldBlocked(context) || !!ticket.surveyCancelRequestedAt} onClick={() => workflow.open(ticket, 'stop')}>Flag Stop Work</Button> : null}
      {ticket.surveyCancelRequestedAt ? <p role="status">Stop-work review is pending.</p> : null}
    </div>;
  }
  if (part === 'instrument') {
    return <CrewWorkActions ticket={ticket} busy={fieldBlocked(context)} completionOnly={projectStatus !== 'ACTIVE'} onReview={action => workflow.open(ticket, action)} />;
  }
  return null;
}

/** Field Report Review: inability reports go to the recorded reviewer; legacy reports to the Chief or survey leadership. */
export function fieldReportActions(context: Context): ReactNode | null {
  const { ticket, role, actorId, projectStatus, workflow } = context;
  const part = fieldReportPart(ticket, role, actorId);
  if (part === 'validation-reserved') return <span className="muted">Review is reserved for the recorded reviewer.</span>;
  if (part === 'validation') {
    return <>
      <Button disabled={fieldBlocked(context)} onClick={() => workflow.open(ticket, 'validate-inability')}>Validate and Return</Button>
      <Button variant="secondary" disabled={workflow.active || projectStatus !== 'ACTIVE'} onClick={() => workflow.open(ticket, 'reject-inability')}>Reject Report and Resume</Button>
    </>;
  }
  if (part === 'legacy') {
    return <ApprovalActions ticket={ticket} busy={fieldBlocked(context)} completionOnly={projectStatus !== 'ACTIVE'} onReview={action => workflow.open(ticket, action)} />;
  }
  return part === 'legacy-reserved' ? <span className="muted">Legacy review requires the assigned Party Chief or authorized survey leadership.</span> : null;
}

/** Survey Operations → Need Assignment: delegate to a team or choose the crew. */
export function SurveyAssignmentActions({ ticket, owner, disabled, readOnly, onSaved }: { ticket: TicketRecord; owner: CommandOwner; disabled: boolean; readOnly: boolean; onSaved: () => void }) {
  return <>
    <TeamDelegation ticket={ticket} canDelegate={!readOnly} disabled={disabled} owner={owner} onDelegated={onSaved} />
    <div className="row"><CrewAssignment ticket={ticket} owner={owner} disabled={disabled} restrictToSelectedTeam={readOnly} allowChiefOnly={ticket.status === 'APPROVED'} onSaved={onSaved} /></div>
  </>;
}

/** Survey Operations → Open Requests oversight for the Survey Manager. */
export function ManagerOversightActions({ ticket, disabled, workflow, includeApprove = true }: { ticket: TicketRecord; disabled: boolean; workflow: RequestWorkflow; includeApprove?: boolean }) {
  return <div className="row">
    {includeApprove && ticket.status === 'SUBMITTED' ? <Button disabled={disabled} onClick={() => workflow.open(ticket, 'approve')}>Approve Request</Button> : null}
    {['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED'].includes(ticket.status) ? <Button variant="secondary" disabled={disabled} onClick={() => workflow.open(ticket, 'return')}>Return for Correction</Button> : null}
    <Button variant="secondary" disabled={disabled} onClick={() => workflow.open(ticket, ticket.priority === 'HIGH' ? 'normal' : 'high')}>Set {ticket.priority === 'HIGH' ? 'Normal' : 'High'} Priority</Button>
    <Button variant="secondary" disabled={disabled} onClick={() => workflow.open(ticket, 'need-by')}>Revise Need-By Date</Button>
    <Button variant="danger" disabled={disabled} onClick={() => workflow.open(ticket, 'cancel')}>Cancel Request</Button>
  </div>;
}
