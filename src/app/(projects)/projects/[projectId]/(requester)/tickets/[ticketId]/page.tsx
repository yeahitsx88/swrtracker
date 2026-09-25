'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { AttachmentRecord, TicketCapabilities, TicketRecord } from '@/lib/contracts';
import { AttachmentList, AttachmentUploader, TicketDetails, TicketHistory } from '@/components/tickets';
import { Button, Card, ErrorBanner, Input, SuccessBanner, Textarea } from '@/components/ui';
import { Field } from '@/components/forms';

const NO_CAPABILITIES: TicketCapabilities = {
  canEditRequesterFields: false,
  canSubmit: false,
  canRequesterCancel: false,
  canCreateFollowUp: false,
  canUploadRequestInstruction: false,
  canUploadFieldSupport: false,
};

export default function TicketDetailPage() {
  const params = useParams<{ projectId: string; ticketId: string }>();
  const projectId = params.projectId;
  const ticketId = params.ticketId;
  const router = useRouter();

  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [capabilities, setCapabilities] = useState<TicketCapabilities>(NO_CAPABILITIES);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [editCraft, setEditCraft] = useState('');
  const [editFieldContact, setEditFieldContact] = useState('');
  const [editFieldChannel, setEditFieldChannel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRequestedDate, setEditRequestedDate] = useState('');
  const [urgentReason, setUrgentReason] = useState('');

  const canUpload = capabilities.canUploadRequestInstruction || capabilities.canUploadFieldSupport;

  async function loadAll() {
    setLoading(true);
    setError(null);
    setTicket(null);
    setCapabilities(NO_CAPABILITIES);
    try {
      const [ticketResponse, attachmentsResponse] = await Promise.all([
        apiClient.getTicket(ticketId),
        apiClient.listAttachments(ticketId),
      ]);
      setTicket(ticketResponse.ticket);
      setCapabilities(ticketResponse.capabilities ?? NO_CAPABILITIES);
      setEditCraft(ticketResponse.ticket.craft);
      setEditFieldContact(ticketResponse.ticket.fieldContact ?? '');
      setEditFieldChannel(ticketResponse.ticket.fieldChannel ?? '');
      setEditDescription(ticketResponse.ticket.description);
      setEditRequestedDate(ticketResponse.ticket.requestedDate.slice(0, 10));
      setAttachments(attachmentsResponse.attachments);
      setHistoryRevision((revision) => revision + 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load ticket details.'));
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
    setSubmittingDraft(true);
    try {
      await apiClient.submitTicket(ticketId, undefined, urgentReason.trim() || undefined);
      await loadAll();
      setSuccess('Draft submitted successfully.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to submit draft.'));
    } finally {
      setSubmittingDraft(false);
    }
  }

  async function saveCorrection() {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const response = await apiClient.updateRequesterTicket(ticketId, {
        craft: editCraft, fieldContact: editFieldContact, fieldChannel: editFieldChannel,
        description: editDescription, requestedDate: new Date(editRequestedDate).toISOString(),
      });
      setTicket(response.ticket);
      setHistoryRevision((revision) => revision + 1);
      setSuccess('Requester fields saved. Review attachments, then submit for fresh approval.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save requester changes.'));
    } finally {
      setSaving(false);
    }
  }

  async function createFollowUp() {
    setCreatingFollowUp(true); setError(null); setSuccess(null);
    try {
      const response = await apiClient.createFollowUpTicket(ticketId);
      router.push(`/projects/${projectId}/tickets/${response.ticket.id}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create a follow-up SWR.'));
      setCreatingFollowUp(false);
    }
  }

  async function cancelRequest() {
    if (!window.confirm('Cancel this SWR? This action is permanent.')) return;
    setCanceling(true); setError(null); setSuccess(null);
    try {
      await apiClient.requesterCancel(ticketId);
      await loadAll();
      setSuccess('SWR canceled.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to cancel this SWR.'));
    } finally {
      setCanceling(false);
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
            <Button variant="secondary" onClick={() => void loadAll()}>
              Refresh
            </Button>
          </div>
          {capabilities.canSubmit ? (
            <Button disabled={submittingDraft} onClick={() => void submitDraft()}>
              {submittingDraft ? 'Submitting...' : ticket?.status === 'DRAFT' ? 'Submit Draft' : 'Resubmit for Approval'}
            </Button>
          ) : null}
          {capabilities.canRequesterCancel ? (
            <Button variant="secondary" disabled={canceling} onClick={() => void cancelRequest()}>
              {canceling ? 'Canceling…' : 'Cancel SWR'}
            </Button>
          ) : null}
          {capabilities.canCreateFollowUp ? (
            <Button disabled={creatingFollowUp} onClick={() => void createFollowUp()}>
              {creatingFollowUp ? 'Creating Follow-Up…' : 'Create Follow-Up SWR'}
            </Button>
          ) : null}
        </div>
      </Card>

      {capabilities.canEditRequesterFields ? (
        <Card title="Requester Changes" description="Only the original requester can edit a draft or returned SWR.">
          <div className="stack">
            <Field label="Craft / Discipline"><Input value={editCraft} onChange={(event) => setEditCraft(event.target.value)} /></Field>
            <Field label="Field Contact"><Input value={editFieldContact} onChange={(event) => setEditFieldContact(event.target.value)} /></Field>
            <Field label="Phone / Radio Channel"><Input value={editFieldChannel} onChange={(event) => setEditFieldChannel(event.target.value)} /></Field>
            <Field label="Need-By Date"><Input type="date" value={editRequestedDate} onChange={(event) => setEditRequestedDate(event.target.value)} /></Field>
            <Field label="Description"><Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></Field>
            <Field label="Urgent Reason (required only when inside project lead time)"><Textarea value={urgentReason} onChange={(event) => setUrgentReason(event.target.value)} /></Field>
            <Button disabled={saving} onClick={() => void saveCorrection()}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </Card>
      ) : null}

      <Card title="Attachments" description="Uploads are disabled in terminal ticket states on this UI.">
        <div className="stack">
          {ticket ? (
            <p className="muted">Current Status: {ticket.status}</p>
          ) : null}
          {canUpload ? (
            <AttachmentUploader
              instructionMode={capabilities.canUploadRequestInstruction}
              onUpload={async (payload) => {
                setError(null);
                setSuccess(null);
                try {
                  await apiClient.uploadAttachment(ticketId, payload);
                  const refreshed = await apiClient.listAttachments(ticketId);
                  setAttachments(refreshed.attachments);
                  setHistoryRevision((revision) => revision + 1);
                  setSuccess('Attachment uploaded.');
                } catch (err) {
                  setError(getErrorMessage(err, 'Unable to upload attachment.'));
                }
              }}
            />
          ) : (
            <p className="muted">You can view and download attachments on this SWR. No upload action is available in your current role or state.</p>
          )}
          <AttachmentList attachments={attachments} />
        </div>
      </Card>

      {ticket ? (
        <Card title="SWR History" description="Chronological record of review, assignment, files, messages, and field progress.">
          <TicketHistory ticketId={ticket.id} refreshRevision={historyRevision} />
        </Card>
      ) : null}
    </div>
  );
}
