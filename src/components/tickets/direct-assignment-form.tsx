'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiClient, apiRequest } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { TICKET_TYPE_LABELS } from '@/lib/display-labels';
import type { AorLevelRecord, AorNodeRecord, TicketResponse, TicketType } from '@/lib/contracts';
import type { DirectAssignmentOptions } from '@/modules/ticket/application/direct-assignment-options';
import { AorNodePicker } from '@/components/aor';
import { Button, Card, ErrorBanner } from '@/components/ui';
import { blockersFrom } from '@/components/ui/action-blockers';
import { Icon } from '@/components/ui/icon';

const TYPES = Object.keys(TICKET_TYPE_LABELS) as TicketType[];

/**
 * Survey creates field work on a requester's behalf and assigns the crew in one
 * step (skips review). The server re-checks role, Area authority, the requester
 * and crew eligibility.
 */
export function DirectAssignmentForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<DirectAssignmentOptions>();
  const [tree, setTree] = useState<{ levels: AorLevelRecord[]; nodes: AorNodeRecord[] }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ aorNodeId: '', ticketType: '' as TicketType | '', requesterId: '', departmentId: '', partyChiefId: '', instrumentManId: '',
    requestedDate: '', fieldContact: '', fieldChannel: '', craft: '', description: '' });
  const attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  const set = (key: keyof typeof form) => (value: string) => setForm(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<DirectAssignmentOptions>(`/api/projects/${projectId}/survey/direct-assignment`),
      apiClient.listAorTree(projectId),
    ]).then(([value, areas]) => { if (active) { setOptions(value); setTree(areas); } })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load assignment choices.')); });
    return () => { active = false; };
  }, [projectId]);

  const requester = options?.requesters.find(person => person.id === form.requesterId);
  const needsDepartment = !!requester && !requester.departmentId;
  const blockers = blockersFrom([
    [!form.aorNodeId, 'Choose the Area.', 'da-area'],
    [!form.ticketType, 'Choose a request type.', 'da-type'],
    [!form.requestedDate, 'Enter the Need-By date.', 'da-date'],
    [!form.description.trim(), 'Describe the work in Request details.', 'da-details'],
    [!form.fieldContact.trim(), 'Enter a point of contact.', 'da-contact'],
    [!form.requesterId, 'Choose the requester this work is for.', 'da-requester'],
    [needsDepartment && !form.departmentId, 'Choose a department for this requester.', 'da-department'],
    [!form.instrumentManId, 'Choose an Instrument Man.', 'da-instrument'],
  ]);
  const ready = blockers.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    const body = {
      projectId, workflowVariant: 'DIRECT_ASSIGNMENT', aorNodeId: form.aorNodeId, ticketType: form.ticketType,
      requesterId: form.requesterId, assignedInstrumentManId: form.instrumentManId,
      ...(form.partyChiefId ? { assignedPartyChiefId: form.partyChiefId } : {}),
      ...(needsDepartment ? { departmentId: form.departmentId } : {}),
      requestedDate: form.requestedDate, fieldContact: form.fieldContact.trim(), description: form.description.trim(),
      ...(form.fieldChannel.trim() ? { fieldChannel: form.fieldChannel.trim() } : {}), ...(form.craft.trim() ? { craft: form.craft.trim() } : {}),
    };
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized) attempt.current = { body: serialized, key: crypto.randomUUID() };
    setBusy(true); setError(undefined);
    try {
      const result = await apiRequest<TicketResponse>('/api/tickets', { method: 'POST', body, headers: { 'Idempotency-Key': attempt.current.key } });
      router.push(`/projects/${projectId}/tickets/${result.ticket.id}`);
    } catch (cause) { setError(getErrorMessage(cause, 'The work was not confirmed. Retry to send the same request.')); setBusy(false); }
  }

  return (
    <Card title="Assign work directly" description="Create field work for a requester and assign the crew in one step. Use this for work Survey already agreed; it skips the review queue."
      actions={<Link className="back-link" href={`/projects/${projectId}/survey/operations`}><Icon name="back" />Survey Operations</Link>}>
      {error ? <ErrorBanner message={error} /> : null}
      {!options && !error ? <p className="muted" role="status">Loading choices…</p> : null}
      {options && tree ? (
        <form className="stack form-narrow" onSubmit={submit}>
          <fieldset className="stack" disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <p className="section-label">The work</p>
            <label className="field" id="da-area"><span className="field-label">Area</span><AorNodePicker label="Area" {...tree} value={form.aorNodeId} onChange={set('aorNodeId')} /></label>
            <label className="field" id="da-type"><span className="field-label">Request type</span>
              <select className="select" value={form.ticketType} onChange={event => set('ticketType')(event.target.value)}><option value="">Select a request type</option>
                {TYPES.map(type => <option key={type} value={type}>{TICKET_TYPE_LABELS[type]}</option>)}</select></label>
            <label className="field" id="da-date"><span className="field-label">Need-By date</span><input className="input" type="date" value={form.requestedDate} onChange={event => set('requestedDate')(event.target.value)} /></label>
            <label className="field" id="da-details"><span className="field-label">Request details</span><textarea className="textarea" value={form.description} maxLength={4000} onChange={event => set('description')(event.target.value)} /></label>
            <div className="row">
              <label className="field" id="da-contact" style={{ flex: '1 1 14rem' }}><span className="field-label">Point of contact</span><input className="input" value={form.fieldContact} maxLength={200} onChange={event => set('fieldContact')(event.target.value)} /></label>
              <label className="field" style={{ flex: '1 1 10rem' }}><span className="field-label">Phone / radio (optional)</span><input className="input" value={form.fieldChannel} maxLength={100} onChange={event => set('fieldChannel')(event.target.value)} /></label>
            </div>
            <label className="field"><span className="field-label">Craft / discipline (optional)</span><input className="input" value={form.craft} maxLength={100} onChange={event => set('craft')(event.target.value)} /></label>

            <p className="section-label">Requested for</p>
            <label className="field" id="da-requester"><span className="field-label">Requester</span>
              <select className="select" value={form.requesterId} onChange={event => set('requesterId')(event.target.value)}><option value="">Choose the person this work is for</option>
                {options.requesters.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select>
              <span className="muted field-help">They see the request in their list and are notified like any other request.</span></label>
            {needsDepartment ? (
              <label className="field" id="da-department"><span className="field-label">Department</span>
                <select className="select" value={form.departmentId} onChange={event => set('departmentId')(event.target.value)}><option value="">Choose a department</option>
                  {options.departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                <span className="muted field-help">This requester has no department yet, so choose one for this request.</span></label>
            ) : null}

            <p className="section-label">Crew</p>
            <label className="field" id="da-instrument"><span className="field-label">Instrument Man</span>
              <select className="select" value={form.instrumentManId} onChange={event => set('instrumentManId')(event.target.value)}><option value="">Choose an Instrument Man</option>
                {options.instrumentMen.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="field"><span className="field-label">Party Chief (optional)</span>
              <select className="select" value={form.partyChiefId} onChange={event => set('partyChiefId')(event.target.value)}><option value="">No Party Chief</option>
                {options.partyChiefs.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          </fieldset>
          <div className="row"><Button type="submit" disabled={busy} blockers={blockers} blockedTitle="Can’t create and assign yet">{busy ? 'Assigning…' : 'Create and assign'}</Button>
            <Link className="button button-secondary" href={`/projects/${projectId}/survey/operations`}>Cancel</Link></div>
        </form>
      ) : null}
    </Card>
  );
}
