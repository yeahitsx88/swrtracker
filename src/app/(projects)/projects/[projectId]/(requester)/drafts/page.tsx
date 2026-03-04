'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { TicketRecord } from '@/lib/contracts';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';

const LIMIT = 20;

export default function DraftsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDrafts() {
    setLoading(true);
    setError(null);
    try {
      const page = await apiClient.listTickets(projectId, LIMIT, offset);
      setTickets(page.data);
      setTotal(page.total);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load draft tickets.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDrafts();
  }, [projectId, offset]);

  const draftTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'DRAFT'),
    [tickets],
  );

  return (
    <Card title="Drafts" description="Requester draft surface. Backend remains source-of-truth for draft lifecycle.">
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <p className="muted">Loading drafts...</p> : null}
        {!loading ? <TicketList projectId={projectId} tickets={draftTickets} /> : null}
        {error ? (
          <Button variant="secondary" onClick={() => void loadDrafts()}>
            Retry
          </Button>
        ) : null}
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
