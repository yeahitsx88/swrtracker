'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { homeRequestFilters } from '@/lib/home-request-filters';
import { operationsStatusLabel } from '@/lib/operations-view';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { useTicketPage } from '@/lib/use-ticket-page';
import { PaginationControls } from '@/components/forms';
import { CrewWorkActions, TicketList } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { ScopedKpiEntry } from '@/components/ui/scoped-kpi-entry';
import { useAreaNames } from '@/lib/use-area-names';
import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {CrewAssignment} from '@/components/ui/crew-assignment';

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
  const [error, setError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const filters=role==='PARTY_CHIEF'?{...parsed.filters,queue:'open' as const,crewId:actorId}:role==='INSTRUMENT_MAN'?{...parsed.filters,instrumentManId:actorId}:parsed.filters;
  const work = useTicketPage(projectId, page, size, filters, !parsed.error&&!!actorId, revision);
  const total = work.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { if (work.data && page > pages) setPage(pages); }, [work.data, page, pages]);
  useEffect(() => { setPage(1); }, [projectId, query]);

  async function runAction(ticketId: string, action: () => Promise<void>) {
    setError(null);
    setBusyTicketId(ticketId);
    try {
      await action();
      setRevision((current) => current + 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to complete workflow action.'));
    } finally {
      setBusyTicketId(null);
    }
  }

  return (
    <Card
      title="Crew Work"
      description="Requests assigned to your crew. Open a request for full details, files and history."
      actions={<>
        <label className="toolbar-select"><span>Rows</span><select className="select" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        <Button variant="secondary" onClick={() => setRevision((current) => current + 1)} disabled={work.loading}>
          <Icon name="refresh" />{work.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </>}
    >
      <div className="stack">
        {query && <div className="row"><p className="muted">Filtered requests{parsed.filters.status ? ` · ${operationsStatusLabel(parsed.filters.status)}` : ''}</p><Link className="app-link" href={`/projects/${projectId}/crew/work`}>Clear filters</Link></div>}
        {parsed.error && <ErrorBanner message={parsed.error} />}
        <ScopedKpiEntry projectId={projectId} audience="field" />
        {error ? <ErrorBanner message={error} /> : null}
        {work.error ? <ErrorBanner message={work.error} /> : null}
        {work.loading ? <p className="muted" role="status">Loading crew work queue…</p> : null}
        {!work.loading && !work.error && !parsed.error ? (
          <TicketList
            projectId={projectId}
            tickets={work.data?.data ?? []}
            areaNames={areaNames}
            emptyTitle="No actionable crew work"
            emptyMessage="Work assigned to you will appear here, including requests awaiting your crew selection."
            renderActions={(ticket) => role==='PARTY_CHIEF'&&ticket.assignedPartyChiefId===actorId?(<div className="row">
              {['APPROVED','ASSIGNED','IN_PROGRESS','DELAYED'].includes(ticket.status)?<CrewAssignment ticketId={ticket.id} fixedChiefId={actorId} onSaved={()=>setRevision(n=>n+1)}/>:null}
              {ticket.status==='DELAYED'?<Button disabled={busyTicketId===ticket.id} onClick={()=>void runAction(ticket.id,()=>apiClient.restartDelayedTicket(ticket.id).then(()=>undefined))}>Restart delayed work</Button>:null}
              {['IN_PROGRESS','DELAYED'].includes(ticket.status)?<Button variant="danger" disabled={busyTicketId===ticket.id} onClick={()=>{const reason=window.prompt('Why should this request be stopped?');if(reason?.trim())void runAction(ticket.id,()=>apiClient.surveyCancel(ticket.id,reason).then(()=>undefined));}}>Flag Stop Work</Button>:null}
              </div>):role==='INSTRUMENT_MAN'&&ticket.assignedInstrumentManId===actorId?(
              <CrewWorkActions
                ticket={ticket}
                busy={busyTicketId === ticket.id}
                onStart={(id) => runAction(id, () => apiClient.startTicket(id).then(() => undefined))}
                onSubmitComplete={(id) => runAction(id, () => apiClient.completeTicket(id).then(() => undefined))}
                onDelay={(id, reason) => runAction(id, () => apiClient.delayTicket(id, reason).then(() => undefined))}
                onReportInability={(id, reason) => runAction(id, () => apiClient.reportFieldInability(id, reason).then(() => undefined))}
                onFlagStopWork={(id, reason) => runAction(id, () => apiClient.surveyCancel(id, reason).then(() => undefined))}
              />
            ):<Link className="app-link" href={`/projects/${projectId}/tickets/${ticket.id}`}>Open request</Link>}
          />
        ) : null}
        {!work.loading && total > size ? <PaginationControls offset={(page - 1) * size} limit={size} total={total} onChange={(offset) => setPage(Math.floor(offset / size) + 1)} /> : null}
      </div>
    </Card>
  );
}
