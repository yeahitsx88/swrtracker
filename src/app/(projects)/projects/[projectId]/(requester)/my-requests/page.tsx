'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { TicketRecord } from '@/lib/contracts';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { Card, ErrorBanner } from '@/components/ui';

const LIMIT = 20;
export default function MyRequestsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const page = await apiClient.listTickets(projectId, LIMIT, offset);
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

  const submittedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'DRAFT'),
    [tickets],
  );

  return (
    <Card
      title="Requests"
      description="Your SWRs and any additional company SWRs granted to your account."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <p className="muted">Loading tickets...</p> : null}
        {!loading ? <TicketList projectId={projectId} tickets={submittedTickets} /> : null}
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
