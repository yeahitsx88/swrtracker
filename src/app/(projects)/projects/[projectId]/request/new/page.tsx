'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { TicketType, UploadAttachmentRequest } from '@/lib/contracts';
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

const STEP_TITLES = ['AOR', 'Type', 'Date', 'Details', 'Attachments', 'Review'];
const TICKET_TYPES: TicketType[] = ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'];

function nextDateString(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

export default function NewRequestPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const [activeStep, setActiveStep] = useState(0);
  const [aorNodeId, setAorNodeId] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('LAYOUT');
  const [requestedDate, setRequestedDate] = useState(nextDateString(3));
  const [craft, setCraft] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<UploadAttachmentRequest[]>([]);
  const [aorLevels, setAorLevels] = useState<Array<{ id: string; depth: number; label: string }>>([]);
  const [aorNodes, setAorNodes] = useState<
    Array<{ id: string; levelId: string; parentId: string | null; name: string; code: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingAor, setLoadingAor] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadAor() {
      setLoadingAor(true);
      setError(null);
      try {
        const response = await apiClient.listAorTree(projectId);
        if (!active) return;
        setAorLevels(response.levels);
        setAorNodes(response.nodes);
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, 'Unable to load AOR tree. You can still enter node ID manually.'));
      } finally {
        if (active) setLoadingAor(false);
      }
    }

    void loadAor();
    return () => {
      active = false;
    };
  }, [projectId]);

  const stagedAttachmentsSummary = useMemo(
    () => attachments.map((item) => `${item.filename} (${item.sizeBytes} bytes)`),
    [attachments],
  );

  const isStepComplete = useMemo(() => {
    switch (activeStep) {
      case 0:
        return Boolean(aorNodeId.trim());
      case 1:
        return Boolean(ticketType);
      case 2:
        return Boolean(requestedDate);
      case 3:
        return Boolean(craft.trim() && description.trim());
      default:
        return true;
    }
  }, [activeStep, aorNodeId, craft, description, requestedDate, ticketType]);

  async function handleSubmit() {
    if (!aorNodeId || !ticketType || !requestedDate || !craft.trim() || !description.trim()) {
      setError('Complete all required fields before submission.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await apiClient.createTicket({
        projectId,
        aorNodeId: aorNodeId.trim(),
        ticketType,
        craft: craft.trim(),
        description: description.trim(),
        requestedDate: new Date(requestedDate).toISOString(),
      });

      const ticketId = created.ticket.id;
      for (const attachment of attachments) {
        await apiClient.uploadAttachment(ticketId, attachment);
      }

      const submitted = await apiClient.submitTicket(ticketId);
      setSuccess(`Ticket ${submitted.ticket.ticketNumber ?? submitted.ticket.id} submitted.`);
      router.push(`/projects/${projectId}/tickets/${ticketId}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to submit request.'));
    } finally {
      setSubmitting(false);
    }
  }

  function renderStepBody() {
    switch (activeStep) {
      case 0:
        return (
          <div className="stack">
            {loadingAor ? <p className="muted">Loading AOR tree...</p> : null}
            {aorNodes.length > 0 ? (
              <Field label="AOR Node">
                <AorNodePicker levels={aorLevels} nodes={aorNodes} value={aorNodeId} onChange={setAorNodeId} />
              </Field>
            ) : (
              <Field label="AOR Node ID">
                <Input value={aorNodeId} onChange={(event) => setAorNodeId(event.target.value)} />
              </Field>
            )}
          </div>
        );
      case 1:
        return (
          <Field label="Ticket Type">
            <Select value={ticketType} onChange={(event) => setTicketType(event.target.value as TicketType)}>
              {TICKET_TYPES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
        );
      case 2:
        return (
          <Field label="Requested Date">
            <Input type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)} />
          </Field>
        );
      case 3:
        return (
          <div className="stack">
            <Field label="Craft">
              <Input value={craft} onChange={(event) => setCraft(event.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
        );
      case 4:
        return (
          <div className="stack">
            <p className="muted">Optional: stage attachment metadata now; files upload after ticket draft is created.</p>
            <AttachmentUploader
              onUpload={async (payload) => {
                setAttachments((current) => [...current, payload]);
              }}
            />
            {attachments.length > 0 ? (
              <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {stagedAttachmentsSummary.map((item) => (
                  <li key={item} className="muted">{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      default:
        return (
          <div className="stack">
            <p className="muted">AOR Node: {aorNodeId || '-'}</p>
            <p className="muted">Type: {ticketType}</p>
            <p className="muted">Requested Date: {requestedDate}</p>
            <p className="muted">Craft: {craft || '-'}</p>
            <p className="muted">Description: {description || '-'}</p>
            <p className="muted">Attachments: {attachments.length}</p>
          </div>
        );
    }
  }

  return (
    <Card
      title="New Request"
      description="Mobile-first request submission flow. Workflow validation remains backend-enforced."
    >
      <div className="stack">
        <Stepper steps={STEP_TITLES} activeStep={activeStep} />
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {renderStepBody()}
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
              disabled={submitting || !isStepComplete}
              onClick={() => setActiveStep((current) => Math.min(STEP_TITLES.length - 1, current + 1))}
            >
              Next
            </Button>
          ) : (
            <Button disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
