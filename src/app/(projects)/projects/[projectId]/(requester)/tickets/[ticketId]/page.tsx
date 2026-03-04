'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError } from '@/lib/errors';
import type { AttachmentRecord, TicketRecord } from '@/lib/contracts';
import { AttachmentList, AttachmentUploader, TicketDetails } from '@/components/tickets';
import { Button, Card, ErrorBanner, SuccessBanner } from '@/components/ui';

const TERMINAL_UPLOAD_BLOCK_STATUSES = new Set([
  'COMPLETED',
  'REQUESTER_CANCELED',
  'FIELD_CANCELED',
  'SURVEY_CANCELED',
]);

export default function TicketDetailPage() {
  const params = useParams<{ projectId: string; ticketId: string }>();
  const projectId = params.projectId;
  const ticketId = params.ticketId;

  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const uploadsDisabled = !ticket || TERMINAL_UPLOAD_BLOCK_STATUSES.has(ticket.status);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [ticketResponse, attachmentsResponse] = await Promise.all([
        apiClient.getTicket(ticketId),
        apiClient.listAttachments(ticketId),
      ]);
      setTicket(ticketResponse.ticket);
      setAttachments(attachmentsResponse.attachments);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to load ticket details.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [ticketId]);

  async function submitDraft() {
    setError(null);
    setSuccess(null);
    try {
      const response = await apiClient.submitTicket(ticketId);
      setTicket(response.ticket);
      setSuccess('Draft submitted successfully.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to submit draft.');
      }
    }
  }

  return (
    <div className="stack">
      <Card title="Ticket Detail" description="Requester detail surface with active-ticket attachment controls.">
        <div className="stack">
          {error ? <ErrorBanner message={error} /> : null}
          {success ? <SuccessBanner message={success} /> : null}
          {loading ? <p className="muted">Loading ticket details...</p> : null}
          {ticket ? <TicketDetails ticket={ticket} /> : null}
          <div className="row">
            <Link href={`/projects/${projectId}/my-requests`} className="app-link">Back to My Requests</Link>
            <Link href={`/projects/${projectId}/drafts`} className="app-link">Back to Drafts</Link>
          </div>
          {ticket?.status === 'DRAFT' ? (
            <Button onClick={() => void submitDraft()}>
              Submit Draft
            </Button>
          ) : null}
        </div>
      </Card>

      <Card title="Attachments" description="Uploads are disabled in terminal ticket states on this UI.">
        <div className="stack">
          {ticket ? (
            <p className="muted">Current Status: {ticket.status}</p>
          ) : null}
          <AttachmentUploader
            disabled={uploadsDisabled}
            onUpload={async (payload) => {
              setError(null);
              setSuccess(null);
              try {
                await apiClient.uploadAttachment(ticketId, payload);
                const refreshed = await apiClient.listAttachments(ticketId);
                setAttachments(refreshed.attachments);
                setSuccess('Attachment uploaded.');
              } catch (err) {
                if (err instanceof ApiClientError) {
                  setError(err.message);
                } else {
                  setError('Unable to upload attachment.');
                }
              }
            }}
          />
          <AttachmentList attachments={attachments} />
        </div>
      </Card>
    </div>
  );
}
