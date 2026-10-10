'use client';
import { useState } from 'react';
import { AdministrationDialog } from '@/components/ui/administration-dialog';
import { RequestDetails } from './request-details';

/**
 * Opens Request Details over the current list, so its page, filters, sorting and scroll
 * position stay as they were. `onChanged` lets the list refresh after an action.
 */
export function useRequestDetailsDialog(projectId: string, onChanged?: () => void) {
  const [ticketId, setTicketId] = useState<string | null>(null);
  return {
    open: (id: string) => setTicketId(id),
    dialog: ticketId ? <AdministrationDialog title="Request Details" locked={false} className="request-details-dialog" onDismiss={() => setTicketId(null)}>
      <RequestDetails key={ticketId} projectId={projectId} ticketId={ticketId} presentation="modal" onChanged={onChanged} />
    </AdministrationDialog> : null,
  };
}
