'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError } from '@/lib/errors';
import type { TicketRecord } from '@/lib/contracts';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { Card, ErrorBanner } from '@/components/ui';

const LIMIT = 20;

export default function DraftsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadDrafts() {
      setLoading(true);
      setError(null);
      try {
        const page = await apiClient.listTickets(projectId, LIMIT, offset);
        if (!active) return;
        setTickets(page.data);
        setTotal(page.total);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load draft tickets.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDrafts();
    return () => {
      active = false;
    };
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
