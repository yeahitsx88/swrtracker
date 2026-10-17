'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { homeRequestFilters } from '@/lib/home-request-filters';
import { RequestFilterBar } from '@/components/tickets/request-filter-bar';
import type { TicketStatus } from '@/lib/contracts';

const CREW_STATUSES: TicketStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'DELAYED'];
import { useTicketPage } from '@/lib/use-ticket-page';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { crewActions } from '@/components/tickets/request-operations';
import { useRequestDetailsDialog } from '@/components/tickets/request-details-dialog';
import { Button, Card, ErrorBanner } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { ScopedKpiEntry } from '@/components/ui/scoped-kpi-entry';
import { useAreaNames } from '@/lib/use-area-names';
import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {useTicketWorkflowReview} from '@/components/tickets/ticket-workflow-review';

export default function CrewWorkPage() {
  return <Suspense fallback={<p role="status">Loading crew work…</p>}><CrewWorkContent /></Suspense>;
}
function CrewWorkContent() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const workspace=useProjectWorkspace(),role=workspace?.capabilities.operationalRole,actorId=workspace?.actorId;
  const query = useSearchParams().toString();
  const parsed = homeRequestFilters(query, 'fieldWork');
  const areaNames = useAreaNames(projectId);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [revision, setRevision] = useState(0);
  const workflow = useTicketWorkflowReview(() => setRevision(current => current + 1));
  const details = useRequestDetailsDialog(projectId, () => setRevision(current => current + 1));
  const filters=role==='PARTY_CHIEF'?{...parsed.filters,queue:'open' as const,crewId:actorId}:role==='INSTRUMENT_MAN'?{...parsed.filters,instrumentManId:actorId}:parsed.filters;
  const work = useTicketPage(projectId, page, size, filters, !parsed.error&&!!actorId, revision);
  const total = work.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { if (work.data && page > pages) setPage(pages); }, [work.data, page, pages]);
  useEffect(() => { setPage(1); }, [projectId, query]);


  return (
    <Card
      title="Crew Work"
      description="Requests assigned to your crew. Open a request for full details, files and history."
      actions={<>
        <label className="toolbar-select"><span>Rows</span><select className="select" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        <Button variant="secondary" onClick={() => setRevision((current) => current + 1)} disabled={work.loading||workflow.active}>
          <Icon name="refresh" />{work.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </>}
    >
      <div className="stack">
        <RequestFilterBar label="Filter crew work" statuses={CREW_STATUSES} />
        {parsed.error && <ErrorBanner message={parsed.error} />}
        <ScopedKpiEntry projectId={projectId} audience="field" />
        {workflow.dialog}
        {work.data?.data.some(ticket=>ticket.preparationCleanupAllowed)?<p role="status">Preparation cancellation: only finishing or cancelling the reviewed work is available.</p>:null}
        {work.error ? <ErrorBanner message={work.error} /> : null}
        {work.loading ? <p className="muted" role="status">Loading crew work queue…</p> : null}
        {!work.loading && !work.error && !parsed.error ? (
          <TicketList compactTools onOpen={details.open}
            projectId={projectId}
            tickets={work.data?.data ?? []}
            areaNames={areaNames}
            emptyTitle="No actionable crew work"
            emptyMessage="Work assigned to you will appear here, including requests awaiting your crew selection."
            renderActions={(ticket) => crewActions({ticket,role,actorId,projectStatus:workspace?.project.status,workflow,onSaved:()=>setRevision(n=>n+1)})??<button type="button" className="app-link" onClick={()=>details.open(ticket.id)}>Open request</button>}
          />
        ) : null}
        {!work.loading && total > size ? <PaginationControls offset={(page - 1) * size} limit={size} total={total} onChange={(offset) => setPage(Math.floor(offset / size) + 1)} /> : null}
        {details.dialog}
      </div>
    </Card>
  );
}
