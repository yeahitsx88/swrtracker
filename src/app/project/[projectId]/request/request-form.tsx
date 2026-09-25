'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { RequestOptions } from '@/modules/tenancy/application/request-options';
import { api, ApiError, errorMessage, jsonBody } from '@/app/ui/api';
import { localDateTime, type RequestDraft, type RequestTicket } from '@/app/ui/request-types';
import { Shell } from '@/app/ui/shell';
import { Attachments } from '@/app/ui/attachments';

const empty = { aorNodeId: '', departmentId: '', ticketType: '', craft: '', description: '', requestedDate: '' };

export function RequestForm({ projectId, draftId, tenantId }: {
  projectId: string; draftId?: string; tenantId?: string;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<RequestOptions | null>(null);
  const [fields, setFields] = useState(empty);
  const [savedLocationName, setSavedLocationName] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const savedId = useRef(draftId);
  const inFlight = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const returnPath = `/project/${projectId}/request${savedId.current ? `?draft=${savedId.current}` : ''}`;
  const loginLink = `/login?next=${encodeURIComponent(returnPath)}${tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ''}`;

  useEffect(() => {
    if (!busy && (error || message || submitted)) feedback.current?.focus();
  }, [busy, error, message, submitted]);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const draft = draftId
          ? (await api<{ ticket: RequestTicket }>(`/api/tickets/${draftId}`)).ticket : null;
        if (draft && draft.projectId !== projectId) {
          throw new Error('This request is not an editable draft for this project.');
        }
        if (!current) return;
        if (draft && draft.status !== 'DRAFT') { router.replace(`/tickets/${draft.id}`); return; }
        const data = await api<RequestOptions>(`/api/projects/${projectId}/request-options`);
        if (!current) return;
        setOptions(data);
        setSavedLocationName(draft?.locationName ?? null);
        setFields(draft ? {
          aorNodeId: draft.aorNodeId ?? '', departmentId: data.ownDepartmentId ?? draft.departmentId ?? '',
          ticketType: draft.ticketType ?? '', craft: draft.craft ?? '', description: draft.description ?? '',
          requestedDate: localDateTime(draft.requestedDate),
        } : { ...empty, departmentId: data.ownDepartmentId ?? '' });
      } catch (cause) {
        if (current) { setError(errorMessage(cause)); setAuthNeeded(cause instanceof ApiError && cause.status === 401); }
      } finally { if (current) setLoading(false); }
    }
    void load();
    return () => { current = false; };
  }, [projectId, draftId, router]);

  function edit(key: keyof typeof empty, value: string) {
    setFields(prior => ({ ...prior, [key]: value })); setMessage('');
  }

  async function save(submit: boolean) {
    if (inFlight.current || attachmentBusy) return;
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    let saved = false;
    try {
      const body = { action: 'save', projectId, ticketId: savedId.current,
        ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value || null])),
        requestedDate: fields.requestedDate ? new Date(fields.requestedDate).toISOString() : null };
      const result = await api<{ ticket: RequestDraft }>('/api/tickets/drafts', jsonBody(body));
      savedId.current = result.ticket.id; saved = true;
      const url = new URL(window.location.href);
      url.searchParams.set('draft', result.ticket.id);
      window.history.replaceState(null, '', url);
      if (submit) {
        const response = await api<{ ticket: RequestDraft }>(`/api/tickets/${result.ticket.id}/submit`, jsonBody({}));
        setSubmitted(response.ticket.ticketNumber);
        router.replace(`/tickets/${response.ticket.id}`);
      } else setMessage('Draft saved. You can find it in Drafts.');
    } catch (cause) {
      setError(errorMessage(cause)); setAuthNeeded(cause instanceof ApiError && cause.status === 401);
      if (saved && submit) setMessage('Your changes are saved as a draft. Resolve the issue below, then submit again.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void save(true); }
  const missingLocation = fields.aorNodeId && options && !options.aorNodes.some(node => node.id === fields.aorNodeId);
  return <Shell projectId={projectId} signedIn={Boolean(options)}><p className="eyebrow">{options?.project.name ?? 'Survey support'}</p>
    <h1>{submitted ? 'Request submitted' : draftId ? 'Continue your request' : 'New survey request'}</h1>
    {submitted ? <div className="panel" role="status" ref={feedback} tabIndex={-1}><span className="pill">Pending Review</span>
      <h2>{submitted}</h2><p>Your request has been sent to the survey team for review.</p>
      <div className="actions"><a className="button" href={`/project/${projectId}/request`}>Start another request</a>
        <Link href="/drafts">Open drafts</Link></div></div> : <>
      <p className="muted">Tell the survey team what you need and where. Save a draft whenever you need to step away.</p>
      {loading && <p role="status">Loading project…</p>}
      <div ref={feedback} tabIndex={-1}>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <div className="notice error" role="alert">{error}
        {authNeeded && <p><Link href={loginLink}>Sign in to continue</Link></p>}</div>}
      </div>
      {options && <form className="panel" onSubmit={submit}>
        <fieldset disabled={busy || attachmentBusy} style={{ border: 0, padding: 0, margin: 0 }}>
          <h2>Work details</h2>
          <label className="field">Work location<select required value={fields.aorNodeId} onChange={event => edit('aorNodeId', event.target.value)}>
            <option value="">Choose an area</option>
            {missingLocation && <option value={fields.aorNodeId}>{savedLocationName ?? 'Previously selected location'} (retired)</option>}
            {options.aorNodes.map(node => <option key={node.id} value={node.id}>{node.path} · {node.code}</option>)}
          </select></label>
          {missingLocation && <p className="notice warning">The selected area may have changed. Confirm the location before submitting, or select an active area.</p>}
          <div className="grid">
            <label className="field">Request type<select required value={fields.ticketType} onChange={event => edit('ticketType', event.target.value)}>
              <option value="">Choose a type</option><option value="LAYOUT">Field layout</option><option value="CHECK_OUT">Equipment check-out</option>
              <option value="AS_BUILT">As-built survey</option><option value="TOPO">Topographic survey</option><option value="PERMIT">Permit survey</option>
            </select></label>
            <label className="field">Department<select required disabled={Boolean(options.ownDepartmentId)} value={fields.departmentId} onChange={event => edit('departmentId', event.target.value)}>
              <option value="">Choose a department</option>{options.departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>{options.ownDepartmentId && <small>Set from your project membership.</small>}</label>
          </div>
          <label className="field" style={{ marginTop: 22 }}>Craft<input required value={fields.craft} maxLength={10000} onChange={event => edit('craft', event.target.value)} placeholder="e.g. Civil, piping, structural steel" /></label>
          <label className="field">Description<textarea required value={fields.description} maxLength={10000} onChange={event => edit('description', event.target.value)} placeholder="Describe the work, reference points, and any access instructions." /></label>
          <label className="field">Requested date and time<input required type="datetime-local" value={fields.requestedDate}
            onInput={event => edit('requestedDate', event.currentTarget.value)}
            onChange={event => edit('requestedDate', event.target.value)} />
            <small>Use your local time. Allow at least 48 hours from submission.</small></label>
          <div className="actions"><button type="submit">{busy ? 'Working…' : 'Submit request'}</button>
            <button type="button" className="secondary" onClick={() => void save(false)}>Save Draft</button><Link href="/drafts">My drafts</Link></div>
          <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>Changes are saved only when you choose Save Draft or Submit request.</p>
        </fieldset>
      </form>}
      {options && <Attachments ticketId={savedId.current} disabled={busy} onBusyChange={setAttachmentBusy} />}
    </>}
  </Shell>;
}
