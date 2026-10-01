'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { RetryableMutation } from '@/lib/retryable-mutation';
import { useUnsavedProgress } from '@/lib/use-unsaved-progress';
import type { AorNodeRecord, AorLevelRecord, AttachmentRecord, TicketCapabilities, TicketRecord, TicketType, UpdateRequesterTicketRequest } from '@/lib/contracts';
import { AttachmentList, AttachmentUploader, TicketDetails, TicketHistory } from '@/components/tickets';
import { Button, Card, ErrorBanner, Input, Select, SuccessBanner, Textarea } from '@/components/ui';
import { Field } from '@/components/forms';
import { AorNodePicker } from '@/components/aor';
import { TICKET_STATUS_LABELS } from '@/lib/contracts';

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
  const [editArea, setEditArea] = useState('');
  const [editType, setEditType] = useState<TicketType | ''>('');
  const [areaTree, setAreaTree] = useState<{ levels: AorLevelRecord[]; nodes: AorNodeRecord[] } | null>(null);
  const [stale, setStale] = useState(false);
  const busy = useRef(false);
  const saveAttempt = useRef(new RetryableMutation<UpdateRequesterTicketRequest>());
  const submitAttempt = useRef(new RetryableMutation<{ expectedVersion: number; urgentReason: string }>());
  const deleteAttempt = useRef(new RetryableMutation<{ expectedVersion: number }>());
  const [deleting, setDeleting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const uncertain = Boolean(saveAttempt.current.pending || submitAttempt.current.pending || deleteAttempt.current.pending);
  const working = saving || submittingDraft || canceling || creatingFollowUp || deleting || uploadingFile;
  const dirty = Boolean(ticket && (editArea !== (ticket.aorNodeId ?? '') || editType !== (ticket.ticketType ?? '') ||
    editCraft !== ticket.craft || editFieldContact !== (ticket.fieldContact ?? '') || editFieldChannel !== (ticket.fieldChannel ?? '') ||
    editDescription !== ticket.description || editRequestedDate !== (ticket.requestedDate?.slice(0,10) ?? '')));

  const canUpload = capabilities.canUploadRequestInstruction || capabilities.canUploadFieldSupport;
  useUnsavedProgress(dirty || uncertain);

  async function loadAll(discard = false) {
    if (!discard && (busy.current || uncertain)) return;
    if (!discard && dirty && !window.confirm('Discard your unsaved field changes and reload the saved request?')) return;
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
      setEditRequestedDate(ticketResponse.ticket.requestedDate?.slice(0, 10) ?? '');
      setEditArea(ticketResponse.ticket.aorNodeId ?? ''); setEditType(ticketResponse.ticket.ticketType ?? '');
      setStale(false);
      setAttachments(attachmentsResponse.attachments);
      setHistoryRevision((revision) => revision + 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load ticket details.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll(true);
    void apiClient.listAorTree(projectId).then(setAreaTree).catch(err => setError(getErrorMessage(err, 'Unable to load Areas. Retry Refresh.')));
  }, [ticketId]);

  async function submitDraft() {
    if (!ticket || busy.current || dirty || stale || saveAttempt.current.pending || deleteAttempt.current.pending) return;
    busy.current = true;
    setError(null);
    setSuccess(null);
    setSubmittingDraft(true);
    try {
      await submitAttempt.current.run({ expectedVersion:ticket.rowVersion ?? 0, urgentReason:urgentReason.trim() },
        (input, key) => apiClient.submitTicket(ticketId, undefined, input.urgentReason || undefined, input.expectedVersion, key));
      await loadAll(true);
      setSuccess('Request submitted for approval.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to submit draft.'));
      if (err instanceof ApiClientError && err.code === 'WORKFLOW_STALE_STATE') setStale(true);
    } finally {
      busy.current = false; setSubmittingDraft(false);
    }
  }

  async function saveCorrection() {
    if (!ticket || busy.current || stale || submitAttempt.current.pending || deleteAttempt.current.pending) return;
    busy.current = true;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const response = await saveAttempt.current.run({
        aorNodeId: editArea || null, ticketType: editType || null, expectedVersion: ticket.rowVersion ?? 0,
        craft: editCraft, fieldContact: editFieldContact, fieldChannel: editFieldChannel,
        description: editDescription, requestedDate: editRequestedDate || null,
      }, (input, key) => apiClient.updateRequesterTicket(ticketId, input, key));
      setTicket(response.ticket);
      setHistoryRevision((revision) => revision + 1);
      setSuccess('Requester fields saved. Review attachments, then submit for fresh approval.');
      setEditCraft(response.ticket.craft); setEditFieldContact(response.ticket.fieldContact ?? '');
      setEditFieldChannel(response.ticket.fieldChannel ?? ''); setEditDescription(response.ticket.description);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save requester changes.'));
      if (err instanceof ApiClientError && err.code === 'WORKFLOW_STALE_STATE') setStale(true);
    } finally {
      busy.current = false; setSaving(false);
    }
  }

  async function createFollowUp() {
    if (busy.current || uncertain) return;
    busy.current = true;
    setCreatingFollowUp(true); setError(null); setSuccess(null);
    try {
      const response = await apiClient.createFollowUpTicket(ticketId);
      router.push(`/projects/${projectId}/tickets/${response.ticket.id}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create a follow-up SWR.'));
      setCreatingFollowUp(false);
    } finally { busy.current = false; }
  }

  async function cancelRequest() {
    if (busy.current || uncertain) return;
    if (!window.confirm('Cancel this SWR? This action is permanent.')) return;
    busy.current = true;
    setCanceling(true); setError(null); setSuccess(null);
    try {
      await apiClient.requesterCancel(ticketId);
      await loadAll(true);
      setSuccess('SWR canceled.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to cancel this SWR.'));
    } finally {
      busy.current = false; setCanceling(false);
    }
  }

  async function deleteCurrentDraft() {
    if (!ticket || busy.current || stale || saveAttempt.current.pending || submitAttempt.current.pending) return;
    busy.current = true; setDeleting(true); setError(null);
    try {
      await deleteAttempt.current.run({ expectedVersion:ticket.rowVersion ?? 0 }, (input,key) => apiClient.deleteDraft(ticketId,input.expectedVersion,key));
      router.push(`/projects/${projectId}/drafts`);
    } catch (err) {
      setError(getErrorMessage(err,'Unable to confirm deletion. Retry the same action.'));
      if (err instanceof ApiClientError && err.code === 'WORKFLOW_STALE_STATE') setStale(true);
    } finally { busy.current = false; setDeleting(false); }
  }

  return (
    <div className="stack">
      <Card title="Request Details" description="Review the saved request, files and history.">
        <div className="stack">
          {error ? <ErrorBanner message={error} /> : null}
          {success ? <SuccessBanner message={success} /> : null}
          {loading ? <p className="muted">Loading ticket details...</p> : null}
          {ticket ? <TicketDetails ticket={ticket} /> : null}
          <div className="row">
            <Link href={`/projects/${projectId}/my-requests`} className="app-link">Back to My Requests</Link>
            <Link href={`/projects/${projectId}/drafts`} className="app-link">Back to Drafts</Link>
            <Button variant="secondary" disabled={working || uncertain} onClick={() => { void loadAll(); void apiClient.listAorTree(projectId).then(setAreaTree).catch(err => setError(getErrorMessage(err,'Unable to reload Areas.'))); }}>
              Refresh
            </Button>
          </div>
          {capabilities.canSubmit ? (
            <Button disabled={working || dirty || stale || Boolean(saveAttempt.current.pending || deleteAttempt.current.pending)} onClick={() => void submitDraft()}>
              {submittingDraft ? 'Submitting...' : ticket?.status === 'DRAFT' ? 'Submit Draft' : 'Resubmit for Approval'}
            </Button>
          ) : null}
          {dirty ? <p role="status" className="muted">Unsaved changes. Save them before submitting; submission uses the saved record.</p> : null}
          {stale ? <ErrorBanner message="The saved request changed. Your entered fields are retained; use Refresh to deliberately reload before editing." /> : null}
          {uncertain ? <p role="status" className="muted">The last action is unconfirmed. Retry that action before editing or refreshing.</p> : null}
          {ticket?.status === 'DRAFT' && capabilities.canEditRequesterFields ? <Button variant="secondary" disabled={working || stale || Boolean(saveAttempt.current.pending || submitAttempt.current.pending)} onClick={() => void deleteCurrentDraft()}>{deleting ? 'Deleting…' : deleteAttempt.current.pending ? 'Retry Delete Draft' : 'Delete Draft'}</Button> : null}
          {capabilities.canRequesterCancel ? (
            <Button variant="secondary" disabled={working || uncertain || stale} onClick={() => void cancelRequest()}>
              {canceling ? 'Canceling…' : 'Cancel SWR'}
            </Button>
          ) : null}
          {capabilities.canCreateFollowUp ? (
            <Button disabled={working || uncertain} onClick={() => void createFollowUp()}>
              {creatingFollowUp ? 'Creating Follow-Up…' : 'Create Follow-Up SWR'}
            </Button>
          ) : null}
        </div>
      </Card>

      {capabilities.canEditRequesterFields ? (
        <Card title="Requester Changes" description="Only the original requester can edit a draft or returned SWR.">
          <fieldset className="stack" disabled={working || uncertain || stale} style={{ border:0, padding:0, margin:0, minWidth:0 }}>
            <Field label="Area">{areaTree ? <AorNodePicker label="Area" {...areaTree} value={editArea} onChange={setEditArea} /> : <p className="muted">Areas are unavailable. Refresh to retry.</p>}</Field>
            {areaTree && editArea && !areaTree.nodes.some(node => node.id === editArea) ? <p className="muted">The saved Area is no longer available. Choose a current Area before saving corrections.</p> : null}
            <Field label="Request Type"><Select value={editType} onChange={event => setEditType(event.target.value as TicketType | '')}><option value="">Select a request type</option>{(['LAYOUT','CHECK_OUT','AS_BUILT','TOPO','PERMIT'] as const).map(type => <option key={type} value={type}>{type}</option>)}</Select></Field>
            <Field label="Craft / Discipline (optional)"><Input value={editCraft} onChange={(event) => setEditCraft(event.target.value)} /></Field>
            <Field label="Point of Contact"><Input value={editFieldContact} onChange={(event) => setEditFieldContact(event.target.value)} /></Field>
            <Field label="Phone / Radio Channel (optional)"><Input value={editFieldChannel} onChange={(event) => setEditFieldChannel(event.target.value)} /></Field>
            <Field label="Need-By Date"><Input type="date" value={editRequestedDate} onChange={(event) => setEditRequestedDate(event.target.value)} /></Field>
            <Field label="Request Details"><Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></Field>
            <Field label="Urgent Reason (required only when inside project lead time)"><Textarea value={urgentReason} onChange={(event) => setUrgentReason(event.target.value)} /></Field>
          </fieldset>
          <Button disabled={working || stale || Boolean(submitAttempt.current.pending || deleteAttempt.current.pending)} onClick={() => void saveCorrection()}>{saving ? 'Saving…' : saveAttempt.current.pending ? 'Retry Save' : ticket?.status === 'DRAFT' ? 'Save Draft' : 'Save Changes'}</Button>
        </Card>
      ) : null}

      <Card title="Attachments" description="Saved files stay with the request. Uploads are available only when your role and the request state permit them.">
        <div className="stack">
          {ticket ? (
            <p className="muted">Current Status: {TICKET_STATUS_LABELS[ticket.status]}</p>
          ) : null}
          {canUpload ? (
            <AttachmentUploader
              disabled={working || uncertain || stale}
              instructionMode={capabilities.canUploadRequestInstruction}
              onUpload={async (payload) => {
                if (busy.current) throw new Error('Another action is in progress. Wait, then retry.');
                busy.current = true; setUploadingFile(true);
                setError(null);
                setSuccess(null);
                try {
                  const uploaded = await apiClient.uploadAttachment(ticketId, payload);
                  setAttachments(items => [...items.filter(item => item.id !== uploaded.attachment.id), uploaded.attachment]);
                  setHistoryRevision((revision) => revision + 1);
                  setSuccess('Attachment uploaded.');
                } finally { busy.current = false; setUploadingFile(false); }
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
