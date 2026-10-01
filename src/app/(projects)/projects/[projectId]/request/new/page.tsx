'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { RetryableMutation } from '@/lib/retryable-mutation';
import { formatCalendarDate } from '@/lib/calendar-date';
import { useUnsavedProgress } from '@/lib/use-unsaved-progress';
import { doesRequestedDateMeetLeadTime } from '@/modules/ticket/domain/lead-time-policy';
import type { AttachmentRecord, ProjectRequestConfig, TicketRecord, TicketType, UpdateRequesterTicketRequest, UploadAttachmentRequest } from '@/lib/contracts';
import { AorNodePicker } from '@/components/aor';
import { Field, Stepper } from '@/components/forms';
import { AttachmentUploader } from '@/components/tickets';
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Select,
  SuccessBanner,
  Textarea,
} from '@/components/ui';

const STEP_TITLES = ['Area', 'Type', 'Need-By', 'Details', 'Attachments', 'Review'];
const TICKET_TYPES: TicketType[] = ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'];
const CRAFT_OPTIONS = ['', 'Civil', 'Structural', 'Mechanical', 'Electrical', 'Instrumentation', 'Survey', 'Other'];

export default function NewRequestPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const [activeStep, setActiveStep] = useState(0);
  const [aorNodeId, setAorNodeId] = useState('');
  const [ticketType, setTicketType] = useState<TicketType | ''>('');
  const [requestConfig, setRequestConfig] = useState<ProjectRequestConfig>({
    leadTimeEnforcementEnabled: true,
    leadTimeDays: 2,
    maxAttachmentsPerTicket: null,
  });
  const [requestedDate, setRequestedDate] = useState('');
  const [urgentReason, setUrgentReason] = useState('');
  const [craft, setCraft] = useState(CRAFT_OPTIONS[0] ?? '');
  const [customCraft, setCustomCraft] = useState('');
  const [fieldContact, setFieldContact] = useState('');
  const [fieldChannel, setFieldChannel] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<UploadAttachmentRequest[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<AttachmentRecord[]>([]);
  const [aorLevels, setAorLevels] = useState<Array<{ id: string; depth: number; label: string }>>([]);
  const [aorNodes, setAorNodes] = useState<
    Array<{ id: string; levelId: string; parentId: string | null; name: string; code: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingAor, setLoadingAor] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<TicketRecord | null>(null);
  const draftRef = useRef<TicketRecord | null>(null);
  const busy = useRef(false);
  const saveAttempt = useRef(new RetryableMutation<UpdateRequesterTicketRequest>());
  const submitAttempt = useRef(new RetryableMutation<{ expectedVersion: number; urgentReason: string }>());
  const [stale, setStale] = useState(false);
  const [setupRevision, setSetupRevision] = useState(0);
  const locked = submitting || stale || Boolean(saveAttempt.current.pending || submitAttempt.current.pending);

  const needsUrgentReason = Boolean(requestedDate) && !doesRequestedDateMeetLeadTime(
    new Date(`${requestedDate}T00:00:00Z`), new Date(), {
      enforcementEnabled:requestConfig.leadTimeEnforcementEnabled, leadTimeDays:requestConfig.leadTimeDays,
    });

  const resolvedCraft = useMemo(
    () => (craft === 'Other' ? customCraft.trim() : craft.trim()),
    [craft, customCraft],
  );

  useUnsavedProgress(Boolean(attachments.length || saveAttempt.current.pending || submitAttempt.current.pending ||
    aorNodeId !== (draft?.aorNodeId ?? '') || ticketType !== (draft?.ticketType ?? '') ||
    requestedDate !== (draft?.requestedDate?.slice(0,10) ?? '') || resolvedCraft !== (draft?.craft ?? '') ||
    fieldContact.trim() !== (draft?.fieldContact ?? '') || fieldChannel.trim() !== (draft?.fieldChannel ?? '') ||
    description.trim() !== (draft?.description ?? '')));

  useEffect(() => {
    let active = true;
    async function loadSetupData() {
      setLoadingAor(true);
      setLoadingConfig(true);
      setError(null);
      try {
        const resumeId = new URLSearchParams(window.location.search).get('draft');
        const [aorResponse, configResponse, resumed, savedFiles] = await Promise.all([
          apiClient.listAorTree(projectId),
          apiClient.getProjectRequestConfig(projectId),
          resumeId ? apiClient.getTicket(resumeId) : Promise.resolve(null),
          resumeId ? apiClient.listAttachments(resumeId) : Promise.resolve(null),
        ]);
        if (!active) return;
        setAorLevels(aorResponse.levels);
        setAorNodes(aorResponse.nodes);
        setRequestConfig(configResponse.config);
        if (resumed) {
          if (resumed.ticket.projectId !== projectId || resumed.ticket.status !== 'DRAFT' || !resumed.capabilities?.canEditRequesterFields) throw new Error('This draft cannot be edited here. Open it from Drafts.');
          const saved = resumed.ticket; draftRef.current = saved; setDraft(saved);
          setSavedAttachments(savedFiles?.attachments ?? []);
          setAorNodeId(saved.aorNodeId ?? ''); setTicketType(saved.ticketType ?? '');
          setRequestedDate(saved.requestedDate?.slice(0,10) ?? '');
          setFieldContact(saved.fieldContact ?? ''); setFieldChannel(saved.fieldChannel ?? '');
          setDescription(saved.description); setCraft(saved.craft && !CRAFT_OPTIONS.includes(saved.craft) ? 'Other' : saved.craft);
          setCustomCraft(saved.craft); setSuccess('Saved draft loaded. Previously uploaded files are available in draft details.');
        }
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, 'Unable to load request setup data.'));
      } finally {
        if (active) {
          setLoadingAor(false);
          setLoadingConfig(false);
        }
      }
    }

    void loadSetupData();
    return () => {
      active = false;
    };
  }, [projectId, setupRevision]);

  const stagedAttachmentsSummary = useMemo(
    () => attachments.map((item) => `${item.file.name} (${item.file.size} bytes)`),
    [attachments],
  );

  async function persistDraft(): Promise<TicketRecord> {
    const input: UpdateRequesterTicketRequest = { aorNodeId: aorNodeId || null, ticketType: ticketType || null,
      craft: resolvedCraft, fieldContact, fieldChannel, description, requestedDate: requestedDate || null,
      ...(draftRef.current ? { expectedVersion: draftRef.current.rowVersion ?? 0 } : {}) };
    const current = draftRef.current;
    const response = await saveAttempt.current.run(input, (payload, key) => current
      ? apiClient.updateRequesterTicket(current.id, payload, key) : apiClient.saveNewDraft(projectId, payload, key));
    draftRef.current = response.ticket; setDraft(response.ticket);
    router.replace(`/projects/${projectId}/request/new?draft=${response.ticket.id}`, { scroll: false });
    for (const attachment of attachments) {
      const uploaded = await apiClient.uploadAttachment(response.ticket.id, attachment);
      setSavedAttachments(items => [...items.filter(item => item.id !== uploaded.attachment.id), uploaded.attachment]);
      setAttachments(items => items.filter(item => item !== attachment));
    }
    return response.ticket;
  }

  async function saveOrSubmit(submit: boolean) {
    if (busy.current || stale) return;
    if (submit && !submitAttempt.current.pending && (
      !aorNodeId ||
      !ticketType ||
      !requestedDate ||
      !fieldContact.trim() ||
      !description.trim()
    )) {
      setError('Complete all required fields before submission.');
      return;
    }

    busy.current = true; setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const saved = submitAttempt.current.pending ? draftRef.current! : await persistDraft();
      if (submit) {
        const sent = await submitAttempt.current.run({ expectedVersion: saved.rowVersion ?? 0, urgentReason: urgentReason.trim() },
          (input, key) => apiClient.submitTicket(saved.id, undefined, input.urgentReason || undefined, input.expectedVersion, key));
        setSuccess(`Request ${sent.ticket.ticketNumber} submitted.`);
        router.push(`/projects/${projectId}/tickets/${saved.id}`);
      } else setSuccess('Draft and selected files saved. You can leave and resume from Drafts.');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'WORKFLOW_STALE_STATE') setStale(true);
      setError(getErrorMessage(err, 'Unable to confirm the action. Retry to check the same request; your fields and remaining files are retained.'));
    } finally {
      busy.current = false; setSubmitting(false);
    }
  }

  function renderStepBody() {
    switch (activeStep) {
      case 0:
        return (
          <div className="stack">
            {loadingAor ? <p className="muted">Loading project Areas...</p> : null}
            {aorNodes.length > 0 ? (
              <Field label="Area">
                <AorNodePicker label="Area" levels={aorLevels} nodes={aorNodes} value={aorNodeId} onChange={setAorNodeId} />
              </Field>
            ) : (
              <p className="muted">No Areas are available. You can save a partial draft; ask Project IT to configure Areas before submission.</p>
            )}
          </div>
        );
      case 1:
        return (
          <Field label="Request Type">
            <Select value={ticketType} onChange={(event) => setTicketType(event.target.value as TicketType)}>
              <option value="">Select a request type</option>
              {TICKET_TYPES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
        );
      case 2:
        return (
          <div className="stack">
            <Field label="Need-By Date">
              <Input
                type="date"
                value={requestedDate}
                onChange={(event) => setRequestedDate(event.target.value)}
              />
            </Field>
            <p className="muted">
              {loadingConfig
                ? 'Loading request date policy...'
                : requestConfig.leadTimeEnforcementEnabled
                  ? `Lead-time policy enabled: minimum ${requestConfig.leadTimeDays} day(s) ahead.`
                  : 'Lead-time policy disabled for this project.'}
            </p>
            {needsUrgentReason ? (
              <div className="stack"><Field label="Urgent Request Reason">
                <Textarea value={urgentReason} onChange={(event) => setUrgentReason(event.target.value)} required />
              </Field><p className="muted">The reason is recorded when you submit, not when you save a draft. Re-enter it if you resume later.</p></div>
            ) : null}
          </div>
        );
      case 3:
        return (
          <div className="stack">
            <Field label="Craft / Discipline (optional)">
              <Select value={craft} onChange={(event) => setCraft(event.target.value)}>
                {CRAFT_OPTIONS.map((value) => (
                  <option key={value || 'unspecified'} value={value}>{value || 'Not specified'}</option>
                ))}
              </Select>
            </Field>
            {craft === 'Other' ? (
              <Field label="Custom Craft / Discipline">
                <Input value={customCraft} onChange={(event) => setCustomCraft(event.target.value)} />
              </Field>
            ) : null}
            <Field label="Point of Contact">
              <Input value={fieldContact} onChange={(event) => setFieldContact(event.target.value)} />
            </Field>
            <Field label="Phone / Radio Channel (optional)">
              <Input value={fieldChannel} onChange={(event) => setFieldChannel(event.target.value)} />
            </Field>
            <Field label="Request Details">
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
        );
      case 4:
        return (
          <div className="stack">
            <p className="muted">Optional: stage request files now; files upload after the SWR draft is created.</p>
            {requestConfig.maxAttachmentsPerTicket !== null ? <p className="muted">Project limit: {requestConfig.maxAttachmentsPerTicket} files per request. {savedAttachments.length} saved · {attachments.length} staged.</p> : null}
            <AttachmentUploader
              instructionMode
              staging
              disabled={requestConfig.maxAttachmentsPerTicket !== null && savedAttachments.length + attachments.length >= requestConfig.maxAttachmentsPerTicket}
              onUpload={async (payload) => {
                setAttachments((current) => [...current, payload]);
              }}
            />
            {attachments.length > 0 ? (
              <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {stagedAttachmentsSummary.map((item, index) => (
                  <li key={`${item}-${index}`} className="muted">{item} — not yet saved{' '}
                    <Button variant="secondary" onClick={() => setAttachments(items => items.filter((_, i) => i !== index))}>Remove {attachments[index]?.file.name}</Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      default:
        return (
          <div className="stack">
            <p className="muted">Area: {aorNodes.find(node => node.id === aorNodeId)?.name ?? 'Not selected'}</p>
            <p className="muted">Type: {ticketType || 'Not selected'}</p>
            <p className="muted">Need-By: {formatCalendarDate(requestedDate)}</p>
            <p className="muted">Craft / Discipline: {resolvedCraft || 'Not specified'}</p>
            <p className="muted">Point of Contact: {fieldContact || '-'}</p>
            <p className="muted">Phone / Radio Channel: {fieldChannel || '-'}</p>
            <p className="muted">Description: {description || '-'}</p>
            <p className="muted">Files: {savedAttachments.length} saved · {attachments.length} staged, not yet uploaded</p>
          </div>
        );
    }
  }

  return (
    <Card
      title="New Request"
      description="Save your progress at any step. Complete the required details when you’re ready to submit."
    >
      <div className="stack">
        <Stepper steps={STEP_TITLES} activeStep={activeStep} />
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {draft ? <p className="muted">Saved draft · <Link className="app-link" href={`/projects/${projectId}/tickets/${draft.id}`}>Open saved details and files</Link></p> : null}
        {locked && !submitting ? <p role="status" className="muted">{stale ? 'Another change was saved. Open draft details and reload before editing.' : 'The last action is unconfirmed. Retry it before editing or leaving this page.'}</p> : null}
        <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{renderStepBody()}</fieldset>
        {error && !draft && !saveAttempt.current.pending ? <Button variant="secondary" onClick={() => setSetupRevision(value => value+1)}>Retry setup</Button> : null}
        <div className="row">
          <Button
            variant="secondary"
            disabled={activeStep === 0 || submitting}
            onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
          >
            Back
          </Button>
          {activeStep < STEP_TITLES.length - 1 ? (
            <Button
              disabled={locked}
              onClick={() => setActiveStep((current) => Math.min(STEP_TITLES.length - 1, current + 1))}
            >
              Next
            </Button>
          ) : (
            <Button disabled={submitting || stale || Boolean(saveAttempt.current.pending)} onClick={() => void saveOrSubmit(true)}>
              {submitting ? 'Submitting…' : submitAttempt.current.pending ? 'Retry Submit' : 'Submit Request'}
            </Button>
          )}
          <Button variant="secondary" disabled={submitting || stale || Boolean(submitAttempt.current.pending)} onClick={() => void saveOrSubmit(false)}>
            {submitting ? 'Saving…' : saveAttempt.current.pending ? 'Retry Save Draft' : 'Save Draft'}
          </Button>
          {submitAttempt.current.pending && activeStep < STEP_TITLES.length-1 ? <Button disabled={submitting} onClick={() => void saveOrSubmit(true)}>Retry Submit</Button> : null}
        </div>
      </div>
    </Card>
  );
}
