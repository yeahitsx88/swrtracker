'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const areaNames = useAreaNames(projectId);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const page = await apiClient.listTickets(projectId, LIMIT, offset, { queue: 'all' });
      setTickets(page.data);
      setTotal(page.total);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load requester tickets.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [projectId, offset]);

  return (
    <Card
      title="Requests"
      description="Your SWRs and any additional company SWRs granted to your account."
      actions={<Link className="button" href={`/projects/${projectId}/request/new`}><Icon name="plus" />New request</Link>}
    >
      <div className="stack">
        <ScopedKpiEntry projectId={projectId} audience="requester" />
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <p className="muted" role="status">Loading requests…</p> : null}
        {!loading ? (
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
