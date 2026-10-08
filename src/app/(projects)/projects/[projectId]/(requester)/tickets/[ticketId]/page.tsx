'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import {FrozenCommand} from '@/lib/frozen-command';
import {createIdempotencyKey} from '@/lib/apiClient';
import {useTicketWorkflowReview} from '@/components/tickets/ticket-workflow-review';
import { useUnsavedProgress } from '@/lib/use-unsaved-progress';
import type { AorNodeRecord, AorLevelRecord, AttachmentRecord, TicketCapabilities, TicketRecord, TicketType, UpdateRequesterTicketRequest } from '@/lib/contracts';
import { AttachmentList, AttachmentUploader, TicketDetails, TicketHistory } from '@/components/tickets';
import { Button, Card, ErrorBanner, Input, Select, SuccessBanner, Textarea } from '@/components/ui';
import { Field } from '@/components/forms';
import { AorNodePicker } from '@/components/aor';
import { TICKET_STATUS_LABELS } from '@/lib/contracts';
import { Icon } from '@/components/ui/icon';
import {AdministrationDialog} from '@/components/ui/administration-dialog';
import { ticketTypeLabel } from '@/lib/display-labels';
import { buildAreaNames } from '@/lib/use-area-names';
import { useProjectWorkspace } from '@/components/ui/project-shell-header';

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
  const role = useProjectWorkspace()?.capabilities.operationalRole;

  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [capabilities, setCapabilities] = useState<TicketCapabilities>(NO_CAPABILITIES);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const detailRead = useRef(0);
  const saveAttempt = useRef(new FrozenCommand<{ticketId:string;input:UpdateRequesterTicketRequest}>());
  const submitAttempt = useRef(new FrozenCommand<{ticketId:string; expectedVersion: number; urgentReason: string }>());
  const deleteAttempt = useRef(new FrozenCommand<{ticketId:string; expectedVersion: number }>());
  const [deleting, setDeleting] = useState(false);
  const [deleteReview,setDeleteReview]=useState<TicketRecord|null>(null),[deleteConsent,setDeleteConsent]=useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const workflow=useTicketWorkflowReview(()=>void loadAll(true),(response,action)=>{
    if(action==='follow-up')router.push(`/projects/${projectId}/tickets/${response.ticket.id}`);
    else {void loadAll(true);setSuccess('Request cancelled. Its reference, files and history are retained.');}
  });
  const uncertain = [saveAttempt.current,submitAttempt.current,deleteAttempt.current].some(attempt=>!!attempt.command&&!attempt.stale);
  const working = saving || submittingDraft || deleting || uploadingFile || workflow.active || Boolean(deleteReview);
  const dirty = Boolean(ticket && (editArea !== (ticket.aorNodeId ?? '') || editType !== (ticket.ticketType ?? '') ||
    editCraft !== ticket.craft || editFieldContact !== (ticket.fieldContact ?? '') || editFieldChannel !== (ticket.fieldChannel ?? '') ||
    editDescription !== ticket.description || editRequestedDate !== (ticket.requestedDate?.slice(0,10) ?? '')));

  const canUpload = capabilities.canUploadRequestInstruction || capabilities.canUploadFieldSupport;
  useUnsavedProgress(dirty || uncertain);

  async function loadAll(discard = false) {
    if (!discard && (busy.current || uncertain || workflow.active)) return;
    if (!discard && dirty && !window.confirm('Discard your unsaved field changes and reload the saved request?')) return;
    const currentRead = ++detailRead.current;
    setLoading(true);
    setError(null);
    setTicket(null);
    setAttachments([]);
    setCapabilities(NO_CAPABILITIES);
    try {
      const [ticketResponse, attachmentsResponse] = await Promise.all([
        apiClient.getTicket(ticketId),
        apiClient.listAttachments(ticketId),
      ]);
      if (currentRead !== detailRead.current) return false;
      if (ticketResponse.ticket.projectId !== projectId) throw new Error('This request belongs to a different project. Open it from that project’s request list.');
      setTicket(ticketResponse.ticket);
      setCapabilities(ticketResponse.capabilities ?? NO_CAPABILITIES);
      setEditCraft(ticketResponse.ticket.craft);
      setEditFieldContact(ticketResponse.ticket.fieldContact ?? '');
      setEditFieldChannel(ticketResponse.ticket.fieldChannel ?? '');
      setEditDescription(ticketResponse.ticket.description);
      setEditRequestedDate(ticketResponse.ticket.requestedDate?.slice(0, 10) ?? '');
      setEditArea(ticketResponse.ticket.aorNodeId ?? ''); setEditType(ticketResponse.ticket.ticketType ?? '');
      saveAttempt.current.reload();submitAttempt.current.reload();deleteAttempt.current.reload();workflow.owner.release('requester-fields');
      setStale(false);
      setAttachments(attachmentsResponse.attachments);
      setHistoryRevision((revision) => revision + 1);
      return true;
    } catch (err) {
      if (currentRead !== detailRead.current) return false;
      setError(getErrorMessage(err, 'Unable to load ticket details.'));
      return false;
    } finally {
      if (currentRead === detailRead.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll(true);
    void apiClient.listAorTree(projectId).then(setAreaTree).catch(err => setError(getErrorMessage(err, 'Unable to load Areas. Retry Refresh.')));
    return () => { detailRead.current += 1; };
  }, [projectId, ticketId]);

  async function submitDraft() {
    if (!ticket || busy.current || dirty || stale || saveAttempt.current.command || deleteAttempt.current.command) return;
    if(!workflow.owner.claim('requester-fields'))return;
    busy.current = true;
    setError(null);
    setSuccess(null);
    setSubmittingDraft(true);
    try {
      const command=submitAttempt.current.begin({ticketId,expectedVersion:ticket.rowVersion??0,urgentReason:urgentReason.trim()},createIdempotencyKey());
      if(!command)return;
      await apiClient.submitTicket(command.body.ticketId,undefined,command.body.urgentReason||undefined,command.body.expectedVersion,command.key);
      submitAttempt.current.success();
      await loadAll(true);
      setSuccess('Request submitted for approval.');
    } catch (err) {
      submitAttempt.current.fail(err instanceof ApiClientError?err.status:undefined);
      setError(getErrorMessage(err, 'Unable to submit draft.'));
      if (err instanceof ApiClientError && err.status === 409) setStale(true);
    } finally {
      busy.current = false;if(!submitAttempt.current.locked)workflow.owner.release('requester-fields');setSubmittingDraft(false);
    }
  }

  async function saveCorrection() {
    if (!ticket || busy.current || stale || submitAttempt.current.command || deleteAttempt.current.command) return;
    if(!workflow.owner.claim('requester-fields'))return;
    busy.current = true;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const command = saveAttempt.current.begin({ticketId,input:{
        aorNodeId: editArea || null, ticketType: editType || null, expectedVersion: ticket.rowVersion ?? 0,
        craft: editCraft, fieldContact: editFieldContact, fieldChannel: editFieldChannel,
        description: editDescription, requestedDate: editRequestedDate || null,
      }},createIdempotencyKey());
      if(!command)return;
      const response=await apiClient.updateRequesterTicket(command.body.ticketId,command.body.input,command.key);saveAttempt.current.success();
      setTicket(response.ticket);
      setHistoryRevision((revision) => revision + 1);
      setSuccess('Requester fields saved. Review attachments, then submit for fresh approval.');
      setEditCraft(response.ticket.craft); setEditFieldContact(response.ticket.fieldContact ?? '');
      setEditFieldChannel(response.ticket.fieldChannel ?? ''); setEditDescription(response.ticket.description);
    } catch (err) {
      saveAttempt.current.fail(err instanceof ApiClientError?err.status:undefined);
      setError(getErrorMessage(err, 'Unable to save requester changes.'));
      if (err instanceof ApiClientError && err.status === 409) setStale(true);
    } finally {
      busy.current = false;if(!saveAttempt.current.locked)workflow.owner.release('requester-fields');setSaving(false);
    }
  }

  function reviewRequesterAction(action:'follow-up'|'requester-cancel') {
    if(ticket&&!busy.current&&!uncertain&&!stale&&!dirty)workflow.open(ticket,action);
  }

  async function deleteCurrentDraft() {
    if (!deleteReview || !deleteConsent || busy.current || stale || saveAttempt.current.command || submitAttempt.current.command) return;
    if(!workflow.owner.claim('requester-fields'))return;
    busy.current = true; setDeleting(true); setError(null);
    try {
      const command=deleteAttempt.current.begin({ticketId:deleteReview.id,expectedVersion:deleteReview.rowVersion??0},createIdempotencyKey());if(!command)return;
      await apiClient.deleteDraft(command.body.ticketId,command.body.expectedVersion,command.key);deleteAttempt.current.success();
      router.push(`/projects/${projectId}/drafts`);
    } catch (err) {
      deleteAttempt.current.fail(err instanceof ApiClientError?err.status:undefined);
      setError(getErrorMessage(err,'Unable to confirm deletion. Retry the same action.'));
      if (err instanceof ApiClientError && err.status === 409) setStale(true);
    } finally { busy.current = false;if(!deleteAttempt.current.locked)workflow.owner.release('requester-fields');setDeleting(false); }
  }

  const areaPath = ticket?.aorNodeId && areaTree ? buildAreaNames(areaTree.nodes).get(ticket.aorNodeId)?.path : undefined;
  const fromDraft = ticket?.status === 'DRAFT';
  const requester = role === 'REQUESTER';
  const fieldRole = role === 'PARTY_CHIEF' || role === 'INSTRUMENT_MAN';
  const reviewRole = role && !requester && !fieldRole && role !== 'PROJECT_ADMIN';
  const returnPath = requester ? fromDraft ? 'drafts' : 'my-requests' : fieldRole ? 'crew/work' : reviewRole ? 'requests' : 'home';
  const returnLabel = requester ? fromDraft ? 'Back to Drafts' : 'Back to My Requests' : fieldRole ? 'Back to Crew Work' : reviewRole ? 'Back to All Requests' : 'Back to Home';
  const noActions = !capabilities.canSubmit && !capabilities.canCreateFollowUp && !capabilities.canRequesterCancel &&
    !(ticket?.status === 'DRAFT' && capabilities.canEditRequesterFields);

  return (
    <div className="stack">
      {workflow.dialog}
      <div className="toolbar">
        <Link href={`/projects/${projectId}/${returnPath}`} className="back-link"><Icon name="back" />{returnLabel}</Link>
        <div className="toolbar-group">
          {requester && <Link href={`/projects/${projectId}/${fromDraft ? 'my-requests' : 'drafts'}`} className="text-link">{fromDraft ? 'My Requests' : 'Drafts'}</Link>}
          <Button variant="secondary" disabled={working || uncertain} onClick={() => { void loadAll(); void apiClient.listAorTree(projectId).then(setAreaTree).catch(err => setError(getErrorMessage(err,'Unable to reload Areas.'))); }}>
            <Icon name="refresh" />Refresh
          </Button>
        </div>
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}
      {deleteReview?<AdministrationDialog title="Delete Draft" locked={deleteAttempt.current.locked||deleting||loading} onDismiss={()=>{workflow.owner.release('requester-fields');setDeleteReview(null);setDeleteConsent(false);}}>
        <form className="stack" onSubmit={event=>{event.preventDefault();void deleteCurrentDraft();}}>
          <p><strong>Saved Draft</strong> · {deleteReview.id}</p>
          <p>{deleteReview.description||'No request details entered.'}</p>
          <p>Remove this saved draft from your working list. Its record, files and history are retained for the existing 30-day Project Admin recovery period. No request number has been assigned.</p>
          <p>You return to Drafts. Any unsaved field changes will be discarded.</p>
          <label className="tm-check"><input type="checkbox" checked={deleteConsent} disabled={deleteAttempt.current.locked||deleting||loading} onChange={event=>setDeleteConsent(event.target.checked)}/><span>I confirm deletion of this saved draft.</span></label>
          {error?<ErrorBanner message={error}/>:null}
          {deleteAttempt.current.command&&!deleteAttempt.current.stale&&!deleting?<p role="status">The result is uncertain. Retry unchanged deletion to recover its recorded result.</p>:null}
          {stale?<p role="status">The saved draft or your access changed. Reload it before reviewing deletion again.</p>:null}
          <div className="row"><Button type="submit" variant="danger" disabled={!deleteConsent||stale||deleting||loading}>{deleting?'Deleting…':deleteAttempt.current.command?'Retry Delete Draft':'Confirm Draft Deletion'}</Button>
          {stale?<Button type="button" variant="secondary" disabled={loading} onClick={()=>void loadAll(true).then(ok=>{if(ok){setDeleteReview(null);setDeleteConsent(false);}})}>Reload Request</Button>:<Button type="button" variant="secondary" disabled={deleteAttempt.current.locked||deleting||loading} onClick={()=>{workflow.owner.release('requester-fields');setDeleteReview(null);setDeleteConsent(false);}}>Keep Draft</Button>}</div>
        </form>
      </AdministrationDialog>:null}
      {stale ? <ErrorBanner message="The saved request changed. Your entered fields are retained; use Refresh to deliberately reload before editing." /> : null}
      {uncertain ? <p role="status" className="notice">The last action is unconfirmed. Retry that action before editing or refreshing.</p> : null}

      <div className="detail-layout">
        <div className="stack detail-main">
          <Card title="Request Details" description="Review the saved request, files and history.">
            {loading ? <p className="muted" role="status">Loading ticket details…</p> : null}
            {ticket ? <TicketDetails ticket={ticket} areaPath={areaPath} /> : null}
          </Card>

          {capabilities.canEditRequesterFields ? (
            <Card title="Requester Changes" description="Only the original requester can edit a draft or returned SWR.">
              <fieldset className="stack form-narrow" disabled={working || uncertain || stale} style={{ border:0, padding:0, margin:0, minWidth:0 }}>
                <Field label="Area">{areaTree ? <AorNodePicker label="Area" {...areaTree} value={editArea} onChange={setEditArea} /> : <p className="muted">Areas are unavailable. Refresh to retry.</p>}</Field>
                {areaTree && editArea && !areaTree.nodes.some(node => node.id === editArea) ? <p className="muted">The saved Area is no longer available. Choose a current Area before saving corrections.</p> : null}
                <Field label="Request Type"><Select value={editType} onChange={event => setEditType(event.target.value as TicketType | '')}><option value="">Select a request type</option>{(['LAYOUT','CHECK_OUT','AS_BUILT','TOPO','PERMIT'] as const).map(type => <option key={type} value={type}>{ticketTypeLabel(type)}</option>)}</Select></Field>
                <Field label="Craft / Discipline (optional)"><Input value={editCraft} onChange={(event) => setEditCraft(event.target.value)} /></Field>
                <Field label="Point of Contact"><Input value={editFieldContact} onChange={(event) => setEditFieldContact(event.target.value)} /></Field>
                <Field label="Phone / Radio Channel (optional)"><Input value={editFieldChannel} onChange={(event) => setEditFieldChannel(event.target.value)} /></Field>
                <Field label="Need-By Date"><Input type="date" value={editRequestedDate} onChange={(event) => setEditRequestedDate(event.target.value)} /></Field>
                <Field label="Request Details"><Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></Field>
                <Field label="Urgent Reason (required only when inside project lead time)"><Textarea value={urgentReason} onChange={(event) => setUrgentReason(event.target.value)} /></Field>
              </fieldset>
              <Button disabled={working || stale || Boolean(submitAttempt.current.command || deleteAttempt.current.command)} onClick={() => void saveCorrection()}>{saving ? 'Saving…' : saveAttempt.current.command ? 'Retry Save' : ticket?.status === 'DRAFT' ? 'Save Draft' : 'Save Changes'}</Button>
            </Card>
          ) : null}

          {ticket ? <Card title="Attachments" description="Saved files stay with the request. Uploads are available only when your role and the request state permit them.">
            <div className="stack">
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
                <p className="muted">
                  {ticket ? `Current status: ${TICKET_STATUS_LABELS[ticket.status]}. ` : ''}You can view and download attachments on this SWR. No upload action is available in your current role or state.
                </p>
              )}
              <AttachmentList attachments={attachments} />
            </div>
          </Card> : null}

          {ticket ? (
            <Card title="SWR History" description="Chronological record of review, assignment, files, messages, and field progress.">
              <TicketHistory ticketId={ticket.id} refreshRevision={historyRevision} />
            </Card>
          ) : null}
        </div>

        <aside className="detail-aside" aria-label="Request actions">
          <Card title="Actions">
            <div className="action-panel">
              {capabilities.canSubmit ? (
                <Button disabled={working || dirty || stale || Boolean(saveAttempt.current.command || deleteAttempt.current.command)} onClick={() => void submitDraft()}>
                  {submittingDraft ? 'Submitting...' : ticket?.status === 'DRAFT' ? 'Submit Draft' : 'Resubmit for Approval'}
                </Button>
              ) : null}
              {dirty ? <p role="status" className="muted">Unsaved changes. Save or deliberately reload them before submitting or reviewing another request action.</p> : null}
              {capabilities.canCreateFollowUp ? (
                <Button disabled={working || uncertain || stale || dirty} onClick={() => reviewRequesterAction('follow-up')}>
                  Create Follow-Up Request
                </Button>
              ) : null}
              {ticket?.status === 'DRAFT' && capabilities.canEditRequesterFields ? <Button variant="secondary" disabled={working || stale || Boolean(saveAttempt.current.command || submitAttempt.current.command)} onClick={() => {if(ticket&&!uncertain&&workflow.owner.claim('requester-fields')){setDeleteConsent(false);setDeleteReview(ticket);}}}>Delete Draft</Button> : null}
              {capabilities.canRequesterCancel ? (
                <Button variant="secondary" disabled={working || uncertain || stale || dirty} onClick={() => reviewRequesterAction('requester-cancel')}>
                  Cancel My Request
                </Button>
              ) : null}
              {noActions ? <p className="muted">{loading ? 'Loading available actions…' : 'No actions are available to you for this request right now.'}</p> : null}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
