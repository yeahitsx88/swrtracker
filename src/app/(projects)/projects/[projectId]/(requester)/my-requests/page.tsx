'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { homeRequestFilters } from '@/lib/home-request-filters';
import { useProjectWorkspace } from '@/components/ui/project-shell-header';
import { operationsStatusLabel } from '@/lib/operations-view';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { TicketRecord } from '@/lib/contracts';
import { useAreaNames } from '@/lib/use-area-names';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { Card, ErrorBanner } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { ScopedKpiEntry } from '@/components/ui/scoped-kpi-entry';

const LIMIT = 20;
export default function MyRequestsPage() {
  return <Suspense fallback={<p role="status">Loading requests…</p>}><MyRequestsContent /></Suspense>;
}
function MyRequestsContent() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const query = useSearchParams().toString();
  const parsed = homeRequestFilters(query);
  const workspace = useProjectWorkspace();
  const areaNames = useAreaNames(projectId);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setOffset(0); }, [query]);
  useEffect(() => {
    let active = true;
    if(parsed.error) { setError(parsed.error); setLoading(false); return; }
    setLoading(true);
    setError(null);
    apiClient.listTickets(projectId, LIMIT, offset, parsed.filters).then(page => {
      if(!active) return;
      setTickets(page.data);
      setTotal(page.total);
    }).catch(err => { if(active)setError(getErrorMessage(err, 'Unable to load requester tickets.')); })
      .finally(() => { if(active)setLoading(false); });
    return () => { active=false; };
  }, [projectId, offset, query]);

  return (
    <Card
      title="Requests"
      description="Your SWRs and any additional company SWRs granted to your account."
      actions={workspace?.project.status === 'ACTIVE' ? <Link className="button" href={`/projects/${projectId}/request/new`}><Icon name="plus" />New request</Link> : undefined}
    >
      <div className="stack">
        {query && <div className="row"><p className="muted">Filtered requests{parsed.filters.status ? ` · ${operationsStatusLabel(parsed.filters.status)}` : ''}</p><Link className="app-link" href={`/projects/${projectId}/my-requests`}>Clear filters</Link></div>}
        <ScopedKpiEntry projectId={projectId} audience="requester" />
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <p className="muted" role="status">Loading requests…</p> : null}
        {!loading && !error ? (
          <TicketList
            projectId={projectId}
            tickets={tickets}
            areaNames={areaNames}
            emptyTitle="No requests yet"
            emptyMessage="Start a new request; it will appear here once you submit it."
          />
        ) : null}
        {total > LIMIT ? (
          <PaginationControls
            offset={offset}
            limit={LIMIT}
            total={total}
            onChange={setOffset}
          />
        ) : null}
      </div>
    </Card>
  );
}
