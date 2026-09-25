'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { TicketRecord } from '@/lib/contracts';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { Card, ErrorBanner } from '@/components/ui';

const LIMIT = 20;

export default function ProjectRequestsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient.listTickets(projectId, LIMIT, offset)
      .then((page) => {
        if (!active) return;
        setTickets(page.data.filter((ticket) => ticket.status !== 'DRAFT'));
        setTotal(page.total);
      })
      .catch((err: unknown) => {
        if (active) setError(getErrorMessage(err, 'Unable to load project requests.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [projectId, offset]);

  return (
    <Card
      title="All Requests"
      description="Read-only project request list, scoped by your assigned role."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <p className="muted">Loading project requests...</p> : null}
        {!loading ? <TicketList projectId={projectId} tickets={tickets} /> : null}
        <PaginationControls
          offset={offset}
          limit={LIMIT}
          total={total}
          onChange={setOffset}
        />
      </div>
    </Card>
  );
}
