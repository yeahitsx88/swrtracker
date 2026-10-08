'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTicketPage } from '@/lib/use-ticket-page';
import { PaginationControls } from '@/components/forms';
import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {useTicketWorkflowReview} from '@/components/tickets/ticket-workflow-review';
import { ApprovalActions, TicketList } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { useAreaNames } from '@/lib/use-area-names';

export default function CrewApprovalsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const areaNames = useAreaNames(projectId);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [revision, setRevision] = useState(0);
  const workspace=useProjectWorkspace();
  const workflow = useTicketWorkflowReview(() => setRevision(current => current + 1));
  const actionDisabled=workflow.active||workspace?.project.status!=='ACTIVE';
  const approvals = useTicketPage(projectId, page, size, { queue: 'pcApprovals' }, true, revision);
  const total = approvals.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { if (approvals.data && page > pages) setPage(pages); }, [approvals.data, page, pages]);
  useEffect(() => { setPage(1); }, [projectId]);


  return (
    <Card
      title="Field Report Review"
      description="Review inability reports when you are the recorded reviewer. Other reports you can see remain read-only. Retained legacy field reports remain available; new successful completions need no approval."
      actions={<>
        <label className="toolbar-select"><span>Rows</span><select className="select" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        <Button variant="secondary" onClick={() => setRevision((current) => current + 1)} disabled={approvals.loading||workflow.active}>
          <Icon name="refresh" />{approvals.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </>}
    >
      <div className="stack">
        {workflow.dialog}
        {approvals.error ? <ErrorBanner message={approvals.error} /> : null}
        {approvals.loading ? <p className="muted" role="status">Loading approval queue…</p> : null}
        {!approvals.loading && !approvals.error ? (
          <TicketList
            projectId={projectId}
            tickets={approvals.data?.data ?? []}
            areaNames={areaNames}
            emptyTitle="Nothing waiting for you"
            emptyMessage="Field reports that need your decision will appear here."
            renderActions={(ticket) => ticket.status === 'PENDING_FIELD_VALIDATION' ? (
              workspace?.actorId === ticket.fieldValidationReviewerId &&
              ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(workspace.capabilities.operationalRole ?? '') ? (
              <>
                <Button disabled={actionDisabled} onClick={() => workflow.open(ticket,'validate-inability')}>Validate and Return</Button>
                <Button variant="secondary" disabled={actionDisabled} onClick={() => workflow.open(ticket,'reject-inability')}>Reject Report and Resume</Button>
              </>
              ) : <span className="muted">Review is reserved for the recorded reviewer.</span>
            ) : (
              workspace && (['SURVEY_MANAGER','SURVEY_SUPERINTENDENT'].includes(workspace.capabilities.operationalRole ?? '') ||
              workspace.capabilities.operationalRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === workspace.actorId) ? (
              <ApprovalActions
                ticket={ticket}
                busy={actionDisabled}
                onReview={action => workflow.open(ticket,action)}
              />
              ) : <span className="muted">Legacy review requires the assigned Party Chief or authorized survey leadership.</span>
            )}
          />
        ) : null}
        {!approvals.loading && total > size ? <PaginationControls offset={(page - 1) * size} limit={size} total={total} onChange={(offset) => setPage(Math.floor(offset / size) + 1)} /> : null}
      </div>
    </Card>
  );
}
